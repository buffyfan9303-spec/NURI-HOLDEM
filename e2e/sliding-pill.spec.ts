import { test, expect } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays } from './_session';
// FLIP 공용 유틸(SlidingPill) 게이트 — framer layoutId 대체가 픽셀 단위로 정확한지.
// 크래시는 스모크가 잡지만 '알약이 엉뚱한 자리에 있는' 시각 결함은 좌표로만 보인다.
test('🔴 SlidingPill — 알약이 활성 버튼과 픽셀 단위로 일치한다', async ({ page }) => {
  await stabilizeBackstack(page);
  await page.goto('/');
  await dismissOverlays(page);
  await page.waitForTimeout(1000);
  // 일정탐색의 뷰모드 토글 — SlidingPill 사이트
  // (필터 레일 재설계로 토너 필터 세그먼트가 칩으로 바뀌어, 같은 화면의 다른 FLIP 사이트로 재조준 — 동커밋 규칙)
  const second = page.locator('[role="group"][aria-label="보기 방식 선택"] button').nth(1);
  await second.click();
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const grp = document.querySelector('[role="group"][aria-label="보기 방식 선택"]')!;
    const active = grp.querySelector('[data-pill-active]')!.getBoundingClientRect();
    const pills = [...grp.children].filter((c) => c.tagName === 'SPAN');
    const pill = pills[0]?.getBoundingClientRect();
    return { active: { x: active.x, y: active.y, w: active.width, h: active.height },
             pill: pill ? { x: pill.x, y: pill.y, w: pill.width, h: pill.height } : null };
  });
  console.log(JSON.stringify(r));
  expect(r.pill, '알약 스팬이 없다').toBeTruthy();
  expect(Math.abs(r.pill!.x - r.active.x), '알약 x 어긋남').toBeLessThan(2);
  expect(Math.abs(r.pill!.y - r.active.y), '알약 y 어긋남').toBeLessThan(2);
  expect(Math.abs(r.pill!.w - r.active.w), '알약 폭 어긋남').toBeLessThan(2);
});
