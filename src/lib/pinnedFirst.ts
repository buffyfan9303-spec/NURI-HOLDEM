// src/lib/pinnedFirst.ts — 관리자 고정 글을 맨 위로. 고정끼리는 pinned_at 최신순, 나머지는 들어온 순서 그대로.
// 순수 함수(입력 배열 불변) — 게시판 정렬 마지막 단계에서 감싼다.
export function pinnedFirst<T extends { pinnedAt?: string | null }>(list: readonly T[]): T[] {
  const pinned = list.filter((p) => !!p.pinnedAt);
  if (pinned.length === 0) return [...list];
  pinned.sort((a, b) => new Date(b.pinnedAt!).getTime() - new Date(a.pinnedAt!).getTime());
  return [...pinned, ...list.filter((p) => !p.pinnedAt)];
}

// 게시판 기본 화면의 최종 목록 순서(오너 결정 2026-09-05): 고정 → HOT → 끌올 → 최신.
// list 는 이미 끌올→최신으로 정렬된 목록, hot 은 HOT 글(최근 6h 조회 상위). HOT 을 앞으로 빼고
// 마지막에 pinnedFirst 로 감싸 고정이 HOT 보다 위에 선다. (광고 첫 칸은 목록 컨테이너가 따로 그린다.)
export function hotFirst<T extends { id: string; pinnedAt?: string | null }>(list: readonly T[], hot: readonly T[]): T[] {
  const hotIds = new Set(hot.map((p) => p.id));
  return pinnedFirst([...hot, ...list.filter((p) => !hotIds.has(p.id))]);
}
