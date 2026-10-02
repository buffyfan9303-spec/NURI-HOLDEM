// 매장 전환을 넘어온 늦은 응답을 버리는 공용 지점 (audit-link-1002 L-05·L-06, 2026-10-02).
//
// 왜 한 곳인가: 내 매장 판들은 매장 A→B 전환에 다시 마운트되지 않는다(VenueManageTab 의 keep-alive — 의도된 설계).
//   그래서 `getX(venueId).then(setX)` 하나하나가 '요청할 때 매장 = 지금 매장' 을 따로 확인해야 했고,
//   판마다 제각각 막다(D3 클락 alive · N04 이용권 · reqKey …) 이번에 또 6곳이 빠져 있었다
//   (프리셋 목록 2 · 장부 직전 설정 · 취소 비밀번호 2 · 클락 시드/프리셋 2). 같은 확인을 이 훅 하나로 모은다.
//
// 계약: `run(key, fetch, ok, err)` 의 fetch 는 **이 훅이 쥔 지금 매장 id** 를 인자로 받는다 — 호출부 클로저의 옛 venueId 로
//   요청이 나가는 길이 없다(요청 매장 = 스탬프 매장). 응답은 두 축이 모두 맞을 때만 반영한다.
//   ① 매장 축 — 응답이 올 때 매장이 바뀌었으면 버린다. 매장이 바뀌는 순간은 레이아웃 이펙트에서 올린다
//      (같은 커밋의 useEffect(새 매장 조회)보다 먼저 돈다).
//   ② 같은 key 축 — 같은 key 로 더 나중에 낸 요청이 있으면 버린다(review-store-link-1002 1b, 2026-10-02:
//      같은 매장 안에서 날짜·회차·검색어가 바뀌어 다시 조회하면 먼저 낸 늦은 응답이 새 응답을 덮었다 —
//      D1 메인 참가비가 D2 사이드 '메인 설정 복사'에, 회차 S1 게임명이 S2 클락 설정에 붙었다).
//      key 는 '서로 독립인 조회 종류'다(목록·직전 설정·검색 …). 다른 key 끼리는 서로를 무효로 하지 않는다.
//   `run.cancel(key)` 는 새 요청 없이 그 key 의 비행 중 응답만 버린다(조건이 꺼져 조회를 안 낼 때).
import { useLayoutEffect, useMemo, useRef } from 'react';
import { bumpScope, scopedLoad, type ScopeRef } from './scopedLoad';

export interface VenueRun {
  <T>(key: string, fetch: (venueId: string) => Promise<T>, ok: (v: T) => void, err?: (e: unknown) => void): void;
  cancel: (key: string) => void;
}

/** 훅의 몸체 — 테스트가 사본이 아니라 이 함수를 직접 부른다. */
export function createVenueRun(ref: ScopeRef): VenueRun {
  const latest = new Map<string, number>();
  const next = (key: string) => { const n = (latest.get(key) ?? 0) + 1; latest.set(key, n); return n; };
  const run = (<T>(key: string, fetch: (venueId: string) => Promise<T>, ok: (v: T) => void, err: (e: unknown) => void = () => {}) => {
    const n = next(key);
    const mine = () => latest.get(key) === n;
    const v = ref.current.owner;
    let p: Promise<T>;
    try { p = fetch(v); } catch (e) { p = Promise.reject(e); }
    scopedLoad(ref, p, (x) => { if (mine()) ok(x); }, (e) => { if (mine()) err(e); });
  }) as VenueRun;
  run.cancel = (key) => { next(key); };
  return run;
}

export function useVenueScope(venueId: string): VenueRun {
  const ref: ScopeRef = useRef({ seq: 0, owner: venueId });
  useLayoutEffect(() => { if (ref.current.owner !== venueId) bumpScope(ref, venueId); }, [venueId]);
  return useMemo(() => createVenueRun(ref), []);
}
