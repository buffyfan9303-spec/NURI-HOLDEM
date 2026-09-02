import { test, expect, type Page } from '@playwright/test';

// [DS] MO-1 — 성능 회귀 게이트: CPU 4× 스로틀 + 375×812(갤럭시 A17 ≈ Pixel 5 + 2× → 4×는 안전 마진).
// 첫 도입은 '기록 + 느슨한 상한'(현 상태 회귀 방지) — MO-2~9 진행하며 임계를 조인다(§20.6).
// 측정은 페이지 내 PerformanceObserver 주입(LoAF·layout-shift) — 라이브러리 0.

// 성능 측정 스펙은 병렬 워커 CPU 경합에 취약(단독 실행은 delta=0) — 임계는 그대로 두고 재시도만 허용
test.describe.configure({ retries: 2 });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // (온보딩 시트 #29 는 2026-08-28 삭제 — 'nuri_onboarding_v1' 시드는 죽은 전제라 제거)
    interface PerfBag { cls: number; longFrames: number }
    const bag: PerfBag = { cls: 0, longFrames: 0 };
    (window as unknown as { __perf: PerfBag }).__perf = bag;
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as (PerformanceEntry & { value?: number; hadRecentInput?: boolean })[]) {
          if (!e.hadRecentInput) bag.cls += e.value ?? 0;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch { /* noop */ }
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as (PerformanceEntry & { blockingDuration?: number })[]) {
          if ((e.blockingDuration ?? 0) > 100) bag.longFrames += 1;
        }
      }).observe({ type: 'long-animation-frame', buffered: true });
    } catch { /* noop */ }
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.setViewportSize({ width: 375, height: 812 });
});

const readPerf = (page: Page) => page.evaluate(() => (window as unknown as { __perf: { cls: number; longFrames: number } }).__perf);

test('perf① 홈 콜드 진입 — CLS·롱프레임 기록 + 상한', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('오늘·내일 일정').first()).toBeVisible();
  await page.waitForTimeout(3500); // 배너·개인화 블록 도착분까지 CLS 에 포함
  const p = await readPerf(page);
  console.log(`[perf-baseline] browse-cold CLS=${p.cls.toFixed(3)} longFrames=${p.longFrames}`);
  expect(p.cls, 'browse 콜드 CLS').toBeLessThan(0.35);
  expect(p.longFrames, 'browse 콜드 롱프레임').toBeLessThan(40);
});

test('perf② browse→live 탭 전환 — 전환 구간 롱프레임 상한', async ({ page }) => {
  test.setTimeout(60_000); // 병렬 부하에서 마운트 대기(≤30s)가 기본 타임아웃을 소진한다
  await page.goto('/');
  // 병렬 스위트 부하에서 마운트가 늦으면 nav 대기가 기본 타임아웃을 넘긴다 — 마운트 마커로 명시 대기
  await page.waitForSelector('button[aria-label^="알림"]', { timeout: 30_000 });
  const nav = page.getByRole('navigation', { name: '하단 내비게이션' });
  await expect(nav).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  const before = await readPerf(page);
  await nav.getByRole('button', { name: /^라이브/ /* 진행 중 게임이 있으면 배지 숫자가 접근성 이름에 붙는다('라이브 1') — exact 는 저녁마다 깨진다 */ }).click();
  await expect(page.getByText('진행 중 게임')).toBeVisible();
  await nav.getByRole('button', { name: '홈', exact: true }).click();
  await page.waitForTimeout(800);
  const after = await readPerf(page);
  const delta = after.longFrames - before.longFrames;
  console.log(`[perf-baseline] tab-switch longFrames delta=${delta}`);
  expect(delta, '탭 전환 왕복 롱프레임').toBeLessThan(15);
});

test('perf③ 커뮤니티 스크롤 — 스크롤 구간 CLS·롱프레임 상한', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: '하단 내비게이션' });
  await nav.getByRole('button', { name: '커뮤니티', exact: true }).click();
  await page.waitForTimeout(2000);
  const before = await readPerf(page);
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(120);
  }
  const after = await readPerf(page);
  const clsDelta = after.cls - before.cls;
  const lfDelta = after.longFrames - before.longFrames;
  console.log(`[perf-baseline] community-scroll CLS delta=${clsDelta.toFixed(3)} longFrames delta=${lfDelta}`);
  expect(clsDelta, '커뮤니티 스크롤 CLS').toBeLessThan(0.15);
  expect(lfDelta, '커뮤니티 스크롤 롱프레임').toBeLessThan(20);
});
