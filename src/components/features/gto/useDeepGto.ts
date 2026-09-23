// src/components/features/gto/useDeepGto.ts
//
// ⚠ actionFromEquity 는 솔버 산출이 아니다 (2026-09-12, §3.4 근거·채점 신뢰성 재확인)
// 아래 구간별 상수(raise/call/fold)는 어느 솔버에서도 나온 적 없는, 사람이 정한 눈금이다
// (spotEvaluate.ts:6-21 이 같은 사실을 NURI SPOT 쪽에서 이미 명시했다). 지우지 않고 남긴 이유는
// 승률·팟오즈 기반 "참고 액션 가이드"가 실사용 기능이기 때문 — 화면이 비면 안 된다는 지시에 따라
// 승률 계산은 그대로 두고, 대신 이 값을 GTO 빈도처럼 보이지 않게 이중으로 막는다:
//   ① GtoDeepPanel.tsx 가 이 결과를 SourceBadge kind="heuristic" 로만 표시한다
//      (gtoContract.test.ts 가 'solver' 배지 등장 자체를 잠그고, useDeepGto.test.ts 가 이 함수를 잠근다)
//   ② 화면 문구가 "참고 액션 가이드"/"GTO 최적 행동이 아니다"를 명시한다(SourceBadge META.heuristic.hint)
// 죽은 데이터였던 GtoDeepSituation(사람이 쓴 "약 40% 빈도로 3-Bet" 예시 프리셋)은 통째로 제거했다 —
// 실제로는 어느 화면에도 렌더되지 않았고(situation/selectSituation 을 쓰는 컴포넌트가 없었다),
// 남겨두면 나중에 실수로 이어붙였을 때 그 예시 숫자가 그대로 "GTO 40%"로 노출될 위험이 있었다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { canonicalizeHand, normalizeFrequency } from './useGtoCalculator';
import { type WeightedCombo, type EquityKind } from './equityEngine';
import { equityAsync, equityVsRangeAsync } from './equityClient';
import { buildFreq, type FreqMap } from '../../../lib/ranges';
import { RANGE_SCENARIOS } from '../../../lib/ranges.data';
import { SUITS, type ActionFrequency, type Card, type Rank, type Suit } from './gto.types';
import type { GtoResult, Equity } from './gto.deep.types';

export type CardTarget = 'hero' | 'villain' | 'board';
export type CardId = string; // 예: 'As'

/** 빌런 입력 모드 — 특정 핸드 2장 or 프리셋 레인지 */
export type VillainMode = 'hand' | 'range';

export function cardId(c: Card): CardId {
  return `${c.rank}${c.suit}`;
}

const SLOT_LIMIT: Record<CardTarget, number> = { hero: 2, villain: 2, board: 5 };
const TARGET_ORDER: CardTarget[] = ['hero', 'villain', 'board'];

/**
 * 히어로 에퀴티(승률) -> 3-Bet/콜/폴드 참고 믹스(정밀 데이터 없는 입력용).
 * **솔버 산출이 아니다** — 승률 구간에 사람이 붙인 임계값 눈금이다. export 는 회귀 테스트 전용.
 */
export function actionFromEquity(eq: number): ActionFrequency {
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
  /** 실시간 에퀴티 (입력 완성 시, 보드 반영). 보드 5장이면 전수계산, 그 밖은 몬테카를로 */
  equity: Equity | null;
  /** 그 값이 **어떻게** 나왔는지. 'no_legal_combinations' 면 equity 는 승률이 아니다 */
  equityKind: EquityKind | undefined;
  /**
   * 빌런 레인지가 내 카드·보드에 **전부 막혀** 계산 자체가 불가능한 상태.
   * 이때 `result` 는 null 이다(없는 근거로 액션을 만들지 않는다) — 화면은 그 이유를 말해 주는 것이 좋다.
   * ⚠ 현재 프리셋 6개로는 도달하지 않는다(히어로 1326조합 전수 확인: 최소 잔여 콤보 191개).
   *    직접 만든 좁은 레인지가 들어올 때를 대비한 안전망이다.
   */
  equityBlocked: boolean;
  /** 에퀴티 계산 중 여부 */
  calculating: boolean;
}

export interface DeepGtoInit { hero?: Card[]; villain?: Card[]; board?: Card[]; }

/**
 * 레인지 모드에서 돌아올 때 보관해 둔 빌런 카드를 되살린다(GTO-MODE-TOGGLE-FLASH 2026-09-23).
 * 레인지 모드에 있는 동안 그 카드가 Hero·보드로 쓰였으면 그 슬롯만 비운다 — 같은 카드 두 장은 계산할 수 없다.
 */
export function restoreVillain(
  saved: readonly (Card | null)[],
  hero: readonly (Card | null)[],
  board: readonly (Card | null)[],
): (Card | null)[] {
  const taken = new Set<CardId>();
  [...hero, ...board].forEach((c) => { if (c) taken.add(cardId(c)); });
  return padSlots(undefined, 2).map((_, i) => {
    const c = saved[i] ?? null;
    return c && !taken.has(cardId(c)) ? c : null;
  });
}

/**
 * 에퀴티 계산의 입력 서명 — **모드가 첫 토막**이다. 결과는 이 서명에 묶여 저장되고,
 * 화면은 지금 서명과 **정확히 같은** 결과만 받는다(`visibleEquity`). 그래서
 * 다른 모드·다른 입력의 에퀴티가 지금 라벨 아래 그려지는 프레임이 구조적으로 없다
 * (수정 전: 레인지로 바꾼 첫 프레임에 특정 핸드 46% 가 'BTN 오픈' 라벨로 그려졌다).
 */
export function equitySignature(
  mode: VillainMode,
  hero: readonly (Card | null)[],
  villain: readonly (Card | null)[],
  board: readonly (Card | null)[],
  rangeId: string,
): string {
  const ids = (cs: readonly (Card | null)[]) => cs.map((c) => (c ? cardId(c) : '-')).join('');
  return [mode, ids(hero), mode === 'range' ? rangeId : ids(villain), ids(board)].join('|');
}

export interface EquityEntry { sig: string; equity: Equity; kind: EquityKind | undefined; }
/** 모드별 마지막 계산 결과 — 모드를 오가도 각자의 값이 남는다(되돌아오면 재계산 없이 즉시). */
export type EquityCache = Partial<Record<VillainMode, EquityEntry>>;

/** 지금 모드·지금 입력의 결과만 돌려준다. 다른 모드의 값은 서명이 달라 절대 나오지 않는다. */
export function visibleEquity(cache: EquityCache, mode: VillainMode, sig: string): EquityEntry | null {
  const e = cache[mode];
  return e && e.sig === sig ? e : null;
}

function padSlots(cards: Card[] | undefined, n: number): (Card | null)[] {
  const out: (Card | null)[] = (cards ?? []).slice(0, n);
  while (out.length < n) out.push(null);
  return out;
}

export function useDeepGto(init?: DeepGtoInit): UseDeepGto {
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

  // 레인지 모드 동안 빌런 카드를 여기 보관한다. 예전엔 그냥 지웠다 — 특정 핸드로 돌아오면
  // 결과 카드가 통째로 언마운트되고(번쩍) 사용자가 넣은 QQ 가 사라졌다(오너 신고 2026-09-23).
  const savedVillainRef = useRef<(Card | null)[]>([null, null]);
  const setVillainMode = useCallback((m: VillainMode) => {
    if (m === villainMode) return; // 같은 모드 재클릭이 보관본을 빈 슬롯으로 덮지 않게
    setVillainModeState(m);
    if (m === 'range') {
      // 레인지 모드에선 빌런 슬롯을 비워 카드 그리드 차단을 없앤다(보관본은 위 ref 에)
      savedVillainRef.current = villain;
      setVillain([null, null]);
      setCurrentTarget((t) => (t === 'villain' ? 'board' : t));
    } else {
      const back = restoreVillain(savedVillainRef.current, hero, board);
      setVillain(back);
      if (back.some((c) => c === null)) setCurrentTarget('villain');
    }
  }, [villainMode, villain, hero, board]);

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
    savedVillainRef.current = [null, null];
    setHero([null, null]);
    setVillain([null, null]);
    setBoard([null, null, null, null, null]);
    setCurrentTarget('hero');
  }, []);

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

  // 실시간 에퀴티: 입력 완성 시 워커로 몬테카를로 계산. 결과는 **입력 서명에 묶여** 모드별로 저장되고,
  // equity·equityKind·calculating 은 모두 그 저장본에서 **파생**한다 — 예전처럼 effect 안에서 setCalculating(true) 로
  // 뒤따라 맞추면 모드를 바꾼 첫 프레임(effect 전)에 이전 모드의 에퀴티가 새 라벨로 그려졌다.
  // 엔진이 값을 **어떻게** 냈는지(kind)도 같이 저장한다. 'no_legal_combinations' 는 "못 냈다" 는 뜻이라
  // hero=0.5 가 승률이 아니라 자리표시자다 — 이걸 버리면 참고 믹스가 그 0.5 를 먹는다.
  const [equityCache, setEquityCache] = useState<EquityCache>({});
  const sig = equitySignature(villainMode, hero, villain, board, villainRange.id);
  const current = inputReady ? visibleEquity(equityCache, villainMode, sig) : null;
  const equity = current?.equity ?? null;
  const equityKind = current?.kind;
  const calculating = inputReady && !current;
  useEffect(() => {
    if (!calculating) return; // 입력 미완성이거나, 이 모드·이 입력의 값이 이미 있다(모드 왕복 = 재계산 없음)
    const h = hero as Card[];
    const v = villain as Card[];
    const b = board.filter((c): c is Card => c !== null);
    // [DS] MO-9C: 몬테카를로 2500회를 워커로 위임(메인스레드 롱태스크 제거). 결과 동일.
    let alive = true;
    (villainMode === 'range'
      ? equityVsRangeAsync([h[0], h[1]], villainRange.combos, b, 2500)
      : equityAsync([h[0], h[1]], [v[0], v[1]], b, 2500)
    ).then((r) => {
      if (!alive) return;
      // kind 를 같이 들고 온다 — 이걸 버리면 '계산 못 함(0.5)' 과 '정말 5:5' 가 구별되지 않아
      // 아래 actionFromEquity 가 근거 없는 믹스를 만든다(엔진만 고쳐서는 여기서 도로 무너진다).
      setEquityCache((c) => ({ ...c, [villainMode]: { sig, kind: r.kind, equity: { hero: r.hero, villain: r.villain, tie: r.tie } } }));
    });
    return () => { alive = false; };
  }, [calculating, sig, hero, villain, board, villainMode, villainRange]);

  const result = useMemo<GtoResult | null>(() => {
    // 입력 완성 시 실시간 에퀴티 기반으로 참고 액션 믹스를 추정 (솔버 아님).
    if (!inputReady) return null;
    // 엔진이 "계산할 수 없었다" 고 말했으면 **아무 액션도 만들지 않는다.**
    // 이 경우 hero 는 0.5 인데 그건 승률이 아니라 자리표시자다 — 넣으면 '콜 50%' 가 나온다.
    if (equityKind === 'no_legal_combinations') return null;
    // 계산이 끝나기 전에는 **아무 액션도 만들지 않는다** — 위 분기와 같은 원칙이다.
    // 예전엔 여기서 { raise: 0.34, call: 0.33, fold: 0.33 } 자리표시자를 돌려줬고, 화면은 그걸 '권장 액션: 레이즈 34%' 로
    // 확정처럼 그렸다가 계산이 끝나면 '콜 50%' 로 뒤집었다(감사 2026-09-19, 데모 AKs vs QQ = 46.3%).
    // 같은 카드 안에서 위(에퀴티)는 '계산 중', 아래(액션)는 '확정' 이던 자리다 — 둘 다 계산 중이어야 한다.
    if (!equity) return null;
    return { action: actionFromEquity(equity.hero), equity };
  }, [inputReady, equity, equityKind]);

  const normalizedAction = useMemo(
    () => (result ? normalizeFrequency(result.action) : null),
    [result],
  );

  return {
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
    equityKind,
    equityBlocked: equityKind === 'no_legal_combinations',
    calculating,
  };
}

export const SLOT_LIMITS = SLOT_LIMIT;
