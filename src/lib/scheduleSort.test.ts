import { describe, expect, it } from 'vitest';
import { compareByStartThenBoost, compareByDistanceThenStart } from './scheduleSort';

const s = (date: string, startTime: string, isPremium = false) => ({ date, startTime, isPremium });

describe('compareByStartThenBoost · 날짜+시각 1차, 부스트는 동시각 tie-break', () => {
  it('40분 뒤 시작하는 오늘 게임이 다음 주 부스트 포스터보다 위다 (핵심 회귀 케이스)', () => {
    const today = s('2026-08-26', '20:00', false);
    const boostedNextWeek = s('2026-09-02', '19:00', true);
    const sorted = [boostedNextWeek, today].sort(compareByStartThenBoost);
    expect(sorted[0]).toBe(today);
  });

  it('같은 날 안에서도 이른 시각이 먼저다. 부스트 무관', () => {
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

  it('자정 경계. 날짜가 다르면 시각 문자열이 커도 이른 날짜가 먼저다', () => {
    const lateTonight = s('2026-08-26', '23:30', false);
    const earlyTomorrowBoosted = s('2026-08-27', '00:30', true);
    expect([earlyTomorrowBoosted, lateTonight].sort(compareByStartThenBoost)[0]).toBe(lateTonight);
  });
});

// ── N08: 위치 미상이 코앞의 매장보다 앞에 서던 것 ─────────────────────────────
//
// 옛 코드는 미상 거리를 Infinity 로 두고 `dd = dA - dB` 를 구한 뒤
// `Number.isFinite(dd)` 일 때만 거리로 비교했다. 한쪽만 미상이면
// `Infinity - 100 = Infinity` 라 유한이 아니어서 **거리 비교를 통째로 건너뛰고**
// 시간순 폴백으로 빠졌다 — 그래서 위치 미상 매장이 근거리 매장보다 앞에 설 수 있었다.
describe('compareByDistanceThenStart · 좌표를 아는 매장이 먼저다 (N08)', () => {
  const d = (date: string, startTime: string, km: number, isPremium = false) =>
    ({ date, startTime, isPremium, km });
  const distOf = (x: { km: number }) => x.km;
  const sortBy = <T extends { km: number; date: string; startTime: string; isPremium: boolean }>(xs: T[]) =>
    [...xs].sort((a, b) => compareByDistanceThenStart(a, b, distOf));

  it('🔴 위치 미상은 100km 매장보다도 뒤다 — 시작 시각이 아무리 일러도', () => {
    const unknownEarly = d('2026-08-26', '10:00', Infinity);
    const knownFar = d('2026-08-26', '23:00', 100);
    expect(sortBy([unknownEarly, knownFar])[0], '위치 미상이 앞에 섰다').toBe(knownFar);
  });

  it('🔴 세 개 섞여도 좌표 있는 것들이 거리순으로 앞에 모인다', () => {
    const far = d('2026-08-26', '20:00', 100);
    const unknownEarly = d('2026-08-26', '10:00', Infinity);
    const near = d('2026-08-26', '22:00', 3);
    expect(sortBy([far, unknownEarly, near]).map((x) => x.km)).toEqual([3, 100, Infinity]);
  });

  it('둘 다 좌표를 알면 가까운 쪽이 먼저다', () => {
    expect(sortBy([d('2026-08-26', '10:00', 50), d('2026-08-26', '23:00', 5)])[0].km).toBe(5);
  });

  it('둘 다 위치 미상이면 기존 시간·부스트 계약 그대로다', () => {
    const late = d('2026-08-26', '22:00', Infinity);
    const early = d('2026-08-26', '09:00', Infinity);
    expect(sortBy([late, early])[0]).toBe(early);
  });

  it('거리가 같으면 시간·부스트로 가른다 — 거리만 보고 멈추지 않는다', () => {
    const late = d('2026-08-26', '22:00', 7);
    const early = d('2026-08-26', '09:00', 7);
    expect(sortBy([late, early])[0]).toBe(early);
  });

  it('NaN 거리도 미상으로 본다 — 좌표가 깨져도 앞으로 새지 않는다', () => {
    const broken = d('2026-08-26', '09:00', NaN);
    const known = d('2026-08-26', '23:00', 80);
    expect(sortBy([broken, known])[0]).toBe(known);
  });

  it('거리 0(바로 그 매장)은 미상보다 앞이다 — 0 을 falsy 로 흘리지 않는다', () => {
    const here = d('2026-08-26', '23:00', 0);
    const unknown = d('2026-08-26', '09:00', Infinity);
    expect(sortBy([unknown, here])[0]).toBe(here);
  });

  it('반대칭성 — compare(a,b) 와 compare(b,a) 의 부호가 반대다', () => {
    const cases: [number, number][] = [[Infinity, 5], [5, Infinity], [3, 9], [7, 7], [NaN, 1], [Infinity, Infinity]];
    for (const [ka, kb] of cases) {
      const a = d('2026-08-26', '10:00', ka);
      const b = d('2026-08-26', '20:00', kb);
      const ab = compareByDistanceThenStart(a, b, distOf);
      const ba = compareByDistanceThenStart(b, a, distOf);
      expect(Math.sign(ab), `(${ka}, ${kb}) 에서 반대칭이 깨졌다`).toBe(-Math.sign(ba));
    }
  });
});
