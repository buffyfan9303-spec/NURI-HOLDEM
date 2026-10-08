// 헤더 로고 글린트(2026-10-08 오너 "메인에 최고의 모션 딱 1개") — 첫 표시에 빛 한 줄기가 한 번 지나간다.
//
// 지키는 것:
//   ① 레이아웃 0 영향 — 글린트가 있는 동안·지나가는 중·지운 뒤 헤더·로고·탭바 상자가 0px 도 안 바뀐다.
//   ② 한 번만 — 끝나면 노드가 사라지고, 새로고침해도 같은 세션에선 다시 안 돈다.
//   ③ reduced-motion — 아예 그리지 않는다(세션 표시도 안 남긴다).
// ③ 만 있으면 글린트가 통째로 고장 나도 초록이다 — 그래서 ① 이 "실제로 생겼고 실제로 움직였다" 를 먼저 단언한다.
// 음성 대조(2026-10-08): NuriClassicLogo 의 reduced-motion 판정 줄을 지우면 ③ 이, LogoGlint 의 setOn(false) 타이머를 지우면 ② 가 실패했다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';

const GLINT = '[data-testid="logo-glint"]';

/** 홈 본문은 데이터가 들어오며 자라므로 빼고, 셸(헤더·헤더 버튼·로고·탭바)만 잰다. */
const shellBoxes = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll('header, header button, [aria-label="NURI HOLDEM"], nav')].map((e) => {
    const r = e.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height].join(',');
  }));

/** 보이는 로고 글린트의 그라디언트 이동량(SMIL animVal). 시작 전 null. */
const glintX = (page: Page) => page.evaluate(() => {
  const g = [...document.querySelectorAll('[data-testid="logo-glint"] linearGradient')].pop() as SVGLinearGradientElement | undefined;
  const t = g?.gradientTransform.animVal;
  return t && t.numberOfItems ? t.getItem(0).matrix.e : null;
});

test.describe('헤더 로고 글린트', () => {
  test('첫 표시 1회 — 셸 상자 불변 · 끝나면 제거 · 새로고침해도 재생 0', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator(GLINT).first().waitFor({ state: 'attached', timeout: 10_000 });
    const before = await shellBoxes(page);

    await expect.poll(() => glintX(page), { timeout: 3_000 }).toBeGreaterThan(20); // 실제로 글자 위를 지나는 중
    const mid = await shellBoxes(page);

    await expect(page.locator(GLINT)).toHaveCount(0, { timeout: 5_000 });
    const after = await shellBoxes(page);
    expect(mid).toEqual(before);
    expect(after).toEqual(before);
    await expect(page.getByRole('img', { name: 'NURI HOLDEM' }).filter({ visible: true })).toHaveCount(1);

    await page.reload();
    await page.getByRole('img', { name: 'NURI HOLDEM' }).filter({ visible: true }).waitFor();
    for (let i = 0; i < 25; i++) { // 글린트 수명(350 + 1300ms)보다 길게 — 한 번이라도 생기면 실패
      expect(await page.locator(GLINT).count()).toBe(0);
      await page.waitForTimeout(100);
    }
  });

  test('reduced-motion — 글린트를 그리지 않는다', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('img', { name: 'NURI HOLDEM' }).filter({ visible: true }).waitFor();
    for (let i = 0; i < 25; i++) { // 위와 같은 창
      expect(await page.locator(GLINT).count()).toBe(0);
      await page.waitForTimeout(100);
    }
    expect(await page.evaluate(() => sessionStorage.getItem('nuri-glint'))).toBeNull();
  });
});
