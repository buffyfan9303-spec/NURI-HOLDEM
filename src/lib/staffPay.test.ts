// 인건비 규칙 경계표 — 서버 staff_pay_summary(20260924e ⑩)와 같은 식인지 고정한다.
// 서버 쪽 대응 줄은 rehearsal.sql 의 P5·P6·P7(시급 96,000 · 일급 93,750 · 월급 2,100,000).
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAY_RULES, RAW_PAY_RULES, autoBreakMinutes, belowMinWage, computePay, daysInMonth, laborSummary, lateMinutes, netMinutes,
  nightMinutes, payForPeriod, plannedMinutes, shiftFromHm, weekStartOf, workedMinutes, type PayRules, type PayShift, type WageShift,
} from './staffPay';

/** KST 벽시계 → epoch ms. 서버의 `(date + time) at time zone 'Asia/Seoul'` 과 같다. */
const kst = (d: string, hms: string) => Date.parse(`${d}T${hms.length === 5 ? `${hms}:00` : hms}+09:00`);
const shift = (d: string, plan: [string, string] | null, inT: string | null, outT: string | null, outNextDay = true): PayShift => {
  const next = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return {
    workDate: d,
    startAt: plan ? kst(d, plan[0]) : null,
    endAt: plan ? kst(outNextDay && plan[1] < plan[0] ? next : d, plan[1]) : null,
    checkInAt: inT ? kst(d, inT) : null,
    checkOutAt: outT ? kst(outNextDay && inT && outT < inT ? next : d, outT) : null,
  };
};

describe('근무 분 — 계획 시작부터 · 1분 단위 내림', () => {
  it.each([
    ['일찍 온 10분은 불인정', shift('2026-08-10', ['18:00', '02:00'], '17:50', '02:00'), 480],
    ['1분 지각 → 그만큼 빠짐', shift('2026-08-10', ['18:00', '02:00'], '18:01:00', '02:00'), 479],
    ['59초 늦게 와도 초는 교대마다 버림', shift('2026-08-10', ['18:00', '02:00'], '18:00:59', '02:00'), 479],
    ['퇴근 59초는 버림', shift('2026-08-10', ['18:00', '02:00'], '18:00', '02:00:59'), 480],
    ['계획 종료 뒤 연장은 인정', shift('2026-08-10', ['18:00', '02:00'], '18:00', '03:00'), 540],
    ['계획 없으면 출근 시각부터', shift('2026-08-10', null, '18:10', '22:10'), 240],
    ['퇴근 없음 → 0(미완료)', shift('2026-08-10', ['18:00', '02:00'], '18:00', null), 0],
    ['출근 없음 → 0', shift('2026-08-10', ['18:00', '02:00'], null, null), 0],
    ['계획 시작 전에 퇴근 → 음수 대신 0', shift('2026-08-10', ['18:00', '23:00'], '17:00', '17:30', false), 0],
  ])('%s', (_label, s, expected) => { expect(workedMinutes(s)).toBe(expected); });
});

describe('지각 분 — 유예 없음', () => {
  const start = kst('2026-08-10', '18:00');
  it.each([
    ['정각', '18:00:00', 0],
    ['59초', '18:00:59', 0],
    ['1분', '18:01:00', 1],
    ['일찍', '17:30:00', 0],
    ['10분 30초', '18:10:30', 10],
  ])('%s → %i분', (_l, t, expected) => { expect(lateMinutes(kst('2026-08-10', t), start)).toBe(expected); });
  it('계획 시작이 없으면 판정 불가(null)', () => { expect(lateMinutes(kst('2026-08-10', '18:10'), null)).toBeNull(); });
});

describe('계획 분', () => {
  it('자정 넘는 계획', () => { expect(plannedMinutes(shift('2026-08-10', ['18:00', '02:00'], null, null))).toBe(480); });
  it('계획 없음 → null', () => { expect(plannedMinutes(shift('2026-08-10', null, '18:00', '20:00'))).toBeNull(); });
});

describe('달 일수', () => {
  it.each([['2026-02-10', 28], ['2028-02-01', 29], ['2026-08-31', 31], ['2026-09-01', 30]])('%s → %i', (d, n) => {
    expect(daysInMonth(d)).toBe(n);
  });
});

describe('기간 인건비 — 유형별', () => {
  const H = (amount: number, from = '2026-08-01') => [{ payType: 'hourly' as const, amount, effectiveFrom: from }];
  it('시급 480분 × 12,000 = 96,000 (서버 P5 와 같은 값)', () => {
    expect(payForPeriod('2026-08-01', '2026-08-31', [shift('2026-08-10', ['18:00', '02:00'], '17:50', '02:00')], H(12000))).toBe(96000);
  });
  it('시급 반올림은 합계에서 half-up: 30분 × 12,001 = 6,000.5 → 6,001', () => {
    expect(payForPeriod('2026-08-01', '2026-08-31', [shift('2026-08-10', null, '18:00', '18:30', false)], H(12001))).toBe(6001);
  });
  it('시급 변경일 경계 — 전날은 옛 금액, 당일부터 새 금액', () => {
    const rates = [{ payType: 'hourly' as const, amount: 10000, effectiveFrom: '2026-08-01' },
                   { payType: 'hourly' as const, amount: 12000, effectiveFrom: '2026-08-16' }];
    const s = [shift('2026-08-15', null, '18:00', '19:00', false), shift('2026-08-16', null, '18:00', '19:00', false)];
    expect(payForPeriod('2026-08-01', '2026-08-31', s, rates)).toBe(22000);
  });
  it('적용 시작일 전의 근무는 0원', () => {
    expect(payForPeriod('2026-08-01', '2026-08-31', [shift('2026-08-05', null, '18:00', '19:00', false)], H(12000, '2026-08-06'))).toBe(0);
  });
  it('급여 행이 없으면 0원', () => {
    expect(payForPeriod('2026-08-01', '2026-08-31', [shift('2026-08-05', null, '18:00', '19:00', false)], [])).toBe(0);
  });

  const D = [{ payType: 'daily' as const, amount: 100000, effectiveFrom: '2026-08-01' }];
  it('일급 시간 비례: 계획 480 · 실제 450 → 93,750 (서버 P6)', () => {
    expect(payForPeriod('2026-08-01', '2026-08-31', [shift('2026-08-12', ['18:00', '02:00'], '18:30', '02:00')], D)).toBe(93750);
  });
  it('일급은 계획보다 오래 일해도 1일을 넘지 않는다', () => {
    expect(payForPeriod('2026-08-01', '2026-08-31', [shift('2026-08-12', ['18:00', '02:00'], '18:00', '04:00')], D)).toBe(100000);
  });
  it('일급인데 계획이 없으면 출퇴근이 있는 교대는 1일', () => {
    expect(payForPeriod('2026-08-01', '2026-08-31', [shift('2026-08-12', null, '18:00', '19:00', false)], D)).toBe(100000);
  });
  it('일급인데 퇴근이 없으면 0', () => {
    expect(payForPeriod('2026-08-01', '2026-08-31', [shift('2026-08-12', ['18:00', '02:00'], '18:00', null)], D)).toBe(0);
  });

  it('주급 일할: 3일 × 700,000 ÷ 7 = 300,000', () => {
    expect(payForPeriod('2026-08-01', '2026-08-03', [], [{ payType: 'weekly', amount: 700000, effectiveFrom: '2026-07-01' }])).toBe(300000);
  });
  it('월급 일할: 8/11 입사 → 21/31 × 3,100,000 = 2,100,000 (서버 P7)', () => {
    expect(payForPeriod('2026-08-01', '2026-08-31', [], [{ payType: 'monthly', amount: 3100000, effectiveFrom: '2026-08-11' }])).toBe(2100000);
  });
  it('월급 2월(28일) 반달 = 절반', () => {
    expect(payForPeriod('2026-02-01', '2026-02-28', [], [{ payType: 'monthly', amount: 2800000, effectiveFrom: '2026-02-15' }])).toBe(1400000);
  });
  it('월급 계약 종료일까지만: 8/10 종료 → 10/31', () => {
    expect(payForPeriod('2026-08-01', '2026-08-31', [], [{ payType: 'monthly', amount: 3100000, effectiveFrom: '2026-01-01' }],
      { end: '2026-08-10' })).toBe(1000000);
  });
  it('월급이 두 달에 걸친 기간은 달마다 그 달 일수로 나눈다', () => {
    expect(payForPeriod('2026-07-31', '2026-08-01', [], [{ payType: 'monthly', amount: 3100000, effectiveFrom: '2026-01-01' }])).toBe(200000);
  });
  it('주급·월급은 출퇴근 기록과 무관(고정급 일할)', () => {
    const noShow = [shift('2026-08-02', ['18:00', '02:00'], null, null)];
    expect(payForPeriod('2026-08-01', '2026-08-07', noShow, [{ payType: 'weekly', amount: 700000, effectiveFrom: '2026-01-01' }])).toBe(700000);
  });
});

// ── PAYROLL-LAW 2026-09-26 — 법령 정합 규칙 ─────────────────────────────────────
const R = (p: Partial<PayRules> = {}): PayRules => ({ ...RAW_PAY_RULES, ...p });
const W = (s: PayShift, wage = 12000): WageShift => ({ ...s, wage });
const AUG = { from: '2026-08-01', to: '2026-08-31', today: '2026-09-26' };

describe('조기 출근 — 기본 불인정, 매장 설정으로 인정', () => {
  const s = shift('2026-08-10', ['18:00', '02:00'], '17:40', '02:00');
  it('끔: 계획 시작부터 480분', () => { expect(workedMinutes(s)).toBe(480); });
  it('켬: 출근 시각부터 500분', () => { expect(workedMinutes(s, true)).toBe(500); });
  it('기본값은 끔', () => { expect(DEFAULT_PAY_RULES.earlyCredit).toBe(false); });
  it('매장 설정이 없을 때 기본값 — 전부 끔(오너 2026-09-26: 비정규직만, 필요한 매장만 켠다)', () => {
    expect(DEFAULT_PAY_RULES).toEqual({ earlyCredit: false, autoBreak: false, fivePlus: false, weeklyHoliday: false });
  });
  it('기본값으로는 주휴·휴일 가산이 0이고 주휴 확인 필요도 세지 않는다', () => {
    // 추석 연휴 10h + 주 15h 개근 — 켜면 둘 다 붙는 입력
    const ws = [W(shift('2026-09-25', ['09:00', '19:00'], '09:00', '19:00', false)),
      ...['2026-09-21', '2026-09-22', '2026-09-23'].map((d) => W(shift(d, ['18:00', '21:00'], '18:00', '21:00', false)))];
    const SEP = { from: '2026-09-01', to: '2026-09-30', today: '2026-12-01' };
    const off = computePay(ws, DEFAULT_PAY_RULES, SEP);
    expect([off.holiday, off.holidayMin, off.weeklyHoliday, off.weeklyHolidayUnknown, off.overtime, off.night]).toEqual([0, 0, 0, 0, 0, 0]);
    const on = computePay(ws, { ...DEFAULT_PAY_RULES, fivePlus: true, weeklyHoliday: true }, SEP);
    expect(on.holiday).toBeGreaterThan(0);
    expect(on.weeklyHoliday).toBeGreaterThan(0);
    // 계획 종료가 없으면 켠 매장에서만 '확인 필요' 1주
    const noEnd = [W(shiftFromHm('2026-09-21', { startHm: '18:00', checkIn: '18:00', checkOut: '02:00' }))];
    expect(computePay(noEnd, DEFAULT_PAY_RULES, SEP).weeklyHolidayUnknown).toBe(0);
    expect(computePay(noEnd, { ...DEFAULT_PAY_RULES, weeklyHoliday: true }, SEP).weeklyHolidayUnknown).toBe(1);
  });
});

describe('HH:mm 기록 → 시각(자정 넘김)', () => {
  it('출근 23:50 · 퇴근 00:10 → 다음 날 퇴근, 20분', () => {
    expect(workedMinutes(shiftFromHm('2026-08-10', { checkIn: '23:50', checkOut: '00:10' }))).toBe(20);
  });
  it('계획 23:00 · 출근 00:10(자정 뒤 지각) · 퇴근 06:00 → 350분(같은 날로 두면 0분이 되던 경우)', () => {
    expect(workedMinutes(shiftFromHm('2026-08-10', { startHm: '23:00', checkIn: '00:10', checkOut: '06:00' }))).toBe(350);
  });
  it('계획 00:30 · 출근 23:50(전날 밤 조기) → 계획부터 인정', () => {
    expect(workedMinutes(shiftFromHm('2026-08-10', { startHm: '00:30', checkIn: '23:50', checkOut: '06:30' }))).toBe(360);
  });
  it('계획 종료가 시작보다 이르면 다음 날', () => {
    expect(plannedMinutes(shiftFromHm('2026-08-10', { startHm: '18:00', endHm: '02:00' }))).toBe(480);
  });
});

describe('휴게 자동 공제 — 제54조(공제 뒤 근로 4h·8h 문턱)', () => {
  it.each([[269, 0], [270, 30], [539, 30], [540, 60], [720, 60]])('체류 %i분 → %i분', (stay, brk) => {
    expect(autoBreakMinutes(stay)).toBe(brk);
  });
  const s = shift('2026-08-10', null, '18:00', '03:00'); // 540분
  it('켬: 540 → 실근로 480', () => { expect(netMinutes(s, R({ autoBreak: true })).net).toBe(480); });
  it('끔: 공제 없음', () => { expect(netMinutes(s, R()).net).toBe(540); });
  it('기록된 휴게가 있으면 그것 우선(자동보다)', () => { expect(netMinutes({ ...s, breakMinutes: 90 }, R({ autoBreak: true })).net).toBe(450); });
  it('기록 휴게가 체류보다 길어도 음수가 되지 않는다', () => { expect(netMinutes({ ...s, breakMinutes: 9999 }, R()).net).toBe(0); });
});

describe('야간 22~06 겹침(KST)', () => {
  it.each([
    ['18:00~02:00', shift('2026-08-10', null, '18:00', '02:00'), 240],
    ['20:00~23:00', shift('2026-08-10', null, '20:00', '23:00', false), 60],
    ['05:00~07:00', shift('2026-08-10', null, '05:00', '07:00', false), 60],
    ['09:00~18:00', shift('2026-08-10', null, '09:00', '18:00', false), 0],
    ['21:00~07:00(밤 전체)', shift('2026-08-10', null, '21:00', '07:00'), 480],
  ])('%s → %i분', (_l, s, m) => { expect(nightMinutes(s)).toBe(m); });
  it('조기 출근 불인정이면 인정 시작 전 야간도 안 센다', () => {
    const s = shift('2026-08-10', ['23:00', '03:00'], '21:30', '03:00');
    expect(nightMinutes(s)).toBe(240);
    expect(nightMinutes(s, true)).toBe(300);
  });
});

describe('5인 이상 가산 — 끔이면 0, 켜면 별도 줄', () => {
  const s = [W(shift('2026-08-10', null, '18:00', '04:00'))]; // 월 600분, 야간 360분
  it('끔(기본): 가산 0, 기본급만', () => {
    const p = computePay(s, R(), AUG);
    expect([p.overtime, p.night, p.holiday, p.total]).toEqual([0, 0, 0, 120000]);
  });
  it('켬: 일 연장 120분 · 야간 360분 → 기본 120,000 + 12,000 + 36,000', () => {
    const p = computePay(s, R({ fivePlus: true }), AUG);
    expect([p.overtimeMin, p.overtime, p.nightMin, p.night, p.total]).toEqual([120, 12000, 360, 36000, 168000]);
  });
  it('주 40h — 하루 8h × 6일(월~토) → 주 연장 480분(일 연장과 이중 계산 없음)', () => {
    const wk = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15'];
    const ws = wk.map((d) => W(shift(d, null, '09:00', '17:00', false)));
    const p = computePay(ws, R({ fivePlus: true }), { ...AUG, holidays: new Set() });
    expect([p.overtimeMin, p.overtime]).toEqual([480, 48000]);
  });
  it('하루 10h × 5일 → 일 연장 600분만(주 40h 는 8h 이내 몫만 쌓아 이중 계산 없음)', () => {
    const wk = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14'];
    const p = computePay(wk.map((d) => W(shift(d, null, '09:00', '19:00', false))), R({ fivePlus: true }), { ...AUG, holidays: new Set() });
    expect([p.overtimeMin, p.overtime]).toEqual([600, 60000]);
  });
  it('휴일(한글날 10/9) 10h → 8h 이내 50% + 초과 2h 100%, 연장으로는 안 센다', () => {
    const p = computePay([W(shift('2026-10-09', null, '09:00', '19:00', false))], R({ fivePlus: true }), { from: '2026-10-01', to: '2026-10-31', today: '2026-12-01' });
    expect([p.holidayMin, p.holiday, p.overtimeMin]).toEqual([600, 48000 + 24000, 0]);
  });
});

describe('주휴수당 — 제55조, 주 소정 15h·개근·초단시간 제외', () => {
  // 2026-08-10(월) ~ 08-16(일). 계획 = 실제.
  const DAYS = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16'];
  const week = (hm: [string, string], n: number, noShowIdx = -1) =>
    DAYS.slice(0, n).map((d, i) => W(shift(d, hm, i === noShowIdx ? null : hm[0], i === noShowIdx ? null : hm[1], false)));
  const WH = R({ weeklyHoliday: true });
  it('주 15h(3h × 5일) 개근 → 180분 × 12,000 = 36,000', () => {
    const p = computePay(week(['18:00', '21:00'], 5), WH, AUG);
    expect([p.weeklyHolidayWeeks, p.weeklyHoliday]).toEqual([1, 36000]);
  });
  it('주 14h59m 는 초단시간 → 0(확인 필요도 아님)', () => {
    const ws = week(['18:00', '21:00'], 5);
    ws[4] = W(shift('2026-08-14', ['18:00', '20:59'], '18:00', '20:59', false));
    const p = computePay(ws, WH, AUG);
    expect([p.weeklyHolidayWeeks, p.weeklyHolidayUnknown, p.weeklyHoliday]).toEqual([0, 0, 0]);
  });
  it('결근 하루 → 0', () => { expect(computePay(week(['18:00', '21:00'], 5, 2), WH, AUG).weeklyHoliday).toBe(0); });
  it('지각은 개근을 깨지 않는다', () => {
    const ws = week(['18:00', '21:00'], 5);
    ws[0] = W(shift('2026-08-10', ['18:00', '21:00'], '18:20', '21:00', false));
    expect(computePay(ws, WH, AUG).weeklyHolidayWeeks).toBe(1);
  });
  it('주 48h 계획이어도 40h 상한 → 8h × 12,000 = 96,000', () => {
    expect(computePay(week(['09:00', '17:00'], 6), WH, AUG).weeklyHoliday).toBe(96000);
  });
  it('휴게 자동 공제를 켜면 소정근로도 휴게를 뺀다 — 4h30 × 4일 = 18h → 공제 뒤 16h → 192분', () => {
    const p = computePay(week(['18:00', '22:30'], 4), R({ weeklyHoliday: true, autoBreak: true }), AUG);
    expect(p.weeklyHoliday).toBe(192 * 200);
  });
  it('계획 종료가 없으면 판정 불가 → 확인 필요, 금액 0', () => {
    const ws = ['2026-08-10', '2026-08-11', '2026-08-12'].map((d) => W(shiftFromHm(d, { startHm: '18:00', checkIn: '18:00', checkOut: '02:00' })));
    const p = computePay(ws, WH, AUG);
    expect([p.weeklyHolidayUnknown, p.weeklyHoliday]).toEqual([1, 0]);
  });
  it('주가 아직 안 끝났으면 확인 필요', () => {
    const p = computePay(week(['18:00', '21:00'], 5), WH, { ...AUG, today: '2026-08-15' });
    expect([p.weeklyHolidayUnknown, p.weeklyHoliday]).toEqual([1, 0]);
  });
  it('주는 일요일이 든 기간에만 — 8/31(월)~9/6(일) 주는 8월에 안 잡히고 9월에 잡힌다', () => {
    const ws = ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'].map((d) => W(shift(d, ['18:00', '21:00'], '18:00', '21:00', false)));
    expect(computePay(ws, WH, AUG).weeklyHolidayWeeks).toBe(0);
    expect(computePay(ws, WH, { from: '2026-09-01', to: '2026-09-30', today: '2026-09-26' }).weeklyHolidayWeeks).toBe(1);
  });
  it('주휴 끔 → 0', () => { expect(computePay(week(['18:00', '21:00'], 5), R(), AUG).weeklyHoliday).toBe(0); });
});

describe('최저임금 경고 — 2026 10,320원', () => {
  it.each([[10319, true], [10320, false], [0, false], [15000, false]])('%i원 → 경고 %s', (w, warn) => {
    expect(belowMinWage(w, '2026-09-26') != null).toBe(warn);
  });
  it('모르는 해(2027)는 알려진 최근 값(2026)으로 본다', () => { expect(belowMinWage(10000, '2027-01-02')?.year).toBe(2026); });
  it('고시 전 해(2025)는 판정하지 않는다', () => { expect(belowMinWage(9000, '2025-12-31')).toBeNull(); });
});

describe('반올림은 최종 지급액에서 한 번', () => {
  it('1분 × 10,030원 교대 3개 = 501.5 → 502 (교대마다 반올림하면 501)', () => {
    const ws = ['2026-08-10', '2026-08-11', '2026-08-12'].map((d) => W(shift(d, null, '18:00', '18:01', false), 10030));
    expect(computePay(ws, R(), AUG).total).toBe(502);
  });
});

describe('laborSummary — 정산 화면·대시보드·딜러가 같은 식', () => {
  it('딜러 18:00~18:07 × 12,000 = 1,400원(옛 0.1h 반올림은 1,200원)', () => {
    const s = laborSummary({ ...AUG, rules: RAW_PAY_RULES, staff: [], wages: {},
      dealers: [{ dealerName: 'D', shiftDate: '2026-08-10', startTime: '18:00', endTime: '18:07', hourlyWage: 12000 }] });
    expect(s.dealerPay).toBe(1400);
  });
  it('기간 앞 주 기록은 금액에 안 들어가고 행도 안 생긴다', () => {
    const s = laborSummary({ ...AUG, rules: DEFAULT_PAY_RULES, dealers: [], wages: { A: 12000, B: 12000 },
      staff: [{ date: '2026-07-27', name: 'B', checkIn: '18:00', checkOut: '22:00' }, { date: '2026-08-03', name: 'A', checkIn: '18:00', checkOut: '22:00' }] });
    expect(s.staff.map((r) => [r.name, r.total])).toEqual([['A', 48000]]);
  });
  it('기본값으로는 휴게를 빼지 않는다 — 체류 300분 × 12,000 = 60,000(켜면 270분 = 54,000)', () => {
    const staff = [{ date: '2026-08-03', name: 'A', checkIn: '18:00', checkOut: '23:00' }];
    expect(laborSummary({ ...AUG, rules: DEFAULT_PAY_RULES, dealers: [], wages: { A: 12000 }, staff }).total).toBe(60000);
    expect(laborSummary({ ...AUG, rules: { ...DEFAULT_PAY_RULES, autoBreak: true }, dealers: [], wages: { A: 12000 }, staff }).total).toBe(54000);
  });
  it('weekStartOf — 일요일은 그 주 월요일로', () => {
    expect(weekStartOf('2026-08-16')).toBe('2026-08-10');
    expect(weekStartOf('2026-08-10')).toBe('2026-08-10');
  });
});

// ── critical-reviewer 반례 2026-09-26 ────────────────────────────────────────
describe('반례① 계획과 크게 어긋난 출근 — 체류는 24h 를 넘지 않고, 6h 넘게 어긋나면 확인 필요', () => {
  const odd = shiftFromHm('2026-08-10', { startHm: '10:00', endHm: '18:00', checkIn: '22:31', checkOut: '23:59' });
  it('조기 불인정·인정 모두 체류 ≤ 1440분(예전 839분 / 1528분)', () => {
    expect(workedMinutes(odd)).toBeLessThanOrEqual(1440);
    expect(workedMinutes(odd, true)).toBeLessThanOrEqual(1440);
    expect(workedMinutes(odd, true)).toBe(88);
  });
  it('어긋남은 금액 0으로 조용히 넘기지 않고 확인 필요 1건', () => {
    expect(computePay([W(odd)], R(), AUG).planMismatch).toBe(1);
  });
  it.each([['12:00', 0], ['16:00', 0], ['16:01', 1], ['09:59', 0], ['03:59', 1], ['09:50', 0]])('계획 10:00 · 출근 %s → 확인 필요 %i', (inT, n) => {
    const s = shiftFromHm('2026-08-10', { startHm: '10:00', endHm: '18:00', checkIn: inT, checkOut: '23:59' });
    expect(computePay([W(s)], R(), AUG).planMismatch).toBe(n);
  });
});

describe('반례② 휴일은 날짜가 아니라 공휴일 0~24시와 겹친 분', () => {
  const SEP = { from: '2026-09-01', to: '2026-09-30', today: '2026-12-01' };
  it('9/23 22:00 → 9/24(추석 연휴) 06:00: 휴일 360분(예전 0), 평일 몫 120분', () => {
    const p = computePay([W(shift('2026-09-23', null, '22:00', '06:00'))], R({ fivePlus: true }), SEP);
    expect([p.holidayMin, p.holiday, p.overtimeMin]).toEqual([360, 36000, 0]);
  });
  it('9/26(추석 연휴) 20:00 → 9/27(일, 공휴일 아님) 04:00: 휴일 240분(예전 480)', () => {
    const p = computePay([W(shift('2026-09-26', null, '20:00', '04:00'))], R({ fivePlus: true }), SEP);
    expect([p.holidayMin, p.holiday]).toEqual([240, 24000]);
  });
  it('휴일 안에서 8h 초과 몫은 100% — 9/25 00:00~10:00 → 480×50% + 120×100%', () => {
    const p = computePay([W(shift('2026-09-25', null, '00:00', '10:00', false))], R({ fivePlus: true }), SEP);
    expect([p.holidayMin, p.holiday]).toEqual([600, 48000 + 24000]);
  });
});

describe('반례③ 주휴 단가 = 그 주 소정근로 시간 가중 평균 시급', () => {
  it('3h × 20,000 × 4일 + 3h × 10,320 × 1일 → 평균 18,064 × 3h = 54,192(마지막 교대 단가면 30,960)', () => {
    const days = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14'];
    const ws = days.map((d, i) => W(shift(d, ['18:00', '21:00'], '18:00', '21:00', false), i < 4 ? 20000 : 10320));
    expect(computePay(ws, R({ weeklyHoliday: true }), AUG).weeklyHoliday).toBe(54192);
  });
});
