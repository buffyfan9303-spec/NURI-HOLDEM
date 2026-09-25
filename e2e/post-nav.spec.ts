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
  // 2026-09-25: dismissOverlays 의 스킵 매칭(/건너뛰기|닫기|시작하기|확인/)이 PostDetailModal 자체의
  //   "닫기" 헤더 버튼에 걸려, 검사하려던 딥링크 상세를 열자마자 닫아버렸다(부분일치 셀렉터 함정).
  //   stubLogin 이 이미 현재 약관 버전으로 로그인시켜 재동의 게이트가 뜨지 않으니 여기서는 필요 없다.
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
  // 2026-09-25: 위 ⑤와 같은 이유로 제거 — dismissOverlays 가 딥링크 상세 자체를 닫는다.
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
//
// 이 검사는 **같은 날 두 번 뒤집혔다.** 처음에는 원인을 '잠금 방식' 으로 보고 `keepViewport`
// (body position:fixed)를 켰는데, 실측이 그것을 뒤집었다:
//   · 진짜 원인은 `SpotPostCard` 의 로딩 스켈레톤(144.75px)이 **모든 글에** 떴다 사라지며
//     아래가 −145px 튄 것이었다(LayoutShift 0.0806). → `e2e/post-open-stability.spec.ts` 가 잠근다.
//   · `keepViewport` 는 얻는 것 없이 흔들림만 더했다. 같은 조건(390×844 · 목록 y=387):
//       켬 → 열 때 layout-shift **0.0153** · 닫을 때 스크롤 손실 0
//       끔 → 열 때 layout-shift **0**      · 닫을 때 스크롤 손실 **0**
//   ⇒ 되돌렸다. 그래서 이 검사도 **잠금 방식(무엇을 쓰는가)이 아니라 결과(무엇이 지켜지는가)** 를 본다.
//     구현 방식을 단언하면 더 나은 구현으로 바꿀 때마다 검사가 거짓으로 빨개진다.
//
// ⚠ **주소창 흔들림 자체는 여기서 못 잰다.** 하네스(Pixel 7)에 주소창이 없어 dvh==svh==lvh 다
//   (CLAUDE.md). 다만 **두 모드 모두 문서를 스크롤 불가로 만든다**(docH == innerHeight)는 것이
//   실측됐으므로, 주소창 가설은 두 모드를 구별하지 못한다 — keepViewport 를 정당화하지 못한다.
//   실기기 확인은 오너 몫이고, 그 사실을 숨기지 않는다.
test('🔴 ⑨ 글을 열고 닫아도 목록 위치가 그대로고, 여는 동안 배경이 밀리지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page);
  await openBoard(page);
  await page.evaluate(() => window.scrollTo(0, 99999));
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => Math.round(window.scrollY));

  // 🔴 잴 것이 실제로 있어야 한다 — 목록이 맨 위면 '위치 보존' 은 아무것도 단언하지 않는다.
  expect(before, '목록이 스크롤되지 않아 지킬 위치가 없다 — 픽스처가 짧아졌는지 보라(빈 검사 방지)')
    .toBeGreaterThan(56);

  // 여는 동안 **배경이 그대로인가** — 재는 것은 `헤더 높이`와 `scrollY` 다. layout-shift 가 아니다.
  //
  // 🔴 왜 layout-shift 를 안 쓰나 — **두 번 틀렸다. 그 기록을 남긴다.**
  //   1차: 전역 layout-shift 를 그대로 썼더니 0.0568 로 빨개졌다. 그런데 그건 배경이 아니라
  //        **모달 자신의 댓글이 늦게 도착해 자라는 것**이었다(이 픽스처는 댓글을 목킹하지 않는다).
  //        상관없는 것 때문에 빨개지는 검사는 곧 무시당한다.
  //   2차: 그래서 출처가 모달 안인 것을 뺐다. 그러자 이번엔 **아무것도 못 잡았다** —
  //        `keepViewport` 를 다시 켜고 돌렸는데 **그대로 통과했다**(음성 대조 실패).
  //        즉 '아무것도 재지 않는 초록 검사' 를 내가 만든 것이다. 이 저장소 최다 함정을 그대로 밟았다.
  //   ⇒ CLS 는 **여러 원인이 한 숫자로 뭉개지는 지표**라 이 용도에 안 맞는다.
  //     기전을 직접 재라: keepViewport 는 문서를 접어 scrollY 를 0 으로 만들고, 그 스크롤 이벤트가
  //     **헤더 축소를 풀어(47.75 → 60.5)** 배경 전체를 12.75px 내린다. 그 둘은 이진값이라 안 뭉개진다.
  const before2 = await page.evaluate(() => {
    const bell = document.querySelector('button[aria-label^="알림"]')!;
    return { h: +bell.closest('header')!.getBoundingClientRect().height.toFixed(2), y: Math.round(window.scrollY) };
  });
  // 스크롤이 56 을 넘었으니 헤더는 **축소 상태**여야 한다. 아니면 이 검사의 전제가 무너진 것이다.
  expect(before2.h, `열기 전 헤더가 축소 상태가 아니다(${before2.h}) — scrollY ${before2.y} 인데도 그렇다면`
    + ' 헤더 축소 자체가 죽었다. 그 상태로는 아래 단언이 아무것도 재지 못한다.').toBeLessThan(55);

  await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find((n) => n.children.length === 0 && n.textContent?.trim() === '둘째 글 제목');
    (el?.closest('button,a,[role="button"]') as HTMLElement | null)?.click();
  });
  await expect(dialog(page)).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(900);
  const during = await page.evaluate(() => {
    const bell = document.querySelector('button[aria-label^="알림"]')!;
    return { h: +bell.closest('header')!.getBoundingClientRect().height.toFixed(2), y: Math.round(window.scrollY) };
  });
  expect(during.h, `글을 여는 동안 배경 헤더 높이가 ${before2.h} → ${during.h} 로 바뀌었다`
    + ' — 잠금 방식이 문서를 접어 scrollY 를 0 으로 만들고 헤더 축소를 풀었다'
    + '(keepViewport 를 다시 켰거나 같은 성질의 것을 넣었나?). 배경이 그만큼 통째로 밀린다.')
    .toBe(before2.h);
  expect(during.y, `글을 여는 동안 배경 scrollY 가 ${before2.y} → ${during.y} 로 바뀌었다`)
    .toBe(before2.y);

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

// ── ⑩ 실제로 넘치는 이전/다음 제목 — 모바일은 한 줄 말줄임, 원문·목적지는 그대로 ────────────
//
// P3(2026-09-21, §6) — line-clamp-2 를 모바일 단일행 truncate 로 갈아탈 때 **실제로 넘치는 제목**으로
// 재는 계약이 없으면 "짧은 제목만 넣고 통과"하는 빈 검사가 된다. computed CSS 로 확인해야 하는 이유:
// Tailwind `line-clamp`가 `display:-webkit-box`를 남기면 소스만 봐서는 안 보인다.
// ⚠ CSS 가 그리는 `…`은 DOM `textContent`에 없다 — `toContainText('…')`를 쓰지 않는다.
const LONG_PREV_TITLE = '이전 글 제목이 정말로 매우 길어서 작은 버튼 칸 폭을 넘기고 반드시 한 줄을 넘치게 만드는 문장';
const LONG_NEXT_TITLE = '다음글역시매우길고공백이거의없이한글자씩촘촘하게이어지는긴제목이라칸폭을반드시넘칩니다ABCDEFGHIJK';
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('🔴 ⑩ 실제로 넘치는 이전/다음 제목 — 모바일 한 줄 말줄임, DOM 원문·접근 가능한 이름·클릭 목적지는 그대로', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page, [postRow('ov3', LONG_PREV_TITLE), postRow('ov2', '가운데 글'), postRow('ov1', LONG_NEXT_TITLE)]);
  await openBoard(page);
  await openFromList(page, '가운데 글');

  for (const [dir, expected] of [['prev', LONG_PREV_TITLE], ['next', LONG_NEXT_TITLE]] as const) {
    const btn = navBtn(page, dir);
    const textEl = btn.locator('[data-pd-nav-text]');
    await expect(textEl, `${dir} 탐색에 data-pd-nav-text 가 없다`).toHaveCount(1);

    // DOM 원문은 새 JS 절단 없이 그대로 남는다.
    expect((await textEl.textContent())?.trim()).toBe(expected);
    // 시각적 …은 accessible name 계산에 들어가지 않는다 — 원문이 그대로 접근 가능한 이름에 남는다.
    await expect(btn).toHaveAccessibleName(new RegExp(escapeRegExp(expected)));

    // computed CSS 로 실제 한 줄 말줄임인지 확인한다(소스만 보고 판단하지 않는다).
    const g = await textEl.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        overflowX: cs.overflowX, whiteSpace: cs.whiteSpace, textOverflow: cs.textOverflow,
        display: cs.display, webkitLineClamp: cs.webkitLineClamp,
        lineHeight: parseFloat(cs.lineHeight) || 0, height: el.clientHeight,
        scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
      };
    });
    expect(g.overflowX, `${dir} overflow-x 가 hidden 이 아니다(${g.overflowX})`).toBe('hidden');
    expect(g.whiteSpace, `${dir} white-space 가 nowrap 이 아니다(${g.whiteSpace})`).toBe('nowrap');
    expect(g.textOverflow, `${dir} text-overflow 가 ellipsis 가 아니다(${g.textOverflow})`).toBe('ellipsis');
    // Tailwind line-clamp 잔재(display:-webkit-box)가 모바일에 남지 않았는지 computed 로 확인한다.
    expect(g.display, `${dir} 에 -webkit-box(line-clamp 잔재)가 남았다`).not.toBe('-webkit-box');
    expect(g.webkitLineClamp === 'none' || g.webkitLineClamp === '', `${dir} 에 line-clamp(${g.webkitLineClamp})가 걸렸다`).toBeTruthy();
    expect(g.height, `${dir} 텍스트 높이 ${g.height}px — 한 줄(line-height ${g.lineHeight}px)을 넘었다(두 줄로 보임)`).toBeLessThanOrEqual(g.lineHeight + 1);
    // 실제로 넘치지 않으면 이 계약 자체가 빈 검사다 — 픽스처 제목 길이가 짧아졌는지 여기서 드러난다.
    expect(g.scrollWidth - g.clientWidth, `${dir} 실제로 넘치지 않았다 — 이 계약이 빈 검사가 됐다`).toBeGreaterThan(1);
  }

  // 클릭 목적지 — 각각 정확한 이웃 글로 이동한다(잘림은 시각적일 뿐 목적지는 원문 slug 그대로).
  await navBtn(page, 'prev').click();
  await expect(dialog(page).locator('[data-pd-title]').first()).toHaveText(LONG_PREV_TITLE, { timeout: 5_000 });
  await navBtn(page, 'next').click(); // 가운데 글로 복귀
  await expect(dialog(page).locator('[data-pd-title]').first()).toHaveText('가운데 글', { timeout: 5_000 });
  await navBtn(page, 'next').click();
  await expect(dialog(page).locator('[data-pd-title]').first()).toHaveText(LONG_NEXT_TITLE, { timeout: 5_000 });
});
