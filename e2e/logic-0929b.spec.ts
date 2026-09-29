// 2026-09-29 오너 결정 묶음 logic — #8(이용권 사용 요청을 애드온으로 승인) · #6(대시보드 이용권 전송 수 = 실제 전송 장수).
//   원천: docs/HANDOFF-2026-09-29-results.md §4 #6·#8. 서버 초안 supabase/migrations/20260929u_approve_voucher_addon.sql.
// 목킹 업주(운영 DB 쓰기 0 — 승인 RPC 는 이 스펙이 가로채 204 로 답하고 인자만 잰다).
// 음성 대조: 수정 전 빌드(871eb467)에서 🔴 두 건이 빨갛다(애드온 버튼 없음 · 전송 수가 장부 수기 칸 0 그대로).
// 실행: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/logic-0929b.spec.ts --project=mobile-chromium
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_DAY, MOCK_VENUE } from './_mockOwner';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const session = {
  venue_id: MOCK_VENUE, session_date: MOCK_DAY, game_seq: 1, buyin_amount: 100000, card_amount: null, game_type: 'gtd', target_entries: 0, max_entries: 0,
  is_addon: true, addon_stack: 30000, addon_amount: 50000, title: '데일리', discounts: [], early_double_min: 0, early_single_min: 0,
  reg_closed: false, closed: false, opened_at: `${MOCK_DAY}T09:00:00Z`, tournament_start: null, schedule_id: null, operators: [], voucher_issued: 0,
};
const request = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001', venue_id: MOCK_VENUE, session_date: MOCK_DAY, user_id: 'u1', player_name: '홍길동',
  note: '🎟 이용권 사용', status: 'pending', created_at: new Date().toISOString(), requested_game_seq: 1, voucher_id: 'bbbbbbbb-0000-4000-8000-000000000001',
};

async function boot(page: Page, sent?: { week: number; today: number }) {
  const approveBodies: Record<string, unknown>[] = [];
  const countRanges: string[] = [];
  await bootOwner(page, {
    viewport: { width: 1280, height: 800 },
    appSettings: { identity_voucher_enabled: 'on' },
    extra: async (p) => {
      await p.route(/\/rest\/v1\/ledger_sessions\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        const single = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
        return r.fulfill(json(single ? session : [session]));
      });
      await p.route(/\/rest\/v1\/ledger_buyin_requests\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json([request])) : r.fallback()));
      await p.route(/\/rest\/v1\/rpc\/approve_buyin_request/, async (r) => {
        approveBodies.push(JSON.parse(r.request().postData() ?? '{}'));
        await r.fulfill({ status: 204, body: '' });
      });
      if (sent) {
        await p.route(/\/rest\/v1\/store_vouchers\?/, (r) => {
          if (r.request().method() !== 'HEAD') return r.fallback();
          const u = decodeURIComponent(r.request().url());
          countRanges.push(u.slice(u.indexOf('?')));
          const today = u.includes(`created_at=gte.${MOCK_DAY}T00:00:00+09:00`);
          return r.fulfill({ status: 200, headers: { 'content-range': `*/${today ? sent.today : sent.week}`, 'access-control-expose-headers': 'content-range' }, body: '' });
        });
      }
    },
  });
  await openMyStore(page);
  return { approveBodies, countRanges };
}

test('🔴 #8 대시보드 — 애드온 게임의 이용권 요청은 [애드온]으로 승인하고, 서버에 용도 addon 을 보낸다', async ({ page }) => {
  test.setTimeout(90_000);
  const { approveBodies } = await boot(page);
  const btn = page.getByTestId('dash-approve-voucher-addon');
  await expect(btn, '애드온 승인 버튼이 없다 — 접수대가 용도를 고를 수 없다').toBeVisible({ timeout: 15_000 });
  await btn.click();
  await expect.poll(() => approveBodies.length).toBe(1);
  expect(approveBodies[0]).toMatchObject({ p_request_id: request.id, p_game_seq: 1, p_record_buyin: false, p_voucher_use: 'addon' });
});

test('#8 대시보드 — 기본 ✓ 승인은 옛 서명(용도 인자 없음) 그대로', async ({ page }) => {
  test.setTimeout(90_000);
  const { approveBodies } = await boot(page);
  await page.getByRole('button', { name: '승인', exact: true }).first().click();
  await expect.poll(() => approveBodies.length).toBe(1);
  expect(approveBodies[0]).not.toHaveProperty('p_voucher_use');
});

test('🔴 #6 대시보드 이용권 카드 — 7일·오늘 전송 = store_vouchers 개수(전송 취소 제외), 장부 수기 칸이 아니다', async ({ page }) => {
  test.setTimeout(90_000);
  const { countRanges } = await boot(page, { week: 12, today: 3 });
  const card = page.locator('section').filter({ has: page.getByRole('button', { name: /^매장이용권/ }) }).first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);   // CountUp 정착
  const nums = await card.locator('p.font-extrabold .text-lg').allInnerTexts();
  expect(nums.length, '이용권 카드 숫자 칸을 못 찾았다').toBe(4);
  expect([nums[0], nums[1]], '전송 칸이 store_vouchers 개수가 아니다(장부 수기 칸 voucher_issued=0 을 본다)').toEqual(['12', '3']);
  expect(countRanges.length, '개수 조회가 한 번도 안 나갔다').toBeGreaterThan(0);
  expect(countRanges.every((q) => q.includes('status=neq.revoked')), '전송 취소분을 세고 있다').toBe(true);
});
