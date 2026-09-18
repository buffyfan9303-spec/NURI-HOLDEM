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
//
// 2026-09-19: 빌런 B~E(`extra`, 0~4명 × 2칸). NURI SPOT 만 쓴다 — 아웃츠·리플레이는 init 에 extra 가
// 없어 [] 이고 화면에도 아무것도 안 그려진다(기존 두 도구 동작 불변).
import { useCallback, useMemo, useState } from 'react';
import { RANKS, SUITS, type Card, type Rank, type Suit } from './gto.types';
import { cardId, type CardId } from './useDeepGto';

/** 'v1'~'v4' = 빌런 B~E 의 슬롯. */
export type HandTarget = 'hero' | 'villain' | 'board' | 'v1' | 'v2' | 'v3' | 'v4';
const EXTRA_TARGETS = ['v1', 'v2', 'v3', 'v4'] as const;
/** 'v3' → 2(extra 배열 인덱스). 그 밖은 null. */
export const extraIndexOf = (t: HandTarget): number | null => {
  const i = (EXTRA_TARGETS as readonly string[]).indexOf(t);
  return i < 0 ? null : i;
};

/** 'As' → Card. 52장이 아니면 null(깨진 스냅샷·딥링크 방어). */
export function parseCardId(id: string): Card | null {
  if (typeof id !== 'string' || id.length !== 2) return null;
  const rank = id[0] as Rank;
  const suit = id[1] as Suit;
  if (!RANKS.includes(rank) || !SUITS.includes(suit)) return null;
  return { rank, suit };
}

export interface HandBoardInit { hero?: string[]; villain?: string[]; board?: string[]; extra?: string[][] }

export interface UseHandBoard {
  hero: readonly (Card | null)[];
  villain: readonly (Card | null)[];
  board: readonly (Card | null)[];
  /** 빌런 B~E 슬롯(각 2칸). 길이 = 상대 수 − 1 */
  extra: readonly (readonly (Card | null)[])[];
  target: HandTarget;
  setTarget: (t: HandTarget) => void;
  usedIds: ReadonlySet<CardId>;
  place: (c: Card) => void;
  removeAt: (t: HandTarget, index: number) => void;
  clear: () => void;
  /**
   * 외부 스팟으로 **통째 교체**. 저장된 스팟을 '다시 열기' 처럼 마운트 뒤에 카드를 갈아끼우는 유일한 길이다.
   *
   * ⚠ 왜 필요한가(F10): `init` 은 `useState` 초기화 함수에서만 소비되므로 마운트 뒤에는 아무 효력이 없다.
   *   진입점이 없으면 '다시 열기' 가 리포트만 바꾸고 카드 그리드는 이전 스팟에 남아,
   *   그 상태로 저장·공유하면 **이전 스팟의 에퀴티가 영구 스냅샷에 박힌다**.
   */
  setAll: (next?: HandBoardInit) => void;
  /** 빌런 B~E 수를 맞춘다 — 늘면 빈 슬롯, 줄면 뒤부터 버린다. 스팟(자리 목록)이 정본이고 슬롯은 따라간다. */
  setExtraCount: (n: number) => void;
  /** 빈 슬롯을 걷어낸 실제 카드(계산 엔진 입력용) */
  heroCards: Card[];
  villainCards: Card[];
  boardCards: Card[];
  extraCards: Card[][];
  /** 'As' 문자열 배열(리플레이 인코딩·스냅샷 저장용) */
  ids: { hero: string[]; villain: string[]; board: string[]; extra: string[][] };
}

function pad(ids: string[] | undefined, n: number): (Card | null)[] {
  const out: (Card | null)[] = (ids ?? []).map(parseCardId).filter((c): c is Card => c !== null).slice(0, n);
  while (out.length < n) out.push(null);
  return out;
}

export interface HandBoardState {
  hero: (Card | null)[];
  villain: (Card | null)[];
  board: (Card | null)[];
  extra: (Card | null)[][];
  target: HandTarget;
}

/**
 * `init` 하나를 슬롯 상태로 펼친다 — **마운트 초기화와 `setAll` 이 같은 규칙을 쓰게** 하는 순수 함수.
 * 두 곳이 각자 계산하면 '다시 열기' 한 스팟만 슬롯 규칙이 어긋난다.
 *
 * vitest 환경이 `node` 라 훅을 렌더해 검증할 수 없어 판정만 순수 함수로 뺀다(`lib/authGeneration.ts` 선례).
 */
export function initialHandBoard(init: HandBoardInit | undefined, boardSlots: number): HandBoardState {
  const extra = (init?.extra ?? []).slice(0, EXTRA_TARGETS.length).map((ids) => pad(ids, 2));
  const firstOpenExtra = extra.findIndex((slots) => slots.some((c) => c === null));
  return {
    hero: pad(init?.hero, 2),
    villain: pad(init?.villain, 2),
    board: pad(init?.board, boardSlots),
    extra,
    target:
      (init?.hero?.length ?? 0) < 2 ? 'hero'
        : (init?.villain?.length ?? 0) < 2 ? 'villain'
          : firstOpenExtra >= 0 ? EXTRA_TARGETS[firstOpenExtra]
            : 'board',
  };
}

const EMPTY_PAIR = (): (Card | null)[] => [null, null];

/** @param boardSlots 보드 칸 수 — 아웃츠(플랍·턴)는 4, 리플레이(리버까지)는 5 */
export function useHandBoard(boardSlots: number, init?: HandBoardInit): UseHandBoard {
  const [hero, setHero] = useState<(Card | null)[]>(() => initialHandBoard(init, boardSlots).hero);
  const [villain, setVillain] = useState<(Card | null)[]>(() => initialHandBoard(init, boardSlots).villain);
  const [board, setBoard] = useState<(Card | null)[]>(() => initialHandBoard(init, boardSlots).board);
  const [extra, setExtra] = useState<(Card | null)[][]>(() => initialHandBoard(init, boardSlots).extra);
  const [target, setTarget] = useState<HandTarget>(() => initialHandBoard(init, boardSlots).target);

  const usedIds = useMemo(() => {
    const s = new Set<CardId>();
    [...hero, ...villain, ...board, ...extra.flat()].forEach((c) => { if (c) s.add(cardId(c)); });
    return s;
  }, [hero, villain, board, extra]);

  /** target → 현재 슬롯 배열. 없는 빌런 슬롯('v3' 인데 extra 가 2개)이면 null. */
  const slotsOf = useCallback((t: HandTarget): (Card | null)[] | null => {
    const i = extraIndexOf(t);
    if (i !== null) return extra[i] ?? null;
    return t === 'hero' ? hero : t === 'villain' ? villain : board;
  }, [hero, villain, board, extra]);

  const setSlots = useCallback((t: HandTarget, next: (Card | null)[]) => {
    const i = extraIndexOf(t);
    if (i !== null) { setExtra((prev) => prev.map((s, k) => (k === i ? next : s))); return; }
    if (t === 'hero') setHero(next); else if (t === 'villain') setVillain(next); else setBoard(next);
  }, []);

  const place = useCallback((c: Card) => {
    if (usedIds.has(cardId(c))) return;
    const arr = slotsOf(target);
    if (!arr) return;
    const idx = arr.findIndex((x) => x === null);
    if (idx === -1) return; // 현재 대상이 가득 참 — 사용자가 대상을 바꿔야 한다
    const next = arr.slice();
    next[idx] = c;
    setSlots(target, next);
    // 다 채웠으면 빈칸이 남은 다음 대상으로 자동 이동(내 핸드 → 상대 A → 상대 B~E → 보드)
    if (next.every((x) => x !== null)) {
      const order: HandTarget[] = ['hero', 'villain', ...EXTRA_TARGETS.slice(0, extra.length), 'board'];
      const nextTarget = order.find((t) => t !== target && (slotsOf(t) ?? []).some((x) => x === null));
      if (nextTarget) setTarget(nextTarget);
    }
  }, [target, usedIds, slotsOf, setSlots, extra.length]);

  const removeAt = useCallback((t: HandTarget, index: number) => {
    // 빼고 뒤를 당긴 뒤 뒤쪽을 null 로 채운다 — 중간 구멍 금지(보드 스트리트 무결성)
    const shift = (prev: (Card | null)[]) => {
      const kept = prev.filter((_, i) => i !== index);
      while (kept.length < prev.length) kept.push(null);
      return kept;
    };
    const i = extraIndexOf(t);
    if (i !== null) setExtra((prev) => prev.map((s, k) => (k === i ? shift(s) : s)));
    else if (t === 'hero') setHero(shift);
    else if (t === 'villain') setVillain(shift);
    else setBoard(shift);
    setTarget(t);
  }, []);

  const clear = useCallback(() => {
    setHero(EMPTY_PAIR());
    setVillain(EMPTY_PAIR());
    setBoard(Array.from({ length: boardSlots }, () => null));
    setExtra((prev) => prev.map(() => EMPTY_PAIR()));   // 상대 수는 스팟이 정하므로 칸만 비운다
    setTarget('hero');
  }, [boardSlots]);

  const setAll = useCallback((next?: HandBoardInit) => {
    const s = initialHandBoard(next, boardSlots);
    setHero(s.hero);
    setVillain(s.villain);
    setBoard(s.board);
    setExtra(s.extra);
    setTarget(s.target);
  }, [boardSlots]);

  const setExtraCount = useCallback((n: number) => {
    const count = Math.max(0, Math.min(EXTRA_TARGETS.length, n));
    setExtra((prev) => (prev.length === count ? prev
      : prev.length < count ? [...prev, ...Array.from({ length: count - prev.length }, EMPTY_PAIR)]
        : prev.slice(0, count)));
    // 사라진 빌런을 가리키던 대상은 내 핸드로 돌린다 — 없는 슬롯에 카드를 넣을 수 없다
    setTarget((t) => { const i = extraIndexOf(t); return i !== null && i >= count ? 'hero' : t; });
  }, []);

  const heroCards = useMemo(() => hero.filter((c): c is Card => c !== null), [hero]);
  const villainCards = useMemo(() => villain.filter((c): c is Card => c !== null), [villain]);
  const boardCards = useMemo(() => board.filter((c): c is Card => c !== null), [board]);
  const extraCards = useMemo(() => extra.map((s) => s.filter((c): c is Card => c !== null)), [extra]);
  const ids = useMemo(() => ({
    hero: heroCards.map(cardId),
    villain: villainCards.map(cardId),
    board: boardCards.map(cardId),
    extra: extraCards.map((cs) => cs.map(cardId)),
  }), [heroCards, villainCards, boardCards, extraCards]);

  return {
    hero, villain, board, extra, target, setTarget, usedIds, place, removeAt, clear, setAll, setExtraCount,
    heroCards, villainCards, boardCards, extraCards, ids,
  };
}
