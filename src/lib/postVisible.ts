// 차단·숨김 판정 단일 출처 — 게시판 첫 페이지(App 이 준 50건)와 서버 이어받기·검색 결과·상세 이전/다음이 같은 함수를 탄다.
// (2026-09-29: 필터가 첫 페이지에만 있어 차단한 사람의 글이 목록 끝·검색에 다시 나왔다. 실시간 한 줄·딜러·그룹·외치기도 같은 부류.)
// 본인 글은 차단 목록에 있어도 가리지 않는다 — 내가 쓴 것이 사라지면 '안 써졌다'로 오해한다(CommentThread 규칙과 같다).
export type IsBlocked = (userId?: string | null) => boolean;

/** 이 작성자의 글·줄을 보여도 되는가(차단 판정만) */
export function isAuthorShown(userId: string | undefined | null, isBlocked: IsBlocked, meId?: string | null): boolean {
  return (!!meId && userId === meId) || !isBlocked(userId);
}

/** 게시글 한 건을 목록에 보여도 되는가 — 차단 + 숨김(blinded: 작성자·운영자만 본다, 서버 RLS 와 같은 식) */
export function isPostVisible(
  p: { userId: string; blinded?: boolean },
  v: { isBlocked: IsBlocked; isAdmin: boolean; meId?: string | null },
): boolean {
  return isAuthorShown(p.userId, v.isBlocked, v.meId) && (!p.blinded || v.isAdmin || p.userId === v.meId);
}
