// e2e/venues-loading-1007.spec.ts — 커뮤니티 '홀덤펍' 목록: 응답 전 빈 목록을 '0곳' 으로 말하지 않는다
//
// 2026-10-07 main 124f04ed CI(e2e 3)가 nav-stability '오버레이 위 오버레이' 에서 '공개 매장이 없다' 로 3회 연속 떨어졌다.
// 운영에는 공개 매장이 6곳 있었다. 원인: 매장 목록은 부팅 첫 배치(일정·매장·공지·클락 allSettled)가 끝나야 오는데,
// 그 전에 홀덤펍을 열면 화면이 **'전체 0개 · 결과가 없습니다 · 다른 검색어나 카테고리로 시도해 보세요'** 를 보였다
// (CI 실패 스크린샷 그대로). 사용자에게도 같은 거짓말이다 — 첫 방문(스냅샷 없음)·느린 망에서 매장이 없는 앱으로 보인다.
// 조회 실패도 같은 빈 상태로 위장됐다(부팅 실패는 토스트조차 없었다).
//
// 여기서는 매장 목록 응답을 일부러 늦추거나 실패시켜 그 창을 **결정적으로** 만든다.
import { test, expect } from './_fixtures';
import { dismissOverlays, stabilizeBackstack } from './_session';
import type { Page } from '@playwright/test';

/** 공개 매장 목록 조회(getVenues)만 — 다른 venues 조회(단건·내 매장)는 건드리지 않는다 */
const VENUE_LIST = /\/rest\/v1\/venues\?.*approved=eq\.true/;

async function openVenuesSection(page: Page) {
  await stabilizeBackstack(page);
  await page.goto('/');
  await dismissOverlays(page);
  await page.waitForSelector('[data-tab="home"]', { timeout: 20_000 });
  const nav = page.getByRole('navigation', { name: '하단 내비게이션' });
  await nav.getByRole('button', { name: '커뮤니티', exact: true }).click({ timeout: 10_000 });
  await page.getByTestId('sec-tab-venues').click({ timeout: 15_000 });
  const sec = page.locator('[data-sec="venues"]');
  await expect(sec).toBeVisible({ timeout: 15_000 });
  return sec;
}

test('응답 전에는 빈 상태가 아니라 뼈대 — 도착하면 카드', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await page.route(VENUE_LIST, async (route) => { await gate; await route.continue(); });

  const sec = await openVenuesSection(page);
  // 응답을 붙잡은 동안 — 섹션이 열려 있고 목록은 아직 모른다
  // 문구로 먼저 본다 — testid 는 이 수정과 함께 생겨서, testid 만 보면 수정 전 빌드에서 '없는 요소' 로 거짓 판정된다
  await expect(sec.getByText('결과가 없습니다'), "응답 전인데 '결과가 없습니다'(0곳)를 말했다").toHaveCount(0);
  await expect(sec.getByText('0개', { exact: true }), "응답 전인데 '0개' 를 말했다").toHaveCount(0);
  await expect(sec.getByTestId('venue-list-loading'), '응답 전인데 뼈대가 없다').toBeVisible();

  release();
  await expect(sec.getByTestId('venue-card').first(), '응답이 왔는데 카드가 안 그려졌다').toBeVisible({ timeout: 15_000 });
  await expect(sec.getByTestId('venue-list-loading')).toHaveCount(0);
});

test('조회 실패는 빈 상태가 아니라 오류·다시 시도 — 다시 시도하면 카드', async ({ page }) => {
  let fail = true;
  await page.route(VENUE_LIST, async (route) => {
    if (fail) await route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"e2e"}' });
    else await route.continue();
  });

  const failed = page.waitForResponse(VENUE_LIST, { timeout: 20_000 });
  const sec = await openVenuesSection(page);
  const retry = sec.getByRole('button', { name: '다시 시도' });
  // 실패 응답이 도착한 뒤 판정한다(도착 전이면 무엇이 보여도 판정이 성립하지 않는다)
  await failed;
  await expect(sec.getByText('결과가 없습니다'), "조회 실패를 '결과가 없습니다' 로 위장했다").toHaveCount(0);
  await expect(retry, '조회가 실패했는데 다시 시도가 없다').toBeVisible({ timeout: 15_000 });
  await expect(sec.getByTestId('venue-list-loading'), '조회 실패인데 뼈대에 멈춰 있다').toHaveCount(0);

  fail = false;
  await retry.click();
  await expect(sec.getByTestId('venue-card').first(), '다시 시도했는데 카드가 안 왔다').toBeVisible({ timeout: 15_000 });
});
