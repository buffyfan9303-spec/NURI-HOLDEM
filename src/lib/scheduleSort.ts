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

/**
 * '가까운 순' 비교 — **좌표를 아는 매장이 먼저, 위치 미상은 뒤로.**
 *
 * ⚠ 과거 회귀(N08): 미상 거리를 `Infinity` 로 두고 `dd = dA - dB` 를 구한 뒤
 * `Number.isFinite(dd)` 일 때만 거리로 비교했다. 그런데 한쪽만 미상이면
 * `Infinity - 100 = Infinity` 라 **유한이 아니어서 거리 비교를 통째로 건너뛰고**
 * 시간순 폴백으로 빠졌다. 그래서 **위치 미상 매장이 코앞의 매장보다 앞에 설 수 있었다.**
 * (2026-09-12 실측: `[미상(이른 시작), 100km]` 를 정렬하면 미상이 첫 자리.)
 *
 * 둘 다 미상이면 `Infinity - Infinity = NaN` 이라 역시 폴백됐다 — 그건 의도한 동작이므로 유지한다.
 * 고친 것은 **한쪽만 미상인 경우**뿐이다.
 *
 * @param distA 거리(km). 좌표를 모르면 `Infinity`(또는 `NaN`·`undefined`).
 */
export function compareByDistanceThenStart<T extends Pick<Schedule, 'date' | 'startTime' | 'isPremium'>>(
  a: T,
  b: T,
  distanceOf: (x: T) => number,
): number {
  const da = distanceOf(a);
  const db = distanceOf(b);
  // 좌표를 아는가 — Infinity·NaN·undefined 는 전부 '미상'으로 본다.
  const ka = Number.isFinite(da);
  const kb = Number.isFinite(db);

  // 한쪽만 미상이면 **아는 쪽이 먼저다.** 여기가 예전에 시간순으로 새던 자리다.
  if (ka !== kb) return ka ? -1 : 1;

  // 둘 다 알면 거리순. 같은 거리면 아래 시간·부스트 계약으로 넘긴다.
  if (ka && kb && da !== db) return da - db;

  // 둘 다 미상이거나 거리가 같다 — 기존 시간·부스트 계약 그대로.
  return compareByStartThenBoost(a, b);
}
