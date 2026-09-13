// src/components/features/gto/gto.deep.types.ts
//
// 2026-09-12: GtoDeepSituation(사람이 손으로 쓴 "T9s 는 약 40% 빈도로 3-Bet 한다" 류 예시 프리셋)을
// 걷어냈다 — 어느 화면에서도 렌더되지 않던 죽은 데이터였고, 그 빈도 숫자는 솔버 산출이 아니라
// 사람이 눈대중으로 적어 넣은 값이었다(spotEvaluate.ts:6-21 이 이미 같은 근거로 지적함).
// 렌더되지 않으니 사용자 체감 기능 손실은 없다 — 남기면 나중에 누가 무심코 화면에 이어붙였을 때
// "GTO 40%" 처럼 보이는 사고가 재발할 자리였다. 자세한 근거는 useDeepGto.ts 상단 주석 참고.
import type { ActionFrequency } from './gto.types';

/** 특정 핸드 대 특정 핸드 에퀴티 (0..1, hero + villain 합 약 1, 무승부는 분배) */
export interface Equity {
  hero: number;
  villain: number;
  /** 무승부 확률 (hero/villain 에는 tie/2 가 이미 포함됨) */
  tie?: number;
}

/** 참고 액션 믹스 결과 — 에퀴티 임계값 휴리스틱 산출이다. 솔버 결과가 아니다(GtoDeepPanel 의
 *  SourceBadge kind="heuristic" 이 화면에서 이 사실을 명시한다). */
export interface GtoResult {
  /** 결과 액션 믹스 (raise = 3-Bet/벳 등) — 근거: useDeepGto.ts 의 actionFromEquity */
  action: ActionFrequency;
  /** 특정 핸드 대 특정 핸드일 때의 에퀴티(몬테카를로) */
  equity?: Equity;
}
