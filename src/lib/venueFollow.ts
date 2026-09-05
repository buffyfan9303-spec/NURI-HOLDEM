/**
 * 매장 팔로우 표시 상태의 순수 규칙(F07).
 *
 * VenuePage 안에 두면 단위 테스트가 카카오/네이버 지도 SDK 까지 끌고 와야 해서
 * (naverMap.ts 가 모듈 최상단에서 window 를 읽는다) 판정만 여기로 뺐다.
 * 화면 배선(useVenueFollow)은 VenuePage.tsx 에 그대로 있다.
 */

/** 버튼('팔로잉')과 스탯('팔로워 N')이 같이 보는 값. */
export type FollowView = { following: boolean; count: number };

/**
 * 낙관 토글 — 서버 왕복을 기다리지 않고 버튼과 팔로워 수를 **함께** 움직인다.
 * 여태 버튼만 '팔로잉' 으로 바뀌고 '팔로워 N' 은 그대로여서 방금 누른 결과가 반쪽만 보였다.
 * 정본은 서버 트리거(sync_venue_followers)이고 이 값은 그때까지의 낙관 표시다.
 */
export function followToggle(v: FollowView, next: boolean): FollowView {
  return { following: next, count: Math.max(0, v.count + (next ? 1 : -1)) };
}

/**
 * 늦게 도착한 초기 팔로우 목록 GET 을 병합할지 판정한다.
 * 요청을 띄운 뒤(issuedSeq) 토글·계정 변경이 있었으면(curSeq 가 다름) 응답을 버린다 —
 * 안 버리면 '팔로우 완료' 토스트 직후 버튼이 '팔로우' 로 되돌아간다.
 * 팔로워 수는 이 응답에 없으므로(매장 id 목록만) 건드리지 않는다.
 */
export function followMergeFetch(v: FollowView, issuedSeq: number, curSeq: number, serverFollowing: boolean): FollowView {
  if (issuedSeq !== curSeq) return v;
  return v.following === serverFollowing ? v : { ...v, following: serverFollowing };
}
