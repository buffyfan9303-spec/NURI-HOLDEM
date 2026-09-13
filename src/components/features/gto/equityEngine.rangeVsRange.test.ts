// 레인지 vs 레인지 — 결합 분포를 편향 없이 다루는가.
//
// 왜 필요한가 (2026-09-12 실측):
//   옛 구현은 **히어로를 먼저 뽑아 고정하고 빌런만 다시 뽑았다.** 그러면 히어로 콤보가
//   빌런을 많이 막을수록 그 히어로 콤보가 과대 대표된다 — 막힌 빌런 자리를 남은 빌런이
//   대신 채우는 동안 히어로 쪽 확률은 그대로이기 때문이다.
//   보드 Qc2d3h4s9c · 히어로 {AsAh, KsKh} · 빌런 {AsQs, QhQd} 에서
//   전수 정답 33.33% 인데 20,000회 표본이 24.8% 를 냈다(8.5%p 오차).
//
// 이 파일은 **손으로 셀 수 있는 스팟**만 쓴다. 엔진이 맞는지 확인할 길이 없는
// 큰 레인지로는 회귀를 잡지 못한다.
import { describe, it, expect } from 'vitest';
import { computeRangeVsRange, type WeightedCombo } from './equityEngine';
import type { Card } from './gto.types';

const c = (s: string): Card => ({ rank: s[0], suit: s[1] } as Card);
const combo = (a: string, b: string, weight = 1): WeightedCombo => ({ cards: [c(a), c(b)], weight });
const board = (...cs: string[]) => cs.map(c);

describe('결합 분포 — 히어로를 고정하지 않는다', () => {
  // 유효 쌍 3개(가중치 동일):
  //   AsAh/QhQd → 빌런 트립 Q 승     (AsAh/AsQs 는 As 가 겹쳐 존재하지 않는다)
  //   KsKh/AsQs → 히어로 KK 승 (빌런은 Q 원페어)
  //   KsKh/QhQd → 빌런 트립 Q 승
  // 히어로 승 1/3.
  const HERO = [combo('As', 'Ah'), combo('Ks', 'Kh')];
  const VILL = [combo('As', 'Qs'), combo('Qh', 'Qd')];
  const BOARD = board('Qc', '2d', '3h', '4s', '9c');

  it('🔴 보드가 다 깔린 스팟은 전수 계산으로 정확히 1/3 이다', () => {
    const r = computeRangeVsRange(HERO, VILL, BOARD);
    expect(r.kind, '보드가 5장인데 표본을 썼다').toBe('exact');
    expect(r.hero).toBeCloseTo(1 / 3, 10);
    expect(r.villain).toBeCloseTo(2 / 3, 10);
    expect(r.tie).toBe(0);
  });

  it('🔴 히어로를 먼저 고정하던 옛 편향값(≈25%)이 아니다', () => {
    const r = computeRangeVsRange(HERO, VILL, BOARD);
    // 옛 구현은 AsAh/QhQd 에 50%, 나머지 둘에 25% 씩을 줘서 히어로가 25% 였다.
    expect(Math.abs(r.hero - 0.25), '결합 분포가 다시 편향됐다').toBeGreaterThan(0.05);
  });

  it('전수 계산에 들어간 쌍이 정확히 3개다 — 겹치는 쌍을 세지 않는다', () => {
    const r = computeRangeVsRange(HERO, VILL, BOARD);
    expect(r.accepted).toBe(3);
  });

  it('가중치를 주면 그 비율대로 반영된다 — KsKh 를 3배로 주면 히어로 승률이 오른다', () => {
    // 쌍 가중치: AsAh/QhQd=1, KsKh/AsQs=3, KsKh/QhQd=3 → 히어로 승 3/7
    const r = computeRangeVsRange([combo('As', 'Ah', 1), combo('Ks', 'Kh', 3)], VILL, BOARD);
    expect(r.hero).toBeCloseTo(3 / 7, 10);
  });
});

describe('대칭성 — 히어로와 빌런을 바꾸면 승패가 뒤집힌다', () => {
  it('같은 스팟에서 hero/villain 을 맞바꾸면 값이 서로 바뀐다', () => {
    const H = [combo('As', 'Ah'), combo('Ks', 'Kh')];
    const V = [combo('As', 'Qs'), combo('Qh', 'Qd')];
    const B = board('Qc', '2d', '3h', '4s', '9c');
    const a = computeRangeVsRange(H, V, B);
    const b = computeRangeVsRange(V, H, B);
    expect(b.hero).toBeCloseTo(a.villain, 10);
    expect(b.villain).toBeCloseTo(a.hero, 10);
    expect(b.tie).toBeCloseTo(a.tie, 10);
  });

  it('같은 레인지끼리 붙으면 정확히 반반이다', () => {
    const R = [combo('As', 'Ah'), combo('Ks', 'Kh'), combo('7c', '7d')];
    const r = computeRangeVsRange(R, R, board('Qc', '2d', '3h', '4s', '9c'));
    expect(r.hero).toBeCloseTo(0.5, 10);
    expect(r.villain).toBeCloseTo(0.5, 10);
  });
});

describe('무승부와 차단', () => {
  it('완전히 같은 족보면 무승부로 센다 — 승률 절반씩', () => {
    // 보드가 스트레이트를 만들어 양쪽 다 보드로만 플레이한다.
    const r = computeRangeVsRange(
      [combo('2c', '3d')], [combo('2h', '3s')],
      board('Ac', 'Kd', 'Qh', 'Js', 'Td'),
    );
    expect(r.tie).toBeCloseTo(1, 10);
    expect(r.hero).toBeCloseTo(0.5, 10);
  });

  it('🔴 유효한 쌍이 하나도 없으면 50% 가 아니라 계산 불가로 말한다', () => {
    // 히어로와 빌런이 같은 카드 한 장뿐 — 어떤 쌍도 성립하지 않는다.
    const r = computeRangeVsRange([combo('As', 'Ah')], [combo('As', 'Kd')], board('Qc', '2d', '3h'));
    expect(r.kind, '계산 불가를 50% 로 돌려줬다').toBe('no_legal_combinations');
    expect(r.accepted).toBe(0);
  });

  it('보드가 레인지를 전부 막으면 계산 불가다', () => {
    const r = computeRangeVsRange([combo('As', 'Ah')], [combo('Kc', 'Kd')], board('As', '2d', '3h'));
    expect(r.kind).toBe('no_legal_combinations');
  });

  it('가중치 0 인 콤보는 레인지에 없는 것과 같다', () => {
    const withZero = computeRangeVsRange(
      [combo('As', 'Ah'), combo('Ks', 'Kh', 0)], [combo('Qh', 'Qd')],
      board('Qc', '2d', '3h', '4s', '9c'),
    );
    const without = computeRangeVsRange(
      [combo('As', 'Ah')], [combo('Qh', 'Qd')],
      board('Qc', '2d', '3h', '4s', '9c'),
    );
    expect(withZero.hero).toBeCloseTo(without.hero, 10);
  });
});

describe('표본 경로 — seed 를 주면 재현된다', () => {
  const H = [combo('As', 'Ah'), combo('Ks', 'Kh')];
  const V = [combo('Qh', 'Qd'), combo('Jc', 'Jd')];
  const FLOP = board('Qc', '2d', '3h');   // 2장 더 필요 → 몬테카를로

  it('같은 seed 는 같은 값을 낸다 — 무작위 실패를 만들지 않는다', () => {
    const a = computeRangeVsRange(H, V, FLOP, { iterations: 3000, seed: 123456789 });
    const b = computeRangeVsRange(H, V, FLOP, { iterations: 3000, seed: 123456789 });
    expect(a.kind).toBe('monte_carlo');
    expect(b.hero).toBe(a.hero);
    expect(b.villain).toBe(a.villain);
    expect(b.tie).toBe(a.tie);
  });

  it('다른 seed 는 다른 표본을 쓴다 — seed 가 무시되고 있지 않다', () => {
    const a = computeRangeVsRange(H, V, FLOP, { iterations: 3000, seed: 1 });
    const b = computeRangeVsRange(H, V, FLOP, { iterations: 3000, seed: 999 });
    expect(a.hero).not.toBe(b.hero);
  });

  it('표본 결과에는 채택 수와 시도 수가 붙는다', () => {
    const r = computeRangeVsRange(H, V, FLOP, { iterations: 500, seed: 42 });
    expect(r.accepted).toBeGreaterThan(0);
    expect(r.attempts).toBeGreaterThanOrEqual(r.accepted!);
    expect(r.iterations).toBe(r.accepted);
  });

  // 두 표본 경로(쌍 표본 / 양쪽 기각 표본)가 **같은 분포**를 보는지.
  // 한쪽에 편향이 남으면 값이 벌어진다.
  //
  // 표본 4,000회면 한쪽 표준오차가 약 0.8%p, 두 추정치 차이는 약 1.1%p 라
  // 3σ 여유를 둬도 5%p 면 충분하다. 회수를 더 올리면 정밀해지는 대신
  // 다른 작업과 겹칠 때 5초 타임아웃에 걸려 **단정과 무관하게** 터진다(2026-09-12 실측).
  it('두 표본 경로가 같은 분포를 본다 — 한쪽에 편향이 남으면 벌어진다', () => {
    const viaPairs = computeRangeVsRange(H, V, FLOP, { iterations: 4000, seed: 7 });
    const viaReject = computeRangeVsRange(H, V, FLOP, { iterations: 4000, seed: 7, exactPairLimit: 0 });
    expect(viaReject.kind).toBe('monte_carlo');
    expect(Math.abs(viaPairs.hero - viaReject.hero), '두 표본 경로가 서로 다른 분포를 본다').toBeLessThan(0.05);
  }, 20_000);
});

describe('네 번째 인자 하위 호환 — 기존 호출부가 숫자를 넘긴다', () => {
  it('숫자를 주면 iterations 로 받는다', () => {
    const r = computeRangeVsRange(
      [combo('As', 'Ah')], [combo('Qh', 'Qd')], board('Qc', '2d', '3h'), 800,
    );
    expect(r.kind).toBe('monte_carlo');
    expect(r.iterations).toBeLessThanOrEqual(800);
    expect(r.iterations).toBeGreaterThan(0);
  });
});
