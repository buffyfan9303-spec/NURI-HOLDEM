// src/lib/pinnedFirst.ts — 관리자 고정 글을 맨 위로. 고정끼리는 pinned_at 최신순, 나머지는 들어온 순서 그대로.
// 순수 함수(입력 배열 불변) — 게시판 정렬 마지막 단계에서 감싼다.
export function pinnedFirst<T extends { pinnedAt?: string | null }>(list: readonly T[]): T[] {
  const pinned = list.filter((p) => !!p.pinnedAt);
  if (pinned.length === 0) return [...list];
  pinned.sort((a, b) => new Date(b.pinnedAt!).getTime() - new Date(a.pinnedAt!).getTime());
  return [...pinned, ...list.filter((p) => !p.pinnedAt)];
}
