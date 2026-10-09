// 매장 P3 ①(2026-10-09, 근거 audit12/fix-store-batch.md '2차') — 대시보드 '다가오는 예약' 카드가 게임 목록(schedules) 조회
//   **실패**에도 '예정된 게임이 없습니다' 라고 말했다(성공해서 빈 것과 구별 불가). App 의 schedulesError 를 VenueManageTab 이
//   MyPostersTab 에만 넘기고 대시보드에는 안 넘겼다.
// 목킹 업주(운영 DB 쓰기 0) — schedules GET 만 500 / [] 로 가로챈다.
// 음성 대조: 수정 전 빌드에서 ① FAIL('예정된 게임이 없습니다' 가 보인다) · ② 양성 대조는 전/후 PASS.
// 실행: E2E_BASE_URL=http://localhost:4270 npx playwright test e2e/store-dashboard-schedules-error-1009.spec.ts --project=mobile-chromium
import { test, expect } from './_fixtures';
import { bootOwner, openMyStore, MOCK_VENUE, MOCK_DAY } from './_mockOwner';

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

// #271 되돌림 원인(main CI run 37940996274 · mystore-followup-1003 R 1024) — 실패 갈래가 '지난 게임 그대로 열기' 단축까지 가렸다.
//   그대로 열기는 포스터를 만들지 않고 장부 시작 화면만 연다(장부는 일정을 따로 다시 읽는다) — 일정 실패여도 그대로 둔다.
//   실패는 '다가오는 예약' 카드가 말한다. 음성 대조: 되살리기만 한 빌드(d9e26a24)에서 FAIL(지금 할 일 = '다시 시도').
test('일정 조회 실패 + 어제 마감 이력 → 지금 할 일은 "그대로 열기" 그대로, 실패는 다가오는 예약 카드가 말한다', async ({ page }) => {
  test.setTimeout(90_000);
  const yday = new Date(Date.parse(`${MOCK_DAY}T12:00:00+09:00`) - 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 10);
  const last = {
    venue_id: MOCK_VENUE, session_date: yday, game_seq: 1, title: '어제 메인', buyin_amount: 50_000, card_amount: null, game_type: 'gtd',
    target_entries: 20, max_entries: 0, is_addon: false, addon_stack: 0, discounts: [], early_double_min: 0, early_single_min: 0,
    opened_at: `${yday}T10:00:00+09:00`, operators: [], reg_closed: true, closed: true, closed_at: `${yday}T22:00:00+09:00`,
    schedule_id: null, tournament_start: null, voucher_issued: 0, created_at: `${yday}T01:00:00Z`, clock_snapshot: null,
  };
  await bootOwner(page, {
    extra: async (p) => {
      await p.route(/\/rest\/v1\/schedules\?/, (r) => (r.request().method() === 'GET'
        ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'mock fail' }) }) : r.fallback()));
      await p.route(/\/rest\/v1\/ledger_sessions\?/, (r) => {
        const u = r.request().url();
        if (r.request().method() !== 'GET' || !/closed=eq\.true/.test(u) || !/session_date=lt\./.test(u)) return r.fallback();
        const one = (r.request().headers()['accept'] ?? '').includes('pgrst.object');
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(one ? last : [last]) });
      });
    },
  });
  await openMyStore(page);
  const todo = page.getByTestId('todo-card');
  await expect(todo.getByTestId('todo-cta'), "일정 실패가 '그대로 열기' 단축을 가렸다").toHaveText('그대로 열기', { timeout: 15_000 });
  await expect(page.getByText('대회 일정을 불러오지 못했어요')).toHaveCount(0);
  await expect(card(page).getByText('게임 목록을(를) 불러오지 못했어요', { exact: false }), '실패를 아무 데서도 말하지 않는다').toBeVisible();
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
