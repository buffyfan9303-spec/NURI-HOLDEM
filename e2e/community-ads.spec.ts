// 커뮤니티 광고 = 게시글 승격 (2026-09-11 오너 지시) — 화면 계약
//
// 오너 리포트: "게시판과 커뮤니티의 AD 가 클릭되지 않거나 상세 화면으로 연결되지 않는다."
// 원인은 AdRow 가 게시글과 **완전히 별개 컴포넌트**였고, link_url 이 없으면 `<div>` 로 렌더된 것이었다.
// 이제 광고는 진짜 게시글이고 PostRow/PostCard 를 그대로 쓴다. 이 스펙이 그 계약을 잠근다:
//   ① 실제로 **열린다**(모바일 모달 · PC 2-pane · 키보드) ② 카드 전체가 클릭 대상이다
//   ③ 서버가 안 준 광고는 화면에 자리를 만들지 않는다 ④ 같은 글이 두 번 보이지 않는다
//   ⑤ 광고 조회가 실패해도 일반 피드는 산다 ⑥ 광고마다 글을 따로 부르는 N+1 이 없다
//
// 운영 DB 에는 쓰지 않는다: 광고 RPC·게시글 목록을 page.route 로 갈아 끼우고, _fixtures 가드가 비-GET 을 막는다.
import { test, expect } from './_fixtures';
import { type Page, type Route } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack } from './_session';

const ADS_RPC = /\/rest\/v1\/rpc\/community_ads_public/;
const POSTS_REST = /\/rest\/v1\/community_posts\?/;

const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });

/** community_ads_public 이 돌려주는 행 = 슬롯 + 게시글 컬럼(테이블과 같은 이름) */
const adRow = (slot: number, id: string, title: string, over: Record<string, unknown> = {}) => ({
  slot,
  id, user_id: `u-${id}`, user_name: `광고주${slot}`, user_role: 'user', user_color: '#8B5CF6', user_avatar: null,
  content: `광고 본문 ${id}`, created_at: '2026-09-01T00:00:00Z',
  like_count: 1, comment_count: 0, view_count: 5,
  category: 'free', title, images: [],
  cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
  ...over,
});

/** 일반 게시글 행(community_posts 테이블 select 응답) */
const postRow = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id, user_id: `u-${id}`, user_name: `작성자${id}`, user_role: 'user', user_color: '#888', user_avatar: null,
  content: `본문 ${id}`, created_at: '2026-09-02T00:00:00Z',
  like_count: 0, comment_count: 0, view_count: 0,
  category: 'free', title, images: [],
  badbeat_count: 0, goodrun_count: 0, blinded: false,
  cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
  ...over,
});

/** 광고 RPC 호출 수 · 게시글 단건 조회 수를 센다(N+1 감시) */
async function install(page: Page, opts: {
  ads?: unknown[] | 'fail';
  posts?: unknown[];
  counters?: { ads: number; postById: number };
} = {}) {
  const posts = opts.posts ?? [postRow('n1', '일반글 하나'), postRow('n2', '일반글 둘'), postRow('n3', '일반글 셋')];
  await page.route(ADS_RPC, (r: Route) => {
    if (opts.counters) opts.counters.ads += 1;
    if (opts.ads === 'fail') return r.fulfill(json({ message: 'boom' }, 500));
    return r.fulfill(json(opts.ads ?? []));
  });
  await page.route(POSTS_REST, (r: Route) => {
    const url = r.request().url();
    // id=eq.<uuid> 형태는 '광고 글을 따로 한 건씩 받아오는' 요청이다 — 있으면 N+1 이다.
    if (opts.counters && /[?&]id=eq\./.test(url)) opts.counters.postById += 1;
    return r.fulfill(json(posts));
  });
}

async function openBoard(page: Page) {
  await stabilizeBackstack(page);
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  const bar = page.locator('[data-community-secbar]');
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await bar.getByRole('button', { name: '게시판', exact: true }).click();
  await page.waitForTimeout(900);
}

/** 보기 모드 전환 — 기본은 feed(PostCard), 'compact' 는 한 줄(PostRow) */
async function setView(page: Page, v: 'feed' | 'compact') {
  await page.addInitScript((mode) => {
    try { localStorage.setItem('nuri:board-view', mode as string); } catch { /* 차단 환경 */ }
  }, v);
}

const promoted = (page: Page) => page.locator('[data-promoted-post-id]');

/** ⚠ MarqueeText 는 **측정용 invisible 사본**을 항상 함께 렌더한다(MarqueeText.tsx:42).
 *  그래서 getByText(제목) 은 늘 2벌이 잡히고 .first() 는 보이지 않는 쪽이다 — 보이는 것만 고른다. */
const visibleText = (scope: Page | ReturnType<Page['locator']>, t: string) =>
  scope.getByText(t).filter({ visible: true });

test.describe('커뮤니티 광고 — 게시글 승격', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); });

  test('🔴 게재 중인 광고가 **게시글 카드 그대로** 서고 AD 배지가 붙는다 (feed 보기)', async ({ page }) => {
    await setView(page, 'feed');
    await install(page, { ads: [adRow(1, 'ad-1', '광고로 올린 글')] });
    await openBoard(page);

    const card = promoted(page).first();
    await expect(card, '광고가 화면에 없다').toBeVisible({ timeout: 15_000 });
    await expect(card).toHaveAttribute('data-ad-slot', '1');
    // 광고임을 숨기지 않는다
    await expect(card.getByText('AD', { exact: true })).toBeVisible();
    // 게시글 그대로 — 제목·작성자가 일반 글과 같은 자리에 있다
    await expect(visibleText(card, '광고로 올린 글').first()).toBeVisible();
    await expect(visibleText(card, '광고주1').first()).toBeVisible();
    // 카테고리 배지를 밀어내지 않았다(AD 가 카테고리를 대체하면 정보가 사라진다)
    await expect(card.getByText('자유', { exact: true })).toBeVisible();
    // feed 보기의 카드 문법을 그대로 쓴다
    await expect(card).toHaveClass(/cv-row-lg/);
  });

  test('🔴 한 줄 보기에서는 PostRow 형태로 선다 — 두 보기에 기능 차이가 없다 (compact)', async ({ page }) => {
    await setView(page, 'compact');
    await install(page, { ads: [adRow(1, 'ad-1', '한 줄 광고 글')] });
    await openBoard(page);

    const row = promoted(page).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toHaveClass(/cv-row-sm/);          // 한 줄 행 문법
    await expect(row.getByText('AD', { exact: true })).toBeVisible();
    await expect(row).toHaveAttribute('role', 'button'); // 클릭·키보드 대상
    await expect(row).toHaveAttribute('tabindex', '0');
  });

  test('🔴 광고를 누르면 원본 게시글 상세가 열린다 — 모바일 모달 (카드 전체가 클릭 대상)', async ({ page }) => {
    await setView(page, 'feed');
    await install(page, { ads: [adRow(1, 'ad-1', '눌러서 열리는 광고')] });
    await openBoard(page);

    const card = promoted(page).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    // AD 배지가 아니라 **카드의 빈 곳**을 누른다 — 배지만 클릭되던 구조가 아니어야 한다
    const box = (await card.boundingBox())!;
    await page.mouse.click(box.x + box.width - 12, box.y + box.height - 10);

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog, '광고를 눌렀는데 게시글 상세가 열리지 않는다').toBeVisible({ timeout: 10_000 });
    await expect(visibleText(dialog, '눌러서 열리는 광고').first()).toBeVisible();
  });

  test('🔴 Enter · Space 로도 상세가 열린다', async ({ page }) => {
    await setView(page, 'feed');
    await install(page, { ads: [adRow(1, 'ad-1', '키보드로 여는 광고')] });
    await openBoard(page);

    const card = promoted(page).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[role="dialog"]'), 'Enter 로 안 열린다').toBeVisible({ timeout: 10_000 });

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await card.focus();
    await page.keyboard.press(' ');
    await expect(page.locator('[role="dialog"]'), 'Space 로 안 열린다').toBeVisible({ timeout: 10_000 });
  });

  test('🔴 PC 2-pane 에서도 열린다 — 한쪽만 되는 상태로 두지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setView(page, 'feed');
    await install(page, { ads: [adRow(1, 'ad-1', 'PC 에서 여는 광고')] });
    await openBoard(page);

    const card = promoted(page).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click();
    // PC 는 모달이 아니라 우측 인라인 상세다 — 목록에서 선택 표시(aria-current)가 켜지고 제목이 본문에 뜬다
    await expect(card).toHaveAttribute('aria-current', 'true', { timeout: 10_000 });
    // 목록의 카드와 우측 상세 두 곳에 제목이 뜬다(각각 보이는 사본 1개씩)
    await expect(visibleText(page, 'PC 에서 여는 광고'), 'PC 2-pane 상세가 안 열린다')
      .toHaveCount(2, { timeout: 10_000 });
  });

  test('🔴 좋아요를 눌러도 상세가 함께 열리지 않는다 (중첩 버튼의 stopPropagation)', async ({ page }) => {
    await setView(page, 'feed');
    await install(page, { ads: [adRow(1, 'ad-1', '좋아요 충돌 확인')] });
    await openBoard(page);

    const card = promoted(page).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    // PostRowCard.tsx:265 의 aria-label — 카드 안의 다른 버튼과 헷갈리지 않는 유일한 지목
    const likeBtn = card.getByRole('button', { name: /^좋아요/ });
    await expect(likeBtn, '카드에 좋아요 버튼이 없다').toHaveCount(1);
    await likeBtn.click();
    await page.waitForTimeout(600);
    // ⚠ '다이얼로그가 0개' 로 단언하면 안 된다: 비로그인이 좋아요를 누르면 **로그인 모달**이 뜨는 것이
    //   정상 동작이다(App.tsx handleLikePost → promptLogin). 여기서 잠그는 것은 '게시글 상세가
    //   함께 열리지 않는가' 하나뿐이므로, 그 글의 제목을 담은 다이얼로그만 지목한다.
    await expect(
      page.locator('[role="dialog"]').filter({ hasText: '좋아요 충돌 확인' }),
      '좋아요를 눌렀는데 게시글 상세까지 열렸다',
    ).toHaveCount(0);
  });

  test('🔴 서버가 안 준 광고는 화면에 자리를 만들지 않는다 — 빈 AD 행 0개', async ({ page }) => {
    // 미연결·만료·비활성·블라인드는 전부 서버(community_ads_public)가 걸러 낸다 → 클라이언트는 빈 배열을 받는다.
    await install(page, { ads: [] });
    await openBoard(page);
    await page.waitForTimeout(800);
    await expect(promoted(page), '광고가 0건인데 광고 자리가 생겼다').toHaveCount(0);
    // 그래도 일반 목록은 정상이다
    await expect(visibleText(page, '일반글 하나').first()).toBeVisible({ timeout: 15_000 });
  });

  test('🔴 광고 조회가 실패해도 일반 게시글 피드는 정상이다', async ({ page }) => {
    await install(page, { ads: 'fail' });
    await openBoard(page);
    await expect(visibleText(page, '일반글 하나').first(), '광고 실패가 피드까지 죽였다').toBeVisible({ timeout: 15_000 });
    await expect(promoted(page)).toHaveCount(0);
  });

  test('🔴 광고 조회는 RPC 한 번뿐이다 — 광고마다 글을 따로 부르지 않는다(N+1 없음)', async ({ page }) => {
    const counters = { ads: 0, postById: 0 };
    await install(page, {
      ads: [adRow(1, 'ad-1', '광고 하나'), adRow(2, 'ad-2', '광고 둘'), adRow(3, 'ad-3', '광고 셋')],
      counters,
    });
    await openBoard(page);
    await expect(promoted(page).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1200);
    expect(counters.postById, `광고 글을 ${counters.postById}번 따로 조회했다 — N+1 이다`).toBe(0);
    expect(counters.ads, `광고 RPC 를 ${counters.ads}번 불렀다`).toBeLessThanOrEqual(2); // 첫 로드 + 섹션 전환 여유
  });

  test('🔴 같은 글이 광고와 목록에 겹치면 두 번 보이지 않는다', async ({ page }) => {
    await setView(page, 'feed');
    // 광고 글 'dup' 이 일반 목록에도 들어 있다
    await install(page, {
      ads: [adRow(1, 'dup', '겹치는 글')],
      posts: [postRow('dup', '겹치는 글'), postRow('n2', '일반글 둘')],
    });
    await openBoard(page);
    await expect(promoted(page).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);
    // 제목이 화면에 정확히 한 번만 있어야 한다
    const seen = await page.locator('[data-tab="community"] li').filter({ hasText: '겹치는 글' }).count();
    expect(seen, `같은 글이 목록에 ${seen}번 있다`).toBe(1);
  });

  test('🔴 첫 광고는 맨 위, 이후는 글 N개마다 — 삽입 규칙이 유지된다', async ({ page }) => {
    await setView(page, 'compact');
    const posts = Array.from({ length: 9 }, (_, i) => postRow(`n${i}`, `일반글 ${i}`));
    await install(page, { ads: [adRow(1, 'a1', '광고 A'), adRow(2, 'a2', '광고 B')], posts });
    await openBoard(page);
    await expect(promoted(page).first()).toBeVisible({ timeout: 15_000 });

    // 목록 안 행들의 순서를 읽어 광고 위치를 확인한다
    const order = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-tab="community"] li[role="button"]')];
      return rows.map((r) => (r.hasAttribute('data-promoted-post-id') ? 'AD' : 'POST'));
    });
    expect(order.length, '목록이 비었다').toBeGreaterThan(4);
    expect(order[0], '첫 광고가 맨 위가 아니다').toBe('AD');
    // 두 번째 광고는 기본 4개마다 → index 5(AD, 글4개, AD)
    const adIdx = order.map((v, i) => (v === 'AD' ? i : -1)).filter((i) => i >= 0);
    expect(adIdx[0]).toBe(0);
    expect(adIdx.length, '두 번째 광고가 안 들어갔다').toBeGreaterThanOrEqual(2);
    expect(adIdx[1], '두 번째 광고 위치가 규칙과 다르다').toBe(5);
  });

  test('🔴 광고 지정·해제는 관리자만 — 비로그인 사용자는 쓰기가 막힌다', async ({ page }) => {
    // RLS 는 서버 계약이라 여기서는 '앱이 일반 사용자에게 그 경로를 아예 열지 않는다'를 본다.
    await install(page, { ads: [adRow(1, 'ad-1', '광고 글')] });
    await openBoard(page);
    await expect(promoted(page).first()).toBeVisible({ timeout: 15_000 });
    // 광고 카드 어디에도 'AD 지정'·'해제' 같은 운영 액션이 없다
    await expect(page.getByRole('button', { name: 'AD 지정' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '해제' })).toHaveCount(0);
    // 관리자 탭 자체가 비로그인에게 없다
    await expect(page.locator('[data-tab="admin"]')).toHaveCount(0);
  });

  test('🔴 광고 카드에 클릭 목적지가 없는 죽은 요소가 없다', async ({ page }) => {
    await setView(page, 'feed');
    await install(page, { ads: [adRow(1, 'ad-1', '목적지 확인')] });
    await openBoard(page);
    const card = promoted(page).first();
    await expect(card).toBeVisible({ timeout: 15_000 });

    const info = await card.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName, role: el.getAttribute('role'), tabindex: el.getAttribute('tabindex'),
        pointerEvents: cs.pointerEvents, cursor: cs.cursor,
        // 카드 위를 덮는 투명 레이어가 있으면 가운데 히트테스트가 카드 밖 요소를 돌려준다
        hitsSelf: (() => {
          const r = el.getBoundingClientRect();
          const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !!t && el.contains(t);
        })(),
      };
    });
    expect(info.pointerEvents, '카드가 pointer-events 로 막혀 있다').not.toBe('none');
    expect(info.role).toBe('button');
    expect(info.tabindex).toBe('0');
    expect(info.cursor).toBe('pointer');
    expect(info.hitsSelf, '카드 위에 투명 레이어가 덮여 있다').toBe(true);
  });
});
