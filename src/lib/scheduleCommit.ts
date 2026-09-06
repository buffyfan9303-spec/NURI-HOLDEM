// 일정 목록을 화면·스냅샷에 올려도 되는지 한자리에서 판정한다(F11, 2026-09-05).
//
// 왜 순수 함수로 뽑았나: `schedules` 커밋 지점이 둘(부팅 allSettled · reloadSchedules)인데
// 판정을 호출부에 흩어 두면 새 지점이 생길 때마다 한쪽을 빠뜨린다. 두 판정을 여기 하나로 모은다.
//
// ① 늦게 온 응답. 같은 상태를 부팅 조회·당겨서 새로고침·창 복귀·realtime(700ms 디바운스)·
//    저장 후 재조회·실패 롤백·오류 재시도가 모두 갱신한다. 순서 가드가 없으면 먼저 나간 구값이
//    나중에 도착해 새 값을 덮고 writeSnap 까지 과거로 되돌린다 — 다음 방문의 첫 화면이 구값이 된다.
//    (sameJson 은 '내용이 같으면 참조 유지' 최적화일 뿐 발행 순서를 보지 않는다.)
// ② 유예 중 삭제. 포스터 삭제는 5초 뒤에야 서버로 나간다(undoableDelete — 예약·문의를 CASCADE 로
//    물리 삭제해 되살릴 수 없어서 '안 보내기'가 유일한 실행취소). 그 사이의 재조회는 아직 살아 있는
//    행을 그대로 돌려주므로 방금 지운 포스터가 목록에 되살아난다. 순서 가드로는 안 잡히는
//    '재조회 vs 대기 중 로컬 변이'라 같은 게이트에서 함께 막는다.

/**
 * 서버에서 받은 일정 목록 중 지금 커밋해도 되는 것.
 *
 * @param reqId       이 응답이 속한 요청 번호(발행 시 `++ref.current`)
 * @param latestReqId 마지막으로 발행된 요청 번호(`ref.current`)
 * @param pendingDeleteIds 삭제 유예 중이라 화면에서 이미 사라진 id 들
 * @returns 커밋할 목록 / 늦게 온 응답이면 `null`(= 화면·스냅샷 모두 그대로 둔다)
 */
export function commitSchedules<T extends { id: string }>(
  rows: T[],
  reqId: number,
  latestReqId: number,
  pendingDeleteIds: Iterable<string>,
): T[] | null {
  if (reqId !== latestReqId) return null;
  const pending = new Set(pendingDeleteIds);
  if (pending.size === 0) return rows; // 참조 유지 — 불필요한 새 배열을 만들지 않는다
  return rows.filter((r) => !pending.has(r.id));
}
