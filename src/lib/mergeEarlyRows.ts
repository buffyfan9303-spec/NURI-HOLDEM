/**
 * UP-06(2026-10-08) — 초기 조회 응답과, 응답보다 **먼저** 실시간 구독·전송 성공으로 들어온 행을 합친다.
 *
 * 재현한 버그: 열리자마자 구독이 새 댓글·메시지를 받아 목록에 붙였는데, 그 뒤에 늦게 온 초기 조회 응답이
 * `setX(fetched)` 로 목록을 통째로 교체해 먼저 받은 행이 사라졌다(닫았다 다시 열어야 보임).
 *
 * 규칙: 조회 결과가 기준이다(겹치는 id 는 조회 행을 쓴다). 조회에 없는 먼저 받은 행은 조회 시점 이후의
 * 새 행이므로 목록의 '최신 쪽' 끝에 남긴다 — 최신이 앞이면 `'front'`, 최신이 뒤(채팅)면 `'back'`.
 */
export function mergeEarlyRows<T extends { id: string }>(
  prev: readonly T[] | null,
  fetched: T[],
  newest: 'front' | 'back',
): T[] {
  if (!prev || prev.length === 0) return fetched;
  const ids = new Set(fetched.map((r) => r.id));
  const early = prev.filter((r) => !ids.has(r.id));
  if (early.length === 0) return fetched;
  return newest === 'front' ? [...early, ...fetched] : [...fetched, ...early];
}
