// R3-03 (audit3-regress-connect-1004.md#R3-03) — 같은 근무를 급여 표 8.0h, 출근일지·딜러 스케줄 9.5h 로 말하던 재발.
// 화면의 'Xh' 는 staffPay.shiftMinutes 한 함수, 급여 표는 laborSummary — 두 값이 같은 입력에서 같아야 한다.
// 음성 대조: 이 파일은 수정 전 staffPay.ts(shiftMinutes·hoursText·shiftHoursNote 없음, 01:59 어제 근무 규칙 없음)에서 실패한다.
// 실행: npx vitest run src/lib/staffHours.test.ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAY_RULES, holidayMinutesByDate, hoursText, laborSummary, shiftFromHm, shiftHoursNote, shiftMinutes, type PayRules,
} from './staffPay';

const BREAK: PayRules = { ...DEFAULT_PAY_RULES, autoBreak: true };
const day = '2026-10-01';
const o = { from: '2026-10-01', to: '2026-10-31', today: '2026-10-31' };

describe('R3-03 — 한 교대의 화면 시간 = 급여 표 시간', () => {
  // 보고서 재현 입력: 계획 18:00 · 출근 17:30 · 퇴근 03:00 · 휴게 자동 · 조기 출근 인정 끔
  const row = { date: day, name: '건우', startHm: '18:00', checkIn: '17:30', checkOut: '03:00' };

  it('휴게 자동 공제 켠 매장: 출근일지·스케줄 8.0h = 급여 표 8.0h (예전 9.5h)', () => {
    const m = shiftMinutes(row.date, row, BREAK);
    expect(m).toEqual({ raw: 570, stay: 540, brk: 60, net: 480 });
    expect(hoursText(m!.net)).toBe('8.0h');
    const pay = laborSummary({ ...o, rules: BREAK, staff: [row], wages: { 건우: 10_320 }, dealers: [] });
    expect(pay.staff[0].netMin).toBe(m!.net);
  });

  it('기본 설정(전부 끔): 계획 전 30분만 빠져 9.0h — 급여 표와 같다', () => {
    const m = shiftMinutes(row.date, row, DEFAULT_PAY_RULES)!;
    expect(m.net).toBe(540);
    const pay = laborSummary({ ...o, rules: DEFAULT_PAY_RULES, staff: [row], wages: {}, dealers: [] });
    expect(pay.staff[0].netMin).toBe(m.net);
  });

  it('딜러 근무(휴게 자동 공제 켬): 모달 행 시간 = 급여 명세 시간', () => {
    const d = { dealerName: '소율', shiftDate: day, startTime: '18:00', endTime: '03:00', hourlyWage: 15_000 };
    const m = shiftMinutes(d.shiftDate, { checkIn: d.startTime, checkOut: d.endTime }, BREAK)!;
    expect(m.net).toBe(480);
    const pay = laborSummary({ ...o, rules: BREAK, staff: [], wages: {}, dealers: [d] });
    expect(pay.dealers[0].netMin).toBe(m.net);
  });

  it('자정 넘김: 22:00~02:30 = 4.5h(기본 설정), 30분 휴게 문턱 직전', () => {
    expect(shiftMinutes(day, { checkIn: '22:00', checkOut: '02:30' }, DEFAULT_PAY_RULES)!.net).toBe(270);
    expect(shiftMinutes(day, { checkIn: '22:00', checkOut: '02:30' }, BREAK)!.net).toBe(240);
  });

  it('출·퇴근 중 하나라도 없으면 null(빈칸) — 0h 를 지어내지 않는다', () => {
    expect(shiftMinutes(day, { checkIn: '18:00' }, BREAK)).toBeNull();
    expect(shiftMinutes(day, { checkOut: '03:00' }, BREAK)).toBeNull();
  });

  it('출근~퇴근과 다르면 이유를 말하고, 같으면 말하지 않는다', () => {
    expect(shiftHoursNote(shiftMinutes(row.date, row, BREAK))).toBe('급여 기준 8.0h (출근~퇴근 9.5h · 계획 시작 전 0.5h 제외 · 휴게 −1.0h)');
    expect(shiftHoursNote(shiftMinutes(day, { checkIn: '18:00', checkOut: '22:00' }, DEFAULT_PAY_RULES))).toBeUndefined();
    expect(shiftHoursNote(null)).toBeUndefined();
  });
});

describe('어제 근무 규칙 — 계획 없는 행의 00:00~01:59 출근은 그 행의 다음 날 새벽(오너 2026-09-30)', () => {
  // 10-02(금) 행 · 10-03 개천절. 01:59 출근은 10-03 새벽 → 공휴일 근무로 귀속돼야 한다.
  const hol = new Set(['2026-10-03']);
  it('01:59 출근 → 다음 날 01:59, 공휴일 분이 10-03 에 잡힌다', () => {
    const s = shiftFromHm('2026-10-02', { checkIn: '01:59', checkOut: '05:00' });
    expect(new Date(s.checkInAt!).toISOString()).toBe('2026-10-02T16:59:00.000Z'); // = 10-03 01:59 KST
    expect([...holidayMinutesByDate(s, hol)]).toEqual([['2026-10-03', 181]]);
  });
  it('02:00 출근 → 그날 02:00 그대로(경계 바깥)', () => {
    const s = shiftFromHm('2026-10-02', { checkIn: '02:00', checkOut: '05:00' });
    expect(new Date(s.checkInAt!).toISOString()).toBe('2026-10-01T17:00:00.000Z'); // = 10-02 02:00 KST
    expect([...holidayMinutesByDate(s, hol)]).toEqual([]);
  });
  it('근무 분은 규칙과 무관하게 같다(01:30~05:00 = 3.5h)', () => {
    expect(shiftMinutes('2026-10-02', { checkIn: '01:30', checkOut: '05:00' }, DEFAULT_PAY_RULES)!.net).toBe(210);
  });
  it('계획이 있으면 계획 ±12h 규칙이 이긴다(계획 18:00 · 출근 01:30 → 다음 날)', () => {
    const s = shiftFromHm('2026-10-02', { startHm: '18:00', checkIn: '01:30', checkOut: '04:00' });
    expect(new Date(s.checkInAt!).toISOString()).toBe('2026-10-02T16:30:00.000Z');
  });
});
