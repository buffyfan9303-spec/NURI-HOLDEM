// R3-03 (audit3-regress-connect-1004.md#R3-03) — 같은 근무를 급여 표와 출근일지·딜러 스케줄·딜러 모달이 같은 시간으로 말하는가.
//
// 목킹 업주(운영 DB 쓰기 0) · 1440×900. 매장 설정: 휴게 자동 공제 켬 · 조기 출근 인정 끔.
//   직원 김직원: 계획 18:00 · 출근 17:30 · 퇴근 03:00 → 출근~퇴근 9.5h, 계획 전 0.5h 제외, 체류 9h ≥ 9h 라 휴게 60분 → 8.0h
//   딜러 박딜러: 18:00~03:00 → 9h − 휴게 60분 → 8.0h
// 예전(origin/main a6b578dd): 급여 표 8.0h · 출근일지 9.5h · 스케줄 9.5h · 딜러 행 9h — 이 스펙은 그 빌드에서 빨개진다(음성 대조).
// 실행: E2E_BASE_URL=http://localhost:<port> npx playwright test e2e/staff-hours-r303.spec.ts --project=mobile-chromium
import { test, expect, type Page } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_DAY } from './_mockOwner';

const DAY1 = `${MOCK_DAY.slice(0, 7)}-01`;
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const NOTE = '급여 기준 8.0h (출근~퇴근 9.5h · 계획 시작 전 0.5h 제외 · 휴게 −1.0h)';

async function boot(page: Page) {
  await bootOwner(page, {
    extra: async (p) => {
      await p.route(/\/rest\/v1\/staff_wage\?/, (r) => (r.request().method() === 'GET'
        ? r.fulfill(json([{ staff_name: '김직원', hourly_wage: 11000, payday: 10, weekly_off: '', memo: null }])) : r.fallback()));
      await p.route(/\/rest\/v1\/staff_schedule\?/, (r) => (r.request().method() === 'GET'
        ? r.fulfill(json([{ work_date: DAY1, staff_name: '김직원', start_hm: '18:00', check_in: '17:30', check_out: '03:00', confirmed: true }])) : r.fallback()));
      await p.route(/\/rest\/v1\/dealer_shifts\?/, (r) => (r.request().method() === 'GET'
        ? r.fulfill(json([{ id: 'd1', venue_id: 'v', dealer_name: '박딜러', shift_date: DAY1, start_time: '18:00', end_time: '03:00', table_no: null, hourly_wage: 12000, memo: null }])) : r.fallback()));
      await p.route(/\/rest\/v1\/venue_payroll_rules\?/, (r) => (r.request().method() === 'GET'
        ? r.fulfill(json({ early_credit: false, auto_break: true, five_plus: false, weekly_holiday: false })) : r.fallback()));
    },
  });
  await openMyStore(page);
}
const openStaff = (page: Page) => page.locator('[data-mystore-secbar] button:visible').filter({ hasText: '직원 관리' }).first().click();
const openSection = (page: Page, label: string) => page.getByRole('button', { name: new RegExp(label) }).first().click();

test.describe('R3-03 — 근무 시간은 한 식으로', () => {
  test('급여 표 · 출근일지 · 딜러 출근 스케줄(행·집계)이 같은 근무를 모두 8.0h 로 말한다', async ({ page }) => {
    await boot(page);
    await openStaff(page);

    await openSection(page, '인건비 정산');
    const payRow = page.getByTestId('staff-pay-row');
    await expect(payRow).toHaveCount(1);
    await expect(payRow).toContainText('8.0h');
    await expect(page.getByTestId('dealer-pay-row')).toContainText('8.0h');
    // 아코디언은 한 번에 하나만 열린다 — 닫히기 전에 읽어 둔다.
    const pay = (await payRow.innerText()).match(/\d+\.\dh/)?.[0];

    await openSection(page, '직원 출근일지');
    const log = page.getByTestId('worklog-hours');
    await expect(log).toHaveText('8.0h');
    await expect(log).toHaveAttribute('title', NOTE);
    const logText = await log.innerText();

    await openSection(page, '딜러 출근 스케줄');
    const summary = page.getByText(/직원별 집계 ·/);
    await expect(summary).toContainText('총 8.0h');
    await page.getByRole('button', { name: /^1 김직원/ }).click();
    const dayRow = page.getByTestId('schedule-shift-hours');
    await expect(dayRow).toHaveText('8.0h');
    await expect(dayRow).toHaveAttribute('title', NOTE);

    const values = {
      pay,
      log: logText,
      schedule: await dayRow.innerText(),
    };
    console.log(`R3-03 @1440: ${JSON.stringify(values)}`);
    expect(new Set(Object.values(values)).size).toBe(1);
  });

  test('딜러 로테이션 모달: 행 시간 = 급여 명세 시간(휴게 자동 공제 켬)', async ({ page }) => {
    await boot(page);
    await page.locator('[data-mystore-secbar] button:visible').filter({ hasText: '대시보드' }).first().click();
    await page.getByRole('button', { name: '딜러 로테이션·급여' }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByTestId('dealer-shift-hours')).toContainText('18:00~03:00 · 8.0h');
    await expect(dlg).toContainText('1회·8.0h');
  });
});
