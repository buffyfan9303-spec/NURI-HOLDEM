// 매장 순위 편집기의 저장본 조회 effect 본문 — **대상(매장·날짜)이 바뀐 뒤 도착한 응답을 버린다**.
//
// 왜 따로 있나(F1 잔여 경합, 독립 검증 2026-09-13): RankingEditor 의 조회 effect 에 가드가 없어
//   A 날짜 재시도 응답이 B 날짜로 옮긴 뒤 늦게 도착하면 rows 가 A 명단이 되고, 저장하면
//   save_venue_rankings(B, A 명단) 로 **B 의 저장본이 A 명단으로 교체**됐다(F1 이 막으려던 것과 같은 소실).
//   컴포넌트는 이 함수를 useEffect 안에서 부르고 **반환된 cleanup 을 그대로 반환**한다 — deps 가 바뀌면 React 가 cleanup 을
//   먼저 부르므로 이전 요청은 alive=false 가 되어 성공·실패·finally 모두 무시된다(lib/staleResponse 와 같은 목적, effect 수명 버전).
//   렌더 없이 동작을 검사할 수 있게 React 에 의존하지 않는다(rankingsLoad.test.ts).
import { msgOf } from './dbError';

export interface RankingsLoadArgs<E> {
  fetch: () => Promise<{ entries: E[] }>;
  onLoaded: (entries: E[]) => void;
  onError: (message: string) => void;
  /** 성공·실패 공통 마무리(로딩 해제). 버려진 요청에서는 부르지 않는다 — 진행 중인 새 요청의 로딩을 끄면 안 된다. */
  onSettled: () => void;
  fallback?: string;
}

/** @returns cleanup — useEffect 에서 그대로 반환할 것 */
export function loadRankingsEffect<E>(a: RankingsLoadArgs<E>): () => void {
  let alive = true;
  a.fetch()
    .then(({ entries }) => { if (alive) a.onLoaded(entries); })
    .catch((e: unknown) => { if (alive) a.onError(msgOf(e, a.fallback ?? '저장된 순위를 불러오지 못했습니다')); })
    .finally(() => { if (alive) a.onSettled(); });
  return () => { alive = false; };
}
