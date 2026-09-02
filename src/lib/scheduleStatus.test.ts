// 대회 상태 판정 — 예약 차단의 기준선이라, 여기가 틀리면 정상 매출이 막히거나 유령 예약이 쌓인다.
//
// 실제로 있었던 결함: 끝난 대회에도 '예약하기'가 살아 있어 손님은 참가된 줄 알고
// 업주 명단엔 유령 예약이 남았다(라이브 예약 2건이 전부 종료 뒤 생성된 것이었다).
// 반대 방향 사고가 더 위험하다 — 자정을 넘겼다고 레이트 레지 중인 손님의 예약을 막으면 매출이 죽는다.
import { describe, it, expect } from 'vitest';
import { scheduleStatus, startAtMs, TOURNEY_OPEN_HOURS } from './scheduleStatus';

/** KST 기준 시각을 epoch ms 로 — 테스트가 실행 기기 시간대에 영향받지 않게 */
const kst = (iso: string) => Date.parse(`${iso}+09:00`);

describe('startAtMs · 시작 시각 파싱', () => {
  it('HH:MM:SS(DB time 컬럼)도 앞 HH:MM 만 읽는다', () => {
    expect(startAtMs('2026-07-26', '19:30:00')).toBe(kst('2026-07-26T19:30:00'));
  });

  it('시작시각이 비면 19:00 으로 본다(서버 _schedule_ended 의 coalesce 와 같은 값)', () => {
    expect(startAtMs('2026-07-26', null)).toBe(kst('2026-07-26T19:00:00'));
  });

  it('날짜가 깨지면 null. 판정 불가를 명확히 알린다', () => {
    expect(startAtMs('그냥문자열', '19:30')).toBeNull();
  });
});

describe('scheduleStatus · 예정/진행중/종료', () => {
  const D = '2026-07-26';
  const S = '19:30';

  it('시작 전은 upcoming', () => {
    expect(scheduleStatus(D, S, kst('2026-07-26T18:00:00'))).toBe('upcoming');
  });

  it('시작 직후는 live. 예약을 계속 받아야 한다', () => {
    expect(scheduleStatus(D, S, kst('2026-07-26T19:31:00'))).toBe('live');
  });

  it('🔴 자정을 넘겨도 레이트 레지 시간대면 live. 여기서 막으면 정상 매출이 죽는다', () => {
    // 실데이터 대회의 레지 마감이 '16LV 01:44'(익일 새벽)였다
    expect(scheduleStatus(D, S, kst('2026-07-27T01:44:00'))).toBe('live');
    expect(scheduleStatus(D, S, kst('2026-07-27T05:29:00'))).toBe('live');
  });

  it('🔴 시작 + 10시간을 넘기면 ended. 다음날 낮에 지난 포스터로 예약하는 걸 막는다', () => {
    expect(scheduleStatus(D, S, kst('2026-07-27T05:30:00'))).toBe('ended');
    expect(scheduleStatus(D, S, kst('2026-07-27T12:00:00'))).toBe('ended');
  });

  it('한참 지난 대회는 당연히 ended', () => {
    expect(scheduleStatus('2026-06-07', '17:00', kst('2026-07-26T12:00:00'))).toBe('ended');
  });

  it('경계값이 TOURNEY_OPEN_HOURS 와 정확히 일치한다(상수만 바꿔도 동작이 따라오게)', () => {
    const start = startAtMs(D, S)!;
    const edge = start + TOURNEY_OPEN_HOURS * 3_600_000;
    expect(scheduleStatus(D, S, edge - 1)).toBe('live');
    expect(scheduleStatus(D, S, edge)).toBe('ended');
  });

  it('판정 불가(날짜 깨짐)는 upcoming 으로 열어둔다. 화면이 잠그기보다 서버 게이트에 맡긴다', () => {
    expect(scheduleStatus('', '19:30', Date.now())).toBe('upcoming');
  });
});
