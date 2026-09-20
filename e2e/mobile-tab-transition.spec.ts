// 2026-09-20: Samsung compresses the main-tab snapshot vertically; Chrome flashes
// overlapping captures. Mobile navigation must render the live pane, including on
// revisit/back. Desktop keeps its existing transition. This cannot emulate Samsung's GPU.
// Negative control: remove the desktop matchMedia guard in App.tsx; mobile cases fail.
// Run against a fresh preview: E2E_BASE_URL=http://localhost:4173 npx playwright test e2e/mobile-tab-transition.spec.ts
import { test, expect } from './_fixtures';
import { dismissOverlays, stabilizeBackstack } from './_session';

test.use({ reducedMotion: 'no-preference' });

for (const width of [390, 1023, 1024]) {
  test(`main tab snapshots at ${width}px: mobile stays live, desktop keeps transitions`, async ({ page }) => {
    test.setTimeout(60_000);
    await stabilizeBackstack(page);
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => {
      const native = document.startViewTransition.bind(document);
      let calls = 0;
      Object.defineProperty(window, '__mainTabVtCalls', { get: () => calls });
      document.startViewTransition = (...args) => {
        calls += 1;
        return native(...args);
      };
    });
    await page.goto('/');
    await dismissOverlays(page);
    const count = () => page.evaluate(() => Reflect.get(window, '__mainTabVtCalls') as number);
    const pane = (tab: string) => page.locator(`.tab-pane[data-tab="${tab}"]`);
    await expect(pane('home')).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const navigate = async (tab: 'home' | 'tools') => {
      const label = tab === 'home' ? '홈' : 'GTO';
      const nav = width < 1024
        ? page.getByRole('navigation', { name: '하단 내비게이션' })
        : page.locator('[data-stack-tabbar]');
      const button = nav.getByRole(width < 1024 ? 'button' : 'tab', { name: label, exact: true });
      if (width < 1024) {
        const box = await button.boundingBox();
        expect(box).not.toBeNull();
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart', touchPoints: [{ x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }],
        });
        // Real touch duration: instantaneous tap misses active-state interactions.
        await page.waitForTimeout(130);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await button.click();
      }
      await expect(pane(tab)).toBeVisible();
      await expect(pane(tab === 'home' ? 'tools' : 'home')).not.toBeVisible();
    };

    await navigate('tools');
    await expect(page.getByTestId('tools-featured')).toBeVisible();
    await navigate('home');
    const beforeRevisit = await count();
    await navigate('tools');
    await expect(page.getByTestId('tools-featured')).toBeVisible();
    if (width < 1024) {
      expect(await count(), 'mobile navigation created a page snapshot').toBe(0);
      await page.evaluate(() => history.back());
      await expect(pane('home')).toBeVisible();
      expect(await count(), 'mobile back navigation created a page snapshot').toBe(0);
      await page.evaluate(() => {
        for (const tab of ['tools', 'home']) {
          window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: tab }));
        }
      });
      await expect(pane('home')).toBeVisible();
      await expect(pane('tools')).not.toBeVisible();
      expect(await count(), 'rapid mobile navigation created a page snapshot').toBe(0);
      // Match the current viewport at navigation time, not a stale mount-time value.
      await page.setViewportSize({ width: 1024, height: 844 });
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: 'tools' })));
      await expect(pane('tools')).toBeVisible();
      expect(await count(), 'desktop navigation stopped using its existing transition').toBeGreaterThan(0);
    } else {
      expect(await count(), 'desktop revisit lost its existing transition').toBeGreaterThan(beforeRevisit);
      await page.waitForFunction(() => !document.getAnimations().some((animation) =>
        (animation.effect as KeyframeEffect | null)?.pseudoElement?.startsWith('::view-transition')));
      const desktopCount = await count();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('nuri:goto-tab', { detail: 'home' })));
      await expect(pane('home')).toBeVisible();
      expect(await count(), 'resizing to mobile retained the desktop snapshot path').toBe(desktopCount);
    }
    await cdp.detach();
  });
}
