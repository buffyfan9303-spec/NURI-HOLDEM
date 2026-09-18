// 게시글 상세 — 전체화면(UI-02) + 이전/다음 글(UI-04) 실측 게이트 (2026-09-13, N02 §6 · 실행문 §7.1~7.4).
//
// 이 파일이 보는 것
//   ① 모바일(390): 상세가 **전체 뷰포트**를 채우는 page 셸이다 — 위쪽 검은 scrim·하단 시트 없음, backdrop 버튼 없음, 진입 모션 fade-in.
//      헤더는 compact(작은 보조 라벨) · 닫기 X 는 44px 이상 · 드래그 그립을 그리지 않는다(드래그 닫기 OFF).
//   ② 닫는 길 **셋**을 전부 잠근다(리드 결정 — backdrop 클릭은 page 에 정의상 없다): 헤더 X · ESC · 브라우저 뒤로가기.
//   ③ 이전/다음 = 열었던 목록의 화면 순서. 첫 글은 이전 비활성('첫 글이에요'), 마지막(서버 done)은 다음 비활성('마지막 글이에요').
//      이동해도 히스토리가 쌓이지 않는다 — 두 번 이동한 뒤 뒤로가기 **한 번**이 상세를 닫고 목록으로, 주소에 post 가 남지 않는다.
//      이동 시 상세 내부 스크롤만 맨 위로.
//   ④ 숨김(blinded) 글은 건너뛴다. ⑤ 공유 링크(?post=) 직접 진입은 맥락이 없다 — 양쪽 비활성 + '목록으로'.
//   ⑥ PC 1440: 딥링크로 연 전체화면 셸의 본문 읽기 폭이 68~74ch(Pretendard 실측 ch 로 환산). 1280 2-pane 인라인은 종전대로(폭 ≥600).
//   ⑦ 오프라인 배너가 떠도 헤더 X 가 가려지지 않는다(hit-test).
// 목킹: community_posts(목록·단건·검색) · community_ads 를 page.route 로 — 운영 DB 에 쓰지 않는다(_fixtures 가드).
// 실행: E2E_BASE_URL=http://localhost:5174 npx playwright test e2e/post-nav.spec.ts
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays } from './_session';

const ADS_RPC = /\/rest\/v1\/rpc\/community_ads_public/;
const POSTS_REST = /\/rest\/v1\/community_posts\?/;
const json = (r: Route, b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

const postRow = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id, user_id: `u-${id}`, user_name: `작성자${id}`, user_role: 'user', user_color: '#888', user_avatar: null,
  content: `본문 ${id} `.repeat(40), created_at: `2026-09-0${id.slice(-1)}T00:00:00Z`,
  like_count: 0, comment_count: 0, view_count: 0,
  category: 'free', title, images: [],
  badbeat_count: 0, goodrun_count: 0, blinded: false,
  cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
  ...over,
});
// 최신순 목록 = 서버가 준 순서 그대로: n3(09-03) → n2 → n1
const POSTS = (hideMiddle = false) => [postRow('n3', '셋째 글 제목'), postRow('n2', '둘째 글 제목', { blinded: hideMiddle }), postRow('n1', '첫째 글 제목')];

/** 게시판이 정착(서버 첫 페이지 done)한 뒤에 글을 연다 — ③ 의 '첫/마지막' 은 정착한 목록의 계약이다.
 *  2026-09-13 실측: 4173(프로덕션 빌드)에서 5/6 실패, 5174 dev 는 StrictMode 이중 effect·느린 렌더로 우연히 통과.
 *  네트워크 응답을 목격하는 것으로는 부족했다(응답 → serverDone React 커밋 사이에 클릭이 들어가면 스냅샷 done=false —
 *  리드 진단). 그래서 CommunityTab 이 `data-board-loaded`(idle|loading|done)로 상태를 노출하고 여기서 그것을 기다린다.
 *  그 전에 열면 마지막 글의 '다음' 이 '다음 글 불러오기'(edge=more)로 뜨는 것은 **제품이 옳은 것**이다(§7.3 '불러온 끝 ≠ 전체 마지막') — ⑧ 이 그 전이를 잠근다. */
async function install(page: Page, posts = POSTS()) {
  await page.route(ADS_RPC, (r) => json(r, []));
  await page.route(POSTS_REST, (r) => {
    const url = r.request().url();
    if (/[?&]id=eq\./.test(url)) { const id = /id=eq\.([^&]+)/.exec(url)![1]; return json(r, posts.filter((p) => p.id === id)); }
    if (/bumped_until=gt\./.test(url)) return json(r, []);
    if (/created_at=lt\.|or=\(/.test(url)) return json(r, []);          // 커서 이어받기 — 더 없음
    if (/[?&]limit=/.test(url) && !/limit=50/.test(url)) return json(r, []); // searchPosts 첫 호출(커서 없음) — 더 없음 → done
    return json(r, posts);
  });
}
async function openBoard(page: Page) {
  await stabilizeBackstack(page);
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  const bar = page.locator('[data-community-secbar]');
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await bar.getByRole('button', { name: '게시판', exact: true }).click();
  await expect(page.locator('[data-board-loaded="done"]')).toHaveCount(1, { timeout: 10_000 });
}
const dialog = (page: Page) => page.locator('[role="dialog"]').filter({ has: page.locator('[data-pd-root]') }).first();
const openFromList = async (page: Page, title: string) => {
  await page.getByText(title).filter({ visible: true }).first().click();
  await expect(dialog(page)).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
};
const navBtn = (page: Page, dir: 'prev' | 'next') => dialog(page).locator(`[data-pd-nav-dir="${dir}"]`);
const titleOf = (page: Page) => dialog(page).locator('[data-pd-title]').first().textContent();

test('🔴 ① 모바일 전체화면 셸 — 뷰포트를 채우고 backdrop 없이 그립·드래그 있고 헤더 compact·X 44px·fade-in', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page);
  await openBoard(page);
  await openFromList(page, '둘째 글 제목');
  const g = await dialog(page).evaluate((el) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    const header = el.querySelector('header')!; const h2 = header.querySelector('h2')!;
    const close = header.querySelector<HTMLElement>('button[aria-label="닫기"]')!.getBoundingClientRect();
    const grip = el.querySelector('div[aria-hidden].absolute.top-1\\.5');
    // sheet/center 는 dialog 앞에 전면 backdrop(button.backdrop-blur-md)이 형제로 선다 — page 는 dialog 자신이 셸이라 그 형제가 없다
    const scrimBtn = !!el.previousElementSibling?.classList.contains('backdrop-blur-md') || !!el.closest('[data-scroll-lock]')?.querySelector(':scope > .backdrop-blur-md');
    return { x: r.left, y: r.top, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, position: cs.position, anim: cs.animationName, dur: cs.animationDuration,
      bg: cs.backgroundColor, headerH: header.getBoundingClientRect().height, titleSize: parseFloat(getComputedStyle(h2).fontSize), titleText: h2.textContent,
      close: { w: close.width, h: close.height }, grip: !!grip, scrimBtn, dragAttr: el.hasAttribute('data-drag-close') };
  });
  expect(g.position).toBe('fixed');
  expect([g.x, g.y]).toEqual([0, 0]); expect(g.w).toBeCloseTo(g.vw, 0); expect(g.h).toBeCloseTo(g.vh, 0);
  expect(g.scrimBtn, 'backdrop 버튼이 있다(page 가 아니다)').toBe(false);
  // 🔴 2026-09-19 오너: "위에서 아래로 스와이프 해서 내리면 창이 내려가는 모션 살려줘".
  //   종전 계약은 그 반대(그립 없음·드래그 꺼짐)였다 — UI-02 때 '읽는 중 실수로 닫힘' 을 막으려던 결정이다.
  //   오너가 모션을 되살리라고 해서 뒤집는다. **그립과 드래그는 한 쌍이다** — 둘 중 하나만 있으면
  //   UI 가 거짓말을 한다(손잡이를 그려 놓고 안 끌리거나, 끌리는데 손잡이가 없어 아무도 모른다).
  expect(g.grip, '드래그를 켰는데 그립(손잡이)이 없다 — 끌 수 있다는 걸 아무도 모른다').toBe(true);
  expect(g.dragAttr, '스와이프로 닫기가 꺼져 있다 — 오너가 살리라고 한 모션이다').toBe(true);
  expect(g.anim).toBe('fade-in'); expect(g.dur).toBe('0.16s');
  // compact page 헤더 = 닫기 44px(h-11 46.75) + py-1(8.5×2, 루트 17px) + border 1 = **56.25px**(리드 실측과 같다). default 헤더(h-header-h 60.5+1)보다 낮다.
  expect(g.headerH, `헤더 ${g.headerH}px — compact(56.25) 여야 한다`).toBeLessThanOrEqual(57);
  expect(g.headerH).toBeGreaterThanOrEqual(44);
  expect(g.titleSize).toBeLessThanOrEqual(13); expect(g.titleText).toBe('커뮤니티 게시판');
  expect(g.close.w).toBeGreaterThanOrEqual(44); expect(g.close.h).toBeGreaterThanOrEqual(44);
  expect(g.bg).not.toMatch(/rgba\(0, 0, 0, 0\)/);
});

test('🔴 ② 닫는 길 셋 — 헤더 X · ESC · 뒤로가기 각각 상세를 닫고 목록으로 돌아온다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page);
  await openBoard(page);
  await openFromList(page, '둘째 글 제목');
  await dialog(page).locator('header button[aria-label="닫기"]').click();
  await expect(dialog(page)).toBeHidden({ timeout: 5_000 });
  await expect(page.getByText('둘째 글 제목').filter({ visible: true }).first()).toBeVisible();
  await openFromList(page, '둘째 글 제목');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden({ timeout: 5_000 });
  await openFromList(page, '둘째 글 제목');
  await page.goBack();
  await expect(dialog(page)).toBeHidden({ timeout: 5_000 });
  await expect(page).toHaveURL((u) => !u.searchParams.has('post'));
  await expect(page.locator('[data-community-secbar]')).toBeVisible();
});

test('🔴 ③ 이전/다음 = 목록 순서 · 첫/마지막 비활성 · 이동은 히스토리를 안 쌓고 뒤로가기 한 번이 닫는다 · 내부 스크롤 리셋', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page);
  await openBoard(page);
  await openFromList(page, '셋째 글 제목');   // 목록 첫 글
  await expect(navBtn(page, 'prev')).toBeDisabled();
  await expect(navBtn(page, 'prev')).toContainText('첫 글이에요');
  await expect(navBtn(page, 'next')).toContainText('둘째 글 제목');
  // 아래로 스크롤해 둔 뒤 이동 → 내부 스크롤 0
  await dialog(page).locator('.overflow-y-auto').first().evaluate((el) => { el.scrollTop = 300; });
  await navBtn(page, 'next').click();
  await expect(dialog(page).locator('[data-pd-title]').first()).toHaveText('둘째 글 제목', { timeout: 5_000 });
  expect(await dialog(page).locator('.overflow-y-auto').first().evaluate((el) => el.scrollTop)).toBe(0);
  await expect(navBtn(page, 'prev')).toContainText('셋째 글 제목');
  await navBtn(page, 'next').click();
  await expect(dialog(page).locator('[data-pd-title]').first()).toHaveText('첫째 글 제목');
  await expect(navBtn(page, 'next')).toBeDisabled();
  await expect(navBtn(page, 'next')).toContainText('마지막 글이에요');
  // 두 번 이동했지만 히스토리는 한 겹 — 뒤로가기 한 번에 닫힌다
  await page.goBack();
  await expect(dialog(page)).toBeHidden({ timeout: 5_000 });
  await expect(page.locator('[data-community-secbar]')).toBeVisible();
  await expect(page).toHaveURL((u) => !u.searchParams.has('post'));
});

test('🔴 ④ 숨김(blinded) 글은 건너뛴다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page, POSTS(true));
  await openBoard(page);
  await openFromList(page, '셋째 글 제목');
  await expect(navBtn(page, 'next')).toContainText('첫째 글 제목');
  await navBtn(page, 'next').click();
  await expect(dialog(page).locator('[data-pd-title]').first()).toHaveText('첫째 글 제목');
  await expect(navBtn(page, 'prev')).toContainText('셋째 글 제목');
});

test('🔴 ⑤ 공유 링크 직접 진입은 맥락이 없다 — 양쪽 비활성 + 목록으로', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page);
  await stabilizeBackstack(page);
  await page.goto('/?post=n2');
  await dismissOverlays(page);
  await expect(dialog(page)).toBeVisible({ timeout: 20_000 });
  await expect(navBtn(page, 'prev')).toBeDisabled(); await expect(navBtn(page, 'next')).toBeDisabled();
  await expect(navBtn(page, 'prev')).toHaveAttribute('data-pd-nav-edge', 'no-context');
  await expect(dialog(page).getByRole('button', { name: '목록으로' })).toBeVisible();
  expect(await titleOf(page)).toBe('둘째 글 제목');
});

test('🔴 ⑥ PC 1440 전체화면 읽기 폭 68~74ch · 1280 2-pane 인라인은 종전대로', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await install(page);
  await stabilizeBackstack(page);
  await page.goto('/?post=n2');
  await dismissOverlays(page);
  await expect(dialog(page)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
  const m = await dialog(page).locator('[data-pd-body]').evaluate(async (el) => {
    await document.fonts.ready;
    const probe = document.createElement('span'); probe.textContent = '0'.repeat(20); probe.style.cssText = 'position:absolute;white-space:nowrap;visibility:hidden';
    probe.style.font = getComputedStyle(el).font; el.appendChild(probe);
    const ch = probe.getBoundingClientRect().width / 20; probe.remove();
    const r = el.getBoundingClientRect(); const shell = el.closest('[role="dialog"]')!.getBoundingClientRect();
    return { w: r.width, ch, chars: r.width / ch, family: getComputedStyle(el).fontFamily, shellW: shell.width, left: r.left, right: shell.right - r.right };
  });
  expect(m.family).toMatch(/Pretendard/);
  expect(m.chars, `본문 ${m.w.toFixed(1)}px / ch ${m.ch.toFixed(2)} = ${m.chars.toFixed(1)}ch`).toBeGreaterThanOrEqual(68);
  expect(m.chars).toBeLessThanOrEqual(74);
  expect(m.shellW, '셸은 full-bleed').toBeCloseTo(1440, 0);
  expect(Math.abs(m.left - m.right), '읽기 열이 중앙이 아니다').toBeLessThanOrEqual(2);
  // 1280 2-pane 인라인 — 종전 계약(본문 ≥600) 그대로
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1280, height: 900 });
  await openBoard(page);
  await page.getByText('둘째 글 제목').filter({ visible: true }).first().click();
  const inlineBody = page.locator('aside [data-pd-body]');
  await expect(inlineBody).toBeVisible({ timeout: 15_000 });
  expect((await inlineBody.boundingBox())!.width).toBeGreaterThanOrEqual(600);
  await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);
  // 2-pane 도 같은 스냅샷으로 이전/다음이 된다(컨테이너 유지)
  await page.locator('aside [data-pd-nav-dir="next"]').click();
  await expect(page.locator('aside [data-pd-title]')).toHaveText('첫째 글 제목');
});

test('🔴 ⑦ 오프라인 배너가 떠도 헤더 X 가 가려지지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page);
  await openBoard(page);
  await openFromList(page, '둘째 글 제목');
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.waitForTimeout(300);
  const hit = await dialog(page).locator('header button[aria-label="닫기"]').evaluate((btn) => {
    const r = btn.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { covered: !(el === btn || btn.contains(el)), by: el ? `${el.tagName}.${String((el as HTMLElement).className).slice(0, 40)}` : null, banner: !!document.querySelector('[role="status"]') };
  });
  expect(hit.covered, `닫기 버튼이 가려졌다: ${hit.by}`).toBe(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
});

test('🔴 ⑧ 목록 이어받기가 비행 중일 때 연 마지막 글 — "다음 글 불러오기"(more) 를 누르면 상세가 이어받아 "마지막 글이에요" 로 바뀐다', async ({ page }) => {
  // §7.3 '현재 불러온 끝을 전체 마지막이라 하지 않는다' 의 반대편 절반 — more 는 거짓 약속이 아니라 실제로 이어받는다.
  // 실제 경로: 첫 서버 페이지가 꽉 차(15건 → nextCursor 있음) done=false 인 채, 스크롤로 목록이 2페이지를 받는 동안(느린 망)
  //   그 사이 보이는 마지막 글을 연다 → 스냅샷 done=false → '다음 글 불러오기'. 누르면 상세가 자기 커서로 받아 [] → end.
  await page.setViewportSize({ width: 390, height: 844 });
  const SERVER = Array.from({ length: 15 }, (_, k) => {
    const n = String(k + 1).padStart(2, '0');
    return postRow(`s${n}`, `서버 ${n}번 글`, { created_at: `2026-08-${String(15 - k).padStart(2, '0')}T00:00:00Z` }); // n1(09-01) 보다 오래된 15건, 내림차순
  });
  await install(page);
  let cursorCalls = 0; let release!: () => void; const gate = new Promise<void>((r) => { release = r; });
  await page.route(POSTS_REST, async (r) => {
    const url = decodeURIComponent(r.request().url());   // ⚠ 커서는 `or=(created_at.lt.…)` 인데 URL 에서는 `or=%28…` 라 디코드해야 잡힌다
    // ⚠ searchPosts 만 잡는다 — getPosts 의 pinned(limit=10)·bumped(limit=10) 요청도 'limit≠50' 이라 여기 걸리면
    //   SERVER 15건이 App.posts 로 흘러들어(posts=18) 게시판 자체 조회가 안 나가고 스냅샷 cursor=null 이 된다(실측 3/4 실패의 정체).
    const isSearch = /order=created_at\.desc,id\.desc&/.test(url) && /[?&]limit=15/.test(url) && !/pinned_at|bumped_until/.test(url);
    const isCursor = /or=\(/.test(url);
    if (isSearch && !isCursor) return json(r, SERVER);                       // 첫 페이지 꽉 참 → nextCursor 있음(done=false)
    if (isCursor) { cursorCalls += 1; if (cursorCalls === 1) await gate; return json(r, []); } // 목록의 2페이지는 붙잡고, 상세의 이어받기는 즉시 []
    return r.fallback();
  });
  await stabilizeBackstack(page);
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  const bar = page.locator('[data-community-secbar]');
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await bar.getByRole('button', { name: '게시판', exact: true }).click();
  await expect(page.getByText('서버 12번 글').filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 }); // 3 + 12 = 첫 15칸
  // 끝까지 스크롤 → 목록이 15칸 더 열고(3+15=18) 서버 2페이지를 청한다(붙잡힘 = loading)
  // 끝까지 스크롤은 한 번으로 부족하다(IntersectionObserver 센티널이 첫 프레임에 안 잡히면 visible 이 안 는다 — 실측 2/4) — 보일 때까지 되풀이.
  await expect.poll(async () => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    return page.getByText('서버 15번 글').filter({ visible: true }).count();
  }, { timeout: 15_000, intervals: [250, 500, 1000], message: '목록이 15칸 더 열리지 않았다(센티널)' }).toBeGreaterThan(0);
  // ⚠ 'loading' 속성만 기다리면 부족하다 — dev(StrictMode) 는 첫 페이지를 두 번 받아 그 두 번째로도 loading 이 켜진다(실측 3/3 실패).
  //   목록의 2페이지 요청(첫 커서 호출)이 실제로 나가 붙잡힌 것을 본 뒤에 연다 — 그래야 상세의 호출이 2번째가 되어 [] 를 받는다.
  await expect.poll(() => cursorCalls, { timeout: 10_000, message: '목록의 2페이지(커서) 요청이 나가지 않았다' }).toBe(1);
  await expect(page.locator('[data-board-loaded="loading"]')).toHaveCount(1, { timeout: 10_000 });
  await openFromList(page, '서버 15번 글');   // 지금 보이는 마지막 글 — 목록은 아직 done 이 아니다
  await expect(navBtn(page, 'next')).toHaveAttribute('data-pd-nav-edge', 'more');
  await expect(navBtn(page, 'next')).toBeEnabled();
  await expect(navBtn(page, 'next')).toContainText('다음 글 불러오기');
  await navBtn(page, 'next').click();          // 상세가 자기 커서로 이어받는다(2번째 커서 호출) → [] → done
  await expect(navBtn(page, 'next')).toHaveAttribute('data-pd-nav-edge', 'end', { timeout: 10_000 });
  await expect(navBtn(page, 'next')).toBeDisabled();
  await expect(navBtn(page, 'next')).toContainText('마지막 글이에요');
  await expect(dialog(page).locator('[data-pd-title]').first()).toHaveText('서버 15번 글');
  expect(cursorCalls, '상세가 실제로 서버를 이어받았다').toBeGreaterThanOrEqual(2);
  release();
});

// ── 배경 스크롤 잠금 — 글을 열고 닫아도 목록 위치를 잃지 않는다 ─────────────────
//
// 🔴 2026-09-19 오너: "게시판 글 클릭하면 한번 밑으로 쭉 내려갔다가 버벅이면서 올라가. 다 그래."
//   원인은 잠금 방식이었다. `html{overflow:hidden}` 으로 잠그면 문서가 스크롤 불가가 되고,
//   모바일 브라우저는 그 순간 **접혀 있던 주소창을 도로 펼친다** — 뷰포트 높이가 바뀌면서
//   `fixed inset-0` 셸이 다시 그려지는 것이 "쭉 내려갔다 올라오는" 움직임이다.
//   → 게시글 상세만 `keepViewport` 로 바꿨다: body 를 `position:fixed; top:-Y` 로 붙잡고
//     html 의 overflow 는 건드리지 않는다(브라우저가 보기에 문서는 계속 스크롤 가능).
//
// ⚠ **주소창 흔들림 자체는 여기서 못 잰다.** 하네스(Pixel 7)에 주소창이 없어 dvh==svh==lvh 다
//   (CLAUDE.md). 그래서 이 검사는 재현 가능한 쪽만 잠근다 — **위치 보존**과 **모드 선택**이다.
//   실기기 확인은 오너 몫이고, 그 사실을 숨기지 않는다.
test('🔴 ⑨ 글을 열고 닫아도 목록 스크롤 위치가 그대로다 (배경 잠금 방식)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page);
  await openBoard(page);
  await page.evaluate(() => window.scrollTo(0, 99999));
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => Math.round(window.scrollY));

  await openFromList(page, '둘째 글 제목');
  const open = await page.evaluate(() => ({
    pos: document.body.style.position,
    top: document.body.style.top,
    htmlOv: document.documentElement.style.overflow,
  }));

  if (before > 0) {
    // 스크롤이 실제로 내려간 경우 — 새 방식(위치 고정)이어야 한다.
    expect(open.pos, `목록이 ${before}px 내려가 있는데 body 를 고정하지 않았다 — 옛 방식이면 주소창이 흔들린다`).toBe('fixed');
    expect(open.top, 'body.top 이 스크롤 위치의 음수가 아니다 — 화면이 맨 위로 튄다').toBe(`-${before}px`);
    expect(open.htmlOv, 'html 의 overflow 를 건드렸다 — 문서가 스크롤 불가가 되면 주소창이 도로 펼쳐진다').not.toBe('hidden');
  } else {
    // 맨 위라 지킬 위치가 없다 — 설계상 **옛 방식으로 물러난다**(방어 원칙 ③).
    expect(open.htmlOv, '맨 위에서는 옛 방식(html overflow hidden)으로 물러나야 한다').toBe('hidden');
    expect(open.pos, '맨 위인데 body 를 고정했다 — 새 경로에 불필요하게 노출된다').not.toBe('fixed');
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => ({
    y: Math.round(window.scrollY),
    pos: document.body.style.position,
    top: document.body.style.top,
    htmlOv: document.documentElement.style.overflow,
  }));
  // 🔴 닫은 뒤 원상복구 — 이걸 빠뜨리면 목록이 맨 위로 튄다(고치려던 것보다 나쁜 증상).
  expect(after.pos, '닫았는데 body 가 fixed 로 남았다 — 페이지 전체가 죽는다').toBe('');
  expect(after.top, '닫았는데 body.top 이 남았다').toBe('');
  expect(after.htmlOv, '닫았는데 html overflow 가 남았다').toBe('');
  expect(after.y, `목록 위치를 잃었다: ${before} → ${after.y}`).toBe(before);
});
