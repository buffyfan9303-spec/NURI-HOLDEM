/**
 * M7-01(audit7-motion-1005) — 게시판 첫 로드: 글 응답이 늦으면 짧은 '찾는 중…' 카드가 24행 목록으로 바뀌며 아래를 밀었다.
 *
 * 재현: community_posts 응답을 2초 늦춘다(운영 조건에서 0.5초만 넘어도 같다). 입력은 없다.
 *   예전: 짧은 카드(약 100px) → 15행(44px × 15) 교체 — 입력 없는 CLS 0.2638 @390 · 0.2554 @360 · 0.1575 @320, 사업자 푸터가 따라 내려갔다.
 *   지금: 응답 전에 실제 행과 같은 구조의 뼈대(BoardListSkeleton)가 15행 자리를 미리 잡는다 → 교체해도 높이가 같다.
 * 게시판은 기본 진입 칸이 아니다 — 하위 탭(sec-tab-board)을 눌러 열어야 목록이 보인다(안 누르면 display:none 이라 아무것도 안 재진다).
 * 판정을 '뼈대가 있다'가 아니라 **CLS 와 푸터 y** 로 한다 — 뼈대가 있어도 높이가 어긋나면 이 스펙이 잡는다.
 * 대조: 응답이 이미 온 뒤에는 실제 행 15개(`li[role=button]`)가 보여야 한다 — 아무것도 안 그려서 통과하는 가짜 통과를 막는다.
 * 운영 DB 에 쓰지 않는다 — community_posts 읽기는 전부 page.route 로 갈아끼운다.
 */
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays } from './_session';

const feed = () => Array.from({ length: 24 }, (_, i) => ({
  id: `m7-${i}`, user_id: `u-m7-${i}`, user_name: `작성자${i}`, user_role: 'user', user_color: '#888', user_avatar: null,
  content: `본문 ${i}`, created_at: new Date(Date.UTC(2026, 9, 4, 12) - i * 3600_000).toISOString(),
  like_count: 0, comment_count: 0, view_count: 0, category: 'free', title: `첫 로드 CLS 용 글 ${i}`, images: [],
  badbeat_count: 0, goodrun_count: 0, blinded: false, cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
}));

for (const w of [390, 360, 320] as const) {
  test(`🔴 M7-01 게시판 첫 로드 — 글 응답이 2초 늦어도 아래가 밀리지 않는다 (${w})`, async ({ page }) => {
    test.setTimeout(60_000);
    await stabilizeBackstack(page);
    await page.setViewportSize({ width: w, height: 844 });
    // 레이아웃 이동 기록기 — 문서 시작부터 켜 둔다(입력으로 난 이동은 제외)
    await page.addInitScript(() => {
      const w = window as unknown as { __shifts: { v: number; t: number }[] };
      w.__shifts = [];
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean; startTime: number }[]) {
          if (!e.hadRecentInput) w.__shifts.push({ v: e.value, t: e.startTime });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    // 게이트 목 — 응답은 '게시판 탭을 누른 시각 + 2초' 에 연다. 페이지 로드부터 2초를 세면(예전) 탭을 누르기 전에 응답이 와서
    // 뼈대 없이 곧바로 목록이 되거나(측정창 소실) 눌린 뒤에야 오는 순서가 실행마다 달랐다. gate.at 이 정해질 때까지 붙잡는다.
    const gate: { at: number | null } = { at: null };
    await page.route(/\/rest\/v1\/community_posts\?/, async (r) => {
      if (r.request().method() !== 'GET') return r.fallback();
      const giveUp = Date.now() + 40_000; // 탭이 안 열려 gate 가 안 정해져도 영구 대기하지 않는다(테스트 타임아웃보다 먼저 푼다)
      while ((gate.at == null && Date.now() < giveUp) || (gate.at != null && Date.now() < gate.at)) await new Promise((res) => setTimeout(res, 20));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(feed()) }).catch(() => {});
    });
    await page.goto('/?tab=community');
    expect(await page.evaluate(() => innerWidth), '뷰포트 폭이 안 먹었다').toBe(w);
    await dismissOverlays(page);
    await page.locator('[data-testid="sec-tab-board"]').first().waitFor({ timeout: 25_000 });
    // 게시판 하위 탭을 연다(기본 진입은 다른 칸이라 목록이 display:none 이다). locator.click 은 자동 스크롤로 측정을 흔든다 — DOM click.
    gate.at = Date.now() + 2000;
    await page.evaluate(() => (document.querySelector('[data-testid="sec-tab-board"]') as HTMLElement).click());
    await page.locator('[data-sec="board"] [data-board-loaded]').waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(150);
    // 측정 시작점 — 게시판이 떴지만 응답 전. 이 순간의 푸터 y 와 실제 행 수를 잡는다.
    const before = await page.evaluate(() => {
      const w = window as unknown as { __t0: number };
      w.__t0 = performance.now();
      const footer = document.querySelector('[data-testid="business-footer"]') as HTMLElement | null;
      return {
        realRows: document.querySelectorAll('[data-sec="board"] [data-board-loaded] li[role="button"]').length,
        footerY: footer ? Math.round((footer.getBoundingClientRect().top + scrollY) * 100) / 100 : -1,
      };
    });
    expect(before.realRows, '측정 시작 때 이미 글이 그려져 있다 — 응답 지연 창을 재지 못했다(목킹이 안 먹었다)').toBeLessThan(15);
    await expect.poll(() => page.locator('[data-sec="board"] [data-board-loaded] li[role="button"]').count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(15);
    await page.waitForTimeout(1000);
    const after = await page.evaluate(() => {
      const w = window as unknown as { __t0: number; __shifts: { v: number; t: number }[] };
      const footer = document.querySelector('[data-testid="business-footer"]') as HTMLElement | null;
      return {
        cls: w.__shifts.filter((s) => s.t >= w.__t0).reduce((a, s) => a + s.v, 0),
        footerY: footer ? Math.round((footer.getBoundingClientRect().top + scrollY) * 100) / 100 : -1,
      };
    });
    // 푸터가 화면 안에 있을 때만 CLS 로 잡힌다 — 뼈대가 15행(첫 화면 아래까지)을 잡으면 푸터는 접힘선 밖이라 이동이 0 이어야 한다.
    // 푸터가 접힘선 안에 있었다면(뼈대가 짧음) 위치까지 같아야 한다.
    expect(after.cls, `응답 도착 때 입력 없는 레이아웃 이동 합 ${after.cls.toFixed(4)} (푸터 y ${before.footerY} → ${after.footerY})`).toBeLessThan(0.01);
    if (before.footerY < 844) expect(Math.abs(after.footerY - before.footerY), `푸터가 접힘선 안에서 ${before.footerY} → ${after.footerY} 로 밀렸다`).toBeLessThanOrEqual(1);
  });
}

// ③ P2-1·P2-2(PR #180 재검토) — 첫 로드 때는 상단 줄(검색 버튼)이 자리를 먼저 지키고, 검색 중에는 15행 뼈대가 아니라 짧은 '찾는 중…' 카드다.
//   15행 뼈대는 '처음 한 번 + 검색·분류 없음' 일 때만 — 검색 0건/적은 결과는 반드시 줄어드는 자리라, 뼈대를 깔면 푸터가 15행만큼 아래서 올라온다(CLS 0.2).
test('🔴 M7-01 ③ 첫 로드는 상단 줄 자리 예약 + 뼈대, 검색 중에는 뼈대 없이 짧은 카드 (390)', async ({ page }) => {
  test.setTimeout(60_000);
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const gate: { at: number | null; search: boolean } = { at: null, search: false };
  await page.route(/\/rest\/v1\/community_posts\?/, async (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const isSearch = /ilike/.test(decodeURIComponent(r.request().url()));
    const giveUp = Date.now() + 40_000;
    if (isSearch) { while (!gate.search && Date.now() < giveUp) await new Promise((res) => setTimeout(res, 20)); }
    else { while ((gate.at == null && Date.now() < giveUp) || (gate.at != null && Date.now() < gate.at)) await new Promise((res) => setTimeout(res, 20)); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(isSearch ? [] : feed()) }).catch(() => {});
  });
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  await page.locator('[data-testid="sec-tab-board"]').first().waitFor({ timeout: 25_000 });
  gate.at = Date.now() + 2500;
  await page.evaluate(() => (document.querySelector('[data-testid="sec-tab-board"]') as HTMLElement).click());
  const board = page.locator('[data-sec="board"]');
  // 응답 전: 15행 뼈대가 보이고, 같은 순간 상단 줄(검색 버튼)도 이미 자리에 있다
  await expect(board.getByTestId('board-list-loading')).toBeVisible({ timeout: 10_000 });
  // 즉시 판정 — toBeVisible 은 5초 재시도라 응답(2.5초)이 와서 줄이 생기면 거짓 통과한다
  expect(await board.getByTestId('board-search-open').isVisible(), '첫 로드 중 상단 줄이 비어 있다 — 응답이 오면 아래가 44px 밀린다').toBe(true);
  await expect.poll(() => board.locator('li[role="button"]').count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(15);
  await expect(board.getByTestId('board-list-loading')).toHaveCount(0);
  // 검색: 서버 조회가 붙잡힌 동안 뼈대가 아니라 짧은 '찾는 중…' 카드
  await page.evaluate(() => (document.querySelector('[data-testid="board-search-open"]') as HTMLElement).click());
  await page.locator('input[role="searchbox"]').first().fill('없는검색어zq');
  await expect(board.getByText('찾는 중…'), '검색 중 짧은 카드가 안 떴다').toBeVisible({ timeout: 10_000 });
  await expect(board.getByTestId('board-list-loading'), '검색 중에 15행 뼈대가 떴다 — 결과가 적으면 푸터가 크게 올라온다').toHaveCount(0);
  gate.search = true;
  await expect(board.getByText('검색 결과가 없습니다')).toBeVisible({ timeout: 10_000 });
});
