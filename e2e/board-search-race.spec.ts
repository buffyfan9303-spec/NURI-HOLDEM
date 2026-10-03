// 게시판 검색 — 서버 조회가 비행 중일 때 검색어를 바꾸면 검색이 '찾는 중…' 에 영구히 멈추던 결함(2026-09-27 점검).
//
// 원인: FeedSection 의 필터 리셋 이펙트(CommunityTab.tsx)가 커서·누적분·done·err 만 비우고 serverLoading 은 두었다.
//   옛 요청의 finally 는 stale 판정으로 setServerLoading(false) 를 건너뛰므로, 한 글자 친 뒤 응답 전에 다음 글자를 치면
//   (한글 입력은 자모마다 onChange — 사실상 항상) loading 이 true 로 굳어 새 검색어의 서버 조회가 **한 번도 나가지 않았다**.
//   로컬 50건 밖의 글은 영영 안 찾아지고, 로컬 매치가 0이면 '찾는 중…' 이 끝나지 않는다.
// 이 스펙은 실제 타이핑 조건(글자마다 onChange)을 재현한다. 수정을 되돌리면 ①·② 가 실패한다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays } from './_session';

async function openBoard(page: Page) {
  await stabilizeBackstack(page);
  await page.goto('/');
  await dismissOverlays(page);
  await page.locator('nav').getByRole('button', { name: '커뮤니티', exact: true }).first().click();
  await page.locator('[data-testid="sec-tab-board"]').first().waitFor();
  // 섹션 이동 — locator.click 은 자동 스크롤로 측정을 흔들 수 있어 DOM click 으로 누른다(저장소 관행)
  await page.evaluate(() => (document.querySelector('[data-testid="sec-tab-board"]') as HTMLElement).click());
  // 2026-10-04 한 줄 상단: 검색칸은 🔍 를 눌러야 그 줄에 열린다(라벨이 아니라 data-testid 로 연다)
  await page.getByTestId('board-search-open').click();
  const input = page.getByRole('searchbox', { name: /게시글 검색/ });
  await input.waitFor();
  return input;
}

test.use({ viewport: { width: 390, height: 844 } });

test('① 글자마다 입력해도 마지막 검색어로 서버 조회가 나가고 끝난다', async ({ page }) => {
  const terms: string[] = [];
  await page.route(/\/rest\/v1\/community_posts\?.*ilike/, async (r) => {
    terms.push(decodeURIComponent(r.request().url()));
    await new Promise((res) => setTimeout(res, 400)); // 느린 망 — 다음 글자가 응답보다 먼저 온다
    await r.continue();
  });
  const input = await openBoard(page);
  const kw = 'zq없는검색어x';
  await input.pressSequentially(kw, { delay: 30 });
  await expect(page.locator('[data-board-loaded]')).toHaveAttribute('data-board-loaded', 'done', { timeout: 10_000 });
  expect(terms.some((u) => u.includes(kw)), `마지막 검색어(${kw})의 서버 조회가 나가지 않았다 — 요청 ${terms.length}건`).toBe(true);
  await expect(page.locator('[data-sec="board"]').getByText('검색 결과가 없습니다')).toBeVisible();
  await expect(page.locator('[data-sec="board"]').getByText('찾는 중…')).toHaveCount(0);
});

test('② 첫 응답이 늦게 와도(2.5s) 바꾼 검색어의 결과 상태로 정착한다', async ({ page }) => {
  let n = 0;
  await page.route(/\/rest\/v1\/community_posts\?.*ilike/, async (r) => {
    n += 1;
    if (n === 1) await new Promise((res) => setTimeout(res, 2500));
    await r.continue();
  });
  const input = await openBoard(page);
  await input.fill('zzq');
  await page.waitForTimeout(200);            // 'zzq' 조회가 비행 중
  await input.fill('zzqqxx없는말');
  await expect(page.locator('[data-board-loaded]')).toHaveAttribute('data-board-loaded', 'done', { timeout: 10_000 });
  expect(n, '바꾼 검색어의 서버 조회가 나가야 한다').toBeGreaterThanOrEqual(2);
  await expect(page.locator('[data-sec="board"]').getByText('검색 결과가 없습니다')).toBeVisible();
});
