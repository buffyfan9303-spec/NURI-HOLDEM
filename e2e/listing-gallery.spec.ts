// UP-03 장터 상세 사진 여러 장 — 넘기기·키보드·확대가 되고, 넘기는 동안 상세 배치(bbox)가 1px 도 안 움직인다.
// 근거: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\audit12\triage-user.md UP-03.
// 실행: E2E_BASE_URL=http://localhost:<port> npx playwright test e2e/listing-gallery.spec.ts --project=mobile-chromium
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays } from './_session';

const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const svg = (c: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${c}"/></svg>`)}`;
const row = {
  id: '11111111-1111-4111-8111-111111111201', title: '갤러리 매물', category: 'pokerGear', description: 't', price: 10_000, condition: 'B',
  status: 'on_sale', images: [svg('#c33'), svg('#3c3'), svg('#33c')], region: '서울', shipping_available: false, pickup_only: true,
  seller_id: '00000000-0000-4000-8000-0000000000e9', seller_name: '판매자', seller_avatar_color: '#5A6175', seller_trade_count: 0,
  seller_verified: false, created_at: new Date().toISOString(), view_count: 0, like_count: 0, comment_count: 0,
};

test('장터 상세 — 3장 넘기기·키보드·확대, 배치 고정', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/\/rest\/v1\/marketplace_listings\?/, (r) => r.fulfill(json([row])));
  await stabilizeBackstack(page);
  await page.goto('/');
  await dismissOverlays(page);
  await page.getByRole('button', { name: '커뮤니티', exact: true }).first().click();
  await page.getByRole('button', { name: '장터', exact: true }).first().click({ timeout: 15_000 });
  await page.getByText('갤러리 매물').first().click({ timeout: 15_000 });
  const gallery = page.locator('[data-listing-gallery]');
  await expect(gallery).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500); // 시트 진입 정착
  await expect(page.locator('[data-listing-slide]')).toHaveCount(3);
  const box = () => page.evaluate(() => {
    const r = (s: string) => { const b = document.querySelector(s)!.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 10) / 10); };
    return { g: r('[data-listing-gallery]'), card: r('[data-mk-card="summary"]') };
  });
  const before = await box();
  const counter = page.locator('[data-listing-counter]');
  await expect(counter).toHaveText('1 / 3');

  // 손가락 스와이프와 같은 경로(트랙 스크롤) — 2장째
  await page.evaluate(() => { const t = document.querySelector('[data-listing-gallery] > div') as HTMLElement; t.scrollTo({ left: t.clientWidth, behavior: 'auto' }); });
  await expect(counter).toHaveText('2 / 3');
  // 키보드 → 3장째
  await page.locator('[data-listing-slide="1"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(counter).toHaveText('3 / 3', { timeout: 3000 });
  await page.waitForTimeout(400);
  const after = await box();
  console.log(`[listing-gallery] before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  expect(after).toEqual(before);

  // 탭 → 확대 뷰(ImageLightbox), ESC → 확대만 닫히고 상세는 남는다
  await page.locator('[data-listing-slide="2"]').click();
  const lb = page.getByRole('dialog', { name: '갤러리 매물 사진 확대 보기' });
  await expect(lb).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(lb).toHaveCount(0, { timeout: 3000 });
  await expect(gallery).toBeVisible();
});
