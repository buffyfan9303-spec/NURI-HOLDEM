// 10회차 점검(audit10-visual-dummy-1006 · audit10-function-1006) 내 매장 결함 회귀 게이트. 전부 목킹 — 운영 쓰기 0.
//   ⑧ 내 매장에서 새로고침 → 내 매장 유지(다른 진입은 종전대로 홈)
//   ⑧b 새로고침 기억(pendingDeepTab)은 부팅 한 번만 — 다른 탭을 고른 뒤 권한 재확인이 탭 목록을 바꿔도 내 매장으로 끌려가지 않는다
//   ⑨ 내 매장 직접 진입 CLS — 셸 폭 1152→1440(1440) · '대회 클락' 카드 빠짐(격자 한 칸 이동) · 라이브 바 끼어듦(46px)
//   ⑨c 클락이 끝난 날 라이브 바 빈 자리(기억)가 메뉴를 옮겼다 돌아올 때 다시 생긴다(design-review P2-1)
//   ⑨d·⑨e 권한 없는 `?tab=my-store`(≥1440)에서 셸 폭이 출렁인다 · 낡은 기기 힌트는 한 번만(design-review P2-2)
//   ⑩ 1024 장부 — 쓰지 않은 바인 칸까지 10칸을 깔아 9·10바인 칸이 총바인 고정 열 밑에 잘렸다(1280 은 10칸 그대로)
//   ⑤ 대시보드 '팔로워에게 알림 보내기' 카드가 1440 에서 카드 열보다 ~210px 짧았다(READ_W 상한)
//   ⑥ 직원이 초대를 수락해도 업주 '직원 관리'가 새로고침 전까지 '수락 대기'
//   F18 순위 1~3위 저장 페이로드 · 서버 거절(42501)은 성공으로 삼키지 않는다
// 음성 대조: origin/main eb3af5da 빌드에서 ⑧·⑨·⑩(1024)·⑤·⑥ FAIL, 수정 빌드에서 PASS(F18 은 기존 동작 고정 — 둘 다 PASS).
//   ⑧b 는 57099448 빌드(App.tsx 렌더마다 재초기화)에서 FAIL(마지막 단언 '내 매장으로 끌려갔다'), useRef 가드 빌드에서 PASS.
//   ⑨c·⑨d·⑨e 는 e24bdee8 빌드에서 FAIL(빈 자리 1개 · 셸 1152→1434→1152 · 힌트 키 없음), 수정 빌드에서 PASS.
// 실행: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/store-r10-1007.spec.ts
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, FAKE_SESSION, STORAGE_KEY, MOCK_UID, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

type R = Record<string, unknown>;
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const myStorePane = (page: Page) => page.locator('main[data-tab="my-store"]');

const RUNNING_CLOCK = {
  venue_id: MOCK_VENUE, game_seq: 1, session_date: MOCK_DAY, title: '메인',
  config: { title: '메인', startStack: 50_000, rebuyStack: 50_000, addonStack: 0, isAddon: false, earlyBonus: 0, doubleEarlyBonus: 0, regCloseLevel: 3, maxLevel: 10,
    earlyDoubleLevel: 0, earlySingleLevel: 0, earlyDoubleMin: 0, earlySingleMin: 0, mysteryBounty: 0, prizes: [],
    levels: [{ kind: 'level', sb: 100, bb: 200, ante: 200, minutes: 20 }, { kind: 'level', sb: 200, bb: 400, ante: 400, minutes: 20 }] },
  current_index: 1, running: true, ends_at: new Date(Date.now() + 3_600_000).toISOString(), remaining_ms: 3_600_000,
  adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 0,
  live_stats: { ledger: { entries: 5, rebuys: 1, earlies: 0, doubleEarlies: 0, totalBuyins: 6, addons: 1, earlyUnits: 0 }, buyInAmount: 50_000 },
};

// ── ⑧ 새로고침 ────────────────────────────────────────────────────────────────────────────────
test('⑧ 1440 내 매장에서 새로고침하면 내 매장에 머문다 · 주소로 새로 들어오면 홈', async ({ page }) => {
  test.setTimeout(90_000);
  await bootOwner(page);
  await openMyStore(page);
  await expect(myStorePane(page), '내 매장(전제)').toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(myStorePane(page), '새로고침했더니 내 매장이 아니다(홈으로 갔다)').toBeVisible({ timeout: 20_000 });
  expect(new URL(page.url()).search, '주소에 ?tab= 이 남았다').toBe('');
  // 음성: 새로고침이 아닌 진입(주소 입력·다른 사이트에서 돌아옴)은 종전대로 홈(오너 2026-09-04 '진입점은 홈')
  await page.goto('/');
  await page.waitForTimeout(2500);
  await expect(myStorePane(page), '새로고침이 아닌 진입인데 내 매장으로 갔다').toBeHidden();
});

// ── ⑧b 새로고침 기억은 부팅 한 번뿐 ────────────────────────────────────────────────────────────
//   새로고침 부팅의 pendingDeepTab 은 렌더마다 다시 채워졌다(navigation type 'reload' 는 그 페이지가 사는 동안 유지된다).
//   사용자가 다른 탭을 누르면 changeTab 이 비우지만, 다음 렌더에 sessionStorage 의 'my-store' 로 다시 채웠고 —
//   그 뒤 [tabs] effect 가 권한 재확인(탭 목록 변경)을 만나 사용자를 내 매장으로 끌고 갔다.
test('⑧b 새로고침 → 다른 탭을 고른 뒤 권한 재확인이 탭 목록을 바꿔도 내 매장으로 끌려가지 않는다', async ({ page }) => {
  test.setTimeout(90_000);
  let role = 'venue_owner';
  let profileGets = 0;
  await bootOwner(page, {
    extra: async (p) => {
      await p.route(/\/rest\/v1\/profiles\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        profileGets += 1;
        return r.fulfill(json({
          id: MOCK_UID, name: '업주', nickname: '업주', role, approved: true, status: 'active',
          venue_id: MOCK_VENUE, activity_points: 0, created_at: '2026-01-01T00:00:00Z', consented_legal_version: 3,
        }));
      });
    },
  });
  await openMyStore(page);
  await expect(myStorePane(page), '내 매장(전제)').toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(myStorePane(page), '새로고침 뒤 내 매장(전제)').toBeVisible({ timeout: 20_000 });
  // 사용자가 직접 다른 탭을 고른다
  await page.getByRole('tab', { name: '일정 탐색', exact: true }).first().click();
  await expect(myStorePane(page), '다른 탭을 눌렀는데 내 매장이 그대로다(전제)').toBeHidden({ timeout: 10_000 });
  // 권한 재확인이 두 번 — 역할 상실(내 매장 탭 사라짐) → 복구(탭 다시 생김). 다른 탭·토큰 갱신의 인증 이벤트가 같은 경로를 탄다.
  const refetch = async (next: string) => {
    role = next;
    const before = profileGets;
    // 다른 탭에서 온 인증 이벤트와 같은 경로(GoTrue BroadcastChannel → onAuthStateChange → 프로필 재조회)
    await page.evaluate(([k, session]) => { const ch = new BroadcastChannel(k); ch.postMessage({ event: 'SIGNED_IN', session }); ch.close(); }, [STORAGE_KEY, FAKE_SESSION] as const);
    await expect.poll(() => profileGets, { message: '프로필 재조회가 안 일어났다(전제)', timeout: 10_000 }).toBeGreaterThan(before);
    await page.waitForTimeout(600);
  };
  await refetch('user');
  await refetch('venue_owner');
  await page.waitForTimeout(800);
  await expect(myStorePane(page), '사용자가 고른 탭을 두고 내 매장으로 끌려갔다(새로고침 기억이 렌더마다 되살아남)').toBeHidden();
});

// ── ⑨ 직접 진입 CLS ──────────────────────────────────────────────────────────────────────────
for (const w of [1440, 1024]) {
  test(`⑨ ${w} 클락 진행 중 매장 — 내 매장 직접 진입의 레이아웃 이동이 0.05 미만(셸 폭·클락 카드·라이브 바)`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: { v: number; src: string }[] };
      w.__cls = [];
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean; sources?: { node?: Node }[] }[]) {
          if (e.hadRecentInput) continue;
          const n = e.sources?.[0]?.node as HTMLElement | undefined;
          w.__cls.push({ v: e.value, src: n && n.nodeType === 1 ? `${n.tagName}.${String(n.className).slice(0, 40)}` : String(n?.nodeName) });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await bootOwner(page, { viewport: { width: w, height: 900 }, clock: RUNNING_CLOCK, goto: false });
    // 첫 방문 — 이 기기에 오늘 이 매장의 라이브 상태가 남는다(정착 뒤)
    await page.goto('/?tab=my-store');
    await expect(page.getByTestId('live-widget'), '라이브 운영 현황(전제)').toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    // 다시 직접 진입(새로고침·바로가기와 같은 부팅)
    await page.goto('/?tab=my-store');
    await expect(page.getByTestId('live-widget')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(3000);
    const shifts = await page.evaluate(() => (window as unknown as { __cls: { v: number; src: string }[] }).__cls);
    const sum = shifts.reduce((a, b) => a + b.v, 0);
    console.log(`[⑨ ${w}] CLS=${sum.toFixed(4)}`, JSON.stringify(shifts.map((s) => `${s.v.toFixed(4)} ${s.src}`)));
    expect(sum, `직접 진입 레이아웃 이동 ${sum.toFixed(4)} — ${shifts.map((s) => s.src).join(' | ')}`).toBeLessThan(0.05);
  });
}

// ── ⑨c 라이브 바 기억=있음·지금=없음 (PR #203 design-review P2-1) ─────────────────────────────────
//   같은 날 클락이 돌 때 들어갔다 나오고, 클락이 끝난 뒤 다시 들어오면 기억한 높이(34px)로 빈 자리를 붙잡는다(여기까지는 설계).
//   그 뒤 사용자가 다른 메뉴로 갔다가 처음 판(대시보드)으로 돌아오면 빈 자리가 **다시** 생겨 레일·본문이 46px 오르내렸다.
test('⑨c 1440 클락이 끝난 날 — 메뉴를 옮겼다 돌아오면 라이브 바 빈 자리가 다시 생기지 않는다', async ({ page }) => {
  test.setTimeout(90_000);
  const st = { clock: true };
  await bootOwner(page, {
    viewport: { width: 1440, height: 900 }, goto: false,
    extra: async (p) => {
      await p.route(/\/rest\/v1\/clock_states/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        return r.fulfill(json(st.clock ? (single(r) ? RUNNING_CLOCK : [RUNNING_CLOCK]) : (single(r) ? null : [])));
      });
    },
  });
  await page.goto('/?tab=my-store');
  await expect(page.getByTestId('live-widget'), '라이브 운영 현황(전제)').toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2000);
  st.clock = false;   // 그 사이 클락이 끝났다
  await page.goto('/?tab=my-store');
  await expect(myStorePane(page), '내 매장(전제)').toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(3000);
  const secNav = (name: string) => page.locator('[data-mystore-secbar]').getByRole('button', { name, exact: true }).evaluate((b) => (b as HTMLElement).click());
  await secNav('직원 관리');
  await page.waitForTimeout(1200);
  await secNav('대시보드');
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-livebar-hold]'), '처음 판으로 돌아오자 라이브 바 빈 자리가 다시 생겼다').toHaveCount(0);
});

// ── ⑨d 셸 폭 — 권한 없는 사람의 `?tab=my-store` (PR #203 design-review P2-2) ────────────────────
//   역할 확인 없이 첫 렌더부터 셸 폭 상한을 풀어, 익명이 ≥1440 에서 바로가기로 들어오면 셸이 1152→1434→1152 로 출렁였다.
const SHELL_PROBE = () => {
  const w = window as unknown as { __shellW: number[] };
  w.__shellW = [];
  const tick = () => {
    const el = document.querySelector<HTMLElement>('div.relative.z-1.min-h-screen');
    const v = el ? Math.round(el.getBoundingClientRect().width) : -1;
    if (v > 0 && w.__shellW[w.__shellW.length - 1] !== v) w.__shellW.push(v);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
const shellWidths = (page: Page) => page.evaluate(() => (window as unknown as { __shellW: number[] }).__shellW);
const SHELL_HINT = 'nuri:store-shell';

test('⑨d 1440 익명이 ?tab=my-store 로 들어와도 셸 폭이 한 번도 바뀌지 않는다', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(SHELL_PROBE);
  await page.goto('/?tab=my-store');
  await page.waitForTimeout(4000);
  const ws = await shellWidths(page);
  console.log('[⑨d anon]', JSON.stringify(ws));
  expect(ws.length, `셸 폭이 바뀌었다 ${ws.join('→')}`).toBe(1);
});

test('⑨e 1440 기기 힌트가 남았는데 업주가 아닌 계정 — 출렁임은 한 번뿐이고 힌트가 지워진다', async ({ page }) => {
  test.setTimeout(90_000);
  // 이 기기에서 업주가 쓰던 힌트가 남은 채 다른(손님) 계정 세션으로 부팅한다 — 첫 부팅에만 심는다.
  await page.addInitScript((k) => { try { if (!sessionStorage.getItem('e2e-hint-once')) { sessionStorage.setItem('e2e-hint-once', '1'); localStorage.setItem(k, '1'); } } catch { /* noop */ } }, SHELL_HINT);
  await page.addInitScript(SHELL_PROBE);
  await bootOwner(page, { viewport: { width: 1440, height: 900 }, goto: false, profile: { role: 'user', venue_id: null } });
  await page.goto('/?tab=my-store');
  await page.waitForTimeout(4000);
  const first = await shellWidths(page);
  const hint = await page.evaluate((k) => localStorage.getItem(k), SHELL_HINT);
  console.log('[⑨e 첫 부팅]', JSON.stringify(first), 'hint=', hint);
  expect(hint, '업주가 아닌 계정이 확정됐는데 힌트가 남았다').toBeNull();
  await page.goto('/?tab=my-store');
  await page.waitForTimeout(4000);
  const second = await shellWidths(page);
  console.log('[⑨e 다음 부팅]', JSON.stringify(second));
  expect(second.length, `힌트를 지운 뒤에도 셸 폭이 바뀌었다 ${second.join('→')}`).toBe(1);
});

// ── ⑩ 1024 장부 바인 칸 ──────────────────────────────────────────────────────────────────────
const sessRow: R = {
  venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, title: '메인', buyin_amount: 50_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, discounts: [], early_double_min: 0, early_single_min: 0,
  opened_at: `${MOCK_DAY}T10:00:00+09:00`, operators: [], reg_closed: false, closed: false, closed_at: null,
  schedule_id: null, tournament_start: null, voucher_issued: 0, created_at: `${MOCK_DAY}T01:00:00Z`, clock_snapshot: null,
};
const NAMES = ['점검1006_손님1', '점검1006_손님2', '점검1006_손님4', '점검1006_손님5'];
const buyinRows: R[] = NAMES.flatMap((n, pi) => Array.from({ length: pi === 0 ? 2 : 1 }, (_, e) => ({
  id: `eeeeeeee-0001-4000-8000-${String(pi * 100 + e).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1,
  player_name: n, entry_no: e + 1, payment_method: 'cash', is_unpaid: false, buyin_at: `${MOCK_DAY}T11:00:00+09:00`, is_split: false,
  cash_amount: 50_000, card_amount: 0, transfer_amount: 0, ticket_count: 0, unpaid_amount: 0, discount_level: 0, discount_index: 0, early_override: null, request_id: null,
})));
const playerRows: R[] = NAMES.map((n, i) => ({ id: `ffffffff-0001-4000-8000-${String(i).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, name: n, visitor_type: 'regular', note: null, sort_order: i }));

for (const c of [{ w: 1024, cols: 3 }, { w: 1280, cols: 10 }]) {
  test(`⑩ ${c.w} 장부(최대 2바인) — 바인 칸 ${c.cols}개, 어느 칸도 총바인 고정 열 밑에 잘리지 않는다`, async ({ page }) => {
    test.setTimeout(90_000);
    const serve = (rows: R[]) => (r: Route) => {
      if (r.request().method() !== 'GET') return r.fallback();
      const sd = new URL(r.request().url()).searchParams.get('session_date');
      const got = rows.filter((x) => !sd || !sd.startsWith('eq.') || sd === `eq.${x.session_date}`);
      return r.fulfill(json(single(r) ? (got[0] ?? null) : got));
    };
    await bootOwner(page, {
      viewport: { width: c.w, height: 900 },
      extra: async (p) => {
        await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
        await p.route(/\/rest\/v1\/rpc\/pos_has_password/, (r) => r.fulfill(json(false)));
        await p.route(/\/rest\/v1\/rpc\/venue_regulars/, (r) => r.fulfill(json([])));
        await p.route(/\/rest\/v1\/rpc\/ledger_dow_avg_buyins/, (r) => r.fulfill(json(null)));
        await p.route(/\/rest\/v1\/ledger_sessions\?/, serve([sessRow]));
        await p.route(/\/rest\/v1\/ledger_players\?/, serve(playerRows));
        await p.route(/\/rest\/v1\/ledger_buyins\?/, serve(buyinRows));
      },
    });
    await openMyStore(page);
    await page.locator('[data-mystore-rail] [role=tab]').filter({ hasText: '장부' }).first().evaluate((b) => (b as HTMLElement).click());
    await expect(page.locator('[data-testid="ledger-date"]:visible').first(), '장부 보드(전제)').toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-pane="ledger"] td').filter({ hasText: NAMES[0] }).first(), '장부 명단(전제)').toBeVisible({ timeout: 15_000 });
    const m = await page.evaluate(() => {
      const t = [...document.querySelectorAll<HTMLElement>('[data-pane="ledger"] table')].find((x) => x.getClientRects().length > 0)!;
      const board = t.closest('.overflow-auto') as HTMLElement;
      const ths = [...t.querySelectorAll<HTMLElement>('thead th')];
      const tot = ths.find((x) => x.textContent?.trim() === '총바인')!.getBoundingClientRect();
      const bins = ths.filter((x) => /^\d+바인$/.test(x.textContent?.trim() ?? ''));
      const cut = bins.filter((x) => x.getBoundingClientRect().right > tot.left + 1).map((x) => x.textContent?.trim());
      return { cols: bins.length, cut, client: board.clientWidth, scroll: board.scrollWidth };
    });
    console.log(`[⑩ ${c.w}]`, JSON.stringify(m));
    expect(m.cols, '바인 칸 수').toBe(c.cols);
    expect(m.cut, '총바인 고정 열 밑에 걸친 바인 칸').toEqual([]);
    expect(m.scroll, '장부 표가 판보다 넓어 가로로 넘친다').toBeLessThanOrEqual(m.client + 1);
  });
}

// ── ⑤ 팔로워 알림 카드 폭 ──────────────────────────────────────────────────────────────────────
test('⑤ 1440 대시보드 — 팔로워 알림 카드의 오른쪽 끝이 대시보드 카드 열과 같다', async ({ page }) => {
  test.setTimeout(90_000);
  await bootOwner(page);
  await openMyStore(page);
  const announce = page.locator('section').filter({ has: page.getByRole('heading', { name: '팔로워에게 알림 보내기' }) }).first();
  await expect(announce, '팔로워 알림 카드(전제)').toBeVisible({ timeout: 20_000 });
  const r = await page.evaluate(() => {
    const h = [...document.querySelectorAll('h3')].find((x) => x.textContent?.includes('팔로워에게 알림 보내기'))!;
    const sec = h.closest('section')!.getBoundingClientRect();
    const grid = [...document.querySelectorAll<HTMLElement>('[data-tab="my-store"] div.grid')].find((g) => g.className.includes('xl:grid-cols-3') && g.getClientRects().length > 0)!.getBoundingClientRect();
    return { announceRight: Math.round(sec.right), gridRight: Math.round(grid.right), announceLeft: Math.round(sec.left), gridLeft: Math.round(grid.left) };
  });
  console.log('[⑤]', JSON.stringify(r));
  expect(Math.abs(r.announceLeft - r.gridLeft), '왼쪽 끝이 어긋났다').toBeLessThanOrEqual(2);
  expect(Math.abs(r.announceRight - r.gridRight), `알림 카드 오른쪽 끝이 카드 열보다 ${r.gridRight - r.announceRight}px 짧다`).toBeLessThanOrEqual(2);
});

// ── ⑥ 직원 초대 수락 → 업주 직원 관리 ──────────────────────────────────────────────────────────
test('⑥ 1440 직원이 초대를 수락하면 직원 관리를 다시 열 때 구성원으로 보인다(새로고침 없이)', async ({ page }) => {
  test.setTimeout(90_000);
  const server = { accepted: false };
  const MEMBER = { id: 'bbbbbbbb-0000-4000-8000-000000000009', name: '점검1006_직원A', nickname: '점검1006_직원A', email: null, avatar_color: null, staff_title: null, is_active: true };
  const INVITE = { id: 'cccccccc-0000-4000-8000-000000000009', user_id: MEMBER.id, email: null, nickname: MEMBER.nickname, name: MEMBER.name, created_at: new Date().toISOString(), grant_ledger: false, grant_voucher: false, grant_schedule: false, staff_title: null };
  await bootOwner(page, {
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/get_my_venue_staff/, (r) => r.fulfill(json(server.accepted ? [MEMBER] : [])));
      await p.route(/\/rest\/v1\/rpc\/get_my_venue_invites/, (r) => r.fulfill(json(server.accepted ? [] : [INVITE])));
      for (const fn of ['get_ledger_access_user_ids', 'get_voucher_access_user_ids', 'get_schedule_access_user_ids']) {
        await p.route(new RegExp(`/rest/v1/rpc/${fn}`), (r) => r.fulfill(json([])));
      }
    },
  });
  await openMyStore(page);
  const nav = (name: string) => page.locator('[data-mystore-secbar]').getByRole('button', { name, exact: true }).click();
  await nav('직원 관리');
  const staff = page.locator('[data-pane="staff"]');
  await expect(staff.getByText('수락 대기').first(), '수락 대기 초대(전제)').toBeVisible({ timeout: 15_000 });
  server.accepted = true;   // 직원이 자기 기기에서 수락했다
  await nav('대시보드');
  await nav('직원 관리');
  await expect(staff.locator('li').filter({ hasText: MEMBER.name }).first(), '수락한 직원이 구성원으로 안 보인다(재조회 0)').toBeVisible({ timeout: 10_000 });
  await expect(staff.getByText('수락 대기'), '수락한 초대가 아직 수락 대기로 남았다').toHaveCount(0);
});

// ── F18 순위 1~3위 저장 ───────────────────────────────────────────────────────────────────────
for (const c of [{ deny: false }, { deny: true }]) {
  test(`F18 1440 순위 1~3위 저장 — ${c.deny ? '서버 거절(42501)은 실패로 보인다' : '등수 순서대로 닉네임 3명이 나간다'}`, async ({ page }) => {
    test.setTimeout(90_000);
    const calls: R[] = [];
    await bootOwner(page, {
      extra: async (p) => {
        for (const fn of ['search_ranking_members', 'resolve_ranking_members', 'venue_ranking_real_name_optins', 'ledger_business_date']) {
          await p.route(new RegExp(`/rest/v1/rpc/${fn}`), (r) => r.fulfill(json(fn === 'ledger_business_date' ? MOCK_DAY : [])));
        }
        await p.route(/\/rest\/v1\/rpc\/save_venue_rankings/, (r) => {
          calls.push(r.request().postDataJSON() as R);
          return c.deny
            ? r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'permission denied for table venue_rankings', details: null, hint: null }) })
            : r.fulfill({ status: 204, body: '' });
        });
      },
    });
    await openMyStore(page);
    await page.locator('[data-mystore-rail] [role=tab]').filter({ hasText: '순위' }).first().evaluate((b) => (b as HTMLElement).click());
    const pane = page.locator('[data-pane="ranking"]');
    const nick = pane.locator('input[placeholder="닉네임 *"]');
    await expect(nick.first(), '순위 입력칸(전제)').toBeVisible({ timeout: 20_000 });
    while (await nick.count() < 3) await pane.getByRole('button', { name: /줄 추가/ }).click();
    for (const [i, n] of ['우승자', '준우승', '삼등'].entries()) await nick.nth(i).fill(n);
    await pane.getByRole('button', { name: /순위 저장$/ }).click();
    await expect.poll(() => calls.length, { message: '저장 RPC 가 나가지 않았다' }).toBe(1);
    const body = calls[0] as { p_venue_id: string; p_date: string; p_entries: { nickname: string; realName: string }[] };
    expect(body.p_venue_id).toBe(MOCK_VENUE);
    expect(body.p_entries.slice(0, 3).map((e) => e.nickname), '등수 순서').toEqual(['우승자', '준우승', '삼등']);
    expect(JSON.stringify(body), '상금·이용권 같은 금액 필드가 실렸다(§28)').not.toMatch(/prize|voucher|amount/i);
    if (c.deny) {
      await expect(page.getByText(/저장에 실패했습니다 — 이 계정에는 권한이 없습니다/), '서버 거절 안내가 안 보인다').toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/순위 저장 완료/), '거절됐는데 성공 토스트가 떴다').toHaveCount(0);
    } else {
      await expect(page.getByText(/순위 저장 완료/), '성공 안내가 없다').toBeVisible({ timeout: 10_000 });
    }
  });
}
