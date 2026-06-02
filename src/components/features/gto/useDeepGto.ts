// src/components/features/gto/useDeepGto.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEEP_SITUATIONS } from './gto.deep.data';
import { canonicalizeHand, normalizeFrequency } from './useGtoCalculator';
import { computeEquity } from './equityEngine';
import type { ActionFrequency, Card, Rank, Suit } from './gto.types';
import type { GtoDeepSituation, GtoResult, Equity } from './gto.deep.types';

export type CardTarget = 'hero' | 'villain' | 'board';
export type CardId = string; // 예: 'As'

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
  result: GtoResult | null;
  normalizedAction: Required<ActionFrequency> | null;
  /** 몬테카를로 실시간 에퀴티 (Hero/Villain 완성 시, 보드 반영) */
  equity: Equity | null;
  /** 에퀴티 계산 중 여부 */
  calculating: boolean;
}

export function useDeepGto(): UseDeepGto {
  const situations = DEEP_SITUATIONS;
  const [situationId, setSituationId] = useState<string>(situations[0].id);
  const situation = useMemo(() => situations.find((s) => s.id === situationId) ?? situations[0], [situations, situationId]);

  const [hero, setHero] = useState<(Card | null)[]>(() => [situations[0].heroHand[0], situations[0].heroHand[1]]);
  const [villain, setVillain] = useState<(Card | null)[]>([null, null]);
  const [board, setBoard] = useState<(Card | null)[]>([null, null, null, null, null]);
  const [currentTarget, setCurrentTarget] = useState<CardTarget>('villain');

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

    // 현재 타겟이 다 찼으면 빈 슬롯이 남은 다음 타겟으로 자동 이동
    if (next.every((x) => x !== null)) {
      const after: Record<CardTarget, (Card | null)[]> = { ...arrs, [currentTarget]: next };
      const nextTarget = TARGET_ORDER.find((t) => after[t].some((x) => x === null));
      if (nextTarget) setCurrentTarget(nextTarget);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTarget, hero, villain, board, usedIds]);

  const removeAt = useCallback((t: CardTarget, index: number) => {
    const arrs: Record<CardTarget, (Card | null)[]> = { hero, villain, board };
    const next = arrs[t].slice();
    next[index] = null;
    setters[t](next);
    setCurrentTarget(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero, villain, board]);

  const clearAll = useCallback(() => {
    setHero([situation.heroHand[0], situation.heroHand[1]]);
    setVillain([null, null]);
    setBoard([null, null, null, null, null]);
    setCurrentTarget('villain');
  }, [situation]);

  const selectSituation = useCallback((id: string) => {
    const s = situations.find((x) => x.id === id) ?? situations[0];
    setSituationId(id);
    setHero([s.heroHand[0], s.heroHand[1]]);
    setVillain([null, null]);
    setBoard([null, null, null, null, null]);
    setCurrentTarget('villain');
  }, [situations]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero, villain]);

  const heroComplete = hero.every((x) => x !== null);
  const villainComplete = villain.every((x) => x !== null);

  const villainComboId = useMemo(() => {
    if (!villain[0] || !villain[1]) return null;
    const suited = villain[0].suit === villain[1].suit ? 'suited' : 'offsuit';
    return canonicalizeHand([villain[0].rank, villain[1].rank], suited)?.id ?? null;
  }, [villain]);

  // 실시간 에퀴티: 입력 완성 시 다음 틱에 몬테카를로 계산(탭 반응성 유지) + 계산 중 표시
  const [equity, setEquity] = useState<Equity | null>(null);
  const [calculating, setCalculating] = useState(false);
  useEffect(() => {
    if (!heroComplete || !villainComplete) {
      setEquity(null);
      setCalculating(false);
      return;
    }
    setCalculating(true);
    const h = hero as Card[];
    const v = villain as Card[];
    const b = board.filter((c): c is Card => c !== null);
    const id = setTimeout(() => {
      const r = computeEquity([h[0], h[1]], [v[0], v[1]], b, 2500);
      setEquity({ hero: r.hero, villain: r.villain });
      setCalculating(false);
    }, 0);
    return () => clearTimeout(id);
  }, [hero, villain, board, heroComplete, villainComplete]);

  const result = useMemo<GtoResult | null>(() => {
    if (!villainComplete || !villainComboId) return null;
    // 1) 정밀 데이터(저자 입력)가 있으면 우선 사용
    const authored = situation.villainAdjustments[villainComboId];
    if (authored) return authored;
    // 2) 없으면 실시간 에퀴티 기반으로 액션을 추정 — 모든 입력에서 결과가 변동
    if (!equity) {
      return {
        action: situation.baseline.action,
        baseline: situation.baseline.action,
        heuristic_explanation: situation.baseline.heuristic_explanation,
      };
    }
    const eqPct = Math.round(equity.hero * 100);
    return {
      action: actionFromEquity(equity.hero),
      baseline: situation.baseline.action,
      equity,
      heuristic_explanation:
        `히어로 에퀴티 ${eqPct}% 를 기준으로 추정한 전략입니다. 에퀴티가 높을수록 3-Bet/콜 비중이 커지고, 낮을수록 폴드가 정석입니다.`,
      blockerExplanation:
        `빌런을 ${villainComboId} 로 고정하면 히어로 에퀴티가 ${eqPct}% 가 됩니다. 빌런 카드가 만드는 블로커/언블로커 효과가 에퀴티와 폴드 가능성에 반영되어 기준(레인지) 대비 빈도가 달라집니다.`,
    };
  }, [villainComplete, villainComboId, equity, situation]);

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
    result,
    normalizedAction,
    equity,
    calculating,
  };
}

export const SLOT_LIMITS = SLOT_LIMIT;
