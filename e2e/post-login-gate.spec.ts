// FULL-ERROR-SWEEP-B(2026-09-25) 커뮤니티 결함 2건 — 둘 다 "다시 나빠지면 여기서 걸린다":
//   ① 비로그인으로 글 상세의 좋아요를 누르면 로그인 시트가 뜬다. 예전엔 토스트('로그인 후 이용할 수 있습니다')를
//      같이 띄웠고, fixed 하단 토스트가 시트의 'Google로 계속하기' CTA 를 덮었다(390·360 실측 히트 높이 18/46).
//      → CTA 의 세로 중심열을 elementFromPoint 로 훑어 **버튼 자신이 맞는 비율 ≥ 0.9** 를 잰다.
//   ② `?post=<uuid 아님>` 은 검증 없이 PostgREST 로 나가 400 이었다 → 요청 0건 + '찾을 수 없' 안내.
//      양성 대조: uuid 꼴이면 여전히 단건 조회가 나가고 글이 열린다(가드가 과하게 막지 않는다).
// 비로그인 · 목킹 GET 만 — 운영 DB 에 쓰지 않는다(_fixtures 가드).
// 실행: E2E_BASE_URL=http://localhost:4480 npx playwright test e2e/post-login-gate.spec.ts
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays } from './_session';

const ADS_RPC = /\/rest\/v1\/rpc\/community_ads_public/;
const POSTS_REST = /\/rest\/v1\/community_posts\?/;
const json = (r: Route, b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

const LISTED_ID = '0000000a-0000-4000-8000-00000000000a';
const UNLISTED_ID = '0000000b-0000-4000-8000-00000000000b'; // 목록(첫 50건) 밖 — 단건 조회로만 열린다
const postRow = (id: string, title: string) => ({
  id, user_id: `u-${id.slice(-1)}`, user_name: '작성자', user_role: 'user', user_color: '#888', user_avatar: null,
  content: `본문 ${title} `.repeat(30), created_at: '2026-09-02T00:00:00Z',
  like_count: 0, comment_count: 0, view_count: 0,
  category: 'free', title, images: [],
  badbeat_count: 0, goodrun_count: 0, blinded: false,
  cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
});
const LISTED = postRow(LISTED_ID, '목록에 있는 글');
const UNLISTED = postRow(UNLISTED_ID, '목록 밖의 오래된 글');

/** 단건 조회(id=eq.<id>) 로 나간 id 들 — ② 의 관측값 */
async function install(page: Page, byId: string[]) {
  await page.route(ADS_RPC, (r) => json(r, []));
  await page.route(/\/rest\/v1\/comments\?/, (r) => json(r, []));
  await page.route(POSTS_REST, (r) => {
    const url = r.request().url();
    if (/[?&]id=eq\./.test(url)) {
      const id = decodeURIComponent(/id=eq\.([^&]+)/.exec(url)![1]);
      byId.push(id);
      return json(r, [LISTED, UNLISTED].filter((p) => p.id === id));
    }
    if (/bumped_until=gt\./.test(url)) return json(r, []);
    if (/created_at=lt\.|or=\(/.test(url)) return json(r, []);
    if (/[?&]limit=/.test(url) && !/limit=50/.test(url)) return json(r, []);
    return json(r, [LISTED]);
  });
}
const dialog = (page: Page) => page.locator('[role="dialog"]').filter({ has: page.locator('[data-pd-root]') }).first();

async function openFromBoard(page: Page) {
  await stabilizeBackstack(page);
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  const bar = page.locator('[data-community-secbar]');
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await bar.getByRole('button', { name: '게시판', exact: true }).click();
  await expect(page.locator('[data-board-loaded="done"]')).toHaveCount(1, { timeout: 10_000 });
  await page.getByText('목록에 있는 글').filter({ visible: true }).first().click();
  await expect(dialog(page)).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
}

for (const width of [390, 360]) {
  test(`🔴 ① ${width} 비로그인 좋아요 → 로그인 시트의 'Google로 계속하기' 가 토스트에 덮이지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await install(page, []);
    await openFromBoard(page);
    const like = dialog(page).getByRole('button', { name: /좋아요/ }).filter({ visible: true }).first();
    await expect(like, '좋아요 버튼이 없다').toBeVisible();
    await like.click();
    const cta = page.getByRole('button', { name: 'Google로 계속하기' });
    await expect(cta, '로그인 시트가 뜨지 않았다').toBeVisible({ timeout: 10_000 });
    // 시트 진입 애니메이션이 끝난 자리에서 잰다(움직이는 중엔 프레임마다 rect 가 다르다)
    await page.waitForFunction(() => {
      const el = document.querySelector('[role="dialog"]');
      return !!el && el.getAnimations({ subtree: true }).every((a) => a.playState !== 'running');
    }, undefined, { timeout: 5_000 });
    // ⚠ 토스트(error)는 4.5s 뒤 사라진다 — 그 안에 재야 '덮임'이 보인다(시트 등장 ≈0.3s 라 여유 있다).
    const m = await cta.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      let hit = 0, rows = 0;
      for (let y = Math.floor(r.top); y < Math.ceil(r.bottom); y++) {
        rows++;
        const h = document.elementFromPoint(cx, y + 0.5);
        if (h && (h === el || el.contains(h))) hit++;
      }
      const center = document.elementFromPoint(cx, r.top + r.height / 2);
      const cover = center && !(center === el || el.contains(center)) ? (center.closest('[role="status"]')?.textContent ?? center.tagName) : null;
      return { hit, rows, ratio: rows ? hit / rows : 0, cover };
    });
    expect(m.ratio, `CTA 세로 중심열 히트 ${m.hit}/${m.rows} — 덮은 것: ${m.cover ?? '없음'}`).toBeGreaterThanOrEqual(0.9);
    expect(m.cover, `CTA 중심을 '${m.cover}' 가 덮고 있다`).toBeNull();
  });
}

test('🔴 ② ?post=<uuid 아님> — 서버로 나가지 않고 "찾을 수 없" 안내 + 파라미터 제거', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const byId: string[] = [];
  await install(page, byId);
  await page.goto('/?post=not-a-uuid');
  await expect(page.getByText(/찾을 수 없/), '없는 글 링크인데 안내가 없다').toBeVisible({ timeout: 20_000 });
  await expect.poll(() => new URL(page.url()).searchParams.has('post'), { timeout: 5_000 }).toBe(false);
  expect(byId, `uuid 꼴이 아닌 id 가 그대로 PostgREST 로 나갔다: ${byId.join(', ')}`).not.toContain('not-a-uuid');
});

test('🟢 ② 양성 대조 — uuid 꼴이면 목록 밖의 글도 단건 조회로 열린다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const byId: string[] = [];
  await install(page, byId);
  await stabilizeBackstack(page);
  await page.goto(`/?post=${UNLISTED_ID}`);
  await expect(dialog(page), '목록 밖 글의 딥링크가 열리지 않았다').toBeVisible({ timeout: 20_000 });
  await expect(dialog(page).locator('[data-pd-title]').first()).toHaveText('목록 밖의 오래된 글');
  expect(byId, '단건 조회가 나가지 않았다(가드가 uuid 까지 막는다)').toContain(UNLISTED_ID);
});
