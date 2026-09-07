// 내 매장 — 이동한 자리를 지키는가.
//
// 막는 결함(오너 2026-09-07 "2번 장부를 누르면 오늘 진행으로 넘어간다"):
//   VenueManageTab 의 '내 매장 탭 재탭 → 대시보드' 효과가 deps 에 gotoSection 을 갖고 있었다.
//   gotoSection ← firstSettingsTab ← canSettingsTab ← idOn(이용권 킬스위치, **비동기 도착**).
//   그래서 사용자가 장부·클락으로 옮긴 **뒤** 그 값이 도착하면 함수 정체성이 바뀌고 효과가 다시 돌아
//   화면이 대시보드로 되돌아갔다. 누르지도 않았는데.
// 이 스펙은 '이동 직후'가 아니라 **비동기가 다 도착한 뒤**를 본다 — 그게 결함이 사는 창이다.
import { test, expect } from './_fixtures';
import { loginAs } from './_session';

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

test.describe('내 매장 — 이동 안정성', () => {
  test.skip(!EMAIL || !PASSWORD, 'E2E_EMAIL/E2E_PASSWORD 없음');

  test('🔴 게임 스텝으로 이동한 뒤 비동기 해제가 도착해도 대시보드로 되돌아가지 않는다', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAs(page, EMAIL!, PASSWORD!);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const store = page.getByRole('tab', { name: /내 매장/ }).or(page.getByRole('button', { name: /^내 매장/ }));
    test.skip(await store.count() === 0, '내 매장 없음');
    await store.first().click();
    await expect(page.locator('[data-tab="my-store"]')).toBeVisible({ timeout: 20_000 });

    // 대시보드가 그려지자마자(= 비동기들이 아직 도착 중일 때) 곧바로 이동한다 — 결함이 사는 창.
    const strip = page.locator('[aria-label="오늘 진행 단계"] button');
    await strip.first().waitFor({ timeout: 20_000 });
    await strip.nth(2).click(); // 3.클락

    const bar = page.locator('[aria-label="게임 진행 단계"]');
    await expect(bar).toBeVisible({ timeout: 20_000 });

    // 비동기(권한·킬스위치·프리셋)가 전부 도착할 시간을 준 뒤에도 그 자리인지.
    await page.waitForTimeout(6000);
    const state = await page.evaluate(() => {
      const vis = (s: string) => { const e = document.querySelector<HTMLElement>(s); return !!e && e.offsetParent !== null; };
      const active = [...document.querySelectorAll('[aria-label="게임 진행 단계"] [role=tab]')]
        .find((b) => b.getAttribute('aria-selected') === 'true')?.textContent?.trim() ?? null;
      return { 스텝바: vis('[aria-label="게임 진행 단계"]'), 대시보드: vis('[aria-label="오늘 진행 단계"]'), active };
    });
    console.log('[nav]', JSON.stringify(state));
    expect(state.대시보드, '이동한 뒤 대시보드로 되돌아갔다 — homeNonce 효과가 누르지 않았는데 돌고 있다').toBe(false);
    expect(state.스텝바, '게임 진행 스텝 바가 사라졌다').toBe(true);
    expect(state.active, '활성 탭이 클락이 아니다').toContain('클락');
  });

  test('스텝 바 각 단계가 그 판으로 전환된다(대시보드로 튀지 않는다)', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAs(page, EMAIL!, PASSWORD!);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const store = page.getByRole('tab', { name: /내 매장/ }).or(page.getByRole('button', { name: /^내 매장/ }));
    test.skip(await store.count() === 0, '내 매장 없음');
    await store.first().click();
    await expect(page.locator('[data-tab="my-store"]')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2500);
    await page.locator('[aria-label="오늘 진행 단계"] button').nth(1).click();
    await expect(page.locator('[aria-label="게임 진행 단계"]')).toBeVisible({ timeout: 20_000 });

    for (const name of ['포스터', '클락', '순위', '장부']) {
      const tab = page.locator('[aria-label="게임 진행 단계"] [role=tab]').filter({ hasText: name });
      if (await tab.count() === 0) continue;
      await tab.first().click();
      await page.waitForTimeout(1500);
      const active = await page.locator('[aria-label="게임 진행 단계"] [role=tab][aria-selected="true"]').textContent();
      expect(active, `${name} 를 눌렀는데 활성 탭이 «${active}» 다`).toContain(name);
      const dash = await page.evaluate(() => { const e = document.querySelector<HTMLElement>('[aria-label="오늘 진행 단계"]'); return !!e && e.offsetParent !== null; });
      expect(dash, `${name} 를 눌렀는데 대시보드로 넘어갔다`).toBe(false);
    }
  });
});
