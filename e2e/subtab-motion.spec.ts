// 하위 탭 모션 실측 게이트(오너 #10) — "코드가 있다"가 아니라 "실제로 애니메이트된다"를 잰다.
//
// 왜 Playwright 인가: 브라우저 페인(MCP)은 document.hidden 이 항상 true 라
// startViewTransition 이 아예 호출되지 않는다(viewTransition.ts 의 폴백 경로로 빠진다).
// 즉 거기서는 '모션이 없다'와 '모션이 안 도는 환경이다'를 구분할 수 없다.
//
// 무엇을 재나: 탭을 누른 직후 프레임마다 document.getAnimations() 를 훑어
//   ① ::view-transition-old/new(<패널>) 이 vt-panel-* 키프레임으로 실제 애니메이트되고
//   ② ::view-transition-old/new(root) 와 탭바 스냅샷은 애니메이트되지 **않는지**(제자리 고정)
// 를 확인한다. ②가 깨지면 헤더·히어로까지 통째로 밀리는 예전 회귀다.
import { test, expect, type Page, type Locator } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays, loginAs } from './_session';

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

declare global {
  interface Window { __VT_SAMPLES?: string[] }
}

/** 전환이 도는 동안 프레임마다 의사요소 애니메이션을 수집한다(앱 코드는 건드리지 않는다). */
async function startSampler(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__VT_SAMPLES = [];
    const t0 = performance.now();
    const tick = () => {
      for (const a of document.getAnimations()) {
        const eff = a.effect as KeyframeEffect | null;
        const pe = eff?.pseudoElement ?? null;
        if (!pe || !pe.startsWith('::view-transition')) continue;
        const name = (a as unknown as { animationName?: string }).animationName ?? '';
        window.__VT_SAMPLES!.push(`${pe} :: ${name}`);
      }
      if (performance.now() - t0 < 900) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function collect(page: Page): Promise<string[]> {
  await page.waitForTimeout(950);
  return page.evaluate(() => [...new Set(window.__VT_SAMPLES ?? [])].sort());
}

/** 탭 하나를 누르고 전환을 계측한다. */
async function probe(page: Page, target: Locator): Promise<string[]> {
  await startSampler(page);
  await target.click();
  return collect(page);
}

/**
 * 계약 판정 — 본문만 밀고 탭바·root 는 제자리.
 * @param panel index.css 에 등록된 본문 스냅샷 이름
 * @param bar   탭바 스냅샷 이름
 */
function expectPanelPush(samples: string[], panel: string, bar: string) {
  const joined = samples.join('\n');
  const has = (prefix: string) => samples.some((x) => x.startsWith(prefix));

  // ① 본문이 방향성 푸시로 애니메이트된다(old 는 빠지고 new 는 들어온다).
  expect(has(`::view-transition-old(${panel}) :: vt-panel-out-`),
    `본문(${panel})의 old 스냅샷이 vt-panel-out-* 로 애니메이트되지 않았다 — 전환이 안 돌았거나 이름이 안 붙었다
실측:
${joined}`)
    .toBe(true);
  expect(has(`::view-transition-new(${panel}) :: vt-panel-in-`),
    `본문(${panel})의 new 스냅샷이 vt-panel-in-* 로 애니메이트되지 않았다
실측:
${joined}`)
    .toBe(true);

  // ② root 는 정지 — 여기가 살아 있으면 헤더·히어로까지 페이지 전체가 밀린다(2026-08-29 회귀).
  const moved = (name: string) => samples.filter((x) =>
    (x.startsWith(`::view-transition-old(${name}) :: `) || x.startsWith(`::view-transition-new(${name}) :: `))
    && !x.endsWith(':: '));
  expect(moved('root'), `root 가 애니메이트됐다 — 탭바 위쪽까지 통째로 밀린다
실측:
${joined}`).toEqual([]);

  // ③ 탭바도 정지 — 손가락이 짚고 있는 바가 같이 움직이면 '어디를 눌렀는지'가 흔들린다.
  expect(moved(bar), `탭바(${bar})가 애니메이트됐다 — 제자리에 고정돼야 한다
실측:
${joined}`).toEqual([]);
}

// CI 러너(공유 vCPU)에서는 VT/스프링 프레임 타이밍이 흔들려 간헐 실패한다(2026-09-02 실측: 로컬 14/14 통과·CI 1회 실패 후 재실행 통과).
// 임계는 그대로, 재시도만 CI 에서 2회 — perf.spec 과 같은 규약.
test.describe.configure({ retries: process.env.CI ? 2 : 0 });
test.describe('하위 탭 — 방향성 푸시가 실제로 돈다', () => {
  test.skip(!EMAIL || !PASSWORD, 'E2E_EMAIL/E2E_PASSWORD 미설정 — 로그인 화면들을 잴 수 없다');

  async function boot(page: Page) {
    await stabilizeBackstack(page);
    await loginAs(page, EMAIL!, PASSWORD!);
    await page.goto('/');
    await page.waitForSelector('button[aria-label^="알림"]', { timeout: 20_000 });
    await dismissOverlays(page);
  }

  async function gotoCommunitySection(page: Page, label: string) {
    await page.locator('nav').getByRole('button', { name: '커뮤니티', exact: true }).first().click();
    const tab = page.getByRole('button', { name: label, exact: true }).first();
    await expect(tab).toBeVisible({ timeout: 15_000 });
    await tab.click();
    await page.waitForTimeout(600); // 섹션 전환(VT)이 끝난 뒤에 재야 이번 전환과 안 섞인다
  }

  test('🔴 도구 탭 레인 필터(tools-lane)', async ({ page }) => {
    await boot(page);
    await page.locator('nav').getByRole('button', { name: 'GTO', exact: true }).first().click();
    const bar = page.locator('[data-tools-lanebar]');
    await expect(bar).toBeVisible({ timeout: 15_000 });
    const samples = await probe(page, bar.getByRole('button', { name: '계산기', exact: true }));
    expectPanelPush(samples, 'tools-lanepanel', 'tools-lanebar');
  });

  test('🔴 장터 카테고리(market-cat)', async ({ page }) => {
    await boot(page);
    await gotoCommunitySection(page, '장터');
    const bar = page.locator('[data-market-catbar]');
    await expect(bar).toBeVisible({ timeout: 15_000 });
    const samples = await probe(page, bar.getByRole('button', { name: '용품', exact: true }));
    expectPanelPush(samples, 'market-panel', 'market-catbar');
  });

  test('🔴 딜러 커뮤니티 구인·구직 필터(dealer-kind)', async ({ page }) => {
    await boot(page);
    await gotoCommunitySection(page, '딜러');
    const bar = page.locator('[data-dealer-kindbar]');
    await expect(bar).toBeVisible({ timeout: 15_000 });
    const samples = await probe(page, bar.getByRole('button', { name: /^구인/ }));
    expectPanelPush(samples, 'dealer-panel', 'dealer-kindbar');
  });

  test('🔴 랭킹 허브 세부 탭(rank-tab · 오너가 지목한 화면)', async ({ page }) => {
    await boot(page);
    await gotoCommunitySection(page, '랭킹');
    const bar = page.locator('[data-rank-tabbar]');
    await expect(bar).toBeVisible({ timeout: 15_000 });
    const samples = await probe(page, bar.getByRole('button', { name: /주간/ }).first());
    expectPanelPush(samples, 'rank-panel', 'rank-tabbar');
  });

  test('🔴 프로필 모달 탭(profile-tab)', async ({ page }) => {
    await boot(page);
    // 헤더 아바타 → 사용자 메뉴 → '프로필 관리' (앱의 실제 동선)
    await page.locator('button[aria-label$="메뉴"]').first().click();
    await page.getByRole('button', { name: '프로필 관리 열기' }).click();
    const bar = page.locator('[data-profile-tabbar]');
    await expect(bar).toBeVisible({ timeout: 15_000 });
    const samples = await probe(page, bar.getByRole('tab', { name: '설정', exact: true }));
    expectPanelPush(samples, 'profile-panel', 'profile-tabbar');
  });

  test('🔴 알림 패널 쪽지·알림(notif-tab)', async ({ page }) => {
    await boot(page);
    await page.locator('button[aria-label^="알림"]').first().click();
    const bar = page.locator('[data-notif-tabbar]');
    await expect(bar).toBeVisible({ timeout: 15_000 });
    const samples = await probe(page, bar.getByRole('tab', { name: '알림', exact: true }));
    expectPanelPush(samples, 'notif-panel', 'notif-tabbar');
  });
});
