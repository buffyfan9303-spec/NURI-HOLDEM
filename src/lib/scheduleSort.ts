import type { Schedule } from '../api/schedules';

/** browse 목록 기본 정렬 — 날짜+시각이 1차 키, 부스트(isPremium)는 동일 시각 내 tie-break.
 *
 *  ⚠ 과거 회귀(W1-1 SORT-FIX): 부스트를 1차 키로 두면 다음 주 부스트 포스터가
 *  40분 뒤 시작하는 오늘 게임을 이겨 "지금 갈 수 있는 게 뭐지"가 무너진다.
 *  부스트 결제를 열고 나면 매출이 인질이 되어 못 고치므로, 열기 전이 유일한 개입 시점.
 *
 *  e2e first-screen의 해당 케이스는 test.skip(dates.length < 2)로 실데이터에 따라
 *  영구 skip될 수 있어, 이 함수의 vitest(scheduleSort.test.ts)가 유일한 회귀 가드다. */
export function compareByStartThenBoost(
  a: Pick<Schedule, 'date' | 'startTime' | 'isPremium'>,
  b: Pick<Schedule, 'date' | 'startTime' | 'isPremium'>,
): number {
  return (a.date + a.startTime).localeCompare(b.date + b.startTime)
    || Number(b.isPremium) - Number(a.isPremium);
}
