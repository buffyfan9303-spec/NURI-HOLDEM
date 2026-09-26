// BOTTOM-TAB-SMOOTH (오너 2026-09-23 "본문이 문제") — 하단 대메뉴 전환 계약. **5차(2026-09-26 PILL-FLASH)에 뒤집었다.**
//
// 1~4차: 본문 위 지면색 덮개 한 장을 opacity 1 로 깔았다가, 목적지 판이 그려진 뒤 280ms 에 걷었다(src/lib/tabCover.ts).
//   이 스펙은 '새 본문의 첫 프레임에 덮개 opacity ≥ 0.9' 를 요구했다 — 즉 **이미 그려진 본문도 지면색으로 가리라**는 계약이었다.
// 5차: 오너 "pill 을 눌러 이동하면 검정색이 됐다가 다시 콘텐츠가 나와 깜빡인다" — 그 덮개가 바로 깜빡임이었다
//   (재방문에도 ~100ms 지면색 판, 판 휘도가 다크 7.9·라이트 247.4 = 지면색 그대로. root-cause-debugger 실측).
//   덮개를 없앴다(2026-09-26 요소·호출·`?fx=` 스위치까지 App 에서 걷었다). 이 스펙은 이제 **덮개가 한 프레임도 안 그려진다**를 메인 탭 쪽에서 잠근다
//   (하위 탭·픽셀 휘도는 e2e/pill-flash.spec.ts, 하위 탭 전환 프레임은 e2e/motion-unify.spec.ts).
//
// 계약(이동마다, 프레임 = rAF 표본):
//   ① 덮개(`[data-tab-cover]`)가 display none 이 아닌 프레임 0 — 첫 방문·재방문·늦은 판 공개·CPU 6배·PC 폭 모두
//   ② 본문(.tab-pane)과 그 조상에 WAAPI 0 — §0-a25 삼성 밝기 점프 부류(R3 와 같은 이유)
//      단 **떠나는 판 자신의 퇴장(data-pane-leaving · opacity→0)** 은 뺀다 — 2026-09-26 PANE-HANDOFF 의 유일한 모션이고,
//      R3(mobile-tab-transition)가 '출발 판 1건·목적지 0건·기한 안에 걷힘' 으로 따로 잠근다.
//   ③ 목적지 본문이 보이는 프레임을 실제로 봤다(공허 방지)
// 조건: TC0 일반 · TC1 CPU 6배 · TC5 늦은 판 공개(GTO 청크를 붙잡아 Suspense 폴백이 먼저 서는 첫 방문) ·
//   TC2 `?fx=` 옛 스위치 값과 무관(스위치는 걷었다 — 저장소에 아무것도 쓰지 않는다) · TC3 PC 1024 · TC4 동작 줄이기.
// 음성 대조(2026-09-26 실행): 옛 tabCover.ts 빌드(덮개 있음)에 돌리면 TC0·TC1·TC3·TC5 의 ① 이 빨개진다.
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
      if (pane && this === pane && pane.hasAttribute('data-pane-leaving')) { /* 떠나는 판 퇴장 — ② 주석 참고 */ }
      else if (pane) paneWaapi.push(`${pane.getAttribute('data-tab')} ${JSON.stringify(kf).slice(0, 80)}`);
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
  // 덮개 요소는 2026-09-26 에 걷었다 — 없는 것이 곧 '가리지 않음' 이다(있으면 숨어 있어야 한다).
  await expect.poll(() => page.evaluate(() => { const c = document.querySelector('[data-tab-cover]'); return c ? getComputedStyle(c).display : 'none'; }), { timeout: 5_000 }).toBe('none');
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

/** 5차 계약 ①②③ — 모든 조건(일반·CPU 6배·늦은 공개·PC)이 같은 단언을 쓴다. */
function expectNoCover(r: Result, label: string) {
  const f = r.frames;
  expect(f.length, `${label}: 프레임을 못 모았다 — 공허한 통과`).toBeGreaterThan(3);
  expect(f.some((x) => x.ready), `${label}: 목적지 본문이 보이는 프레임을 한 번도 못 봤다 — 아래 단언이 공허해진다`).toBe(true);
  // 'missing' = 부팅 중 덮개 요소가 아직 DOM 에 없던 프레임(TC5 는 부팅부터 기록한다) — 그려진 것이 아니다.
  expect(f.filter((x) => x.disp !== 'none' && x.disp !== 'missing').map((x) => `${Math.round(x.t)}ms op=${x.op}`),
    `${label}: 덮개(지면색 판)가 그려졌다 — 이미 그려진 본문을 가렸다 드러내는 '검정 → 콘텐츠' 깜빡임`).toEqual([]);
  expect(r.paneWaapi, `${label}: 본문(.tab-pane)이나 그 조상에 WAAPI 가 시작됐다`).toEqual([]);
  expect(r.coverInPane, '덮개 요소가 .tab-pane 안에 들어갔다').toBe(false);
  expect(r.endDisplay, `${label}: 덮개 요소가 되살아났다(2026-09-26 걷음)`).toBe('missing');
  expect(r.endAnims).toBe(-1);
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
  test(`🔴 TC${cpu === 1 ? 0 : 1} — 기본(스위치 없음, 390${cpu > 1 ? ', CPU 6배' : ''}) 5개 탭: 덮개 0 프레임 · 본문 WAAPI 0`, async ({ page }) => {
    test.setTimeout(cpu > 1 ? 180_000 : 90_000);
    await boot(page, 390, '');
    if (cpu > 1) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: cpu });
    for (const [label, tab] of ROUTE) {
      const r = await move(page, label, tab);
      expectNoCover(r, `${label}(cpu${cpu})`);
      expect(r.stored, '기본값은 저장소에 아무것도 쓰지 않는다').toBeNull();
    }
  });
}

/** GTO 판 청크를 붙잡는 시간 — Suspense 폴백이 먼저 서는 첫 방문을 만든다(4차 기록: 200ms 에서 폴백이 확실히 선다). */
const TOOLS_CHUNK_DELAY_MS = 200;

// ⚠ 서비스 워커를 막는다 — 운영 빌드(sw.js: skipWaiting + clients.claim)는 부팅 직후 페이지를 장악하고 /assets 를
//   SW 가 가져온다. page.route 는 SW 가 응답한 요청을 못 가로채서 청크 지연이 걸리지 않았다
//   (2026-09-24 실측 4173/4299: held=0 4/4 · 같은 조건 serviceWorkers 'block' 이면 held=1). dev 엔 SW 가 없어 몰랐다.
//   font-strategy-measure·perf-baseline 이 쓰는 같은 옵션을, _fixtures 쓰기 가드를 잃지 않게 test.use 로 준다.
test.describe('TC5 — 서비스 워커 없음', () => {
  test.use({ serviceWorkers: 'block' });

  test('🔴 TC5 — 늦은 판 공개: 첫 방문 GTO 청크가 늦어 폴백이 먼저 서도 지면색 판으로 가리지 않는다', async ({ page }) => {
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
    // 전제(청크 지연이 만든 조건): 청크를 실제로 붙잡았고, '판이 아직 안 선' 프레임(폴백 스피너)이 있었다.
    expect(held, 'GTO 청크 요청을 붙잡지 못했다 — 이미 로드됐다(전제 없음)').toBeGreaterThanOrEqual(1);
    // 🔴 2026-09-26 — 로그인 뒤 탭 복원이 commitTab(한 입구)을 타면서 **첫 방문 트랜지션**으로 바뀌었다: 청크가 늦어도
    //   이전 판(홈)을 유지하고 폴백 스피너를 한 프레임도 커밋하지 않는다. 예전 전제('폴백이 먼저 선다')가 곧 결함이었으므로 뒤집어 잠근다.
    //   음성 대조: 복원 줄을 setActiveTab 으로 되돌린 빌드에서 waiting ≥ 1 로 빨개진다.
    const waiting = r.frames.filter((x) => x.spin && !x.ready).length;
    expect(waiting, '로그인 뒤 탭 복원이 폴백 스피너를 커밋했다 — commitTab 을 건너뛰었다(첫 방문 트랜지션 없음)').toBe(0);
    expectNoCover(r, 'GTO(늦은 공개)');
  });
});

test('🔴 TC2 — ?fx= 옛 스위치 값(off·tabsoft·tabfade)과 무관하게 덮개 0 · 저장소에 아무것도 쓰지 않는다', async ({ page }) => {
  test.setTimeout(120_000);
  await boot(page, 390, '');
  for (const q of ['?fx=off', '', '?fx=tabsoft', '?fx=tabfade'] as const) {
    await page.goto('/' + q);
    await dismissOverlays(page);
    await expect(page.locator('.tab-pane[data-tab="home"]')).toBeVisible();
    const r = await move(page, 'GTO', 'tools');
    expectNoCover(r, `GTO(${q || 'URL 없음'})`);
    expect(r.stored, `${q || 'URL 없음'}: 걷은 스위치가 저장소에 값을 썼다`).toBeNull();
  }
});

// 5차: PC 메인 탭도 덮개 없음(4차의 'GNB 밑·콘텐츠 열 폭 덮개' 는 같은 깜빡임이었다 — 1440 CPU 4배 재방문 112~144ms 실측).
test('TC3 — PC 폭(1024)도 덮개 0 · 본문 WAAPI 0', async ({ page }) => {
  test.setTimeout(60_000);
  await boot(page, 1024, '');
  await startRec(page, 'tools');
  await page.locator('[data-stack-tabbar]').getByRole('tab', { name: 'GTO', exact: true }).click();
  const r = await settle(page, 'tools');
  expect(r.frames.length, '프레임을 못 모았다').toBeGreaterThan(3);
  expectNoCover(r, 'PC GTO');
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
    expect(r.frames.filter((f) => f.disp !== 'none' && f.disp !== 'missing')).toEqual([]);
  });
});
