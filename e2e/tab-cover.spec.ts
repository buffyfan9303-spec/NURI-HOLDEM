// BOTTOM-TAB-SMOOTH (오너 2026-09-23 "본문이 문제") — 하단 대메뉴 전환 **덮개** 계약.
//
// 본문(.tab-pane)은 움직이지 않는다. 본문 위 지면색 덮개 한 장이 opacity 1→0 으로 걷힌다(src/lib/tabCover.ts).
//   · 본문에 opacity/transform 을 걸면 본문 레이어가 승격→해제된다 = §0-a25 삼성 밝기 점프 부류.
//     R3(e2e/mobile-tab-transition.spec.ts)와 같은 이유로 막는다 — 여기는 덮개가 켜진 상태를 본다.
//   · 2차: **기본 켜짐, tabsoft**(opacity 만 280ms · 첫 50ms 거의 불투명 · 긴 감속). `?fx=off` 로 기기별 끄기.
//   · 3차(리드 실측: 프로덕션 GTO 첫 방문 4회 중 3회 '새 본문 첫 프레임에 덮개 없음'): 덮개는 고정 시각이 아니라
//     **목적지 판이 실제로 그려진 뒤** 걷힌다(상한 700ms). 1차 비교용 `?fx=tabfade` 는 지웠다(무시·정리).
//
// 계약(이동마다, 프레임 = rAF 표본):
//   ① 새 본문이 **보이는 첫 프레임**(목적지 판이 보이고 높이가 있으며 '불러오는 중' 스피너가 없음)에 덮개 opacity ≥ 0.9
//   ② 덮개가 깔린 뒤 목적지가 아직 준비 안 된 프레임에서는 덮개가 걷히지 않았다(opacity ≥ 0.9) — 걷힌 뒤에만 본문이 드러난다
//   ③ 280ms · opacity 만 · 중간값이 있다(컷 아님) · 본문/조상 WAAPI 0 · 정착 후 숨김
// 조건: TC0 일반 · TC1 CPU 6배(느린 폰 모사) · TC5 늦은 판 공개(첫 방문 GTO 가 Suspense 폴백 뒤 늦게 공개되는 경우를
//   결정적으로 만든다 — GTO(ToolsPanel) 청크 응답을 붙잡아 두고, 급한 업데이트로 그 탭에 들어간다).
//   ⚠ 2026-09-24 개정: 예전 TC5 는 '프리마운트가 tools 를 방문 처리한 직후·커밋 전에 GTO 탭' 경합에 기댔다.
//     그 경합은 perf① 수정(프리마운트를 React 상태로, e2e/premount-no-fallback.spec.ts)으로 **없어졌다** —
//     탭바 첫 방문은 이제 transition 이라 폴백이 커밋되지 않는다. 남은 급한 첫 방문 경로(로그인 뒤 보던 탭 복원,
//     App 의 restoreActionFor → setActiveTab)에 청크 지연을 걸어 '판이 아직 안 섰다' 를 새로 만든다.
//
// 음성 대조(2026-09-24 3차 확인): playTabCover 가 준비를 기다리지 않고(고정 시각) 바로 걷으면 TC5 의 ①② 가 빨개진다.
//   (개정 TC5 도 같은 음성 대조로 확인 — tabCover.ts 대기 제거 사본에서 빨강, 복원 후 해시 일치.)
//   본문에 opacity 를 걸면 '본문 WAAPI 0' 이, TAB_COVER_DEFAULT_ON=false 면 TC0 이 빨개진다(2차 기록).
// 실행: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/tab-cover.spec.ts
//  ⚠ 하네스 Chromium 만 본다. 삼성 인터넷 GPU 의 밝기는 재현하지 못한다(재현 못 함 ≠ 없음).
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { dismissOverlays, stabilizeBackstack, stubLogin } from './_session';
import { mockSchedules } from './_schedules';

type Frame = { t: number; disp: string; op: number; dur: number; props: string; ready: boolean; spin: boolean };
type Cov = { frames: Frame[]; paneWaapi: string[]; rec: boolean; dest: string };

const RECORDER = () => {
  const frames: Frame[] = [];
  const paneWaapi: string[] = [];
  const state: Cov = { frames, paneWaapi, rec: false, dest: '' };
  (window as unknown as { __cov: Cov }).__cov = state;
  const native = Element.prototype.animate;
  Element.prototype.animate = function patched(this: Element, kf: unknown, opts: unknown) {
    try {
      const pane = this.closest?.('.tab-pane');
      if (pane) paneWaapi.push(`${pane.getAttribute('data-tab')} ${JSON.stringify(kf).slice(0, 80)}`);
      // 본문의 **조상**(main·body 등)에 걸어도 본문 레이어가 승격된다 — 같이 센다.
      else if (this.querySelector?.('.tab-pane')) paneWaapi.push(`ancestor:${this.tagName} ${JSON.stringify(kf).slice(0, 80)}`);
    } catch { /* 계측이 앱을 깨뜨리지 않는다 */ }
    return native.call(this, kf as Keyframe[], opts as KeyframeAnimationOptions);
  } as typeof Element.prototype.animate;
  const loop = (ts: number) => {
    if (state.rec) {
      // 사용자가 보는 '새 본문' — 목적지 판이 보이고 높이가 있으며, 어디에도 '불러오는 중' 스피너가 보이지 않는다.
      //   (구현의 tabPaneReady 와 표식을 일부러 다르게 잡는다 — 클래스가 아니라 접근 이름으로 본다.)
      const pane = document.querySelector<HTMLElement>(`.tab-pane[data-tab="${state.dest}"]`);
      const spin = [...document.querySelectorAll('[aria-label="불러오는 중"]')].some((e) => e.getClientRects().length > 0);
      const ready = !!pane && pane.style.display !== 'none' && pane.offsetHeight > 0 && !spin;
      const cv = document.querySelector<HTMLElement>('[data-tab-cover]');
      const cs = cv ? getComputedStyle(cv) : null;
      const ef = cv?.getAnimations()[0]?.effect as KeyframeEffect | undefined;
      frames.push({ t: ts, ready, spin, disp: cs?.display ?? 'missing', op: cs ? Number(cs.opacity) : -1,
        dur: Number(ef?.getTiming().duration ?? 0),
        props: ef ? [...new Set(ef.getKeyframes().flatMap((k) => Object.keys(k)).filter((k) => !['offset', 'computedOffset', 'easing', 'composite'].includes(k)))].join('+') : '' });
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};

/** App 의 프리마운트 idle(timeout 10000 — App.tsx `idle()` 한 곳만 쓴다)을 붙잡아 테스트가 순서를 정하게 한다. */
const HOLD_PREMOUNT_IDLE = () => {
  const w = window as unknown as { requestIdleCallback?: (cb: IdleRequestCallback, o?: IdleRequestOptions) => number; __iq: IdleRequestCallback[] };
  const native = w.requestIdleCallback?.bind(window);
  const q: IdleRequestCallback[] = [];
  w.__iq = q;
  w.requestIdleCallback = (cb, o) => {
    if (o?.timeout === 10000) { q.push(cb); return 0; }
    return native ? native(cb, o) : window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 }), 1);
  };
};

async function tapNav(page: Page, label: string) {
  const nav = page.getByRole('navigation', { name: '하단 내비게이션' });
  // 라이브 버튼은 접근 이름이 '라이브, 진행 중 N게임' 으로 바뀐다 — 시작 앵커로 좁힌다(부분일치 금지).
  const button = nav.getByRole('button', { name: new RegExp(`^${label}`) });
  await expect(button, `${label} 버튼을 찾지 못했다`).toBeVisible({ timeout: 15_000 });
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }] });
  await page.waitForTimeout(120); // 실제 손가락 — click() 은 누름 0ms
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function startRec(page: Page, tab: string) {
  await page.evaluate((t) => { const c = (window as unknown as { __cov: Cov }).__cov; c.frames.length = 0; c.paneWaapi.length = 0; c.dest = t; c.rec = true; }, tab);
}

/** 정착(덮개가 숨을 때)까지 기다린 뒤 프레임·본문 WAAPI·정착 상태를 돌려준다. */
async function settle(page: Page, tab: string) {
  await expect(page.locator(`.tab-pane[data-tab="${tab}"]`)).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('[data-tab-cover]')!).display), { timeout: 5_000 }).toBe('none');
  await page.waitForTimeout(100);
  return page.evaluate(() => {
    const c = (window as unknown as { __cov: Cov }).__cov;
    c.rec = false;
    const cv = document.querySelector<HTMLElement>('[data-tab-cover]');
    let stored: string | null = 'throw';
    try { stored = localStorage.getItem('nuri:fx'); } catch { /* 계측 */ }
    return {
      frames: c.frames.slice(), paneWaapi: c.paneWaapi.slice(),
      coverInPane: !!cv?.closest('.tab-pane'),
      endDisplay: cv ? getComputedStyle(cv).display : 'missing',
      endAnims: cv ? cv.getAnimations().length : -1,
      stored,
    };
  });
}
type Result = Awaited<ReturnType<typeof settle>>;

async function move(page: Page, label: string, tab: string) {
  await startRec(page, tab);
  await tapNav(page, label);
  return settle(page, tab);
}

/** 계약 ①②③ — 모든 조건(일반·CPU 6배·경합)이 같은 단언을 쓴다. */
function expectCoverContract(r: Result, label: string, sparse = false) {
  const f = r.frames;
  const start = f.findIndex((x) => x.disp === 'block');
  expect(start, `${label}: 덮개가 한 프레임도 깔리지 않았다(기본 켜짐)`).toBeGreaterThanOrEqual(0);
  const firstReady = f.findIndex((x, k) => k >= start && x.ready);
  expect(firstReady, `${label}: 목적지 본문이 보이는 프레임을 한 번도 못 봤다 — 아래 단언이 공허해진다`).toBeGreaterThanOrEqual(0);
  const first = f[firstReady];
  // 측정값 출력(선택): TAB_COVER_LOG=1 — 덮개가 깔린 뒤 새 본문까지의 대기, 그 프레임의 opacity, 스피너 프레임 수
  if (process.env.TAB_COVER_LOG) console.log(`[cover] ${label} wait=${Math.round(first.t - f[start].t)}ms op@ready=${first.op} spin=${f.filter((x) => x.spin).length}`);
  expect(first.disp, `${label}: 새 본문이 보이는 첫 프레임에 덮개가 없다`).toBe('block');
  expect(first.op, `${label}: 새 본문이 보이는 첫 프레임의 덮개 opacity`).toBeGreaterThanOrEqual(0.9);
  const leaked = f.slice(start).filter((x) => !x.ready && (x.disp !== 'block' || x.op < 0.9));
  expect(leaked.map((x) => `${Math.round(x.t)}ms op=${x.op} spin=${x.spin}`), `${label}: 목적지가 준비되기 전에 덮개가 걷혔다(스피너·빈 판이 드러남)`).toEqual([]);
  const run = f.slice(start).filter((x) => x.disp === 'block' && x.dur > 0);
  expect(run.length, `${label}: 덮개 애니메이션을 한 프레임도 못 잡았다`).toBeGreaterThan(0);
  expect([...new Set(run.map((x) => x.dur))], `${label}: 280ms(tabsoft)가 아니다`).toEqual([280]);
  expect([...new Set(run.map((x) => x.props))], `${label}: 덮개가 opacity 외 속성을 움직였다`).toEqual(['opacity']);
  // CPU 6배에서는 긴 태스크가 rAF 표본을 건너뛴다 — 덮개 opacity 는 합성 스레드가 돌려서 화면엔 중간값이 있지만
  //   메인 스레드 표본에는 안 잡힐 수 있다(실측: 라이브 1/3). 그 조건에선 '280ms WAAPI 가 돌았다'(위)로 컷이 아님을 본다.
  if (!sparse) expect(f.slice(firstReady).some((x) => x.disp === 'block' && x.op > 0.05 && x.op < 0.6),
    `${label}: 덮개가 중간값 없이 사라졌다 — 페이드가 아니라 컷이다`).toBe(true);
  expect(r.paneWaapi, `${label}: 본문(.tab-pane)이나 그 조상에 WAAPI 가 시작됐다`).toEqual([]);
  expect(r.coverInPane, '덮개가 .tab-pane 안에 들어갔다').toBe(false);
  expect(r.endDisplay, `${label}: 정착 후에도 덮개가 남아 있다`).toBe('none');
  expect(r.endAnims).toBe(0);
}

async function boot(page: Page, width: number, query: string, extraInit?: () => void) {
  await stabilizeBackstack(page);
  await page.setViewportSize({ width, height: 844 });
  await mockSchedules(page);
  await page.addInitScript(RECORDER);
  if (extraInit) await page.addInitScript(extraInit);
  await page.goto('/' + query);
  await dismissOverlays(page);
  await expect(page.locator('.tab-pane[data-tab="home"]')).toBeVisible();
}

// 첫 방문 GTO 를 맨 앞에 — lazy 청크·프리마운트 경합이 걸리는 자리다.
const ROUTE = [['GTO', 'tools'], ['커뮤니티', 'community'], ['라이브', 'live'], ['캘린더', 'calendar'], ['홈', 'home']] as const;

for (const cpu of [1, 6]) {
  test(`🔴 TC${cpu === 1 ? 0 : 1} — 기본(스위치 없음, 390${cpu > 1 ? ', CPU 6배' : ''}) 5개 탭: 새 본문 첫 프레임 덮음 · 준비 뒤에만 걷힘 · 280ms opacity 만 · 본문 WAAPI 0 · 정착 후 숨김`, async ({ page }) => {
    test.setTimeout(cpu > 1 ? 180_000 : 90_000);
    await boot(page, 390, '');
    if (cpu > 1) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: cpu });
    for (const [label, tab] of ROUTE) {
      const r = await move(page, label, tab);
      expectCoverContract(r, `${label}(cpu${cpu})`, cpu > 1);
      expect(r.stored, '기본값은 저장소에 아무것도 쓰지 않는다').toBeNull();
    }
  });
}

/** GTO 판 청크를 붙잡는 시간. 덮개의 준비 대기 상한(TAB_COVER_WAIT_MAX_MS 700)보다 **충분히 짧아야** 한다 —
 *  상한을 넘기면 덮개는 준비와 상관없이 걷히는 게 설계라(영원히 덮지 않는다) 계약 ②가 설계대로 빨개진다.
 *  실측(dev 4297): 400ms 지연이면 덮개 대기 583~617ms 로 상한까지 여유가 80ms 뿐이라 200ms 로 둔다
 *  (React 폴백 스로틀 ~300ms + 하위 모듈 로딩이 더해진다). 폴백은 여전히 덮개 280ms 보다 길게 선다. */
const TOOLS_CHUNK_DELAY_MS = 200;

// ⚠ 서비스 워커를 막는다 — 운영 빌드(sw.js: skipWaiting + clients.claim)는 부팅 직후 페이지를 장악하고 /assets 를
//   SW 가 가져온다. page.route 는 SW 가 응답한 요청을 못 가로채서 청크 지연이 걸리지 않았다
//   (2026-09-24 실측 4173/4299: held=0 4/4 · 같은 조건 serviceWorkers 'block' 이면 held=1). dev 엔 SW 가 없어 몰랐다.
//   font-strategy-measure·perf-baseline 이 쓰는 같은 옵션을, _fixtures 쓰기 가드를 잃지 않게 test.use 로 준다.
test.describe('TC5 — 서비스 워커 없음', () => {
  test.use({ serviceWorkers: 'block' });

  test('🔴 TC5 — 늦은 판 공개: 첫 방문 GTO 청크가 늦어 폴백이 먼저 서도 덮개는 새 본문이 그려진 뒤에 걷힌다', async ({ page }) => {
    test.setTimeout(90_000);
    // ① 급한 첫 방문 경로 = 로그인 뒤 보던 탭 복원(App restoreActionFor → setActiveTab). 네트워크 없는 세션.
    await stubLogin(page);
    await stabilizeBackstack(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await mockSchedules(page);
    // ② GTO 판 청크를 붙잡는다(dev: /src/…/ToolsPanel.tsx · prod: /assets/ToolsPanel-*.js).
    let held = 0;
    await page.route(/\/ToolsPanel[^/?]*\.(tsx|js)(\?|$)/, async (route) => {
      held++;
      await new Promise((res) => setTimeout(res, TOOLS_CHUNK_DELAY_MS));
      await route.continue();
    });
    await page.addInitScript(RECORDER);
    // 프리마운트·청크 데우기(idle)를 붙잡아 tools 가 미리 마운트·로드되지 않게 한다.
    await page.addInitScript(HOLD_PREMOUNT_IDLE);
    await page.addInitScript(() => {
      try { localStorage.setItem('nuri:view-intent', JSON.stringify({ kind: 'tab', id: 'tools', at: Date.now() })); } catch { /* noop */ }
      const c = (window as unknown as { __cov: Cov }).__cov;
      c.dest = 'tools'; c.rec = true; // 복원은 부팅 중에 일어난다 — 처음부터 기록한다
    });
    await page.goto('/');
    const r = await settle(page, 'tools');
    // 전제(청크 지연이 만든 조건): 청크를 실제로 붙잡았고, 덮개가 깔린 뒤 '판이 아직 안 선' 프레임(폴백 스피너)이 있었다.
    expect(held, 'GTO 청크 요청을 붙잡지 못했다 — 이미 로드됐다(전제 없음)').toBeGreaterThanOrEqual(1);
    const start = r.frames.findIndex((x) => x.disp === 'block');
    const waiting = r.frames.slice(Math.max(start, 0)).filter((x) => x.spin && !x.ready).length;
    expect(waiting, '덮개가 깔린 뒤 판이 아직 안 선 프레임이 없다 — 이 테스트가 지키는 조건이 없다').toBeGreaterThanOrEqual(1);
    expectCoverContract(r, 'GTO(늦은 공개)');
  });
});

test('🔴 TC2 — ?fx=off 는 그 기기에서 덮개를 한 프레임도 그리지 않고, URL 없이 다시 와도 꺼진 채다 · 지운 ?fx=tabfade 는 무시된다', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, 390, '?fx=off');
  let r = await move(page, 'GTO', 'tools');
  expect(r.frames.length, '프레임을 못 모았다 — 공허한 통과').toBeGreaterThan(3);
  expect(r.frames.filter((f) => f.disp !== 'none'), '?fx=off 인데 덮개가 그려졌다').toEqual([]);
  expect(r.stored).toBe('off');
  // 같은 기기에서 URL 없이 재방문 — 저장값이 유지된다
  await page.goto('/');
  await dismissOverlays(page);
  await expect(page.locator('.tab-pane[data-tab="home"]')).toBeVisible();
  r = await move(page, 'GTO', 'tools');
  expect(r.frames.length).toBeGreaterThan(3);
  expect(r.frames.filter((f) => f.disp !== 'none'), '재방문에서 off 가 풀렸다').toEqual([]);
  expect(r.stored).toBe('off');
  // ?fx=tabsoft 로 다시 켠다
  await page.goto('/?fx=tabsoft');
  await dismissOverlays(page);
  await expect(page.locator('.tab-pane[data-tab="home"]')).toBeVisible();
  r = await move(page, 'GTO', 'tools');
  expect(r.frames.some((f) => f.disp === 'block'), '?fx=tabsoft 로 다시 켜지지 않았다').toBe(true);
  expect(r.stored).toBe('tabsoft');
  // 3차: ?fx=tabfade 는 지운 값 — 무시되고(저장값 tabsoft 유지) 덮개는 280ms 그대로
  await page.goto('/?fx=tabfade');
  await dismissOverlays(page);
  await expect(page.locator('.tab-pane[data-tab="home"]')).toBeVisible();
  r = await move(page, 'GTO', 'tools');
  expect([...new Set(r.frames.filter((f) => f.dur > 0).map((f) => f.dur))], '?fx=tabfade 가 아직 160ms 로 산다').toEqual([280]);
  expect(r.stored).toBe('tabsoft');
});

// 🔵 2026-09-24 MOTION-UNIFY — 뒤집었다. 종전 TC3 는 "PC 는 View Transition 이 맡으므로 덮개를 그리지 않는다" 였다.
//   오너: "PC 던 모바일이던 하나를 부드럽게 바꾸면 나머지 모든 페이지에서도 동일하게" — PC 메인 탭도 같은 덮개를 탄다
//   (PC 재방문 VT 0.12s·PC 첫 방문 하드컷을 대체). 덮개는 GNB 밑·콘텐츠 열 폭만 덮는다(좌우 채움 배경·GNB 는 안 덮는다).
//   프레임 계약 전체(①②③)는 e2e/motion-unify.spec.ts MU2 가 1440·CPU 4배로 잰다 — 여기는 1024 경계의 자리만 본다.
test('TC3 — PC 폭(1024)도 같은 덮개를 탄다 — GNB 밑에서 시작하고, 정착 후 숨는다', async ({ page }) => {
  test.setTimeout(60_000);
  await boot(page, 1024, '');
  await startRec(page, 'tools');
  await page.locator('[data-stack-tabbar]').getByRole('tab', { name: 'GTO', exact: true }).click();
  const r = await settle(page, 'tools');
  expect(r.frames.length).toBeGreaterThan(3);
  expect(r.frames.some((f) => f.disp === 'block' && f.op >= 0.9), 'PC 에서 덮개가 한 프레임도 깔리지 않았다').toBe(true);
  const geo = await page.evaluate(() => ({
    top: parseFloat(document.querySelector<HTMLElement>('[data-tab-cover]')!.style.top),
    gnb: document.querySelector('[data-stack-tabbar]')!.getBoundingClientRect().bottom,
  }));
  expect(geo.top, '덮개가 PC GNB(활성 밑줄)를 덮는다').toBeGreaterThanOrEqual(geo.gnb - 0.5);
  expect(r.paneWaapi, '본문(.tab-pane)이나 그 조상에 WAAPI 가 시작됐다').toEqual([]);
  expect(r.endDisplay).toBe('none');
});

test.describe('동작 줄이기', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });
  test('TC4 — prefers-reduced-motion 이면 기본 켜짐이라도 덮개가 없다', async ({ page }) => {
    test.setTimeout(60_000);
    await boot(page, 390, '');
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      '감소 모드가 적용되지 않았다 — 공허한 통과').toBe(true);
    const r = await move(page, 'GTO', 'tools');
    expect(r.frames.length).toBeGreaterThan(3);
    expect(r.frames.filter((f) => f.disp !== 'none')).toEqual([]);
  });
});
