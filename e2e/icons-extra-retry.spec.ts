/**
 * PR #205 design-review P2-1 — 아이콘 나중 청크(iconsExtra)를 부팅 중에 한 번 못 받아도, 망이 돌아오면 새로고침 없이 채워진다.
 *
 * 원인: Chromium 은 실패한 동적 import 를 모듈 맵에 남긴다 → 같은 주소로 다시 import() 해도 즉시 실패한다
 *   (검토 하네스 3/3 재현: 차단 해제 9.5초 뒤에도 GTO 화면 빈 아이콘 17개). 그래서 '비우고 다시 부르기'는 회복하지 못했다.
 * 시나리오(검토서 R): 부팅 내내 청크만 끊는다 → 숨김 예열된 GTO 판에 빈 칸이 생긴 것을 확인 → 끊김 해제 → GTO 탭을 연다 → 빈 칸 0.
 * 거짓 통과 방지: ① 차단이 실제로 요청을 끊었다(hits) ② 해제 전 GTO 판에 빈 칸이 있었다 ③ 회복이 새로고침이 아니다(창 표식 유지 —
 *   새로고침이면 입력 중인 글·열린 시트가 날아간다).
 */
import { type Page } from '@playwright/test';
import { test, expect } from './_fixtures';

test.use({ viewport: { width: 390, height: 844 } });

const NAV = 'nav[aria-label="하단 내비게이션"]';
const pending = (page: Page, visibleOnly: boolean) => page.evaluate((visibleOnly) => {
  const pane = document.querySelector('[data-tab="tools"].tab-pane');
  return [...(pane?.querySelectorAll('[data-icon-pending]') ?? [])]
    .filter((e) => !visibleOnly || (e.getClientRects().length > 0 && e.getBoundingClientRect().top < innerHeight)).length;
}, visibleOnly);

test('아이콘 청크가 부팅 중에만 실패해도 망이 돌아오면 새로고침 없이 채워진다', async ({ page, context }) => {
  test.setTimeout(90_000);
  let block = true;
  let hits = 0;
  await context.route(/\/assets\/iconsExtra-[^/?]+\.js(\?.*)?$/, (r) => {
    if (!block) return r.continue();
    hits++;
    return r.abort('internetdisconnected');
  });

  await page.goto('/');
  await page.waitForSelector(NAV, { timeout: 30_000 });
  await page.evaluate(() => { (window as unknown as { __noReload?: 1 }).__noReload = 1; });

  // ①② 끊김이 실제로 걸렸고, 숨김 예열된 GTO 판에 빈 칸이 생겼다
  await expect.poll(() => hits, { timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(() => pending(page, false), { timeout: 30_000, message: 'GTO 판에 빈 아이콘이 생기지 않았다(시나리오 불성립)' }).toBeGreaterThan(0);

  block = false; // 망 복구 — online 이벤트 없음(청크만 끊겼다 돌아오는 경우)
  const box = await page.locator(NAV).getByRole('button', { name: /^GTO/ }).first().boundingBox();
  expect(box, 'GTO 탭 버튼').not.toBeNull();
  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);

  await expect.poll(() => pending(page, true), { timeout: 10_000, message: 'GTO 화면에 빈 아이콘이 남았다' }).toBe(0);
  expect(await pending(page, false), '숨은 곳까지 빈 칸 0').toBe(0);
  // ③ 새로고침으로 회복한 것이 아니다
  expect(await page.evaluate(() => (window as unknown as { __noReload?: 1 }).__noReload)).toBe(1);
});
