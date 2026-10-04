// R4-01 — 근무 1회 길이 규칙(60초 하한 · 24시간 상한) 손계산 경계표.
// 서버 _shift_span_check · set_my_shift_time(20261004f)과 같은 식이다. 서버 쪽 대응 줄은
//   C:\Users\buffy\Documents\누리홀덤_영상분석_0930\shift-guard-1004\20_post.sql 의 S·O·N 줄.
import { describe, expect, it } from 'vitest';
import { DEFAULT_PAY_RULES, kstHm, selfShiftWriteError, shiftMinutes, shiftSpanError, shiftStartMs } from './staffPay';

const at = (d: string, hms: string) => Date.parse(`${d}T${hms}+09:00`);
const MIN = 60_000, H = 3_600_000;
const NOW = at('2026-10-04', '17:26:30'); // KST 오후 5시 26분 30초

describe('shiftSpanError — 60초 미만·24시간 초과만 거절', () => {
  it.each([
    ['같은 순간', 0, 'SHIFT_TOO_SHORT'],
    ['59.999초', MIN - 1, 'SHIFT_TOO_SHORT'],
    ['정확히 60초 → 허용', MIN, null],
    ['23시간 59분 → 허용', 24 * H - MIN, null],
    ['정확히 24시간 → 허용(초과만 거절)', 24 * H, null],
    ['24시간 + 1ms', 24 * H + 1, 'SHIFT_OVER_24H'],
    ['24시간 1분', 24 * H + MIN, 'SHIFT_OVER_24H'],
  ])('%s', (_l, d, want) => expect(shiftSpanError(NOW - d, NOW)).toBe(want));
});

describe('shiftStartMs — 서버 _shift_start_at 과 같다', () => {
  it('서버 표지가 있으면 그것', () => expect(shiftStartMs('03:00', NOW - 25 * H, NOW)).toBe(NOW - 25 * H));
  it('표지 없으면 지금 이전 24시간 안의 가장 가까운 그 HH:mm(오늘 17:00)', () => expect(shiftStartMs('17:00', null, NOW)).toBe(at('2026-10-04', '17:00:00')));
  it('지금보다 늦은 HH:mm 은 어제(어제 18:00)', () => expect(shiftStartMs('18:00', null, NOW)).toBe(at('2026-10-03', '18:00:00')));
  it('같은 분이면 이번 분의 0초(30초 전)', () => expect(NOW - shiftStartMs('17:26', null, NOW)).toBe(30_000));
});

describe('selfShiftWriteError — 내 출근 관리 쓰기(set_my_shift_time 과 같은 판정)', () => {
  it('지금 출근 → 같은 분 지금 퇴근: 거절(R4-01 하네스 입력)', () => {
    expect(selfShiftWriteError({ checkIn: kstHm(NOW), checkInAt: NOW - 5_000 }, 'checkOut', 'now', NOW)).toBe('SHIFT_TOO_SHORT');
    expect(selfShiftWriteError({ checkIn: kstHm(NOW), checkInAt: null }, 'checkOut', 'now', NOW)).toBe('SHIFT_TOO_SHORT');
  });
  it('직접 입력 같은 분(18:00 → 18:00): 거절 — 그대로 두면 급여가 24시간(1440분)으로 계산된다', () => {
    expect(shiftMinutes('2026-10-04', { checkIn: '18:00', checkOut: '18:00' }, DEFAULT_PAY_RULES)?.net).toBe(1440);
    expect(selfShiftWriteError({ checkIn: '18:00' }, 'checkOut', '18:00', NOW)).toBe('SHIFT_TOO_SHORT');
    expect(selfShiftWriteError({ checkOut: '18:00' }, 'checkIn', '18:00', NOW)).toBe('SHIFT_TOO_SHORT');
  });
  it('직접 입력 23시간 59분(18:00 → 17:59): 허용', () => {
    expect(selfShiftWriteError({ checkIn: '18:00' }, 'checkOut', '17:59', NOW)).toBeNull();
    expect(shiftMinutes('2026-10-03', { checkIn: '18:00', checkOut: '17:59' }, DEFAULT_PAY_RULES)?.net).toBe(1439);
  });
  it('1분(17:25 → 지금 17:26:30): 허용', () => expect(selfShiftWriteError({ checkIn: '17:25' }, 'checkOut', 'now', NOW)).toBeNull());
  it('서버 표지 기준 23시간 59분 뒤 지금 퇴근: 허용', () =>
    expect(selfShiftWriteError({ checkIn: kstHm(NOW - 24 * H + MIN), checkInAt: NOW - 24 * H + MIN }, 'checkOut', 'now', NOW)).toBeNull());
  it('서버 표지 기준 24시간 1분 뒤 지금 퇴근: 거절(25시간이 1시간으로 접혀 기록되던 반대 방향 결함)', () =>
    expect(selfShiftWriteError({ checkIn: kstHm(NOW - 24 * H - MIN), checkInAt: NOW - 24 * H - MIN }, 'checkOut', 'now', NOW)).toBe('SHIFT_OVER_24H'));
  it('서버 표지 기준 25시간 뒤라도 실제 퇴근 시각을 직접 넣으면 허용(그 시각은 출근 뒤 24시간 안으로 읽힌다)', () =>
    expect(selfShiftWriteError({ checkIn: kstHm(NOW - 25 * H), checkInAt: NOW - 25 * H }, 'checkOut', '02:00', NOW)).toBeNull());
  it('야간: 어제 22:00 출근(표지 없음) → 오늘 01:30 지금 퇴근: 허용, 3.5시간', () => {
    const now = at('2026-10-04', '01:30:10');
    expect(selfShiftWriteError({ checkIn: '22:00' }, 'checkOut', 'now', now)).toBeNull();
    expect(shiftMinutes('2026-10-03', { checkIn: '22:00', checkOut: kstHm(now) }, DEFAULT_PAY_RULES)?.net).toBe(210);
  });
  it('00:00~01:59 어제 근무: 어제 행에 00:30 출근(표지) → 01:00 지금 퇴근: 허용(하루 앞당기지 않는다)', () => {
    const now = at('2026-10-04', '01:00:00');
    expect(selfShiftWriteError({ checkIn: '00:30', checkInAt: at('2026-10-04', '00:30:00') }, 'checkOut', 'now', now)).toBeNull();
    expect(selfShiftWriteError({ checkIn: '00:30' }, 'checkOut', 'now', now)).toBeNull();
  });
  it('지금 출근: 퇴근이 같은 분이면 거절, 다르면 허용 · 퇴근이 없으면 허용', () => {
    expect(selfShiftWriteError({ checkOut: kstHm(NOW) }, 'checkIn', 'now', NOW)).toBe('SHIFT_TOO_SHORT');
    expect(selfShiftWriteError({ checkOut: '03:00' }, 'checkIn', 'now', NOW)).toBeNull();
    expect(selfShiftWriteError({}, 'checkIn', 'now', NOW)).toBeNull();
  });
  it('비우기·출근 없는 퇴근은 규칙 밖(기존 동작)', () => {
    expect(selfShiftWriteError({ checkIn: '18:00', checkOut: '18:00' }, 'checkOut', null, NOW)).toBeNull();
    expect(selfShiftWriteError({}, 'checkOut', 'now', NOW)).toBeNull();
  });
});
