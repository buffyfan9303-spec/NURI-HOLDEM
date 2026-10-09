// e2e/venue-upcoming-past-1009.spec.ts — 매장 페이지 「진행 예정」·「포스터 > 예정 대회(N)」에 지난 대회가 섞이던 결함(2026-10-09)
//
// 원인: VenuePage 가 venueScheduleList(매장·승인만 거른다)의 결과를 두 패널에 그대로 넘겼다. 끝난 회차도 날짜순으로 같이 떴다.
// 수정: 두 패널만 notEnded(= scheduleStatus !== 'ended', 시작+10h KST)로 한 번 더 거른다. 데이터·다른 소비처(배너 매칭 등)는 그대로.
// 날짜는 전부 오늘 기준 상대값이다 — 지난 대회는 -2일 23:30 시작이라 KST 어느 시각에도 끝났고(= 어제 09:30 종료),
// 앞으로 열리는 둘은 +1/+2일이라 어느 시각에도 끝나지 않았다. '오늘' 경계는 시각에 따라 바뀌어 vitest(scheduleSoon.test.ts)가 잰다.
// ⚠ 운영 무접촉: 매장·일정은 page.route 로 대체하고, 쓰기는 _fixtures 가드가 끊는다.
// 음성 대조: VenuePage 의 두 패널 prop 을 venueSchedules 로 되돌리면 두 테스트 모두 지난 대회가 보여 빨개진다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { stabilizeBackstack, dismissOverlays } from './_session';
import { kstDay } from './_schedules';

const VENUE_ID = '99999999-1009-4009-8009-999999999999';
const VENUE_NAME = '지난대회 검증 홀덤';
const PAST_TITLE = 'UPPAST 지난 대회';
const NEXT_TITLE = 'UPPAST 내일 대회';
const LATER_TITLE = 'UPPAST 모레 대회';

const venueRow = () => ({
  id: VENUE_ID, name: VENUE_NAME, region: '서울', address: '서울 어딘가 1',
  approved: true, status: 'active', verification_status: 'verified', is_paid_ad: false, display_order: 1,
  follower_count: 3, rating: null, kind: 'venue', images: [],
});

const scheduleRow = (n: number, title: string, dayOffset: number, startTime: string) => ({
  id: `e2e-uppast-schedule-${n}`, title, venue_id: VENUE_ID, pub_name: VENUE_NAME, region: '서울', address: '서울 어딘가 1',
  date: kstDay(dayOffset), start_time: startTime, duration: '6시간', format: 'MTT', guaranteed: true,
  prize_pool: 1_000_000, prize_percent: null, is_competition: false, grade: null, blinds: null, reg_close_time: null,
  buy_in: { amount: 30_000 }, seats: null, structure: null, description: null, side_events: null, ranking_prizes: null,
  partners: null, promotions: null, payment_methods: null, rules: null, poster_url: null, poster_color: null,
  display_order: n, is_premium: false, premium_until: null, owner_id: 'e2e-mock-owner', unread_qna_count: 0,
  approved: true, view_count: 0, rejected_at: null, reject_reason: null,
});

/** JSON 목 — 단건(Accept: object+json)이면 객체, 아니면 배열 */
async function mockJson(page: Page, pattern: RegExp, rows: Record<string, unknown>[]) {
  await page.route(pattern, (route) => {
    const single = /vnd\.pgrst\.object\+json/.test(route.request().headers()['accept'] ?? '');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? (rows[0] ?? null) : rows) });
  });
}

async function openVenue(page: Page) {
  await stabilizeBackstack(page);
  await mockJson(page, /\/rest\/v1\/venues\?/, [venueRow()]);
  await mockJson(page, /\/rest\/v1\/schedules\?/, [
    scheduleRow(1, PAST_TITLE, -2, '23:30:00'),
    scheduleRow(2, NEXT_TITLE, 1, '20:00:00'),
    scheduleRow(3, LATER_TITLE, 2, '19:30:00'),
  ]);
  await page.goto(`/?venue=${VENUE_ID}`);
  const dialog = page.getByRole('dialog', { name: /매장 페이지/ });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await dismissOverlays(page);
  return dialog;
}

test.describe('매장 페이지 — 예정 탭에 끝난 대회가 섞이지 않는다', () => {
  test.setTimeout(60_000);

  test('① 「진행 예정」 탭: 앞으로 열리는 둘만 보이고 지난 대회는 없다', async ({ page }) => {
    const dialog = await openVenue(page);
    await dialog.getByRole('tab', { name: '진행 예정' }).click();
    await expect(dialog.getByText(NEXT_TITLE), '내일 대회가 안 보인다 — 목이 안 먹었거나 패널이 비었다').toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(LATER_TITLE)).toBeVisible();
    await expect(dialog.getByText(PAST_TITLE), '지난 대회가 「진행 예정」에 남아 있다').toHaveCount(0);
  });

  test('② 「포스터」 탭 「예정 대회 (N)」: N 이 2 이고 지난 대회는 없다', async ({ page }) => {
    const dialog = await openVenue(page);
    await dialog.getByRole('tab', { name: '포스터' }).click();
    await expect(dialog.getByText('예정 대회 (2)', { exact: true }), '예정 대회 건수가 2 가 아니다 — 지난 대회가 셈에 들었다').toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(NEXT_TITLE)).toBeVisible();
    await expect(dialog.getByText(LATER_TITLE)).toBeVisible();
    await expect(dialog.getByText(PAST_TITLE), '지난 대회가 「예정 대회」에 남아 있다').toHaveCount(0);
  });
});
