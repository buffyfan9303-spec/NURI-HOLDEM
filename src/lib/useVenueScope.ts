// 매장 전환을 넘어온 늦은 응답을 버리는 공용 지점 (audit-link-1002 L-05·L-06, 2026-10-02).
//
// 왜 한 곳인가: 내 매장 판들은 매장 A→B 전환에 다시 마운트되지 않는다(VenueManageTab 의 keep-alive — 의도된 설계).
//   그래서 `getX(venueId).then(setX)` 하나하나가 '요청할 때 매장 = 지금 매장' 을 따로 확인해야 했고,
//   판마다 제각각 막다(D3 클락 alive · N04 이용권 · reqKey …) 이번에 또 6곳이 빠져 있었다
//   (프리셋 목록 2 · 장부 직전 설정 · 취소 비밀번호 2 · 클락 시드/프리셋 2). 같은 확인을 이 훅 하나로 모은다.
//
// 계약: `run(fetch, ok, err)` 의 fetch 는 **이 훅이 쥔 지금 매장 id** 를 인자로 받는다 — 호출부 클로저의 옛 venueId 로
//   요청이 나가는 길이 없다(요청 매장 = 스탬프 매장). 응답이 올 때 매장이 바뀌었으면 ok/err 둘 다 부르지 않는다.
//   매장이 바뀌는 순간은 레이아웃 이펙트에서 올린다 — 같은 커밋의 useEffect(새 매장 조회)보다 먼저 돈다.
import { useCallback, useLayoutEffect, useRef } from 'react';
import { bumpScope, scopedLoad, type ScopeRef } from './scopedLoad';

export type VenueRun = <T>(fetch: (venueId: string) => Promise<T>, ok: (v: T) => void, err?: (e: unknown) => void) => void;

export function useVenueScope(venueId: string): VenueRun {
  const ref: ScopeRef = useRef({ seq: 0, owner: venueId });
  useLayoutEffect(() => { if (ref.current.owner !== venueId) bumpScope(ref, venueId); }, [venueId]);
  return useCallback<VenueRun>((fetch, ok, err = () => {}) => {
    const v = ref.current.owner;
    let p: Promise<Parameters<typeof ok>[0]>;
    try { p = fetch(v); } catch (e) { p = Promise.reject(e); }
    scopedLoad(ref, p, ok, err);
  }, []);
}
