// 1d(오너 2026-10-02) — 모바일(<768) 장부는 진입하면 **요약**이 기본이다. '편집' 을 누르면 지금의 체크 화면(기능 소실 0).
//
// 잠그는 것:
//   ① 390 진입 — 요약(게임 합계 + 손님별 한 줄)이 보이고 바인 표는 없다. PC(1280)는 종전대로 표.
//   ② 숫자 정합 — 요약 합계 = 장부 정산바 합계 = 정산 판 합계(바인 횟수·완납 매출·미수). 별도 계산이 아니라 같은 함수를 쓴다.
//      손님 줄의 금액·미수는 표의 '총바인·미수' 열과 같다.
//   ③ '편집' → 표(체크 화면) · '요약 보기' → 요약. 손님 줄을 누르면 그 손님만 걸러 편집으로.
// 전부 목킹(운영 쓰기 0).
import { test, expect } from './_fixtures';
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

async function open(page: Page, w: number, h: number) {
  await bootOwner(page, {
    viewport: { width: w, height: h },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/rpc\/ledger_business_date/, (r) => r.fulfill(json(MOCK_DAY)));
      await p.route(/\/rest\/v1\/ledger_sessions\?/, (r) => (r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(single(r) ? SESSION : [SESSION]))));
      await p.route(/\/rest\/v1\/ledger_buyins\?/, (r) => (r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(BUYINS))));
      await p.route(/\/rest\/v1\/ledger_players\?/, (r) => (r.request().method() !== 'GET' ? r.fallback() : r.fulfill(json(PLAYERS))));
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
