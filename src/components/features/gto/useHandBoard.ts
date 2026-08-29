// src/components/features/gto/useHandBoard.ts
// 내 핸드 / 상대 핸드 / 보드 카드 입력 상태 — CardGridPicker 와 짝이 되는 최소 훅.
//
// 왜 useDeepGto 를 안 쓰나: 저쪽은 GTO 시나리오·빌런 레인지·전략표까지 물고 있어
// '카드만 받으면 되는' 화면(아웃츠 계산기·핸드 리플레이어)엔 과하다. 카드 id 포맷은
// useDeepGto.cardId 를 그대로 재사용해 CardGridPicker 의 usedIds 계약을 공유한다(새 포맷 0).
//
// 슬롯 규칙: 빈칸은 항상 뒤에 몰린다(중간 구멍 금지). 보드는 순서가 곧 스트리트라
// 가운데 카드를 빼면 뒤가 앞으로 당겨져야 한다 — 구멍이 남으면 '턴이 비었는데 리버가 있는'
// 존재할 수 없는 보드가 만들어진다.
import { useCallback, useMemo, useState } from 'react';
import { RANKS, SUITS, type Card, type Rank, type Suit } from './gto.types';
import { cardId, type CardId } from './useDeepGto';

export type HandTarget = 'hero' | 'villain' | 'board';

/** 'As' → Card. 52장이 아니면 null(깨진 스냅샷·딥링크 방어). */
export function parseCardId(id: string): Card | null {
  if (typeof id !== 'string' || id.length !== 2) return null;
  const rank = id[0] as Rank;
  const suit = id[1] as Suit;
  if (!RANKS.includes(rank) || !SUITS.includes(suit)) return null;
  return { rank, suit };
}

export interface HandBoardInit { hero?: string[]; villain?: string[]; board?: string[] }

export interface UseHandBoard {
  hero: readonly (Card | null)[];
  villain: readonly (Card | null)[];
  board: readonly (Card | null)[];
  target: HandTarget;
  setTarget: (t: HandTarget) => void;
  usedIds: ReadonlySet<CardId>;
  place: (c: Card) => void;
  removeAt: (t: HandTarget, index: number) => void;
  clear: () => void;
  /** 빈 슬롯을 걷어낸 실제 카드(계산 엔진 입력용) */
  heroCards: Card[];
  villainCards: Card[];
  boardCards: Card[];
  /** 'As' 문자열 배열(리플레이 인코딩·스냅샷 저장용) */
  ids: { hero: string[]; villain: string[]; board: string[] };
}

function pad(ids: string[] | undefined, n: number): (Card | null)[] {
  const out: (Card | null)[] = (ids ?? []).map(parseCardId).filter((c): c is Card => c !== null).slice(0, n);
  while (out.length < n) out.push(null);
  return out;
}

/** @param boardSlots 보드 칸 수 — 아웃츠(플랍·턴)는 4, 리플레이(리버까지)는 5 */
export function useHandBoard(boardSlots: number, init?: HandBoardInit): UseHandBoard {
  const [hero, setHero] = useState<(Card | null)[]>(() => pad(init?.hero, 2));
  const [villain, setVillain] = useState<(Card | null)[]>(() => pad(init?.villain, 2));
  const [board, setBoard] = useState<(Card | null)[]>(() => pad(init?.board, boardSlots));
  const [target, setTarget] = useState<HandTarget>(() => {
    if ((init?.hero?.length ?? 0) < 2) return 'hero';
    if ((init?.villain?.length ?? 0) < 2) return 'villain';
    return 'board';
  });

  const usedIds = useMemo(() => {
    const s = new Set<CardId>();
    [...hero, ...villain, ...board].forEach((c) => { if (c) s.add(cardId(c)); });
    return s;
  }, [hero, villain, board]);

  const place = useCallback((c: Card) => {
    if (usedIds.has(cardId(c))) return;
    const arrs: Record<HandTarget, (Card | null)[]> = { hero, villain, board };
    const setters: Record<HandTarget, (v: (Card | null)[]) => void> = { hero: setHero, villain: setVillain, board: setBoard };
    const arr = arrs[target];
    const idx = arr.findIndex((x) => x === null);
    if (idx === -1) return; // 현재 대상이 가득 참 — 사용자가 대상을 바꿔야 한다
    const next = arr.slice();
    next[idx] = c;
    setters[target](next);
    // 다 채웠으면 빈칸이 남은 다음 대상으로 자동 이동(내 핸드 → 상대 핸드 → 보드)
    if (next.every((x) => x !== null)) {
      const after: Record<HandTarget, (Card | null)[]> = { ...arrs, [target]: next };
      const order: HandTarget[] = ['hero', 'villain', 'board'];
      const nextTarget = order.find((t) => t !== target && after[t].some((x) => x === null));
      if (nextTarget) setTarget(nextTarget);
    }
  }, [hero, villain, board, target, usedIds]);

  const removeAt = useCallback((t: HandTarget, index: number) => {
    const setters: Record<HandTarget, (u: (p: (Card | null)[]) => (Card | null)[]) => void> = {
      hero: setHero, villain: setVillain, board: setBoard,
    };
    setters[t]((prev) => {
      // 빼고 뒤를 당긴 뒤 뒤쪽을 null 로 채운다 — 중간 구멍 금지(보드 스트리트 무결성)
      const kept = prev.filter((_, i) => i !== index);
      while (kept.length < prev.length) kept.push(null);
      return kept;
    });
    setTarget(t);
  }, []);

  const clear = useCallback(() => {
    setHero([null, null]);
    setVillain([null, null]);
    setBoard(Array.from({ length: boardSlots }, () => null));
    setTarget('hero');
  }, [boardSlots]);

  const heroCards = useMemo(() => hero.filter((c): c is Card => c !== null), [hero]);
  const villainCards = useMemo(() => villain.filter((c): c is Card => c !== null), [villain]);
  const boardCards = useMemo(() => board.filter((c): c is Card => c !== null), [board]);
  const ids = useMemo(() => ({
    hero: heroCards.map(cardId),
    villain: villainCards.map(cardId),
    board: boardCards.map(cardId),
  }), [heroCards, villainCards, boardCards]);

  return { hero, villain, board, target, setTarget, usedIds, place, removeAt, clear, heroCards, villainCards, boardCards, ids };
}
