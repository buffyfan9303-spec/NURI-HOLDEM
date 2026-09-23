// BOTTOM-TAB-SMOOTH (오너 2026-09-23 "본문이 문제") — 하단 대메뉴 전환 **덮개** 계약.
//
// 본문(.tab-pane)은 움직이지 않는다. 본문 위 지면색 덮개 한 장이 160ms 동안 opacity 1→0 으로 걷힌다(src/lib/tabCover.ts).
//   · 본문에 opacity/transform 을 걸면 본문 레이어가 승격→해제된다 = §0-a25 삼성 밝기 점프 부류.
//     R3(e2e/mobile-tab-transition.spec.ts)와 같은 이유로 막는다 — 단 R3 는 스위치가 꺼진 기본 상태만 본다. 여기는 켜진 상태다.
//   · 기본 꺼짐. `?fx=tabfade` 로 들어온 기기만 켜진다(localStorage 'nuri:fx'), `?fx=off` 로 끈다.
//
// 음성 대조(2026-09-24 확인): `playTabCover` 가 덮개 대신 보이는 `.tab-pane` 에 opacity 1→0 을 걸게 바꾸면
//   TC1 의 '첫 프레임 덮개' 와 '본문 WAAPI 0' 이 빨개진다.
// 실행: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/tab-cover.spec.ts
//  ⚠ 하네스 Chromium 만 본다. 삼성 인터넷 GPU 의 밝기는 재현하지 못한다(재현 못 함 ≠ 없음).
import type { Page } from '@playwright/test';
import { test, expect } from './_fixtures';
import { dismissOverlays, stabilizeBackstack } from './_session';
import { mockSchedules } from './_schedules';

type Frame = { t: number; tab: string; disp: string; op: number };
type Cov = { frames: Frame[]; paneWaapi: string[]; rec: boolean };

const RECORDER = () => {
  const frames: Frame[] = [];
  const paneWaapi: string[] = [];
  const state: Cov = { frames, paneWaapi, rec: false };
  (window as unknown as { __cov: Cov }).__cov = state;
  const native = Element.prototype.animate;
  Element.prototype.animate = function patched(this: Element, kf: unknown, opts: unknown) {
    try {
      const pane = this.closest?.('.tab-pane');
      if (pane) paneWaapi.push(`${pane.getAttribute('data-tab')} ${JSON.stringify(kf).slice(0, 80)}`);
    } catch { /* 계측이 앱을 깨뜨리지 않는다 */ }
    return native.call(this, kf as Keyframe[], opts as KeyframeAnimationOptions);
  } as typeof Element.prototype.animate;
  const loop = (ts: number) => {
    if (state.rec) {
      const pane = [...document.querySelectorAll<HTMLElement>('.tab-pane')].find((p) => p.style.display !== 'none');
      const cv = document.querySelector<HTMLElement>('[data-tab-cover]');
      const cs = cv ? getComputedStyle(cv) : null;
      frames.push({ t: ts, tab: pane?.dataset.tab ?? '', disp: cs?.display ?? 'missing', op: cs ? Number(cs.opacity) : -1 });
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
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

/** 한 번 이동하고 그 사이 프레임·본문 WAAPI·정착 상태를 돌려준다. */
async function move(page: Page, label: string, tab: string) {
  await page.evaluate(() => { const c = (window as unknown as { __cov: Cov }).__cov; c.frames.length = 0; c.paneWaapi.length = 0; c.rec = true; });
  await tapNav(page, label);
  await expect(page.locator(`.tab-pane[data-tab="${tab}"]`)).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(600); // 정착(160ms + 여유)
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

async function boot(page: Page, width: number, query: string) {
  await stabilizeBackstack(page);
  await page.setViewportSize({ width, height: 844 });
  await mockSchedules(page);
  await page.addInitScript(RECORDER);
  await page.goto('/' + query);
  await dismissOverlays(page);
  await expect(page.locator('.tab-pane[data-tab="home"]')).toBeVisible();
}

test('🔴 TC1 — 켜진 기기(390): 첫 프레임부터 덮개가 깔리고 걷히며, 본문에는 애니메이션이 0개다', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, 390, '?fx=tabfade');
  for (const [label, tab] of [['GTO', 'tools'], ['커뮤니티', 'community'], ['홈', 'home']] as const) {
    const r = await move(page, label, tab);
    const i = r.frames.findIndex((f) => f.tab === tab);
    expect(i, `${label}: 목적지 본문 프레임을 한 번도 못 봤다 — 아래 단언이 공허해진다`).toBeGreaterThanOrEqual(0);
    const first = r.frames[i];
    expect(first.disp, `${label}: 새 본문의 첫 프레임에 덮개가 없다(K-07 역행)`).toBe('block');
    expect(first.op, `${label}: 새 본문의 첫 프레임 덮개 opacity`).toBeGreaterThanOrEqual(0.9);
    expect(r.frames.slice(i).some((f) => f.disp === 'block' && f.op > 0.05 && f.op < 0.6),
      `${label}: 덮개가 중간값 없이 사라졌다 — 페이드가 아니라 컷이다`).toBe(true);
    expect(r.paneWaapi, `${label}: 본문(.tab-pane) 안에 WAAPI 가 시작됐다`).toEqual([]);
    expect(r.coverInPane, '덮개가 .tab-pane 안에 들어갔다').toBe(false);
    expect(r.endDisplay, `${label}: 정착 후에도 덮개가 남아 있다`).toBe('none');
    expect(r.endAnims).toBe(0);
    expect(r.stored).toBe('tabfade');
  }
});

test('🔴 TC2 — 기본(스위치 없음)과 ?fx=off 는 덮개를 한 프레임도 그리지 않는다', async ({ page }) => {
  test.setTimeout(90_000);
  await boot(page, 390, '');
  let r = await move(page, 'GTO', 'tools');
  expect(r.frames.length, '프레임을 못 모았다 — 공허한 통과').toBeGreaterThan(3);
  expect(r.frames.filter((f) => f.disp !== 'none'), '기본값에서 덮개가 그려졌다').toEqual([]);
  expect(r.stored).toBeNull();
  // 같은 기기에서 켰다가 끄기(저장소 유지)
  await page.goto('/?fx=tabfade');
  await page.goto('/?fx=off');
  await dismissOverlays(page);
  await expect(page.locator('.tab-pane[data-tab="home"]')).toBeVisible();
  r = await move(page, 'GTO', 'tools');
  expect(r.frames.length).toBeGreaterThan(3);
  expect(r.frames.filter((f) => f.disp !== 'none'), '?fx=off 뒤에 덮개가 그려졌다').toEqual([]);
  expect(r.stored).toBe('off');
});

test('TC3 — PC 폭(1024)은 View Transition 이 맡으므로 덮개를 그리지 않는다', async ({ page }) => {
  test.setTimeout(60_000);
  await boot(page, 1024, '?fx=tabfade');
  await page.evaluate(() => { const c = (window as unknown as { __cov: Cov }).__cov; c.frames.length = 0; c.rec = true; });
  await page.locator('[data-stack-tabbar]').getByRole('tab', { name: 'GTO', exact: true }).click();
  await expect(page.locator('.tab-pane[data-tab="tools"]')).toBeVisible();
  await page.waitForTimeout(600);
  const frames = await page.evaluate(() => (window as unknown as { __cov: Cov }).__cov.frames.slice());
  expect(frames.length).toBeGreaterThan(3);
  expect(frames.filter((f) => f.disp !== 'none'), 'PC 에서 덮개가 그려졌다').toEqual([]);
});

test.describe('동작 줄이기', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });
  test('TC4 — prefers-reduced-motion 이면 켜진 기기라도 덮개가 없다', async ({ page }) => {
    test.setTimeout(60_000);
    await boot(page, 390, '?fx=tabfade');
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      '감소 모드가 적용되지 않았다 — 공허한 통과').toBe(true);
    const r = await move(page, 'GTO', 'tools');
    expect(r.frames.length).toBeGreaterThan(3);
    expect(r.frames.filter((f) => f.disp !== 'none')).toEqual([]);
  });
});
