// #11(2026-09-29 오너 결정) 좋아요를 빠르게 두 번 = 취소. 화면 = 서버.
//
// 예전(C-5): 글마다 비행 중 요청 1건만 보내고 그동안의 누름은 **버렸다** → 두 번 눌러도 좋아요가 남았다.
// 지금: 화면은 누를 때마다 즉시 뒤집고, 응답 뒤 서버가 마지막 의도와 다르면 한 번 더 보낸다(직렬).
// 서버 toggle_post_like 는 토글이다 — 여기서는 page.route 로 **상태 있는 가짜 서버**를 두고 응답을 늦춘다.
// 운영 DB 에 쓰지 않는다(RPC 를 가로챈다).
import { test, expect } from './_fixtures';
import type { Route } from '@playwright/test';
import { bootOwner } from './_mockOwner';
import { dismissOverlays } from './_session';

const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const PID = '11111111-1111-4111-8111-111111111111';
const post = {
  id: PID, user_id: '22222222-2222-4222-8222-222222222222', user_name: '작성자', user_role: 'user', user_color: '#888', user_avatar: null,
  content: '좋아요 연타 확인 본문', created_at: new Date(Date.now() - 3_600_000).toISOString(),
  like_count: 3, comment_count: 0, view_count: 0, category: 'free', title: '좋아요 연타 확인', images: [],
  badbeat_count: 0, goodrun_count: 0, blinded: false, cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
};

test('🔴 좋아요 빠르게 두 번 = 취소 — 서버에 직렬 2회, 화면과 서버 모두 누르기 전 상태', async ({ page }) => {
  const server = { liked: false, count: 3, calls: 0, inflight: 0, overlap: 0 };
  await bootOwner(page, {
    viewport: { width: 390, height: 844 },
    goto: false,
    extra: async (p) => {
      await p.addInitScript(() => { try { localStorage.setItem('nuri:board-view', 'feed'); } catch { /* 차단 환경 */ } });
      await p.route(/\/rest\/v1\/community_posts\?/, (r: Route) => (r.request().method() === 'GET' ? r.fulfill(json([post])) : r.fallback()));
      await p.route(/\/rest\/v1\/post_likes\?/, (r: Route) => r.fulfill(json(server.liked ? [{ post_id: PID }] : [])));
      await p.route(/\/rest\/v1\/rpc\/community_ads_public/, (r: Route) => r.fulfill(json([])));
      await p.route(/\/rest\/v1\/rpc\/toggle_post_like/, async (r: Route) => {
        server.calls += 1;
        server.inflight += 1;
        if (server.inflight > 1) server.overlap += 1;
        await new Promise((res) => setTimeout(res, 400));   // 응답이 늦는 동안 두 번째 누름이 들어간다
        server.liked = !server.liked;
        server.count += server.liked ? 1 : -1;
        server.inflight -= 1;
        return r.fulfill(json({ liked: server.liked, count: server.count }));
      });
    },
  });
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  const bar = page.locator('[data-community-secbar]');
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await bar.getByRole('button', { name: '게시판', exact: true }).click();

  // 목록에 글이 하나뿐이다(광고 0) — 그 글의 좋아요 버튼(PostRowCard aria-label '좋아요 N')
  const like = page.getByRole('button', { name: /^좋아요 \d+$/ }).first();
  await expect(like).toBeVisible({ timeout: 15_000 });
  await expect(like).toHaveAttribute('aria-pressed', 'false');

  // 사람 손가락 연타 — 첫 응답(400ms)이 오기 전에 두 번째를 누른다
  await like.click();
  await page.waitForTimeout(80);
  await like.click();
  // 화면은 즉시 두 번 뒤집혀 원래대로
  await expect(like).toHaveAttribute('aria-pressed', 'false');

  await expect.poll(() => server.calls, { timeout: 5_000, message: '두 번째 누름이 서버에 전달되지 않았다(무시됨)' }).toBe(2);
  await expect.poll(() => server.inflight, { timeout: 5_000 }).toBe(0);
  expect(server.overlap, '요청이 겹쳐 나갔다(직렬이어야 한다)').toBe(0);
  expect(server.liked, '서버에 좋아요가 남았다(취소 의도 유실)').toBe(false);
  // 화면 = 서버
  await expect(like).toHaveAttribute('aria-pressed', String(server.liked));
  await expect(like).toHaveAccessibleName(`좋아요 ${server.count}`);
});
