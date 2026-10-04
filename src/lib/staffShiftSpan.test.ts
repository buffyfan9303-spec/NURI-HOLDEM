// R4-01 — 근무 1회 길이 규칙(60초 하한 · 24시간 상한) 손계산 경계표.
// R5-01 — 시작 시각은 근무 날짜 + 출근(00:00~01:59 는 다음 날) — 손으로 넣은 출근도 실제 경과를 본다.
// 서버 _shift_span_check · _shift_start_at · set_my_shift_time(20261004f·20261004h)과 같은 식이다. 서버 쪽 대응 줄은
//   C:\Users\buffy\Documents\누리홀덤_영상분석_0930\shift-workdate-1004\20_post.sql 의 S·O·N·W·F 줄.
import { describe, expect, it } from 'vitest';
import { DEFAULT_PAY_RULES, kstHm, selfShiftWriteError, shiftMinutes, shiftSpanError, shiftStartMs } from './staffPay';

const at = (d: string, hms: string) => Date.parse(`${d}T${hms}+09:00`);
const MIN = 60_000, H = 3_600_000;
const NOW = at('2026-10-04', '17:26:30'); // KST 오후 5시 26분 30초
const TODAY = '2026-10-04', YDAY = '2026-10-03';

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

describe('shiftStartMs — 서버 _shift_start_at(20261004h)과 같다', () => {
  it('서버 표지가 있으면 그것', () => expect(shiftStartMs(YDAY, '03:00', NOW - 25 * H, NOW)).toBe(NOW - 25 * H));
  it('표지 없으면 근무 날짜 + 출근(오늘 행 17:00 → 오늘 17:00)', () => expect(shiftStartMs(TODAY, '17:00', null, NOW)).toBe(at(TODAY, '17:00:00')));
  it('어제 행 18:00 → 어제 18:00', () => expect(shiftStartMs(YDAY, '18:00', null, NOW)).toBe(at(YDAY, '18:00:00')));
  it('같은 분이면 이번 분의 0초(30초 전)', () => expect(NOW - shiftStartMs(TODAY, '17:26', null, NOW)).toBe(30_000));
  it('R5-01: 어제 행 16:26 은 어제 16:26(25시간 전) — 옛 해석은 오늘 16:26(1시간 전)으로 읽었다', () =>
    expect(shiftStartMs(YDAY, '16:26', null, NOW)).toBe(at(YDAY, '16:26:00')));
  it('00:00~01:59 는 다음 날: 어제 행 00:30 → 오늘 00:30 · 01:59 → 오늘 01:59 · 02:00 은 그날(어제 02:00)', () => {
    expect(shiftStartMs(YDAY, '00:30', null, NOW)).toBe(at(TODAY, '00:30:00'));
    expect(shiftStartMs(YDAY, '01:59', null, NOW)).toBe(at(TODAY, '01:59:00'));
    expect(shiftStartMs(YDAY, '02:00', null, NOW)).toBe(at(YDAY, '02:00:00'));
  });
  it('지금보다 늦으면 24시간 앞(시작은 미래일 수 없다): 오늘 행 18:00 → 어제 18:00 · 어제 행 00:30 을 00:10 에 → 어제 00:30', () => {
    expect(shiftStartMs(TODAY, '18:00', null, NOW)).toBe(at(YDAY, '18:00:00'));
    expect(shiftStartMs(YDAY, '00:30', null, at(TODAY, '00:10:00'))).toBe(at(YDAY, '00:30:00'));
  });
});

describe('selfShiftWriteError — 내 출근 관리 쓰기(set_my_shift_time 과 같은 판정)', () => {
  it('지금 출근 → 같은 분 지금 퇴근: 거절(R4-01 하네스 입력)', () => {
    expect(selfShiftWriteError({ date: TODAY, checkIn: kstHm(NOW), checkInAt: NOW - 5_000 }, 'checkOut', 'now', NOW)).toBe('SHIFT_TOO_SHORT');
    expect(selfShiftWriteError({ date: TODAY, checkIn: kstHm(NOW), checkInAt: null }, 'checkOut', 'now', NOW)).toBe('SHIFT_TOO_SHORT');
  });
  it('직접 입력 같은 분(18:00 → 18:00): 거절 — 그대로 두면 급여가 24시간(1440분)으로 계산된다', () => {
    expect(shiftMinutes(TODAY, { checkIn: '18:00', checkOut: '18:00' }, DEFAULT_PAY_RULES)?.net).toBe(1440);
    expect(selfShiftWriteError({ date: TODAY, checkIn: '18:00' }, 'checkOut', '18:00', NOW)).toBe('SHIFT_TOO_SHORT');
    expect(selfShiftWriteError({ date: TODAY, checkOut: '18:00' }, 'checkIn', '18:00', NOW)).toBe('SHIFT_TOO_SHORT');
  });
  it('직접 입력 23시간 59분(18:00 → 17:59): 허용', () => {
    expect(selfShiftWriteError({ date: YDAY, checkIn: '18:00' }, 'checkOut', '17:59', NOW)).toBeNull();
    expect(shiftMinutes(YDAY, { checkIn: '18:00', checkOut: '17:59' }, DEFAULT_PAY_RULES)?.net).toBe(1439);
  });
  it('1분(17:25 → 지금 17:26:30): 허용', () => expect(selfShiftWriteError({ date: TODAY, checkIn: '17:25' }, 'checkOut', 'now', NOW)).toBeNull());
  it('서버 표지 기준 23시간 59분 뒤 지금 퇴근: 허용', () =>
    expect(selfShiftWriteError({ date: YDAY, checkIn: kstHm(NOW - 24 * H + MIN), checkInAt: NOW - 24 * H + MIN }, 'checkOut', 'now', NOW)).toBeNull());
  it('서버 표지 기준 24시간 1분 뒤 지금 퇴근: 거절(25시간이 1시간으로 접혀 기록되던 반대 방향 결함)', () =>
    expect(selfShiftWriteError({ date: YDAY, checkIn: kstHm(NOW - 24 * H - MIN), checkInAt: NOW - 24 * H - MIN }, 'checkOut', 'now', NOW)).toBe('SHIFT_OVER_24H'));
  it('서버 표지 기준 25시간 뒤라도 실제 퇴근 시각을 직접 넣으면 허용(그 시각은 출근 뒤 24시간 안으로 읽힌다)', () =>
    expect(selfShiftWriteError({ date: YDAY, checkIn: kstHm(NOW - 25 * H), checkInAt: NOW - 25 * H }, 'checkOut', '02:00', NOW)).toBeNull());
  it('R5-01: 손으로 넣은 출근(표지 없음) 어제 행 25시간 뒤 지금 퇴근: 거절 — 옛 해석은 허용해 1시간으로 기록했다', () => {
    expect(selfShiftWriteError({ date: YDAY, checkIn: kstHm(NOW - 25 * H) }, 'checkOut', 'now', NOW)).toBe('SHIFT_OVER_24H');
    // 같은 행에 실제 퇴근 시각을 직접 넣는 바로잡기는 받는다
    expect(selfShiftWriteError({ date: YDAY, checkIn: kstHm(NOW - 25 * H) }, 'checkOut', kstHm(NOW - 17 * H), NOW)).toBeNull();
  });
  it('R5-01: 손입력 23시간 59분은 허용 · 24시간 1분은 거절', () => {
    expect(selfShiftWriteError({ date: YDAY, checkIn: kstHm(NOW - 24 * H + MIN) }, 'checkOut', 'now', NOW)).toBeNull();
    expect(selfShiftWriteError({ date: YDAY, checkIn: kstHm(NOW - 24 * H - MIN) }, 'checkOut', 'now', NOW)).toBe('SHIFT_OVER_24H');
  });
  it('R5-01: 근무 날짜 경계 — 같은 출근 15:26 이 어제 행이면 26시간(거절), 오늘 행이면 2시간(허용)', () => {
    expect(selfShiftWriteError({ date: YDAY, checkIn: '15:26' }, 'checkOut', 'now', NOW)).toBe('SHIFT_OVER_24H');
    expect(selfShiftWriteError({ date: TODAY, checkIn: '15:26' }, 'checkOut', 'now', NOW)).toBeNull();
  });
  it('야간: 어제 22:00 출근(표지 없음) → 오늘 01:30 지금 퇴근: 허용, 3.5시간', () => {
    const now = at(TODAY, '01:30:10');
    expect(selfShiftWriteError({ date: YDAY, checkIn: '22:00' }, 'checkOut', 'now', now)).toBeNull();
    expect(shiftStartMs(YDAY, '22:00', null, now)).toBe(at(YDAY, '22:00:00'));
    expect(shiftMinutes(YDAY, { checkIn: '22:00', checkOut: kstHm(now) }, DEFAULT_PAY_RULES)?.net).toBe(210);
  });
  it('00:00~01:59 어제 근무: 어제 행에 00:30 출근(표지·손입력) → 01:00 지금 퇴근: 허용(하루 앞당기지 않는다)', () => {
    const now = at(TODAY, '01:00:00');
    expect(selfShiftWriteError({ date: YDAY, checkIn: '00:30', checkInAt: at(TODAY, '00:30:00') }, 'checkOut', 'now', now)).toBeNull();
    expect(selfShiftWriteError({ date: YDAY, checkIn: '00:30' }, 'checkOut', 'now', now)).toBeNull();
    // 같은 행을 다음 날 01:00 에 닫으면 24시간 30분 — 거절
    expect(selfShiftWriteError({ date: YDAY, checkIn: '00:30' }, 'checkOut', 'now', now + 24 * H)).toBe('SHIFT_OVER_24H');
  });
  it('지금 출근: 퇴근이 먼저 적힌 행이면 거절(critical X1·X3) · 퇴근이 없으면 허용', () => {
    expect(selfShiftWriteError({ date: TODAY, checkOut: kstHm(NOW) }, 'checkIn', 'now', NOW)).toBe('SHIFT_OUT_BEFORE_IN');
    expect(selfShiftWriteError({ date: TODAY, checkOut: '03:00' }, 'checkIn', 'now', NOW)).toBe('SHIFT_OUT_BEFORE_IN');
    expect(selfShiftWriteError({ date: TODAY }, 'checkIn', 'now', NOW)).toBeNull();
  });
  it('출근 없는 지금 퇴근은 거절(출근 버튼 punch out 의 P0002 와 같다 — critical X1a)', () => {
    expect(selfShiftWriteError({ date: TODAY }, 'checkOut', 'now', NOW)).toBe('SHIFT_NO_IN');
  });
  it('직접 입력은 바로잡기 경로 — 출근 없는 퇴근칸·퇴근 있는 행의 출근칸은 받는다(같은 분만 거절)', () => {
    expect(selfShiftWriteError({ date: TODAY }, 'checkOut', '18:30', NOW)).toBeNull();
    expect(selfShiftWriteError({ date: TODAY, checkOut: '18:30' }, 'checkIn', '13:30', NOW)).toBeNull();
    expect(selfShiftWriteError({ date: TODAY, checkOut: '18:30' }, 'checkIn', '18:30', NOW)).toBe('SHIFT_TOO_SHORT');
  });
  it('비우기는 규칙 밖(기존 동작)', () => {
    expect(selfShiftWriteError({ date: TODAY, checkIn: '18:00', checkOut: '18:00' }, 'checkOut', null, NOW)).toBeNull();
  });
});
