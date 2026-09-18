// 에퀴티 요청의 **세대**와 **재계산 키** — NuriSpotPanel 의 워커 호출 이펙트가 쓰는 판정만 순수하게 뺀다.
//
// 왜 따로 있는가 (F11, 2026-09-13):
//   ① **무효 전환이 세대를 올리지 않았다.** `if (!canCalc) { setEquity(null); return; }` 가
//      `++reqId.current` 보다 위에 있어, 홀카드를 빼 계산 불가가 된 뒤에 도착한 **이전 응답**이
//      `my !== reqId.current` 가드를 그대로 통과해 승률을 되살렸다.
//      화면은 '분석하지 않았습니다' 라면서 숫자를 함께 띄우고, 홀카드가 빠진 경우는
//      `blocked=false` 라 저장·공유 버튼이 열려 있어 **낡은 heroEquityPct 가 DB 로 들어갔다.**
//   ② **재계산 키가 빌런을 안 봤다.** 이펙트 deps 가 `canonicalSpotKey` 였는데 그 키는
//      "상대는 내 카드를 모른다"는 이유로 **빌런 카드를 의도적으로 제외**한다(spot.ts 주석).
//      그래서 빌런 카드만 바꾸면 이전 빌런 핸드의 승률이 새 핸드의 값으로 남아 그대로 저장·공유됐다.
//      ⚠ 그러므로 `staleResponse.ts` 의 owner 축에 `canonicalSpotKey` 를 쓰는 안은 무효다.
//
// vitest 환경이 `node` 라 패널을 렌더해 검증할 수 없어 판정만 순수 함수로 뺀다(`lib/authGeneration.ts` 선례).

/**
 * 화면에 적을 승률 메타(2026-09-19, 멀티웨이). 숫자만 넘기면 리포트가 **표본인지·누구를 무작위로 뽑았는지**를
 * 말할 수 없다 — 가정을 숨긴 숫자는 이 저장소가 금지하는 것이다.
 */
export interface EquityMeta {
  /** 히어로 몫(0~1) */
  hero: number;
  kind: 'exact' | 'monte_carlo' | 'no_legal_combinations';
  /** 무작위로 채운 상대 카드 장수 */
  unknownCards: number;
  /** 표본 수(전수면 전수 쌍 수) */
  iterations: number;
  /** 겨룬 상대 수(폴드한 상대 제외) */
  villains: number;
}

/** 표본 승률의 95% 구간 반폭(%p) — 정규 근사 1.96·√(p(1−p)/n). 전수면 0. */
export function equityHalfWidthPct(m: Pick<EquityMeta, 'hero' | 'kind' | 'iterations'>): number {
  if (m.kind !== 'monte_carlo' || m.iterations <= 0) return 0;
  const p = Math.min(1, Math.max(0, m.hero));
  return Math.round(1.96 * Math.sqrt((p * (1 - p)) / m.iterations) * 1000) / 10;
}

/** 이펙트가 한 번 돌 때 내려야 할 결정. 어느 쪽이든 **세대는 반드시 오른다**. */
export type EquityPlan =
  | { kind: 'clear'; gen: number }
  | { kind: 'request'; gen: number };

/**
 * 이펙트 1회의 계획.
 *
 * ⚠ `gen` 은 `canCalc` 와 무관하게 올린다 — 무효 전환이야말로 진행 중인 요청을 끊어야 하는 순간이다.
 *   (이걸 `canCalc` 분기 아래로 내리면 F11 ①이 그대로 재발한다.)
 */
export function planEquity(curGen: number, canCalc: boolean): EquityPlan {
  const gen = curGen + 1;
  return canCalc ? { kind: 'request', gen } : { kind: 'clear', gen };
}

/** 요청할 때 찍어 둔 세대의 응답을 **지금** 반영해도 되는가. */
export function canApplyEquity(capturedGen: number, curGen: number): boolean {
  return capturedGen === curGen;
}

/**
 * 에퀴티 재계산 키 — **히어로·빌런·보드 카드**만으로 만든다.
 *
 * 에퀴티는 이 세 가지의 함수다. 포지션·스택·액션은 승률을 바꾸지 않으므로 넣지 않고,
 * 반대로 **빌런은 반드시 들어가야 한다**(canonicalSpotKey 가 빼는 축이다).
 * 카드 자리를 보존한다 — 무늬가 다르면 다른 계산이다.
 */
export function equityCardsKey(hero: readonly string[], villain: readonly string[], board: readonly string[]): string {
  return `${hero.join('')}/${villain.join('')}/${board.join('')}`;
}
