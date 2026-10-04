/**
 * 캘린더로 돌아올 때 기존 오류 카드를 걷었다 다시 세우지 않는다(CLS 0.226 · 190px 튐).
 *
 * 원인: CalendarPanel.reload() 가 시작하자마자 setErr(null) 을 했다. 탭이 다시 보일 때마다 reload 가 도는데,
 *   조회가 계속 실패하는 사용자(세션 만료·오프라인)는 카드가 걷혔다가 같은 실패 응답에 다시 서며 아래 내용이 190px 오르내렸다.
 * 고침: 재조회 중에는 기존 오류를 두고, 결과로 교체한다(성공했을 때만 지운다).
 *
 * 조회는 전부 page.route 로 갈아끼운다 — 서버 응답에 의존하지 않고 운영 쓰기도 0.
 *   ① 계속 실패: 두 번째 조회(캘린더로 돌아온 reload)를 700ms 늦춰, 그 사이 카드가 한 순간도 사라지지 않고 내용이 안 움직인다.
 *   ② 대조군: 두 번째 조회가 성공하면 카드는 **지워진다**(① 이 '카드가 아예 안 지워지는 화면'이라 통과한 게 아님을 증명).
 */
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { stabilizeBackstack, stubLogin } from './_session';

const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const FAIL = { message: 'forced failure', code: 'XX000' };
const ERR_CARD = /정보를 불러오지 못했습니다|뱅크롤 데이터/;
const NAV = 'nav[aria-label="하단 내비게이션"]';

/** bankroll_entries 응답을 호출 순서대로 정한다 — 첫 조회는 즉시, 이후 조회는 DELAY 만큼 늦게. */
async function stubReads(page: Page, second: 'fail' | 'ok', delay = 700) {
  let n = 0;
  await page.route(/\/rest\/v1\/bankroll_entries\?/, async (r) => {
    n += 1;
    if (n === 1) return r.fulfill(json(FAIL, 500));
    await new Promise((res) => setTimeout(res, delay));
    return r.fulfill(second === 'fail' ? json(FAIL, 500) : json([]));
  });
  await page.route(/\/rest\/v1\/schedule_likes\?/, (r) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/schedule_reservations\?/, (r) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/spot_reviews\?/, (r) => r.fulfill(json([])));
  return () => n;
}

async function open(page: Page) {
  await stubLogin(page);
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForSelector('button[aria-label^="알림"]', { timeout: 30_000 });
  const go = (name: RegExp) => page.locator(NAV).getByRole('button', { name }).first().click();
  await go(/^캘린더/);
  const cal = page.locator('.tab-pane[data-tab="calendar"]');
  await expect(cal.getByText(ERR_CARD).first(), '전제: 첫 조회 실패로 오류 카드가 선다').toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await go(/^홈/);
  await expect(page.locator('.tab-pane[data-tab="home"]')).toBeVisible();
  await page.waitForTimeout(700); // 떠나는 판 페이드 정착
  return { cal, go };
}

/** 캘린더 탭을 누른 직후 1.1초 동안 매 프레임: 오류 카드 존재 여부와 판 높이를 기록한다. */
const sample = (page: Page) => page.evaluate(() => new Promise<{ absent: number; frames: number; minH: number; maxH: number }>((resolve) => {
  const pane = document.querySelector<HTMLElement>('.tab-pane[data-tab="calendar"]')!;
  const re = /정보를 불러오지 못했습니다|뱅크롤 데이터/;
  let absent = 0, frames = 0, minH = Infinity, maxH = 0;
  const t0 = performance.now();
  const tick = () => {
    frames += 1;
    if (!re.test(pane.textContent ?? '')) absent += 1;
    const h = pane.getBoundingClientRect().height;
    if (pane.style.display !== 'none' && h > 0) { minH = Math.min(minH, h); maxH = Math.max(maxH, h); }
    if (performance.now() - t0 < 1100) requestAnimationFrame(tick); else resolve({ absent, frames, minH, maxH });
  };
  requestAnimationFrame(tick);
}));

test('계속 실패하는 캘린더 — 돌아올 때 오류 카드가 걷혔다 다시 서지 않는다', async ({ page }) => {
  test.setTimeout(90_000);
  const calls = await stubReads(page, 'fail');
  const { cal, go } = await open(page);
  const before = calls();
  const sampling = sample(page);
  await go(/^캘린더/);
  const r = await sampling;
  await expect.poll(calls, { message: '전제: 돌아온 뒤 재조회가 실제로 돌았다' }).toBeGreaterThan(before);
  await expect(cal.getByText(ERR_CARD).first()).toBeVisible();
  expect(r.frames, '전제: 프레임을 충분히 쟀다').toBeGreaterThan(30);
  expect(r.absent, `재조회 중 오류 카드가 사라진 프레임 수(전체 ${r.frames})`).toBe(0);
  expect(r.maxH - r.minH, `재조회 중 판 높이 변동(${r.minH}~${r.maxH})`).toBeLessThanOrEqual(2);
});

test('대조군 — 재조회가 성공하면 오류 카드는 지워진다', async ({ page }) => {
  test.setTimeout(90_000);
  await stubReads(page, 'ok');
  const { cal, go } = await open(page);
  await go(/^캘린더/);
  await expect(cal.getByText(ERR_CARD), '성공했는데 오류 카드가 남았다').toHaveCount(0, { timeout: 10_000 });
});
