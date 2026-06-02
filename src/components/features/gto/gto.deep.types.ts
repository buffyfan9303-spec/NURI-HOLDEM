// src/components/features/gto/gto.deep.types.ts
import type { Card, ActionFrequency, Position, GameType, HandComboId, Street } from './gto.types';

/** 특정 핸드 대 특정 핸드 에퀴티 (0..1, hero + villain 합 약 1, 무승부는 분배) */
export interface Equity {
  hero: number;
  villain: number;
  /** 무승부 확률 (hero/villain 에는 tie/2 가 이미 포함됨) */
  tie?: number;
}

/** GTO 결과 한 건 (레인지 기준 또는 빌런 특정 핸드 기준) */
export interface GtoResult {
  /** 결과 액션 믹스 (raise = 3-Bet/벳 등) */
  action: ActionFrequency;
  /** 빌런 고정 전(레인지 대 레인지) 기준 믹스 — 변화량 비교용 */
  baseline?: ActionFrequency;
  /** 특정 핸드 대 특정 핸드일 때의 에퀴티 */
  equity?: Equity;
  /** 핵심 기술 분석 */
  heuristic_explanation: string;
  /** 빌런 카드 고정이 일으킨 빈도 변화 설명 (바텀시트 대안 해설) */
  blockerExplanation?: string;
}

/** Hero/Villain 핸드 + 보드를 직접 지정하는 심화 스팟 */
export interface GtoDeepSituation {
  id: string;
  label: string;
  description?: string;
  street: Street;

  heroPosition: Position;
  villainPosition: Position;
  /** 빌런 오픈 사이즈(bb) */
  villainOpenBb?: number;
  /** 히어로 3-Bet 사이즈(bb) */
  heroRaiseBb?: number;
  stackDepthBb: number;
  gameType: GameType;

  /** 히어로 특정 핸드 2장 */
  heroHand: [Card, Card];
  /** 유저가 직접 지정한 빌런 핸드 2장 (선택적) */
  villainHand?: [Card, Card];
  /** 보드 0~5장 (프리플랍이면 비어 있음/미설정) */
  board?: Card[];

  /** 빌런 미지정(레인지 대 레인지) 기준 결과 */
  baseline: GtoResult;
  /** 빌런 핸드를 특정 콤보로 고정했을 때의 결과: 콤보ID(AA 등) -> 결과 */
  villainAdjustments: Readonly<Record<HandComboId, GtoResult>>;
}
