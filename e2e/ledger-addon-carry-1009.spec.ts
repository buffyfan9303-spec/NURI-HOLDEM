// roti-1009 애드온 상태 이월(오너 2026-10-09 "로티 부스터 데이는 에드온이잖아 이것도 판별해서 넣어야지") — 전부 목킹, 운영 쓰기 0.
//   원천: Documents/누리홀덤_영상분석_0930/roti-1009/addon-verify.md P2-1 · P2-2.
//   ① 반례: 어제 부스터데이 클락이 남은 채, 오늘 포스터 둘 중 부스터데이를 골랐다가 깐부전(애드온 없음)으로 바꿔 장부를 시작한다
//      → 장부 세션(is_addon·addon_stack·addon_amount)과 클락 설정(isAddon·addonStack) **둘 다** 애드온 0.
//      (수정 전: 폼은 앞 포스터의 애드온을 그대로 들고, 클락은 남은 50,000 을 그대로 써서 TV 에 ADD-ON — 둘 다 빨간불)
//   ① 양성: 어제 깐부전 클락 위에서 부스터데이로 시작하면 애드온이 켜진다(스택 50,000 · 가격 50,000 · 0.5엔트리).
//   ② 애드온 줄 머리 안내가 세션 addon_entry 를 말한다(0.5 = '1회 0.5엔트리', 없음 = '바인·엔트리에 안 들어감').
// 음성 대조: 수정 전 빌드(origin/main 3872aa30)에서 ① 반례·② 0.5 가 빨간불, ① 양성·② 없음은 초록(양성 대조)이어야 한다 — 보고서 fix-addon-carry.md.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_DAY, MOCK_VENUE, MOCK_UID, MOCK_VENUE_NAME } from './_mockOwner';

test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

type R = Record<string, unknown>;
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const RAIL = '[data-mystore-rail]';
const YESTERDAY = new Date(Date.parse(`${MOCK_DAY}T12:00:00+09:00`) - 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 10);

const poster = (id: string, title: string, start: string, buyIn: R): R => ({
  id, title, venue_id: MOCK_VENUE, pub_name: MOCK_VENUE_NAME, region: '서울', date: MOCK_DAY, start_time: `${start}:00`, approved: true,
  owner_id: MOCK_UID, buy_in: buyIn, guaranteed: false, display_order: 1, promotions: [], side_events: [], ranking_prizes: [],
  reg_close_time: '16LV', structure: { levels: [] }, created_at: new Date().toISOString(),
});
// 운영 일정과 같은 모양(roti-1009 addon-author.md): 부스터데이 = 애드온 5만/5만 · 0.5엔트리, 깐부전 = 애드온 칸 없음.
const BOOSTER = poster('p-booster', '로티 부스터데이', '13:00', { amount: 100_000, startStack: 50_000, rebuyStack: 50_000, addon: 50_000, addonStack: 50_000, addonEntry: 0.5 });
const KKANBU = poster('p-kkanbu', '단독 깐부전', '19:00', { amount: 80_000, startStack: 50_000, rebuyStack: 70_000 });

const level = (minutes: number) => ({ kind: 'level', sb: 100, bb: 200, ante: 200, minutes });
/** 어제 끝난 채 남은 클락 행(멈춤 · 레벨 20 · 장부 날짜·마지막 쓰기 = 어제) — 장부 시작이 '지난 흔적'으로 보고 새로 채우는 행. */
const leftoverClock = (title: string, addon: { isAddon: boolean; addonStack: number }): R => ({
  venue_id: MOCK_VENUE, game_seq: 1, session_date: YESTERDAY, title,
  config: {
    title, levels: Array.from({ length: 26 }, () => level(25)), startStack: 50_000, rebuyStack: 50_000, ...addon,
    earlyBonus: 5_000, doubleEarlyBonus: 10_000, earlyDoubleLevel: 1, earlySingleLevel: 4, earlyDoubleMin: 25, earlySingleMin: 100,
    regCloseLevel: 16, maxLevel: 26, mysteryBounty: 0, prizes: [],
  },
  current_index: 20, running: false, ends_at: null, remaining_ms: 600_000,
  adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 30, live_stats: null,
  updated_at: `${YESTERDAY}T14:00:00.000Z`,
});

async function bootStart(page: Page, clockRow: R) {
  const sessions: R[] = [];
  const clockWrites: R[] = [];
  await bootOwner(page, {
    viewport: { width: 1440, height: 900 },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
      await p.route(/\/rest\/v1\/schedules\?/, (r) => (r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(single(r) ? BOOSTER : [BOOSTER, KKANBU]))));
      // 상태 있는 ledger_sessions — 시작(upsert)한 행을 다음 조회가 돌려준다. 직전 설정 조회(lt.)는 빈 값(프리필 없음).
      await p.route(/\/rest\/v1\/ledger_sessions/, (r) => {
        const req = r.request();
        if (req.method() === 'POST') {
          const body = req.postDataJSON() as R | R[];
          for (const row of Array.isArray(body) ? body : [body]) sessions.push(row);
          return r.fulfill(json([{ opened_at: new Date().toISOString() }], 201));
        }
        if (req.method() === 'GET') {
          const date = new URL(req.url()).searchParams.get('session_date');
          const rows = sessions.filter((s) => date === `eq.${String(s.session_date)}`);
          return r.fulfill(json(single(r) ? (rows[0] ?? null) : rows));
        }
        return r.fulfill(json([]));
      });
      await p.route(/\/rest\/v1\/clock_states/, (r) => {
        const req = r.request();
        if (req.method() === 'GET') return r.fulfill(json(single(r) ? clockRow : [clockRow]));
        if (req.method() === 'POST') { clockWrites.push(req.postDataJSON() as R); return r.fulfill(json([], 201)); }
        return r.fulfill(json([]));
      });
    },
  });
  await openMyStore(page);
  await page.locator(`${RAIL} [role=tab]`).filter({ hasText: '장부' }).first().evaluate((b) => (b as HTMLElement).click());
  await expect(page.getByRole('button', { name: '장부 시작', exact: true }), '장부 시작 설정 폼(전제)').toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('오늘 포스터 2개 — 어느 게임의 장부인가요?'), '오늘 포스터 선택 칩(전제)').toBeVisible({ timeout: 15_000 });
  return { sessions, clockWrites };
}

const addonToggle = (page: Page) => page.getByRole('button', { name: /^(✓ 애드온 게임|애드온 없음)$/ });

test('🔴 ① 반례 1440 — 부스터데이를 골랐다가 깐부전으로 바꿔 시작: 장부·클락 모두 애드온 0', async ({ page }) => {
  test.setTimeout(120_000);
  const probe = await bootStart(page, leftoverClock('로티 부스터데이', { isAddon: true, addonStack: 50_000 }));
  await page.getByRole('button', { name: '13:00 · 로티 부스터데이', exact: true }).click();
  await expect(addonToggle(page), '부스터데이 상속(전제) — 애드온이 켜져야 한다').toHaveText('✓ 애드온 게임');
  await page.locator('select').filter({ has: page.locator('option', { hasText: '연결 안 함 / 직접 입력' }) }).first().selectOption('p-kkanbu');
  await expect.soft(addonToggle(page), '깐부전으로 바꿨는데 폼에 앞 포스터의 애드온이 남았다').toHaveText('애드온 없음');
  await page.getByRole('button', { name: '장부 시작', exact: true }).click();

  await expect.poll(() => probe.sessions.length, { message: '장부 시작이 세션을 저장하지 않았다', timeout: 15_000 }).toBeGreaterThan(0);
  const s = probe.sessions[0];
  expect(s.schedule_id, '깐부전에 연결(전제)').toBe('p-kkanbu');
  expect.soft({ is_addon: s.is_addon, addon_stack: s.addon_stack, addon_amount: 'addon_amount' in s ? s.addon_amount : '(안 실음)' }, '세션 애드온이 다음 경기로 남았다')
    .toEqual({ is_addon: false, addon_stack: 0, addon_amount: '(안 실음)' });

  await expect.poll(() => probe.clockWrites.length, { message: '장부 시작이 클락 행을 쓰지 않았다', timeout: 15_000 }).toBeGreaterThan(0);
  const cfg = probe.clockWrites[0].config as R;
  expect(cfg.title, '깐부전 설정으로 채웠다(전제)').toBe('단독 깐부전');
  expect.soft({ isAddon: cfg.isAddon, addonStack: cfg.addonStack }, '클락 애드온이 다음 경기로 남았다(TV ADD-ON)').toEqual({ isAddon: false, addonStack: 0 });
});

test('① 양성 1440 — 어제 깐부전 클락 위에서 부스터데이로 시작: 장부·클락 애드온이 켜진다', async ({ page }) => {
  test.setTimeout(120_000);
  const probe = await bootStart(page, leftoverClock('단독 깐부전', { isAddon: false, addonStack: 0 }));
  await page.getByRole('button', { name: '13:00 · 로티 부스터데이', exact: true }).click();
  await expect(addonToggle(page)).toHaveText('✓ 애드온 게임');
  await expect(page.getByLabel('애드온 스택')).toHaveValue('50000');
  await expect(page.getByTestId('ledger-addon-price')).toHaveValue('50000');
  await page.getByRole('button', { name: '장부 시작', exact: true }).click();

  await expect.poll(() => probe.sessions.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(probe.sessions[0]).toMatchObject({ schedule_id: 'p-booster', is_addon: true, addon_stack: 50_000, addon_amount: 50_000, addon_entry: 0.5 });
  await expect.poll(() => probe.clockWrites.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(probe.clockWrites[0].config).toMatchObject({ title: '로티 부스터데이', isAddon: true, addonStack: 50_000 });
});

// ── ② 애드온 줄 머리 안내 ─────────────────────────────────────────────────────────────────────────
const openSession = (o: R): R => ({
  venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, title: '로티 부스터데이', buyin_amount: 100_000, card_amount: null, game_type: 'gtd',
  target_entries: 100, max_entries: 0, is_addon: true, addon_stack: 50_000, addon_amount: 50_000, discounts: [],
  early_double_min: 0, early_single_min: 0, opened_at: `${MOCK_DAY}T10:00:00+09:00`, operators: [], reg_closed: false, closed: false, closed_at: null,
  schedule_id: null, tournament_start: null, voucher_issued: 0, created_at: `${MOCK_DAY}T01:00:00Z`, clock_snapshot: null, ...o,
});
const BUYIN: R = {
  id: 'eeeeeeee-0009-4000-8000-000000000001', venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, player_name: '철수', entry_no: 1,
  payment_method: 'cash', is_unpaid: false, buyin_at: `${MOCK_DAY}T11:00:00+09:00`, is_split: false, cash_amount: 100_000, card_amount: 0,
  transfer_amount: 0, ticket_count: 0, unpaid_amount: 0, discount_level: 0, discount_index: 0, early_override: null, request_id: null,
  addon_method: null, addon_unpaid: false, addon_amount: 0,
};
const PLAYER: R = { id: 'ffffffff-0009-4000-8000-000000000001', venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, name: '철수', visitor_type: 'regular', note: null, sort_order: 1 };

for (const c of [{ entry: 0.5, want: '1회 0.5엔트리', not: '엔트리에 안 들어감' }, { entry: null, want: '바인·엔트리에 안 들어감', not: '1회' }]) {
  test(`${c.entry ? '🔴 ' : ''}② 1440 애드온 엔트리 ${c.entry ?? '없음'} — 애드온 줄 안내가 '${c.want}'`, async ({ page }) => {
    test.setTimeout(90_000);
    const serve = (rows: R[]) => (r: Route) => (r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(single(r) ? (rows[0] ?? null) : rows)));
    await bootOwner(page, {
      viewport: { width: 1440, height: 900 },
      extra: async (p) => {
        await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
        await p.route(/\/rest\/v1\/rpc\/pos_has_password/, (r) => r.fulfill(json(true)));
        await p.route(/\/rest\/v1\/rpc\/venue_regulars/, (r) => r.fulfill(json([])));
        await p.route(/\/rest\/v1\/rpc\/ledger_dow_avg_buyins/, (r) => r.fulfill(json(null)));
        await p.route(/\/rest\/v1\/ledger_sessions\?/, serve([openSession({ addon_entry: c.entry })]));
        await p.route(/\/rest\/v1\/ledger_buyins\?/, serve([BUYIN]));
        await p.route(/\/rest\/v1\/ledger_players\?/, serve([PLAYER]));
      },
    });
    await openMyStore(page);
    await page.locator(`${RAIL} [role=tab]`).filter({ hasText: '장부' }).first().evaluate((b) => (b as HTMLElement).click());
    await page.locator('[data-pane="ledger"] td button:visible').filter({ hasText: /^현/ }).first().click({ timeout: 20_000 });
    const row = page.getByRole('dialog', { name: /철수/ }).getByTestId('ledger-addon-row');
    await expect(row, '애드온 줄(전제)').toBeVisible();
    await expect(row).toContainText(`5만 · ${c.want}`);
    await expect(row).not.toContainText(c.not);
  });
}
