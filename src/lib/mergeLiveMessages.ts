// 실시간 한 줄 재조회 병합 — 조회 응답이 오는 사이 실시간으로 받은·내가 보낸 줄(arrivedIds)을 통째 교체로 덮지 않는다.
// 응답이 권위(삭제가 반영된다)이고, 응답에 아직 없는 '도착분'만 앞에 살려 최신순을 지킨다.
export function mergeLiveMessages<T extends { id: string; createdAt: string }>(
  prev: T[], fetched: T[], arrivedIds: ReadonlySet<string>,
): T[] {
  const have = new Set(fetched.map((m) => m.id));
  const kept = prev.filter((m) => arrivedIds.has(m.id) && !have.has(m.id));
  if (kept.length === 0) return fetched;
  return [...kept, ...fetched].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}
