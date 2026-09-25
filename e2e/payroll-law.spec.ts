// 급여 정산·딜러 급여가 법령 정합 정본(src/lib/staffPay.ts)으로 센 값을 그대로 그리는가 — PAYROLL-LAW 2026-09-26.
//
// 목킹 업주(운영 DB 쓰기 0). 한 직원(시급 10,000 — 2026 최저임금 10,320 미만) 18:00~23:00(체류 300분)과
// 딜러 18:00~18:07(12,000) 한 줄.
//   · 설정 테이블 없음(PGRST205, 마이그레이션 적용 전) → 기본값(**전부 끔** — 오너 2026-09-26, 주휴·휴일 문구 0줄):
//     300분 × 10,000 = 50,000 + 딜러 7분 × 12,000 = 1,400 → 51,400
//     (옛 식은 50,000 + 딜러 0.1h × 12,000 = 1,200 = 51,200 — 차이는 딜러 0.1h 반올림 200원뿐)
//   · 설정 행(휴게 켬) → 300 − 30 = 270분 × 10,000 = 45,000 + 1,400 = 46,400
//   · 설정 행(휴게 끔 · 5인 이상 켬) → 50,000 + 야간 22~23시 60분 × 5,000/60 = 5,000 → 55,000 + 1,400 = 56,400
//   · 최저임금 미만 시급은 경고만(저장은 막지 않음) · 급여 화면에 참고용 고지
// 실행: E2E_BASE_URL=http://localhost:4650 npx playwright test e2e/payroll-law.spec.ts --project=mobile-chromium
import { test, expect, type Page } from '@playwright/test';
import { bootOwner, openMyStore, MOCK_DAY } from './_mockOwner';

const DAY1 = `${MOCK_DAY.slice(0, 7)}-01`;
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });

// 계획 10:00 인데 22:31~23:59 출근 — 계획과 6h 넘게 어긋난 교대(critical-reviewer 반례①). '확인 필요' 로 보여야 한다.
const MISMATCH_ROW = { work_date: DAY1, staff_name: '이직원', start_hm: '10:00', check_in: '22:31', check_out: '23:59', confirmed: true };

async function boot(page: Page, rules: 'missing' | Record<string, boolean>, extraShifts: unknown[] = []) {
  await bootOwner(page, {
    extra: async (p) => {
      await p.route(/\/rest\/v1\/staff_wage\?/, (r) => (r.request().method() === 'GET'
        ? r.fulfill(json([{ staff_name: '김직원', hourly_wage: 10000, payday: 10, weekly_off: '', memo: null }])) : r.fallback()));
      await p.route(/\/rest\/v1\/staff_schedule\?/, (r) => (r.request().method() === 'GET'
        ? r.fulfill(json([{ work_date: DAY1, staff_name: '김직원', start_hm: null, check_in: '18:00', check_out: '23:00', confirmed: true }, ...extraShifts])) : r.fallback()));
      await p.route(/\/rest\/v1\/dealer_shifts\?/, (r) => (r.request().method() === 'GET'
        ? r.fulfill(json([{ id: 'd1', venue_id: 'v', dealer_name: '박딜러', shift_date: DAY1, start_time: '18:00', end_time: '18:07', table_no: null, hourly_wage: 12000, memo: null }])) : r.fallback()));
      await p.route(/\/rest\/v1\/venue_payroll_rules\?/, (r) => {
        if (r.request().method() !== 'GET') return r.fallback();
        if (rules === 'missing') return r.fulfill(json({ code: 'PGRST205', message: "Could not find the table 'public.venue_payroll_rules' in the schema cache" }, 404));
        return r.fulfill(json(rules));
      });
    },
  });
  await openMyStore(page);
  await page.locator('[data-mystore-secbar] button:visible').filter({ hasText: '직원 관리' }).first().click();
}

const openSection = (page: Page, label: string) => page.getByRole('button', { name: new RegExp(label) }).first().click();

test.describe('PAYROLL-LAW — 급여 화면이 정본 식을 쓴다', () => {
  test('설정 테이블 없음 → 기본값(전부 끔)으로 51,400원, 주휴·휴일 문구 없음, 저장은 준비 중, 최저임금 경고, 참고용 고지', async ({ page }) => {
    await boot(page, 'missing');
    await openSection(page, '인건비 정산');
    await expect(page.getByTestId('labor-total')).toHaveText('51,400원');
    await expect(page.getByTestId('staff-pay-row')).toContainText('50,000');
    await expect(page.getByTestId('dealer-pay-row')).toContainText('1,400');
    await expect(page.getByText(/휴게 −/)).toHaveCount(0);
    await expect(page.getByTestId('plan-mismatch')).toHaveCount(0); // 어긋난 교대가 없으면 0건
    // 기본값(주휴·5인 끔)에서는 급여 정산 화면에 주휴·휴일 문구가 한 줄도 없다(스위치 켠 매장만).
    const settle = page.locator('div').filter({ has: page.getByTestId('pay-disclaimer') }).last(); // 급여 정산 판 안쪽만
    await expect(settle).toBeVisible();
    await expect(settle.getByText(/주휴|휴일/)).toHaveCount(0);
    await expect(page.getByTestId('pay-disclaimer')).toContainText('참고용 계산입니다');

    await openSection(page, '인건비 관리');
    const panel = page.getByTestId('pay-rules');
    await expect(panel).toContainText('설정 저장은 준비 중');
    await expect(panel.getByRole('checkbox', { name: /휴게 자동 공제/ })).not.toBeChecked();
    await expect(panel.getByRole('checkbox', { name: /주휴수당 계산/ })).not.toBeChecked();
    await expect(panel.getByRole('checkbox', { name: /조기 출근 인정/ })).not.toBeChecked();
    await expect(panel).toContainText('해당하는 매장만 켜세요');
    await expect(panel.getByRole('checkbox', { name: /상시 근로자 5인 이상/ })).not.toBeChecked();
    await expect(panel.getByRole('checkbox', { name: /휴게 자동 공제/ })).toBeDisabled();
    await expect(page.getByTestId('min-wage-warn')).toContainText('10,320원');
    // 경고만 — 저장 버튼은 살아 있다
    await expect(page.getByRole('button', { name: '저장' }).last()).toBeEnabled();
  });

  test('설정 행(휴게 끔 · 5인 이상 켬) → 야간 가산 포함 56,400원', async ({ page }) => {
    await boot(page, { early_credit: false, auto_break: false, five_plus: true, weekly_holiday: true });
    await openSection(page, '인건비 정산');
    await expect(page.getByTestId('labor-total')).toHaveText('56,400원');
    await expect(page.getByTestId('pay-extras')).toContainText('야간 5,000');
  });

  test('설정 행(휴게 켬) → 270분 × 10,000 = 45,000 + 딜러 1,400 = 46,400원, 휴게 내역 표시', async ({ page }) => {
    await boot(page, { early_credit: false, auto_break: true, five_plus: false, weekly_holiday: true });
    await openSection(page, '인건비 정산');
    await expect(page.getByTestId('labor-total')).toHaveText('46,400원');
    await expect(page.getByTestId('staff-pay-row')).toContainText('45,000');
    await expect(page.getByTestId('pay-extras')).toContainText('휴게 −0.5h');
  });

  test('계획과 6h 넘게 어긋난 출근 → 「계획과 다른 출근 1건 확인 필요」 한 줄(1440·1024·390 줄바꿈·잘림 없음)', async ({ page }) => {
    await boot(page, 'missing', [MISMATCH_ROW]);
    await openSection(page, '인건비 정산');
    const tag = page.getByTestId('plan-mismatch');
    await expect(tag).toHaveCount(1);
    await expect(tag).toContainText('계획과 다른 출근 1건 확인 필요');
    await expect(page.getByTestId('pay-extras')).toContainText('이직원');
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await tag.scrollIntoViewIfNeeded();
      const m = await tag.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const box = el.closest('[data-testid="pay-extras"]')!.getBoundingClientRect();
        const lh = parseFloat(getComputedStyle(el).lineHeight);
        // 줄 수 = 서로 다른 줄 상단 개수 — getClientRects 는 한 줄 안에서도 텍스트 조각마다 사각형을 줄 수 있다(1440 실측 2개·높이 14px).
        return { h: r.height, lh, lines: new Set([...el.getClientRects()].map((x) => Math.round(x.top))).size, right: r.right, boxRight: box.right, left: r.left, boxLeft: box.left, vw: innerWidth, docW: document.documentElement.scrollWidth };
      });
      console.log(`plan-mismatch @${width}: ${JSON.stringify(m)}`);
      expect(m.lines, `${width}: 줄바꿈`).toBe(1);
      expect(m.h, `${width}: 높이가 한 줄보다 크다`).toBeLessThanOrEqual(m.lh + 1);
      expect(m.right, `${width}: 오른쪽 잘림`).toBeLessThanOrEqual(m.boxRight);
      expect(m.left, `${width}: 왼쪽 잘림`).toBeGreaterThanOrEqual(m.boxLeft);
      expect(m.docW, `${width}: 가로 스크롤`).toBeLessThanOrEqual(m.vw);
    }
  });

  test('딜러 로테이션 모달 합계도 같은 식(1,400원)', async ({ page }) => {
    await boot(page, 'missing');
    await page.locator('[data-mystore-secbar] button:visible').filter({ hasText: '대시보드' }).first().click();
    await page.getByRole('button', { name: '딜러 로테이션·급여' }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg).toContainText('박딜러');
    await expect(dlg).toContainText('1,400원');
    await dlg.getByPlaceholder('시급').fill('9000');
    await expect(dlg.getByTestId('min-wage-warn')).toBeVisible();
  });
});
