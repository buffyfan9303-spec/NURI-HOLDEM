// 클락 TV 왼쪽 칸 슬라이드(K단계, 2026-09-30) — 시상 → 추가 A → 추가 B(팀 점수 W-11) → 광고.
//
// 요구 원문: .claude/handoff/specs-0930/PLAN-AB-exec.md §5-1 · W-defects.md#W-11.
// 계약:
//   ① 순서·머무름 — 시상 30초 → 추가 페이지 30초씩 → 광고 10초 → 다시 시상(서버 시각 기준이라 페이지 시계로 결정적).
//   ② 시상 문구(text)는 금액 대신 그대로, 메모는 줄 아래.
//   ③ 팀 점수 페이지는 팀 합산 점수로 정렬해 순위를 붙인다.
//   ④ 못 불러오는 광고는 건너뛴다(빈 장을 걸지 않는다).
//   ⑤ 시상만 있는 매장은 종전 화면 그대로(장 표시 없음 · 머리말 Prize Pool).
// 쓰기 0 — clock_states·clock_ads 조회만 갈아끼운다. server_now 는 _fixtures 가 끊어 오프셋 0 → 서버 시각 = 페이지 시계.
import { test, expect } from './_fixtures';
import { TV_VENUE as VENUE, serveClock } from './_clock';

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const AD_OK = 'https://ads.e2e.invalid/ok.png';
const AD_BAD = 'https://ads.e2e.invalid/missing.png';

const LEVELS = [
  { kind: 'level', sb: 500, bb: 1000, ante: 1000, minutes: 20 },
  { kind: 'level', sb: 1000, bb: 2000, ante: 2000, minutes: 20 },
];

function row(extra: Record<string, unknown>, endsAt: number) {
  return {
    venue_id: VENUE, game_seq: 1, session_date: null, title: '깐부 팀전',
    config: {
      title: '깐부 팀전', startStack: 50_000, rebuyStack: 0, addonStack: 0, isAddon: false,
      earlyBonus: 0, doubleEarlyBonus: 0, regCloseLevel: 0, maxLevel: 2,
      earlyDoubleLevel: 0, earlySingleLevel: 0, earlyDoubleMin: 0, earlySingleMin: 0, mysteryBounty: 0,
      prizes: [{ place: '1st', amount: 0, text: '시드권 + 트로피', note: '결승 직행' }, { place: '2nd', amount: 300_000 }],
      levels: LEVELS, ...extra,
    },
    current_index: 0, running: true, ends_at: new Date(endsAt).toISOString(), remaining_ms: 0,
    adj_entries: 0, adj_rebuys: 0, adj_earlies: 0, adj_addons: 0, eliminations: 0,
    live_stats: { entries: 12, rebuys: 0, alive: 12, avgStack: 50_000, totalStack: 600_000, buyInAmount: 50_000 },
  };
}

async function serveAds(page: import('@playwright/test').Page, urls: string[]) {
  const far = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();
  await page.route(/\/rest\/v1\/clock_ads/, (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify(urls.map((u, i) => ({ id: `ad${i}`, image_url: u, starts_at: past, ends_at: far, venue_ids: null, sort_order: i }))),
  }));
  await page.route(AD_OK, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX }));
  await page.route(AD_BAD, (r) => r.fulfill({ status: 404, body: '' }));
}

const shownSheet = (page: import('@playwright/test').Page) =>
  page.getByTestId('clk-prize-track').locator(':scope > div:not([aria-hidden])');

test.describe('클락 TV — K단계 슬라이드', () => {
  test('시상 30초 → 바운티 30초 → 팀 점수 30초 → 광고 10초 → 시상, 못 불러오는 광고는 건너뜀', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    // 한 바퀴 = 30 + 30 + 30 + 10 = 100초. 바퀴 시작 1초 뒤에서 시작한다(시상 칸).
    const T0 = Math.floor(Date.now() / 100_000) * 100_000 + 100_000 + 1_000;
    await page.clock.install({ time: T0 });
    await serveClock(page, row({
      extraPages: [
        { kind: 'bounty', title: '바운티 안내', rows: [{ label: '헤드 바운티', content: '1만 칩', note: '탈락시킨 사람에게' }] },
        { kind: 'team', title: '깐부 팀 순위', points: [14, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
          rows: [{ label: 'A팀', content: '2, 9', note: '김·이' }, { label: 'B팀', content: '1, 12' }, { label: 'C팀', content: '3, 4' }] },
      ],
    }, T0 + 15 * 60_000));
    await serveAds(page, [AD_BAD, AD_OK]);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/?display=${VENUE}&g=1&auto=0`);
    await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
    const aside = page.getByTestId('clk-prizes');

    // ① 시상 칸 + ② 문구·메모
    await expect(aside.locator('p').first()).toHaveText(/prize pool/i);
    await expect(shownSheet(page)).toContainText('시드권 + 트로피');
    await expect(shownSheet(page)).toContainText('결승 직행');
    await expect(shownSheet(page)).toContainText('300,000');
    // 문구 줄은 합계에 안 들어간다 — 총액 = 300,000
    await expect(page.getByTestId('clk-prize-total')).toHaveText('300,000');
    await expect(page.getByTestId('clk-prize-page')).toHaveText('1 / 4');
    await page.screenshot({ path: 'test-results/clock-shots/k-1-prize.png' });

    await page.clock.runFor(30_000);
    await expect(aside.locator('p').first()).toHaveText(/bounty/i);
    await expect(shownSheet(page)).toContainText('헤드 바운티');
    await expect(aside).toContainText('바운티 안내');
    await expect(page.getByTestId('clk-prize-page')).toHaveText('2 / 4');
    await page.clock.runFor(1_000);
    await page.screenshot({ path: 'test-results/clock-shots/k-2-bounty.png' });

    // ③ 팀 점수 — C 19 · A 16 · B 15
    await page.clock.runFor(30_000);
    await expect(aside.locator('p').first()).toHaveText(/team score/i);
    const lis = shownSheet(page).locator('li');
    await expect(lis).toHaveCount(3);
    await expect(lis.nth(0)).toContainText('1. C팀');
    await expect(lis.nth(0)).toContainText('19 PTS');
    await expect(lis.nth(1)).toContainText('2. A팀');
    await expect(lis.nth(1)).toContainText('김·이');
    await expect(lis.nth(2)).toContainText('3. B팀');
    await page.screenshot({ path: 'test-results/clock-shots/k-3-team.png' });

    // ④ 광고 — 404 주소는 빠지고 살아 있는 한 장만 건다(10초)
    await page.clock.runFor(30_000);
    await expect(aside.locator('p').first()).toHaveText(/sponsor/i);
    const img = shownSheet(page).locator('img');
    await expect(img).toHaveAttribute('src', AD_OK);
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: 'test-results/clock-shots/k-4-ad.png' });

    await page.clock.runFor(10_000);
    await expect(aside.locator('p').first()).toHaveText(/prize pool/i);
    await expect(page.getByTestId('clk-prize-page')).toHaveText('1 / 4');

    // 머리말 높이가 장마다 같다 — 들썩임 없음
    const topY = async () => (await page.getByTestId('clk-prize-track').boundingBox())!.y;
    const y0 = await topY();
    await page.clock.runFor(30_000);
    await page.clock.runFor(1_000);
    expect(Math.abs((await topY()) - y0), '장이 바뀌며 트랙이 세로로 움직였다').toBeLessThanOrEqual(2);
    expect(errors, `페이지 오류: ${errors.join(' | ')}`).toEqual([]);
    await page.screenshot({ path: 'test-results/clock-shots/k-slides.png' });
  });

  test('시상만 있으면 종전 화면 — 장 표시 없음 · 광고 표 없음(42P01)이어도 그대로', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await serveClock(page, row({}, Date.now() + 15 * 60_000));
    await page.route(/\/rest\/v1\/clock_ads/, (r) => r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST205', message: 'not found' }) }));
    await page.goto(`/?display=${VENUE}&g=1&auto=0`);
    await expect(page.getByTestId('clk-timer')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('clk-prizes').locator('p').first()).toHaveText(/prize pool/i);
    await expect(page.getByTestId('clk-prize-page')).toHaveCount(0);
    await expect(page.getByTestId('clk-prize-track').locator('[data-extra-sheet],[data-ad-sheet]')).toHaveCount(0);
  });
});
