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
// 조건: TC0 일반 · TC1 CPU 6배(느린 폰 모사) · TC5 프리마운트 경합(첫 방문 GTO 가 Suspense 폴백 뒤 늦게 공개되는 경우를
//   결정적으로 만든다 — 프리마운트가 'tools' 를 방문 처리한 직후, 그 커밋 전에 GTO 를 누른다).
//
// 음성 대조(2026-09-24 3차 확인): playTabCover 가 준비를 기다리지 않고(고정 시각) 바로 걷으면 TC5 의 ①② 가 빨개진다.
//   본문에 opacity 를 걸면 '본문 WAAPI 0' 이, TAB_COVER_DEFAULT_ON=false 면 TC0 이 빨개진다(2차 기록).
// 실행: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/tab-cover.spec.ts
//  ⚠ 하네스 Chromium 만 본다. 삼성 인터넷 GPU 의 밝기는 재현하지 못한다(재현 못 함 ≠ 없음).
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { dismissOverlays, stabilizeBackstack } from './_session';
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

test('🔴 TC5 — 프리마운트 경합: 첫 방문 GTO 가 폴백 뒤 늦게 공개돼도 덮개는 새 본문이 그려진 뒤에 걷힌다', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, 390, '', HOLD_PREMOUNT_IDLE);
  // 프리마운트 순서(비업주): live → community → tools. community 판이 커밋될 때까지 붙잡은 idle 을 흘려보낸다 —
  //   그 시점 큐에 남은 것이 'tools 를 방문 처리할' 다음 차례다.
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(() => ({
      community: !!document.querySelector('.tab-pane[data-tab="community"]'),
      tools: !!document.querySelector('.tab-pane[data-tab="tools"]'),
      q: (window as unknown as { __iq: unknown[] }).__iq.length,
    }));
    expect(s.tools, 'tools 가 이미 프리마운트됐다 — 경합을 만들지 못했다').toBe(false);
    if (s.community && s.q > 0) break;
    await page.evaluate(() => (window as unknown as { __iq: IdleRequestCallback[] }).__iq.splice(0).forEach((cb) => cb({ didTimeout: false, timeRemaining: () => 50 })));
    await page.waitForTimeout(300);
  }
  await startRec(page, 'tools');
  // 같은 태스크 안에서: 다음 프리마운트(= tools 방문 처리 + transition 예약) → 곧바로 GTO 누름(급한 업데이트).
  await page.evaluate(() => {
    (window as unknown as { __iq: IdleRequestCallback[] }).__iq.splice(0).forEach((cb) => cb({ didTimeout: false, timeRemaining: () => 50 }));
    const nav = document.querySelector('nav[aria-label="하단 내비게이션"]')!;
    [...nav.querySelectorAll<HTMLButtonElement>('button')].find((b) => /^GTO/.test((b.getAttribute('aria-label') ?? b.textContent ?? '').trim()))!.click();
  });
  const r = await settle(page, 'tools');
  const start = r.frames.findIndex((x) => x.disp === 'block');
  expect(r.frames.slice(Math.max(start, 0)).some((x) => x.spin),
    '경합이 재현되지 않았다(폴백 스피너 0프레임) — 이 테스트가 지키는 조건이 없다').toBe(true);
  expectCoverContract(r, 'GTO(경합)');
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

test('TC3 — PC 폭(1024)은 View Transition 이 맡으므로 덮개를 그리지 않는다', async ({ page }) => {
  test.setTimeout(60_000);
  await boot(page, 1024, '');
  await startRec(page, 'tools');
  await page.locator('[data-stack-tabbar]').getByRole('tab', { name: 'GTO', exact: true }).click();
  await expect(page.locator('.tab-pane[data-tab="tools"]')).toBeVisible();
  await page.waitForTimeout(900);
  const frames = await page.evaluate(() => (window as unknown as { __cov: Cov }).__cov.frames.slice());
  expect(frames.length).toBeGreaterThan(3);
  expect(frames.filter((f) => f.disp !== 'none'), 'PC 에서 덮개가 그려졌다').toEqual([]);
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
