// 헤더 — 320px 에서 현재 위치가 잘리지 않는다 (U01).
//
// 왜 필요한가 (2026-09-12 실측):
//   320px 폭에서 헤더 잔량은 `320 − 좌우 여백 17×2 − 우측 버튼 클러스터 137 = 149px` 인데,
//   로고 버튼이 `shrink-0` 이라 96.1px(마크 25.5 + 워드마크 64.2 + gap)을 먼저 가져갔다.
//   타이틀에는 **34.9px** 만 남아 `min-w-0 truncate` 가 혼자 전부 흡수 → '커뮤니티' 가 `커…` 로 잘렸다.
//   다크·라이트 모두 재현됐고, 360·390 에서는 정상이라 **320 에서만** 나는 결함이다.
//
//   고친 방법: 320 대역에서 **워드마크만 접는다**(마크는 남긴다).
//   글자 크기·히트영역을 줄이는 방법은 쓰지 않았다 — 그건 접근성 규격을 깎는 것이라.
//
// ⚠ 이 스펙은 `scrollWidth > clientWidth` 로 **실제 잘림**을 잰다.
//   `textContent` 는 잘려도 원문 그대로라 절대 안 잡힌다(CSS truncate 는 DOM 을 바꾸지 않는다).
// ⚠ `test` 는 `_fixtures` 것을 쓴다 — 운영 쓰기 차단 가드가 거기에 붙어 있다(`@playwright/test` 직접 임포트 금지).
import { test, expect } from './_fixtures';
import { stabilizeBackstack } from './_session';

/** 탭 라벨 — 헤더의 '현재 위치' 로 그려지는 값. */
const TABS = [
  { name: /커뮤니티/, label: '커뮤니티' },
  { name: /일정|탐색/, label: '일정 탐색' },
  { name: /라이브|실시간/, label: '라이브' },
];

test.describe('헤더 — 320px 현재 위치 (U01)', () => {
  for (const width of [320, 360, 390]) {
    test(`🔴 ${width}px — 현재 위치가 말줄임으로 잘리지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 720 });
      await page.goto('/');
      await stabilizeBackstack(page);

      for (const t of TABS) {
        const tab = page.getByRole('button', { name: t.name }).filter({ visible: true }).first();
        if (!(await tab.count())) continue;
        await tab.click({ timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(400);

        const title = page.locator('[aria-current="page"]').filter({ visible: true }).first();
        if (!(await title.count())) continue;

        const m = await title.evaluate((el) => ({
          client: el.clientWidth,
          scroll: el.scrollWidth,
          text: (el.textContent ?? '').trim(),
        }));

        expect(
          m.scroll,
          `${width}px 에서 "${m.text}" 가 잘린다 — 보이는 폭 ${m.client}px < 필요한 폭 ${m.scroll}px`,
        ).toBeLessThanOrEqual(m.client + 1);   // 소수점 반올림 여유 1px
      }
    });
  }

  test('320px 에서도 홈으로 가는 로고 버튼은 남아 있다 — 워드마크만 접는다', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await stabilizeBackstack(page);
    // 워드마크를 접어도 '홈으로' 진입점 자체가 사라지면 안 된다(기능 소실).
    const home = page.getByRole('button', { name: '홈으로' }).filter({ visible: true }).first();
    await expect(home, '320px 에서 홈 버튼이 사라졌다').toBeVisible();
    const box = await home.boundingBox();
    expect(box?.width ?? 0, '홈 버튼이 너무 작아 누르기 어렵다').toBeGreaterThanOrEqual(24);
  });

  test('페이지 자체는 가로로 넘치지 않는다 — 잘림을 overflow 로 옮기지 않았는지', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await stabilizeBackstack(page);
    const over = await page.evaluate(() =>
      document.documentElement.scrollWidth - window.innerWidth);
    expect(over, '가로 스크롤이 생겼다 — 글자를 살리려고 폭을 넘겼다').toBeLessThanOrEqual(0);
  });
});
