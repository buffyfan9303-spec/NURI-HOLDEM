// 2026-10-02 운영 더미 공개 화면 검증에서 나온 두 결함의 회귀 가드.
//  ① PC 우측 '곧 시작' 이 날짜만 걸러 **이미 시작한 대회**도 보였다(BrowseSideRail).
//  ② 매장 페이지의 금일 포스터·진행 예정이 시간순이 아니었다 — 상위 schedules 배열이 부스트→display_order 순이라
//     VenuePage 가 그 순서를 그대로 그렸다(#08, #15→#09, #07→#01).
// 둘 다 순수 함수라 여기서 잰다. 화면 배선은 아래 소스 계약이 잠근다.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { upcomingSoon, venueScheduleList } from './scheduleSort';

interface S { id: string; date: string; startTime: string; isPremium: boolean; approved: boolean; venueId: string }
const mk = (id: string, date: string, startTime: string, over: Partial<S> = {}): S =>
  ({ id, date, startTime, isPremium: false, approved: true, venueId: 'v1', ...over });

// KST 2026-10-02 20:00 — 고정 시각(기기 시간대 무관: startAtMs 가 +09:00 을 박는다)
const NOW = Date.parse('2026-10-02T20:00:00+09:00');

describe('upcomingSoon · 곧 시작 = 지금 이후에 시작하는 것만, 시작 순', () => {
  it('날짜만 오늘이고 이미 시작한 대회는 뺀다 (결함 재현)', () => {
    const started = mk('started', '2026-10-02', '19:00');
    const later = mk('later', '2026-10-02', '21:00');
    expect(upcomingSoon([started, later], NOW, 3).map((s) => s.id)).toEqual(['later']);
  });

  it('정확히 지금 시작하는 대회는 곧 시작이 아니라 진행 중이다', () => {
    expect(upcomingSoon([mk('now', '2026-10-02', '20:00')], NOW, 3)).toEqual([]);
  });

  it('시작 시각 오름차순 — 다음 날 이른 시각보다 오늘 밤이 먼저', () => {
    const tomorrowEarly = mk('t', '2026-10-03', '10:00');
    const tonight = mk('n', '2026-10-02', '23:30');
    const todayLater = mk('l', '2026-10-02', '21:00');
    expect(upcomingSoon([tomorrowEarly, tonight, todayLater], NOW, 3).map((s) => s.id)).toEqual(['l', 'n', 't']);
  });

  it('미승인은 뺀다', () => {
    expect(upcomingSoon([mk('x', '2026-10-02', '21:00', { approved: false })], NOW, 3)).toEqual([]);
  });

  it('max 개까지만', () => {
    const list = ['21:00', '21:30', '22:00', '22:30'].map((t) => mk(t, '2026-10-02', t));
    expect(upcomingSoon(list, NOW, 3)).toHaveLength(3);
  });
});

describe('venueScheduleList · 매장 페이지 목록은 날짜·시작 시각 순', () => {
  it('상위 배열이 시간순이 아니어도(부스트→display_order) 날짜·시각 오름차순으로 낸다', () => {
    const all = [
      mk('late', '2026-10-02', '22:00'),
      mk('early', '2026-10-02', '12:00'),
      mk('mid', '2026-10-02', '19:30'),
      mk('nextDay', '2026-10-03', '10:00'),
      mk('other-venue', '2026-10-02', '11:00', { venueId: 'v2' }),
      mk('pending', '2026-10-02', '11:30', { approved: false }),
    ];
    expect(venueScheduleList(all, 'v1').map((s) => s.id)).toEqual(['early', 'mid', 'late', 'nextDay']);
  });

  it('부스트는 같은 시각 안에서만 앞선다(시간 우선)', () => {
    const all = [mk('boostLate', '2026-10-02', '22:00', { isPremium: true }), mk('plainEarly', '2026-10-02', '12:00')];
    expect(venueScheduleList(all, 'v1').map((s) => s.id)).toEqual(['plainEarly', 'boostLate']);
  });

  it('입력 배열을 바꾸지 않는다(상위 state 를 정렬해 다른 화면 순서를 흔들면 안 된다)', () => {
    const all = [mk('b', '2026-10-02', '22:00'), mk('a', '2026-10-02', '12:00')];
    venueScheduleList(all, 'v1');
    expect(all.map((s) => s.id)).toEqual(['b', 'a']);
  });
});

describe('배선 계약 — 화면이 이 함수를 쓴다', () => {
  const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
  it('BrowseSideRail 은 날짜 비교 대신 upcomingSoon 을 쓴다', () => {
    const s = src('components/features/BrowseSideRail.tsx');
    expect(s).toMatch(/upcomingSoon\(/);
    expect(s).not.toMatch(/s\.date >= today/);
  });
  it('VenuePage 는 매장 일정 목록을 venueScheduleList 로 만든다', () => {
    const s = src('components/features/VenuePage.tsx');
    expect(s).toMatch(/venueScheduleList\(/);
  });
});
