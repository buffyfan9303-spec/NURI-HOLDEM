// 테마 전환이 두 단계로 바뀌던 것 · 동작 줄이기에서 전이가 폭증하던 것 (R-07 · audit-regress-1001 · 2026-10-01).
//
// 실측(수정 전 · 390): 다크→라이트 휘도 182 → 3~5프레임 뒤 199 — `transition-colors` 가 걸린 요소만 보간하고 나머지는 즉시라
//   섞인 프레임이 나왔다. 동작 줄이기에선 전역 `transition-duration: 0.01ms` 가 기본 `transition-property: all` 과 만나
//   판 안 실행 중 전이가 94 → 485 로 늘었다(LoAF 301 → 567ms @CPU6).
// 잠그는 것: ① 테마 전환 뒤 10프레임 동안 새 CSS 전이 0 · 중간 휘도 프레임 ≤ 1
//            ② 동작 줄이기에서 탭 이동 뒤 10프레임 동안 새 CSS 전이 0.
import { test, expect } from './_fixtures';
import { Cast } from './_flicker';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

/** 누른 뒤 n 프레임 동안 **생긴** CSS 전이 수(transitionrun). 실행 중 객체 수(getAnimations)는 0.01ms 전이를
 *  rAF 전에 끝내 버려 못 센다 — 수정 전 빌드에서도 0 이 나와 음성 대조에 실패했다(그래서 생성 이벤트를 센다). */
const transitionsAfter = (page: Page, sel: string, text = '', frames = 10) => page.evaluate(async ([s, t, n]) => {
  const el = [...document.querySelectorAll<HTMLElement>(s as string)].find((e) => !t || e.textContent?.trim() === t);
  if (!el) return -1;
  let count = 0;
  const on = () => { count++; };
  document.addEventListener('transitionrun', on, true);
  el.click();
  for (let i = 0; i < (n as number); i++) await new Promise((r) => requestAnimationFrame(r));
  document.removeEventListener('transitionrun', on, true);
  return count;
}, [sel, text, frames] as const);

test('🔴 테마 전환은 한 프레임에 바뀐다 — 전이 0 · 섞인 프레임 ≤ 1', async ({ page }) => {
  await page.goto('/');
  const toggle = 'header button[aria-label="라이트 모드로 전환"]';
  await expect(page.locator(toggle)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2000);
  const cdp = await page.context().newCDPSession(page);
  const cast = new Cast(cdp);
  await cast.start();
  await page.waitForTimeout(300);
  const t0 = Date.now();
  const n = await transitionsAfter(page, toggle);
  await page.waitForTimeout(600);
  const frames = await cast.stop();
  expect(n, '토글을 못 찾았다').toBeGreaterThanOrEqual(0);
  const before = frames.filter((f) => f.t < t0);
  const after = frames.filter((f) => f.t >= t0);
  expect(before.length).toBeGreaterThan(0);
  // 스크린캐스트는 화면이 바뀔 때만 프레임을 준다 — 한 번에 바뀌면 1~2장뿐이다(그게 통과 조건이다).
  expect(after.length, '누른 뒤 프레임이 없다(측정 전제)').toBeGreaterThanOrEqual(1);
  const a = before[before.length - 1].L, b = after[after.length - 1].L;
  expect(b - a, '전제: 다크→라이트로 실제로 밝아졌다').toBeGreaterThan(20);
  const mid = after.filter((f) => Math.abs(f.L - a) > 3 && Math.abs(f.L - b) > 3).map((f) => f.L.toFixed(0));
  expect.soft(n, '테마 전환 뒤 10프레임 동안 생긴 CSS 전이 수').toBe(0);
  expect(mid.length, `중간 휘도 프레임 ${mid.join(',')} (시작 ${a.toFixed(0)} → 끝 ${b.toFixed(0)} · 전체 ${after.map((f) => f.L.toFixed(0)).join('→')})`).toBeLessThanOrEqual(1);
});

test.describe('동작 줄이기', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });
  test('🔴 동작 줄이기에서 탭 이동은 CSS 전이를 만들지 않는다', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav[aria-label="하단 내비게이션"]')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2000);
    const results: Record<string, number> = {};
    for (const label of ['커뮤니티', '라이브', '홈']) {
      results[label] = await transitionsAfter(page, 'nav[aria-label="하단 내비게이션"] button', label); // -1 = 버튼을 못 찾음
      await page.waitForTimeout(800);
    }
    expect(results, '동작 줄이기에서 탭 이동 뒤 10프레임 동안 생긴 CSS 전이 수(라벨별)').toEqual({ 커뮤니티: 0, 라이브: 0, 홈: 0 });
  });
});
