// 승률 표기 흔들림(감사 gto-func-audit-1001 F2) — 2026-10-01 gto-team.
//
// 증상: A♠K♠ vs Q♥Q♦ 프리플랍(정확값 46.21%)이 GTO 분석 화면에서 45~47%, 리플레이어에서 45~48% 로 볼 때마다 바뀌었다.
// 원인: computeEquity 가 보드 0~2장이면 Math.random 2,500회 표본이었다. 표본 경로들도 seed 가 없으면 Math.random 이었다.
//
// 잠그는 것
//  ① 새 평가기(evalState)는 옛 정본 score5(21조합 최대)와 5·6·7장에서 같은 점수를 낸다 — 아래 ORACLE 이 옛 코드 그대로다
//  ② 2인 카드 대 카드는 프리플랍까지 전수다 — 독립 평가기(scripts/gen-nash/exactpair.mjs, 표 조회)의 정수 집계와 같다
//  ③ 같은 입력을 10번 불러도 같은 숫자다 — 전수 경로와 표본 경로(레인지·멀티·레인지 대 레인지) 모두
// 실행: npx vitest run src/components/features/gto/equityStable.test.ts
import { describe, it, expect } from 'vitest';
import {
  computeEquity, computeEquityMulti, computeEquityVsRange, computeRangeVsRange, handScore, type WeightedCombo,
} from './equityEngine';
import { RANKS, SUITS, type Card } from './gto.types';

const C = (s: string): Card => ({ rank: s[0] as Card['rank'], suit: s[1] as Card['suit'] });
const H = (a: string, b: string): [Card, Card] => [C(a), C(b)];
const B = (...cs: string[]) => cs.map(C);
const combo = (a: string, b: string, weight = 1): WeightedCombo => ({ cards: [C(a), C(b)], weight });
// 전수 1,712,304 보드 × 10회 — 로컬 0.3s/회, CI 는 코어가 적어 더 느리다.
const EXACT_TIMEOUT = 60_000;

// ── 독립 오라클: 2026-10-01 이전 equityEngine.score5 + best7(21조합) 그대로 ─────────────────────
const RV: Record<string, number> = {}; RANKS.forEach((r, i) => { RV[r] = 14 - i; });
function score5(cs: Card[]): number {
  const ranks = cs.map((c) => RV[c.rank]).sort((a, b) => b - a);
  const flush = cs.every((c) => c.suit === cs[0].suit);
  let straight = false; let sHigh = 0;
  if (new Set(ranks).size === 5) {
    if (ranks[0] - ranks[4] === 4) { straight = true; sHigh = ranks[0]; }
    else if (ranks[0] === 14 && ranks[1] === 5 && ranks[4] === 2) { straight = true; sHigh = 5; }
  }
  const freq = new Map<number, number>(); ranks.forEach((r) => freq.set(r, (freq.get(r) ?? 0) + 1));
  const groups = [...freq.entries()].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));
  const counts = groups.map((g) => g[1]); const gr = groups.map((g) => g[0]);
  let cat: number;
  if (straight && flush) cat = 8; else if (counts[0] === 4) cat = 7; else if (counts[0] === 3 && counts[1] === 2) cat = 6;
  else if (flush) cat = 5; else if (straight) cat = 4; else if (counts[0] === 3) cat = 3;
  else if (counts[0] === 2 && counts[1] === 2) cat = 2; else if (counts[0] === 2) cat = 1; else cat = 0;
  const tb = (cat === 8 || cat === 4) ? [sHigh] : (cat === 5 || cat === 0) ? ranks : gr;
  const t5 = tb.slice(0, 5); while (t5.length < 5) t5.push(0);
  let v = cat; for (let i = 0; i < 5; i += 1) v = v * 15 + t5[i];
  return v;
}
function oracle(cs: Card[]): number {
  let best = -1; const n = cs.length;
  for (let a = 0; a < n; a += 1) for (let b = a + 1; b < n; b += 1) for (let c = b + 1; c < n; c += 1)
    for (let d = c + 1; d < n; d += 1) for (let e = d + 1; e < n; e += 1) {
      const s = score5([cs[a], cs[b], cs[c], cs[d], cs[e]]); if (s > best) best = s;
    }
  return best;
}
const DECK: Card[] = RANKS.flatMap((rank) => SUITS.map((suit) => ({ rank, suit } as Card)));

describe('① 새 평가기 = 옛 정본 score5', () => {
  it('무작위 5·6·7장 30,000손(절반은 한 무늬로 치우침)에서 점수가 하나도 다르지 않다', () => {
    let s = 20261001;
    const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    let bad = 0; let flushes = 0;
    for (let t = 0; t < 30_000; t += 1) {
      const n = 5 + (t % 3);
      const pool = t & 1 ? DECK.filter((c) => c.suit === 's' || rnd() < 0.25) : DECK;
      const hand: Card[] = [];
      while (hand.length < n) { const c = pool[Math.floor(rnd() * pool.length)]; if (!hand.includes(c)) hand.push(c); }
      const want = oracle(hand);
      if (Math.floor(want / 15 ** 5) === 5) flushes += 1;
      if (handScore(hand) !== want) bad += 1;
    }
    expect(bad).toBe(0);
    expect(flushes, '플러시가 충분히 섞이지 않았다 — 대조가 빈 검사가 된다').toBeGreaterThan(1000);
  });

  it('경계 손: 휠·스트레이트 플러시·쿼드 키커·풀하우스 두 트립·세 페어 키커', () => {
    for (const h of [
      ['As', '2d', '3c', '4h', '5s', 'Kd', 'Kc'],
      ['5s', '4s', '3s', '2s', 'As', '6d', '7d'],
      ['9h', '9d', '9c', '9s', 'Kd', 'Kc', '2h'],
      ['Jh', 'Jd', 'Jc', '4s', '4d', '4c', '2h'],
      ['Qh', 'Qd', '8c', '8s', '3d', '3c', 'Th'],
      ['Ah', 'Kh', '9h', '6h', '2h', 'Qh', 'Ad'],
    ]) expect(handScore(B(...h)), h.join(' ')).toBe(oracle(B(...h)));
  });

  it('보드 2장(15,180 런아웃) 전수 — 오라클로 센 승·무 수와 정확히 같다', () => {
    const hero = H('As', 'Ks'); const vill = H('Qh', 'Qd'); const board = B('Qs', '7c');
    const used = new Set([...hero, ...vill, ...board].map((c) => c.rank + c.suit));
    const rest = DECK.filter((c) => !used.has(c.rank + c.suit));
    let w = 0; let t = 0; let n = 0;
    for (let i = 0; i < rest.length; i += 1) for (let j = i + 1; j < rest.length; j += 1) for (let k = j + 1; k < rest.length; k += 1) {
      const full = [...board, rest[i], rest[j], rest[k]];
      const h = oracle([...hero, ...full]); const v = oracle([...vill, ...full]);
      if (h > v) w += 1; else if (h === v) t += 1; n += 1;
    }
    const r = computeEquity(hero, vill, board);
    expect(r.iterations).toBe(n);
    expect(r.kind).toBe('exact');
    expect(r.hero).toBe((w + t / 2) / n);
    expect(r.tie).toBe(t / n);
  }, EXACT_TIMEOUT);
});

describe('② 2인 프리플랍 전수 — 독립 평가기 정수 집계와 같다', () => {
  // scripts/gen-nash/exactpair.mjs(표 조회 평가기, 앱 엔진과 코드 공유 없음)로 2026-10-01 실행한 값:
  //   AsKs vs QhQd  승 787,966 · 무 6,732 / 1,712,304 → 46.214%
  //   AsAh vs KdKc  승 1,388,072 · 무 6,538 / 1,712,304 → 81.255%
  const N = 1_712_304;
  it('A♠K♠ vs Q♥Q♦ = 46.21% (감사 F2 의 독립 열거값과 같다)', () => {
    const r = computeEquity(H('As', 'Ks'), H('Qh', 'Qd'), []);
    expect(r.kind).toBe('exact');
    expect(r.iterations).toBe(N);
    expect(r.hero).toBeCloseTo((787_966 + 6_732 / 2) / N, 12);
    expect(r.tie).toBeCloseTo(6_732 / N, 12);
    expect(Math.round(r.hero * 10_000) / 100).toBe(46.21);
  }, EXACT_TIMEOUT);

  it('A♠A♥ vs K♦K♣(무늬 비겹침) = 81.26%', () => {
    const r = computeEquity(H('As', 'Ah'), H('Kd', 'Kc'), []);
    expect(r.hero).toBeCloseTo((1_388_072 + 6_538 / 2) / N, 12);
    expect(Math.round(r.hero * 10_000) / 100).toBe(81.26);
  }, EXACT_TIMEOUT);

  it('멀티 경로(상대 카드를 다 앎)도 같은 전수다 — 같은 계산이 두 벌이 아니다', () => {
    const m = computeEquityMulti(H('As', 'Ks'), [H('Qh', 'Qd')], []);
    expect(m.kind).toBe('exact');
    expect(m.hero).toBeCloseTo((787_966 + 6_732 / 2) / N, 12);
  }, EXACT_TIMEOUT);
});

describe('③ 같은 입력 10번 = 같은 숫자', () => {
  const ten = <T,>(f: () => T) => Array.from({ length: 10 }, f).map((r) => JSON.stringify(r));

  it('2인 프리플랍(GTO 분석·리플레이어가 부르는 그 함수)', () => {
    expect(new Set(ten(() => computeEquity(H('As', 'Ks'), H('Qh', 'Qd'), []))).size).toBe(1);
  }, EXACT_TIMEOUT);

  it('표본 경로도 시드가 고정이다 — 레인지 대 핸드 · 모르는 상대 · 레인지 대 레인지', () => {
    const range = [combo('Qh', 'Qd'), combo('7c', '7d'), combo('Ah', 'Kd'), combo('Jc', 'Tc', 0.5)];
    expect(new Set(ten(() => computeEquityVsRange(H('As', 'Ks'), range, []))).size).toBe(1);
    expect(new Set(ten(() => computeEquityMulti(H('As', 'Ks'), [[], []], [], 2000))).size).toBe(1);
    expect(new Set(ten(() => computeRangeVsRange([combo('As', 'Ks'), combo('Ad', 'Kd')], range, B('2c', '7d'), 1500))).size).toBe(1);
  }, EXACT_TIMEOUT);
});
