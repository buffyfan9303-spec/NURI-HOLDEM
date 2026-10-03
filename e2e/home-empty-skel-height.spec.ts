// 홈 대회 0건 빈 카드 높이 — 스켈레톤 높이 이어받기는 **첫 로드 화면 한 장**에만(2026-10-04 재검토 H1).
//   하-3 수정(14569f33)은 콜드 첫 방문 0건 날의 CLS 를 0 으로 만들려고 빈 카드가 스켈레톤 높이를 물려받게 했다.
//   그런데 그 높이를 비우지 않아(홈은 keep-alive) 날짜 칩으로 고른 다른 0건 날도 빈 카드가 322px 로 남았다(원래 104px).
// ① 첫 화면: 빈 카드 높이 == 스켈레톤 높이(밀림 0 유지) ② 다른 날짜: 원래 높이 ③ 오늘로 돌아와도 원래 높이.
// 음성 대조: HomeTab 날짜 칩 onClick 의 `skelH.current = 0` 을 빼면 ②가 실패한다.
// 일정은 목킹(0건, 1.5초 늦게) — 스켈레톤이 반드시 한 번 그려지게. 운영 쓰기 0.
import { test, expect } from './_fixtures';
import { stabilizeBackstack, stubLogin } from './_session';
import { kstDay } from './_schedules';

test('홈 0건 — 첫 화면은 스켈레톤 높이를 물려받고, 날짜를 바꾸면 빈 카드가 원래 높이로 돌아온다', async ({ page }) => {
  await stubLogin(page);
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/\/rest\/v1\/schedules\?/, async (r) => {
    await new Promise((res) => setTimeout(res, 1500));
    await r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('/?tab=home');

  const skel = page.getByTestId('home-schedule-skeleton');
  await expect(skel, '스켈레톤이 그려지지 않았다(이어받기 경로를 못 탄다)').toBeVisible({ timeout: 20_000 });
  const skelH = await skel.evaluate((e) => e.getBoundingClientRect().height);
  expect(skelH, '스켈레톤 높이가 비정상').toBeGreaterThan(150);

  const empty = page.getByTestId('home-schedule-empty');
  const cardH = () => empty.evaluate((e) => e.parentElement!.getBoundingClientRect().height);
  await expect(empty).toBeVisible({ timeout: 20_000 });
  const h0 = await cardH();
  expect(Math.abs(h0 - skelH), `첫 화면 빈 카드(${h0}) ≠ 스켈레톤(${skelH}) — 첫 진입 밀림이 되살아났다`).toBeLessThanOrEqual(1);

  // 칩은 page.evaluate 로 누른다 — locator.click 의 자동 스크롤이 레이아웃 측정을 흔들지 않게.
  const pick = (iso: string) => page.evaluate((d) => (document.querySelector(`[data-date-pill="${d}"]`) as HTMLElement).click(), iso);
  await pick(kstDay(1));
  await expect(page.locator(`[data-date-pill="${kstDay(1)}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(empty).toBeVisible();
  const h1 = await cardH();
  expect(h1, `다른 0건 날 빈 카드가 ${h1}px — 스켈레톤 높이(${skelH})가 남았다`).toBeLessThan(160);

  await pick(kstDay(0));
  await expect(page.locator(`[data-date-pill="${kstDay(0)}"]`)).toHaveAttribute('aria-pressed', 'true');
  const h2 = await cardH();
  expect(h2, `오늘로 돌아왔는데 빈 카드가 ${h2}px`).toBeLessThan(160);
  console.log(`[home-empty-skel] 스켈레톤 ${skelH} · 첫 빈 카드 ${h0} · 다른 날 ${h1} · 오늘 재선택 ${h2}`);
});
