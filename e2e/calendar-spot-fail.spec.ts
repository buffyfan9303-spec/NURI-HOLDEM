// 캘린더 — 스팟 조회만 실패해도 캘린더는 정상 표시된다(리드 결정 2026-10-01).
//
// listMySpots 는 이제 조회 실패를 throw 한다(내 스팟 목록이 '못 불러옴'을 '없음'으로 위장하지 않게).
// 그러나 캘린더에서 스팟은 날짜 칸에 올리는 **보조 표시**라, 그 실패가 화면 전체의 오류 카드가 되면 안 된다.
//   ① spot_reviews 만 500 → 오류 카드 없음 · 요약 카드는 그대로
//   ② 대조군: bankroll_entries 가 500 → 오류 카드가 **뜬다**(① 이 '카드가 아예 안 뜨는 화면'이라 통과한 게 아님을 증명)
//
// 세션은 가짜(calendar-roi.spec 과 같은 3종 세트), 조회는 전부 route 로 갈아끼운다 — 운영 쓰기 0.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { SUPABASE_URL } from './_session';

// 스토리지 키는 빌드가 바라보는 프로젝트 ref 로 만든다(E2E_SUPABASE_URL 로 격리 호스트를 줄 수 있다).
const KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const UID = '00000000-0000-4000-8000-00000000c02b';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = [
  b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub: UID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
  'e2e',
].join('.');
const FAKE = {
  access_token: JWT, refresh_token: 'e2e-fake', token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: UID, aud: 'authenticated', role: 'authenticated', email: 'spotfail@example.com',
    app_metadata: {}, user_metadata: { name: 'SF' }, created_at: new Date().toISOString(),
  },
};
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const FAIL = { message: 'forced failure', code: 'XX000' };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* 차단 환경 */ } },
    [KEY, JSON.stringify(FAKE)] as [string, string]);
  await page.route(/\/auth\/v1\/user/, (r) => r.fulfill(json(FAKE.user)));
  await page.route(/\/rest\/v1\/profiles\?/, (r) => r.fulfill(json({
    id: UID, name: 'SF', nickname: 'SF', role: 'user', status: 'active', activity_points: 0, created_at: FAKE.user.created_at,
  })));
  await page.route(/\/rest\/v1\/schedule_likes\?/, (r) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/schedule_reservations\?/, (r) => r.fulfill(json([])));
});

async function openCalendar(page: Page) {
  await page.goto('/');
  await page.waitForSelector('button[aria-label^="알림"]', { timeout: 20_000 });
  await page.getByRole('navigation', { name: '하단 내비게이션' }).getByRole('button', { name: /^캘린더/ }).first().click();
  await expect(page.locator('[data-tab="calendar"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-tab="calendar"] input[type="date"][aria-label="날짜"]'), '내가 적는 기록 카드가 안 뜬다').toBeVisible({ timeout: 20_000 });
}

const ERR_CARD = /정보를 불러오지 못했습니다|뱅크롤 데이터/;

test('🔴 스팟 조회만 실패하면 캘린더는 정상 표시되고 오류 카드가 뜨지 않는다', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route(/\/rest\/v1\/bankroll_entries\?/, (r) => r.fulfill(json([])));
  await page.route(/\/rest\/v1\/spot_reviews\?/, (r) => r.fulfill(json(FAIL, 500)));
  await openCalendar(page);
  const cal = page.locator('[data-tab="calendar"]');
  await expect(cal.getByTestId('cal-summary'), '요약 카드가 사라졌다').toBeVisible();
  // 조회가 끝난 뒤(요약 값이 '—' 를 벗어남)에도 카드가 없어야 한다 — 로딩 중이라 안 보이는 것과 구분한다.
  await expect(cal.locator('[data-stat="sum-net"]')).not.toContainText('—', { timeout: 10_000 });
  await expect(cal.getByText(ERR_CARD), '스팟 조회 실패가 캘린더 오류 카드로 올라왔다').toHaveCount(0);
});

test('대조군 — 뱅크롤 조회가 실패하면 오류 카드는 여전히 뜬다', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route(/\/rest\/v1\/bankroll_entries\?/, (r) => r.fulfill(json(FAIL, 500)));
  await page.route(/\/rest\/v1\/spot_reviews\?/, (r) => r.fulfill(json([])));
  await openCalendar(page);
  await expect(page.locator('[data-tab="calendar"]').getByText(ERR_CARD).first(), '실패를 드러내는 카드가 사라졌다').toBeVisible({ timeout: 10_000 });
});
