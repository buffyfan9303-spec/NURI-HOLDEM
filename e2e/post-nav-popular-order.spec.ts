// 사용자 경로 재현: 게시판 '인기' 로 바꾼 뒤 글을 열면 이전/다음이 **화면 순서(인기)** 가 아니라 옛 순서(최신)를 따르는가
// 2026-09-25 root-cause-debugger 확정: PostRow/PostCard 의 memo 비교(samePostProps, PostRowCard.tsx)가 onClick 을 안 봐서
//   행이 재렌더되지 않으면 그 행의 onClick(openWithNav 클로저)이 옛 렌더의 listSource(정렬 전)를 그대로 문다.
//   CommunityTab.tsx 의 openWithNav 를 navNowRef 기반으로 고쳤다 — 이 스펙은 그 회귀를 지킨다.
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays } from './_session';
import type { Route } from '@playwright/test';
const json = (r: Route, b: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const postRow = (id: string, title: string, likes: number) => ({ id, user_id: `u-${id}`, user_name: `작성자${id}`, user_role: 'user', user_color: '#888', user_avatar: null,
  content: `본문 ${id} `.repeat(40), created_at: `2026-09-0${id.slice(-1)}T00:00:00Z`, like_count: likes, comment_count: 0, view_count: 0,
  category: 'free', title, images: [], badbeat_count: 0, goodrun_count: 0, blinded: false, cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null });
const POSTS = [postRow('n3', '셋째 글 제목', 0), postRow('n2', '둘째 글 제목', 5), postRow('n1', '첫째 글 제목', 10)];
test('🔴 인기 정렬 후 이전/다음 = 화면 순서', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/\/rest\/v1\/rpc\/community_ads_public/, (r) => json(r, []));
  await page.route(/\/rest\/v1\/community_posts\?/, (r) => {
    const url = r.request().url();
    if (/[?&]id=eq\./.test(url)) { const id = /id=eq\.([^&]+)/.exec(url)![1]; return json(r, POSTS.filter((p) => p.id === id)); }
    if (/bumped_until=gt\./.test(url)) return json(r, []);
    if (/[?&]limit=/.test(url) && !/limit=50/.test(url)) return json(r, []);
    return json(r, POSTS);
  });
  await stabilizeBackstack(page);
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  const bar = page.locator('[data-community-secbar]');
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await bar.getByRole('button', { name: '게시판', exact: true }).click();
  await expect(page.locator('[data-board-loaded="done"]')).toHaveCount(1, { timeout: 10_000 });
  await page.locator('[data-board-loaded]').getByRole('button', { name: '인기', exact: true }).click();
  await expect(page.locator('[data-board-loaded="done"]')).toHaveCount(1, { timeout: 10_000 });
  await page.waitForTimeout(500);
  const order = await page.locator('[data-board-loaded] li[role="button"]').evaluateAll((els) => els.map((e) => (e.textContent ?? '').match(/(첫째|둘째|셋째)/)?.[1]));
  await page.getByText('둘째 글 제목').filter({ visible: true }).first().click();
  const dialog = page.locator('[role="dialog"]').filter({ has: page.locator('[data-pd-root]') }).first();
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
  const prev = await dialog.locator('[data-pd-nav-dir="prev"]').textContent();
  const next = await dialog.locator('[data-pd-nav-dir="next"]').textContent();
  expect(order).toEqual(['첫째', '둘째', '셋째']);
  expect(prev, '이전 글이 화면(인기) 순서의 바로 위 글이 아니다').toContain('첫째 글 제목');
  expect(next, '다음 글이 화면(인기) 순서의 바로 아래 글이 아니다').toContain('셋째 글 제목');
});
