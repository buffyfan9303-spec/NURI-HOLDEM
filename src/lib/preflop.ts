// src/lib/preflop.ts
// 프리플랍 참고 레인지 공용 로직 — 스타팅핸드 가이드 + 프리플랍 트레이너 공유.
// 169핸드를 Chen 공식으로 점수화→순위→포지션별 상위 % 기준 액션. (정밀 솔버 아님, 참고용.)

export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const;
export const VAL: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };

function chenPoints(v: number): number {
  if (v === 14) return 10;
  if (v === 13) return 8;
  if (v === 12) return 7;
  if (v === 11) return 6;
  return v / 2;
}
export function chenScore(hi: number, lo: number, suited: boolean, pair: boolean): number {
  if (pair) return Math.max(chenPoints(hi) * 2, 5);
  let s = chenPoints(hi);
  if (suited) s += 2;
  const gap = hi - lo - 1;
  s -= gap <= 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && hi < 12) s += 1;
  return Math.round(s);
}

export type Hand = { label: string; score: number };
function buildGrid(): Hand[][] {
  const grid: Hand[][] = [];
  for (let i = 0; i < 13; i++) {
    const row: Hand[] = [];
    for (let j = 0; j < 13; j++) {
      const ri = RANKS[i], rj = RANKS[j], vi = VAL[ri], vj = VAL[rj];
      if (i === j) row.push({ label: ri + rj, score: chenScore(vi, vj, false, true) });
      else if (i < j) row.push({ label: ri + rj + 's', score: chenScore(vi, vj, true, false) });
      else row.push({ label: rj + ri + 'o', score: chenScore(vj, vi, false, false) });
    }
    grid.push(row);
  }
  return grid;
}
export const GRID = buildGrid();
export const RANK_PCT = (() => {
  const flat = GRID.flat().slice().sort((a, b) => b.score - a.score);
  const m = new Map<string, number>();
  flat.forEach((h, idx) => m.set(h.label, idx / flat.length));
  return m;
})();

export type Pos = 'UTG' | 'MP' | 'CO' | 'BTN' | 'SB';
export const POSITIONS: { id: Pos; label: string; pct: number }[] = [
  { id: 'UTG', label: 'UTG', pct: 0.14 },
  { id: 'MP', label: 'MP', pct: 0.19 },
  { id: 'CO', label: 'CO', pct: 0.28 },
  { id: 'BTN', label: 'BTN', pct: 0.46 },
  { id: 'SB', label: 'SB', pct: 0.42 },
];

export type TableSize = '6' | '9';
export type PreAction = 'open' | '3bet';

/** 포지션·테이블·액션별 오픈/3벳 상위 % 임계값. */
export function openPct(pos: Pos, size: TableSize, act: PreAction): number {
  const base = POSITIONS.find((p) => p.id === pos)!.pct;
  return Math.max(0.01, base * (size === '9' ? 0.78 : 1) * (act === '3bet' ? 0.42 : 1));
}

export function action(label: string, pct: number): 'raise' | 'mix' | 'fold' {
  const p = RANK_PCT.get(label) ?? 1;
  if (p < pct) return 'raise';
  if (p < pct + 0.08) return 'mix';
  return 'fold';
}

// ── 트레이너용 헬퍼 ──
const SUITS = ['♠', '♥', '♦', '♣'] as const;
export type Card = { rank: string; red: boolean; suit: string };

/** 169핸드 라벨에서 무작위 한 개 추출. */
export function randomHandLabel(): string {
  const flat = GRID.flat();
  return flat[Math.floor(Math.random() * flat.length)].label;
}

/** 라벨(AKs/AKo/TT)을 표시용 카드 2장으로 변환(수딧=같은무늬, 오프=다른무늬, 페어=다른무늬). */
export function labelToCards(label: string): [Card, Card] {
  const hi = label[0], lo = label[1];
  const suited = label.endsWith('s');
  const pair = hi === lo;
  const card = (rank: string, si: number): Card => ({ rank, suit: SUITS[si], red: si === 1 || si === 2 });
  if (pair) return [card(hi, 0), card(lo, 1)];
  if (suited) { const s = Math.floor(Math.random() * 4); return [card(hi, s), card(lo, s)]; }
  const s1 = Math.floor(Math.random() * 4);
  let s2 = Math.floor(Math.random() * 4); if (s2 === s1) s2 = (s2 + 1) % 4;
  return [card(hi, s1), card(lo, s2)];
}
