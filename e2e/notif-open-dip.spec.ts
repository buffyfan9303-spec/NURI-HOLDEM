// 라이트 테마에서 알림 패널을 열면 화면이 **먼저 어두워졌다가** 밝아지던 것 (R-08 · audit-regress-1001 · 2026-10-01).
//
// 실측(수정 전 · 390 라이트): 휘도 175 → 171 → 166 → 169 → … → 186 (시작보다 −9, 3프레임).
// 원인: 스크림은 `animate-fade-in`(불투명도 0.45 에서 시작 · 0.16s)이라 첫 프레임부터 어두운데,
//   밝은 패널은 `animate-slide-up`(0 에서 · 0.32s)이라 늦게 차올랐다 — 둘의 시작점·길이가 달랐다.
//   flicker-gate 는 모달 전환을 blink 판정에서 면제해 이걸 못 잡는다.
// 잠그는 것: 누른 뒤 모든 프레임의 휘도가 min(시작, 끝) − 4 이상(끝값보다 더 어두운 프레임이 없다 — 이용권 시트 M2 와 같은 기준).
import { test, expect } from './_fixtures';
import { stubLogin } from './_session';
import { Cast } from './_flicker';

test.use({ viewport: { width: 390, height: 844 } });

test('🔴 라이트: 알림 패널을 열 때 화면이 먼저 어두워지지 않는다', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('nuri-theme', 'light'); } catch { /* 저장소 차단 */ } });
  await stubLogin(page);
  await page.goto('/');
  const bell = page.locator('header button[aria-label^="알림"]').first();
  await expect(bell).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2500); // 부팅 데이터·폰트 정착
  const cdp = await page.context().newCDPSession(page);
  const cast = new Cast(cdp);
  await cast.start();
  await page.waitForTimeout(300);
  const t0 = Date.now();
  await bell.click();
  await expect(page.getByRole('dialog', { name: '알림' })).toBeVisible();
  await page.waitForTimeout(700);
  const frames = await cast.stop();
  const before = frames.filter((f) => f.t < t0);
  const after = frames.filter((f) => f.t >= t0);
  expect(before.length, '누르기 전 프레임이 없다(측정 전제)').toBeGreaterThan(0);
  expect(after.length, '누른 뒤 프레임이 3장 미만이다(측정 전제)').toBeGreaterThanOrEqual(3);
  const L0 = before[before.length - 1].L;
  const L1 = after[after.length - 1].L;
  const floor = Math.min(L0, L1) - 4;
  const dips = after.filter((f) => f.L < floor).map((f) => `${Math.round(f.t - t0)}ms:${f.L.toFixed(0)}`);
  expect(dips, `시작 ${L0.toFixed(0)} · 끝 ${L1.toFixed(0)} · 더 어두운 프레임 ${dips.join(' ')} · 전체 ${after.map((f) => f.L.toFixed(0)).join('→')}`).toEqual([]);
});
