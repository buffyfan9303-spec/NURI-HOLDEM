// R3-02 (audit3-regress-connect-1004) — 대시보드에서 이용권을 보내고 모달을 닫아도 '매장이용권' 카드의 7일·오늘 전송 수가 그대로였다.
//   원인: 숫자는 reloadRange 안에서만 갱신되는데, 모달 onClose 도 realtime 구독 묶음도 reloadRange 를 부르지 않았다.
// 목킹 업주(운영 DB 쓰기 0 — store_vouchers 는 HEAD 개수·GET 목록만 가로챈다). 서버 개수를 바꿔 '모달 안에서 1장 보낸 것'과 같은 상태를 만든다.
// 음성 대조: 수정 전 빌드에서 닫은 뒤 ['12','3'] 그대로(재조회 0건) → 이 스펙 FAIL. 수정 후 ['13','4'].
// 실행: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/store-dashboard-voucher-refresh.spec.ts --project=mobile-chromium
import { test, expect } from './_fixtures';
import { bootOwner, openMyStore, MOCK_DAY } from './_mockOwner';

test('🔴 R3-02 대시보드 — 이용권 모달을 닫으면 매장이용권 카드의 7일·오늘 전송 수가 다시 읽힌다', async ({ page }) => {
  test.setTimeout(90_000);
  const server = { week: 12, today: 3 };
  let heads = 0;
  await bootOwner(page, {
    viewport: { width: 1440, height: 900 },
    appSettings: { identity_voucher_enabled: 'on' },   // 이용권 카드 노출 스위치(logic-0929b 와 같은 조리법)
    extra: async (p) => {
      await p.route(/\/rest\/v1\/store_vouchers\?/, (r) => {
        const m = r.request().method();
        if (m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        if (m !== 'HEAD') return r.fallback();
        heads += 1;
        const u = decodeURIComponent(r.request().url());
        const today = u.includes(`created_at=gte.${MOCK_DAY}T00:00:00+09:00`);
        return r.fulfill({ status: 200, headers: { 'content-range': `*/${today ? server.today : server.week}`, 'access-control-expose-headers': 'content-range' }, body: '' });
      });
    },
  });
  await openMyStore(page);
  const open = page.getByRole('button', { name: /^매장이용권/ });
  const card = page.locator('section').filter({ has: open }).first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  const nums = async () => (await card.locator('p.font-extrabold .text-lg').allInnerTexts()).slice(0, 2);
  await expect.poll(nums, { timeout: 10_000, message: '처음 값이 서버 개수(12·3)가 아니다' }).toEqual(['12', '3']);

  await open.first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.first(), '이용권 모달이 열리지 않았다').toBeVisible({ timeout: 10_000 });
  server.week = 13; server.today = 4;   // 모달 안에서 1장 보낸 것과 같은 서버 상태
  const before = heads;
  await page.keyboard.press('Escape');
  await expect(dialog.first()).toBeHidden({ timeout: 10_000 });

  await expect.poll(nums, { timeout: 10_000, message: '모달을 닫았는데 카드 숫자가 그대로다(재조회 0건)' }).toEqual(['13', '4']);
  expect(heads, '모달을 닫은 뒤 개수 재조회가 나가지 않았다').toBeGreaterThan(before);
});
