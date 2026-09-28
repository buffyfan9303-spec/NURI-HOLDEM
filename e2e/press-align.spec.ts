// 가운데 정렬 요소가 누름·등장 모션 동안 제자리를 지키는가 (2026-09-28 · v3 때부터 있던 결함).
//
// 원인: index.css 전역 프레스 `button:active { transform: scale(.97) }` 와 `@keyframes slide-up { transform: translateY(8px) }` 가
//   transform 을 **통째로** 바꿔, 요소 자신의 정렬 translate(`top-1/2 -translate-y-1/2`·`left-1/2 -translate-x-1/2`)를 덮었다.
//   → 비밀번호 보기 버튼이 누르는 동안 22px 떨어졌고, 설치 배너는 반 폭(189.5px) 오른쪽에서 나타나 제자리로 튀었다.
//   처방: 둘 다 transform 유틸 에뮬레이션과 같은 합성식(translate(var(--tw-translate-x/y)) rotate scaleX scaleY)을 쓴다.
// 왜 기존 스펙이 못 잡았나: Playwright click 은 누름 0ms 라 :active 가 렌더되지 않고, 설치 배너는 beforeinstallprompt 가 있어야 뜬다.
// ⚠ 터치 탭으로 '비밀번호 보기'를 재면 안 된다 — 클릭에 자식 아이콘(eye→eye-off)이 바뀌면 Chromium 이 :active 를 곧바로 버린다.
//   그래서 실제 화면은 마우스 홀드로, 터치 경로는 자식이 안 바뀌는 같은 클래스 버튼으로 잰다.
// 음성 대조(2026-09-28 실행): HEAD c3537d93 빌드 → ① Δy 22 · ② Δy 22 · ③ Δx 189.5 로 FAIL, 수정 빌드 → 전부 0 PASS.
import type { CDPSession, Page } from '@playwright/test';
import { test, expect } from './_fixtures';

test.use({ hasTouch: true });

type S = { t: number; x: number; y: number; w: number; a: 0 | 1; anim: number };
const REC = (sel: string) => `(() => { const w = window; w.__c = []; const t0 = performance.now();
  const loop = () => { const e = document.querySelector(${JSON.stringify(sel)});
    if (e) { const r = e.getBoundingClientRect();
      w.__c.push({ t: performance.now() - t0, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, a: e.matches(':active') ? 1 : 0, anim: e.getAnimations().length }); }
    if (performance.now() - t0 < 1400) requestAnimationFrame(loop); };
  requestAnimationFrame(loop); })()`;
const samples = (page: Page) => page.evaluate(() => (window as unknown as { __c: S[] }).__c);
const cpu = (cdp: CDPSession, rate: number) => cdp.send('Emulation.setCPUThrottlingRate', { rate });

test('🔴 ① 터치로 누르고 뗀 가운데 정렬 버튼 — :active·복귀 동안 중심이 그대로다(크기만 준다)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('nav[aria-label="하단 내비게이션"]')).toBeVisible({ timeout: 20_000 });
  const cdp = await page.context().newCDPSession(page);
  // 앱 CSS 그대로 — 매장 이용권 레일 '지우기' 와 같은 클래스(absolute top-1/2 -translate-y-1/2). 자식이 바뀌지 않는다.
  await page.evaluate(() => {
    const h = document.createElement('div');
    h.style.cssText = 'position:fixed;left:100px;top:200px;width:200px;height:80px;z-index:9999';
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'pa-btn'; b.textContent = 'x';
    b.className = 'absolute right-0 top-1/2 -translate-y-1/2 h-[44px] w-[44px]';
    h.appendChild(b); document.body.appendChild(h);
  });
  const bb = (await page.locator('#pa-btn').boundingBox())!;
  await cpu(cdp, 4);
  await page.evaluate(REC('#pa-btn'));
  await page.waitForTimeout(120);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }] });
  await page.waitForTimeout(150);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(900);
  const s = await samples(page);
  await cpu(cdp, 1);
  const r0 = s[0];
  expect(s.filter((x) => x.a).length, ':active 가 한 프레임도 안 잡혔다 — 측정이 공허하다').toBeGreaterThan(0);
  expect(Math.min(...s.map((x) => x.w)), '누름 배율(0.97)이 사라졌다 — 프레스 물리가 죽었다').toBeLessThan(43.5);
  expect(Math.max(...s.map((x) => Math.abs(x.y - r0.y))), '누르는 동안 세로 정렬(-translate-y-1/2)이 빠졌다').toBeLessThanOrEqual(0.5);
  expect(Math.max(...s.map((x) => Math.abs(x.x - r0.x)))).toBeLessThanOrEqual(0.5);
});

test('🔴 ② 로그인 시트 비밀번호 보기 — 마우스로 누르고 있는 동안 제자리(크기만 준다)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /로그인/ }).first().click({ timeout: 20_000 });
  const reveal = page.getByRole('dialog').first().getByRole('button', { name: '비밀번호 보기' });
  await expect(reveal).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(600);
  const cdp = await page.context().newCDPSession(page);
  const box = (await reveal.boundingBox())!;
  await cpu(cdp, 4);
  await page.evaluate(REC('[aria-label="비밀번호 보기"],[aria-label="비밀번호 숨기기"]'));
  await page.waitForTimeout(120);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(700);
  const s = await samples(page);
  await cpu(cdp, 1);
  const r0 = s[0];
  expect(s.filter((x) => x.a).length, ':active 가 한 프레임도 안 잡혔다 — 측정이 공허하다').toBeGreaterThan(0);
  expect(Math.min(...s.map((x) => x.w)), '누름 배율(0.97)이 사라졌다').toBeLessThan(43.5);
  expect(Math.max(...s.map((x) => Math.abs(x.y - r0.y))), '누르는 동안 세로 정렬(-translate-y-1/2)이 빠졌다(v3 때 22px 낙하)').toBeLessThanOrEqual(0.5);
});

test('🔴 ③ 설치 배너 등장(slide-up) — 미끄러져 오르는 동안 가로 가운데 정렬을 지킨다', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('nav[aria-label="하단 내비게이션"]')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800);
  const cdp = await page.context().newCDPSession(page);
  await cpu(cdp, 4);
  await page.evaluate(REC('div.z-60.-translate-x-1\\/2'));
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };
    e.prompt = async () => {}; e.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(e);
  });
  await page.waitForTimeout(900);
  const s = await samples(page);
  await cpu(cdp, 1);
  const vw = await page.evaluate(() => innerWidth);
  expect(s.length, '설치 배너가 뜨지 않았다(beforeinstallprompt 경로 확인)').toBeGreaterThan(3);
  expect(s.filter((x) => x.anim > 0).length, '등장 애니메이션이 한 프레임도 안 잡혔다 — 측정이 공허하다').toBeGreaterThan(0);
  expect(s[0].y - s[s.length - 1].y, '8px 넛지(slide-up)가 사라졌다').toBeGreaterThan(1);
  expect(Math.max(...s.map((x) => Math.abs(x.x - vw / 2))), '등장 동안 가로 정렬(-translate-x-1/2)이 빠졌다(v3 때 반 폭 옆에서 등장)').toBeLessThanOrEqual(0.5);
});
