// 계정 삭제 안내 페이지(오너 2026-09-25 PLAY-ACCOUNT-DELETION-URL) — Google Play '계정 삭제 URL' 요건.
//   ① 앱 설치·로그인·JS 없이 /legal/delete-account.html 이 열리고, 앱 안 경로·로그인 없는 요청 방법·삭제/보존 항목·기한이 보인다.
//   ② 전 화면 푸터와 공개 처리방침(privacy.html)이 그 페이지를 가리킨다.
// 운영 DB 쓰기 0 · 로그인 0.
import { test, expect } from './_fixtures';

const URL = '/legal/delete-account.html';

test('계정 삭제 안내는 JS 없이 열리고 필수 항목을 모두 담는다', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  const res = await page.goto(URL);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: '계정 삭제 안내' })).toBeVisible();
  const body = page.locator('main');
  for (const t of ['회원 탈퇴하기', '「보안」 탭', 'ace@nuriholdem.com', '10일 이내', '즉시 삭제되는 정보', '6개월', '약 2주', '매장 기록']) {
    await expect(body, `본문에 '${t}' 없음`).toContainText(t);
  }
  await expect(page.locator('a[href="mailto:ace@nuriholdem.com"]').first()).toBeVisible();
  expect(await page.content()).not.toContain('<script');
  await ctx.close();
});

test('푸터와 공개 처리방침이 계정 삭제 안내를 가리킨다', async ({ page }) => {
  await page.goto('/');
  const link = page.getByTestId('footer-delete-account');
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', URL);

  await page.goto('/legal/privacy.html');
  await expect(page.getByTestId('privacy-delete-account-link')).toHaveAttribute('href', URL);
});
