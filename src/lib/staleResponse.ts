// 늦게 도착한 비동기 응답이 **지금 화면**에 그려져도 되는가.
//
// 왜 이 파일이 따로 있는가 (N01, 2026-09-12):
//   `await` 뒤의 `setState` 는 "내가 요청할 때의 화면"이 아니라 "응답이 도착한 지금 화면"에 그려진다.
//   그 사이 계정이 바뀌었거나(로그아웃→다른 로그인) 대상이 바뀌었으면(다른 게임·다른 글)
//   **남의 데이터가 내 화면에 보인다.** 실측된 경로:
//     · 캘린더 찜·예약·뱅크롤 조회가 A 로 나갔는데 B 로그인 뒤 도착
//     · 알림 Realtime 재조회와 읽음 처리 실패 재조회(둘 다 가드가 없었다)
//   서버는 각자 제 데이터만 주므로 RLS 우회가 아니다 — **클라이언트 표시 격리** 문제다.
//   그래도 남의 예약·알림이 화면에 뜨는 것 자체가 사고다.
//
// 같은 함정이 C04(게임 전환)·V05(이용권 시트)에도 있다. 화면마다 다르게 막지 말고 이 계약 하나를 쓴다.

/** 요청을 낼 때 찍어 두는 표. `owner` 는 '누구/무엇에 대한 요청인가'(uid · gameSeq · postId …). */
export interface RequestStamp<Owner = string | null> {
  /** 요청 일련번호. 새 요청이 나가거나 대상이 바뀌면 올린다. */
  seq: number;
  owner: Owner;
}

/**
 * 지금 이 응답을 화면에 반영해도 되는가.
 *
 * **둘 다** 같아야 한다:
 *  · `seq` — 그 사이 새 요청이 나갔으면 이 응답은 낡은 것이다.
 *  · `owner` — 그 사이 대상이 바뀌었으면 이 응답은 **남의 것**이다.
 *
 * `seq` 만 보면 안 되는 이유: 로그아웃처럼 **새 요청 없이 대상만 사라지는** 경로가 있다.
 * `owner` 만 보면 안 되는 이유: 같은 사람이 빠르게 두 번 새로고침하면 먼저 낸 응답이 나중에 도착할 수 있다.
 */
export function isFreshResponse<Owner>(
  captured: RequestStamp<Owner>,
  current: RequestStamp<Owner>,
): boolean {
  return captured.seq === current.seq && Object.is(captured.owner, current.owner);
}

/** `isFreshResponse` 의 반대 — 호출부에서 `if (isStale(...)) return;` 로 읽히게. */
export function isStaleResponse<Owner>(
  captured: RequestStamp<Owner>,
  current: RequestStamp<Owner>,
): boolean {
  return !isFreshResponse(captured, current);
}
