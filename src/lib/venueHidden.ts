// 매장이 손님에게서 숨겨졌는가 — 서버 venue_is_hidden(status ≠ 'active')과 같은 판정(S-06, 2026-10-01).
// 상태 값이 없으면(옛 행·목) 'active' 로 본다 — rowToVenue 의 기본값과 같다.
export function venueHiddenFromGuests(status: string | null | undefined): boolean {
  return (status ?? 'active') !== 'active';
}
