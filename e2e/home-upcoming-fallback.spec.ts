// 홈 '오늘·내일 일정' — 이틀 안이 비면 **다음 일정**을 보여준다 (2026-09-19 오너 지시)
//
// 오너: "홈 화면에 일정이 안떠있어".
// 화면 고장이 아니었다 — 운영 DB 실측(2026-09-19 KST): 오늘 0건 · 내일 0건 ·
// 앞으로 통틀어 1건인데 그게 **9/21**이었다. 이 칸은 이름 그대로 2일짜리 창이라
// 이틀 뒤 대회가 창 밖으로 빠지고 홈의 주된 칸이 통째로 비었다.
// 오너 결정: "없으면 다음 일정을 보여준다".
//
// ⚠ 제목('오늘·내일 일정')은 **바꾸지 않았다** — 그 문구에 e2e 6개가 묶여 있다
//   (smoke · click-paths · cache-first · perf ×3). 조건부로 바꾸면 오늘처럼 데이터가 빈 날
//   그 검사들이 통째로 빨개진다. 대신 목록 **안에서** 사실을 먼저 말한다.
//
// ⚠ 왜 목킹하나: 이 스펙이 운영 데이터를 그대로 읽으면 **대회가 등록되는 날 조용히 무의미해진다**
//   (오늘·내일에 대회가 생기면 폴백 갈래를 영영 안 타고 초록으로 남는다).
//   세 갈래를 각각 강제해서 **세 갈래 모두**가 살아 있는지 본다.
// 음성 대조: HomeTab 의 `(upcoming.length ? upcoming : nextUp)` 을 `upcoming` 으로 되돌리면 ②가,
//   `upcoming.length === 0 && nextUp.length === 0` 을 `upcoming.length === 0` 으로 되돌리면 ②가 실패한다.
import { test, expect } from './_fixtures';
import { type Page } from '@playwright/test';
import { stabilizeBackstack, stubLogin } from './_session';

/** KST 기준 오늘 +n일 (앱의 오늘·내일 판정과 같은 시간대 — playwright.config 가 Asia/Seoul 고정) */
function kstPlus(days: number): string {
  const kst = new Date(Date.now() + 9 * 3600e3 + days * 864e5);
  return kst.toISOString().slice(0, 10);
}

function row(date: string, id: string, title: string) {
  return {
    id, venue_id: 'v-fallback', title, date, start_time: '19:00',
    buy_in_amount: 100000, prize_pool: 10000000, guaranteed: true, approved: true,
    reg_close_time: '21:00', is_premium: false, max_entries: null,
  };
}

async function openHomeWith(page: Page, rows: unknown[]) {
  await stubLogin(page);
  await stabilizeBackstack(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/\/rest\/v1\/schedules\?/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) }));
  await page.goto('/?tab=home');
  await page.waitForSelector('button[aria-label^="알림"]', { timeout: 20_000 });
  await expect(page.getByTestId('home-schedule-title')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
}

const FALLBACK = '[data-testid="home-upcoming-fallback"]';

test('🔴 ① 오늘·내일에 대회가 있으면 그것만 — 폴백 문구는 뜨지 않는다', async ({ page }) => {
  await openHomeWith(page, [row(kstPlus(0), 's-today', '오늘 대회'), row(kstPlus(5), 's-far', '먼 대회')]);
  await expect(page.getByText('오늘 대회').first(), '오늘 대회가 안 보인다').toBeVisible();
  await expect(page.locator(FALLBACK), '오늘 대회가 있는데 폴백 안내가 떴다').toHaveCount(0);
  await expect(page.getByText('먼 대회'), '오늘·내일 칸에 5일 뒤 대회까지 섞여 들어왔다').toHaveCount(0);
});

test('🔴 ② 오늘·내일이 비면 가장 가까운 일정이 뜬다 — 오너가 지목한 그 상태', async ({ page }) => {
  // 운영 DB 의 2026-09-19 상태를 그대로 만든다: 오늘 0 · 내일 0 · 이틀 뒤 1건.
  await openHomeWith(page, [row(kstPlus(2), 's-next', '가장 가까운 대회')]);

  await expect(page.locator(FALLBACK), '오늘·내일이 비었는데 폴백 안내가 없다 — 사용자는 9/21 대회를 오늘 것으로 읽는다')
    .toBeVisible();
  await expect(page.locator(FALLBACK)).toContainText('오늘·내일은 예정 대회가 없어요');
  await expect(page.getByText('가장 가까운 대회').first(), '다음 일정이 목록에 안 뜬다 — 칸이 여전히 비어 있다')
    .toBeVisible();
  // 옛 빈 상태 문구가 남아 있으면 폴백이 아니라 그냥 빈 칸이다.
  await expect(page.getByText('오늘·내일 예정 대회가 없어요'), '옛 빈 상태 갈래로 떨어졌다').toHaveCount(0);
});

test('🔴 ③ 앞으로 아무 일정도 없으면 빈 상태로 — 없는 것을 있다고 하지 않는다', async ({ page }) => {
  await openHomeWith(page, [row(kstPlus(-3), 's-past', '지난 대회')]);
  await expect(page.getByText('예정된 대회가 없어요').first(), '일정이 하나도 없는데 빈 상태가 안 뜬다').toBeVisible();
  await expect(page.locator(FALLBACK), '보여줄 다음 일정이 없는데 폴백 안내가 떴다').toHaveCount(0);
  await expect(page.getByText('지난 대회'), '지난 대회가 다음 일정으로 올라왔다').toHaveCount(0);
});
