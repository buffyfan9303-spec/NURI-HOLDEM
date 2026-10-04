// 게시판 '맨 위로' 실터치 누름 · 한 방향 스크롤 왕복 (PR #171 독립 검토 P1·P2, 2026-10-05).
//
// ⑭ P1 — 게시판 scrollY 700(FAB 옆 자리 x271@390)에서 '맨 위로'를 실제 손가락처럼 누르면(CDP 터치 홀드 30~250ms) 0/9 작동했다.
//    원인: 이동량을 transform 에 직접 썼는데, 전역 button:active(같은 특이도·뒤 순서)가 손을 떼는 순간 transform 을
//    translate(var(--tw-translate-x), var(--tw-translate-y)) … scale(.97) 로 갈아 써서 버튼이 오른쪽 기둥(x331)으로 순간이동 → click 이 빈자리.
//    탭바 숨김 자리(translateY 4.5rem)도 같은 원인으로 누르는 동안 76px 위로 튀었다가 돌아왔다(click 은 0.06s 전환 덕에 맞았다).
//    Playwright click/tap 은 누름이 0ms 라 :active 부류를 못 잡는다 — CDP Input.dispatchTouchEvent 로 touchStart→홀드→touchEnd.
// ⑮ P2 — 기준 근처에서 한 방향으로 스크롤하면 '맨 위로'가 왼쪽↔오른쪽을 왕복했다(앞서보기에 방향 없는 |dy| 를 더해 기준이 출렁였다).
//    한 방향 스크롤 20프레임 동안 신호(html[data-board-fab]) 전환 ≤ 1회. 줄인 모션(reduce)에서도 같다(거기선 전환이 즉시라 1프레임 깜빡임으로 보였다).
// 실행: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/board-fab-press.spec.ts --project=mobile-chromium
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays } from './_session';

async function openBoard(page: Page) {
  await stabilizeBackstack(page);
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  await page.locator('[data-testid="sec-tab-board"]').first().waitFor({ timeout: 25_000 });
  await page.evaluate(() => (document.querySelector('[data-testid="sec-tab-board"]') as HTMLElement).click());
  await expect(page.getByTestId('board-search-open'), '한 줄 검색 아이콘이 없다').toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
}

// 운영 익명 피드는 글이 적어 FAB 가 끝 칸에 내려앉는다 — 길게 목킹(board-fab-fling.spec 과 같다)
const longFeed = (page: Page) => page.route(/\/rest\/v1\/community_posts\?/, (r) => {
  if (r.request().method() !== 'GET') return r.fallback();
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Array.from({ length: 24 }, (_, i) => ({
    id: `press-${i}`, user_id: `u-press-${i}`, user_name: `작성자${i}`, user_role: 'user', user_color: '#888', user_avatar: null,
    content: `본문 ${i}`, created_at: new Date(Date.UTC(2026, 8, 30, 12) - i * 3600_000).toISOString(),
    like_count: 0, comment_count: 0, view_count: 0, category: 'free', title: `목록 길이용 글 ${i}`, images: [],
    badbeat_count: 0, goodrun_count: 0, blinded: false, cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
  }))) });
});

const SIZES = [[390, 844], [360, 740], [320, 640]] as const;
const HOLDS = [30, 110, 250] as const;

for (const [w, h] of SIZES) {
  test(`⑭ ${w}×${h}: '맨 위로' 실터치 홀드 30/110/250ms — FAB 옆 자리·탭바 숨김 자리 모두 click 1회 · 맨 위 도착 · 누름 중 위치 튐 ≤3px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: w, height: h });
    await longFeed(page);
    await openBoard(page);
    const cdp = await page.context().newCDPSession(page);
    const fails: string[] = [];
    let ok = 0;
    for (const mode of ['board', 'tabbar-hidden'] as const) for (const hold of HOLDS) {
      const info = await page.evaluate(async (mode) => {
        window.scrollTo({ top: 700, behavior: 'instant' });
        await new Promise((r) => setTimeout(r, 900));                   // 표시(opacity)·자리 전환 정착
        const root = document.documentElement;
        // 탭바 숨김 자리: 게시판 신호만 떼면 같은 버튼이 기본 규칙(탭바 숨김 → translateY)으로 선다. 스크롤 전까지 신호는 다시 안 켜진다.
        if (mode === 'tabbar-hidden') { root.removeAttribute('data-board-fab'); await new Promise((r) => setTimeout(r, 600)); }
        const el = document.querySelector<HTMLElement>('.scroll-top-fab')!;
        const w = window as unknown as { __clk: number; __pos: number[][]; __off?: () => void };
        w.__off?.();
        w.__clk = 0; w.__pos = [];
        const onClick = () => { w.__clk++; };
        el.addEventListener('click', onClick);
        let live = true;
        // 맨 위로 스크롤이 시작되면 탭바가 다시 나오고(세로 자리) 게시판 신호가 다시 켜진다(가로 자리) — 정당한 이동이라
        // 누를 때와 두 신호가 같은 프레임만 모은다(누름 자체가 만든 튐만 남는다).
        const sig0 = root.hasAttribute('data-board-fab'), th0 = root.hasAttribute('data-tabbar-hidden');
        const loop = () => {
          if (!live) return;
          if (root.hasAttribute('data-board-fab') === sig0 && root.hasAttribute('data-tabbar-hidden') === th0) { const b = el.getBoundingClientRect(); w.__pos.push([b.left, b.top]); }
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
        w.__off = () => { live = false; el.removeEventListener('click', onClick); };
        const b = el.getBoundingClientRect();
        return { cx: b.left + b.width / 2, cy: b.top + b.height / 2, x: b.left, y: b.top, op: getComputedStyle(el).opacity,
          sig: root.hasAttribute('data-board-fab'), th: root.hasAttribute('data-tabbar-hidden') };
      }, mode);
      const tag = `${mode} hold${hold}`;
      if (info.op !== '1') { fails.push(`${tag}: 전제 실패 — '맨 위로'가 안 보인다(opacity ${info.op})`); continue; }
      if (mode === 'board' && !info.sig) { fails.push(`${tag}: 전제 실패 — FAB 옆 자리 신호가 없다`); continue; }
      if (mode === 'tabbar-hidden' && !info.th) { fails.push(`${tag}: 전제 실패 — 탭바가 숨지 않았다`); continue; }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: info.cx, y: info.cy }] });
      await page.waitForTimeout(hold);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(250);
      const r = await page.evaluate(async () => {
        const w = window as unknown as { __clk: number; __pos: number[][]; __off?: () => void };
        const t0 = performance.now();
        while (scrollY > 0 && performance.now() - t0 < 2500) await new Promise((res) => setTimeout(res, 50));
        w.__off?.();
        return { clk: w.__clk, y: Math.round(scrollY), pos: w.__pos };
      });
      const jump = Math.max(0, ...r.pos.map(([x, y]) => Math.max(Math.abs(x - info.x), Math.abs(y - info.y))));
      if (r.pos.length < 2) fails.push(`${tag}: 누름 중 위치를 ${r.pos.length}프레임밖에 못 쟀다`);
      else if (r.clk === 1 && r.y === 0 && jump <= 3) ok++;
      else fails.push(`${tag}: click ${r.clk}회 · scrollY ${r.y} · 누름 중 최대 위치 튐 ${jump.toFixed(1)}px`);
    }
    expect(fails, `${w}x${h}: 실터치 누름 실패`).toEqual([]);
    expect(ok, `${w}x${h}: 누름 성공 수`).toBe(HOLDS.length * 2);
  });
}

// 기준 근처 자리(lift L)에서 정착한 뒤 한 방향으로 20프레임 — 일정 속도와 흔들리는 속도(실제 터치 스크롤의 프레임 간 편차)
for (const motion of ['no-preference', 'reduce'] as const) {
  test(`⑮ 390×844 ${motion}: 피드 끝 기준 근처에서 한 방향 스크롤 — '맨 위로' 자리 전환 ≤ 1회(왕복 0)`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: motion });
    await longFeed(page);
    await openBoard(page);
    const res = await page.evaluate(async () => {
      const slot = document.querySelector<HTMLElement>('[data-board-fab-slot]')!;
      const root = document.documentElement;
      const stuck = parseFloat(getComputedStyle(slot).bottom);
      const lift = () => root.clientHeight - stuck - slot.getBoundingClientRect().bottom;
      const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const max = () => root.scrollHeight - innerHeight;
      window.scrollTo({ top: max(), behavior: 'instant' }); await sleep(600);
      const maxLift = lift();
      const pats: Record<string, number[]> = { c2: [2], c4: [4], c8: [8], jit: [3, 9, 4, 12, 2, 7, 1, 10, 5, 3] };
      const bad: string[] = [];
      let cases = 0, nearCases = 0;
      for (const target of [114, 118, 121, 123, 125, 127, 129, 131, 135]) for (const [pn, pat] of Object.entries(pats)) for (const dir of [1, -1]) {
        window.scrollTo({ top: max(), behavior: 'instant' }); await sleep(150);
        for (let k = 0; k < 3; k++) { window.scrollTo({ top: scrollY + (target - lift()), behavior: 'instant' }); await frame(); }
        await sleep(400);                                              // 정착(멈춤 재판정 120ms 포함)
        const L0 = lift();
        if (Math.abs(L0 - target) < 3) nearCases++;
        const seq = [root.hasAttribute('data-board-fab') ? 1 : 0];
        for (let i = 0; i < 20; i++) {
          window.scrollTo({ top: scrollY + dir * pat[i % pat.length], behavior: 'instant' });
          await frame();
          seq.push(root.hasAttribute('data-board-fab') ? 1 : 0);
        }
        cases++;
        let flips = 0; for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) flips++;
        if (flips > 1) bad.push(`lift ${L0.toFixed(1)} ${pn} ${dir > 0 ? '내림(FAB↑)' : '올림(FAB↓)'} 전환 ${flips}회 ${seq.join('')}`);
      }
      return { maxLift, cases, nearCases, bad };
    });
    expect(res.maxLift, `전제: 피드 끝 최대 들림 ${res.maxLift.toFixed(1)}px 가 기준(120) 구간을 넘어야 잴 수 있다`).toBeGreaterThan(132);
    expect(res.nearCases, '전제: 기준 근처 자리에 정착한 경우가 충분해야 한다').toBeGreaterThan(res.cases * 0.8);
    expect(res.bad.slice(0, 6), `한 방향 스크롤 왕복 ${res.bad.length}/${res.cases}건`).toEqual([]);
  });
}
