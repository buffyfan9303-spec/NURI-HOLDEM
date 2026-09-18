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
import { emptySpot, positionsFor, type SpotReview } from './spot';
import { RANGE_SCENARIOS } from './ranges.data';
import { makeQuiz } from './preflopQuiz';
import {
  evaluateSpot, toTablePos, findDefendChart, findChart, DATASET_VERSION, COVERAGE_LABEL, VERDICT_LABEL,
  CHART_OPEN_BB, CHART_3BET_BB,
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

describe("비슷한 스팟 풀기 — 참조한 그 표만 가리킨다", () => {
  it('RFI 차트에 걸리면 그 시나리오·그 핸드의 트레이너 키를 낸다', () => {
    const e = evaluateSpot(base({ hero: ['As', 'Ks'] }));
    expect(e.kind).toBe('chart_nash');
    if (!('drill' in e) || !e.drill) throw new Error('drill 이 없다');
    expect(e.drill.mode).toBe('rfi');
    // '<접두>|<시나리오>|<핸드>' — makeQuiz 가 복원에 쓰는 그 형식
    expect(e.drill.key).toMatch(/^rfi\|rfi_[a-z0-9]+\|AKs$/);
  });

  it('포스트플랍에는 연습 링크를 만들지 않는다 — 표가 없다', () => {
    const e = evaluateSpot(base({ street: 'flop', board: ['2c', '7d', '9h'] }));
    expect('drill' in e && e.drill).toBeFalsy();
  });

  it('범위 밖(math_only)에는 연습 링크가 없다', () => {
    const e = evaluateSpot(base({ effectiveBb: 300 }));   // 정규화 밴드 밖
    expect(e.kind).toBe('math_only');
    expect('drill' in e).toBe(false);
  });
});

// ── 포지션 축이 어긋나면 그 자리만 조용히 죽는다 ────────────────────────────────
//
// 스팟은 'UTG1', 차트는 'UTG+1' 로 적는다. 9개 중 8개가 겹쳐서 TypeScript 는
// `s.heroPos === x.hero` 비교를 **에러로 잡지 못한다**(겹치는 멤버가 0개여야 잡는다).
// 그래서 UTG+1 한 자리만 어떤 입력으로도 표에 걸리지 않고 math_only 로 떨어졌다.
// 한 자리씩 고른 테스트로는 영원히 안 잡힌다 — **모든 자리를 돌려야** 잡힌다.
describe('9인 모든 자리가 표에 걸린다 — 한 자리만 죽는 것을 잡는다', () => {
  const NINE = positionsFor(9);

  it('자리 이름이 9개 그대로다 — 표기가 바뀌면 여기서 먼저 걸린다', () => {
    expect(NINE).toEqual(['UTG', 'UTG1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
  });

  it('모든 스팟 자리가 차트 축에 실재하는 이름으로 옮겨진다', () => {
    const heroes = new Set(RANGE_SCENARIOS.map((s) => s.hero));
    for (const p of NINE) {
      const t = toTablePos(p);
      expect(t !== null && heroes.has(t), `${p} → ${t} 가 어느 표에도 없다`).toBe(true);
    }
  });

  it('BB 를 뺀 8자리 첫 진입이 전부 9인 오픈 표에 정확히 걸린다', () => {
    for (const p of NINE.filter((x) => x !== 'BB')) {
      const e = evaluateSpot(base({ tableSize: 9, heroPos: p, villainPos: 'BB', effectiveBb: 100 }));
      expect(e.kind, `9인 ${p} 오픈이 표에 안 걸린다`).toBe('chart_nash');
    }
  });

  it('BB 수비가 8자리 상대 전부에 대해 표에 걸린다', () => {
    for (const v of NINE.filter((x) => x !== 'BB')) {
      const e = evaluateSpot(base({
        tableSize: 9, heroPos: 'BB', villainPos: v, effectiveBb: 100,
        actions: [{ street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 2.5 }],
      }));
      expect(['chart_nash', 'normalized_reference'], `BB vs ${v} 가 표에 안 걸린다`).toContain(e.kind);
    }
  });

  it('🔴 오픈 크기 4BB 는 "정확 일치"가 아니라 참고다 — 2.5x 표로 4x 를 채점하지 않는다', () => {
    // 왜: 표들은 스스로 상정 크기를 적어 둔다("2.5bb 오픈"). 그런데 CHART_OPEN_BB 상한이 4 라
    //   4bb 오픈도 chart_nash(정확 일치)로 나갔다. 같은 손의 **필요승률이 27.3% → 35.3% 로 8%p**
    //   벌어지는데(2026-09-17 실측) 그만큼 콜/3벳 비율이 달라진다 — 확신 못 하는 것을 확신한 것이다.
    //   ⚠ 이 계약이 없으면 상한을 되돌려도 아무 테스트가 빨개지지 않는다(그래서 2026-09-17 에 놓쳤다).
    const at = (sizeBb: number) => evaluateSpot(base({
      heroPos: 'BB', villainPos: 'BTN', effectiveBb: 100,
      actions: [{ street: 'preflop', actor: 'villain', type: 'raise', sizeBb }],
    }));
    expect(at(2.5).kind, '표준 2.5x 는 정확 일치여야 한다').toBe('chart_nash');
    expect(at(3).kind, '3x 까지가 정확 일치 상한이다').toBe('chart_nash');
    expect(at(4).kind, '4x 를 정확 일치라고 말하면 안 된다').toBe('normalized_reference');
    expect(chart(at(4)).differences.join(' '), '무엇이 다른지 유저에게 말해야 한다').toMatch(/오픈/);
    expect(CHART_OPEN_BB[1], '상한을 다시 올리려면 이 계약을 먼저 고쳐라').toBe(3);
  });

  it('9인 얼리 3벳·vs3벳 표에 "6인 기준" 거짓 차이가 붙지 않는다', () => {
    // 왜: 두 표는 desc 가 "9인 ·" 이라고 적어 놓고 baseTableSize 가 없어 엔진이 6인으로 단정했다.
    //   그래서 9인 입력에 "이 표는 6인 기준인데 입력은 9인입니다" 라는 **없는 사실**이 붙고 등급이 내려갔다.
    // ⚠ heroAction 이 'raise' 면 `heroActionSizeBb` 가 **필수**다(validateSpot 의 blocker) —
    //   안 넣으면 unsupported 로 떨어져 이 계약이 거짓 통과한다(2026-09-17 에 실제로 한 번 밟았다).
    const e = evaluateSpot(base({
      tableSize: 9, heroPos: 'CO', villainPos: 'UTG', effectiveBb: 100,
      actions: [{ street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 2.5 }],
      heroAction: 'raise', heroActionSizeBb: 8,
    }));
    const c = chart(e);
    expect(c.differences.join(' '), '9인 입력에 6인 기준이라는 거짓 문장이 붙었다').not.toMatch(/6인/);
    expect(c.sourceLabel, 'CO 3벳 표에 걸려야 한다').toMatch(/3벳/);
  });

  it('UTG+1 은 UTG·MP 가 아니라 제 표를 본다 — 이웃 표로 때우지 않는다', () => {
    const c = chart(evaluateSpot(base({ tableSize: 9, heroPos: 'UTG1', villainPos: 'BB', effectiveBb: 100 })));
    expect(c.sourceLabel).toMatch(/UTG\+1/);
    expect(c.differences).toEqual([]);
  });

  it('UTG+1 의 연습 링크가 그 표의 문제를 복원한다 — 무관한 문제를 내지 않는다', () => {
    // makeQuiz 는 키 복원에 실패하면 **조용히** 다른 문제를 낸다. 그게 CTA 를 거짓말로 만든다.
    const e = evaluateSpot(base({ tableSize: 9, heroPos: 'UTG1', villainPos: 'BB', effectiveBb: 100, hero: ['As', 'Ks'] }));
    if (!('drill' in e) || !e.drill) throw new Error('drill 이 없다');
    const q = makeQuiz(e.drill.mode, e.drill.key);
    expect(q.key, '키가 복원되지 않아 다른 문제가 나왔다').toBe(e.drill.key);
    expect(q.posLabel).toMatch(/UTG\+1/);
  });
});

// ── 이미 낸 블라인드를 빼는가 ──────────────────────────────────────────────────
//
// 빌런의 레이즈 크기는 "얼마까지 올렸나"(총액)다. BB 는 이미 1BB 를 냈으므로
// 2.5x 오픈에 콜하려면 **1.5 만 더** 넣는다. 총액을 그대로 콜 금액으로 쓰면
// 필요 승률이 38.5% 로 나와, 실제 27.3% 면 충분한 핸드를 폴드하라고 말하게 된다.
describe('콜 금액은 이미 낸 돈을 뺀 나머지다', () => {
  const open = (heroPos: 'BB' | 'SB', to: number) => base({
    street: 'preflop', tableSize: 6, heroPos, villainPos: 'BTN', sbBb: 0.5, anteBb: 0,
    effectiveBb: 100,
    actions: [{ street: 'preflop', actor: 'villain', type: 'raise', sizeBb: to }],
  });

  it('BB 는 2.5x 오픈에 1.5 만 더 넣는다 — 필요 승률 27.3%', () => {
    const e = evaluateSpot(open('BB', 2.5));
    expect(e.math.potBb).toBe(4);                      // 0.5 + 1 + 2.5
    expect(e.math.toCallBb, '블라인드 1BB 를 빼지 않았다').toBe(1.5);
    expect(e.math.neededEquityPct).toBeCloseTo(27.3, 1);
    expect(e.math.neededEquityPct).not.toBeCloseTo(38.5, 1);
  });

  it('SB 는 자기가 낸 0.5 만 빠진다 — BB 보다 많이 넣어야 한다', () => {
    const e = evaluateSpot(open('SB', 2.5));
    expect(e.math.toCallBb).toBe(2);                   // 2.5 − 0.5
    expect(e.math.toCallBb).toBeGreaterThan(evaluateSpot(open('BB', 2.5)).math.toCallBb);
  });

  it('블라인드를 안 낸 자리는 총액을 그대로 넣는다', () => {
    const e = evaluateSpot(base({
      street: 'preflop', tableSize: 6, heroPos: 'CO', villainPos: 'BTN',
      sbBb: 0.5, anteBb: 0, effectiveBb: 100,
      actions: [{ street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 2.5 }],
    }));
    expect(e.math.toCallBb).toBe(2.5);
  });

  it('BB 가 콜한 뒤 포스트플랍 벳은 블라인드와 무관하다 — 스트리트가 바뀌면 0부터', () => {
    const e = evaluateSpot(base({
      street: 'flop', board: ['7d', '2c', '9h'], tableSize: 6,
      heroPos: 'BB', villainPos: 'BTN', sbBb: 0.5, anteBb: 0, effectiveBb: 100,
      actions: [
        { street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 2.5 },
        { street: 'preflop', actor: 'hero', type: 'call', sizeBb: 1.5 },
        { street: 'flop', actor: 'villain', type: 'bet', sizeBb: 3 },
      ],
    }));
    expect(e.math.toCallBb, '지난 스트리트의 블라인드를 이번 콜에서 또 뺐다').toBe(3);
  });

  it('필요 승률은 절대 100% 를 넘지 않는다 — 뺄셈이 음수로 가지 않는다', () => {
    const e = evaluateSpot(open('BB', 1));   // 레이즈 총액이 블라인드와 같다
    expect(e.math.toCallBb).toBe(0);
    expect(e.math.neededEquityPct).toBeNull();
  });
});

// ── 한 스트리트에 레이즈가 오갈 때 ──────────────────────────────────────────────
//
// `sizeBb` 는 "이번에 추가로 넣은 돈"(증분)이다 — `potBb` 가 블라인드에 모든 액션 금액을
// 그냥 더하는 것이 그 증거다. 그래서 콜 금액은 **양쪽 총액의 차이**여야 한다.
// 빌런의 마지막 증분만 보면 레이즈가 두 번 오간 순간부터 틀린다.
describe('콜 금액은 양쪽 총액의 차이다 — 마지막 증분이 아니라', () => {
  it('플랍에서 히어로 10 벳 → 빌런 30 레이즈면 히어로는 20 을 더 넣는다', () => {
    const e = evaluateSpot(base({
      street: 'flop', board: ['7d', '2c', '9h'], tableSize: 6,
      heroPos: 'BTN', villainPos: 'CO', sbBb: 0.5, anteBb: 0, effectiveBb: 200,
      actions: [
        { street: 'flop', actor: 'hero', type: 'bet', sizeBb: 10 },
        { street: 'flop', actor: 'villain', type: 'raise', sizeBb: 30 },
      ],
    }));
    expect(e.math.toCallBb, '히어로가 이미 낸 10 을 빼지 않았다').toBe(20);
  });

  it('프리플랍 3벳·4벳이 오가면 블라인드와 증분을 모두 센다', () => {
    // BTN 오픈 +2.5 → BB 3벳 +8(총 9) → BTN 4벳 +22(총 24.5). BB 가 더 넣을 돈은 15.5.
    const e = evaluateSpot(base({
      street: 'preflop', tableSize: 6, heroPos: 'BB', villainPos: 'BTN',
      sbBb: 0.5, anteBb: 0, effectiveBb: 200,
      actions: [
        { street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 2.5 },
        { street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 8 },
        { street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 22 },
      ],
    }));
    expect(e.math.toCallBb, '빌런의 마지막 증분만 보고 있다').toBe(15.5);
  });

  it('히어로가 이미 맞춰 냈으면 콜 금액은 0 이다', () => {
    const e = evaluateSpot(base({
      street: 'flop', board: ['7d', '2c', '9h'], tableSize: 6,
      heroPos: 'BTN', villainPos: 'CO', sbBb: 0.5, anteBb: 0, effectiveBb: 200,
      actions: [
        { street: 'flop', actor: 'villain', type: 'bet', sizeBb: 6 },
        { street: 'flop', actor: 'hero', type: 'call', sizeBb: 6 },
      ],
    }));
    expect(e.math.toCallBb).toBe(0);
    expect(e.math.neededEquityPct).toBeNull();
  });

  it('SB 는 BB 와의 차액만 채우면 된다 — 아무도 레이즈하지 않았을 때', () => {
    const e = evaluateSpot(base({
      street: 'preflop', tableSize: 6, heroPos: 'SB', villainPos: 'BB',
      sbBb: 0.5, anteBb: 0, effectiveBb: 100, actions: [],
    }));
    expect(e.math.toCallBb, 'SB 가 이미 낸 0.5 를 빼지 않았다').toBe(0.5);
  });

  it('히어로가 벳했는데 빌런이 아직 안 받았으면 콜 금액이 없다', () => {
    const e = evaluateSpot(base({
      street: 'flop', board: ['7d', '2c', '9h'], tableSize: 6,
      heroPos: 'BTN', villainPos: 'CO', sbBb: 0.5, anteBb: 0, effectiveBb: 200,
      actions: [{ street: 'flop', actor: 'hero', type: 'bet', sizeBb: 10 }],
    }));
    expect(e.math.toCallBb).toBe(0);
  });

  it('지난 스트리트의 투입액은 이번 콜에 섞이지 않는다', () => {
    const e = evaluateSpot(base({
      street: 'turn', board: ['7d', '2c', '9h', 'Kd'], tableSize: 6,
      heroPos: 'BB', villainPos: 'BTN', sbBb: 0.5, anteBb: 0, effectiveBb: 200,
      actions: [
        { street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 2.5 },
        { street: 'preflop', actor: 'hero', type: 'call', sizeBb: 1.5 },
        { street: 'flop', actor: 'villain', type: 'bet', sizeBb: 4 },
        { street: 'flop', actor: 'hero', type: 'call', sizeBb: 4 },
        { street: 'turn', actor: 'villain', type: 'bet', sizeBb: 12 },
      ],
    }));
    expect(e.math.toCallBb, '지난 스트리트 금액이 섞였다').toBe(12);
  });
});

// ── BB 수비 표를 배열 순서로 고르고 있지 않은가 ────────────────────────────────
//
// defend 그룹에는 같은 vs 로 BB 표와 SB 표가 둘 다 있다(bb_vs_btn · sb_vs_btn).
// hero 를 안 걸어도 **지금 데이터는** BB 가 앞에 있어서 맞는다 — 그래서 실제 배열로만 재면
// 이 결함은 절대 안 잡힌다. 순서를 뒤집은 사본으로 재야 잡힌다.
describe('BB 수비 표는 배열 순서가 아니라 hero 로 고른다', () => {
  it('같은 vs 에 BB 표와 SB 표가 실제로 둘 다 있다 — 모호성이 실재한다', () => {
    for (const vs of ['BTN', 'CO', 'HJ', 'LJ', 'UTG', 'UTG+1', 'MP'] as const) {
      const heroes = RANGE_SCENARIOS
        .filter((x) => x.group === 'defend' && x.vs === vs)
        .map((x) => x.hero).sort();
      expect(heroes, `vs ${vs} 에 BB·SB 표가 둘 다 있지 않다`).toEqual(['BB', 'SB']);
    }
  });

  it('순서를 뒤집어 SB 표가 앞에 와도 BB 표를 고른다', () => {
    const reversed = [...RANGE_SCENARIOS].reverse();
    for (const vs of ['BTN', 'CO', 'HJ', 'LJ', 'UTG', 'MP'] as const) {
      const sc = findDefendChart(reversed, vs);
      expect(sc?.hero, `vs ${vs} 에서 SB 표를 집었다 — 배열 순서에 기대고 있다`).toBe('BB');
      expect(sc?.vs).toBe(vs);
    }
  });

  it('UTG+1 도 뒤집힌 순서에서 제 BB 표를 고른다 — 경계 변환과 hero 필터가 함께 걸린다', () => {
    const sc = findDefendChart([...RANGE_SCENARIOS].reverse(), 'UTG1');
    expect(sc?.hero).toBe('BB');
    expect(sc?.vs).toBe('UTG+1');
  });

  it('실제 배열에서도 같은 답을 준다 — 뒤집은 사본에서만 맞는 것이 아니다', () => {
    for (const vs of ['BTN', 'UTG1', 'MP'] as const) {
      expect(findDefendChart(RANGE_SCENARIOS, vs)?.id)
        .toBe(findDefendChart([...RANGE_SCENARIOS].reverse(), vs)?.id);
    }
  });
});

describe('표가 상정한 인원을 표 자신에게 묻는다', () => {
  it('얼리 오픈 수비 표는 9인용이다 — 9인 입력에 없는 차이를 적지 않는다', () => {
    for (const v of ['UTG', 'UTG1', 'MP'] as const) {
      const c = chart(evaluateSpot(base({
        tableSize: 9, heroPos: 'BB', villainPos: v, effectiveBb: 100,
        actions: [{ street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 2.5 }],
      })));
      expect(c.differences.join(' '), `BB vs ${v} 에 6인 기준이라는 거짓 차이가 붙었다`).not.toMatch(/6인 기준/);
      expect(c.kind).toBe('chart_nash');
    }
  });

  it('6인용 표를 9인에 쓰면 그 차이는 그대로 적는다 — 차이를 숨기지도 않는다', () => {
    const c = chart(evaluateSpot(base({
      tableSize: 9, heroPos: 'BB', villainPos: 'BTN', effectiveBb: 100,
      actions: [{ street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 2.5 }],
    })));
    expect(c.kind).toBe('normalized_reference');
    expect(c.differences.join(' ')).toMatch(/6인 기준인데 입력은 9인/);
  });
});

// ── 10인 테이블 (2026-09-14 오너 요청) ────────────────────────────────────────
//
// 10인 표는 저장소에 없다. 그래서 10인은 (1) 9인 표를 **차이를 적고** 참조하거나 (2) 자리가 표에 없으면
// Nash/math_only 로 정직하게 떨어진다. UTG2 를 이웃 표(UTG+1)로 접지 않는 것이 이 블록이 잠그는 것이다.
describe('10인 테이블 — 없는 표를 있는 것처럼 보여 주지 않는다', () => {
  const open = { effectiveBb: 100, villainPos: 'BB' as const };

  it('UTG2 는 차트 축에 대응이 없다', () => {
    expect(toTablePos('UTG2')).toBeNull();
    expect(toTablePos('UTG1')).toBe('UTG+1');
    expect(findDefendChart(RANGE_SCENARIOS, 'UTG2')).toBeNull();
  });

  it('10인 UTG2 첫 진입(100BB)은 표가 없어 math_only — 이웃 표로 때우지 않는다', () => {
    const e = evaluateSpot(base({ tableSize: 10, heroPos: 'UTG2', ...open }));
    expect(e.kind).toBe('math_only');
  });

  it('10인 UTG·UTG1 은 9인 표를 참조하되 뒤 인원이 1명 많다는 차이를 적고, 개선 필요로 단정하지 않는다', () => {
    for (const p of ['UTG', 'UTG1'] as const) {
      const c = chart(evaluateSpot(base({
        tableSize: 10, heroPos: p, ...open, hero: ['7d', '2c'], heroAction: 'raise', heroActionSizeBb: 2.5,
      })));
      expect(c.kind).toBe('normalized_reference');
      expect(c.differences.join(' ')).toMatch(/9인 기준인데 입력은 10인/);
      expect(c.differences.join(' ')).toMatch(/뒤 인원이 1명 더 많/);
      expect(c.verdict, `${p} 72o 오픈이 유사 스팟인데 '개선 필요' 로 단정됐다`).not.toBe('improve');
    }
  });

  it('10인 MP 이하는 9인 표와 뒤 인원이 같다 — 인원 차이만 적고 뒤 인원 문구는 없다', () => {
    for (const p of ['MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB'] as const) {
      const c = chart(evaluateSpot(base({ tableSize: 10, heroPos: p, ...open })));
      expect(c.kind).toBe('normalized_reference');
      expect(c.differences.join(' ')).toMatch(/9인 기준인데 입력은 10인/);
      expect(c.differences.join(' '), `${p} 에 없는 뒤 인원 차이가 붙었다`).not.toMatch(/뒤 인원/);
    }
  });

  it('BB 수비 vs 10인 UTG 도 상대 자리의 뒤 인원 차이를 적는다', () => {
    const c = chart(evaluateSpot(base({
      tableSize: 10, heroPos: 'BB', villainPos: 'UTG', effectiveBb: 100,
      actions: [{ street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 2.5 }],
    })));
    expect(c.kind).toBe('normalized_reference');
    expect(c.differences.join(' ')).toMatch(/상대 자리 UTG .*1명 더 많/);
  });

  it('숏스택 10인: UTG 는 뒤 9명이라 Nash 범위 밖(math_only), UTG2 는 뒤 7명 표에 정확히 걸린다', () => {
    expect(evaluateSpot(base({ tableSize: 10, heroPos: 'UTG', villainPos: 'BB', effectiveBb: 10 })).kind).toBe('math_only');
    const c = chart(evaluateSpot(base({ tableSize: 10, heroPos: 'UTG2', villainPos: 'BB', effectiveBb: 10 })));
    expect(c.kind).toBe('chart_nash');
    expect(c.sourceLabel).toMatch(/뒤 7명/);
  });

  it('9인 이하 결과는 10인 추가 전과 같다 — 9인 8자리 오픈이 전부 정확 일치', () => {
    for (const p of positionsFor(9).filter((x) => x !== 'BB')) {
      expect(evaluateSpot(base({ tableSize: 9, heroPos: p, ...open })).kind, `9인 ${p}`).toBe('chart_nash');
    }
    expect(evaluateSpot(base({ tableSize: 6, heroPos: 'BTN', ...open })).kind).toBe('chart_nash');
  });
});

// ── 앤티 = BB앤티 총액 (2026-09-14 오너 확정) ─────────────────────────────────
describe('앤티는 BB 한 명이 내는 총액이다', () => {
  it('10인·앤티 1BB 의 프리플랍 팟은 2.5BB — 인원을 곱하면 11.5 가 된다', () => {
    const e = evaluateSpot(base({ tableSize: 10, heroPos: 'CO', villainPos: 'BB', effectiveBb: 20, anteBb: 1 }));
    expect(e.math.potBb).toBe(2.5);
  });

  it('BB앤티 1BB 는 Nash 앤티 표에 정확히 걸린다', () => {
    const c = chart(evaluateSpot(base({ tableSize: 9, heroPos: 'CO', villainPos: 'BB', effectiveBb: 20, anteBb: 1 })));
    expect(c.kind).toBe('chart_nash');
    expect(c.sourceLabel).toMatch(/BB앤티/);
  });

  it('BB앤티 0.5BB 는 1BB 표를 참조하되 그 차이를 반드시 적는다 — 없는 0.5BB 표를 있는 척하지 않는다', () => {
    const c = chart(evaluateSpot(base({ tableSize: 9, heroPos: 'CO', villainPos: 'BB', effectiveBb: 20, anteBb: 0.5 })));
    expect(c.kind).toBe('normalized_reference');
    expect(c.differences.join(' ')).toMatch(/BB앤티 1BB 기준인데 입력 앤티는 0\.5BB/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3벳 · vs3벳 · SB 수비 표 연결 (2026-09-17)
//
// 여기서 잠그는 것은 넷이다:
//  ⑧ 표가 상정한 **오픈 크기**를 벗어나면 "정확 일치" 라고 말하지 않는다
//  ⑨ 공격 갈래의 키는 표마다 다르다 — vs3bet 12표는 'raise' 가 아니라 'fourbet' 이다
//  ⑩ 표가 **담지 않은 갈래**는 빈도 0 이 아니라 침묵이다 — 판정하지 않는다
//  ⑪ 라우팅(어느 표를 보는가)이 같은 선택의 **판정을 뒤집지 않는다**
// ════════════════════════════════════════════════════════════════════════════

/** 프리플랍 오픈 하나를 앞에 둔 스팟 */
const facingOpen = (over: Partial<SpotReview> & { villainRaiseBb: number }): SpotReview => {
  const { villainRaiseBb, ...rest } = over;
  return base({
    street: 'preflop', tableSize: 6, effectiveBb: 100, sbBb: 0.5, anteBb: 0,
    actions: [{ street: 'preflop', actor: 'villain', type: 'raise', sizeBb: villainRaiseBb }],
    ...rest,
  });
};

describe('⑧ 오픈 크기를 무시하고 정확 일치라고 말하지 않는다', () => {
  // 2026-09-17 라이브 실측 결함: BB vs BTN · AKs · 100BB 가 open 2.5bb 와 open 25bb 에서
  // **둘 다 chart_nash(정확 일치) · 차이 없음** 이었다. 돈이 걸린 조언이다.
  const bbVsBtn = (to: number) => evaluateSpot(facingOpen({
    heroPos: 'BB', villainPos: 'BTN', hero: ['As', 'Ks'], villainRaiseBb: to,
  }));

  it('표준 크기(2.5bb·3bb) 오픈은 정확 일치 그대로다 — 고치면서 되레 좁히지 않았다', () => {
    for (const to of [2.5, 3]) {
      const e = bbVsBtn(to);
      expect(e.kind, `open ${to}bb`).toBe('chart_nash');
      expect(chart(e).differences).toEqual([]);
    }
  });

  it('밴드를 벗어난 오픈은 유사 스팟으로 내려가고 그 크기를 적는다', () => {
    const e = bbVsBtn(5);
    expect(e.kind).toBe('normalized_reference');
    expect(chart(e).differences.join(' ')).toMatch(/상대 오픈 .*기준인데 입력은 5BB/);
  });

  it('25bb 오픈은 그 표가 푸는 문제가 아니다 — 유사 스팟으로도 보지 않는다', () => {
    const e = bbVsBtn(25);
    expect(e.kind, '25bb 오픈에 차트 판정을 붙였다').toBe('math_only');
    expect(e.verdict).toBe('math');
    // 같은 스팟이 크기에 따라 실제로 다른 답을 내는지 — 같으면 이 테스트가 무의미하다
    expect(bbVsBtn(2.5).math.neededEquityPct).not.toBe(e.math.neededEquityPct);
  });

  it('오픈 크기는 증분이 아니라 **그 스트리트 총액**으로 잰다 — SB 오픈만 어긋나던 자리', () => {
    // SB 는 0.5 를 이미 냈다. sizeBb 4 는 "4 를 더 넣었다" 이므로 총액은 4.5 — 밴드 밖이다.
    // 증분(4)으로 재면 밴드 안이라 정확 일치로 통과해 버린다.
    const e = evaluateSpot(facingOpen({
      heroPos: 'BB', villainPos: 'SB', hero: ['As', 'Ks'], villainRaiseBb: 4,
    }));
    expect(e.kind, '증분(4BB)만 보고 총액 4.5BB 를 놓쳤다').toBe('normalized_reference');
    expect(chart(e).differences.join(' ')).toMatch(/입력은 4\.5BB/);
  });

  it('엔진의 밴드가 같은 데이터에서 뽑힌 preflopQuiz 의 상대 크기를 포함한다', () => {
    // ranges.data 에는 오픈 크기를 담는 **구조화된 필드가 없다**(산문 desc/note 뿐).
    // preflopQuiz.vsOf 가 같은 산문에서 뽑아 둔 값이 저장소의 다른 한 벌이므로, 둘이 갈리면 잡는다.
    const cases: [Parameters<typeof makeQuiz>[0], string, readonly [number, number]][] = [
      ['defend', 'def|bb_vs_btn|AKs', CHART_OPEN_BB],     // 2.5
      ['defend', 'def|bb_vs_sb|AKs', CHART_OPEN_BB],      // 3 (SB 오픈)
      ['threebet', '3b|co_3bet_lj|AKs', CHART_OPEN_BB],   // 2.5
      ['vs3bet', 'v3b|btn_vs_bb3bet|AKs', CHART_3BET_BB], // 8
    ];
    for (const [mode, key, band] of cases) {
      const bb = makeQuiz(mode, key).vs?.bb;
      expect(typeof bb, `${key} 에 상대 크기가 없다`).toBe('number');
      expect(bb as number, `${key} 상대 ${bb}BB 가 엔진 밴드 ${band.join('~')} 밖이다`)
        .toBeGreaterThanOrEqual(band[0]);
      expect(bb as number).toBeLessThanOrEqual(band[1]);
    }
  });
});

describe('⑨ 공격 갈래의 키는 표마다 다르다 — 없는 키에 조용히 0 을 주지 않는다', () => {
  it('데이터 사실: vs3bet 12표의 공격 키는 전부 fourbet 이고 raise 는 하나도 없다', () => {
    const v3 = RANGE_SCENARIOS.filter((s) => s.group === 'vs3bet');
    expect(v3.length).toBe(12);
    for (const s of v3) {
      const keys = s.actions.map((a) => a.key);
      expect(keys, `${s.id} 에 fourbet 갈래가 없다`).toContain('fourbet');
      expect(keys, `${s.id} 가 raise 키를 쓴다 — 이 테스트의 전제가 깨졌다`).not.toContain('raise');
    }
  });

  it('4벳한 사람이 "레이즈 0%" 를 받지 않는다 — fourbet 갈래를 레이즈 칸으로 읽는다', () => {
    // BTN 오픈 2.5 → BB 3벳 +8(총 9) → BTN 의 4벳. AKs 는 btn_vs_bb3bet 의 fourbet 갈래에 실재한다.
    const e = evaluateSpot(base({
      street: 'preflop', tableSize: 6, heroPos: 'BTN', villainPos: 'BB',
      effectiveBb: 100, sbBb: 0.5, anteBb: 0, hero: ['As', 'Ks'],
      actions: [
        { street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 2.5 },
        { street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 8 },
      ],
      heroAction: 'raise', heroActionSizeBb: 20,
    }));
    const c = chart(e);
    expect(c.sourceLabel).toMatch(/BTN vs BB 3벳/);
    expect(c.mix.raise, 'fourbet 갈래를 못 읽어 0 이 나왔다').toBeGreaterThan(0);
    expect(c.heroFreq).toBe(c.mix.raise);
    expect(e.verdict, '표가 담은 4벳인데 오답 처리됐다').not.toBe('improve');
  });

  it('vs3bet 12표 전부가 fourbet 갈래를 갖고 연습 키가 복원된다 — 한 표만 죽는 것을 잡는다', () => {
    for (const sc of RANGE_SCENARIOS.filter((s) => s.group === 'vs3bet')) {
      expect(sc.actions.find((a) => a.key === 'fourbet'), `${sc.id} 에 fourbet 이 없다`).toBeDefined();
      expect(makeQuiz('vs3bet', `v3b|${sc.id}|AKs`).key).toBe(`v3b|${sc.id}|AKs`);
    }
  });
});

describe('⑩ 표가 담지 않은 갈래는 빈도 0 이 아니라 침묵이다', () => {
  it('데이터 사실: 3벳 23표에는 콜 갈래가 없다', () => {
    const tb = RANGE_SCENARIOS.filter((s) => s.group === 'threebet');
    expect(tb.length).toBe(23);
    for (const s of tb) {
      expect(s.actions.map((a) => a.key), `${s.id} 에 콜 갈래가 생겼다`).not.toContain('call');
    }
  });

  it('3벳 표에 걸린 플랫콜은 absent 로 표시되고 판정하지 않는다', () => {
    const e = evaluateSpot(facingOpen({
      heroPos: 'CO', villainPos: 'LJ', hero: ['Ah', '9h'],
      villainRaiseBb: 2.5, heroAction: 'call', heroActionSizeBb: 2.5,
    }));
    const c = chart(e);
    expect(c.sourceLabel).toMatch(/CO 3벳 vs LJ/);
    expect(c.absent, '콜·폴드를 담지 않은 표인데 absent 가 비어 있다').toEqual(['call', 'fold']);
    expect(c.heroFreq, '표가 말하지 않은 갈래에 빈도를 붙였다').toBeNull();
    expect(e.verdict).toBe('reference');
    expect(e.verdict, '표가 침묵하는 선택을 오답으로 단정했다').not.toBe('improve');
    expect(e.notes.join(' ')).toMatch(/갈래를 담지 않습니다/);
  });

  it('침묵한 갈래의 mix 는 0 이지만 그 0 을 빈도로 읽으면 안 된다 — 합이 1 이 아니다', () => {
    const c = chart(evaluateSpot(facingOpen({
      heroPos: 'CO', villainPos: 'LJ', hero: ['Ah', '9h'], villainRaiseBb: 2.5,
    })));
    expect(c.mix.fold).toBe(0);
    expect(c.mix.call).toBe(0);
    // 잔여를 폴드로 채웠다면 합이 1 이 된다 — 그게 표가 한 적 없는 주장을 엔진이 지어내는 것이다
    expect(c.mix.fold + c.mix.call + c.mix.raise, '잔여를 폴드로 지어냈다').toBeLessThan(1);
  });

  it('콜 갈래가 **있는** 표에서는 침묵이 없다 — absent 가 남용되지 않는다', () => {
    const c = chart(evaluateSpot(facingOpen({
      heroPos: 'BB', villainPos: 'BTN', hero: ['Ah', '9h'],
      villainRaiseBb: 2.5, heroAction: 'call', heroActionSizeBb: 1.5,
    })));
    expect(c.absent).toEqual([]);
    expect(c.heroFreq).not.toBeNull();
    expect(c.mix.fold + c.mix.call + c.mix.raise).toBeCloseTo(1, 6);
  });

  it('첫 진입(RFI·푸시폴드)의 잔여는 폴드로 확정된다 — 콜할 대상이 없다', () => {
    for (const bb of [100, 10]) {
      const c = chart(evaluateSpot(base({ tableSize: 6, heroPos: 'BTN', effectiveBb: bb })));
      expect(c.absent, `${bb}BB 첫 진입에 침묵이 붙었다`).toEqual([]);
      expect(c.mix.fold + c.mix.call + c.mix.raise).toBeCloseTo(1, 6);
    }
  });
});

describe('⑪ 어느 표를 보는가가 같은 선택의 판정을 뒤집지 않는다', () => {
  // 3벳 표에는 콜 갈래가 없다. 잔여를 폴드로 채워 이어 붙이면 **같은 플랫콜**이
  // BB 에서는 '좋은 선택', CO 에서는 '개선 필요' 가 된다 — 라우팅이 판정을 뒤집는다.
  it('같은 플랫콜이 자리만 바뀌어 오답이 되지 않는다', () => {
    const seats: [SpotReview['heroPos'], SpotReview['villainPos']][] = [
      ['BB', 'BTN'], ['SB', 'BTN'], ['BTN', 'CO'], ['CO', 'LJ'], ['HJ', 'LJ'],
    ];
    let hit = 0;
    for (const [heroPos, villainPos] of seats) {
      const e = evaluateSpot(facingOpen({
        heroPos, villainPos, hero: ['Ah', '9h'], villainRaiseBb: 2.5,
        heroAction: 'call', heroActionSizeBb: 2.5,
      }));
      if (e.kind !== 'chart_nash' && e.kind !== 'normalized_reference') continue;
      hit += 1;
      expect(e.verdict, `${heroPos} vs ${villainPos} 의 플랫콜이 오답 처리됐다`).not.toBe('improve');
    }
    expect(hit, '표에 걸린 자리가 하나도 없다 — 이 테스트가 무의미하다').toBeGreaterThanOrEqual(4);
  });

  it('SB 수비 표가 열렸다 — 예전에는 BB 만 표를 봤다', () => {
    for (const v of ['BTN', 'CO', 'HJ', 'LJ'] as const) {
      const e = evaluateSpot(facingOpen({ heroPos: 'SB', villainPos: v, villainRaiseBb: 2.5 }));
      expect(['chart_nash', 'normalized_reference'], `SB vs ${v} 가 표에 안 걸린다`).toContain(e.kind);
      expect(chart(e).sourceLabel, 'SB 인데 BB 표를 봤다').toMatch(new RegExp(`SB vs ${v}`));
    }
  });

  it('오픈이 내 뒤에서 나온 불가능한 순서는 표를 만들지 않는다', () => {
    // CO 히어로가 BTN 의 오픈을 마주할 수는 없다(CO 가 먼저 액션한다). 그런 표도 없다.
    const e = evaluateSpot(facingOpen({ heroPos: 'CO', villainPos: 'BTN', villainRaiseBb: 2.5 }));
    expect(e.kind, '없는 자리 조합에 이웃 표를 끌어다 썼다').toBe('math_only');
  });

  it('상대를 특정하지 않은 vs3bet 표를 쓸 때는 그 사실을 차이로 적는다', () => {
    // 히어로 LJ 에는 상대별 표가 없고 'LJ vs 3벳' 한 장뿐이다.
    const c = chart(evaluateSpot(base({
      street: 'preflop', tableSize: 6, heroPos: 'LJ', villainPos: 'BTN',
      effectiveBb: 100, sbBb: 0.5, anteBb: 0, hero: ['As', 'Ks'],
      actions: [
        { street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 2.5 },
        { street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 8 },
      ],
    })));
    expect(c.kind).toBe('normalized_reference');
    expect(c.differences.join(' ')).toMatch(/3벳한 사람을 특정하지 않습니다/);
  });

  it('표는 배열 순서가 아니라 group·hero·vs 로 고른다 — 뒤집어도 같은 답', () => {
    const reversed = [...RANGE_SCENARIOS].reverse();
    const cases: [Parameters<typeof findChart>[1], Parameters<typeof findChart>[2], Parameters<typeof findChart>[3]][] = [
      ['threebet', 'CO', 'LJ'], ['threebet', 'BTN', 'UTG'],
      ['vs3bet', 'BTN', 'BB'], ['vs3bet', 'LJ', undefined],
      ['defend', 'SB', 'BTN'], ['defend', 'BB', 'BTN'],
    ];
    for (const [g, h, v] of cases) {
      const a = findChart(RANGE_SCENARIOS, g, h, v);
      const b = findChart(reversed, g, h, v);
      expect(a?.id, `${g}/${h}/${v} 가 배열 순서에 기댄다`).toBe(b?.id);
      expect(a?.id, `${g}/${h}/${v} 가 표를 못 찾는다`).toBeTruthy();
    }
  });

  it('상대를 특정한 표가 있으면 특정하지 않은 표보다 우선한다', () => {
    expect(findChart(RANGE_SCENARIOS, 'vs3bet', 'BTN', 'BB')?.id).toBe('btn_vs_bb3bet');
    expect(findChart(RANGE_SCENARIOS, 'vs3bet', 'BTN', undefined), 'BTN 에 vs 생략 표는 없다').toBeNull();
    expect(findChart(RANGE_SCENARIOS, 'vs3bet', 'LJ', undefined)?.id).toBe('lj_vs_3bet');
  });
});

describe('도달 범위 — 고친 뒤 실제로 몇 장을 보는가', () => {
  /** 프리플랍 스팟을 훑어 실제로 참조된 표 id 를 모은다 */
  function reachedIds(): Set<string> {
    const labelToId = new Map(RANGE_SCENARIOS.map((s) => [s.label, s.id]));
    const seqs: SpotReview['actions'][] = [
      [],
      [{ street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 2.5 }],
      [{ street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 2.5 },
       { street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 8 }],
    ];
    const out = new Set<string>();
    for (let n = 2; n <= 10; n++) {
      for (const heroPos of positionsFor(n)) for (const villainPos of positionsFor(n)) {
        if (heroPos === villainPos) continue;
        for (const actions of seqs) {
          const e = evaluateSpot(base({
            street: 'preflop', tableSize: n, heroPos, villainPos,
            effectiveBb: 100, sbBb: 0.5, anteBb: 0, actions,
          }));
          if (e.kind !== 'chart_nash' && e.kind !== 'normalized_reference') continue;
          const st = e.sourceLabel.replace(/^프리플랍 레인지 차트 · /, '');
          const id = labelToId.get(st) ?? labelToId.get(st.replace(/ 오픈$/, ''));
          if (id) out.add(id);
        }
      }
    }
    return out;
  }

  it('63표 중 61표에 도달한다 — 연결 전은 21표였다', () => {
    const reached = reachedIds();
    expect(RANGE_SCENARIOS.length).toBe(63);
    expect(reached.size, '도달 범위가 줄었다').toBeGreaterThanOrEqual(61);
    for (const g of ['rfi6', 'rfi9', 'defend', 'vs3bet'] as const) {
      const all = RANGE_SCENARIOS.filter((s) => s.group === g);
      const missed = all.filter((s) => !reached.has(s.id)).map((s) => s.id);
      expect(missed, `${g} 에 도달 못 한 표가 있다`).toEqual([]);
    }
  });

  it('도달 못 하는 2표는 SB 3벳 표뿐이고, 그 자리는 더 많은 것을 담은 수비 표가 대신한다', () => {
    const reached = reachedIds();
    const missed = RANGE_SCENARIOS.filter((s) => !reached.has(s.id)).map((s) => s.id).sort();
    expect(missed).toEqual(['sb_3bet_btn', 'sb_3bet_co']);
    // SB 는 블라인드라 수비 표로 라우팅된다. 두 표의 3벳 스펙이 **같아야** 그 대체가 정당하다 —
    // 다르면 SB 가 실제로 다른 표를 보고 있다는 뜻이고, 그때는 이 대체가 회귀다.
    for (const [threeId, defendId] of [['sb_3bet_btn', 'sb_vs_btn'], ['sb_3bet_co', 'sb_vs_co']]) {
      const three = RANGE_SCENARIOS.find((s) => s.id === threeId)!.actions.find((a) => a.key === 'raise')!;
      const defend = RANGE_SCENARIOS.find((s) => s.id === defendId)!.actions.find((a) => a.key === 'raise')!;
      expect(JSON.stringify(three.spec), `${threeId} 와 ${defendId} 의 3벳 스펙이 다르다`)
        .toBe(JSON.stringify(defend.spec));
    }
  });

  it('새로 연 표의 연습 링크가 그 표의 문제를 복원한다 — 무관한 문제를 내지 않는다', () => {
    const e3 = evaluateSpot(facingOpen({ heroPos: 'CO', villainPos: 'LJ', villainRaiseBb: 2.5, hero: ['As', 'Ks'] }));
    if (!('drill' in e3) || !e3.drill) throw new Error('3벳 스팟에 drill 이 없다');
    expect(e3.drill.mode).toBe('threebet');
    expect(makeQuiz(e3.drill.mode, e3.drill.key).key).toBe(e3.drill.key);

    const ev = evaluateSpot(base({
      street: 'preflop', tableSize: 6, heroPos: 'BTN', villainPos: 'BB',
      effectiveBb: 100, sbBb: 0.5, anteBb: 0, hero: ['As', 'Ks'],
      actions: [
        { street: 'preflop', actor: 'hero', type: 'raise', sizeBb: 2.5 },
        { street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 8 },
      ],
    }));
    if (!('drill' in ev) || !ev.drill) throw new Error('vs3벳 스팟에 drill 이 없다');
    expect(ev.drill.mode).toBe('vs3bet');
    expect(makeQuiz(ev.drill.mode, ev.drill.key).key).toBe(ev.drill.key);
  });
});

// ── 빌런 B~E (2026-09-19) — 멀티웨이는 표를 억지로 맞추지 않는다 ──────────────
// 리드 결정: 상대가 둘 이상 살아 있는 팟은 '수학 참고'(정오 판정 없음)가 정직한 답이다.
describe('빌런 B~E — 멀티웨이 팟과 표의 경계', () => {
  const openBy = (pos: 'CO' | 'HJ' | 'SB' | 'UTG', sizeBb = 2.5) =>
    ({ street: 'preflop' as const, actor: 'villain' as const, pos, type: 'raise' as const, sizeBb });
  const foldBy = (pos: 'CO' | 'HJ' | 'SB' | 'UTG') =>
    ({ street: 'preflop' as const, actor: 'villain' as const, pos, type: 'fold' as const });

  it('앞에서 접은 상대(B)는 표 조회를 바꾸지 않는다 — BB vs BTN 오픈이 그대로 정확 일치', () => {
    const plain = base({ heroPos: 'BB', villainPos: 'BTN', actions: [{ street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 2.5 }] });
    const withFold = base({
      heroPos: 'BB', villainPos: 'BTN', extra: [{ pos: 'CO', cards: [] }],
      actions: [foldBy('CO'), { street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 2.5 }],
    });
    expect(evaluateSpot(plain).kind).toBe('chart_nash');
    expect(evaluateSpot(withFold).kind).toBe('chart_nash');
    expect(chart(evaluateSpot(withFold)).sourceLabel).toBe(chart(evaluateSpot(plain)).sourceLabel);
  });

  it('오픈한 사람이 빌런 A 가 아니어도 그 사람의 표를 본다 — B(CO) 오픈, A(BTN)는 안 움직임', () => {
    const s = base({
      heroPos: 'BB', villainPos: 'BTN', extra: [{ pos: 'CO', cards: [] }],
      actions: [openBy('CO')],
    });
    const ev = chart(evaluateSpot(s));
    expect(ev.kind).toBe('chart_nash');
    expect(ev.sourceLabel).toContain('CO');
    expect(ev.sourceLabel).not.toContain('BTN');
  });

  it('상대 둘이 살아 있으면(오픈 + 콜) 표를 맞추지 않고 수학 참고로 떨어지며 그 이유를 적는다', () => {
    const s = base({
      heroPos: 'BB', villainPos: 'BTN', extra: [{ pos: 'CO', cards: [] }],
      actions: [openBy('CO'), { street: 'preflop', actor: 'villain', type: 'call', sizeBb: 2.5 }],
      heroAction: 'call', heroActionSizeBb: 1.5,
    });
    const ev = evaluateSpot(s);
    expect(ev.kind).toBe('math_only');
    expect(ev.verdict).toBe('math');
    expect(ev.notes.some((n) => n.includes('둘 이상'))).toBe(true);
    // 콜 금액은 가장 많이 넣은 사람 기준(둘 다 2.5) — BB 는 1 을 이미 냈으니 1.5
    expect(ev.math.toCallBb).toBe(1.5);
    expect(ev.math.potBb).toBe(6.5);          // 0.5 + 1 + 2.5 + 2.5
  });

  it('콜 금액은 여럿 중 가장 많이 넣은 사람과의 차액이다 — A(BTN) 오픈 2.5, B(CO) 3벳 +8', () => {
    // ⚠ 더 많이 넣은 쪽이 **B(extra)** 여야 판별력이 있다 — A 가 최대면 'A 만 보는' 옛 계산도 같은 답을 낸다(음성 대조에서 잡힘).
    const s = base({
      heroPos: 'BB', villainPos: 'BTN', extra: [{ pos: 'CO', cards: [] }],
      actions: [{ street: 'preflop', actor: 'villain', type: 'raise', sizeBb: 2.5 }, openBy('CO', 8)],
    });
    expect(evaluateSpot(s).math.toCallBb).toBe(7);   // B 총액 8 − BB 1 (A 만 보면 1.5)
    expect(evaluateSpot(s).kind).toBe('math_only');  // 상대 둘이 살아 있다
  });

  it('상대 폴드만 앞에 있으면 첫 진입이다 — B(UTG) 폴드 뒤 BTN 오픈은 RFI 표', () => {
    const s = base({ tableSize: 9, heroPos: 'BTN', villainPos: 'BB', extra: [{ pos: 'UTG', cards: [] }], actions: [foldBy('UTG')] });
    const ev = chart(evaluateSpot(s));
    expect(ev.kind).toBe('chart_nash');
    expect(ev.sourceLabel).toContain('오픈');
  });

  it('B~E 가 자리 검증에 걸리면 unsupported — 겹친 자리로 표를 보지 않는다', () => {
    const s = base({ heroPos: 'BB', villainPos: 'BTN', extra: [{ pos: 'BTN', cards: [] }] });
    expect(evaluateSpot(s).kind).toBe('unsupported');
  });
});

// ── vs3벳 표는 내 오픈 크기도 잰다 (감사 2026-09-19) ─────────────────────────
// 표는 "내가 2~3BB 로 열었다" 를 전제로 알파·MDF 를 역산했다. 상대 3벳 크기만 재고 내 오픈은 안 쟀더니
// 6BB 오픈이 2.5BB 오픈과 똑같이 '정확 일치' 였다 — 같은 3벳 금액이라도 다른 문제다.
describe('vs3벳 — 내 오픈 크기 검증', () => {
  const vs3bet = (openBb: number, threeBetTotal = 9) => base({
    heroPos: 'CO', villainPos: 'BB', hero: ['As', 'Ks'],
    actions: [
      { street: 'preflop', actor: 'hero', type: 'raise', sizeBb: openBb },
      { street: 'preflop', actor: 'villain', type: 'raise', sizeBb: threeBetTotal - 1 },   // BB 는 1 을 냈다 → 총액 threeBetTotal
    ],
  });

  it('2.5BB 오픈 → 정확 일치 그대로다(고치면서 되레 좁히지 않았다)', () => {
    const ev = chart(evaluateSpot(vs3bet(2.5)));
    expect(ev.kind).toBe('chart_nash');
    expect(ev.differences).toEqual([]);
  });

  it('6BB 오픈 → 정확 일치가 아니라 참고이고, 내 오픈 크기가 차이로 적힌다', () => {
    const ev = chart(evaluateSpot(vs3bet(6)));
    expect(ev.kind).toBe('normalized_reference');
    expect(ev.differences.some((d) => d.includes('내 오픈') && d.includes('6BB'))).toBe(true);
  });

  it('참조 밴드 밖(10BB 오픈)은 그 표를 아예 보지 않는다 — 수학 참고 (상대 3벳 총액은 밴드 안인 9 그대로)', () => {
    expect(evaluateSpot(vs3bet(10)).kind).toBe('math_only');
  });
});
