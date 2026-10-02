// review-store-link-1002b 후속(store-link-1002c, 2026-10-02) — 두 결함의 회귀 게이트.
//
//   A4  인건비 관리(StaffWageManager)는 매장 전환에 다시 마운트되지 않는다(StaffHub keep-alive). 늦게 온 A 시급이 B 화면에 들어오면
//       B 직원은 get(n) 폴백 hourlyWage:0 으로 그려지고, 그대로 「저장」하면 **B 직원 실제 시급이 0 으로 덮였다**.
//   A2  게임관리 '이 포스터로 새 장부'(seed)가 지금 보드와 **다른 날짜**로 들어오면, 날짜가 바뀐 첫 커밋에서 `if (loading) return`
//       가드가 아직 false 라 **앞 날짜 장부** 기준으로 "이미 다른 장부가 있어 사이드로 엽니다" 판정을 내렸다.
//
// 운영 쓰기 0: 읽기는 목으로 답하고, staff_wage 쓰기는 이 스펙의 route 가 받아 본문만 적는다(운영으로 나가지 않는다).
// 음성 대조: 수정 전 소스 빌드에서 FAIL, 수정 빌드에서 PASS — store-link-1002c-report.md.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

const A = MOCK_VENUE;
const B = '44444444-4444-4444-8444-444444444444';
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const venueOf = (r: Route) => /venue_id=eq\.([0-9a-f-]+)/.exec(r.request().url())?.[1] ?? '';
const sleep = (ms: number) => new Promise((z) => setTimeout(z, ms));
const venueRow = (id: string, name: string, order: number) => ({
  id, name, region: '서울', address: '서울 강남구 1', owner_id: null, approved: true, status: 'active', verification_status: 'verified',
  is_paid_ad: false, display_order: order, follower_count: 0, rating: 4.5, page_config: null, created_at: new Date().toISOString(),
});
const VENUES = [venueRow(A, '테스트 홀덤펍', 1), venueRow(B, '둘째 매장', 2)];
const wageRow = (name: string, w: number) => ({ staff_name: name, hourly_wage: w, payday: 10, weekly_off: '', memo: null });

async function press(page: Page, sel: string, re: RegExp) {
  const ok = await page.evaluate(([s, src]) => {
    const rx = new RegExp(src);
    const b = [...document.querySelectorAll<HTMLElement>(s)].find((x) => x.offsetParent !== null && rx.test((x.textContent ?? '').trim()));
    b?.click();
    return !!b;
  }, [sel, re.source] as const);
  expect(ok, `누를 대상이 없다: ${sel} ${re}`).toBe(true);
}

// ── A4 인건비 관리 ───────────────────────────────────────────────────────────
test('A4 늦게 온 A 시급이 B 인건비 관리를 덮지 않고, B 저장은 B 의 실제 시급으로만 나간다', async ({ page }) => {
  test.setTimeout(120_000);
  const saves: Record<string, unknown>[] = [];
  await bootOwner(page, {
    viewport: { width: 1440, height: 900 },
    profile: { role: 'admin' }, // 관리자 — 매장 전환에 판이 다시 마운트되지 않는 경로(store-link-1002.spec 머리말)
    extra: async (p) => {
      await p.route(/\/rest\/v1\/venues\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const id = /[?&]id=eq\.([0-9a-f-]+)/.exec(r.request().url())?.[1];
        const rows = id ? VENUES.filter((v) => v.id === id) : VENUES;
        return r.fulfill(json(single(r) ? (rows[0] ?? null) : rows));
      });
      await p.route(/\/rest\/v1\/staff_wage/, async (r) => {
        if (r.request().method() === 'GET') {
          if (venueOf(r) === A) { await sleep(3000); return r.fulfill(json([wageRow('김에이', 15000)])).catch(() => {}); }
          return r.fulfill(json([wageRow('박비', 12000)]));
        }
        saves.push(r.request().postDataJSON() as Record<string, unknown>);
        return r.fulfill({ status: 201, body: '' });
      });
      await p.route(/\/rest\/v1\/staff_schedule\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json([])) : r.fallback()));
      await p.route(/\/rest\/v1\/rpc\/get_my_venue_staff/, (r) => r.fulfill(json([])));
    },
  });
  await openMyStore(page);
  await page.waitForSelector('[data-mystore-secpanel]', { timeout: 20_000 });
  const pick = page.getByLabel('관리할 매장 선택');
  await expect(pick, '관리자인데 매장 고르개가 없다').toBeVisible({ timeout: 15_000 });
  await expect(pick).toHaveValue(A);
  await page.waitForTimeout(800);
  await page.evaluate(() => { [...document.querySelectorAll<HTMLElement>('[data-mystore-secbar] button')].find((x) => /고급 기능 모두 보기/.test(x.textContent ?? ''))?.click(); });
  await page.waitForTimeout(300);
  await press(page, '[data-mystore-secbar] button', /^직원 관리/);
  await page.waitForTimeout(800);
  await press(page, 'button', /^인건비 관리 \(시급/); // A 시급 요청이 나간다(3s 뒤 도착)
  await page.waitForTimeout(400);
  await pick.selectOption(B);

  const card = (n: string) => page.locator('div.rounded-input').filter({ has: page.locator('span.text-sm.font-bold', { hasText: new RegExp(`^${n}$`) }) });
  await expect(card('박비'), 'B 직원 카드가 안 떴다 — 이 검사가 아무것도 재지 않았다').toHaveCount(1, { timeout: 10_000 });
  await page.waitForTimeout(4000); // A 의 늦은 응답이 도착하고도 남을 시간
  await expect(card('김에이'), '늦게 온 A 명부·시급이 B 인건비 관리에 그려졌다').toHaveCount(0);
  await expect(card('박비').locator('input[type=number]').first(), 'B 직원 시급 칸이 B 값(12000)이 아니다 — A 응답이 B 시급표를 덮었다').toHaveValue('12000');

  await card('박비').getByRole('button', { name: '저장' }).click();
  await page.waitForTimeout(800);
  expect(saves.length, 'B 저장이 나가지 않았다 — 양성 대조 실패').toBeGreaterThan(0);
  for (const s of saves) {
    expect(s.venue_id, `다른 매장으로 저장이 나갔다: ${JSON.stringify(s)}`).toBe(B);
    expect(s.hourly_wage, `B 직원 시급이 실제 값이 아닌 ${String(s.hourly_wage)} 으로 덮였다`).toBe(12000);
  }
});

// ── A2 포스터로 새 장부(다른 날짜) ────────────────────────────────────────────
const POSTER_DATE = '2099-12-31';
const POSTER = {
  id: 'aaaaaaaa-0000-4000-8000-0000000000c2',
  title: '포스터-연말 딥스택', venue_id: A, owner_id: '11111111-1111-4111-8111-111111111111',
  pub_name: '테스트 홀덤펍', region: '서울', address: '서울 강남구 1',
  date: POSTER_DATE, start_time: '19:00', duration: '', format: '홀덤',
  guaranteed: '', prize_pool: '', approved: true, display_order: 1,
  buy_in: { amount: 100_000 }, seats: null, structure: null, description: '',
  side_events: null, ranking_prizes: null, partners: null, promotions: null,
  payment_methods: null, rules: null, poster_url: null, poster_color: null,
  is_premium: false, premium_until: null, unread_qna_count: 0, view_count: 0,
};
const OPEN_TODAY = {
  venue_id: A, session_date: MOCK_DAY, game_seq: 1, title: '오늘-진행중장부', buyin_amount: 50000, card_amount: null, game_type: 'entry',
  target_entries: 0, max_entries: 0, is_addon: false, addon_stack: 0, discounts: [], early_double_min: 0, early_single_min: 0,
  reg_closed: false, closed: false, closed_at: null, opened_at: `${MOCK_DAY}T03:00:00Z`, schedule_id: 'bbbbbbbb-0000-4000-8000-000000000001',
  dealers: null, event_memo: null, operators: [], created_at: `${MOCK_DAY}T03:00:00Z`,
};

test('A2 오늘 장부가 열린 채 다른 날짜 포스터로 새 장부를 열면, 앞 날짜 장부를 보고 사이드로 옮기지 않는다', async ({ page }) => {
  test.setTimeout(120_000);
  const asked: string[] = [];
  await bootOwner(page, {
    viewport: { width: 1440, height: 900 },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/schedules\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json([POSTER])) : r.fallback()));
      await p.route(/\/rest\/v1\/ledger_sessions\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const u = decodeURIComponent(r.request().url());
        const d = /session_date=eq\.([0-9-]+)/.exec(u)?.[1];
        const g = /game_seq=eq\.(\d+)/.exec(u)?.[1];
        if (d === POSTER_DATE && g) asked.push(g);
        const rows = d === MOCK_DAY && (!g || g === '1') && !/schedule_id=/.test(u) ? [OPEN_TODAY] : [];
        return r.fulfill(json(single(r) ? (rows[0] ?? null) : rows));
      });
    },
  });
  await openMyStore(page);
  const rail = page.locator('[data-mystore-rail]');
  await expect(rail).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await rail.getByRole('tab').filter({ hasText: /^장부$/ }).click();
  await expect(page.locator('[data-testid="ledger-date"]')).toHaveValue(MOCK_DAY, { timeout: 15_000 });
  await expect(page.locator('[data-pane="ledger"]').getByText('오늘-진행중장부').first(), '오늘 장부가 열린 보드가 아니다 — 이 검사가 아무것도 재지 않았다').toBeVisible({ timeout: 15_000 });

  await rail.getByRole('tab').filter({ hasText: /^포스터$/ }).click();
  await page.waitForTimeout(1200);
  await press(page, 'button', /^장부 \+$/); // 연결 장부 없음 → '이 포스터로 새 장부'(isNew seed)
  await expect(page.locator('[data-testid="ledger-date"]'), '포스터 날짜 보드로 안 갔다').toHaveValue(POSTER_DATE, { timeout: 15_000 });
  await expect(page.locator('[data-pane="ledger"] input[placeholder="예) 데일리 딥스택"]'), '포스터 정보가 새 장부 폼에 안 들어갔다').toHaveValue('포스터-연말 딥스택', { timeout: 10_000 });
  await page.waitForTimeout(1500);
  await expect(page.getByText(/이미 다른 장부\(/), '앞 날짜 장부를 보고 "이미 다른 장부가 있어 사이드로" 판정을 냈다').toHaveCount(0);
  expect(asked.filter((g) => g !== '1'), `포스터 날짜에서 메인이 아닌 게임(${asked.join(',')})을 조회했다 — 사이드로 옮겨졌다`).toEqual([]);
});
