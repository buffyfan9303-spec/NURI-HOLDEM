// R5-01·R5-02(audit5-regress-connect-1004) — 직원 '내 출근 관리'.
//   R5-01: 손으로 넣은 출근(서버 표지 check_in_at 없음)은 시작을 '지금 이전 24시간 안의 가장 가까운 HH:MM' 으로 읽어
//          25시간 뒤 '지금 퇴근' 이 열려 있었고 1시간으로 기록됐다. → 시작 = 근무 날짜 + 출근(00:00~01:59 는 다음 날).
//          원 하네스: root-cause audit5r `__a5r-shift.spec.ts` 'A5R-1'.
//   R5-02: 퇴근까지 적힌 근무 카드에 '퇴근 칸에 실제 퇴근 시각을 넣으라' 안내가 떴다('A5R-2'). 오늘 끝난 근무에는
//          '퇴근 시각이 먼저 적혀 있어' 안내가 떴다(같은 부류 — 이미 적힌 칸의 안내). → 적힌 칸에는 안내 없음.
// ⚠ 서버는 가짜다(운영 쓰기 0) — 화면 쪽 막힘만 잰다. 서버 쪽 거절은 supabase/migrations/20261004h 리허설
//   (Documents\누리홀덤_영상분석_0930\shift-workdate-1004\20_post.sql W·F 줄)이 잰다.
// ⚠ page.clock 은 '지금' 으로만 고정한다 — 미래 시각이면 목 JWT 가 만료로 읽혀 비로그인이 된다.
import { test, expect } from './_fixtures';
import type { Page } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_DAY } from './_mockOwner';

const NONE = { can_access_ledger: false, can_manage_pos: false, can_view_vouchers: false, can_manage_venue_staff: false, can_manage_venue_schedules: false };
const H = 3_600_000;
const hmOf = (ms: number) => new Date(ms + 9 * H).toISOString().slice(11, 16);
const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
/** 그 출근 시각이 속하는 근무 날짜 — KST 00:00~01:59 출근은 전날 근무(출근 버튼과 같은 규칙). */
const workDateOf = (ms: number) => new Date(ms + 9 * H - 2 * H).toISOString().slice(0, 10);

interface Row { work_date: string; staff_name: string; start_hm: string | null; end_hm: string | null; check_in: string | null; check_out: string | null; check_in_at: string | null; confirmed: boolean }
const row = (p: Partial<Row> & { work_date: string }): Row =>
  ({ staff_name: '김직원', start_hm: null, end_hm: null, check_in: null, check_out: null, check_in_at: null, confirmed: false, ...p });

async function boot(page: Page, rows: Row[], t0: number) {
  const setCalls: { p_work_date: string; p_field: 'check_in' | 'check_out'; p_value: string | null }[] = [];
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  const install = async (p: Page) => {
    await p.route(/\/rest\/v1\/rpc\/my_punch_state/, (r) => r.fulfill(json(rows.map((x) => ({ work_date: x.work_date, check_in: x.check_in, check_out: x.check_out })))));
    await p.route(/\/rest\/v1\/rpc\/punch_my_shift/, (r) => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'not used' }) }));
    await p.route(/\/rest\/v1\/rpc\/set_my_shift_time/, (r) => {
      const b = r.request().postDataJSON() as (typeof setCalls)[number];
      setCalls.push(b);
      const x = rows.find((y) => y.work_date === b.p_work_date) ?? rows[0];
      const isNow = b.p_value === 'now';
      x[b.p_field] = isNow ? hmOf(t0) : b.p_value; // 서버 시각 = 고정한 지금
      if (b.p_field === 'check_in') x.check_in_at = isNow ? new Date(t0).toISOString() : null;
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

test('R5-01 손으로 넣은 출근(표지 없음)도 25시간 뒤 지금 퇴근은 막힌다 — 1시간으로 기록되지 않는다', async ({ page }) => {
  const t0 = Date.now();
  const start = t0 - 25 * H;
  // 어제 행의 시작은 빨라야 어제 02:00 — KST 03:00 전에는 '어제 행 25시간' 자체가 있을 수 없다(그 시각엔 결함도 없다)
  test.skip(workDateOf(start) !== dayBefore(MOCK_DAY), 'KST 00:00~02:59 실행 — 어제 행 25시간을 만들 수 없다');
  await page.clock.setFixedTime(new Date(t0));
  const rows = [row({ work_date: dayBefore(MOCK_DAY), check_in: hmOf(start) })];
  const { pane, setCalls } = await boot(page, rows, t0);
  const out = pane.getByRole('button', { name: '지금 퇴근' });
  await expect(out, '손입력 25시간 근무의 지금 퇴근이 열려 있다(1시간으로 접혀 기록된다)').toBeDisabled();
  await expect(pane.getByTestId('self-punch-note')).toHaveAttribute('data-reason', 'SHIFT_OVER_24H');
  await out.evaluate((b: HTMLButtonElement) => b.click());
  await page.waitForTimeout(400);
  expect(setCalls, JSON.stringify(setCalls)).toHaveLength(0);
  expect(rows[0].check_out, '1시간 퇴근이 기록됐다').toBeNull();
  // 실제 퇴근 시각을 직접 넣는 바로잡기 길은 열려 있다(출근 뒤 8시간)
  const realOut = hmOf(start + 8 * H);
  await pane.locator('label', { hasText: '퇴근' }).locator('input[type="time"]').fill(realOut);
  await expect.poll(() => setCalls.length).toBe(1);
  expect(setCalls[0]).toMatchObject({ p_field: 'check_out', p_value: realOut });
  await expect(pane.getByTestId('self-shift-hours')).toHaveText('8.0h');
  await expect(pane.getByTestId('self-punch-note'), '퇴근이 적힌 뒤에도 안내가 남았다(R5-02)').toHaveCount(0);
});

test('R5-01 양성: 손으로 넣은 야간 출근(3시간 30분 전)의 지금 퇴근은 열려 있다', async ({ page }) => {
  const t0 = Date.now();
  await page.clock.setFixedTime(new Date(t0));
  const start = t0 - 3.5 * H;
  const rows = [row({ work_date: workDateOf(start), check_in: hmOf(start) })];
  const { pane, setCalls } = await boot(page, rows, t0);
  const out = pane.getByRole('button', { name: '지금 퇴근' });
  await expect(out).toBeEnabled();
  await expect(pane.getByTestId('self-punch-note')).toHaveCount(0);
  await out.click();
  await expect.poll(() => setCalls.length).toBe(1);
  expect(setCalls[0]).toMatchObject({ p_work_date: workDateOf(start), p_field: 'check_out', p_value: 'now' });
  await expect(pane.getByTestId('self-shift-hours')).toHaveText('3.5h');
});

test('R5-02 퇴근까지 적힌 근무(어제 · 오늘)에는 안내가 뜨지 않는다', async ({ page }) => {
  const t0 = Date.now();
  await page.clock.setFixedTime(new Date(t0));
  const yIn = t0 - 26 * H; // 원 하네스 A5R-2: 버튼 출근 26시간 전 · 퇴근 9시간 뒤
  const tIn = t0 - 3 * H;
  const rows = [
    row({ work_date: dayBefore(MOCK_DAY), check_in: hmOf(yIn), check_out: hmOf(yIn + 9 * H), check_in_at: new Date(yIn).toISOString() }),
    row({ work_date: MOCK_DAY, check_in: hmOf(tIn), check_out: hmOf(tIn + 2 * H), check_in_at: new Date(tIn).toISOString() }),
  ];
  const { pane } = await boot(page, rows, t0);
  // 두 카드가 다 그려진 뒤에 센다(그리기 전의 0 은 거짓 통과)
  await expect(pane.getByTestId('self-shift-hours')).toHaveText(['2.0h', '9.0h']);
  await expect(pane.getByTestId('self-punch-note'), '끝난 근무에 안내가 떴다').toHaveCount(0);
});
