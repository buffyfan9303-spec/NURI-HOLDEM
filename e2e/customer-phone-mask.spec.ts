// CUSTOMER-PHONE-MASK(오너 2026-09-25) — 이용권 받는 사람 검색 결과 줄에 서버가 준 phone_masked 가 보인다.
//   서버(20260925h search_voucher_recipients)가 내 매장 손님 행에만 '010-****-5678' 을 싣고 그 밖은 null 이다.
//   화면 계약: 값이 있으면 이름 옆에 작게, null 이면 **요소 자체가 없다**(자리도 차지하지 않는다). 겹침·잘림 없음.
// ⚠ RPC 는 목킹이다 — 서버 범위 규칙(누가 null 인가)은 이 스펙이 재지 않는다(마이그레이션 자가검사·리허설 38건이 정본).
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { bootOwner, openMyStore } from './_mockOwner';

const IDENTITY_ON = { identity_voucher_enabled: 'on' };
const RAIL = '[data-mystore-rail]';
const ROWS = [
  { user_id: '11111111-1111-4111-8111-111111111111', nickname: '길동이', real_name: null, verified: true, matched: 'partial', phone_masked: '010-****-5678' },
  // 내 매장 손님이 아닌 회원 — 서버가 null 을 준다. 화면은 아무것도 그리지 않아야 한다.
  { user_id: '22222222-2222-4222-8222-222222222222', nickname: '길동이형아주긴닉네임열자넘김테스트', real_name: null, verified: true, matched: 'partial', phone_masked: null },
];
const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function openVoucherPane(page: Page) {
  await openMyStore(page);
  await expect(page.locator('[data-tab="my-store"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(RAIL)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  const visible = page.locator(`${RAIL} button`).filter({ hasText: '이용권' }).filter({ visible: true });
  expect(await visible.count(), '이용권 진입점이 정확히 하나여야 한다').toBe(1);
  await visible.first().click();
  await page.waitForTimeout(2000);
}

for (const width of [360, 390, 1280]) {
  test(`🔴 ${width}px — 후보 줄에 가린 번호가 보이고(1건), null 행은 요소가 없다, 겹침·잘림 없음`, async ({ page }) => {
    test.setTimeout(120_000);
    await bootOwner(page, {
      viewport: { width, height: 900 }, appSettings: IDENTITY_ON,
      extra: async (p) => {
        await p.route(/\/rest\/v1\/rpc\/search_voucher_recipients/, (r) => r.fulfill(json(ROWS)));
        await p.route(/\/rest\/v1\/store_vouchers\?/, (r) => r.fulfill(json([])));
      },
    });
    await openVoucherPane(page);
    await expect(page.getByTestId('voucher-issue')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('voucher-recv-by-name').click();
    const input = page.getByPlaceholder(/닉네임·실명 입력/);
    await input.fill('길동');
    const options = page.getByRole('option');
    await expect(options).toHaveCount(2, { timeout: 15_000 });
    const phones = page.getByTestId('cand-phone');
    await expect(phones).toHaveCount(1);
    await expect(phones.first()).toHaveText('010-****-5678');
    // null 행: 요소 0 — 빈 span 이 자리를 차지하지 않는다
    expect(await options.nth(1).getByTestId('cand-phone').count()).toBe(0);
    // 겹침·잘림: 이름 span 오른쪽 ≤ 번호 span 왼쪽, 번호 span 은 스크롤 폭 == 보이는 폭
    const m = await options.first().evaluate((li) => {
      const name = li.querySelector('span.truncate') as HTMLElement;
      const ph = li.querySelector('[data-testid="cand-phone"]') as HTMLElement;
      const a = name.getBoundingClientRect(), b = ph.getBoundingClientRect();
      const liR = li.getBoundingClientRect();
      return { nameRight: a.right, phoneLeft: b.left, phoneRight: b.right, liRight: liR.right, clipped: ph.scrollWidth > ph.clientWidth + 1, phW: b.width };
    });
    expect(m.phW, '번호 span 폭 0 — 그려지지 않았다').toBeGreaterThan(40);
    expect(m.nameRight, `이름이 번호 위로 겹친다: ${JSON.stringify(m)}`).toBeLessThanOrEqual(m.phoneLeft + 0.5);
    expect(m.phoneRight, `번호가 행 밖으로 나간다: ${JSON.stringify(m)}`).toBeLessThanOrEqual(m.liRight + 0.5);
    expect(m.clipped, '번호 글자가 잘렸다').toBe(false);
    await page.screenshot({ path: `${process.env.PM2_SHOT_DIR ?? 'test-results'}/phone-mask-${width}.png` });
  });
}
