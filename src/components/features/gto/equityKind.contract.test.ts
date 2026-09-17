// src/components/features/gto/equityKind.contract.test.ts
// 에퀴티 결과가 **어떻게 나온 값인지** 말하게 하는 계약 (2026-09-18).
//
// 잠그는 것 셋:
//  ① 계산할 수 없었던 경우를 0.5 로 위장하지 않는다 — 그 0.5 가 참고 액션 믹스로 흘러들어갔다
//  ② 보드가 다 깔렸으면 전수계산이다 — 답이 있는데 표본을 쓰면 흔들린다
//  ③ 프리셋 사이징은 '추가액' 이라, 화면이 보여 주는 투입 총액과 엔진의 오픈 크기 판정이 같은 수를 본다
import { describe, it, expect } from 'vitest';
import {
  computeEquityVsRange, computeRangeVsRange, type WeightedCombo,
} from './equityEngine';
import { amountToCall, evaluateSpot, investedThisStreet } from '../../../lib/spotEvaluate';
import { emptySpot, type SpotReview } from '../../../lib/spot';
import type { Card } from './gto.types';

const C = (s: string): Card => ({ rank: s[0] as Card['rank'], suit: s[1] as Card['suit'] });
const combo = (a: string, b: string, weight = 1): WeightedCombo => ({ cards: [C(a), C(b)], weight });

describe('① 계산할 수 없었던 것을 "반반" 이라고 말하지 않는다', () => {
  it('레인지가 내 카드에 전부 막히면 kind 로 그 사실을 싣는다', () => {
    const r = computeEquityVsRange([C('As'), C('Ks')], [combo('As', 'Ah')], []);
    expect(r.kind, 'kind 없이 0.5 만 돌려주면 호출부가 "정말 5:5" 와 구별하지 못한다')
      .toBe('no_legal_combinations');
    expect(r.iterations).toBe(0);
  });

  it('가중치가 전부 0 이어도 같은 kind 다', () => {
    const r = computeEquityVsRange([C('2c'), C('3d')], [combo('Ah', 'Kh', 0)], []);
    expect(r.kind).toBe('no_legal_combinations');
  });

  it('computeRangeVsRange 와 같은 모양으로 말한다 — 두 함수가 다른 말을 하면 호출부가 갈린다', () => {
    const a = computeEquityVsRange([C('As'), C('Ks')], [combo('As', 'Ah')], []);
    const b = computeRangeVsRange([combo('As', 'Ks')], [combo('As', 'Ah')], []);
    expect(a.kind).toBe(b.kind);
    expect(a.accepted).toBe(b.accepted);
    expect(a.hero).toBe(b.hero);
  });

  it('정상 계산에는 kind 가 붙되 no_legal_combinations 가 아니다', () => {
    const r = computeEquityVsRange([C('As'), C('Ks')], [combo('Qh', 'Qd'), combo('7c', '7d')], []);
    expect(r.kind).toBe('monte_carlo');
    expect(r.iterations).toBeGreaterThan(0);
  });
});

describe('② 보드가 다 깔렸으면 표본을 쓰지 않는다', () => {
  const hero: [Card, Card] = [C('Ks'), C('Kh')];
  // KK 는 QQ(트립 퀸)에게만 지고 AsQs·7c7d·JdTh 는 이긴다 → 정확히 3/4
  const range = [combo('As', 'Qs'), combo('Qh', 'Qd'), combo('7c', '7d'), combo('Jd', 'Th')];
  const board = ['Qc', '2d', '3h', '4s', '9c'].map(C);

  it('보드 5장이면 kind=exact 이고 값이 정확히 3/4 다', () => {
    const r = computeEquityVsRange(hero, range, board);
    expect(r.kind).toBe('exact');
    expect(r.hero).toBeCloseTo(0.75, 10);
    expect(r.iterations, '표본 수가 아니라 유효 콤보 수여야 한다').toBe(4);
  });

  it('표본 수를 바꿔도 값이 흔들리지 않는다 — 전수라면 당연히 같아야 한다', () => {
    const runs = [2500, 20000, 100000].map((n) => computeEquityVsRange(hero, range, board, n).hero);
    expect(new Set(runs).size, `표본 수에 따라 값이 달라졌다: ${runs}`).toBe(1);
    // 같은 표본 수로 여러 번 돌려도 같아야 한다(난수 의존이 남아 있으면 여기서 걸린다)
    const rep = Array.from({ length: 8 }, () => computeEquityVsRange(hero, range, board, 2500).hero);
    expect(new Set(rep).size).toBe(1);
  });

  it('레인지 전수 함수와 같은 답을 낸다 — 두 경로가 갈리면 화면마다 다른 승률이 나온다', () => {
    const a = computeEquityVsRange(hero, range, board);
    const b = computeRangeVsRange([combo('Ks', 'Kh')], range, board);
    expect(a.hero).toBeCloseTo(b.hero, 10);
    expect(a.kind).toBe('exact');
    expect(b.kind).toBe('exact');
  });

  it('보드가 덜 깔렸으면 그대로 표본이다 — 전수 분기를 과하게 넓히지 않았다', () => {
    const r = computeEquityVsRange(hero, range, board.slice(0, 4), 2500);
    expect(r.kind).toBe('monte_carlo');
    expect(r.iterations).toBe(2500);
  });
});

describe('③ 사이징 프리셋은 추가액이다 — 화면의 투입 총액과 엔진 판정이 같은 수를 본다', () => {
  const spot = (over: Partial<SpotReview>): SpotReview => ({ ...emptySpot(), hero: ['As', 'Ks'], ...over });
  /** NuriSpotPanel 이 '투입 총액' 으로 보여 주는 값과 같은 계산 */
  const shownTotal = (s: SpotReview, actor: 'hero' | 'villain') =>
    Math.round(investedThisStreet(s, actor) * 100) / 100;

  const sbOpen = (inc: number) => spot({
    tableSize: 6, heroPos: 'BB', villainPos: 'SB', sbBb: 0.5, street: 'preflop', effectiveBb: 100,
    actions: [{ street: 'preflop', actor: 'villain', type: 'raise', sizeBb: inc }],
  });

  it('블라인드는 이미 낸 돈이 있다 — 비블라인드 자리에서만 추가액 = 총액이다', () => {
    const s = sbOpen(3);
    expect(shownTotal(s, 'villain'), 'SB 는 0.5BB 를 이미 냈다').toBe(3.5);
    expect(shownTotal(s, 'hero'), 'BB 는 1BB 를 이미 냈다').toBe(1);
    const btn = spot({
      tableSize: 6, heroPos: 'BB', villainPos: 'BTN', sbBb: 0.5, street: 'preflop', effectiveBb: 100,
      actions: [{ street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 3 }],
    });
    expect(shownTotal(btn, 'villain'), 'BTN 은 낸 돈이 없어 추가액이 곧 총액이다').toBe(3);
  });

  it('화면이 보여 주는 총액이 콜 금액과 맞아떨어진다 — 두 수가 같은 원장에서 나온다', () => {
    for (const s of [sbOpen(2), sbOpen(2.5), sbOpen(3)]) {
      expect(shownTotal(s, 'villain') - shownTotal(s, 'hero')).toBeCloseTo(amountToCall(s), 6);
    }
  });

  it('프리셋 3 은 총액 3.5BB 라 오픈 크기 밴드 밖이다 — 그리고 그 이유를 문장으로 말한다', () => {
    // 이게 이 화면이 유저에게 총액을 보여 줘야 하는 이유다: 숫자 3 을 골랐는데 3.5 로 기록된다.
    const s = sbOpen(3);
    expect(shownTotal(s, 'villain')).toBe(3.5);
    const e = evaluateSpot(s);
    expect(e.kind, '밴드 밖인데 정확 일치라고 말했다').toBe('normalized_reference');
    const why = (e.kind === 'normalized_reference' ? e.differences : []).join(' ');
    expect(why, '왜 참고로 내려갔는지가 오픈 크기 때문임을 말하지 않는다').toMatch(/상대 오픈/);
    expect(why).toMatch(/3\.5BB/);
  });

  it('"SB 가 3BB 로 오픈" 을 옳게 적으면(추가 2.5) 정확 일치로 돌아온다', () => {
    const s = sbOpen(2.5);
    expect(shownTotal(s, 'villain')).toBe(3);
    expect(evaluateSpot(s).kind).toBe('chart_nash');
  });

  it('포스트플랍에는 블라인드가 섞이지 않는다', () => {
    const s = spot({
      tableSize: 6, heroPos: 'BB', villainPos: 'BTN', sbBb: 0.5, street: 'flop', effectiveBb: 200,
      board: ['7d', '2c', '9h'],
      actions: [
        { street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 2.5 },
        { street: 'preflop', actor: 'hero', type: 'call', sizeBb: 1.5 },
        { street: 'flop', actor: 'hero', type: 'bet', sizeBb: 10 },
        { street: 'flop', actor: 'villain', type: 'raise', sizeBb: 30 },
      ],
    });
    expect(shownTotal(s, 'hero'), '지난 스트리트 금액이나 블라인드가 섞였다').toBe(10);
    expect(shownTotal(s, 'villain')).toBe(30);
    expect(shownTotal(s, 'villain') - shownTotal(s, 'hero')).toBeCloseTo(amountToCall(s), 6);
  });
});
