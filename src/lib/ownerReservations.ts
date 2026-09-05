// 업주 예약 명단 패널(게임관리·일정 상세)의 판정 규칙 2개.
// 컴포넌트 파일에 두면 react-refresh 가 막고, 무엇보다 이 둘은 화면 없이 검증할 수 있는 규칙이라 여기 둔다.

/** '✓ 방문' 표시 근거 — 서버 RPC(schedule_reservations_for_owner)가
 *  **계정(user_id) + 그 매장 + 그 일정 날짜(KST)** 로 판정한 값만 쓴다(일정 상세와 같은 정본).
 *  ⚠ 이름(display_name)으로 넓히지 않는다: schedule_reservations.user_id 는 NOT NULL 이라
 *    이름 OR 는 '계정이 없을 때의 보완'이 아니라 **동명이인을 방문으로 오판**하는 경로였다.
 *  ⚠ '기기 로컬 오늘' 체크인 집합을 모든 날짜 포스터에 적용하지도 않는다(날짜가 다르면 방문이 아니다).
 *  ⚠ 확인 불가(undefined·null)는 '방문 완료'도 '노쇼 확정'도 아니다 — 배지를 붙이지 않을 뿐이다. */
export function isVisited(r: { visited?: boolean | null }): boolean {
  return r.visited === true;
}

/** 응답 순서 가드 — 마지막에 시작한 요청의 응답만 통과시킨다.
 *  날짜 칩 A→B 연타에서 A 의 늦은 응답이 B 명단을 덮으면 그 인원 수가 곧
 *  **되돌릴 수 없는 삭제 확인창**의 근거가 된다(9/10 '0명'을 보고 9/5 를 지우는 사고).
 *  같은 취지의 인라인 가드가 AvailabilityField(reqIdRef)·NuriPosLedger(reloadSeq)에도 있다. */
export function createReqGuard(): { start: () => number; accept: (token: number) => boolean } {
  let latest = 0;
  return { start: () => ++latest, accept: (token: number) => token === latest };
}
