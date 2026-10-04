// R3-03 재수정 — 이번 PR(표시 통일)은 **금액을 하나도 바꾸지 않는다**는 고정.
// critical-reviewer 반례 4행(review-r3-03-1004.md §3)의 금액을 부모 커밋 a6b578dd 의 staffPay 결과로 박았다.
// 684afedc 는 01:59 '어제 근무' 분기로 A·B·C·D 를 바꿨다(A +41,250 · B −37,500 · C −20,640 · D +20,640) — 그 분기는 뺐다.
// 휴일 귀속(새벽 출근이 어느 날짜의 근무인가)은 미정·별도 과제다. 정하면 이 표를 그 결정과 함께 바꾼다.
// 이 파일은 laborSummary 만 쓴다 — 부모 판 staffPay.ts 에서도 그대로 돌아 같은 값을 내야 한다(양성 대조).
// 실행: npx vitest run src/lib/staffPayParity.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_PAY_RULES, laborSummary, type PayRules } from './staffPay';

// 휴게 자동 공제 + 5인 이상(야간·휴일 가산). 2026-10-03 개천절 · 10-05 대체공휴일(KR_HOLIDAYS).
const RULES: PayRules = { ...DEFAULT_PAY_RULES, autoBreak: true, fivePlus: true };
const o = { from: '2026-10-01', to: '2026-10-31', today: '2026-10-31', rules: RULES };
const dealer = (shiftDate: string, startTime: string, endTime: string) =>
  laborSummary({ ...o, staff: [], wages: {}, dealers: [{ dealerName: '딜러', shiftDate, startTime, endTime, hourlyWage: 15_000 }] }).dealers[0];
const staff = (date: string, checkIn: string, checkOut: string) =>
  laborSummary({ ...o, staff: [{ date, name: '직원', checkIn, checkOut }], wages: { 직원: 10_320 }, dealers: [] }).staff[0];

describe('반례 4행 — 금액이 부모(a6b578dd)와 같다', () => {
  it.each([
    ['A 딜러 10-04 00:00~06:00', () => dealer('2026-10-04', '00:00', '06:00'), 123_750, 0],
    ['B 딜러 10-03 00:30~06:00', () => dealer('2026-10-03', '00:30', '06:00'), 150_000, 300],
    ['C 직원 오늘(10-03) 행 01:30~06:00', () => staff('2026-10-03', '01:30', '06:00'), 82_560, 240],
    ['D 직원 어제(10-02) 빈 행 01:30~06:00', () => staff('2026-10-02', '01:30', '06:00'), 61_920, 0],
  ] as const)('%s', (_label, row, total, holidayMin) => {
    const r = row();
    expect(r.total).toBe(total);
    expect(r.holidayMin).toBe(holidayMin);
  });
});
