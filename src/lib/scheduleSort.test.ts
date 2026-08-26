import { describe, expect, it } from 'vitest';
import { compareByStartThenBoost } from './scheduleSort';

const s = (date: string, startTime: string, isPremium = false) => ({ date, startTime, isPremium });

describe('compareByStartThenBoost — 날짜+시각 1차, 부스트는 동시각 tie-break', () => {
  it('40분 뒤 시작하는 오늘 게임이 다음 주 부스트 포스터보다 위다 (핵심 회귀 케이스)', () => {
    const today = s('2026-08-26', '20:00', false);
    const boostedNextWeek = s('2026-09-02', '19:00', true);
    const sorted = [boostedNextWeek, today].sort(compareByStartThenBoost);
    expect(sorted[0]).toBe(today);
  });

  it('같은 날 안에서도 이른 시각이 먼저다 — 부스트 무관', () => {
    const early = s('2026-08-26', '18:00', false);
    const lateBoosted = s('2026-08-26', '21:00', true);
    expect([lateBoosted, early].sort(compareByStartThenBoost)[0]).toBe(early);
  });

  it('날짜+시각이 완전히 같을 때만 부스트가 위로 온다', () => {
    const plain = s('2026-08-26', '19:30', false);
    const boosted = s('2026-08-26', '19:30', true);
    expect([plain, boosted].sort(compareByStartThenBoost)[0]).toBe(boosted);
  });

  it('동시각·동부스트는 0 반환(안정 정렬에 위임)', () => {
    expect(compareByStartThenBoost(s('2026-08-26', '19:30'), s('2026-08-26', '19:30'))).toBe(0);
  });

  it('자정 경계 — 날짜가 다르면 시각 문자열이 커도 이른 날짜가 먼저다', () => {
    const lateTonight = s('2026-08-26', '23:30', false);
    const earlyTomorrowBoosted = s('2026-08-27', '00:30', true);
    expect([earlyTomorrowBoosted, lateTonight].sort(compareByStartThenBoost)[0]).toBe(lateTonight);
  });
});
