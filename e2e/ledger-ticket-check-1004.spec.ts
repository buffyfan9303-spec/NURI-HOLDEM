// 오너 2026-10-04 F4-02 화면 게이트(RUN-REPORT dummy-1004 F4-02). 전부 목킹 — 운영 쓰기 0.
//   ① 완납 → 미수는 비밀번호 없이 저장된다(직접 PATCH · 비밀번호 시트·감액 RPC 없음). 직원·비밀번호 미설정 매장도.
//   ② 정산 판에 '티켓 대조'(장부 티켓 · 들어온 이용권 · 부족)가 업주·장부 권한 직원 모두에게 보인다. 직원은 지난 마감 장부면 숫자 대신 안내.
// 음성 대조: 수정 전 빌드(origin/NURI/dummy1004-fixes 4c6b3b37)에서 ①은 비밀번호 시트/업주만 안내가 떠 PATCH 0건, ②는 ticket-check 가 없다.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

type R = Record<string, unknown>;
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const dayAgo = (n: number) => new Date(Date.parse(`${MOCK_DAY}T12:00:00+09:00`) - n * 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 10);
const RAIL = '[data-mystore-rail]';

const sess = (date: string, o: R = {}): R => ({
  venue_id: MOCK_VENUE, session_date: date, game_seq: 1, title: '메인', buyin_amount: 100_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, discounts: [{ label: '1레벨', amount: 50_000 }],
  early_double_min: 0, early_single_min: 0, opened_at: `${date}T10:00:00+09:00`, operators: [], reg_closed: false, closed: false, closed_at: null,
  schedule_id: null, tournament_start: null, voucher_issued: 0, created_at: `${date}T01:00:00Z`, clock_snapshot: null, ...o,
});
const buy = (date: string, i: number, name: string, o: R): R => ({
  id: `eeeeeeee-0001-4000-8000-${date.replace(/-/g, '')}${String(i).padStart(4, '0')}`, venue_id: MOCK_VENUE, session_date: date, game_seq: 1,
  player_name: name, entry_no: 1, payment_method: 'cash', is_unpaid: false, buyin_at: `${date}T11:00:00+09:00`, is_split: false,
  cash_amount: 0, card_amount: 0, transfer_amount: 0, ticket_count: 0, unpaid_amount: 0, discount_level: 0, discount_index: 0,
  early_override: null, request_id: null, ...o,
});
const player = (date: string, i: number, name: string): R => ({
  id: `ffffffff-0001-4000-8000-${date.replace(/-/g, '')}${String(i).padStart(4, '0')}`, venue_id: MOCK_VENUE, session_date: date, game_seq: 1,
  name, visitor_type: 'regular', note: null, sort_order: i,
});

interface World { sessions: R[]; buyins: R[]; players: R[]; voucherUses: string[] }
interface Probe { patches: R[]; reduceCalls: number; voucherQueries: string[] }

async function boot(page: Page, w: World, o: { staff?: boolean; hasPw: boolean }): Promise<Probe> {
  const probe: Probe = { patches: [], reduceCalls: 0, voucherQueries: [] };
  const pick = (rows: R[], url: string) => {
    const q = new URL(url).searchParams;
    let out = rows;
    for (const k of ['venue_id', 'session_date', 'game_seq']) {
      for (const v of q.getAll(k)) {
        const m = /^(eq|lte|gte)\.(.*)$/.exec(v); if (!m) continue;
        out = out.filter((r) => { const a = String(r[k]); return m[1] === 'eq' ? a === m[2] : m[1] === 'lte' ? a <= m[2] : a >= m[2]; });
      }
    }
    return out;
  };
  await bootOwner(page, {
    viewport: { width: 1440, height: 900 }, goto: false,
    ...(o.staff ? {
      perms: { can_manage_pos: false, can_access_ledger: true, can_view_vouchers: false, can_manage_venue_staff: false, can_manage_venue_schedules: false },
      profile: { role: 'venue_staff', name: '직원', nickname: '직원' },
    } : {}),
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
      await p.route(/\/rest\/v1\/rpc\/pos_has_password/, (r) => r.fulfill(json(o.hasPw)));
      await p.route(/\/rest\/v1\/rpc\/venue_regulars/, (r) => r.fulfill(json([])));
      await p.route(/\/rest\/v1\/rpc\/ledger_dow_avg_buyins/, (r) => r.fulfill(json(null)));
      await p.route(/\/rest\/v1\/rpc\/update_ledger_buyin_reduce/, (r) => { probe.reduceCalls++; return r.fulfill(json(null)); });
      const serve = (rows: () => R[]) => (r: Route) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const got = pick(rows(), r.request().url());
        return r.fulfill(json(single(r) ? (got[0] ?? null) : got));
      };
      await p.route(/\/rest\/v1\/ledger_sessions\?/, serve(() => w.sessions));
      await p.route(/\/rest\/v1\/ledger_players\?/, serve(() => w.players));
      await p.route(/\/rest\/v1\/ledger_buyins\?/, (r) => {
        if (r.request().method() === 'PATCH') {
          const body = JSON.parse(r.request().postData() || '{}') as R;
          probe.patches.push(body);
          const id = new URL(r.request().url()).searchParams.get('id')?.replace(/^eq\./, '');
          const row = w.buyins.find((x) => x.id === id);
          if (row) Object.assign(row, body);
          return r.fulfill(json(row ? [row] : []));
        }
        return serve(() => w.buyins)(r);
      });
      // 이용권 사용 기록(F4-02) — voucher_id 가 있는 요청만 묻는 조회에 장마다 1행. 대기열(pending) 조회는 빈 배열.
      await p.route(/\/rest\/v1\/ledger_buyin_requests\?/, (r) => {
        const u = r.request().url();
        if (/voucher_id=not\.is\.null/.test(u)) {
          probe.voucherQueries.push(u);
          return r.fulfill(json(w.voucherUses.map((n, i) => ({ id: `rq${i}`, player_name: n }))));
        }
        return r.fulfill(json([]));
      });
    },
  });
  return probe;
}

async function openLedger(page: Page) {
  await page.locator(`${RAIL} [role=tab]`).filter({ hasText: '장부' }).first().evaluate((b) => (b as HTMLElement).click());
  await expect(page.locator('[data-testid="ledger-date"]:visible').first(), '장부 보드(전제)').toBeVisible({ timeout: 20_000 });
}

// ── ① 완납 → 미수 ─────────────────────────────────────────────────────────────────────────────────
for (const c of [{ staff: false, hasPw: true }, { staff: true, hasPw: false }, { staff: true, hasPw: true }]) {
  test(`① 1440 ${c.staff ? '직원' : '업주'} · 비밀번호 ${c.hasPw ? '설정' : '미설정'} — 현금 완납 → 미수는 비밀번호 없이 저장`, async ({ page }) => {
    test.setTimeout(90_000);
    const w: World = {
      sessions: [sess(MOCK_DAY)], buyins: [buy(MOCK_DAY, 0, '철수', { cash_amount: 100_000 })],
      players: [player(MOCK_DAY, 0, '철수')], voucherUses: [],
    };
    const probe = await boot(page, w, c);
    await page.goto('/');
    await openMyStore(page);
    await openLedger(page);
    const led = page.locator('[data-pane="ledger"]');
    await led.locator('td button:visible').filter({ hasText: /^현/ }).first().click({ timeout: 20_000 });
    const dlg = page.getByRole('dialog', { name: /철수/ });
    await expect(dlg, '결제 창(전제)').toBeVisible();
    await dlg.getByRole('button', { name: '미수', exact: true }).click();
    await dlg.getByRole('button', { name: /^현금 미수/ }).click();
    await expect.poll(() => probe.patches.length, { message: '완납 → 미수 PATCH 가 나가지 않았다(비밀번호 요구)', timeout: 10_000 }).toBe(1);
    expect(probe.patches[0]).toMatchObject({ payment_method: 'cash', is_unpaid: true });
    await expect(page.getByTestId('ledger-reduce-pw'), '비밀번호 시트가 떴다').toHaveCount(0);
    await expect(page.getByText('업주만 금액을 줄일 수 있습니다'), '업주만 안내가 떴다').toHaveCount(0);
    expect(probe.reduceCalls, '감액 RPC 로 갔다').toBe(0);
  });
}

// ── ①-v2 같은 결제 수단으로만 자유(오너 2026-10-04, critical R2 B 두 단계 우회) ──────────────────────────────
//   현금 미수 → 현금 완납은 자유(PATCH) · 현금 미수 → 티켓 완납은 비밀번호 시트(PATCH 0).
for (const c of [{ to: '현금', free: true }, { to: '티켓', free: false }]) {
  test(`①-v2 1440 직원 · 비밀번호 설정 — 현금 미수 → ${c.to} 완납은 ${c.free ? '비밀번호 없이' : '비밀번호 시트'}`, async ({ page }) => {
    test.setTimeout(90_000);
    const w: World = {
      sessions: [sess(MOCK_DAY)], buyins: [buy(MOCK_DAY, 0, '철수', { cash_amount: 100_000, is_unpaid: true })],
      players: [player(MOCK_DAY, 0, '철수')], voucherUses: [],
    };
    const probe = await boot(page, w, { staff: true, hasPw: true });
    await page.goto('/');
    await openMyStore(page);
    await openLedger(page);
    const led = page.locator('[data-pane="ledger"]');
    await led.locator('td button:visible').filter({ hasText: /^현·미/ }).first().click({ timeout: 20_000 });
    const dlg = page.getByRole('dialog', { name: /철수/ });
    await expect(dlg, '결제 창(전제)').toBeVisible();
    await dlg.getByRole('button', { name: '완납', exact: true }).click();
    await dlg.getByRole('button', { name: new RegExp(`^${c.to} 완납`) }).click();
    if (c.free) {
      await expect.poll(() => probe.patches.length, { message: '현금 미수 → 현금 완납 PATCH 가 나가지 않았다', timeout: 10_000 }).toBe(1);
      expect(probe.patches[0]).toMatchObject({ payment_method: 'cash', is_unpaid: false });
      await expect(page.getByTestId('ledger-reduce-pw')).toHaveCount(0);
    } else {
      await expect(page.getByTestId('ledger-reduce-pw'), '분류가 바뀌는데 비밀번호 시트가 없다').toBeVisible({ timeout: 10_000 });
      expect(probe.patches.length, '비밀번호 없이 PATCH 가 나갔다').toBe(0);
    }
    expect(probe.reduceCalls).toBe(0);
  });
}

// ── ①-v3 애드온 제거는 비밀번호(오너 2026-10-04 · 리드 결정 2) ──────────────────────────────────────────────
//   서버 가드가 PATCH 를 LEDGER_REDUCE_NEEDS_PASSWORD 로 거절 → 비밀번호 시트 → update_ledger_addon_with_password(p_method null, p_password).
test('①-v3 1440 직원 · 비밀번호 설정 — 애드온 제거는 비밀번호 시트를 거쳐 애드온 비밀번호 RPC 로 간다', async ({ page }) => {
  test.setTimeout(90_000);
  const w: World = {
    sessions: [sess(MOCK_DAY, { is_addon: true, addon_amount: 50_000 })],
    buyins: [buy(MOCK_DAY, 0, '철수', { cash_amount: 100_000, addon_method: 'cash', addon_unpaid: false, addon_amount: 50_000 })],
    players: [player(MOCK_DAY, 0, '철수')], voucherUses: [],
  };
  const addonCalls: R[] = [];
  const probe = await boot(page, w, { staff: true, hasPw: true });
  // 서버 가드 흉내: 애드온 칸을 지우는 PATCH 는 42501 + hint
  await page.route(/\/rest\/v1\/ledger_buyins\?/, (r) => {
    if (r.request().method() === 'PATCH') {
      probe.patches.push(JSON.parse(r.request().postData() || '{}'));
      return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({
        code: '42501', message: '매출이 줄거나 결제 수단 분류(현금·이용권·가게지원)가 바뀌는 수정은 업주 취소 비밀번호가 필요합니다', details: null, hint: 'LEDGER_REDUCE_NEEDS_PASSWORD' }) });
    }
    return r.fallback();
  });
  await page.route(/\/rest\/v1\/rpc\/update_ledger_addon_with_password/, (r) => {
    addonCalls.push(JSON.parse(r.request().postData() || '{}'));
    return r.fulfill({ status: 204, body: '' });
  });
  await page.goto('/');
  await openMyStore(page);
  await openLedger(page);
  const led = page.locator('[data-pane="ledger"]');
  await led.locator('td button:visible').filter({ hasText: /^현/ }).first().click({ timeout: 20_000 });
  const dlg = page.getByRole('dialog', { name: /철수/ });
  await expect(dlg.getByTestId('ledger-addon-row'), '애드온 줄(전제)').toBeVisible();
  await dlg.getByTestId('ledger-addon-row').getByRole('button', { name: '없음', exact: true }).click();
  const sheet = page.getByTestId('ledger-reduce-pw');
  await expect(sheet, '애드온 제거인데 비밀번호 시트가 없다').toBeVisible({ timeout: 10_000 });
  expect(probe.patches.length, '먼저 직접 PATCH 를 시도한다(서버가 판정)').toBe(1);
  await sheet.getByLabel('취소 비밀번호').fill('4826');
  await sheet.getByRole('button', { name: '수정 확정' }).click();
  await expect.poll(() => addonCalls.length, { message: '애드온 비밀번호 RPC 가 불리지 않았다', timeout: 10_000 }).toBe(1);
  expect(addonCalls[0]).toMatchObject({ p_method: null, p_unpaid: false, p_password: '4826' });
});

// ── ② 정산 판 티켓 대조 ────────────────────────────────────────────────────────────────────────────
// 오늘 열린 장부: 영희 티켓 완납(직접 기록) 10장 + 지훈 할인 티켓 5장 · 철수 현금. 들어온 이용권: 영희 4장 → 장부 15 · 들어옴 4 · 부족 11.
const todayWorld = (): World => ({
  sessions: [sess(MOCK_DAY)],
  buyins: [
    buy(MOCK_DAY, 0, '철수', { cash_amount: 100_000 }),
    buy(MOCK_DAY, 1, '영희', { payment_method: 'ticket' }),
    buy(MOCK_DAY, 2, '지훈', { payment_method: 'ticket', discount_index: 1 }),
  ],
  players: [player(MOCK_DAY, 0, '철수'), player(MOCK_DAY, 1, '영희'), player(MOCK_DAY, 2, '지훈')],
  voucherUses: ['영희', '영희', '영희', '영희'],
});
for (const staff of [false, true]) {
  test(`② 1440 ${staff ? '직원' : '업주'} — 정산 판 티켓 대조: 장부 15장 · 들어온 4장 · 부족 11장 · 확인할 손님`, async ({ page }) => {
    test.setTimeout(90_000);
    const probe = await boot(page, todayWorld(), { staff, hasPw: true });
    await page.goto('/');
    await openMyStore(page);
    await page.getByRole('tab', { name: /정산/ }).first().click();
    const pane = page.locator('[data-pane="settle"]');
    const card = pane.getByTestId('ticket-check');
    await expect(card, '티켓 대조 카드가 없다').toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText('15장');
    await expect(card).toContainText('티켓 바인 2회');
    await expect(card).toContainText('4장');
    await expect(card.getByTestId('ticket-short')).toContainText('11장');
    const who = card.getByRole('list', { name: '확인할 손님' });
    await expect(who).toContainText('영희');
    await expect(who).toContainText('부족 6장');
    await expect(who).toContainText('지훈');
    await expect(who).toContainText('부족 5장');
    expect(probe.voucherQueries.some((u) => u.includes(`session_date=eq.${MOCK_DAY}`) && /status=neq\.rejected/.test(u)), '들어온 이용권 조회 조건').toBe(true);
    if (staff) await expect(pane.getByTestId('settle-staff'), '직원 판(전제)').toBeVisible();
    // 금액 없음 — 카드 안에 '만' 원 표기가 없다(장부 권한 직원에게 보여도 매출이 새지 않는다)
    expect(await card.textContent(), '티켓 대조 카드에 금액이 섞였다').not.toMatch(/\d만/);
  });
}
test('② 1440 직원 — 지난 마감 장부(18시간 밖)는 숫자 대신 업주 안내(부분 행으로 부족 0 거짓 안심 금지)', async ({ page }) => {
  test.setTimeout(90_000);
  const date = dayAgo(3);
  const w: World = {
    sessions: [sess(date, { closed: true, reg_closed: true, closed_at: `${date}T22:00:00+09:00` })],
    buyins: [buy(date, 0, '철수', { is_unpaid: true, cash_amount: 100_000 })],   // 서버가 직원에게 주는 모양 — 미수 행만
    players: [player(date, 0, '철수')], voucherUses: [],
  };
  await boot(page, w, { staff: true, hasPw: true });
  await page.goto('/');
  await openMyStore(page);
  await page.getByRole('tab', { name: /정산/ }).first().click();
  const pane = page.locator('[data-pane="settle"]');
  await pane.getByLabel('정산할 날짜').fill(date);
  const card = pane.getByTestId('ticket-check');
  await expect(card).toContainText('지난 마감 장부의 티켓 대조는 업주가 볼 수 있어요', { timeout: 20_000 });
  await expect(card.getByTestId('ticket-short')).toHaveCount(0);
});
