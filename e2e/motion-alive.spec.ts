// '움직여야 하는 것이 실제로 움직이는가' 가드 (오너 2026-10-05: "중간에 수정했을 때에도 외치기 흐르는 게 멈추는 오류를 못 잡았잖아 — 이런 부분까지 꼼꼼하게").
//
// 기존 스펙은 '위치가 맞다·점프가 없다'를 봤다. 그래서 줄이 통째로 **정지**해도 초록이었다(정적 말줄임은 점프가 0 이다).
// 여기서는 반대로 '시간이 흐르면 실제로 변한다 / 누르면 실제로 반응한다'만 잰다. 매 항목은 **0개 수집으로 거짓 PASS** 하지 않도록
// 측정 프레임 수·요소 존재를 먼저 단언한다.
//   ① 외치기 줄(안내·유료 긴 문구)의 트랙 translateX 가 1배속 2초 동안 계속 바뀐다. 정지 프레임 < 10%.
//   ② 홈 배너: **자동 넘김이 사양에 없다**(PosterCarousel 머리 주석 ③ — 오너 결정 §6-2). 그래서 자동 넘김은 skip(사유 명시),
//      대신 '점·화살표를 누르면 실제로 다음 장으로 가고 점 상태가 따라온다'를 잰다.
//   ③ 하단 탭 알약(data-main-tab-pill 불투명도 교차)·커뮤니티 하위 탭 SlidingPill(실제 이동 후 활성 칸 정착).
//   ④ 게시판 '맨 위로'(스크롤하면 나타나고 실터치로 눌린다)·글쓰기 FAB(실터치로 눌려 로그인 시트가 열린다).
//   ⑤ 시트 열기·닫기 전환이 끝까지 간다(열림 = 진행 중 애니메이션 0 · 닫힘 = DOM 제거).
//   ⑥ 동작 줄이기 켜면 ①은 정적 말줄임(반대 계약).
// 🔴 main(#177 미병합)에서 ① '안내 문구' 는 실패가 정상이다 — 안내 줄이 정적 truncate 라 흐르는 트랙이 없다. fixme 로 가리지 않는다.
// 390 × 다크·라이트. 모든 외부 데이터는 목킹, 운영 쓰기 0(_fixtures 가 쓰기를 끊는다).
// 실행: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/motion-alive.spec.ts --project=mobile-chromium
import type { Page, Route } from '@playwright/test';
import { test, expect } from './_fixtures';
import { stabilizeBackstack, dismissOverlays } from './_session';

test.use({ hasTouch: true });

const SCHEMES = ['dark', 'light'] as const;
const LONG = '오늘 저녁 강남 홀덤펍 메인 이벤트 같이 가실 분 구합니다 연락 주세요';
const j = (r: Route, body: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function prep(page: Page, scheme: (typeof SCHEMES)[number], reduced = false) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.addInitScript((s) => { try { localStorage.setItem('nuri-theme', s); } catch { /* 차단 환경 */ } }, scheme);
  await stabilizeBackstack(page);
}

const shoutRow = (t0: number, message: string) => ({
  id: 'alive-a', user_id: 'u-alive-a', nickname: '포커왕김씨', message, cost: 50, tier: 'basic', tier_rank: 1, color: null,
  created_at: new Date(t0 - 2000).toISOString(), plays_at: new Date(t0 - 1000).toISOString(), expires_at: new Date(t0 + 300_000).toISOString(),
});

async function mountShout(page: Page, paid: boolean) {
  const t0 = Date.now();
  await page.route('**/rest/v1/community_shouts*', (r) => j(r, paid ? [shoutRow(t0, LONG)] : []));
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  await expect(page.getByTestId(paid ? 'shout-live' : 'shout-idle')).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(500);
}

/** 1배속으로 ms 동안 매 프레임 트랙 translateX 를 모은다. 트랙이 없으면 tx=NaN 프레임이 쌓인다(= 정적 줄). */
const sampleTrack = (page: Page, sel: string, ms: number) => page.evaluate(async ({ sel, ms }) => {
  const out: { txt: string; tx: number }[] = [];
  const t0 = performance.now();
  await new Promise<void>((done) => {
    const tick = () => {
      const track = document.querySelector(sel)?.querySelector<HTMLElement>('.marquee-loop');
      out.push(track
        ? { txt: (track.textContent ?? '').slice(0, 8), tx: new DOMMatrix(getComputedStyle(track).transform).m41 }
        : { txt: '', tx: NaN });
      if (performance.now() - t0 < ms) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  });
  return out;
}, { sel, ms });

// ── ① 외치기 줄이 실제로 흐른다 ─────────────────────────────────────────────
for (const scheme of SCHEMES) for (const [name, paid, sel] of [
  ['안내 문구(운영 방송 0건)', false, '[data-testid="shout-idle"]'],
  ['유료 긴 문구', true, '[data-testid="shout-live"]'],
] as const) {
  test(`① ${scheme} ${name}: 2초 동안 트랙 transform 이 계속 변한다(정지 줄 아님)`, async ({ page }) => {
    await prep(page, scheme);
    await mountShout(page, paid);
    const f = await sampleTrack(page, sel, 2000);
    expect(f.length, '측정 프레임이 너무 적다').toBeGreaterThan(40);
    const noTrack = f.filter((x) => !Number.isFinite(x.tx)).length;
    expect(noTrack, `흐르는 트랙(.marquee-loop)이 없는 프레임 ${noTrack}/${f.length} — 줄이 정적이다`).toBe(0);
    // 안내 문구는 20초 격자로 다음 줄로 바뀐다 — 문구가 바뀐 프레임 쌍은 뺀다
    const pairs = f.slice(1).map((x, i) => [f[i], x] as const).filter(([p, x]) => p.txt === x.txt);
    expect(pairs.length, '같은 문구의 프레임 쌍이 없다').toBeGreaterThan(30);
    const still = pairs.filter(([p, x]) => Math.abs(x.tx - p.tx) < 0.01).length;
    expect(still / pairs.length, `정지 프레임 ${still}/${pairs.length}`).toBeLessThan(0.1);
    const moved = Math.abs(f[f.length - 1].tx - f[0].tx);
    expect(moved, `2초 동안 총 이동 ${moved.toFixed(1)}px`).toBeGreaterThan(5);
  });
}

// ── ⑥ 동작 줄이기: 반대 계약 — 정지하고 말줄임이다 ───────────────────────────
for (const scheme of SCHEMES) {
  test(`⑥ ${scheme} 동작 줄이기: 유료 긴 문구는 흐르지 않고 말줄임으로 선다`, async ({ page }) => {
    await prep(page, scheme, true);
    await mountShout(page, true);
    const r = await page.evaluate(async () => {
      const card = document.querySelector('[data-testid="shout-live"]')!;
      const txs: number[] = [];
      for (let i = 0; i < 20; i++) {
        const t = card.querySelector<HTMLElement>('.marquee-loop');
        if (t) txs.push(new DOMMatrix(getComputedStyle(t).transform).m41);
        await new Promise((res) => setTimeout(res, 50));
      }
      const els = [card, ...card.querySelectorAll<HTMLElement>('*')];
      const ell = els.filter((e) => getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth);
      const running = card.getAnimations({ subtree: true }).filter((a) => a.playState === 'running' && String((a as CSSAnimation).animationName ?? '') === 'marquee-loop').length;
      return { txs, ell: ell.length, running, text: (card.textContent ?? '').includes('강남') };
    });
    expect(r.text, '유료 문구가 카드에 없다(전제 실패)').toBe(true);
    expect(r.running, '동작 줄이기인데 marquee-loop 애니메이션이 돌고 있다').toBe(0);
    expect(new Set(r.txs.map((x) => Math.round(x * 100))).size, `1초 동안 transform 이 변했다: ${r.txs.slice(0, 5)}`).toBeLessThanOrEqual(1);
    expect(r.ell, '말줄임(text-overflow:ellipsis + 실제 잘림) 요소가 없다').toBeGreaterThan(0);
  });
}

// ── ② 홈 배너 ─────────────────────────────────────────────────────────────────
const banner = (id: string, title: string, sort: number) => ({ id, title, subtitle: null, image_url: '/nuri-logo.png', link_url: null, active: true, sort_order: sort, starts_at: null, ends_at: null });

// ② 홈 배너 자동 넘김 — 사양에 없다(PosterCarousel 머리 주석 ③: 자동 넘김 없음, 수동 점·화살표만).
//   자동 넘김은 사양이 아니다(§6-2 오너 결정). 아래 수동 조작 항목이 대신 살아 있음을 지킨다. 자동 넘김을 도입하면 이 skip 을 실측으로 바꿔라.

for (const scheme of SCHEMES) {
  test(`② ${scheme} 홈 배너(대체): '다음 배너'를 누르면 실제로 다음 장으로 스크롤되고 카운터가 따라온다`, async ({ page }) => {
    await prep(page, scheme);
    await page.route(/\/rest\/v1\/rpc\/event_board/, (r) => j(r, null));
    await page.route(/\/rest\/v1\/home_banners\?/, (r) => j(r, [banner('a', '배너 A', 1), banner('b', '배너 B', 2), banner('c', '배너 C', 3)]));
    await page.goto('/');
    await dismissOverlays(page);
    const vp = page.getByTestId('home-banner-viewport');
    const dots = page.getByTestId('home-banner-dots');
    await expect.poll(() => dots.locator('button').count(), { timeout: 20_000, message: '배너 점이 3개 미만(목킹한 배너가 안 그려졌다)' }).toBeGreaterThanOrEqual(3); // 브랜드·이벤트 장이 뒤에 붙어 3보다 많을 수 있다
    await page.waitForTimeout(600);
    const left = () => vp.evaluate((el) => el.scrollLeft);
    const l0 = await left();
    const counter = page.getByTestId('home-banner-counter');
    await expect(counter).toHaveAttribute('aria-label', /1번째/);
    // 점 버튼은 display:none(e2e 손잡이) — 사람이 누르는 건 '다음 배너' 화살표다.
    await page.getByRole('button', { name: '다음 배너' }).click();
    await expect.poll(left, { timeout: 4000, message: '다음 배너를 눌러도 트랙이 움직이지 않았다' }).toBeGreaterThan(l0 + 100);
    await expect(counter).toHaveAttribute('aria-label', /2번째/);
    await expect(dots.locator('button[aria-label="2번째 배너"]')).toHaveAttribute('aria-current', 'true');
    await expect(dots.locator('button[aria-label="1번째 배너"]')).not.toHaveAttribute('aria-current', 'true');
  });
}

// ── ③ 하단 탭·커뮤니티 하위 탭 알약 ─────────────────────────────────────────
for (const scheme of SCHEMES) {
  test(`③ ${scheme} 하단 탭: 다른 탭을 누르면 알약이 실제로 넘어가고 aria-current 가 따라온다`, async ({ page }) => {
    await prep(page, scheme);
    await page.goto('/?tab=community');
    await dismissOverlays(page);
    const nav = page.getByRole('navigation', { name: '하단 내비게이션' });
    const cells = nav.locator('[data-main-tab]');
    await expect(cells.first()).toBeVisible({ timeout: 25_000 });
    const n = await cells.count();
    expect(n, '하단 탭 칸 수').toBeGreaterThanOrEqual(4);
    const state = () => cells.evaluateAll((els) => els.map((e) => ({
      cur: e.getAttribute('aria-current') === 'page',
      op: Number(getComputedStyle(e.querySelector('[data-main-tab-pill]')!).opacity),
    })));
    await page.waitForTimeout(500);
    const before = await state();
    const from = before.findIndex((c) => c.cur);
    expect(from, '시작 활성 칸이 없다').toBeGreaterThanOrEqual(0);
    expect(before[from].op, '활성 칸 알약이 안 보인다(전제 실패)').toBeGreaterThan(0.5);
    const to = from === 0 ? 1 : 0;
    await cells.nth(to).click();
    await expect.poll(async () => (await state())[to].cur, { timeout: 8000, message: 'aria-current 가 새 칸으로 안 옮겨졌다' }).toBe(true);
    await expect.poll(async () => (await state())[to].op, { timeout: 4000, message: '새 칸 알약이 켜지지 않았다' }).toBeGreaterThan(0.5);
    await expect.poll(async () => (await state())[from].op, { timeout: 4000, message: '옛 칸 알약이 꺼지지 않았다' }).toBeLessThan(0.1);
    const after = await state();
    expect(after.filter((c) => c.cur).length, '활성 칸은 정확히 하나').toBe(1);
  });

  test(`③ ${scheme} 커뮤니티 하위 탭: SlidingPill 이 실제로 이동해 활성 칸에 정착한다`, async ({ page }) => {
    await prep(page, scheme);
    await page.goto('/?tab=community');
    await dismissOverlays(page);
    const bar = page.locator('[data-community-secbar]');
    await expect(bar).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(800);
    const read = () => bar.evaluate((b) => {
      const pill = b.querySelector<HTMLElement>('[data-sliding-pill]');
      const act = b.querySelector<HTMLElement>('[data-pill-active]');
      if (!pill || !act) return null;
      const pr = pill.getBoundingClientRect(), ar = act.getBoundingClientRect();
      return { pl: pr.left, al: ar.left, dx: Math.abs(pr.left - ar.left), id: act.closest('button')?.getAttribute('data-testid') ?? '' };
    });
    const a = await read();
    expect(a, '알약·활성 칸 요소가 없다').not.toBeNull();
    // 지금 활성이 아닌 칸을 하나 고른다(보이는 것 중 활성과 다른 첫 칸)
    const ids = await bar.locator('[data-testid^="sec-tab-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!));
    const target = ids.find((id) => id !== a!.id && id !== 'sec-tab-market');
    expect(target, '눌러 볼 다른 하위 탭이 없다').toBeTruthy();
    await bar.getByTestId(target!).evaluate((el) => (el as HTMLElement).click());
    await expect.poll(async () => (await read())?.id, { timeout: 8000, message: '활성 칸이 안 바뀌었다' }).toBe(target);
    // 정착: 알약 좌측이 활성 칸 좌측에 1px 안으로 붙고, 알약의 진행 중 애니메이션이 끝나 있다
    await expect.poll(async () => (await read())!.dx, { timeout: 5000, message: '알약이 활성 칸에 정착하지 않았다' }).toBeLessThan(1);
    const b = await read();
    expect(Math.abs(b!.pl - a!.pl), `알약이 이동하지 않았다(${a!.pl.toFixed(1)} → ${b!.pl.toFixed(1)})`).toBeGreaterThan(5);
    // dx<1 는 스프링 꼬리에서도 먼저 만족할 수 있다 — 애니메이션이 실제로 끝날 때까지 폴링(끝나지 않으면 실패)
    await expect.poll(() => bar.evaluate((el) => el.querySelector('[data-sliding-pill]')!.getAnimations().filter((x) => x.playState === 'running').length), { timeout: 4000, message: '정착 뒤에도 알약 애니메이션이 돌고 있다' }).toBe(0);
  });
}

// ── ④ 게시판 '맨 위로'·글쓰기 FAB ─────────────────────────────────────────────
const longFeed = (page: Page) => page.route(/\/rest\/v1\/community_posts\?/, (r) => {
  if (r.request().method() !== 'GET') return r.fallback();
  return j(r, Array.from({ length: 24 }, (_, i) => ({
    id: `alive-${i}`, user_id: `u-alive-${i}`, user_name: `작성자${i}`, user_role: 'user', user_color: '#888', user_avatar: null,
    content: `본문 ${i}`, created_at: new Date(Date.UTC(2026, 8, 30, 12) - i * 3600_000).toISOString(),
    like_count: 0, comment_count: 0, view_count: 0, category: 'free', title: `목록 길이용 글 ${i}`, images: [],
    badbeat_count: 0, goodrun_count: 0, blinded: false, cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
  })));
});

async function openBoard(page: Page) {
  await longFeed(page);
  await page.goto('/?tab=community');
  await dismissOverlays(page);
  await page.locator('[data-testid="sec-tab-board"]').first().waitFor({ timeout: 25_000 });
  await page.evaluate(() => (document.querySelector('[data-testid="sec-tab-board"]') as HTMLElement).click());
  await expect(page.getByTestId('board-search-open'), '게시판이 안 열렸다').toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
}

/** CDP 실터치: 누르고 hold ms 뒤 뗀다(Playwright click 은 0ms 라 :active/transform 부류를 못 잡는다). */
async function touchPress(page: Page, sel: string, hold = 110) {
  const box = await page.locator(sel).first().boundingBox();
  expect(box, `${sel} 의 위치를 못 쟀다`).not.toBeNull();
  const cdp = await page.context().newCDPSession(page);
  const p = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
  await page.waitForTimeout(hold);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

for (const scheme of SCHEMES) {
  test(`④ ${scheme} 게시판: 스크롤하면 '맨 위로'가 나타나고 실터치 1회로 맨 위에 도착한다`, async ({ page }) => {
    test.setTimeout(90_000);
    await prep(page, scheme);
    await openBoard(page);
    const fab = page.locator('.scroll-top-fab');
    await expect(fab, "'맨 위로' 버튼이 DOM 에 없다").toHaveCount(1);
    const opTop = await fab.evaluate((e) => Number(getComputedStyle(e).opacity));
    await page.evaluate(() => window.scrollTo({ top: 700, behavior: 'instant' }));
    await expect.poll(() => fab.evaluate((e) => Number(getComputedStyle(e).opacity)), { timeout: 5000, message: "스크롤해도 '맨 위로'가 안 나타난다" }).toBe(1);
    expect(opTop, "맨 위에서는 '맨 위로'가 숨어 있어야 나타남이 의미가 있다").toBeLessThan(1);
    await page.waitForTimeout(700); // 자리 전환 정착
    await page.evaluate(() => { const w = window as unknown as { __c: number }; w.__c = 0; document.querySelector('.scroll-top-fab')!.addEventListener('click', () => { w.__c++; }); });
    await touchPress(page, '.scroll-top-fab');
    await expect.poll(() => page.evaluate(() => Math.round(scrollY)), { timeout: 5000, message: "'맨 위로'를 실터치로 눌렀는데 맨 위에 못 갔다" }).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __c: number }).__c), 'click 이벤트 횟수').toBe(1);
  });

  test(`④ ${scheme} 게시판: 글쓰기 FAB 가 보이고 실터치 1회로 눌려 시트(로그인 유도)가 열린다`, async ({ page }) => {
    test.setTimeout(90_000);
    await prep(page, scheme);
    await openBoard(page);
    const w = page.getByTestId('board-write');
    await expect(w, '글쓰기 FAB 가 안 보인다').toBeVisible();
    expect(await w.evaluate((e) => Number(getComputedStyle(e).opacity)), '글쓰기 FAB 불투명도').toBe(1);
    await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'instant' }));
    await page.waitForTimeout(600);
    await expect(w, '스크롤 뒤에도 글쓰기 FAB 가 보여야 한다').toBeVisible();
    await touchPress(page, '[data-testid="board-write"]');
    await expect(page.getByRole('dialog').first(), '글쓰기 FAB 를 눌렀는데 아무 시트도 안 열렸다').toBeVisible({ timeout: 8000 });
  });
}

// ── ⑤ 시트 열기·닫기 전환이 끝까지 간다 ─────────────────────────────────────
for (const scheme of SCHEMES) {
  test(`⑤ ${scheme} 시트: 열면 전환이 끝나 화면 안에 서고, ESC 로 닫으면 DOM 에서 사라진다`, async ({ page }) => {
    await prep(page, scheme);
    await page.goto('/');
    await dismissOverlays(page);
    await page.waitForSelector('button[aria-label^="알림"]', { timeout: 20_000 });
    await expect(page.getByRole('dialog'), '시작부터 열린 시트가 있다').toHaveCount(0);
    await page.getByRole('button', { name: /로그인/ }).first().click({ timeout: 8000 });
    const dlg = page.getByRole('dialog').first();
    await expect(dlg).toBeVisible({ timeout: 10_000 });
    // 열림 전환 완료: 진행 중 애니메이션 0 · 시트가 뷰포트 안에 걸쳐 있다(첫 프레임 translateY 100% 에 갇히지 않았다)
    await expect.poll(() => dlg.evaluate((d) => d.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length),
      { timeout: 4000, message: '시트 열림 애니메이션이 끝나지 않는다' }).toBe(0);
    const box = await dlg.boundingBox();
    expect(box, '시트 위치를 못 쟀다').not.toBeNull();
    expect(box!.y, `시트 윗변 ${box!.y} 가 화면 밖`).toBeLessThan(844 - 100);
    expect(await dlg.evaluate((d) => Number(getComputedStyle(d).opacity)), '시트 불투명도').toBeGreaterThan(0.9);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog'), '닫은 뒤에도 시트 DOM 이 남아 있다(닫힘 전환이 끝나지 않는다)').toHaveCount(0, { timeout: 5000 });
  });
}
