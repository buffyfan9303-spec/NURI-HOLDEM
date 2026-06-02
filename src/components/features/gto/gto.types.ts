// src/components/features/gto/gto.types.ts
// NURI HOLDEM — GTO 뷰어 도메인 모델 (프리플랍 + 포스트플랍 확장 대비)

export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const;
export type Rank = typeof RANKS[number];

export const SUITS = ['s', 'h', 'd', 'c'] as const;
export type Suit = typeof SUITS[number];

export interface Card {
  rank: Rank;
  suit: Suit;
}

/** 시작 핸드 분류 */
export type ComboKind = 'pair' | 'suited' | 'offsuit';
/** 무늬 조합(서로 다른 두 랭크일 때만 의미 있음) */
export type Suitedness = 'suited' | 'offsuit';

/** 표준 콤보 식별자 (예: 'AKs', 'TT', '72o') */
export type HandComboId = string;

export interface HandCombo {
  id: HandComboId;
  high: Rank;
  low: Rank;
  kind: ComboKind;
  /** 실제 카드 조합 수 — pair=6, suited=4, offsuit=12 (가중 계산용) */
  weight: number;
}

/** 9-max 포지션 */
export type Position = 'UTG' | 'UTG1' | 'MP' | 'LJ' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';

export type PokerActionType = 'fold' | 'call' | 'raise' | 'allin' | 'check' | 'bet';

export interface VillainAction {
  position: Position;
  action: PokerActionType;
  /** 베팅/레이즈 사이즈 (bb) */
  sizingBb?: number;
}

/** 액션 빈도 (각 0..1, 합 ≈ 1). allin 은 숏스택/포스트플랍 확장용 옵션 */
export interface ActionFrequency {
  raise: number;
  call: number;
  fold: number;
  allin?: number;
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

/** 포스트플랍 확장용 보드 텍스처 (프리플랍에선 undefined) */
export interface BoardTexture {
  cards: Card[];
  paired?: boolean;
  monotone?: boolean;
  twoTone?: boolean;
  connected?: boolean;
}

export type GameType = 'cash' | 'mtt' | 'spin';

/** 하나의 GTO 스팟(상황) + 전략표 */
export interface GtoScenario {
  id: string;
  label: string;
  description?: string;
  street: Street;
  heroPosition: Position;
  /** null = 오픈 상황(RFI, 빌런 액션 없음) */
  villain: VillainAction | null;
  stackDepthBb: number;
  gameType: GameType;
  /** 프리플랍이면 undefined — 포스트플랍 확장 시 사용 */
  board?: BoardTexture;
  /** 콤보ID → 액션 빈도. 표에 없으면 100% 폴드로 간주 */
  strategy: Readonly<Record<HandComboId, ActionFrequency>>;
  source: 'dummy' | 'solver';
}

/** 키패드 입력 상태 (랭크 최대 2개 + 무늬 조합) */
export interface HandSelection {
  ranks: readonly Rank[];
  suitedness: Suitedness;
}

/** 표에 없는 콤보의 기본값 */
export const FOLD_FREQUENCY: ActionFrequency = { raise: 0, call: 0, fold: 1 };
