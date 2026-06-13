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

// ── 스택 깊이(bb)별 보정 — 토너먼트 핵심 4구간. (Chen 근사 위 참고 보정, 솔버 아님)
export type StackBB = 12 | 20 | 40 | 100;
export const STACKS: { bb: StackBB; label: string; hint: string; openLabel: string; threeBetLabel: string }[] = [
  { bb: 12, label: '12bb', openLabel: '오픈(≈올인)', threeBetLabel: '3벳(올인)',
    hint: '푸시/폴드 구간 — 오픈은 사실상 올인. 레이트 포지션은 과감하게 넓히고, 콜은 프리미엄만.' },
  { bb: 20, label: '20bb', openLabel: '오픈(미니레이즈)', threeBetLabel: '3벳(올인)',
    hint: '숏스택 — 레이즈/폴드 단순화. 3벳은 대부분 올인이라 한 단계 타이트하게.' },
  { bb: 40, label: '40bb', openLabel: '오픈', threeBetLabel: '3벳',
    hint: '미들스택 — 표준에 가깝지만 스택오프 기준이 낮아 도미네이트 당하는 콜 주의.' },
  { bb: 100, label: '100bb', openLabel: '오픈', threeBetLabel: '3벳',
    hint: '딥스택 — 표준 레인지. 수딧 커넥터·작은 페어의 임플라이드 가치가 올라간다.' },
];
function stackMul(bb: StackBB, act: PreAction): number {
  // 오픈: 12bb 푸시 레인지는 넓게, 100bb는 스펙 핸드 소폭 추가. 3벳: 올인 구간은 타이트.
  if (act === 'open') return bb === 12 ? 1.3 : bb === 20 ? 1.0 : bb === 40 ? 1.0 : 1.06;
  return bb === 12 ? 0.72 : bb === 20 ? 0.85 : bb === 40 ? 1.0 : 1.12;
}

// ── 시나리오 보정 — 멀티웨이 / vs 림프 / PKO(프로그레시브 KO) ──
export type Scenario = 'std' | 'multiway' | 'limp' | 'pko';
export const SCENARIOS: { id: Scenario; label: string; hint: string }[] = [
  { id: 'std', label: '표준', hint: '오픈 폴드 한 바퀴 — 기본 오픈/3벳 레인지.' },
  { id: 'multiway', label: '멀티웨이', hint: '이미 여러 명이 들어온 팟 — 블러프성 핸드(약한 브로드웨이·약한 Ax)는 줄이고 수딧 커넥터·포켓 페어·수딧 Ax처럼 넛 잠재력 있는 핸드 위주로. 도미네이트 위험이 커 레인지를 한 단계 타이트하게.' },
  { id: 'limp', label: 'vs 림프', hint: '앞에 림퍼가 있으면 아이솔 레이즈로 압박 — 가치 핸드를 평소보다 넓게 레이즈해 헤즈업을 유도(특히 포지션 있을 때). 림퍼 뒤 약한 핸드 오버콜은 피한다.' },
  { id: 'pko', label: 'PKO', hint: '바운티($EV)가 칩 EV에 더해져 공격성을 높임 — 숏스택을 커버할 땐 콜·올인 레인지를 넓혀 바운티를 노린다. 반대로 내가 숏이면 무리한 콜은 자제.' },
];
function scenarioMul(s: Scenario): number {
  return s === 'multiway' ? 0.82 : s === 'limp' ? 1.15 : s === 'pko' ? 1.18 : 1;
}

/** 포지션·테이블·액션·스택·시나리오별 오픈/3벳 상위 % 임계값. */
export function openPct(pos: Pos, size: TableSize, act: PreAction, bb: StackBB = 100, scenario: Scenario = 'std'): number {
  const base = POSITIONS.find((p) => p.id === pos)!.pct;
  return Math.max(0.01, Math.min(0.9, base * (size === '9' ? 0.78 : 1) * (act === '3bet' ? 0.42 : 1) * stackMul(bb, act) * scenarioMul(scenario)));
}

/** 잘못된 프리플랍 결정의 근사 EV 손실(bb/100, 참고용). 경계에서 멀수록 명백한 실수 → 손실 큼. */
export function evLossBb(label: string, pct: number, chose: 'open' | 'fold'): number {
  const p = RANK_PCT.get(label) ?? 1;
  const a = action(label, pct);
  if (a === 'mix') return 0;
  // raise가 정답인데 fold = (pct−p)에 비례 / fold가 정답인데 raise = (p−pct)에 비례
  const wrong = (a === 'raise' && chose === 'fold') || (a === 'fold' && chose === 'open');
  if (!wrong) return 0;
  const dist = a === 'raise' ? (pct - p) : (p - pct); // 0~1
  return Math.max(0.3, Math.round(dist * 60 * 10) / 10); // ~최대 수십 bb/100, 소수 1자리
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

/** 카드 2장(예: 'As','Kh') → 169핸드 라벨(AA/AKs/AKo). 인식 불가 시 null. */
export function cardsToLabel(c1: string, c2: string): string | null {
  const r1 = (c1?.[0] || '').toUpperCase(), r2 = (c2?.[0] || '').toUpperCase();
  const su1 = (c1?.slice(-1) || '').toLowerCase(), su2 = (c2?.slice(-1) || '').toLowerCase();
  if (!VAL[r1] || !VAL[r2]) return null;
  if (r1 === r2) return r1 + r2;
  const hi = VAL[r1] >= VAL[r2] ? r1 : r2;
  const lo = VAL[r1] >= VAL[r2] ? r2 : r1;
  return hi + lo + (su1 && su2 && su1 === su2 ? 's' : 'o');
}

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
