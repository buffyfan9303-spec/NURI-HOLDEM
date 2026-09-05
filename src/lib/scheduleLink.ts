// src/lib/scheduleLink.ts
// 알림·내 예약·캘린더에서 "어느 대회 상세를 열 것인가" 판정(순수 함수).
//
// 왜 별도 함수인가: App 의 `schedules` 메모리 목록은 browse/live/my-store/admin 탭에서만
// realtime·복귀 갱신된다. 커뮤니티·캘린더·도구 탭에 머문 사용자에게는 **살아 있는 포스터도
// 목록에 없다** — 그걸 '종료되었거나 내려간 포스터' 로 단정하면 알림이 거짓말을 한다.
// 그래서 판정은 3갈래이고, 가운데 갈래(lookup)가 권한을 지키는 단건 조회로 이어진다.
//
// ⚠ 제목·날짜로 대회를 되찾지 않는다(id 만). 같은 날 동명 대회에서 엉뚱한 카드가 열린다.
export type ScheduleLinkTarget<T> =
  /** 열 수 있다 — 메모리 목록에 있었거나, 단건 조회가 돌려준 그 대회 */
  | { kind: 'open'; schedule: T }
  /** 목록엔 없다 — 단건 조회(getScheduleById)로 확인해야 한다 */
  | { kind: 'lookup'; id: string }
  /** 확인 불가 — id 가 없거나, 단건 조회에도 없다(내려갔거나 승인 전 = 볼 권한 없음) */
  | { kind: 'unavailable' };

/**
 * @param list   현재 메모리에 있는 일정 목록
 * @param id     알림·예약이 가리키는 scheduleId
 * @param fetched 단건 조회 결과. **넘기지 않으면(undefined) 1단계 판정**, 넘기면 최종 판정.
 *                null = 조회했지만 없음/권한 없음. (조회 '실패' 는 여기로 오지 않고 throw 된다)
 */
export function resolveScheduleLink<T extends { id: string }>(
  list: readonly T[],
  id: string | null | undefined,
  fetched?: T | null,
): ScheduleLinkTarget<T> {
  const key = (id ?? '').trim();
  if (!key) return { kind: 'unavailable' };
  if (fetched !== undefined) {
    // 서버가 다른 행을 돌려주는 일은 없지만, id 가 어긋난 응답으로 '엉뚱한 대회'를 열지는 않는다.
    return fetched && fetched.id === key ? { kind: 'open', schedule: fetched } : { kind: 'unavailable' };
  }
  const hit = list.find((s) => s.id === key);
  return hit ? { kind: 'open', schedule: hit } : { kind: 'lookup', id: key };
}
