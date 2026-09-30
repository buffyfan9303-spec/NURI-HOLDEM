// 20260930i — 이용권이 모자라면 거절 대신 '이용권 k장 + 남은 금액 결제 방법' 을 골라 승인한다(오너 결정 2026-09-30).
//   서버 초안 supabase/migrations/20260930i_voucher_discount_addon_bundle.sql — 모자라면 23514 + hint VOUCHER_SHORT + detail(서버 계산).
// 목킹 업주(운영 DB 쓰기 0 — 승인 RPC 는 이 스펙이 가로챈다: 첫 호출 = 모자람 오류, 두 번째 = 204).
// 확인: ① 접수대 대기 카드가 이 손님의 이용권 장수를 말한다 ② 모자람 오류에 '남은 3만' 결제 선택이 열린다
//       ③ [현금]을 누르면 recordBuyin=true · 방법 cash 로 다시 승인한다(금액은 보내지 않는다 — 서버가 정한다).
// 실행: E2E_BASE_URL=<preview> npx playwright test e2e/voucher-short-split.spec.ts --project=mobile-chromium
import { test, expect } from './_fixtures';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

const RAIL = '[data-mystore-rail]';
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const SESSION = {
  venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, buyin_amount: 100_000, card_amount: null, game_type: 'gtd',
  target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, title: '데일리 메인', discounts: [],
  early_double_min: 0, early_single_min: 0, reg_closed: false, closed: false,
  opened_at: `${MOCK_DAY}T10:00:00Z`, tournament_start: null, schedule_id: null, operators: [],
};
const req = (i: number) => ({
  id: `aaaaaaaa-0000-4000-8000-00000000000${i}`, venue_id: MOCK_VENUE, session_date: MOCK_DAY, user_id: 'u1', player_name: '홍길동',
  note: '이용권 사용', status: 'pending', created_at: new Date(Date.now() - (10 - i) * 1000).toISOString(), requested_game_seq: 1,
  voucher_id: `bbbbbbbb-0000-4000-8000-00000000000${i}`,
});
const REQS = [1, 2, 3, 4, 5, 6, 7].map(req);

test('🔴 이용권 7장 · 10장 게임 — 모자람이면 남은 3만 결제 방법을 골라 승인한다', async ({ page }) => {
  test.setTimeout(90_000);
  const bodies: Record<string, unknown>[] = [];
  let pending = REQS;
  await bootOwner(page, {
    viewport: { width: 1280, height: 900 }, appSettings: { identity_voucher_enabled: 'on' },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/ledger_sessions\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
        return r.fulfill(json(single ? SESSION : [SESSION]));
      });
      await p.route(/\/rest\/v1\/ledger_players\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json([])) : r.fallback()));
      await p.route(/\/rest\/v1\/store_vouchers\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json([])) : r.fallback()));
      await p.route(/\/rest\/v1\/ledger_buyin_requests\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(pending)) : r.fallback()));
      await p.route(/\/rest\/v1\/rpc\/approve_buyin_request/, async (r) => {
        const b = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
        bodies.push(b);
        if (b.p_record_buyin !== true) {
          return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({
            code: '23514', hint: 'VOUCHER_SHORT',
            message: '이용권이 모자랍니다 — 이 바인은 이용권 10장인데 받은 사용 요청은 7장입니다. 이용권 7장(70000원)에 남은 30000원을 현금·카드·계좌·미수로 받아 승인할 수 있습니다',
            details: JSON.stringify({ need: 10, have: 7, ticketWon: 70000, remainder: 30000, use: 'buyin' }),
          }) });
        }
        pending = [];
        return r.fulfill({ status: 204, body: '' });
      });
    },
  });
  await openMyStore(page);
  await expect(page.locator(RAIL), '내 매장을 못 열었다').toBeVisible({ timeout: 20_000 });
  await page.locator(`${RAIL} [role=tab]`).filter({ hasText: '장부' }).first().click();
  await expect(page.locator('[data-testid="ledger-date"]'), '장부 보드가 안 열렸다').toHaveCount(1, { timeout: 20_000 });

  const count = page.getByTestId('voucher-pending-count').first();
  await expect(count, '대기 카드가 이 손님의 이용권 장수를 말하지 않는다').toContainText('이용권 7장 사용 대기', { timeout: 15_000 });

  await page.getByRole('button', { name: '✓ 승인·티켓' }).first().click();
  const panel = page.getByTestId('voucher-short-pay');
  await expect(panel, '모자람 오류에 남은 금액 결제 선택이 안 열렸다').toBeVisible({ timeout: 10_000 });
  await expect(panel).toContainText('10장 중 7장(70,000원)');
  await expect(panel).toContainText('30,000원');
  // 캡처는 카드를 화면 가운데로 올리고(아래 고정 정산 바·토스트에 가리지 않게) 찍는다.
  const card = panel.locator('xpath=ancestor::li[1]');
  await card.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await expect(page.getByRole('status').filter({ hasText: '이용권이 모자랍니다' })).toHaveCount(0, { timeout: 10_000 }).catch(() => {});
  await card.screenshot({ path: test.info().outputPath('voucher-short-card.png') });
  // 남은 금액 버튼이 다른 것에 가리지 않는다(가운데 점이 버튼 자신).
  const hit = await page.getByTestId('voucher-short-cash').evaluate((el) => {
    const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!t && (t === el || el.contains(t));
  });
  expect(hit, '[현금] 버튼이 다른 요소에 가려 있다').toBe(true);

  await page.getByTestId('voucher-short-cash').click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[0]).toMatchObject({ p_request_id: REQS[0].id, p_record_buyin: false });
  expect(bodies[1]).toMatchObject({ p_request_id: REQS[0].id, p_game_seq: 1, p_record_buyin: true, p_pay_method: 'cash', p_split: false });
  expect(bodies[1]).not.toHaveProperty('p_voucher_use');   // 바인 용도 = 옛 서명 그대로
  await expect(panel).toHaveCount(0);
});
