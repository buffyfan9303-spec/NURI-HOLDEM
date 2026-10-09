// 오너 2026-10-03 Q2·Q3 화면 + settle-fix 검토 후속 ①~④ 회귀 게이트. 전부 목킹(운영 쓰기 0).
//   Q2  마감된 장부의 미수는 직원도 받는다 — 비밀번호 필수(서버 settle_unpaid_after_close, 20261003h). 성공 뒤 장부를 직접 다시 읽는다.
//   Q3  직원(can_manage_pos 거짓)에게 매출 칸 자체가 없다 — 대시보드 KPI·오늘 게임 표·정산 탭·마감 장부 띠. 0 으로도 그리지 않는다.
//   후속(review-settle-fix-1003.md 비차단 1~4):
//     ① 1280 미만에서 Tab 순서 = 화면 순서(CTA → 다음 줄 순위 칩)  ② 라이브 위젯 높이 기억은 오늘 것만
//     ③ 할 일이 '미수 회수'면 빨간 미수 배너를 숨긴다  ④ '오늘 장부' 배지도 하루 정산 판정(daySettled)을 쓴다
//   음성 대조: 수정 전 빌드(origin/main e5cd044c)에서 Q3·Q2·①~④ FAIL, 수정 빌드에서 PASS(보고서 참조).
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, applyClockCounts, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

type R = Record<string, unknown>;
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const dayAgo = (n: number) => new Date(Date.parse(`${MOCK_DAY}T12:00:00+09:00`) - n * 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 10);
const SID = (i: number) => `99999999-9999-4999-8999-${String(i).padStart(12, '0')}`;
const PW = '4826';

const sess = (date: string, o: R = {}): R => ({
  venue_id: MOCK_VENUE, session_date: date, game_seq: 1, title: '메인', buyin_amount: 30_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, discounts: [], early_double_min: 0, early_single_min: 0,
  opened_at: `${date}T10:00:00+09:00`, operators: [], reg_closed: true, closed: true, closed_at: `${date}T22:00:00+09:00`,
  schedule_id: null, tournament_start: null, voucher_issued: 0, created_at: `${date}T01:00:00Z`, clock_snapshot: null, ...o,
});
/** 현금 완납 n건. unpaid 를 주면 마지막 1건을 '미수 unpaid 원' 분납 행으로(현금 30000 − unpaid + 미수 unpaid). */
const buys = (date: string, seq: number, n: number, unpaid = 0): R[] => Array.from({ length: n }, (_, i) => {
  const last = unpaid > 0 && i === n - 1;
  return {
    id: `eeeeeeee-${String(seq).padStart(4, '0')}-4000-8000-${date.replace(/-/g, '')}${String(i).padStart(4, '0')}`, venue_id: MOCK_VENUE, session_date: date, game_seq: seq,
    player_name: `손님${i}`, entry_no: 1, payment_method: 'cash', is_unpaid: last, buyin_at: `${date}T11:00:00+09:00`, is_split: last,
    cash_amount: last ? 30_000 - unpaid : 30_000, card_amount: 0, transfer_amount: 0, ticket_count: 0, unpaid_amount: last ? unpaid : 0, discount_level: 0, discount_index: 0, early_override: null,
  };
});
const schedRow = (id: string, date: string, title: string): R => ({
  id, title, venue_id: MOCK_VENUE, pub_name: '테스트 홀덤펍', region: '서울', address: '서울 강남구 1', date, start_time: '19:00:00',
  duration: '', format: 'tournament', guaranteed: 1_000_000, prize_pool: null, buy_in: { amount: 30_000 }, seats: 40, structure: null, description: '',
  side_events: [], ranking_prizes: [], partners: [], promotions: [], payment_methods: [], rules: [], poster_url: null, poster_color: null, display_order: 1,
  is_premium: false, premium_until: null, owner_id: '00000000-0000-4000-8000-0000000000ee', unread_qna_count: 0, approved: true, view_count: 0,
});
function pick(rows: R[], url: string) {
  const q = new URL(url).searchParams;
  let out = rows;
  for (const k of ['venue_id', 'session_date', 'game_seq', 'closed', 'schedule_id']) {
    for (const v of q.getAll(k)) {
      if (v === 'not.is.null') { out = out.filter((r) => r[k] != null); continue; }
      if (v === 'is.null') { out = out.filter((r) => r[k] == null); continue; }
      const m = /^(eq|lt|lte|gt|gte)\.(.*)$/.exec(v); if (!m) continue;
      const [, op, b] = m;
      out = out.filter((r) => { const a = String(r[k]); return op === 'eq' ? a === b : op === 'lt' ? a < b : op === 'lte' ? a <= b : op === 'gt' ? a > b : a >= b; });
    }
  }
  const lim = Number(q.get('limit') ?? 0);
  return lim > 0 ? out.slice(0, lim) : out;
}
interface World { sessions: R[]; buyins: R[]; schedules?: R[]; clock?: unknown }
const merge = (...ws: World[]): World => ({ sessions: ws.flatMap((w) => w.sessions), buyins: ws.flatMap((w) => w.buyins), schedules: ws.flatMap((w) => w.schedules ?? []), clock: ws.find((w) => w.clock)?.clock });
const hist = (days: number, n = 15): World => {
  const s: R[] = []; const b: R[] = [];
  for (let i = 1; i <= days; i++) { s.push(sess(dayAgo(i))); b.push(...buys(dayAgo(i), 1, n)); }
  return { sessions: s, buyins: b };
};
const today = (games: { seq: number; closed: boolean; unpaid?: number }[]): World => ({
  sessions: games.map((g) => sess(MOCK_DAY, { game_seq: g.seq, title: g.seq === 1 ? '메인' : `사이드${g.seq - 1}`,
    ...(g.closed ? {} : { closed: false, reg_closed: false, closed_at: null }) })),
  buyins: games.flatMap((g) => buys(MOCK_DAY, g.seq, 4, g.unpaid ?? 0)),
});
const pend = (n: number): World => ({
  sessions: Array.from({ length: n }, (_, i) => sess(dayAgo(1 + i * 2), { title: `밀린 메인${i + 1}`, schedule_id: SID(i) })),
  buyins: [],
  schedules: Array.from({ length: n }, (_, i) => schedRow(SID(i), dayAgo(1 + i * 2), `밀린 메인${i + 1}`)),
});

interface Probe { settleCalls: { pw: unknown; method: unknown; id: unknown }[]; buyinGets: number }
/** staff=true 면 장부 권한 직원(can_manage_pos 거짓 · venue_staff). 서버 settle RPC 는 상태를 가진 가짜다(비밀번호 PW). */
async function boot(page: Page, W: number, H: number, world: World, o: { staff?: boolean; hasPw?: boolean; delay?: number; players?: R[]; voucher?: boolean } = {}): Promise<Probe> {
  const probe: Probe = { settleCalls: [], buyinGets: 0 };
  const sorted = () => [...world.sessions].sort((a, b) => String(b.session_date).localeCompare(String(a.session_date)) || Number(a.game_seq) - Number(b.game_seq));
  await bootOwner(page, {
    viewport: { width: W, height: H }, goto: false, clock: world.clock,
    ...(o.staff ? {
      perms: { can_manage_pos: false, can_access_ledger: true, can_view_vouchers: !!o.voucher, can_manage_venue_staff: false, can_manage_venue_schedules: false },
      profile: { role: 'venue_staff', name: '직원', nickname: '직원' },
    } : {}),
    ...(o.voucher ? { appSettings: { identity_voucher_enabled: 'on' } } : {}),
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
      await p.route(/\/rest\/v1\/rpc\/pos_has_password/, (r) => r.fulfill(json(o.hasPw !== false)));
      await p.route(/\/rest\/v1\/rpc\/venue_regulars/, (r) => r.fulfill(json([])));
      await p.route(/\/rest\/v1\/rpc\/ledger_dow_avg_buyins/, (r) => r.fulfill(json(null)));
      await p.route(/\/rest\/v1\/rpc\/settle_unpaid_after_close/, async (r) => {
        const b = JSON.parse(r.request().postData() || '{}');
        probe.settleCalls.push({ pw: b.p_password, method: b.p_method, id: b.p_id });
        if (b.p_password !== PW) return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: '비밀번호가 올바르지 않습니다 (4번 더 틀리면 10분 동안 잠깁니다)', details: null, hint: null }) });
        const row = world.buyins.find((x) => x.id === b.p_id)!;
        const won = Number(row.unpaid_amount);
        Object.assign(row, { unpaid_amount: 0, is_unpaid: false, [`${b.p_method}_amount`]: Number(row[`${b.p_method}_amount`]) + won });
        return r.fulfill(json({ id: b.p_id, buyin_won: won, addon_won: 0, method: b.p_method }));
      });
      const serve = (rows: () => R[], count = false) => async (r: Route) => {
        if (r.request().method() !== 'GET') return r.fallback();
        if (count) probe.buyinGets++;
        if (o.delay) await new Promise((z) => setTimeout(z, o.delay));
        const got = pick(rows(), r.request().url());
        return r.fulfill(json(single(r) ? (got[0] ?? null) : got)).catch(() => {});
      };
      await p.route(/\/rest\/v1\/ledger_sessions\?/, serve(sorted));
      await p.route(/\/rest\/v1\/ledger_buyins\?/, serve(() => world.buyins, true));
      await p.route(/\/rest\/v1\/ledger_players\?/, serve(() => o.players ?? []));
      await p.route(/\/rest\/v1\/schedules\?/, (r) => r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(single(r) ? (world.schedules?.[0] ?? null) : (world.schedules ?? []))));
      await p.route(/\/rest\/v1\/rpc\/venue_rankings_public/, (r) => r.fulfill(json([
        { id: 'r1', venue_id: MOCK_VENUE, ranking_date: MOCK_DAY, position: 1, nickname: '손님0', real_name: null, prize: null, event_name: '메인' }])));
    },
  });
  await page.addInitScript(() => { Date.prototype.getHours = function () { return 14; }; });   // '지금 할 일' 정오 분기 고정
  return probe;
}
const dash = (page: Page) => page.locator('[data-pane="dashboard"]');
const settledDash = (page: Page) => expect(dash(page).getByTestId('todo-cta')).toBeVisible({ timeout: 25_000 });
const owedWorld = () => merge(hist(3), today([{ seq: 1, closed: true, unpaid: 20_000 }]));

// ── Q3: 직원에게 매출 칸이 없다(양성 대조 = 업주는 그대로) ─────────────────────────────────────────────
for (const staff of [true, false]) {
  test(`Q3 1440 ${staff ? '직원' : '업주(양성)'} — 대시보드 완납 매출·머니인 가치 ${staff ? '칸 없음' : '보임'}`, async ({ page }) => {
    test.setTimeout(90_000);
    await boot(page, 1440, 900, owedWorld(), { staff });
    await page.goto('/');
    await openMyStore(page);
    await settledDash(page);
    const grid = dash(page).getByTestId('dash-kpi-grid');
    await expect(grid).toBeVisible();
    const labels = (await grid.locator(':scope > span > span:first-child').allTextContents()).map((s) => s.trim());
    console.log(`[Q3 ${staff ? 'staff' : 'owner'}] KPI 라벨=${JSON.stringify(labels)}`);
    expect(labels.length, 'KPI 칸을 못 읽었다 — 빈 검사').toBeGreaterThanOrEqual(3);
    expect(labels.includes('완납 매출'), '완납 매출 칸').toBe(!staff);
    await expect(dash(page).locator('#today-games-h'), '오늘 게임 표(전제)').toBeVisible();
    await expect(dash(page).locator('th', { hasText: '머니인 가치' })).toHaveCount(staff ? 0 : 1);
    await expect(dash(page).locator('th', { hasText: '미수' }).first(), '미수 열은 직원에게도 남는다').toBeVisible();
  });
  test(`Q3 1440 ${staff ? '직원' : '업주(양성)'} — 정산 탭 ${staff ? '매출 KPI 없음 · 받을 미수 목록' : '매출 KPI 보임'}`, async ({ page }) => {
    test.setTimeout(90_000);
    await boot(page, 1440, 900, owedWorld(), { staff });
    await page.goto('/');
    await openMyStore(page);
    await settledDash(page);
    await page.getByRole('tab', { name: /정산/ }).first().click();
    const pane = page.locator('[data-pane="settle"]');
    if (staff) {
      await expect(pane.getByTestId('settle-staff'), '직원 정산 판').toBeVisible({ timeout: 15_000 });
      await expect(pane.getByTestId('unpaid-collect-btn')).toHaveCount(1);
    } else {
      await expect(pane.getByTestId('kpi-revenue'), '업주 매출 KPI').toBeVisible({ timeout: 15_000 });
    }
    await expect(pane.getByTestId('kpi-revenue')).toHaveCount(staff ? 0 : 1);
  });
}

// ── Q2: 마감된 장부의 미수 받기 — 비밀번호 없음(버튼 잠김)·틀림(서버 거절, 창 유지)·맞음(받음 → 직접 재조회) ─────────
test('Q2 1440 직원 — 마감 장부 미수 받기: 비번 없음/틀림/맞음 · 성공 뒤 장부 재조회 · 마감 띠에 매출 없음', async ({ page }) => {
  test.setTimeout(120_000);
  const world = owedWorld();
  const probe = await boot(page, 1440, 900, world, { staff: true });
  await page.goto('/');
  await openMyStore(page);
  await settledDash(page);
  await expect(dash(page).getByTestId('todo-cta')).toHaveText('미수 회수');
  await dash(page).getByTestId('todo-cta').click();
  const led = page.locator('[data-pane="ledger"]');
  await expect(led.getByText('마감됨 (읽기전용)').first(), '마감 장부로 가지 않았다(전제)').toBeVisible({ timeout: 15_000 });
  await expect(led.getByTestId('ledger-closed-revenue'), '직원에게 마감 장부 매출이 보인다').toHaveCount(0);
  const list = led.getByTestId('unpaid-collect');
  await expect(list, '받을 미수 목록이 없다').toBeVisible();
  await list.getByTestId('unpaid-collect-btn').click();
  const dlg = page.getByRole('dialog', { name: '미수 받기' });
  await expect(dlg).toBeVisible();
  // 첫 포커스 = 비밀번호 칸(헤더 '닫기'가 아니라) — design-reviewer 비차단 2
  await expect(dlg.getByTestId('unpaid-collect-pw'), '창의 첫 포커스가 비밀번호 칸이 아니다').toBeFocused({ timeout: 3_000 });
  const pad = await dlg.locator('form').evaluate((f) => parseFloat(getComputedStyle(f).paddingLeft));
  expect(pad, 'B1 — 창 본문 좌우 여백이 제목(17px)과 맞지 않는다').toBeGreaterThanOrEqual(16);
  // 창이 열리는 동안(전환 중)에는 getBoundingClientRect 의 top/bottom 이 float32 로 어긋나 44px 가 43.99997 로 나온다(부하에서만).
  //   자리(top)가 6프레임 연속 멎은 뒤에 잰다 — 임계(44)는 그대로다.
  const hs = await dlg.locator('[data-testid="unpaid-collect-pw"], [data-testid="unpaid-collect-confirm"]').evaluateAll((els) => Promise.all(els.map((el) => new Promise<number>((res) => {
    let last = -1; let still = 0;
    const tick = () => {
      const r = el.getBoundingClientRect();
      if (r.top === last) { if (++still >= 6) return res(r.height); } else { still = 0; last = r.top; }
      requestAnimationFrame(tick);
    };
    tick();
  }))));
  expect(Math.min(...hs), '비밀번호 칸·확정 버튼 높이 44px 미만').toBeGreaterThanOrEqual(44);
  const confirm = dlg.getByTestId('unpaid-collect-confirm');
  await expect(confirm, '비밀번호 없이 확정할 수 있다').toBeDisabled();
  await dlg.getByRole('radio', { name: '카드' }).click();
  await dlg.getByTestId('unpaid-collect-pw').fill('0000');
  await confirm.click();
  await expect(dlg.getByRole('alert'), '틀린 비밀번호 문구').toContainText('비밀번호가 올바르지 않습니다');
  await expect(dlg, '틀렸는데 창이 닫혔다').toBeVisible();
  // 틀린 뒤 포커스는 비밀번호 칸으로, 값 전체 선택(바로 다시 친다)
  await expect(dlg.getByTestId('unpaid-collect-pw'), '틀린 뒤 비밀번호 칸으로 돌아가지 않았다').toBeFocused({ timeout: 3_000 });
  expect(await dlg.getByTestId('unpaid-collect-pw').evaluate((e) => { const i = e as HTMLInputElement; return (i.selectionEnd ?? 0) - (i.selectionStart ?? 0); }), '값이 선택되지 않았다').toBe(4);
  const before = probe.buyinGets;
  await dlg.getByTestId('unpaid-collect-pw').fill(PW);
  await dlg.getByTestId('unpaid-collect-pw').press('Enter');   // Enter 로 제출(비차단 2)
  await expect(dlg, '맞는 비밀번호(Enter)인데 창이 남았다').toBeHidden({ timeout: 10_000 });
  await expect(led.getByTestId('unpaid-collect-btn'), '받은 뒤에도 미수 목록이 남았다(재조회 안 됨)').toHaveCount(0, { timeout: 10_000 });
  await expect(led.getByTestId('unpaid-collect-head')).toHaveText('받을 미수를 모두 받았어요');
  await expect(led.getByTestId('unpaid-collect-head'), '성공 뒤 포커스가 목록 머리로 돌아오지 않았다').toBeFocused({ timeout: 3_000 });
  console.log(`[Q2] settle 호출=${JSON.stringify(probe.settleCalls)} · 장부 GET ${before}→${probe.buyinGets}`);
  expect(probe.settleCalls.map((c) => c.pw)).toEqual(['0000', PW]);
  expect(probe.settleCalls[1].method).toBe('card');
  expect(probe.buyinGets, '성공 뒤 장부를 직접 다시 읽지 않았다').toBeGreaterThan(before);
});
test('Q2 1440 직원 · 비밀번호 미설정 매장 — 받을 수 없다는 안내 · 확정 잠김(서버 호출 0)', async ({ page }) => {
  test.setTimeout(90_000);
  const probe = await boot(page, 1440, 900, owedWorld(), { staff: true, hasPw: false });
  await page.goto('/');
  await openMyStore(page);
  await settledDash(page);
  await page.getByRole('tab', { name: /정산/ }).first().click();
  const pane = page.locator('[data-pane="settle"]');
  await pane.getByTestId('unpaid-collect-btn').click({ timeout: 15_000 });
  const dlg = page.getByRole('dialog', { name: '미수 받기' });
  await expect(dlg.getByRole('note')).toContainText('업주·공동운영자만');
  await expect(dlg.getByTestId('unpaid-collect-confirm')).toBeDisabled();
  expect(probe.settleCalls.length).toBe(0);
});

// ── 재수정(verifier FAIL) — 직원에게 부분 행이 오는 소비처 · 직원 '완납 매출' 0 ─────────────────────────
const RAIL = '[data-mystore-rail]';
async function openLedgerAt(page: Page, date: string) {
  await page.locator(`${RAIL} [role=tab]`).filter({ hasText: '장부' }).first().evaluate((b) => (b as HTMLElement).click());
  // PC 장부는 날짜 줄을 셸 칩 줄 자리로 옮긴다(판 밖) — 보이는 것 하나를 잡는다.
  const d = page.locator('[data-testid="ledger-date"]:visible').first();
  await expect(d, '장부 보드(전제)').toBeVisible({ timeout: 20_000 });
  if (date !== MOCK_DAY) await d.fill(date);
}
// 서버(20261003h)가 직원에게 주는 모양 그대로 — 마감 18시간 지난 장부는 미수 행만.
const oldClosed = (staff: boolean): World => {
  const date = dayAgo(2);
  // 미수 행에 할인 1건 — 직원에게 오는 부분 행만으로 '할인 1건' 줄이 서는지(서면 거짓 집계) 본다.
  const all = buys(date, 1, 4, 20_000).map((b) => (b.is_unpaid ? { ...b, discount_index: 1 } : b));
  return { sessions: [sess(date, { clock_snapshot: { entries: 4 }, discounts: [{ label: '얼리', amount: 10_000 }] })], buyins: staff ? all.filter((b) => b.is_unpaid) : all };
};
for (const staff of [true, false]) {
  test(`B1 1440 ${staff ? '직원' : '업주(양성)'} — 지난 마감 장부: ${staff ? '바인 수·티켓·클락 대조 없음(부분 행) · 미수만' : '바인 수·클락 대조 그대로'}`, async ({ page }) => {
    test.setTimeout(90_000);
    // ⚠ hist(n) 은 dayAgo(1..n) 에 장부를 깐다 — 같은 날짜를 또 깔면 행 id 가 겹쳐 보드가 '불러오지 못했습니다'로 떨어진다.
    await boot(page, 1440, 900, merge(hist(1), oldClosed(staff)), { staff });
    await page.goto('/');
    await openMyStore(page);
    await settledDash(page);
    await openLedgerAt(page, dayAgo(2));
    const led = page.locator('[data-pane="ledger"]');
    await expect(led.getByText('마감됨 (읽기전용)').first(), '마감 장부(전제)').toBeVisible({ timeout: 15_000 });
    await expect(led.getByTestId('unpaid-collect-btn'), '미수 받기(전제)').toHaveCount(1);
    await expect(led.getByTestId('ledger-closed-buyins'), '마감 띠 바인 수').toHaveCount(staff ? 0 : 1);
    await expect(led.getByText(/클락 \d+명 vs 장부/), "부분 행으로 '클락 N명 vs 장부 M명' 거짓 경보").toHaveCount(0);
    const m = led.getByTestId('ledger-metrics');
    await expect(m).toBeVisible();
    const txt = (await m.textContent()) ?? '';
    console.log(`[B1 ${staff ? 'staff' : 'owner'}] 정산 바=${txt.replace(/\s+/g, ' ')}`);
    expect(txt.includes('총 바인'), '정산 바 총 바인').toBe(!staff);
    expect(txt.includes('완납 매출'), '정산 바 완납 매출').toBe(!staff);
    expect(txt, '미수는 직원에게도 남는다').toContain('미수금');
    if (staff) await expect(led.getByTestId('ledger-staff-partial')).toBeVisible();
    await expect(led.getByText(/할인 \d+건/), '할인·가게지원 줄(부분 행 집계)').toHaveCount(staff ? 0 : 1);
  });
}
test('B1 1440 직원 양성 — 자정 넘겨 마감한 지 15시간 된 장부는 바인 수가 그대로 보인다(18시간 창)', async ({ page }) => {
  test.setTimeout(90_000);
  const date = dayAgo(1);
  const closedAt = new Date(Date.now() - 15 * 3_600_000).toISOString();
  await boot(page, 1440, 900, { sessions: [sess(date, { closed_at: closedAt })], buyins: buys(date, 1, 4, 20_000) }, { staff: true });
  await page.goto('/');
  await openMyStore(page);
  await settledDash(page);
  await openLedgerAt(page, date);
  const led = page.locator('[data-pane="ledger"]');
  await expect(led.getByTestId('ledger-closed-buyins'), '18시간 안인데 바인 수가 숨었다').toHaveText('4', { timeout: 15_000 });
  await expect(led.getByTestId('ledger-staff-partial')).toHaveCount(0);
});
for (const [W, H] of [[1440, 900], [390, 844]] as const) {
  test(`B3 ${W} 직원 — 열린 오늘 장부 정산 바·모바일 요약에 '완납 매출' 0개(미수·바인은 남는다)`, async ({ page }) => {
    test.setTimeout(90_000);
    await boot(page, W, H, merge(hist(3), today([{ seq: 1, closed: false, unpaid: 20_000 }])), { staff: true });
    await page.goto('/');
    await openMyStore(page);
    await settledDash(page);
    await openLedgerAt(page, MOCK_DAY);
    const led = page.locator('[data-pane="ledger"]');
    await expect(led.getByText('미수').first(), '장부(전제)').toBeVisible({ timeout: 15_000 });
    const n = await led.evaluate((el) => [...el.querySelectorAll('*')].filter((e) => e.getClientRects().length && e.children.length === 0 && (e.textContent ?? '').trim() === '완납 매출').length);
    console.log(`[B3 ${W}] 보이는 '완납 매출' ${n}`);
    expect(n, "직원 장부에 '완납 매출'이 보인다").toBe(0);
    if (W === 390) await expect(led.locator('[data-sum="buyins"]'), '모바일 요약 바인(전제 — 빈 검사 아님)').toBeVisible();
  });
}
test('B1 1440 직원 — 지난 장부 순위 입력 명단이 완전하다(ledger_players) · 바인 수는 그리지 않는다', async ({ page }) => {
  test.setTimeout(90_000);
  const date = dayAgo(1);
  const all = buys(date, 1, 4, 20_000);
  const roster = all.map((b, i) => ({ id: `ffffffff-0000-4000-8000-${String(i).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: date, game_seq: 1, name: b.player_name, visitor_type: 'regular', note: null, sort_order: i }));
  const w: World = { sessions: [sess(date, { title: '밀린 메인1', schedule_id: SID(0) })], buyins: all.filter((b) => b.is_unpaid), schedules: [schedRow(SID(0), date, '밀린 메인1')] };
  await boot(page, 1440, 900, w, { staff: true, players: roster });
  await page.route(/\/rest\/v1\/rpc\/venue_rankings_public/, (r) => r.fulfill(json([])));
  await page.goto('/');
  await openMyStore(page);
  // 밀린 순위는 할 일 갈래(주 카드) 또는 보조 칩으로 뜬다 — 어느 쪽이든 그 대회 순위 입력으로 간다.
  await settledDash(page);
  const chip = dash(page).getByTestId('todo-rank').getByRole('button', { name: '순위 입력' });
  if (await chip.count()) await chip.click(); else await dash(page).getByTestId('todo-cta').click();
  const rk = page.locator('[data-pane="ranking"]');
  await expect(rk.locator('input[type="date"]').first()).toHaveValue(date, { timeout: 10_000 });
  await expect(rk.getByText('그날 장부 명단'), '명단 줄(전제)').toBeVisible();
  await expect(rk.getByText('(4명)'), '직원 순위 입력 명단이 4명이 아니다(부분 행만 셌다)').toBeVisible({ timeout: 10_000 });
  await expect(rk.getByText(/\d+바인/), '직원 명단에 부분 바인 수가 보인다').toHaveCount(0);
});
for (const staff of [true, false]) {
  test(`B1 1440 ${staff ? '직원(이용권 열람)' : '업주(양성)'} — 매장이용권 카드 7일 사용 T ${staff ? '없음' : '그대로'}`, async ({ page }) => {
    test.setTimeout(90_000);
    await boot(page, 1440, 900, merge(hist(6), today([{ seq: 1, closed: false }])), { staff, voucher: true });
    await page.goto('/');
    await openMyStore(page);
    await settledDash(page);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll<HTMLElement>('[data-pane="dashboard"] button[aria-expanded]')].find((x) => /^더 보기/.test((x.textContent ?? '').trim()));
      if (b && b.getAttribute('aria-expanded') !== 'true') b.click();
    });
    const card = dash(page).locator('section', { hasText: '매장이용권' }).first();
    await expect(card, '이용권 카드(전제)').toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('오늘 전송'), '이용권 칸(전제)').toBeVisible();
    await expect(card.getByText('7일 사용')).toHaveCount(staff ? 0 : 1);
  });
}
test('B4 1440 직원 — 정산 탭: 마감 전 게임의 미수에는 미수 받기 버튼이 없다(안내만)', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, 1440, 900, merge(hist(3), today([{ seq: 1, closed: true, unpaid: 20_000 }, { seq: 2, closed: false, unpaid: 10_000 }])), { staff: true });
  await page.goto('/');
  await openMyStore(page);
  await settledDash(page);
  await page.getByRole('tab', { name: /정산/ }).first().click();
  const pane = page.locator('[data-pane="settle"]');
  await expect(pane.getByTestId('settle-staff')).toBeVisible({ timeout: 15_000 });
  await expect(pane.getByTestId('unpaid-collect-btn'), '마감 게임 미수 1건만 받기 버튼').toHaveCount(1);
  await expect(pane.getByText('아직 마감 전 게임의 미수는 장부에서')).toBeVisible();
});

// ── 마지막 수정(verifier 재검증 6ee4664d) — 클락: 마감 장부는 서버 저장 몫으로 표시·하한, 열린 장부는 로컬 ──────────
const clockRow = (date: string, ledgerEntries: number): R => ({
  venue_id: MOCK_VENUE, game_seq: 1, title: '메인',
  config: { title: '메인', startStack: 50_000, rebuyStack: 50_000, addonStack: 0, isAddon: false, earlyBonus: 0, doubleEarlyBonus: 0, regCloseLevel: 3, maxLevel: 10,
    earlyDoubleLevel: 0, earlySingleLevel: 0, earlyDoubleMin: 0, earlySingleMin: 0, mysteryBounty: 0, prizes: [],
    levels: [{ kind: 'level', sb: 100, bb: 200, ante: 200, minutes: 20 }, { kind: 'level', sb: 200, bb: 400, ante: 400, minutes: 20 }] },
  current_index: 1, running: false, ends_at: null, remaining_ms: 10 * 60_000, adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 0,
  session_date: date,
  live_stats: { buyInAmount: 30_000, ledger: { entries: ledgerEntries, rebuys: 0, earlies: 0, doubleEarlies: 0, totalBuyins: ledgerEntries, earlyUnits: 0, addons: 0 } },
});
async function openClockPane(page: Page) {
  const ok = await page.evaluate((sel) => {
    const b = [...document.querySelectorAll<HTMLElement>(`${sel} button, ${sel} [role=tab]`)].find((x) => getComputedStyle(x).display !== 'none' && (x.textContent ?? '').trim() === '클락');
    b?.click(); return !!b;
  }, RAIL);
  expect(ok, '레일에 «클락» 칸이 없다').toBe(true);
}
const entriesOf = (page: Page) => page.locator('[data-pane="clock"] span', { hasText: /^Entries/ }).first().locator('b');
test('K 1440 직원 — 18시간 지난 마감 장부의 클락: 엔트리 = 서버 저장 몫(4) · 보정 하한도 저장 몫 기준(−4)', async ({ page }) => {
  test.setTimeout(90_000);
  const date = dayAgo(2);
  const row = clockRow(date, 4);
  await boot(page, 1440, 900, merge(hist(1), oldClosed(true)), { staff: true });
  await page.route(/\/rest\/v1\/clock_states/, (r) => r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(single(r) ? row : [row])));
  await page.route(/\/rest\/v1\/rpc\/clock_adjust_counts/, (r) => { const res = applyClockCounts(row, r.request().postDataJSON() as R); return r.fulfill({ status: res.status, contentType: 'application/json', body: JSON.stringify(res.body) }); });
  await page.goto('/');
  await openMyStore(page);
  await settledDash(page);
  await openClockPane(page);
  await expect(entriesOf(page), '직원 클락 엔트리가 저장 몫(4)이 아니다(부분 행 1을 셌다)').toHaveText('4', { timeout: 15_000 });
  const minus = page.locator('[data-pane="clock"] span', { hasText: /^Entries/ }).first().locator('xpath=..').getByRole('button', { name: '－' });
  for (let i = 0; i < 6; i++) { await minus.click(); await page.waitForTimeout(150); }
  await page.waitForTimeout(800);
  console.log(`[K staff] 서버 adj_entries=${row.adj_entries} · 표시=${await entriesOf(page).textContent()}`);
  expect(row.adj_entries, '보정 하한이 저장 몫(−4)이 아니라 부분 행(−1)으로 잘렸다').toBe(-4);
  await expect(entriesOf(page)).toHaveText('0');
});
test('K 1440 업주 양성 — 열린 오늘 장부의 클락은 로컬 장부(4)를 센다(낡은 저장 몫 99 무시)', async ({ page }) => {
  test.setTimeout(90_000);
  const row = clockRow(MOCK_DAY, 99);
  await boot(page, 1440, 900, merge(hist(3), today([{ seq: 1, closed: false }])));
  await page.route(/\/rest\/v1\/clock_states/, (r) => r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(single(r) ? row : [row])));
  await page.goto('/');
  await openMyStore(page);
  await settledDash(page);
  await openClockPane(page);
  await expect(entriesOf(page), '열린 장부인데 저장 몫을 썼다').toHaveText('4', { timeout: 15_000 });
});
test('B5 360 직원 — 열린 장부 정산 바 엔트리 보조 줄이 한 줄', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, 360, 780, merge(hist(3), today([{ seq: 1, closed: false, unpaid: 20_000 }])), { staff: true });
  await page.goto('/');
  await openMyStore(page);
  await settledDash(page);
  await openLedgerAt(page, MOCK_DAY);
  const m = page.locator('[data-pane="ledger"] [data-testid="ledger-metrics"]');
  await expect(m).toBeVisible({ timeout: 15_000 });
  const r = await m.evaluate((el) => {
    const p = [...el.querySelectorAll('p')].find((x) => (x.textContent ?? '').startsWith('엔트리'));
    if (!p) return null;
    const lh = parseFloat(getComputedStyle(p).fontSize);
    return { h: p.getBoundingClientRect().height, fs: lh, ws: getComputedStyle(p).whiteSpace };
  });
  console.log(`[B5 360] ${JSON.stringify(r)}`);
  expect(r, '엔트리 보조 줄(전제)').not.toBeNull();
  expect(r!.h, "'엔트리 · 생존' 이 두 줄로 꺾였다").toBeLessThan(r!.fs * 1.6);
});

// ── 후속 ① 1280 미만 Tab 순서 = 화면 순서(CTA → 다음 줄 순위 칩) ───────────────────────────────────────
const W_PEND = merge(hist(13), pend(1), { sessions: [], buyins: [], schedules: [schedRow(SID(90), MOCK_DAY, '오늘 메인 포스터')] });
test('① 1024 — CTA 다음 Tab 이 아래 줄 순위 칩(시각 순서와 같다)', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, 1024, 768, W_PEND);
  await page.goto('/');
  await openMyStore(page);
  await settledDash(page);
  const rank = dash(page).getByTestId('todo-rank');
  await expect(rank, '순위 칩(전제)').toBeVisible();
  const cta = dash(page).getByTestId('todo-cta');
  const [cb, rb] = [await cta.boundingBox(), await rank.boundingBox()];
  expect(rb!.y, '1024 에서 칩이 CTA 아래 줄이 아니다(전제)').toBeGreaterThanOrEqual(cb!.y + cb!.height - 1);
  await cta.focus();
  await page.keyboard.press('Tab');
  const inRank = await rank.evaluate((el) => el.contains(document.activeElement));
  expect(inRank, 'CTA 다음 Tab 이 순위 칩이 아니다(DOM 순서가 화면 순서와 거꾸로)').toBe(true);
});

// ── 후속 ② 라이브 위젯 높이 기억 — 오늘 적은 것만 예약 ───────────────────────────────────────────────
for (const [name, stored, expectRes] of [
  ['날짜 없는 옛 기억(어제 저장분)', '175', false],
  // 보조 — 기준 빌드도 이 형식을 못 읽어 통과한다(수정 판별력 없음, design-reviewer 2026-10-03). 판별은 위 '옛 기억'·아래 양성 대조가 한다.
  ['어제 날짜 기억(보조)', JSON.stringify({ h: 175, d: dayAgo(1) }), false],
  ['오늘 날짜 기억(양성 대조 — 검출기가 산다)', JSON.stringify({ h: 175, d: MOCK_DAY }), true],
] as const) {
  test(`② 1440 ${name} — ${expectRes ? '오늘 적은 높이는 확인 중에 예약한다' : '클락 꺼진 아침 첫 방문에 빈 위젯 자리를 잡지 않는다'}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(([k, v]) => {
      try { localStorage.setItem(k, v); } catch { /* noop */ }
      const w = window as unknown as { __res: number; __n: number }; w.__res = 0; w.__n = 0;
      const tick = () => { w.__n++; if (document.querySelector('[data-testid="live-reserve"]')) w.__res++; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }, [`nuri:dash-live-h:${MOCK_VENUE}`, stored] as [string, string]);
    await boot(page, 1440, 900, merge(hist(13), today([{ seq: 1, closed: true }])), { delay: 1500 });
    await page.goto('/');
    await openMyStore(page);
    await settledDash(page);
    const m = await page.evaluate(() => { const w = window as unknown as { __res: number; __n: number }; return { __res: w.__res, __n: w.__n }; });
    console.log(`[② ${name}] 예약 프레임 ${m.__res}/${m.__n}`);
    expect(m.__n, '프레임을 못 봤다 — 빈 검사').toBeGreaterThan(10);
    expect(m.__res > 0, '오늘 것이 아닌 높이로 자리를 잡았다').toBe(expectRes);
  });
}

// ── 후속 ③ 할 일이 '미수 회수'면 빨간 미수 배너를 숨긴다 · 1280 설명이 잘리지 않는다 ─────────────────────────
for (const W of [1280, 1440] as const) {
  test(`③ ${W} — 할 일 '미수 회수'일 때 미수 배너 없음${W === 1280 ? ' · 설명 한 줄 안에 다 보임' : ''}`, async ({ page }) => {
    test.setTimeout(90_000);
    await boot(page, W, 900, merge(hist(3), today([{ seq: 1, closed: true, unpaid: 80_000 }, { seq: 2, closed: true, unpaid: 30_000 }])));
    await page.goto('/');
    await openMyStore(page);
    await settledDash(page);
    await expect(dash(page).getByTestId('todo-cta')).toHaveText('미수 회수');
    await expect(dash(page).getByTestId('unpaid-cta'), '같은 미수를 배너가 한 번 더 말한다').toHaveCount(0);
    if (W === 1280) {
      const clip = await dash(page).getByTestId('todo-card').locator('p').nth(1).evaluate((p) => ({ sw: p.scrollWidth, cw: p.clientWidth, sh: p.scrollHeight, ch: p.clientHeight }));
      console.log(`[③ 1280] 설명 ${JSON.stringify(clip)}`);
      expect(clip.cw, '빈 검사').toBeGreaterThan(50);
      expect(clip.sh, '1280 에서 미수 설명이 잘린다').toBeLessThanOrEqual(clip.ch + 1);
    }
  });
}
test('③ 1440 양성 대조 — 할 일이 미수가 아니면(진행 중) 미수 배너는 그대로', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, 1440, 900, merge(hist(3), today([{ seq: 1, closed: false, unpaid: 20_000 }])));
  await page.goto('/');
  await openMyStore(page);
  await settledDash(page);
  await expect(dash(page).getByTestId('todo-cta')).not.toHaveText('미수 회수');
  await expect(dash(page).getByTestId('unpaid-cta')).toBeVisible();
});

// ── 후속 ④ '오늘 장부' 배지 — 하루 정산 판정(daySettled) ──────────────────────────────────────────────
for (const [name, games, badge] of [
  ['메인 마감 · 사이드 열림', [{ seq: 1, closed: true }, { seq: 2, closed: false }], '마감 · 열린 게임'],
  ['전부 마감 · 미수 남음', [{ seq: 1, closed: true, unpaid: 30_000 }], '마감 · 미수'],
  ['전부 마감 · 미수 0(양성)', [{ seq: 1, closed: true }], '정산 마감'],
] as const) {
  test(`④ 1440 ${name} — 배지 '${badge}'`, async ({ page }) => {
    test.setTimeout(90_000);
    await boot(page, 1440, 900, merge(hist(3), today(games.map((g) => ({ ...g })))));
    await page.goto('/');
    await openMyStore(page);
    await settledDash(page);
    const band = dash(page).locator('button', { hasText: '오늘 장부' }).first();
    await expect(band.locator('span > span').nth(1)).toHaveText(badge);
  });
}
