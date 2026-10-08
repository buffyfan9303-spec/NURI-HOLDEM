// 매장 공개 순위 '출석왕' 보드의 원천 선택(UP-13b, 2026-10-08).
//
// checkins 의 RLS 는 `user_id = auth.uid() OR can_manage_venue(venue_id)` 라 일반 회원이 받는 QR 기록은 **자기 것뿐**이다.
// 그 한 줄을 보드로 쓰면 출석한 회원은 자기 혼자 1위인 보드를 보고, 비로그인·미출석 회원은 장부 순위를 본다 — 같은 보드가
// 보는 사람마다 달랐다. 그래서 QR 집계는 **매장을 관리하는 사람만** 쓰고, 나머지는 모두 같은 장부 집계(playerCounts)를 쓴다.
export interface VisitRow { name: string; value: number }

export function visitCountRows(
  checkinRows: { name: string; count: number }[],
  playerCounts: { name: string; visits: number }[],
  viewerIsManager: boolean,
): VisitRow[] {
  const src: VisitRow[] = viewerIsManager && checkinRows.length > 0
    ? checkinRows.map((p) => ({ name: p.name, value: p.count }))
    : playerCounts.map((p) => ({ name: p.name, value: p.visits }));
  return src.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
}
