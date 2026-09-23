// 홈 배너 점 탭이 엉뚱한 장에 멈추던 결함(2026-09-24 design-reviewer 발견, HOME-DENSITY 전후 동일 3/3).
//
// 재현: 다음 → 이전 → '3번째 배너' 점. 이전이 0 에 닿으면 onScroll 랩이 scrollLeft 를 half(복제 세트 첫 장)로 옮긴다.
//   거기서 점을 누르면 목표가 half + 2w 인데, 스무스 스크롤이 half + w 를 지나는 순간 랩(-half)이 스크롤을 끊어
//   2번째 장에 멈췄다. 고친 곳: PosterCarousel go() — 오른쪽 목표가 랩 임계를 넘으면 원본 세트 쪽으로 먼저 옮긴다.
// 클릭은 page.evaluate(btn.click()) — locator.click() 의 자동 스크롤·액션 대기가 스무스 스크롤 타이밍을 흐리지 않게.
// 운영 DB 에 쓰지 않는다 — event_board · home_banners 는 page.route 로 만든다.
import { test, expect } from './_fixtures';
import type { Page, Route } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays } from './_session';

const j = (r: Route, body: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const banner = (id: string, title: string, sort: number) => ({ id, title, subtitle: null, image_url: '/nuri-logo.png', link_url: null, active: true, sort_order: sort, starts_at: null, ends_at: null });

async function openHome(page: Page) {
  await page.route(/\/rest\/v1\/rpc\/event_board/, (r) => j(r, null));
  // 관리자 배너 3장 — 운영 스위치(브랜드 슬라이드)와 무관하게 3장 이상을 보장한다.
  await page.route(/\/rest\/v1\/home_banners\?/, (r) => j(r, [banner('a', '배너 A', 1), banner('b', '배너 B', 2), banner('c', '배너 C', 3)]));
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await dismissOverlays(page);
  await expect(page.getByTestId('home-banner-viewport')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('home-banner-dots').locator('button[aria-label="3번째 배너"]')).toHaveCount(1, { timeout: 20_000 });
  await page.waitForTimeout(800);
  // 관리자 배너가 이벤트/브랜드 슬라이드보다 늦게 도착하면 스냅이 보던 장을 붙잡아 첫 화면이 0번 장이 아닐 수 있다 — 첫 장으로 맞춘다.
  await press(page, '1번째 배너');
  expect((await settle(page)).card).toBe(0);
}

const press = (page: Page, name: string) =>
  page.evaluate((n) => (document.querySelector(`[data-testid="home-banner-dots"] button[aria-label="${n}"]`) as HTMLButtonElement).click(), name);

/** 스크롤이 멈출 때까지(250ms 뒤 연속 3프레임 같은 값) 기다린 뒤 현재 장을 읽는다. */
const settle = (page: Page) => page.getByTestId('home-banner-viewport').evaluate((el) => new Promise<{ left: number; w: number; card: number; n: number }>((res) => {
  let last = -1, same = 0;
  const t0 = performance.now();
  const tick = () => {
    const l = el.scrollLeft;
    same = Math.abs(l - last) < 0.5 ? same + 1 : 0;
    last = l;
    if ((same >= 3 && performance.now() - t0 > 250) || performance.now() - t0 > 3000) {
      const w = el.clientWidth, n = el.firstElementChild!.children.length / 2;
      res({ left: l, w, card: ((Math.round(l / w) % n) + n) % n, n });
    } else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}));

test('🔴 다음 → 이전 → 3번째 점 = 3번째 장에 멈춘다(랩이 스무스 스크롤을 끊지 않는다)', async ({ page }) => {
  await openHome(page);
  await press(page, '다음 배너');
  expect((await settle(page)).card).toBe(1);
  await press(page, '이전 배너');
  const back = await settle(page);
  expect(back.card).toBe(0);
  await press(page, '3번째 배너');
  const s = await settle(page);
  expect(s.card, `scrollLeft=${s.left} w=${s.w} (점 누르기 전 위치=${back.left})`).toBe(2);
  await expect(page.getByTestId('home-banner-dots').locator('button[aria-label="3번째 배너"]')).toHaveAttribute('aria-current', 'true');
});

test('🔴 마지막 점 → 첫 점 · 이전/다음이 누른 수만큼 움직인다', async ({ page }) => {
  await openHome(page);
  const { n } = await settle(page);
  await press(page, `${n}번째 배너`);
  expect((await settle(page)).card).toBe(n - 1);
  await press(page, '1번째 배너');
  expect((await settle(page)).card).toBe(0);
  await press(page, '이전 배너');
  expect((await settle(page)).card).toBe(n - 1);
  await press(page, '다음 배너');
  expect((await settle(page)).card).toBe(0);
  await press(page, '다음 배너');
  expect((await settle(page)).card).toBe(1);
  await press(page, `${n}번째 배너`);
  expect((await settle(page)).card).toBe(n - 1);
});
