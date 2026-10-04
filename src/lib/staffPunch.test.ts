import { describe, expect, it } from 'vitest';
import { kstMinutes, punchView } from './staffPunch';

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
  it('퇴근만 먼저 적힌 오늘 근무 → 출근 닫힘 + 안내(20261004f, critical X1~X3: 같은 분 24h·역전 23h59m 급여)', () => {
    expect(punchView([{ date: T, checkIn: null, checkOut: '18:30' }], T, Y)).toMatchObject({ phase: 'before', canIn: false, canOut: false, inBlockedByOut: true });
    expect(punchView([{ date: T, checkIn: null, checkOut: null }], T, Y).inBlockedByOut).toBe(false);
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

// 오너 2026-09-30: 자정 넘어 오면 오전 2시(KST)까지 어제 출근으로 찍는다. 서버 punch_my_shift 와 같은 규칙.
describe('punchView — KST 00:00~01:59 는 어제 근무에 출근', () => {
  const emptyY = { date: Y, checkIn: null, checkOut: null }, emptyT = { date: T, checkIn: null, checkOut: null };
  const at = (h: number, m: number) => h * 60 + m;
  it('00:30 · 어제 빈 행 → 어제가 출근 대상(오늘 행보다 우선)', () => {
    const v = punchView([emptyY, emptyT], T, Y, at(0, 30));
    expect(v).toMatchObject({ canIn: true, inYesterday: true, phase: 'before' });
    expect(v.inTarget?.date).toBe(Y);
  });
  it('01:59 는 아직 어제, 02:00 부터는 오늘 행', () => {
    expect(punchView([emptyY, emptyT], T, Y, at(1, 59)).inYesterday).toBe(true);
    const v = punchView([emptyY, emptyT], T, Y, at(2, 0));
    expect(v).toMatchObject({ canIn: true, inYesterday: false });
    expect(v.inTarget?.date).toBe(T);
  });
  it('02:00 이후 어제 빈 행만 있고 오늘 행이 없으면 출근 못 함', () => {
    expect(punchView([emptyY], T, Y, at(2, 0))).toMatchObject({ canIn: false, phase: 'none' });
  });
  it('어제 행이 이미 출근된 상태(퇴근 전) → 재탭 막힘(출근 닫힘, 퇴근만)', () => {
    const v = punchView([{ date: Y, checkIn: '01:10', checkOut: null }, emptyT], T, Y, at(1, 30));
    expect(v).toMatchObject({ canIn: false, canOut: true, phase: 'on', inYesterday: false });
  });
  it('어제 행이 없으면 기존대로 오늘 행', () => {
    const v = punchView([emptyT], T, Y, at(0, 30));
    expect(v).toMatchObject({ canIn: true, inYesterday: false });
    expect(v.inTarget?.date).toBe(T);
  });
  it('어제 근무가 이미 끝났으면(출근·퇴근 모두) 오늘 행', () => {
    const v = punchView([{ date: Y, checkIn: '18:00', checkOut: '23:30' }, emptyT], T, Y, at(1, 0));
    expect(v.inTarget?.date).toBe(T);
    expect(v.inYesterday).toBe(false);
  });
  it('kstMinutes — 기기 시간대와 무관하게 KST 분', () => {
    expect(kstMinutes(Date.parse('2026-09-30T01:30:00+09:00'))).toBe(90);
    expect(kstMinutes(Date.parse('2026-09-29T16:59:00Z'))).toBe(119); // = 09-30 01:59 KST
    expect(kstMinutes(Date.parse('2026-09-29T17:00:00Z'))).toBe(120); // = 02:00 KST
  });
});
