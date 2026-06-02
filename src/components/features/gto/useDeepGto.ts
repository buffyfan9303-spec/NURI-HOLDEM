// src/components/features/gto/useDeepGto.ts
import { useCallback, useMemo, useState } from 'react';
import { DEEP_SITUATION_9TS_VS_UTG } from './gto.deep.data';
import { canonicalizeHand, normalizeFrequency } from './useGtoCalculator';
import type { ActionFrequency, Card } from './gto.types';
import type { GtoDeepSituation, GtoResult } from './gto.deep.types';

export type CardTarget = 'hero' | 'villain' | 'board';
export type CardId = string; // 예: 'As'

export function cardId(c: Card): CardId {
  return `${c.rank}${c.suit}`;
}

const SLOT_LIMIT: Record<CardTarget, number> = { hero: 2, villain: 2, board: 5 };
const TARGET_ORDER: CardTarget[] = ['hero', 'villain', 'board'];

export interface UseDeepGto {
  situation: GtoDeepSituation;
  hero: readonly (Card | null)[];
  villain: readonly (Card | null)[];
  board: readonly (Card | null)[];
  currentTarget: CardTarget;
  setTarget: (t: CardTarget) => void;
  usedIds: ReadonlySet<CardId>;
  placeCard: (c: Card) => void;
  removeAt: (t: CardTarget, index: number) => void;
  clearAll: () => void;
  heroComplete: boolean;
  villainComplete: boolean;
  villainComboId: string | null;
  result: GtoResult | null;
  normalizedAction: Required<ActionFrequency> | null;
}

export function useDeepGto(): UseDeepGto {
  const situation = DEEP_SITUATION_9TS_VS_UTG;

  const [hero, setHero] = useState<(Card | null)[]>(() => [situation.heroHand[0], situation.heroHand[1]]);
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

  const heroComplete = hero.every((x) => x !== null);
  const villainComplete = villain.every((x) => x !== null);

  const villainComboId = useMemo(() => {
    if (!villain[0] || !villain[1]) return null;
    const suited = villain[0].suit === villain[1].suit ? 'suited' : 'offsuit';
    return canonicalizeHand([villain[0].rank, villain[1].rank], suited)?.id ?? null;
  }, [villain]);

  const result = useMemo<GtoResult | null>(() => {
    if (!villainComboId) return null;
    const found = situation.villainAdjustments[villainComboId];
    if (found) return found;
    return {
      action: situation.baseline.action,
      baseline: situation.baseline.action,
      heuristic_explanation: situation.baseline.heuristic_explanation,
      blockerExplanation: '이 빌런 핸드의 정밀 블로커 데이터는 준비 중입니다. 기준(레인지) 결과를 표시합니다.',
    };
  }, [villainComboId, situation]);

  const normalizedAction = useMemo(
    () => (result ? normalizeFrequency(result.action) : null),
    [result],
  );

  return {
    situation,
    hero,
    villain,
    board,
    currentTarget,
    setTarget: setCurrentTarget,
    usedIds,
    placeCard,
    removeAt,
    clearAll,
    heroComplete,
    villainComplete,
    villainComboId,
    result,
    normalizedAction,
  };
}

export const SLOT_LIMITS = SLOT_LIMIT;
