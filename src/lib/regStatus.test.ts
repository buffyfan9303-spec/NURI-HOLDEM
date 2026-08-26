import { describe, expect, it } from 'vitest';
import { matchClockSchedule, msToRegClose, buildRegInfoMap } from './regStatus';
import type { ClockState } from '../api/clock';
import type { Schedule } from '../api/schedules';

// 일시정지 클락(running=false)은 effectiveLevel 이 remainingMs 를 그대로 쓰므로 결정적이다.
const L = (minutes: number) => ({ kind: 'level' as const, minutes, sb: 100, bb: 200, ante: 0 });
const B = (minutes: number) => ({ kind: 'break' as const, minutes, sb: 0, bb: 0, ante: 0 });

const clock = (over: Record<string, unknown> = {}): ClockState => ({
  venueId: 'v1', gameSeq: 1, sessionDate: '2026-08-26', title: '데일리 6만',
  config: { title: '데일리 6만', levels: [L(20), L(20), B(10), L(20), L(20)], regCloseLevel: 4 },
  currentIndex: 0, running: false, endsAt: null, remainingMs: 5 * 60_000,
  adjEntries: 0, adjRebuys: 0, adjEarlies: 0, adjAddons: 0, eliminations: 0,
  ...over,
} as unknown as ClockState);

const sched = (over: Record<string, unknown> = {}): Schedule => ({
  id: 's1', venueId: 'v1', date: '2026-08-26', title: '데일리 6만', startTime: '19:00',
  ...over,
} as unknown as Schedule);

describe('msToRegClose — 실효 index/remaining 기준 마감까지 남은 ms', () => {
  it('브레이크를 포함해 마감 레벨 시작까지 누적한다 (L1 잔여5분 + L2 20 + 브레이크 10 + L3 20 = 55분)', () => {
    expect(msToRegClose(clock(), 0, 5 * 60_000)).toBe(55 * 60_000);
  });

  it('마감 레벨에 이미 도달했으면 0 (마감됨)', () => {
    expect(msToRegClose(clock({ currentIndex: 4 }), 4, 10 * 60_000)).toBe(0);
  });

  it('마감 레벨이 구조 밖이면 null (판정 불가)', () => {
    const g = clock({ config: { levels: [L(20), L(20)], regCloseLevel: 10 } });
    expect(msToRegClose(g, 0, 60_000)).toBeNull();
  });
});

describe('matchClockSchedule — 같은 매장·같은 날짜, 여럿이면 제목 일치 우선', () => {
  it('단일 매칭', () => {
    expect(matchClockSchedule(clock(), [sched()])?.id).toBe('s1');
  });

  it('같은 날 2개면 제목이 일치하는 쪽', () => {
    const list = [sched({ id: 'a', title: '사이드 3만' }), sched({ id: 'b', title: '데일리 6만' })];
    expect(matchClockSchedule(clock(), list)?.id).toBe('b');
  });

  it('sessionDate 없는 standalone 클락은 null', () => {
    expect(matchClockSchedule(clock({ sessionDate: null }), [sched()])).toBeNull();
  });
});

describe('buildRegInfoMap — scheduleId → 레지 실측 상태', () => {
  it('일시정지 클락에서 msLeft·running 이 결정적으로 매핑된다', () => {
    const map = buildRegInfoMap([clock()], [sched()], 0);
    expect(map.get('s1')).toEqual({ msLeft: 55 * 60_000, running: false });
  });

  it('클락과 매칭되지 않는 대회는 맵에 없다 (소비처가 추정으로 폴백)', () => {
    const map = buildRegInfoMap([clock()], [sched({ id: 's2', date: '2026-08-27' })], 0);
    expect(map.has('s2')).toBe(false);
  });
});
