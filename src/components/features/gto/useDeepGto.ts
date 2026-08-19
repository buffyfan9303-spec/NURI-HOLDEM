// src/components/features/gto/useDeepGto.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEEP_SITUATIONS } from './gto.deep.data';
import { canonicalizeHand, normalizeFrequency } from './useGtoCalculator';
import { computeEquity, computeEquityVsRange, type WeightedCombo } from './equityEngine';
import { buildFreq, type FreqMap } from '../../../lib/ranges';
import { RANGE_SCENARIOS } from '../../../lib/ranges.data';
import { SUITS, type ActionFrequency, type Card, type Rank, type Suit } from './gto.types';
import type { GtoDeepSituation, GtoResult, Equity } from './gto.deep.types';

export type CardTarget = 'hero' | 'villain' | 'board';
export type CardId = string; // 예: 'As'

/** 빌런 입력 모드 — 특정 핸드 2장 or 프리셋 레인지 */
export type VillainMode = 'hand' | 'range';

export function cardId(c: Card): CardId {
  return `${c.rank}${c.suit}`;
}

const SLOT_LIMIT: Record<CardTarget, number> = { hero: 2, villain: 2, board: 5 };
const TARGET_ORDER: CardTarget[] = ['hero', 'villain', 'board'];

/** 히어로 에퀴티(승률) -> 3-Bet/콜/폴드 추정 믹스 (정밀 데이터 없는 입력용) */
function actionFromEquity(eq: number): ActionFrequency {
  if (eq >= 0.62) return { raise: 0.85, call: 0.13, fold: 0.02 };
  if (eq >= 0.52) return { raise: 0.50, call: 0.45, fold: 0.05 };
  if (eq >= 0.45) return { raise: 0.20, call: 0.50, fold: 0.30 };
  if (eq >= 0.38) return { raise: 0.10, call: 0.30, fold: 0.60 };
  return { raise: 0.03, call: 0.05, fold: 0.92 };
}

// ── 레인지 프리셋 ────────────────────────────────────────────────
// FreqMap(핸드 이름 → 빈도) → WeightedCombo[](실제 카드 2장 조합) 전개.
// hero/보드 카드와의 충돌 제거는 엔진(prepareCombos)이 담당한다.
export function expandFreqToCombos(freq: FreqMap): WeightedCombo[] {
  const out: WeightedCombo[] = [];
  for (const [name, f] of freq) {
    if (f <= 0) continue;
    const hi = name[0] as Rank;
    const lo = name[1] as Rank;
    const suited = name.length === 3 && name[2] === 's';
    if (hi === lo) {
      // 페어: 무늬 조합 6개
      for (let i = 0; i < 4; i += 1)
        for (let j = i + 1; j < 4; j += 1)
          out.push({ cards: [{ rank: hi, suit: SUITS[i] }, { rank: lo, suit: SUITS[j] }], weight: f });
    } else if (suited) {
      // 수딧: 같은 무늬 4개
      for (const s of SUITS) out.push({ cards: [{ rank: hi, suit: s }, { rank: lo, suit: s }], weight: f });
    } else {
      // 오프수트: 서로 다른 무늬 12개
      for (const s1 of SUITS)
        for (const s2 of SUITS)
          if (s1 !== s2) out.push({ cards: [{ rank: hi, suit: s1 }, { rank: lo, suit: s2 }], weight: f });
    }
  }
  return out;
}

/** ranges.data 시나리오의 특정 액션 스펙 → WeightedCombo[] */
export function scenarioActionCombos(scenarioId: string, actionKey: 'raise' | 'call'): WeightedCombo[] {
  const sc = RANGE_SCENARIOS.find((s) => s.id === scenarioId);
  const act = sc?.actions.find((a) => a.key === actionKey);
  return act ? expandFreqToCombos(buildFreq(act.spec)) : [];
}

export interface VillainRangePreset {
  id: string;
  label: string;
  combos: WeightedCombo[];
}

/** 빌런 프리셋 레인지 — 100bb 표준 차트(RFI 5종 + BB 수비콜)를 콤보 단위로 전개 */
export const VILLAIN_RANGE_PRESETS: VillainRangePreset[] = [
  { id: 'rfi_lj', label: 'LJ 오픈', combos: scenarioActionCombos('rfi_lj', 'raise') },
  { id: 'rfi_hj', label: 'HJ 오픈', combos: scenarioActionCombos('rfi_hj', 'raise') },
  { id: 'rfi_co', label: 'CO 오픈', combos: scenarioActionCombos('rfi_co', 'raise') },
  { id: 'rfi_btn', label: 'BTN 오픈', combos: scenarioActionCombos('rfi_btn', 'raise') },
  { id: 'rfi_sb', label: 'SB 오픈', combos: scenarioActionCombos('rfi_sb', 'raise') },
  { id: 'bb_call_btn', label: 'BB 수비콜', combos: scenarioActionCombos('bb_vs_btn', 'call') },
];

export interface UseDeepGto {
  situations: readonly GtoDeepSituation[];
  situation: GtoDeepSituation;
  selectSituation: (id: string) => void;
  hero: readonly (Card | null)[];
  villain: readonly (Card | null)[];
  board: readonly (Card | null)[];
  currentTarget: CardTarget;
  setTarget: (t: CardTarget) => void;
  usedIds: ReadonlySet<CardId>;
  placeCard: (c: Card) => void;
  removeAt: (t: CardTarget, index: number) => void;
  clearAll: () => void;
  applyBoardPreset: (cards: { rank: Rank; suit: Suit }[]) => void;
  heroComplete: boolean;
  villainComplete: boolean;
  villainComboId: string | null;
  /** 빌런 입력 모드 — 'hand'(특정 2장) / 'range'(프리셋 레인지) */
  villainMode: VillainMode;
  setVillainMode: (m: VillainMode) => void;
  villainRanges: readonly VillainRangePreset[];
  villainRange: VillainRangePreset;
  selectVillainRange: (id: string) => void;
  result: GtoResult | null;
  normalizedAction: Required<ActionFrequency> | null;
  /** 몬테카를로 실시간 에퀴티 (입력 완성 시, 보드 반영) */
  equity: Equity | null;
  /** 에퀴티 계산 중 여부 */
  calculating: boolean;
}

export interface DeepGtoInit { hero?: Card[]; villain?: Card[]; board?: Card[]; }

function padSlots(cards: Card[] | undefined, n: number): (Card | null)[] {
  const out: (Card | null)[] = (cards ?? []).slice(0, n);
  while (out.length < n) out.push(null);
  return out;
}

export function useDeepGto(init?: DeepGtoInit): UseDeepGto {
  const situations = DEEP_SITUATIONS;
  const [situationId, setSituationId] = useState<string>(situations[0].id);
  const situation = useMemo(() => situations.find((s) => s.id === situationId) ?? situations[0], [situations, situationId]);

  const [hero, setHero] = useState<(Card | null)[]>(() => padSlots(init?.hero, 2));
  const [villain, setVillain] = useState<(Card | null)[]>(() => padSlots(init?.villain, 2));
  const [board, setBoard] = useState<(Card | null)[]>(() => padSlots(init?.board, 5));
  const [currentTarget, setCurrentTarget] = useState<CardTarget>(() => {
    if (!init?.hero || init.hero.length < 2) return 'hero';
    if (!init?.villain || init.villain.length < 2) return 'villain';
    return 'board';
  });

  // 빌런 모드: hand(기존 2장) / range(프리셋 레인지)
  const [villainMode, setVillainModeState] = useState<VillainMode>('hand');
  const [villainRangeId, setVillainRangeId] = useState<string>(VILLAIN_RANGE_PRESETS[3].id); // 기본 BTN 오픈
  const villainRange = useMemo(
    () => VILLAIN_RANGE_PRESETS.find((r) => r.id === villainRangeId) ?? VILLAIN_RANGE_PRESETS[0],
    [villainRangeId],
  );

  const setVillainMode = useCallback((m: VillainMode) => {
    setVillainModeState(m);
    if (m === 'range') {
      // 레인지 모드에선 빌런 슬롯을 비워 카드 그리드 차단을 없앤다
      setVillain([null, null]);
      setCurrentTarget((t) => (t === 'villain' ? 'board' : t));
    } else {
      setCurrentTarget('villain');
    }
  }, []);

  const usedIds = useMemo(() => {
    const s = new Set<CardId>();
    [...hero, ...villain, ...board].forEach((c) => { if (c) s.add(cardId(c)); });
    return s;
  }, [hero, villain, board]);

  const setters: Record<CardTarget, (v: (Card | null)[]) => void> = {
    hero: setHero, villain: setVillain, board: setBoard,
  };

  const placeCard = useCallback((c: Card) => {
    if (usedIds.has(cardId(c))) return;
    const arrs: Record<CardTarget, (Card | null)[]> = { hero, villain, board };
    const arr = arrs[currentTarget];
    const idx = arr.findIndex((x) => x === null);
    if (idx === -1) return; // 현재 타겟이 가득 참

    const next = arr.slice();
    next[idx] = c;
    setters[currentTarget](next);

    // 현재 타겟이 다 찼으면 빈 슬롯이 남은 다음 타겟으로 자동 이동 (레인지 모드에선 villain 건너뜀)
    if (next.every((x) => x !== null)) {
      const after: Record<CardTarget, (Card | null)[]> = { ...arrs, [currentTarget]: next };
      const order = villainMode === 'range' ? TARGET_ORDER.filter((t) => t !== 'villain') : TARGET_ORDER;
      const nextTarget = order.find((t) => after[t].some((x) => x === null));
      if (nextTarget) setCurrentTarget(nextTarget);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTarget, hero, villain, board, usedIds, villainMode]);

  const removeAt = useCallback((t: CardTarget, index: number) => {
    const arrs: Record<CardTarget, (Card | null)[]> = { hero, villain, board };
    const next = arrs[t].slice();
    next[index] = null;
    setters[t](next);
    setCurrentTarget(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero, villain, board]);

  const clearAll = useCallback(() => {
    setHero([null, null]);
    setVillain([null, null]);
    setBoard([null, null, null, null, null]);
    setCurrentTarget('hero');
  }, []);

  const selectSituation = useCallback((id: string) => {
    const s = situations.find((x) => x.id === id) ?? situations[0];
    setSituationId(id);
    setHero([s.heroHand[0], s.heroHand[1]]);
    setVillain([null, null]);
    setBoard([null, null, null, null, null]);
    setCurrentTarget(villainMode === 'range' ? 'board' : 'villain');
  }, [situations, villainMode]);

  // 보드 텍스처 프리셋 빠른 입력(이미 사용 중인 카드는 다른 무늬로 대체, 없으면 건너뜀)
  const applyBoardPreset = useCallback((cards: { rank: Rank; suit: Suit }[]) => {
    const order: Suit[] = ['s', 'h', 'd', 'c'];
    const used = new Set<CardId>();
    [...hero, ...villain].forEach((c) => { if (c) used.add(cardId(c)); });
    const chosen: Card[] = [];
    for (const p of cards) {
      const suits = [p.suit, ...order.filter((s) => s !== p.suit)];
      for (const s of suits) {
        const cand: Card = { rank: p.rank, suit: s };
        if (!used.has(cardId(cand))) { used.add(cardId(cand)); chosen.push(cand); break; }
      }
    }
    const next: (Card | null)[] = [null, null, null, null, null];
    chosen.slice(0, 5).forEach((c, i) => { next[i] = c; });
    setBoard(next);
    setCurrentTarget('board');
  }, [hero, villain]);

  const heroComplete = hero.every((x) => x !== null);
  const villainComplete = villain.every((x) => x !== null);
  // 계산 가능 여부 — 레인지 모드는 hero만 있으면 됨
  const inputReady = heroComplete && (villainMode === 'range' || villainComplete);

  const villainComboId = useMemo(() => {
    if (!villain[0] || !villain[1]) return null;
    const suited = villain[0].suit === villain[1].suit ? 'suited' : 'offsuit';
    return canonicalizeHand([villain[0].rank, villain[1].rank], suited)?.id ?? null;
  }, [villain]);

  // 실시간 에퀴티: 입력 완성 시 다음 틱에 몬테카를로 계산(탭 반응성 유지) + 계산 중 표시
  const [equity, setEquity] = useState<Equity | null>(null);
  const [calculating, setCalculating] = useState(false);
  useEffect(() => {
    if (!inputReady) {
      setEquity(null);
      setCalculating(false);
      return;
    }
    setCalculating(true);
    const h = hero as Card[];
    const v = villain as Card[];
    const b = board.filter((c): c is Card => c !== null);
    const id = setTimeout(() => {
      const r = villainMode === 'range'
        ? computeEquityVsRange([h[0], h[1]], villainRange.combos, b, 2500)
        : computeEquity([h[0], h[1]], [v[0], v[1]], b, 2500);
      setEquity({ hero: r.hero, villain: r.villain, tie: r.tie });
      setCalculating(false);
    }, 0);
    return () => clearTimeout(id);
  }, [hero, villain, board, inputReady, villainMode, villainRange]);

  const result = useMemo<GtoResult | null>(() => {
    // 입력 완성 시 실시간 에퀴티 기반으로 참고 액션 믹스를 추정 (솔버 아님).
    if (!inputReady) return null;
    if (!equity) {
      return { action: { raise: 0.34, call: 0.33, fold: 0.33 }, heuristic_explanation: '' };
    }
    return { action: actionFromEquity(equity.hero), equity, heuristic_explanation: '' };
  }, [inputReady, equity]);

  const normalizedAction = useMemo(
    () => (result ? normalizeFrequency(result.action) : null),
    [result],
  );

  return {
    situations,
    situation,
    selectSituation,
    hero,
    villain,
    board,
    currentTarget,
    setTarget: setCurrentTarget,
    usedIds,
    placeCard,
    removeAt,
    clearAll,
    applyBoardPreset,
    heroComplete,
    villainComplete,
    villainComboId,
    villainMode,
    setVillainMode,
    villainRanges: VILLAIN_RANGE_PRESETS,
    villainRange,
    selectVillainRange: setVillainRangeId,
    result,
    normalizedAction,
    equity,
    calculating,
  };
}

export const SLOT_LIMITS = SLOT_LIMIT;
