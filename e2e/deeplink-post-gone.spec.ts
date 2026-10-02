// 삭제·숨김된 글의 딥링크(?post=)는 **말하고, 커뮤니티로 보낸다** — 조용히 홈에 두지 않는다.
//
// 2026-10-02 운영 더미 실사용 검증: 삭제된 글 링크가 안내 없이 홈으로 떨어졌다. 토스트 문구가 있어도 글이 없는
// 링크를 받은 사람은 홈에서 '무슨 일이지' 하고 끝난다 — 글이 있었어야 할 자리(커뮤니티)로 보내 다음 행동을 준다.
// 비로그인 · 읽기만(조회 실패 경로) — 운영 DB 에 쓰지 않는다(없는 id 라 incrementPostView 도 불리지 않는다).
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';

const ZERO = '00000000-0000-0000-0000-000000000000';
const visibleTabs = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-tab]')].filter((p) => p.offsetParent !== null).map((p) => p.dataset.tab));

test('🔴 ?post=<없는 글> — 안내 토스트가 뜨고 커뮤니티 탭이 열리며 파라미터가 지워진다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?post=${ZERO}`);
  await expect(page.getByText('삭제되었거나 찾을 수 없는 글입니다'), '없는 글 링크인데 안내가 없다').toBeVisible({ timeout: 20_000 });
  await expect.poll(() => visibleTabs(page), { message: '안내만 뜨고 홈에 남았다 — 글이 있던 커뮤니티로 가야 한다', timeout: 5_000 }).toContain('community');
  expect(new URL(page.url()).searchParams.has('post'), '?post= 가 남아 새로고침마다 반복된다').toBe(false);
});
