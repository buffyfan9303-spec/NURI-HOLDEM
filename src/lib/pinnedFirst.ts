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

/**
 * 광고(승격 게시글) 중 **실제로 설 자리가 있는** 개수.
 *
 * 배치 규칙(CommunityTab): ads[0] 은 목록이 비어도 맨 위에 서고(오너 2026-09-05),
 * ads[k](k≥1)는 비광고 목록의 인덱스 `adsEvery*k - 1` 에만 선다 — 비광고 글이 adsEvery*k 개 이상이어야 한다.
 * k 개를 쓰면 비광고 글은 `total - k` 개이므로 조건은 `total - k >= adsEvery*(k-1)`.
 *
 * ⚠ 왜 세어야 하나: 승격된 글은 중복을 피하려고 일반 목록에서 빠진다. 그런데 자리가 없어 광고로도
 *   안 그려지면 그 글은 **화면 어디에도 없다** — 목록에도, 검색에도(같은 목록을 쓴다).
 *   2026-09-11 실측: 글 17개·슬롯 5칸·adsEvery 4 → 1건 소실. 남는 광고는 승격을 포기하고 일반 글로 둔다.
 *
 * @param total 승격 글을 **포함한** 전체 목록 길이
 */
export function usableAdCount(adCount: number, total: number, adsEvery: number): number {
  let k = adCount > 0 ? 1 : 0;
  while (k < adCount && total - (k + 1) >= adsEvery * k) k++;
  return k;
}
