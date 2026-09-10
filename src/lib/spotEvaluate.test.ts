// NURI SPOT 분석 등급 계약 — **없는 근거로 액션을 추천하지 않는다**
//
// 잠그는 것
//  ① exact_solver 는 어떤 입력으로도 나오지 않는다 — 이 저장소에 검증된 솔버 데이터가 없다
//  ② chart_nash 는 검증된 표와 **정확히** 일치할 때만
//  ③ normalized_reference 는 무엇이 달랐는지 반드시 말한다
//  ④ math_only 는 추천 액션·빈도를 만들지 않는다
//  ⑤ '개선 필요' 는 정확 일치 차트에서만 — 유사 스팟에서는 옳고 그름을 단정하지 않는다
//  ⑥ 혼합 전략에 든 선택을 오답으로 처리하지 않는다
//  ⑦ 승패 결과가 판정을 바꾸지 않는다
import { describe, it, expect } from 'vitest';
import { emptySpot, type SpotReview } from './spot';
import {
  evaluateSpot, DATASET_VERSION, COVERAGE_LABEL, VERDICT_LABEL,
  type SpotEvaluation,
} from './spotEvaluate';

function base(over: Partial<SpotReview> = {}): SpotReview {
  return { ...emptySpot(), hero: ['As', 'Ks'], ...over };
}

/** 차트 갈래가 있는 결과만 좁힌다(타입 가드) */
function chart(e: SpotEvaluation) {
  if (e.kind !== 'chart_nash' && e.kind !== 'normalized_reference') {
    throw new Error(`차트 결과가 아니다: ${e.kind}`);
  }
  return e;
}

describe('솔버 데이터가 없다는 사실을 코드가 지킨다', () => {
  it('어떤 입력으로도 exact_solver 가 나오지 않는다', () => {
    const inputs: SpotReview[] = [
      base(),
      base({ street: 'flop', board: ['7d', '2c', '9h'] }),
      base({ street: 'river', board: ['7d', '2c', '9h', 'Jd', '4s'] }),
      base({ effectiveBb: 10 }),
      base({ tableSize: 2, heroPos: 'SB', villainPos: 'BB' }),
      base({ actions: [{ street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 2.5 }], heroPos: 'BB', villainPos: 'BTN' }),
    ];
    for (const s of inputs) {
      expect(evaluateSpot(s).kind, '솔버 데이터가 없는데 solver 등급이 나왔다').not.toBe('exact_solver');
    }
  });

  it('모든 결과에 데이터 버전이 붙는다 — 게시 시점 기준을 보존한다', () => {
    expect(evaluateSpot(base()).datasetVersion).toBe(DATASET_VERSION);
    expect(evaluateSpot(base({ street: 'flop', board: ['7d', '2c', '9h'] })).datasetVersion).toBe(DATASET_VERSION);
  });

  it('표시 라벨이 오너가 정한 문구와 같다', () => {
    expect(COVERAGE_LABEL.exact_solver).toBe('솔버 기준');
    expect(COVERAGE_LABEL.chart_nash).toBe('차트/Nash 기준');
    expect(COVERAGE_LABEL.normalized_reference).toBe('유사 스팟 참고');
    expect(COVERAGE_LABEL.math_only).toBe('수학 참고');
    expect(COVERAGE_LABEL.unsupported).toBe('정확한 분석 범위 밖');
    expect(VERDICT_LABEL.good).toBe('좋은 선택');
    expect(VERDICT_LABEL.mixed).toBe('허용되는 혼합');
    expect(VERDICT_LABEL.improve).toBe('개선 필요');
  });
});

describe('chart_nash — 검증된 표와 정확히 일치할 때만', () => {
  it('6맥스 100bb BTN 첫 진입은 프리플랍 차트에 걸린다', () => {
    const e = evaluateSpot(base({ tableSize: 6, heroPos: 'BTN', effectiveBb: 100 }));
    expect(e.kind).toBe('chart_nash');
    const c = chart(e);
    expect(c.differences).toEqual([]);
    expect(c.sourceLabel).toMatch(/프리플랍 레인지 차트/);
    // AKs 는 어느 오픈 표에서도 100% 오픈이다
    expect(c.mix.raise).toBe(1);
    expect(c.mix.fold).toBe(0);
  });

  it('빈도 합이 1 이다', () => {
    for (const combo of [['As', 'Ks'], ['7d', '2c'], ['Ts', '9s']]) {
      const c = chart(evaluateSpot(base({ hero: combo })));
      expect(c.mix.raise + c.mix.call + c.mix.fold).toBeCloseTo(1, 6);
    }
  });

  it('BB 수비 — 상대 오픈 하나만 앞에 있으면 3벳·콜 갈래가 함께 나온다', () => {
    // T9s 는 bb_vs_btn 표에서 3벳 25% 로 갈리는 핸드다(나머지는 콜·폴드) — 두 갈래를 함께 보려면 이런 핸드여야 한다.
    // AKs 처럼 순수 3벳인 핸드를 고르면 call 이 0 이라 '콜 갈래가 있다' 를 증명하지 못한다.
    const e = evaluateSpot(base({
      tableSize: 6, heroPos: 'BB', villainPos: 'BTN', effectiveBb: 100, hero: ['Ts', '9s'],
      actions: [{ street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 2.5 }],
    }));
    expect(e.kind).toBe('chart_nash');
    const c = chart(e);
    expect(c.sourceLabel).toMatch(/BB vs BTN/);
    expect(c.mix.raise).toBeGreaterThan(0);
    expect(c.mix.call).toBeGreaterThan(0);
  });

  it('숏스택 첫 진입은 푸시·폴드 차트에 걸린다', () => {
    const e = evaluateSpot(base({ tableSize: 6, heroPos: 'BTN', effectiveBb: 10 }));
    expect(e.kind).toBe('chart_nash');
    expect(chart(e).sourceLabel).toMatch(/푸시·폴드 차트/);
  });

  it('9인 UTG 는 9인 표를 본다', () => {
    const c = chart(evaluateSpot(base({ tableSize: 9, heroPos: 'UTG', effectiveBb: 100 })));
    expect(c.sourceLabel).toMatch(/UTG \(9인\)/);
  });
});

describe('normalized_reference — 무엇이 달랐는지 반드시 말한다', () => {
  it('스택이 표와 다르면 유사 스팟으로 내려가고 차이를 적는다', () => {
    const e = evaluateSpot(base({ tableSize: 6, heroPos: 'BTN', effectiveBb: 120 }));
    expect(e.kind).toBe('normalized_reference');
    const c = chart(e);
    expect(c.differences.length).toBeGreaterThan(0);
    expect(c.differences.join(' ')).toMatch(/100BB 기준인데 입력은 120BB/);
    expect(c.notes.join(' ')).toMatch(/120BB/);
  });

  it('앤티가 있으면 차이로 적는다 — 표는 앤티 없는 기준이다', () => {
    const c = chart(evaluateSpot(base({ tableSize: 6, heroPos: 'BTN', effectiveBb: 100, anteBb: 0.125 })));
    expect(c.kind).toBe('normalized_reference');
    expect(c.differences.join(' ')).toMatch(/앤티/);
  });

  it('허용 범위를 크게 벗어난 스택은 유사 스팟으로도 보지 않는다', () => {
    // 200BB 는 100BB 표의 참조 범위 밖 — 억지로 끌어다 쓰지 않는다
    expect(evaluateSpot(base({ tableSize: 6, heroPos: 'BTN', effectiveBb: 200 })).kind).toBe('math_only');
  });

  it('유사 스팟에서는 옳고 그름을 단정하지 않는다 — improve 가 나오지 않는다', () => {
    // 72o 는 어느 오픈 표에서도 빈도 0 이지만, 조건이 다르면 개선 필요라고 말하지 않는다
    const e = evaluateSpot(base({
      tableSize: 6, heroPos: 'BTN', effectiveBb: 120, hero: ['7d', '2c'], heroAction: 'raise', heroActionSizeBb: 2.5,
    }));
    expect(e.kind).toBe('normalized_reference');
    expect(e.verdict).toBe('reference');
    expect(e.verdict).not.toBe('improve');
  });
});

describe('내 선택 평가', () => {
  it('표가 100% 로 미는 선택은 좋은 선택', () => {
    const e = evaluateSpot(base({
      tableSize: 6, heroPos: 'BTN', effectiveBb: 100, hero: ['As', 'Ks'],
      heroAction: 'raise', heroActionSizeBb: 2.5,
    }));
    expect(e.verdict).toBe('good');
  });

  it('표가 0% 로 두는 선택은 정확 일치일 때만 개선 필요', () => {
    const e = evaluateSpot(base({
      tableSize: 6, heroPos: 'BTN', effectiveBb: 100, hero: ['7d', '2c'],
      heroAction: 'raise', heroActionSizeBb: 2.5,
    }));
    expect(e.kind).toBe('chart_nash');
    expect(e.verdict).toBe('improve');
  });

  it('혼합 전략에 든 선택을 오답으로 처리하지 않는다', () => {
    // 9인 UTG 오픈 표에는 25% 로 갈리는 핸드가 실재한다(44·33·22·A4s·98s — ranges.data 실측).
    // 그 액션을 골랐을 때 '개선 필요' 가 나오면, 한쪽만 정답이라고 말하는 것이라 틀렸다.
    const mixedHands = [['4s', '4d'], ['3s', '3d'], ['As', '4s'], ['9s', '8s']];
    let found = 0;
    for (const hero of mixedHands) {
      const probe = chart(evaluateSpot(base({ tableSize: 9, heroPos: 'UTG', effectiveBb: 100, hero })));
      const f = probe.mix.raise;
      if (f <= 0 || f >= 0.5) continue;
      found += 1;
      const e = evaluateSpot(base({
        tableSize: 9, heroPos: 'UTG', effectiveBb: 100, hero, heroAction: 'raise', heroActionSizeBb: 2.2,
      }));
      expect(e.verdict, `${hero.join('')} 빈도 ${f} 인데 오답 처리됐다`).toBe('mixed');
      expect(e.verdict).not.toBe('improve');
      expect(e.notes.join(' ')).toMatch(/갈리는 자리/);
    }
    expect(found, '혼합 빈도 핸드를 하나도 못 찾았다 — 표가 전부 0/1 이면 이 테스트가 무의미하다').toBeGreaterThan(0);
  });

  it('승패 결과는 판정을 바꾸지 않는다', () => {
    const good = { tableSize: 6, heroPos: 'BTN' as const, effectiveBb: 100, hero: ['As', 'Ks'], heroAction: 'raise' as const, heroActionSizeBb: 2.5 };
    const won = evaluateSpot(base({ ...good, result: { won: true, deltaBb: 50 } }));
    const lost = evaluateSpot(base({ ...good, result: { won: false, deltaBb: -50 } }));
    expect(won.verdict).toBe(lost.verdict);
    expect(won.verdict).toBe('good');
  });

  it('내 선택이 없으면 판정하지 않고 표만 보여준다', () => {
    const e = evaluateSpot(base({ tableSize: 6, heroPos: 'BTN', effectiveBb: 100, heroAction: null }));
    expect(chart(e).heroFreq).toBeNull();
    expect(e.verdict).not.toBe('improve');
  });
});

describe('math_only — 추천 액션을 만들지 않는다', () => {
  const flop = base({
    street: 'flop', board: ['7d', '2c', '9h'],
    actions: [
      { street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 2.5 },
      { street: 'preflop', actor: 'villain', type: 'call', sizeBb: 1.5 },
      { street: 'flop', actor: 'villain', type: 'bet', sizeBb: 4 },
    ],
  });

  it('포스트플랍은 수학 참고로 떨어진다 — 검증된 솔버 데이터가 없다', () => {
    const e = evaluateSpot(flop);
    expect(e.kind).toBe('math_only');
    expect(e.verdict).toBe('math');
    expect(e.notes.join(' ')).toMatch(/검증된 포스트플랍 솔버 데이터가 없습니다/);
  });

  it('math_only 결과에는 빈도(mix)가 아예 없다', () => {
    const e = evaluateSpot(flop);
    expect('mix' in e, 'math_only 인데 액션 빈도를 들고 있다').toBe(false);
    expect('heroFreq' in e).toBe(false);
  });

  it('GTO 추천이 아님을 문장으로 말한다', () => {
    expect(evaluateSpot(flop).notes.join(' ')).toMatch(/GTO 추천 액션이 없습니다/);
  });

  it('팟오즈와 필요 승률을 계산한다', () => {
    const e = evaluateSpot(flop);
    // 팟 = 0.5 + 1 + 2.5 + 1.5 + 4 = 9.5, 콜 4 → 4/13.5 = 29.6%
    expect(e.math.potBb).toBe(9.5);
    expect(e.math.toCallBb).toBe(4);
    expect(e.math.neededEquityPct).toBeCloseTo(29.6, 1);
    expect(e.math.potOddsPct).toBe(e.math.neededEquityPct);
  });

  it('앞에 벳이 없으면 팟오즈를 만들지 않는다', () => {
    const e = evaluateSpot(base({ street: 'flop', board: ['7d', '2c', '9h'] }));
    expect(e.math.toCallBb).toBe(0);
    expect(e.math.potOddsPct).toBeNull();
    expect(e.math.neededEquityPct).toBeNull();
    expect(e.notes.join(' ')).toMatch(/팟오즈는 계산하지 않았습니다/);
  });

  it('경계값 — 팟과 같은 크기의 벳은 필요 승률 33.3%', () => {
    const e = evaluateSpot(base({
      street: 'flop', board: ['7d', '2c', '9h'], sbBb: 0.5, anteBb: 0,
      actions: [{ street: 'flop', actor: 'villain', type: 'bet', sizeBb: 1.5 }],
    }));
    expect(e.math.potBb).toBe(3);            // 0.5 + 1 + 1.5
    expect(e.math.neededEquityPct).toBeCloseTo(33.3, 1);
  });

  it('에퀴티를 넘기면 그대로 싣고, 안 넘기면 비운다', () => {
    expect(evaluateSpot(flop).math.heroEquityPct).toBeNull();
    expect(evaluateSpot(flop, { heroEquity: 0.4231 }).math.heroEquityPct).toBe(42.3);
  });
});

describe('unsupported — 분석 범위 밖', () => {
  it('내 카드가 2장이 아니면 액션을 만들지 않는다', () => {
    const e = evaluateSpot(base({ hero: ['As'] }));
    expect(e.kind).toBe('unsupported');
    expect(e.verdict).toBe('out_of_scope');
    expect('mix' in e).toBe(false);
  });

  it('입력 오류가 있으면 그 목록을 그대로 알려준다', () => {
    const e = evaluateSpot(base({ street: 'flop', board: ['As', '2c', '9h'] }));  // As 중복
    expect(e.kind).toBe('unsupported');
    expect(e.notes.join(' ')).toMatch(/같은 카드/);
  });

  it('오류가 있어도 사용자가 입력한 스팟을 잃지 않는다 — 결과에 수학 지표는 남는다', () => {
    const e = evaluateSpot(base({ hero: ['As'] }));
    expect(e.math).toBeDefined();
    expect(typeof e.math.potBb).toBe('number');
  });
});

describe('warn 은 분석을 막지 않는다', () => {
  it('팟 불일치는 경고로 싣고 분석은 계속한다', () => {
    const e = evaluateSpot(base({ tableSize: 6, heroPos: 'BTN', effectiveBb: 100, potBbInput: 99 }));
    expect(e.kind).toBe('chart_nash');
    expect(e.issues.some((i) => i.field === 'pot' && i.level === 'warn')).toBe(true);
  });
});
