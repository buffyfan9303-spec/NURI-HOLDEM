import { describe, expect, it } from 'vitest';
import { punchView } from './staffPunch';

const T = '2026-09-30', Y = '2026-09-29';

describe('punchView — 출근·퇴근 버튼은 상태에 맞는 것만 열린다', () => {
  it('배정 없음 → 둘 다 닫힘', () => {
    expect(punchView([], T, Y)).toMatchObject({ phase: 'none', canIn: false, canOut: false });
  });
  it('출근 전 → 출근만', () => {
    expect(punchView([{ date: T, checkIn: null, checkOut: null }], T, Y)).toMatchObject({ phase: 'before', canIn: true, canOut: false });
  });
  it('근무 중 → 퇴근만(출근 다시 누르기 막힘)', () => {
    expect(punchView([{ date: T, checkIn: '09:00', checkOut: null }], T, Y)).toMatchObject({ phase: 'on', canIn: false, canOut: true });
  });
  it('퇴근 후 → 둘 다 닫힘', () => {
    expect(punchView([{ date: T, checkIn: '09:00', checkOut: '18:00' }], T, Y)).toMatchObject({ phase: 'done', canIn: false, canOut: false });
  });
  it('자정 넘긴 야간 근무 → 어제 근무를 퇴근', () => {
    const v = punchView([{ date: Y, checkIn: '22:00', checkOut: null }], T, Y);
    expect(v).toMatchObject({ phase: 'on', canIn: false, canOut: true });
    expect(v.outTarget?.date).toBe(Y);
  });
  it('어제 퇴근을 잊었고 오늘 출근 전 → 출근도 퇴근(어제)도 열림, 오늘 출근 뒤엔 퇴근이 오늘을 닫는다', () => {
    const rows = [{ date: Y, checkIn: '22:00', checkOut: null }, { date: T, checkIn: null, checkOut: null }];
    expect(punchView(rows, T, Y)).toMatchObject({ canIn: true, canOut: true });
    const after = punchView([rows[0], { date: T, checkIn: '09:00', checkOut: null }], T, Y);
    expect(after.outTarget?.date).toBe(T);
    expect(after.canIn).toBe(false);
  });
});
