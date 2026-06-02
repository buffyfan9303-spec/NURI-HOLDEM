// src/components/features/gto/equityEngine.ts
// 몬테카를로 에퀴티 계산기 (Hero 2장 vs Villain 2장, 보드 0~5장)
import { RANKS, SUITS, type Card } from './gto.types';

const RANK_VALUE: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  const vals = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]; // A..2
  RANKS.forEach((r, i) => { m[r] = vals[i]; });
  return m;
})();

interface NCard { r: number; s: number; }
function toN(c: Card): NCard { return { r: RANK_VALUE[c.rank], s: SUITS.indexOf(c.suit) }; }

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

export interface EquityResult {
  hero: number;
  villain: number;
  tie: number;
  iterations: number;
}

export function computeEquity(
  hero: [Card, Card],
  villain: [Card, Card],
  board: Card[],
  iterations = 2500,
): EquityResult {
  const known = [...hero, ...villain, ...board].map(toN);
  const knownKey = new Set(known.map((c) => c.r * 4 + c.s));

  const deck: NCard[] = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      const c: NCard = { r: RANK_VALUE[r], s: SUITS.indexOf(s) };
      if (!knownKey.has(c.r * 4 + c.s)) deck.push(c);
    }
  }

  const heroN = [toN(hero[0]), toN(hero[1])];
  const villN = [toN(villain[0]), toN(villain[1])];
  const boardN = board.map(toN);
  const need = 5 - boardN.length;

  let hw = 0; let vw = 0; let tie = 0; let total = 0;

  if (need <= 0) {
    const h = best7([...heroN, ...boardN]);
    const v = best7([...villN, ...boardN]);
    if (h > v) hw += 1; else if (v > h) vw += 1; else tie += 1;
    total = 1;
  } else {
    for (let i = 0; i < iterations; i += 1) {
      // 부분 Fisher-Yates: 앞쪽 need 장만 랜덤 추출
      for (let k = 0; k < need; k += 1) {
        const j = k + Math.floor(Math.random() * (deck.length - k));
        const tmp = deck[k]; deck[k] = deck[j]; deck[j] = tmp;
      }
      const full = [...boardN, ...deck.slice(0, need)];
      const h = best7([...heroN, ...full]);
      const v = best7([...villN, ...full]);
      if (h > v) hw += 1; else if (v > h) vw += 1; else tie += 1;
      total += 1;
    }
  }

  return {
    hero: (hw + tie / 2) / total,
    villain: (vw + tie / 2) / total,
    tie: tie / total,
    iterations: total,
  };
}
