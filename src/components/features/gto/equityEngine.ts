// src/components/features/gto/equityEngine.ts
// 에퀴티 계산기 (Hero 2장 vs Villain 2장/레인지, 보드 0~5장)
// - 보드 3장 이상(잔여 ≤2장)은 전수계산, 그 외는 몬테카를로
import { RANKS, SUITS, type Card, type Rank } from './gto.types';

const RANK_VALUE: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  const vals = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]; // A..2
  RANKS.forEach((r, i) => { m[r] = vals[i]; });
  return m;
})();
const VALUE_RANK: Record<number, Rank> = (() => {
  const m: Record<number, Rank> = {};
  const vals = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  RANKS.forEach((r, i) => { m[vals[i]] = r; });
  return m;
})();

interface NCard { r: number; s: number; }
function toN(c: Card): NCard { return { r: RANK_VALUE[c.rank], s: SUITS.indexOf(c.suit) }; }
function toCard(c: NCard): Card { return { rank: VALUE_RANK[c.r], suit: SUITS[c.s] }; }
const keyOf = (c: NCard): number => c.r * 4 + c.s;

// 5장 점수(높을수록 강함). 카테고리*가중 + 타이브레이크(내림차순)
function score5(cs: NCard[]): number {
  const ranks = cs.map((c) => c.r).sort((a, b) => b - a);
  const flush = cs.every((c) => c.s === cs[0].s);
  const distinct = new Set(ranks);

  let straight = false;
  let sHigh = 0;
  if (distinct.size === 5) {
    if (ranks[0] - ranks[4] === 4) { straight = true; sHigh = ranks[0]; }
    else if (ranks[0] === 14 && ranks[1] === 5 && ranks[4] === 2) { straight = true; sHigh = 5; } // 휠 A2345
  }

  const freq = new Map<number, number>();
  ranks.forEach((r) => freq.set(r, (freq.get(r) ?? 0) + 1));
  const groups = [...freq.entries()].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));
  const counts = groups.map((g) => g[1]);
  const groupRanks = groups.map((g) => g[0]);

  let cat: number;
  if (straight && flush) cat = 8;
  else if (counts[0] === 4) cat = 7;
  else if (counts[0] === 3 && counts[1] === 2) cat = 6;
  else if (flush) cat = 5;
  else if (straight) cat = 4;
  else if (counts[0] === 3) cat = 3;
  else if (counts[0] === 2 && counts[1] === 2) cat = 2;
  else if (counts[0] === 2) cat = 1;
  else cat = 0;

  let tb: number[];
  if (cat === 8 || cat === 4) tb = [sHigh];
  else if (cat === 5 || cat === 0) tb = ranks;
  else tb = groupRanks;

  // 타이브레이크는 항상 5칸으로 고정(부족분 0 패딩) → 카테고리가 항상 우선
  const tb5 = tb.slice(0, 5);
  while (tb5.length < 5) tb5.push(0);
  let v = cat;
  for (let i = 0; i < 5; i += 1) v = v * 15 + tb5[i];
  return v;
}

const COMBOS5: number[][] = (() => {
  const res: number[][] = [];
  for (let a = 0; a < 7; a += 1)
    for (let b = a + 1; b < 7; b += 1)
      for (let c = b + 1; c < 7; c += 1)
        for (let d = c + 1; d < 7; d += 1)
          for (let e = d + 1; e < 7; e += 1) res.push([a, b, c, d, e]);
  return res;
})();

function best7(seven: NCard[]): number {
  let best = -1;
  for (const idx of COMBOS5) {
    const s = score5([seven[idx[0]], seven[idx[1]], seven[idx[2]], seven[idx[3]], seven[idx[4]]]);
    if (s > best) best = s;
  }
  return best;
}

/** 지정 키를 제외한 잔여 덱 생성 */
function buildDeck(excludeKeys: ReadonlySet<number>): NCard[] {
  const deck: NCard[] = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      const c: NCard = { r: RANK_VALUE[r], s: SUITS.indexOf(s) };
      if (!excludeKeys.has(keyOf(c))) deck.push(c);
    }
  }
  return deck;
}

export interface EquityResult {
  hero: number;
  villain: number;
  tie: number;
  iterations: number;
}

/** 가중 콤보 — 레인지를 실제 카드 2장 조합으로 전개한 단위 (weight 0..1) */
export interface WeightedCombo {
  cards: [Card, Card];
  weight: number;
}

// 레인지 샘플링용 내부 표현: 숫자 카드 + 키 + 누적가중(이분탐색)
interface NWCombo { a: NCard; b: NCard; ka: number; kb: number; cum: number; }

/** 레인지 전처리 — 차단 카드(hero/보드)와 충돌하는 콤보 사전 제거 + 누적가중 계산 */
function prepareCombos(range: WeightedCombo[], blockedKeys: ReadonlySet<number>): { combos: NWCombo[]; total: number } {
  const combos: NWCombo[] = [];
  let total = 0;
  for (const wc of range) {
    if (wc.weight <= 0) continue;
    const a = toN(wc.cards[0]);
    const b = toN(wc.cards[1]);
    const ka = keyOf(a);
    const kb = keyOf(b);
    if (blockedKeys.has(ka) || blockedKeys.has(kb)) continue;
    total += wc.weight;
    combos.push({ a, b, ka, kb, cum: total });
  }
  return { combos, total };
}

/** 누적가중 이분탐색으로 콤보 1개 가중 랜덤 샘플 */
function sampleCombo(combos: NWCombo[], total: number): NWCombo {
  const r = Math.random() * total;
  let lo = 0;
  let hi = combos.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (combos[mid].cum <= r) lo = mid + 1; else hi = mid;
  }
  return combos[lo];
}

const NEUTRAL: EquityResult = { hero: 0.5, villain: 0.5, tie: 0, iterations: 0 };

export function computeEquity(
  hero: [Card, Card],
  villain: [Card, Card],
  board: Card[],
  iterations = 2500,
): EquityResult {
  const heroN = [toN(hero[0]), toN(hero[1])];
  const villN = [toN(villain[0]), toN(villain[1])];
  const boardN = board.map(toN);
  const knownKey = new Set([...heroN, ...villN, ...boardN].map(keyOf));
  const deck = buildDeck(knownKey);
  const need = 5 - boardN.length;

  let hw = 0; let vw = 0; let tie = 0; let total = 0;

  const judge = (full: NCard[]) => {
    const h = best7([...heroN, ...full]);
    const v = best7([...villN, ...full]);
    if (h > v) hw += 1; else if (v > h) vw += 1; else tie += 1;
    total += 1;
  };

  if (need <= 0) {
    // 리버: 단일 평가 (전수)
    judge(boardN);
  } else if (need === 1) {
    // 턴: 잔여 덱 전 장 루프 (전수)
    for (let i = 0; i < deck.length; i += 1) judge([...boardN, deck[i]]);
  } else if (need === 2) {
    // 플랍: 잔여 2장 전 조합(≈990) 루프 (전수) — 몬테카를로보다 정확하고 충분히 빠름
    for (let i = 0; i < deck.length; i += 1)
      for (let j = i + 1; j < deck.length; j += 1) judge([...boardN, deck[i], deck[j]]);
  } else {
    // 프리플랍/보드 1~2장: 몬테카를로
    for (let i = 0; i < iterations; i += 1) {
      // 부분 Fisher-Yates: 앞쪽 need 장만 랜덤 추출
      for (let k = 0; k < need; k += 1) {
        const j = k + Math.floor(Math.random() * (deck.length - k));
        const tmp = deck[k]; deck[k] = deck[j]; deck[j] = tmp;
      }
      judge([...boardN, ...deck.slice(0, need)]);
    }
  }

  return {
    hero: (hw + tie / 2) / total,
    villain: (vw + tie / 2) / total,
    tie: tie / total,
    iterations: total,
  };
}

/** Hero 특정 핸드 vs 빌런 레인지 — 매 반복 가중 랜덤 콤보 샘플 + 보드 완성 몬테카를로 */
export function computeEquityVsRange(
  hero: [Card, Card],
  villainRange: WeightedCombo[],
  board: Card[],
  iterations = 2500,
): EquityResult {
  const heroN = [toN(hero[0]), toN(hero[1])];
  const boardN = board.map(toN);
  const blocked = new Set([...heroN, ...boardN].map(keyOf));
  const { combos, total: rangeTotal } = prepareCombos(villainRange, blocked);
  if (combos.length === 0 || rangeTotal <= 0) return NEUTRAL; // 레인지가 전부 차단됨

  const deck = buildDeck(blocked); // 빌런 후보 카드는 덱에 남음 → 매 반복 리젝션으로 회피
  const need = 5 - boardN.length;

  let hw = 0; let vw = 0; let tie = 0; let total = 0;
  for (let i = 0; i < iterations; i += 1) {
    const vc = sampleCombo(combos, rangeTotal);
    const full = boardN.slice();
    if (need > 0) {
      const used = new Set<number>([vc.ka, vc.kb]);
      while (full.length < boardN.length + need) {
        const c = deck[Math.floor(Math.random() * deck.length)];
        const k = keyOf(c);
        if (used.has(k)) continue;
        used.add(k);
        full.push(c);
      }
    }
    const h = best7([...heroN, ...full]);
    const v = best7([vc.a, vc.b, ...full]);
    if (h > v) hw += 1; else if (v > h) vw += 1; else tie += 1;
    total += 1;
  }

  return {
    hero: (hw + tie / 2) / total,
    villain: (vw + tie / 2) / total,
    tie: tie / total,
    iterations: total,
  };
}

/** 아웃츠 분석 결과 — 다음 카드(턴 또는 리버)로 hero 가 앞서게/이기게 되는 카드 목록 */
export interface OutsResult {
  /** 'river' = 리버 1장 남음(히트=승리), 'turn' = 턴 1장 남음(히트=역전 우세) */
  next: 'turn' | 'river';
  outs: number;   // 유리 전환 카드 수(클린 아웃)
  total: number;  // 잔여 덱 크기
  prob: number;   // 다음 카드가 아웃일 확률(outs/total)
  cards: Card[];  // 아웃 카드 목록(랭크 내림차순)
}

/**
 * 다음 스트리트 아웃츠 — hero·villain 2장씩 + 보드 3장(플랍)/4장(턴)일 때만.
 *  · 턴(보드 4장): 리버 1장으로 hero 가 이기는(에퀴티>0.5) 클린 아웃.
 *  · 플랍(보드 3장): 턴 1장으로 hero 가 우세(리버 전수 에퀴티>0.5)해지는 카드.
 * computeEquity 를 그대로 재사용(리버=단일평가, 턴=44장 전수) — 값이 흔들리지 않는다.
 */
export function computeOuts(hero: [Card, Card], villain: [Card, Card], board: Card[]): OutsResult | null {
  if (board.length !== 3 && board.length !== 4) return null;
  const known = new Set([...hero, ...villain, ...board].map((c) => keyOf(toN(c))));
  const deck = buildDeck(known);
  const cards: Card[] = [];
  for (const c of deck) {
    const nextCard = toCard(c);
    const eq = computeEquity(hero, villain, [...board, nextCard]);
    if (eq.hero > 0.5) cards.push(nextCard);
  }
  cards.sort((a, b) => (RANK_VALUE[b.rank] - RANK_VALUE[a.rank]) || (SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit)));
  return {
    next: board.length === 4 ? 'river' : 'turn',
    outs: cards.length,
    total: deck.length,
    prob: deck.length ? cards.length / deck.length : 0,
    cards,
  };
}

/** 레인지 vs 레인지 — 양쪽 가중 샘플 + 충돌 시 빌런 리샘플 + 보드 완성 몬테카를로 */
export function computeRangeVsRange(
  heroRange: WeightedCombo[],
  villainRange: WeightedCombo[],
  board: Card[],
  iterations = 2500,
): EquityResult {
  const boardN = board.map(toN);
  const blocked = new Set(boardN.map(keyOf));
  const heroP = prepareCombos(heroRange, blocked);
  const villP = prepareCombos(villainRange, blocked);
  if (heroP.combos.length === 0 || villP.combos.length === 0) return NEUTRAL;

  const deck = buildDeck(blocked);
  const need = 5 - boardN.length;

  let hw = 0; let vw = 0; let tie = 0; let total = 0;
  for (let i = 0; i < iterations; i += 1) {
    const hc = sampleCombo(heroP.combos, heroP.total);
    // 충돌(카드 중복) 시 빌런 리샘플 — 상한을 두고 실패하면 이번 반복은 건너뜀
    let vc = sampleCombo(villP.combos, villP.total);
    let retry = 0;
    while ((vc.ka === hc.ka || vc.ka === hc.kb || vc.kb === hc.ka || vc.kb === hc.kb) && retry < 30) {
      vc = sampleCombo(villP.combos, villP.total);
      retry += 1;
    }
    if (vc.ka === hc.ka || vc.ka === hc.kb || vc.kb === hc.ka || vc.kb === hc.kb) continue;

    const full = boardN.slice();
    if (need > 0) {
      const used = new Set<number>([hc.ka, hc.kb, vc.ka, vc.kb]);
      while (full.length < boardN.length + need) {
        const c = deck[Math.floor(Math.random() * deck.length)];
        const k = keyOf(c);
        if (used.has(k)) continue;
        used.add(k);
        full.push(c);
      }
    }
    const h = best7([hc.a, hc.b, ...full]);
    const v = best7([vc.a, vc.b, ...full]);
    if (h > v) hw += 1; else if (v > h) vw += 1; else tie += 1;
    total += 1;
  }

  if (total === 0) return NEUTRAL;
  return {
    hero: (hw + tie / 2) / total,
    villain: (vw + tie / 2) / total,
    tie: tie / total,
    iterations: total,
  };
}
