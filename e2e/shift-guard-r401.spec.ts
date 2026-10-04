// R4-01(audit4-regress-connect-1004) — 직원 '내 출근 관리' 의 '지금 출근·지금 퇴근' 이 근무 1회 길이 규칙(60초 하한·24시간 상한)을 지나간다.
//   원 하네스: root-cause audit4r `__a4r-self-same-minute.spec.ts`(같은 분 지금 출근→지금 퇴근 = 23.4h).
//   수정 전: 두 버튼이 같은 HH:MM 을 set_my_shift_time 에 두 번 보내 화면이 거의 하루치로 센다 / 25시간 뒤 '지금 퇴근' 이 1시간으로 접혀 기록된다.
//   수정 후: 화면이 같은 조건에서 버튼을 막고 이유를 보여 주며, '지금' 은 'now' 로 보내 서버가 자기 시각으로 판정한다.
// ⚠ 서버는 가짜다(운영 쓰기 0) — **옛 서버처럼 무엇이든 받는다**. 화면 쪽 막힘만 잰다.
//   서버 쪽 거절(같은 분·24시간 초과)은 supabase/migrations/20261004f 리허설(shift-guard-1004/20_post.sql)이 잰다.
// ⚠ page.clock 은 '지금' 으로만 고정한다 — 미래 시각이면 목 JWT 가 만료로 읽혀 비로그인이 된다(root-cause 기억).
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_DAY } from './_mockOwner';

const NONE = { can_access_ledger: false, can_manage_pos: false, can_view_vouchers: false, can_manage_venue_staff: false, can_manage_venue_schedules: false };
const H = 3_600_000;
const hmOf = (ms: number) => new Date(ms + 9 * H).toISOString().slice(11, 16);
const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

interface Row { work_date: string; staff_name: string; start_hm: string | null; end_hm: string | null; check_in: string | null; check_out: string | null; check_in_at: string | null; confirmed: boolean }

async function boot(page: Page, rows: Row[], t0: number) {
  const setCalls: { p_work_date: string; p_field: 'check_in' | 'check_out'; p_value: string | null }[] = [];
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  const install = async (p: Page) => {
    await p.route(/\/rest\/v1\/rpc\/my_punch_state/, (r) => r.fulfill(json(rows.map((x) => ({ work_date: x.work_date, check_in: x.check_in, check_out: x.check_out })))));
    await p.route(/\/rest\/v1\/rpc\/punch_my_shift/, (r) => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'not used' }) }));
    await p.route(/\/rest\/v1\/rpc\/set_my_shift_time/, (r) => {
      const b = r.request().postDataJSON() as (typeof setCalls)[number];
      setCalls.push(b);
      const row = rows.find((x) => x.work_date === b.p_work_date) ?? rows[0];
      const isNow = b.p_value === 'now';
      row[b.p_field] = isNow ? hmOf(t0) : b.p_value; // 서버 시각 = 고정한 지금
      if (b.p_field === 'check_in') row.check_in_at = isNow ? new Date(t0).toISOString() : null;
      return r.fulfill({ status: 204, body: '' });
    });
    await p.route(/\/rest\/v1\/staff_schedule\?/, (r) => (r.request().method() === 'GET' ? r.fulfill(json(rows)) : r.fallback()));
  };
  await bootOwner(page, { viewport: { width: 390, height: 900 }, perms: NONE, profile: { role: 'venue_staff', name: '김직원', nickname: '김직원' }, extra: install });
  await openMyStore(page);
  const bar = page.locator('[data-tab="my-store"] [data-testid="staff-punch-bar"]');
  await expect(bar).toBeVisible({ timeout: 20_000 });
  await bar.getByTestId('punch-fix').click();
  const pane = page.locator('[data-pane="attendance"]');
  await expect(pane.getByText('내 출근 관리', { exact: false })).toBeVisible({ timeout: 10_000 });
  return { pane, setCalls };
}

test('R4-01 같은 분 지금 출근 → 지금 퇴근은 막히고 하루치로 기록되지 않는다', async ({ page }) => {
  const t0 = Date.now();
  await page.clock.setFixedTime(new Date(t0));
  const rows: Row[] = [{ work_date: MOCK_DAY, staff_name: '김직원', start_hm: '18:00', end_hm: '03:00', check_in: null, check_out: null, check_in_at: null, confirmed: false }];
  const { pane, setCalls } = await boot(page, rows, t0);
  await pane.getByRole('button', { name: '지금 출근' }).click();
  await expect.poll(() => setCalls.length).toBe(1);
  const out = pane.getByRole('button', { name: '지금 퇴근' });
  await expect(out, '같은 분 지금 퇴근이 열려 있다').toBeDisabled();
  await expect(pane.getByTestId('self-punch-note')).toHaveAttribute('data-reason', 'SHIFT_TOO_SHORT');
  // 막힌 버튼을 강제로 눌러도 요청이 나가지 않는다
  await out.evaluate((b: HTMLButtonElement) => b.click());
  await page.waitForTimeout(400);
  expect(setCalls.map((c) => c.p_field), JSON.stringify(setCalls)).toEqual(['check_in']);
  expect(setCalls[0].p_value, '지금 출근은 서버 시각(now)으로 보낸다').toBe('now');
  expect(rows[0].check_out, '같은 분 퇴근이 기록됐다').toBeNull();
  await expect(pane.getByTestId('self-shift-hours')).toHaveCount(0);
});

test('R4-01 출근 뒤 24시간이 지나면 지금 퇴근은 막히고 퇴근 칸 직접 입력만 받는다', async ({ page }) => {
  const t0 = Date.now();
  await page.clock.setFixedTime(new Date(t0));
  const start = t0 - 25 * H;
  const rows: Row[] = [{ work_date: dayBefore(MOCK_DAY), staff_name: '김직원', start_hm: null, end_hm: null, check_in: hmOf(start), check_out: null, check_in_at: new Date(start).toISOString(), confirmed: false }];
  const { pane, setCalls } = await boot(page, rows, t0);
  const out = pane.getByRole('button', { name: '지금 퇴근' });
  await expect(out, '25시간 지난 지금 퇴근이 열려 있다(1시간으로 접혀 기록된다)').toBeDisabled();
  await expect(pane.getByTestId('self-punch-note')).toHaveAttribute('data-reason', 'SHIFT_OVER_24H');
  await out.evaluate((b: HTMLButtonElement) => b.click());
  await page.waitForTimeout(400);
  expect(setCalls).toHaveLength(0);
  // 실제 퇴근 시각을 직접 넣는 길은 열려 있다(출근 뒤 8시간)
  const outInput = pane.locator('label', { hasText: '퇴근' }).locator('input[type="time"]');
  await expect(outInput).toBeEnabled();
  const realOut = hmOf(start + 8 * H);
  await outInput.fill(realOut);
  await expect.poll(() => setCalls.length).toBe(1);
  expect(setCalls[0]).toMatchObject({ p_field: 'check_out', p_value: realOut });
  await expect(pane.getByTestId('self-shift-hours')).toHaveText('8.0h');
});

test('R4-01 양성: 2시간 근무의 지금 퇴근은 열려 있고 서버 시각으로 기록된다', async ({ page }) => {
  const t0 = Date.now();
  await page.clock.setFixedTime(new Date(t0));
  const start = t0 - 2 * H;
  const rows: Row[] = [{ work_date: MOCK_DAY, staff_name: '김직원', start_hm: null, end_hm: null, check_in: hmOf(start), check_out: null, check_in_at: new Date(start).toISOString(), confirmed: false }];
  // 오늘 날짜 행이 자정 직후라 어제 출근이 되는 경우는 건너뛴다(그 경계는 단위 테스트가 잰다)
  test.skip(hmOf(start) > hmOf(t0), 'KST 00:00~01:59 실행 — 오늘 행에 어제 출근을 넣을 수 없다');
  const { pane, setCalls } = await boot(page, rows, t0);
  const out = pane.getByRole('button', { name: '지금 퇴근' });
  await expect(out).toBeEnabled();
  await expect(pane.getByTestId('self-punch-note')).toHaveCount(0);
  await out.click();
  await expect.poll(() => setCalls.length).toBe(1);
  expect(setCalls[0]).toMatchObject({ p_field: 'check_out', p_value: 'now' });
  await expect(pane.getByTestId('self-shift-hours')).toHaveText('2.0h');
});

test('R4-01 critical X1~X3: 퇴근이 먼저 적힌 근무에는 출근 버튼·지금 출근이 막히고, 출근 없는 지금 퇴근도 막힌다', async ({ page }) => {
  const t0 = Date.now();
  await page.clock.setFixedTime(new Date(t0));
  const rows: Row[] = [{ work_date: MOCK_DAY, staff_name: '김직원', start_hm: null, end_hm: null, check_in: null, check_out: hmOf(t0 - 60_000), check_in_at: null, confirmed: false }];
  const bar = page.locator('[data-tab="my-store"] [data-testid="staff-punch-bar"]');
  const { pane, setCalls } = await boot(page, rows, t0);
  // 맨 위 출근 버튼: 서버가 거절하는 출근을 화면도 열지 않고 이유를 말한다
  await expect(bar.getByTestId('punch-in'), '퇴근만 있는 행에 출근 버튼이 열려 있다(1분 뒤 출근 = 23h59m 급여)').toBeDisabled();
  await expect(bar.getByTestId('punch-status')).toContainText('퇴근 칸을 비워');
  // 내 출근 관리: 지금 출근·지금 퇴근 둘 다 막힘, 안내는 순서 규칙
  await expect(pane.getByRole('button', { name: '지금 출근' })).toBeDisabled();
  await expect(pane.getByRole('button', { name: '지금 퇴근' })).toBeDisabled();
  await expect(pane.getByTestId('self-punch-note')).toHaveAttribute('data-reason', 'SHIFT_OUT_BEFORE_IN');
  await pane.getByRole('button', { name: '지금 출근' }).evaluate((b: HTMLButtonElement) => b.click());
  await page.waitForTimeout(400);
  expect(setCalls).toHaveLength(0);
  // 퇴근 칸을 비우면 출근이 다시 열린다(바로잡기 경로)
  await pane.locator('label', { hasText: '퇴근' }).locator('input[type="time"]').fill('');
  await expect.poll(() => setCalls.length).toBe(1);
  expect(setCalls[0]).toMatchObject({ p_field: 'check_out', p_value: null });
  await expect(pane.getByRole('button', { name: '지금 출근' })).toBeEnabled();
  await expect(pane.getByRole('button', { name: '지금 퇴근' }), '출근 없는 지금 퇴근이 열려 있다').toBeDisabled();
  await expect(pane.getByTestId('self-punch-note')).toHaveCount(0);
});
