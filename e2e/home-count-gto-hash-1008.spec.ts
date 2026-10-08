// 홈 2건(2026-10-08 · home-team 2차).
//
// ① R11-04 (audit12 chain-1008 P3) — 홈 '대회 N개' 는 응답이 온 뒤에만 말한다.
//    수정 전: 응답 전(뼈대 옆)·실패(오류 카드 옆) 모두 '대회 0개' — 사실이 아닌 숫자. 390·1440 둘 다.
//    양성 대조: 실제로 0건이 오면 '대회 0개' 가 그대로 선다(숫자를 아예 지운 것이 아님을 본다).
// ② 깨진 GTO 공유 해시(#gto=) — 주소창에서 걷고 짧은 안내. 파서가 null 을 돌리는 계약(#221 readGtoHash)만 전제한다.
//    여기서는 지금 main 파서로도 null 인 빈 코드('#gto=')를 쓴다. '#gto=%' 는 #221 병합 뒤 같은 갈래를 탄다.
// 목킹만 — 운영 쓰기 0.
import { test, expect } from './_fixtures';
import { dismissOverlays, stabilizeBackstack } from './_session';

const WIDTHS = [390, 1440];

for (const width of WIDTHS) {
  test(`R11-04 홈 건수 — 응답 전·실패에는 '대회 0개' 를 말하지 않는다 (${width})`, async ({ page }) => {
    await stabilizeBackstack(page);
    await page.setViewportSize({ width, height: 900 });
    let mode: 'hold' | 'fail' = 'hold';
    let release: () => void = () => {};
    const held = new Promise<void>((res) => { release = res; });
    await page.route(/\/rest\/v1\/schedules\?/, async (r) => {
      if (mode === 'hold') await held;
      await r.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"down"}' });
    });
    await page.goto('/?tab=home');
    const count = page.getByTestId('home-schedule-count');
    await expect(page.getByTestId('home-schedule-skeleton')).toBeVisible({ timeout: 20_000 });
    await expect(count).toBeAttached();
    expect((await count.textContent())?.trim(), '응답 전(뼈대)인데 건수를 말한다').toBe('');

    mode = 'fail'; release();
    // 실패 갈래 — 오류 카드가 선 뒤에도 '대회 0개' 가 없어야 한다(재시도 대기 포함 넉넉히)
    await expect(page.getByText('대회 목록', { exact: false }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('home-schedule-skeleton')).toHaveCount(0, { timeout: 30_000 });
    expect((await count.textContent())?.trim(), '조회 실패인데 건수를 말한다').toBe('');
  });

  test(`R11-04 양성 대조 — 실제 0건이면 '대회 0개' (${width})`, async ({ page }) => {
    await stabilizeBackstack(page);
    await page.setViewportSize({ width, height: 900 });
    await page.route(/\/rest\/v1\/schedules\?/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto('/?tab=home');
    await expect(page.getByTestId('home-schedule-count')).toHaveText(/대회 0개|오늘·내일 예정 없음/, { timeout: 20_000 });
  });
}

test('깨진 #gto= 해시 — 주소창에서 걷히고 안내 토스트가 뜬다(앱은 그대로)', async ({ page }) => {
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#gto=');
  await dismissOverlays(page);
  await expect(page.getByText('공유 링크가 깨져 열 수 없습니다')).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => location.hash), { timeout: 5_000 }).toBe('');
  // 앱 셸은 살아 있다 — 탭바가 그대로 보인다
  await expect(page.locator('main[data-tab]').first()).toBeAttached();
});

test('정상 경로 보존 — 해시가 없으면 안내 토스트를 띄우지 않는다', async ({ page }) => {
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForTimeout(2_000);
  await expect(page.getByText('공유 링크가 깨져 열 수 없습니다')).toHaveCount(0);
});
