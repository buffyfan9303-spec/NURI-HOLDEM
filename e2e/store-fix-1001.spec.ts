// 내 매장 점검 1001 수정분 회귀 — PC 폭에서만 보이던 겹침·두 벌 칩·숨김 안내·남은 이용권 알림.
// 원천: 점검 보고 audit-store-1001.md S-04 · S-06 · S-10 · S-13 · S-15 (store-team, 2026-10-01).
// 음성 대조: 수정 전 빌드(c127db7f)에서 S-04(1024·1280)·S-13·S-10·S-06·S-15 가 전부 빨간불이었다(보고서 표).
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_DAY, MOCK_VENUE, MOCK_UID, MOCK_VENUE_NAME } from './_mockOwner';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const isSingle = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const get = (body: unknown[]) => (r: Route) => (r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(isSingle(r) ? (body[0] ?? null) : body)));
const TITLE = '수요 딥스택 1000만 GTD';
const SESSION = {
  venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, title: TITLE, buyin_amount: 100_000, card_amount: null,
  target_entries: 40, game_type: 'gtd', max_entries: 0, is_addon: false, addon_stack: 0, addon_amount: 0,
  operators: [], discounts: [], early_double_min: 0, early_single_min: 0, tournament_start: null,
  opened_by: null, opened_at: new Date().toISOString(), reg_closed: false, closed: false, schedule_id: 'p-1', voucher_issued: 0,
};
const BUYINS = Array.from({ length: 14 }, (_, i) => ({
  id: `bbbbbbbb-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1,
  player_name: `손님${i + 1}`, entry_no: 1, payment_method: 'cash', is_unpaid: false, is_split: false,
  cash_amount: 100_000, card_amount: 0, transfer_amount: 0, ticket_count: 0, unpaid_amount: 0, discount_index: 0, discount_level: 0,
  early_override: null, buyin_at: new Date().toISOString(), created_by: null, request_id: null, addon_method: null, addon_unpaid: false, addon_amount: 0,
}));
const PLAYERS = BUYINS.map((b, i) => ({ id: `ffffffff-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, name: b.player_name, visitor_type: 'regular', note: null, sort_order: i + 1 }));
const POSTER = { id: 'p-1', title: TITLE, venue_id: MOCK_VENUE, pub_name: MOCK_VENUE_NAME, region: '서울', date: MOCK_DAY, start_time: '19:00:00', approved: true,
  owner_id: MOCK_UID, buy_in: { amount: 100_000 }, guaranteed: false, display_order: 1, promotions: [], side_events: [], ranking_prizes: [], created_at: new Date().toISOString() };
const req = (i: number, over: Record<string, unknown> = {}) => ({ id: `req-${i}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, player_name: `요청${i}`,
  user_id: `00000000-0000-4000-8000-00000000040${i}`, note: null, status: 'pending', created_at: new Date().toISOString(), requested_game_seq: 1, voucher_id: null, ...over });

async function boot(page: Page, w: number, extra?: (p: Page) => Promise<unknown>, h = 760) {
  await bootOwner(page, {
    viewport: { width: w, height: h }, appSettings: { identity_voucher_enabled: 'on' },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
      await p.route(/\/rest\/v1\/ledger_sessions\?/, get([SESSION]));
      await p.route(/\/rest\/v1\/ledger_buyins\?/, get(BUYINS));
      await p.route(/\/rest\/v1\/ledger_players\?/, get(PLAYERS));
      await p.route(/\/rest\/v1\/schedules\?/, get([POSTER]));
      await extra?.(p);
    },
  });
  await openMyStore(page);
  await page.waitForTimeout(1500);
}
const go = async (page: Page, section: string, step?: string) => {
  await page.locator('[data-mystore-secbar] button:visible').filter({ hasText: new RegExp(`^\\s*${section}`) }).first().click();
  await page.waitForTimeout(800);
  if (step) { await page.locator('[data-mystore-rail] button:visible').filter({ hasText: new RegExp(step) }).first().click(); await page.waitForTimeout(1500); }
};

// S-04 — 1024·1280 에서 맨 아래로 내리면 '맨 위로' FAB(App.tsx)가 장부 '정산 마감' 버튼을 덮었다(1024: 21점 중 11점).
for (const w of [1024, 1280]) test(`S-04 ${w} — 맨 아래에서도 '정산 마감' 버튼이 FAB 에 안 가린다`, async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, w);
  await go(page, '게임 진행', '장부');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(900);
  // 전제: FAB 가 실제로 떠 있어야 '안 가린다' 가 의미 있다(안 뜨면 거짓 통과).
  await expect(page.locator('.scroll-top-fab')).toBeVisible();
  const r = await page.evaluate(() => {
    const b = document.querySelector('[data-testid=ledger-settle]') as HTMLElement | null; if (!b) return null;
    const rc = b.getBoundingClientRect(); let covered = 0;
    for (let i = 1; i <= 7; i++) for (let j = 1; j <= 3; j++) {
      const t = document.elementFromPoint(rc.left + (rc.width * i) / 8, rc.top + (rc.height * j) / 4);
      if (t && !(t === b || b.contains(t))) covered++;
    }
    return covered;
  });
  expect(r).toBe(0);
});

// S-13 — 대기 바인 요청 버튼(42.5px)이 -my-2 로 줄 밖으로 넘쳐 아래 링크를 8.5px, 옆 줄 버튼을 12.8px 덮었다.
test('S-13 1440 — 대기 바인 요청 3건: 승인·거절·링크 상자가 서로 겹치지 않는다(높이 40px 이상 유지)', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, 1440, (p) => p.route(/\/rest\/v1\/ledger_buyin_requests\?/, get([req(1), req(2), req(3)])), 900);
  const r = await page.evaluate(() => {
    const vis = (e: Element) => e.getBoundingClientRect().height > 0;
    const btns = [...document.querySelectorAll('button[aria-label="승인"], button[aria-label="거절"]')].filter(vis);
    const link = [...document.querySelectorAll('button')].filter(vis).find((b) => /장부에서 전체 관리/.test(b.textContent || ''));
    const items = [...btns, ...(link ? [link] : [])]; let ov = 0;
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i].getBoundingClientRect(), b = items[j].getBoundingClientRect();
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5) ov++;
    }
    return { n: btns.length, link: !!link, minH: Math.min(...btns.map((b) => b.getBoundingClientRect().height)), ov };
  });
  expect(r).toEqual({ n: 6, link: true, minH: expect.any(Number), ov: 0 });
  expect(r.minH).toBeGreaterThanOrEqual(40);
});

// S-10 — 같은 메인 대회가 '메인(기본) ✓' 와 제목 칩 두 개로 갈려 두 번 등재될 수 있었다.
test('S-10 — 순위 메인 게임은 칩 하나(제목) · 기존 저장분(\'\')에 ✓', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, 1440, async (p) => {
    // 저장본은 메인 기본 이름('')으로 1건 — 순위 화면 읽기는 RPC venue_rankings_public(fetchRankingsPublic)다.
    const saved = { id: 'r1', venue_id: MOCK_VENUE, ranking_date: MOCK_DAY, event_name: '', position: 1, rank: 1, nickname: '홍길동', real_name: '', prize: null };
    await p.route(/\/rest\/v1\/rpc\/venue_rankings_public/, (r) => r.fulfill(json([saved])));
    await p.route(/\/rest\/v1\/venue_rankings\?/, get([saved]));
  }, 900);
  await go(page, '게임 진행', '순위');
  const chips = await page.evaluate(() => {
    const head = [...document.querySelectorAll('p')].find((p) => /^메인 게임/.test((p.textContent || '').trim()) && (p as HTMLElement).offsetParent);
    return [...(head?.parentElement?.querySelectorAll('button') ?? [])].map((b) => (b.textContent || '').trim());
  });
  expect(chips).toEqual([`${TITLE} ✓`]);
});

// K-1 — 저장 이름이 제목과 같으면(새 규칙의 일반 경로) 같은 대회가 '기타 게임' 에 한 번 더 나왔다.
test('K-1 — 저장 이름 = 제목이어도 같은 대회 칩은 한 번만(기타 게임에 중복 없음)', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, 1440, async (p) => {
    const saved = { id: 'r1', venue_id: MOCK_VENUE, ranking_date: MOCK_DAY, event_name: TITLE, position: 1, rank: 1, nickname: '홍길동', real_name: '', prize: null };
    await p.route(/\/rest\/v1\/rpc\/venue_rankings_public/, (r) => r.fulfill(json([saved])));
    await p.route(/\/rest\/v1\/venue_rankings\?/, get([saved]));
  }, 900);
  await go(page, '게임 진행', '순위');
  const chips = await page.evaluate((t) => [...document.querySelectorAll('button')]
    .filter((b) => (b as HTMLElement).offsetParent && (b.textContent || '').trim().startsWith(t)).map((b) => (b.textContent || '').trim()), TITLE);
  expect(chips).toEqual([`${TITLE} ✓`]);
});

// S-06 — 숨김(status ≠ active) 매장: 업주에게 아무 표시가 없었고 '즉시 게시됩니다' 가 그대로 떴다.
test('S-06 — 숨김 매장이면 숨김 안내가 뜨고 즉시 게시 안내는 사라진다', async ({ page }) => {
  test.setTimeout(90_000);
  const row = { id: MOCK_VENUE, name: MOCK_VENUE_NAME, region: '서울', address: '서울 강남구 1', owner_id: MOCK_UID, approved: true, status: 'hidden', verification_status: 'verified', page_config: null };
  await boot(page, 1440, (p) => p.route(/\/rest\/v1\/venues\?/, (r) => (r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(isSingle(r) ? row : [row])))), 900);
  await expect(page.getByTestId('venue-hidden-band')).toBeVisible();
  await expect(page.getByText('관리자 승인 없이 즉시 게시됩니다')).toHaveCount(0);
});
test('S-06 대조 — 활성 매장은 숨김 안내 없음 · 인증 안내 유지', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, 1440, undefined, 900);
  await expect(page.getByText('포스터(요강)가 관리자 승인 없이 즉시 게시됩니다.')).toBeVisible();
  await expect(page.getByTestId('venue-hidden-band')).toHaveCount(0);
});

// S-15 — 이용권 묶음 승인 뒤 같은 손님 이용권 요청이 남으면 다음 승인에 바인 1회로 묶인다 → 남은 장수를 알린다.
test('S-15 — 대시보드 이용권 승인 뒤 남은 요청 장수를 알린다', async ({ page }) => {
  test.setTimeout(90_000);
  let approved = false;
  const v = (i: number) => req(i, { player_name: '김이용', user_id: '00000000-0000-4000-8000-000000000501', voucher_id: `v-${i}` });
  await boot(page, 1440, async (p) => {
    await p.route(/\/rest\/v1\/ledger_buyin_requests\?/, (r) => (r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(approved ? [v(2)] : [v(1), v(2)]))));
    await p.route(/\/rest\/v1\/rpc\/approve_buyin_request/, (r) => { approved = true; return r.fulfill(json(null)); });
  }, 900);
  await page.locator('button[aria-label="승인"]:visible').first().click();
  await expect(page.getByText(/김이용 님의 이용권 요청 1장이 아직 대기 중입니다/)).toBeVisible({ timeout: 5000 });
});
