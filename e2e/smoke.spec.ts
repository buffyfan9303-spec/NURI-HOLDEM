import { test, expect } from '@playwright/test';

// 공개(비로그인·비변이) 회귀 스모크 — 배포 전 게이트.
// 실데이터/목 모드 어느 쪽이든 통과해야 한다(데이터 내용이 아니라 "크래시 없이 렌더"를 검증).

test('앱 부팅 — 루트 렌더 + 제목 + 미처리 JS 예외 0', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page).toHaveTitle(/NHoldem|홀덤|NURI/);
  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.getByText('일정 탐색').first()).toBeVisible();
  expect(errors, `미처리 예외: ${errors.join(' | ')}`).toEqual([]);
});

test('동적 SEO — 홈 canonical 주입(seo.ts resetSeo)', async ({ page }) => {
  await page.goto('/');
  // resetSeo 가 index.html 에 없던 <link rel=canonical> 를 추가
  const href = await page.locator('link[rel="canonical"]').getAttribute('href');
  expect(href).toContain('nuriholdem.com');
});

test('탭 순회 — 라이브/도구/커뮤니티 전환 중 크래시 없음', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: '하단 내비게이션' });
  await expect(nav).toBeVisible();

  await nav.getByRole('button', { name: '라이브', exact: true }).click();
  await expect(page.getByText('진행 중 게임')).toBeVisible();

  await nav.getByRole('button', { name: '도구', exact: true }).click();
  await expect(page.locator('#root')).not.toBeEmpty();

  await nav.getByRole('button', { name: '커뮤니티', exact: true }).click();
  await expect(page.locator('#root')).not.toBeEmpty();

  await nav.getByRole('button', { name: '일정', exact: true }).click();
  await expect(page.getByText('일정 탐색').first()).toBeVisible();

  expect(errors, `탭 순회 중 예외: ${errors.join(' | ')}`).toEqual([]);
});

test('대형 디스플레이 딥링크 — ?display 가 풀스크린 마운트', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // 더미 매장 id → 클락 없음 → 빈 상태가 떠야 한다(컴포넌트가 크래시 없이 마운트됨을 확인).
  await page.goto('/?display=00000000-0000-0000-0000-000000000000');
  await expect(page.getByText('진행 중인 클락이 없습니다')).toBeVisible();
  expect(errors, `디스플레이 예외: ${errors.join(' | ')}`).toEqual([]);
});

test('대회 공유 딥링크 — ?s 진입이 크래시 없이 처리', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?s=00000000-0000-0000-0000-000000000000'); // 없는 대회 → 무시하고 홈
  await expect(page.locator('#root')).not.toBeEmpty();
  expect(errors, `딥링크 예외: ${errors.join(' | ')}`).toEqual([]);
});
