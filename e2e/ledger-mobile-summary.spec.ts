// 1d(오너 2026-10-02) — 모바일(<768) 장부는 진입하면 **요약**이 기본이다. '편집' 을 누르면 지금의 체크 화면(기능 소실 0).
//
// 잠그는 것:
//   ① 390 진입 — 요약(게임 합계 + 손님별 한 줄)이 보이고 바인 표는 없다. PC(1280)는 종전대로 표.
//   ② 숫자 정합 — 요약 합계 = 장부 정산바 합계 = 정산 판 합계(바인 횟수·완납 매출·미수). 별도 계산이 아니라 같은 함수를 쓴다.
//      손님 줄의 금액·미수는 표의 '총바인·미수' 열과 같다.
//   ③ '편집' → 표(체크 화면) · '요약 보기' → 요약. 손님 줄을 누르면 그 손님만 걸러 편집으로.
//   ④(검토 2b) 메인+사이드 날 — 요약 = **이 게임** 합(머리에 '이 게임 · 메인'), 정산 판 = **하루** 합. 둘이 다름을 명시 단언.
//   ⑤(검토 2c) 정산 제외(관계자)를 켜면 머리 라벨이 '바인(제외 적용)' 이고 머리 = Σ손님 줄(바인 횟수·미수).
//   ⑥(검토 3d) 마감 장부도 390 에서 [표 보기]로 같은 표를 읽기 전용으로 — 쓰기 요청 0. 손님 줄도 눌려 그 손님만 거른다.
//   ⑦(검토 3c) 장부 목록 휴지통 — 터치 기기(Pixel 7 프로젝트: hover 없음)는 1366 에서도 보이고, 마우스 기기는 행 호버 때만.
// 전부 목킹(운영 쓰기 0).
import { test, expect } from './_fixtures';
import { READ_ONLY_RPCS } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const single = (r: Route) => (r.request().headers()['accept'] ?? '').includes('pgrst.object');
const RAIL = '[data-mystore-rail]';
const SESSION = {
  venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, buyin_amount: 100_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, title: '데일리 메인', discounts: [],
  early_double_min: 0, early_single_min: 0, reg_closed: false, closed: false,
  opened_at: `${MOCK_DAY}T10:00:00+09:00`, operators: [], schedule_id: null, tournament_start: null,
};
const buyin = (i: number, name: string, entry: number, over: Record<string, unknown> = {}) => ({
  id: `cccccccc-0000-4000-8000-${String(i).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, player_name: name, entry_no: entry,
  payment_method: 'cash', is_unpaid: false, buyin_at: `${MOCK_DAY}T12:0${i}:00+09:00`, is_split: false,
  cash_amount: 100_000, card_amount: 0, transfer_amount: 0, ticket_count: 0, unpaid_amount: 0, discount_level: 0, discount_index: 0, early_override: null,
  ...over,
});
// 김철수 2회(현금·현금) · 이영희 1회 미수 · 박민수 1회 카드
const BUYINS = [
  buyin(1, '김철수', 1), buyin(2, '김철수', 2),
  buyin(3, '이영희', 1, { is_unpaid: true }),
  buyin(4, '박민수', 1, { payment_method: 'card', cash_amount: 0, card_amount: 100_000 }),
];
const PLAYERS = ['김철수', '이영희', '박민수'].map((n, i) => ({ id: `dddddddd-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, name: n, visitor_type: 'regular', note: null, sort_order: i }));

type Row = { game_seq: number };
/** game_seq=eq.N 이 붙은 조회(그 게임 장부)는 그 게임 행만, 없는 조회(정산 판의 하루 범위·게임 목록)는 전부 */
const bySeq = <T extends Row>(url: string, rows: T[]) => { const m = /game_seq=eq\.(\d+)/.exec(url); return m ? rows.filter((x) => x.game_seq === Number(m[1])) : rows; };
type Fx = { sessions: (typeof SESSION)[]; buyins: ReturnType<typeof buyin>[]; players: (typeof PLAYERS)[number][] };
const FX: Fx = { sessions: [SESSION], buyins: BUYINS, players: PLAYERS };

async function open(page: Page, w: number, h: number, fx: Fx = FX) {
  await bootOwner(page, {
    viewport: { width: w, height: h },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
      await p.route(/\/rest\/v1\/ledger_sessions\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const rows = bySeq(r.request().url(), fx.sessions);
        return r.fulfill(json(single(r) ? (rows[0] ?? null) : rows));
      });
      await p.route(/\/rest\/v1\/ledger_buyins\?/, (r) => (r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(bySeq(r.request().url(), fx.buyins)))));
      await p.route(/\/rest\/v1\/ledger_players\?/, (r) => (r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(bySeq(r.request().url(), fx.players)))));
    },
  });
  await openMyStore(page);
  await expect(page.locator(RAIL), '내 매장을 못 열었다').toBeVisible({ timeout: 20_000 });
  await page.locator(`${RAIL} [role=tab]`).filter({ hasText: '장부' }).first().evaluate((b) => (b as HTMLElement).click());
  await expect(page.locator('[data-testid="ledger-date"]').first(), '장부 보드가 안 열렸다').toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800);
}

const tableVisible = (page: Page) => page.evaluate(() => [...document.querySelectorAll('[data-pane="ledger"] table')].some((t) => t.getClientRects().length > 0));
const barValue = (page: Page, label: string) => page.evaluate((l) => {
  const bar = document.querySelector('[data-ledger-settlebar]');
  const p = bar && [...bar.querySelectorAll('p')].find((x) => x.textContent?.trim() === l && x.getClientRects().length);
  return p?.nextElementSibling?.textContent?.trim() ?? null;
}, label);

test('390 — ① 요약이 기본 · ② 요약 = 정산바 = 정산 판 · ③ 편집↔요약 · 손님 줄 → 그 손님 편집', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, 390, 844);
  const sum = page.locator('[data-ledger-summary]');
  await expect(sum, '모바일 장부 진입이 요약이 아니다').toBeVisible();
  expect(await tableVisible(page), '요약 화면인데 바인 표가 보인다').toBe(false);

  // ② 요약 합계
  const S = { buyins: await sum.locator('[data-sum="buyins"]').textContent(), revenue: await sum.locator('[data-sum="revenue"]').textContent(), unpaid: await sum.locator('[data-sum="unpaid"]').textContent() };
  const B = { buyins: await barValue(page, '총 바인'), revenue: await barValue(page, '완납 매출'), unpaid: await barValue(page, '미수금') };
  console.log('[요약]', JSON.stringify(S), '[정산바]', JSON.stringify(B));
  expect(S, '요약 합계가 기대값(4회 · 30만 · 10만)이 아니다').toEqual({ buyins: '4회', revenue: '30만', unpaid: '10만' });
  expect(S, '요약 합계 ≠ 장부 정산바 합계').toEqual(B);
  // 손님 줄 = 표 열과 같은 계산(김철수 20만 · 이영희 미수 10만)
  await expect(sum.getByRole('button', { name: /김철수.*바인 2회.*20만/ })).toBeVisible();
  await expect(sum.getByRole('button', { name: /이영희.*바인 1회.*10만.*미수 10만/ })).toBeVisible();

  // ③ 편집 ↔ 요약
  await page.getByTestId('ledger-edit-mode').evaluate((b) => (b as HTMLElement).click());
  await expect.poll(() => tableVisible(page), { message: '편집을 눌렀는데 바인 표가 안 열렸다' }).toBe(true);
  await expect(sum).toHaveCount(0);
  await page.getByTestId('ledger-summary-mode').evaluate((b) => (b as HTMLElement).click());
  await expect(page.locator('[data-ledger-summary]')).toBeVisible();
  // 손님 줄 → 그 손님만 걸러 편집
  await page.locator('[data-ledger-summary]').getByRole('button', { name: /이영희/ }).evaluate((b) => (b as HTMLElement).click());
  await expect.poll(() => tableVisible(page)).toBe(true);
  await expect(page.locator('[data-pane="ledger"] input[placeholder="플레이어 검색"]')).toHaveValue('이영희');
  await expect(page.locator('[data-pane="ledger"] table tbody tr'), '그 손님만 걸러지지 않았다').toHaveCount(1);

  // ② 정산 판 합계(그날 = 이 게임 하나)
  await page.locator(`${RAIL} [role=tab]`).filter({ hasText: '정산' }).first().evaluate((b) => (b as HTMLElement).click());
  await expect(page.getByTestId('kpi-revenue')).toBeVisible({ timeout: 15_000 });
  const K = await page.evaluate(() => Object.fromEntries(['kpi-buyins', 'kpi-revenue', 'kpi-unpaid'].map((id) => [id, document.querySelector(`[data-testid="${id}"]`)?.nextElementSibling?.textContent?.trim() ?? null])));
  console.log('[정산 판]', JSON.stringify(K));
  expect({ buyins: K['kpi-buyins'], revenue: K['kpi-revenue'], unpaid: K['kpi-unpaid'] }, '요약 합계 ≠ 정산 판 합계').toEqual(S);

  // 장부로 다시 들어오면 요약부터
  await page.locator(`${RAIL} [role=tab]`).filter({ hasText: '장부' }).first().evaluate((b) => (b as HTMLElement).click());
  await expect(page.locator('[data-ledger-summary]'), '다시 들어왔는데 요약이 아니다').toBeVisible({ timeout: 10_000 });
});

test('1280 — PC 는 종전대로 표가 바로 보이고 요약은 없다', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, 1280, 900);
  expect(await tableVisible(page), 'PC 장부에 표가 없다').toBe(true);
  await expect(page.locator('[data-ledger-summary]')).toHaveCount(0);
});

const kpis = (page: Page) => page.evaluate(() => {
  const v = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.nextElementSibling?.textContent?.trim() ?? null;
  return { buyins: v('kpi-buyins'), revenue: v('kpi-revenue'), unpaid: v('kpi-unpaid') };
});
const headOf = async (page: Page) => {
  const sum = page.locator('[data-ledger-summary]');
  return { buyins: await sum.locator('[data-sum="buyins"]').textContent(), revenue: await sum.locator('[data-sum="revenue"]').textContent(), unpaid: await sum.locator('[data-sum="unpaid"]').textContent() };
};

test('390 · 메인+사이드 날 — ④ 요약 = 이 게임(메인) 합 · 정산 판 = 하루 합(다르다)', async ({ page }) => {
  test.setTimeout(120_000);
  const side = { ...SESSION, game_seq: 2, title: '데일리 사이드' };
  const fx: Fx = {
    sessions: [SESSION, side],
    buyins: [...BUYINS, buyin(5, '최지훈', 1, { game_seq: 2 })],
    players: [...PLAYERS, { ...PLAYERS[0], id: 'dddddddd-0000-4000-8000-000000000009', game_seq: 2, name: '최지훈' }],
  };
  await open(page, 390, 844, fx);
  const sum = page.locator('[data-ledger-summary]');
  await expect(sum).toBeVisible();
  await expect(sum.locator('[data-sum="scope"]'), '요약이 어느 게임의 합인지 밝히지 않는다').toHaveText(/이 게임 · 메인/);
  const S = await headOf(page);
  expect(S, '요약 = 메인 게임 합(4회 · 30만 · 10만)').toEqual({ buyins: '4회', revenue: '30만', unpaid: '10만' });
  expect(S, '요약 ≠ 장부 정산바(같은 게임)').toEqual({ buyins: await barValue(page, '총 바인'), revenue: await barValue(page, '완납 매출'), unpaid: await barValue(page, '미수금') });

  await page.locator(`${RAIL} [role=tab]`).filter({ hasText: '정산' }).first().evaluate((b) => (b as HTMLElement).click());
  await expect(page.getByTestId('kpi-revenue')).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => kpis(page), { message: '정산 판 = 그날 전 게임 합(메인 4 + 사이드 1 → 5회 · 40만 · 10만)', timeout: 10_000 })
    .toEqual({ buyins: '5회', revenue: '40만', unpaid: '10만' });
  expect((await kpis(page)).buyins, '이 날은 요약(게임)과 정산 판(하루)이 달라야 한다').not.toBe(S.buyins);
});

test('390 · 정산 제외(관계자) — ⑤ 머리 라벨 (제외 적용) · 머리 = Σ손님 줄(바인 횟수·미수)', async ({ page }) => {
  test.setTimeout(120_000);
  // 이영희(미수 1건)를 관계자로 — 관계자를 빼면 머리는 3회 · 미수 0 이어야 하고 손님 줄도 같은 규칙이어야 한다.
  const fx: Fx = { ...FX, players: PLAYERS.map((p) => (p.name === '이영희' ? { ...p, visitor_type: 'staff' } : p)) };
  await open(page, 390, 844, fx);
  const sum = page.locator('[data-ledger-summary]');
  await expect(sum).toBeVisible();
  const bar = page.locator('[data-ledger-settlebar]');
  await bar.locator('button[aria-expanded]').filter({ hasText: '정산 제외' }).first().evaluate((b) => (b as HTMLElement).click());
  await bar.locator('button[aria-pressed]').filter({ hasText: /^관계자 1$/ }).first().evaluate((b) => (b as HTMLElement).click());
  await expect(bar.locator('button[aria-pressed="true"]').filter({ hasText: /^관계자/ }), '관계자 제외가 켜지지 않았다').toHaveCount(1);

  await expect(sum.locator('dt').first(), '제외가 켜졌는데 머리 라벨에 (제외 적용) 표시가 없다').toHaveText('바인(제외 적용)');
  await expect(sum.locator('[data-sum="buyins"]')).toHaveText('3회');
  const rows = await sum.locator('[data-sum-row]').evaluateAll((els) => els.map((e) => {
    const t = e.textContent ?? '';
    return { count: Number(/바인 (\d+)회/.exec(t)?.[1] ?? NaN), unpaid: Number(/미수 ([\d.]+)만/.exec(t)?.[1] ?? 0) };
  }));
  console.log('[손님 줄]', JSON.stringify(rows), '[머리]', JSON.stringify(await headOf(page)));
  expect(rows.length, '손님 줄을 못 읽었다 — 빈 검사').toBe(3);
  const head = await headOf(page);
  expect(rows.reduce((a, r) => a + r.count, 0), '머리 바인 ≠ Σ손님 바인 n회').toBe(Number(head.buyins!.replace(/[^\d]/g, '')));
  expect(rows.reduce((a, r) => a + r.unpaid, 0), '머리 미수 ≠ Σ손님 미수').toBe(Number(head.unpaid!.replace(/만$/, '')));
});

test('390 · 마감 장부 — ⑥ [표 보기]로 같은 표를 읽기 전용으로(쓰기 0) · 손님 줄도 눌린다', async ({ page }) => {
  test.setTimeout(120_000);
  const writes: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!/\/rest\/v1\//.test(u) || ['GET', 'HEAD', 'OPTIONS'].includes(r.method())) return;
    const rpc = /\/rpc\/(\w+)/.exec(u)?.[1];
    if (rpc && READ_ONLY_RPCS.has(rpc)) return;
    writes.push(`${r.method()} ${u.replace(/\?.*$/, '')}`);
  });
  const closedAt = `${MOCK_DAY}T22:00:00+09:00`;
  await open(page, 390, 844, { ...FX, sessions: [{ ...SESSION, closed: true, closed_at: closedAt } as typeof SESSION] });
  const sum = page.locator('[data-ledger-summary]');
  await expect(sum).toBeVisible();
  await expect(page.getByTestId('ledger-edit-mode'), '마감 장부에 편집 버튼이 있다').toHaveCount(0);
  const view = page.getByTestId('ledger-table-view');
  await expect(view, '마감 장부에 [표 보기]가 없다 — 모바일에서 표를 볼 길이 없다(기능 소실)').toBeVisible();
  const before = writes.length;
  await view.evaluate((b) => (b as HTMLElement).click());
  await expect.poll(() => tableVisible(page), { message: '[표 보기]를 눌렀는데 표가 안 열렸다' }).toBe(true);
  await expect(page.locator('[data-pane="ledger"] table tbody tr')).toHaveCount(3);
  // 읽기 전용 — 바인 칸은 눌리지 않고, 검색·추가 줄이 없다
  const cellsEnabled = await page.locator('[data-pane="ledger"] table tbody td button:not([disabled])').count();
  expect(cellsEnabled, '마감 표에 눌리는 칸이 있다(읽기 전용이 아니다)').toBe(0);
  await expect(page.locator('[data-pane="ledger"] input[placeholder="플레이어 검색"]')).toHaveCount(0);
  await expect(page.getByText('마감됨 (읽기전용)').first(), '마감 상태가 풀렸다').toBeVisible();

  // 요약으로 → 손님 줄(이영희) → 그 손님만, 읽기 전용 필터 표시 → [전체]
  await page.getByTestId('ledger-summary-mode').evaluate((b) => (b as HTMLElement).click());
  const row = page.locator('[data-ledger-summary] [data-sum-row="이영희"]');
  await expect(row, '마감 장부의 손님 줄이 눌리지 않는다').toBeEnabled();
  await row.evaluate((b) => (b as HTMLElement).click());
  await expect.poll(() => tableVisible(page)).toBe(true);
  await expect(page.locator('[data-pane="ledger"] table tbody tr'), '그 손님만 걸러지지 않았다').toHaveCount(1);
  await expect(page.getByTestId('ledger-readonly-filter')).toContainText('이영희');
  await page.getByTestId('ledger-readonly-filter').getByRole('button', { name: '전체' }).evaluate((b) => (b as HTMLElement).click());
  await expect(page.locator('[data-pane="ledger"] table tbody tr')).toHaveCount(3);
  await page.waitForTimeout(500);
  expect(writes.slice(before), '표 보기 동안 쓰기 요청이 나갔다(상태 변경)').toEqual([]);
});

// ⑦ 휴지통 — 이 프로젝트(Pixel 7)는 터치 기기(hover 없음 · pointer coarse)다. 1366 폭(iPad 가로급)에서도 보여야 한다.
const trashOpacity = async (page: Page) => {
  // 머리줄은 PC 에서 셸 칩 줄 자리로 portal 된다 — 판 밖에 있다
  await page.locator('[data-tab="my-store"] button[aria-label="목록으로"]:visible').first().evaluate((b) => (b as HTMLElement).click());
  const trash = page.getByRole('button', { name: `${MOCK_DAY} 메인 장부 삭제` });
  await expect(trash, '장부 목록에 휴지통이 없다').toHaveCount(1, { timeout: 15_000 });
  await page.waitForTimeout(400);
  return { trash, opacity: Number(await trash.evaluate((e) => getComputedStyle(e).opacity)) };
};
test('1366 터치 — ⑦ 장부 목록 휴지통이 hover 없이도 보인다', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, 1366, 1024);
  expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches), '이 검사는 터치 기기 조건이어야 한다').toBe(false);
  const { opacity } = await trashOpacity(page);
  expect(opacity, '터치 태블릿에서 휴지통이 안 보인다(opacity 0)').toBe(1);
});
test.describe('마우스 기기', () => {
  test.use({ isMobile: false, hasTouch: false });
  test('1366 마우스 — ⑦ 휴지통은 행 호버 때만(종전 L-9 유지)', async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, 1366, 1024);
    expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches), '이 검사는 마우스 기기 조건이어야 한다').toBe(true);
    const { trash, opacity } = await trashOpacity(page);
    expect(opacity, '마우스 기기에서 휴지통이 행 호버 없이 보인다').toBe(0);
    await trash.locator('xpath=ancestor::*[contains(@class,"group/row")][1]').hover();
    await expect.poll(() => trash.evaluate((e) => Number(getComputedStyle(e).opacity)), { message: '행 호버에 휴지통이 안 나타난다' }).toBe(1);
  });
});
