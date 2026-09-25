// 사용자 경로 재현: 느린 첫 서버 페이지 — 목록이 done 된 뒤에 마지막 글을 열어도 상세가 옛 스냅샷(done=false)을 받는가
// 2026-09-25 root-cause-debugger 확정: 같은 원인(PostRowCard.samePostProps 가 onClick 을 안 봄) — 행이
//   재렌더되지 않으면 onClick 클로저가 serverDone=false 였던 렌더를 그대로 문다. navNowRef 로 고쳤다.
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays } from './_session';
import type { Route } from '@playwright/test';
const json = (r: Route, b: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const postRow = (id: string, title: string, likes: number) => ({ id, user_id: `u-${id}`, user_name: `작성자${id}`, user_role: 'user', user_color: '#888', user_avatar: null,
  content: `본문 ${id} `.repeat(40), created_at: `2026-09-0${id.slice(-1)}T00:00:00Z`, like_count: likes, comment_count: 0, view_count: 0,
  category: 'free', title, images: [], badbeat_count: 0, goodrun_count: 0, blinded: false, cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null });
const POSTS = [postRow('n3', '셋째 글 제목', 0), postRow('n2', '둘째 글 제목', 5), postRow('n1', '첫째 글 제목', 10)];
test('🔴 느린 첫 페이지 — done 도착 후 연 마지막 글은 end', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/\/rest\/v1\/rpc\/community_ads_public/, (r) => json(r, []));
  await page.route(/\/rest\/v1\/community_posts\?/, async (r) => {
    const url = r.request().url();
    if (/[?&]id=eq\./.test(url)) { const id = /id=eq\.([^&]+)/.exec(url)![1]; return json(r, POSTS.filter((p) => p.id === id)); }
    if (/bumped_until=gt\./.test(url)) return json(r, []);
    if (/[?&]limit=15/.test(url)) { await new Promise((res) => setTimeout(res, 2500)); return json(r, []); } // 게시판 첫 서버 페이지만 늦게
    if (/[?&]limit=/.test(url) && !/limit=50/.test(url)) return json(r, []);
    return json(r, POSTS);
  });
  await stabilizeBackstack(page);
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  const bar = page.locator('[data-community-secbar]');
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await bar.getByRole('button', { name: '게시판', exact: true }).click();
  await expect(page.getByText('첫째 글 제목').filter({ visible: true }).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-board-loaded="done"]')).toHaveCount(1, { timeout: 10_000 });
  await page.waitForTimeout(800);
  await page.getByText('첫째 글 제목').filter({ visible: true }).first().click();
  const dialog = page.locator('[role="dialog"]').filter({ has: page.locator('[data-pd-root]') }).first();
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  const edge = await dialog.locator('[data-pd-nav-dir="next"]').getAttribute('data-pd-nav-edge');
  expect(edge, '목록은 done 인데 상세는 옛 스냅샷(done=false)을 받았다').toBe('end');
});
