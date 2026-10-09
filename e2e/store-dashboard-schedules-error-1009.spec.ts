// 매장 P3 ①(2026-10-09, 근거 audit12/fix-store-batch.md '2차') — 대시보드 '다가오는 예약' 카드가 게임 목록(schedules) 조회
//   **실패**에도 '예정된 게임이 없습니다' 라고 말했다(성공해서 빈 것과 구별 불가). App 의 schedulesError 를 VenueManageTab 이
//   MyPostersTab 에만 넘기고 대시보드에는 안 넘겼다.
// 목킹 업주(운영 DB 쓰기 0) — schedules GET 만 500 / [] 로 가로챈다.
// 음성 대조: 수정 전 빌드에서 ① FAIL('예정된 게임이 없습니다' 가 보인다) · ② 양성 대조는 전/후 PASS.
// 실행: E2E_BASE_URL=http://localhost:4270 npx playwright test e2e/store-dashboard-schedules-error-1009.spec.ts --project=mobile-chromium
import { test, expect } from './_fixtures';
import { bootOwner, openMyStore } from './_mockOwner';

const card = (page: import('@playwright/test').Page) =>
  page.locator('section').filter({ has: page.getByRole('button', { name: /^다가오는 예약/ }) }).first();

test('🔴 일정 조회 실패 → "예정된 게임이 없습니다" 대신 오류·다시 시도', async ({ page }) => {
  test.setTimeout(90_000);
  let gets = 0;
  await bootOwner(page, {
    extra: async (p) => {
      await p.route(/\/rest\/v1\/schedules\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        gets += 1;
        return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'mock fail' }) });
      });
    },
  });
  await openMyStore(page);
  const c = card(page);
  await expect(c).toBeVisible({ timeout: 15_000 });
  await expect(c.getByText('게임 목록을(를) 불러오지 못했어요', { exact: false })).toBeVisible({ timeout: 10_000 });
  await expect(c.getByText('예정된 게임이 없습니다.')).toHaveCount(0);
  const before = gets;
  await c.getByRole('button', { name: '다시 시도' }).click();
  await expect.poll(() => gets, { message: '다시 시도가 일정 재조회를 내지 않았다' }).toBeGreaterThan(before);
});

test('양성 대조 — 조회 성공·0건이면 "예정된 게임이 없습니다"', async ({ page }) => {
  test.setTimeout(90_000);
  await bootOwner(page, {
    extra: async (p) => {
      await p.route(/\/rest\/v1\/schedules\?/, (r) => (r.request().method() === 'GET'
        ? r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : r.fallback()));
    },
  });
  await openMyStore(page);
  const c = card(page);
  await expect(c).toBeVisible({ timeout: 15_000 });
  await expect(c.getByText('예정된 게임이 없습니다.')).toBeVisible({ timeout: 10_000 });
  await expect(c.getByText('게임 목록을(를) 불러오지 못했어요', { exact: false })).toHaveCount(0);
});

// R2M-03(2026-10-09 2회차 점검) — 같은 실패에서 맨 위 '지금 할 일' 이 '오늘 등록된 대회가 없어요 — 대회 등록하기'(같은 날 중복 대회)를 권했다.
//   음성 대조: 수정 전 빌드에서 FAIL(오류 제목이 없고 '오늘 등록된 대회가 없어요' 가 보인다 — 12시 이후).
test('🔴 일정 조회 실패 → 지금 할 일이 "대회 등록하기" 대신 오류·다시 시도', async ({ page }) => {
  test.setTimeout(90_000);
  let gets = 0;
  await bootOwner(page, {
    extra: async (p) => {
      await p.route(/\/rest\/v1\/schedules\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        gets += 1;
        return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'mock fail' }) });
      });
    },
  });
  await openMyStore(page);
  const todo = page.getByTestId('todo-card');
  await expect(todo.getByText('대회 일정을 불러오지 못했어요')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('오늘 등록된 대회가 없어요')).toHaveCount(0);
  const before = gets;
  await todo.getByRole('button', { name: /다시 시도/ }).click();
  await expect.poll(() => gets, { message: '지금 할 일의 다시 시도가 일정 재조회를 내지 않았다' }).toBeGreaterThan(before);
});

test('양성 대조 — 조회 성공·0건이면 지금 할 일에 오류 문구가 없다', async ({ page }) => {
  test.setTimeout(90_000);
  await bootOwner(page, {
    extra: async (p) => {
      await p.route(/\/rest\/v1\/schedules\?/, (r) => (r.request().method() === 'GET'
        ? r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : r.fallback()));
    },
  });
  await openMyStore(page);
  await expect(page.getByRole('button', { name: /^다가오는 예약/ }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('예정된 게임이 없습니다.')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('대회 일정을 불러오지 못했어요')).toHaveCount(0);
});
