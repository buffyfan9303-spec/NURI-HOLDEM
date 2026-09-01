// Apple 시트 물리(모션 헌법 v2 §3) 실측 게이트 — "코드가 있다"가 아니라 **스프링이 실제로 돈다**를 잰다.
//
// drag-close.spec 은 '손가락을 따라오고 놓으면 닫힌다' 를 본다. 여기서는 그 반대편 절반:
//  ① 짧게(60px·느리게) 끌고 놓으면 **닫히지 않고** WAAPI 스프링(linear() 이징)으로 제자리에 정착한다.
//     — 이게 CSS 트랜지션으로 되돌아가면 easing 이 cubic-bezier 가 되고, 손 뗀 속도가 버려진다.
//  ② 빠르게 튕기면(180px/120ms ≈ 1500px/s) 거리가 임계(120px) 미만이어도 **운동량 투영**이 닫는다.
//     — 예전 구현은 거리 120px 또는 속도 0.6px/ms 의 단순 임계였다. 투영은 '가려던 곳' 으로 판단한다.
// 왜 Playwright 인가: 브라우저 페인(MCP)에서는 터치 이벤트를 실제로 발생시킬 수 없다.
import { test, expect, type Page } from '@playwright/test';
import { dismissOverlays, stabilizeBackstack } from './_session';

async function swipe(page: Page, x: number, y: number, dist: number, ms: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dist * i) / steps }] });
    await page.waitForTimeout(ms / steps);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('🔴 시트 스프링 — 짧게 끌면 WAAPI 스프링으로 복귀, 플릭하면 투영이 닫는다', async ({ page }) => {
  await stabilizeBackstack(page);
  await page.goto('/');
  await dismissOverlays(page).catch(() => {});
  await page.waitForSelector('button[aria-label^="알림"]', { timeout: 15_000 });
  // 로그아웃 상태의 로그인 시트 — dragToClose 가 켜진 시트 중 로그인 없이 열 수 있는 것
  await page.getByRole('button', { name: /로그인/ }).first().click({ timeout: 5_000 });
  const dlg = page.locator('[role="dialog"]').first();
  await expect(dlg).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(500); // sheet-up 진입 애니가 끝난 뒤 잡는다

  const grip = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const g = d && [...d.querySelectorAll<HTMLElement>('div')].find((x) => getComputedStyle(x).touchAction === 'none');
    const r = g?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  });
  expect(grip, '그립(touch-action:none)을 못 찾았다').not.toBeNull();

  // ① 짧고 느린 드래그 → 열린 채 스프링 복귀
  await swipe(page, grip!.x, grip!.y, 60, 400);
  await page.waitForTimeout(60);
  const mid = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]') as HTMLElement | null;
    const eff = (d?.getAnimations()[0] as Animation | undefined)?.effect as KeyframeEffect | undefined;
    return { open: !!d, easing: String(eff?.getTiming().easing ?? ''), dur: Number(eff?.getTiming().duration ?? 0) };
  });
  expect(mid.open, '짧은 드래그에 시트가 닫혔다 — 투영 임계가 너무 낮다').toBe(true);
  expect(mid.easing, `복귀가 WAAPI 스프링(linear())이 아니다: ${mid.easing.slice(0, 40)}`).toMatch(/^linear\(/);
  expect(mid.dur, '스프링 정착 시간이 UI 범위(120~1200ms) 밖').toBeGreaterThanOrEqual(120);
  expect(mid.dur).toBeLessThanOrEqual(1200);
  await page.waitForTimeout(mid.dur + 200);
  const settled = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]') as HTMLElement | null;
    return d ? getComputedStyle(d).transform : 'gone';
  });
  expect(settled === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(settled), `제자리로 안 돌아왔다: ${settled}`).toBe(true);

  // ② 플릭 → 거리 미달이어도 운동량 투영이 닫는다
  await swipe(page, grip!.x, grip!.y, 180, 120);
  await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 3_000 });
});
