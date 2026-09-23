// GTO 감사(2026-09-20) 확정 반례 — **수정 전에 반드시 빨개지는** 검사만 모았다.
//
// 왜 한 파일로 모으나: 각 결함의 반례는 서로 다른 모듈에 있지만 **같은 종류의 거짓말**이다 —
// "계산할 수 없는 것을 계산한 척했다". 한 자리에 모아 두면 다음 사람이 그 목록을 통째로 되돌려 보며
// 음성 대조를 할 수 있다. 개별 모듈 테스트(`spotEvaluate.test.ts`·`icm.test.ts` 등)의 기존 단언은
// 하나도 지우거나 약화하지 않았고, 여기 있는 것은 **추가**다.
//
// 수치의 출처:
//  · G1 은 TDA 2026 Rule 45(최소 재레이즈)·16B/67A(미매칭 반환)·23(사이드팟)과 NLHE 벳 한도에서 나온다.
//  · G2 두 사례의 현재 패 우열/런아웃 분포는 외부 독립 평가기 `phevaluator==0.6.0` 으로 대조했다
//    (626/0/364 · 10/20/14). 이 파일은 그 **수치**를 단언하지 다시 계산하지 않는다.
//  · G3 양성 대조는 Diaconis–Ethier(AMS 2022)의 2019 WSOP 3인 예제다.
import { describe, it, expect } from 'vitest';
import { emptySpot, validateSpot, type SpotReview } from './spot';
import { evaluateSpot } from './spotEvaluate';
import { icmEquity } from './icm';
import { GTO_TOOL_COUNT } from './gtoToolCount';
import { currentStanding, computeOuts, computeEquity } from '../components/features/gto/equityEngine';
import { comboTotal, handUnits } from '../components/features/tools/MoreCalcs';
import type { Card } from '../components/features/gto/gto.types';

const C = (x: string): Card => ({ rank: x[0] as Card['rank'], suit: x[1] as Card['suit'] });
const cards = (xs: string[]) => xs.map(C);
const pair = (xs: string[]) => [C(xs[0]), C(xs[1])] as [Card, Card];

describe('G1 — 유효 스택을 넘는 투입을 수치처럼 내보내지 않는다', () => {
  /** 설계서 §6-A 원장: BTN Hero 100BB raise+80 → BB Villain call+79(총80) → 플랍 Villain bet+30. */
  const overBet = (): SpotReview => {
    const s = emptySpot();
    s.hero = ['As', 'Kd'];
    s.street = 'flop';
    s.board = ['2c', '7d', 'Jh'];
    s.actions = [
      { street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 80 },
      { street: 'preflop', actor: 'villain', type: 'call', sizeBb: 79 },
      { street: 'flop', actor: 'villain', type: 'bet', sizeBb: 30 },
    ];
    return s;
  };

  it('🔴 상대가 유효 스택을 넘겨 베팅하면 넘은 돈은 팟에서 빠지고 콜은 내 잔여로 잘린다', () => {
    const e = evaluateSpot(overBet());
    // 수정 전: 팟 190.5 · 콜 30 · 필요 지분 13.6054% 라는 **불가능한 원장의 그럴듯한 수치**가 나왔다.
    expect(e.math.uncalledBb, '유효 스택(100) − 상대 누적(110) = 10 이 미매칭 반환액이다').toBe(10);
    expect(e.math.potBb, '190.5 에서 돌려받는 10 을 뺀 값이어야 한다').toBe(180.5);
    expect(e.math.toCallBb, '히어로 잔여는 100−80=20 이라 30 을 콜할 수 없다').toBe(20);
    // 20/(180.5+20) = 9.9751% → pct() 반올림 10.0
    expect(e.math.neededEquityPct).toBeCloseTo(10.0, 1);
  });

  it('🔴 내 누적 투입이 유효 스택을 넘는 원장은 blocker 이고 수치를 내지 않는다', () => {
    const s = overBet();
    // 같은 30BB 를 **내가** 넣으면 어떤 스택 조합으로도 성립하지 않는다(유효 스택 = 둘 중 작은 쪽).
    s.actions[2] = { street: 'flop', actor: 'hero', type: 'bet', sizeBb: 30 };
    const issues = validateSpot(s);
    expect(issues.some((i) => i.level === 'blocker' && /유효 스택/.test(i.message)),
      `누적 110BB 인데 blocker 가 없다: ${JSON.stringify(issues)}`).toBe(true);
    const e = evaluateSpot(s);
    expect(e.kind).toBe('unsupported');
    // 막힌 원장에서 숫자가 나가면 사용자는 그것을 믿는다.
    expect(e.math.potBb, 'blocker 인데 팟을 그렸다').toBeNull();
    expect(e.math.toCallBb, 'blocker 인데 콜 금액을 그렸다').toBeNull();
    expect(e.math.neededEquityPct).toBeNull();
  });

  it('🔴 깊은 상대의 합법적인 오버벳은 막지 않는다 (반대 방향 반례)', () => {
    // 설계서 §4: BB Hero 100 · BTN Villain ≥120 에서 40 → 79 → 80 은 **합법**이다.
    const s = emptySpot();
    s.hero = ['As', 'Kd'];
    s.heroPos = 'BB'; s.villainPos = 'BTN';
    s.actions = [
      { street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 40 },
      { street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 79 },
      { street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 80 },
    ];
    expect(validateSpot(s).filter((i) => i.level === 'blocker'),
      '깊은 상대의 합법 오버벳을 입력 오류로 막았다').toEqual([]);
    const e = evaluateSpot(s);
    // BTN 총 120 중 100 초과분 20 은 반환, Hero 는 80 → 20 만 더 낼 수 있다.
    expect(e.math.uncalledBb).toBe(20);
    expect(e.math.toCallBb).toBe(20);
  });

  it('기존 계약 회귀 — BB vs 2.5x 오픈은 팟 4 · 콜 1.5 · 27.3% 그대로다', () => {
    const s = emptySpot();
    s.hero = ['As', 'Kd'];
    s.heroPos = 'BB'; s.villainPos = 'BTN';
    s.actions = [{ street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 2.5 }];
    const m = evaluateSpot(s).math;
    expect(m.potBb).toBe(4);
    expect(m.toCallBb).toBe(1.5);
    expect(m.uncalledBb).toBe(0);
    expect(m.neededEquityPct).toBeCloseTo(27.3, 1);
  });
});

describe('G2 — 현재 패 우열과 미래 지분은 다른 값이다', () => {
  it('🔴 A♥K♥ vs 9♣9♦ / Q♥J♠2♥ — 지분은 63.23% 인데 **지금은 뒤진다**', () => {
    const h = pair(['Ah', 'Kh']); const v = pair(['9c', '9d']); const b = cards(['Qh', 'Js', '2h']);
    // 외부 평가기: Hero 6193 · Villain 4533(낮을수록 강함) → Hero 뒤짐.
    expect(currentStanding(h, v, b), '9 페어가 A 하이보다 강하다').toBe('behind');
    // 외부 전수: 990 런아웃 중 626승·0무·364패.
    const eq = computeEquity(h, v, b);
    expect(eq.iterations).toBe(990);
    expect(eq.hero * 990).toBeCloseTo(626, 6);
    // 수정 전 화면은 `eq.hero < 0.5` 로 판단해 "이미 내가 앞서 있습니다" 라고 말했다.
    expect(eq.hero > 0.5 && currentStanding(h, v, b) === 'behind',
      '이 반례가 성립하지 않으면 G2 를 재는 의미가 없다').toBe(true);
  });

  it('🔴 3♦8♦ vs 6♠7♣ / 2♦J♣K♣2♣ — 지금은 앞서는데 리버 지분은 45.45%', () => {
    const h = pair(['3d', '8d']); const v = pair(['6s', '7c']); const b = cards(['2d', 'Jc', 'Kc', '2c']);
    expect(currentStanding(h, v, b)).toBe('ahead');
    const eq = computeEquity(h, v, b);
    expect(eq.iterations).toBe(44);
    // 10승·20무·14패 → (10+20/2)/44
    expect(eq.hero).toBeCloseTo(20 / 44, 10);
    expect(eq.tie).toBeCloseTo(20 / 44, 10);
  });

  it('🔴 computeOuts 가 "즉시 역전"과 "지분 50% 초과"를 따로 센다', () => {
    const o = computeOuts(pair(['Ah', 'Kh']), pair(['9c', '9d']), cards(['Qh', 'Js', '2h']));
    expect(o).not.toBeNull();
    expect(o!.standing, '아웃 결과가 현재 우열을 함께 말해야 화면이 거짓 분기를 못 한다').toBe('behind');
    expect(typeof o!.immediateOuts).toBe('number');
    expect(o!.immediateCards).toHaveLength(o!.immediateOuts);
    expect(o!.immediateProb).toBeCloseTo(o!.immediateOuts / o!.total, 10);
  });

  it('5·6·7장 모두 평가된다 — best7 을 5장에 그대로 부르지 않았다', () => {
    const h = pair(['As', 'Ks']); const v = pair(['Qd', 'Jc']);
    for (const b of [['2h', '7d', '9c'], ['2h', '7d', '9c', 'Td'], ['2h', '7d', '9c', 'Td', '3s']]) {
      expect(currentStanding(h, v, cards(b)), `보드 ${b.length}장`).not.toBeNull();
    }
    // A2345 휠은 KK 를 이긴다
    expect(currentStanding(pair(['Ah', '2c']), pair(['Kh', 'Kd']), cards(['3s', '4d', '5c']))).toBe('ahead');
    // 보드가 그대로 최강이면 동률
    expect(currentStanding(pair(['2c', '3d']), pair(['2h', '3s']), cards(['As', 'Ks', 'Qs', 'Js', 'Ts']))).toBe('tied');
    // 같은 카드가 겹치면 판정하지 않는다
    expect(currentStanding(pair(['As', 'Ks']), pair(['As', 'Qd']), cards(['2h', '7d', '9c']))).toBeNull();
  });
});

describe('G3 — ICM 은 상금 총액을 잃지 않는다', () => {
  it('🔴 [10,0,0] / [50,30,20] 에서 총합이 보존된다 (수정 전 [50,0,0])', () => {
    const e = icmEquity([10, 0, 0], [50, 30, 20]);
    expect(e.reduce((a, b) => a + b, 0), '총 100 중 50 이 증발했다').toBeCloseTo(100, 9);
    // 남은 둘은 칩이 같으므로(둘 다 0) 순위 확률도 같다 — icmBrute 가 이미 정의한 규칙.
    expect(e[1]).toBeCloseTo(e[2], 9);
  });

  it('출판 예제 양성 대조 — 2019 WSOP 3인(AMS) 첫 참가자 ≈ $8.388M · 총 $20M', () => {
    const e = icmEquity([326800000, 120400000, 67600000], [10000000, 6000000, 4000000]);
    expect(e[0] / 1e6).toBeCloseTo(8.388, 3);
    expect(e.reduce((a, b) => a + b, 0)).toBeCloseTo(20000000, 6);
  });

  it('단일 0칩 자리의 기존 동작은 바뀌지 않았다', () => {
    const e = icmEquity([40, 54, 0, 10], [50, 30, 20]);
    expect(e.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 9);
    expect(e[2], '상금 밖 순위로 떨어지는 계약').toBe(0);
  });
});

describe('G4 — 가장 가까운 Nash 표를 고른다', () => {
  it('🔴 9.8BB 는 9BB 가 아니라 10BB 표다', () => {
    const s = emptySpot();
    s.hero = ['As', 'Kd'];
    s.heroPos = 'CO'; s.villainPos = 'BB';
    s.effectiveBb = 9.8;
    const e = evaluateSpot(s);
    expect(e.kind === 'chart_nash' || e.kind === 'normalized_reference',
      `차트를 못 찾았다: ${e.kind}`).toBe(true);
    expect('sourceLabel' in e ? e.sourceLabel : '', '10BB 표를 골라야 한다').toMatch(/10BB/);
  });
});

describe('G6 — 홈이 말하는 도구 수가 사실이다', () => {
  it('🔴 GTO_TOOL_COUNT 는 21 이다 (숨긴 drill·deal 을 둘 다 뺀 값)', () => {
    expect(GTO_TOOL_COUNT).toBe(22);
  });
});

describe('G13 — 콤보 계산기는 합집합을 센다', () => {
  it('🔴 같은 핸드를 두 번 써도 콤보가 늘지 않는다', () => {
    expect(comboTotal('AKs,AKs')).toBe(4);
    expect(comboTotal('AKs,KAs'), '랭크 순서만 다른 같은 핸드').toBe(4);
    expect(comboTotal('AK,AKs'), '무접미 AK(16)에 AKs(4)는 이미 포함된다').toBe(16);
  });

  it('🔴 읽을 수 없는 토큰이 있으면 총계를 확정하지 않는다', () => {
    expect(comboTotal('AKs,XYZ'), '경고만 띄우고 4 를 확정하면 안 된다').toBeNull();
    expect(handUnits('AAo'), '페어에 s/o 접미는 존재하지 않는다').toBeNull();
    expect(comboTotal('')).toBeNull();
  });

  it('기본 계약은 그대로 — AA 6 · AKs 4 · AKo 12 · AK 16', () => {
    expect(comboTotal('AA')).toBe(6);
    expect(comboTotal('AKs')).toBe(4);
    expect(comboTotal('AKo')).toBe(12);
    expect(comboTotal('AK')).toBe(16);
    expect(comboTotal('AA,KK,AKs')).toBe(16);
  });
});
