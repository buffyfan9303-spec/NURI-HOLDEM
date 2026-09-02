// 얼리 카운트 · 레벨 연동 할인 계산 테스트 — 오너 지시 #20/#21 의 산수를 값으로 못 박는다.
//
// 왜 필요한가: 클락에 뜨는 '얼리'는 지금까지 **사람 수**였다. 오너가 쓰는 실물 클락의 얼리는
//   **기준칩 배수의 합**이라, 같은 손님 4명이 한쪽에선 4, 다른 쪽에선 7로 보였다.
//   운영자는 매번 수기 보정(adjEarlies)으로 그 차이를 메우고 있었고, 보정을 잊으면
//   총 스택·평균 스택이 조용히 틀린 채 TV 로 송출됐다. 눈으로는 절대 못 잡는 유형이라 값으로 고정한다.
//
// 오너 원문(#21): "기준이 5천이라 치고 1레벨에 바이인한 사람이 3명이면 1레벨 얼리가 1만인 경우
//   클락에 자동으로 얼리 6이 올라가 있어야 한다. 2레벨 얼리가 5천인 경우 2레벨까지 바이인한
//   사람이 1명이면 총 7얼리. 이후에 바이인한 경우 올라가면 안 된다."
//
// 실행: npx vitest run src/api/ledger.early.test.ts
import { describe, it, expect } from 'vitest';
import {
  autoDiscountIndex, discountSummary, earlyTypeOf, buyinFinance,
  type DiscountPreset, type LedgerBuyin,
} from './ledger';
import {
  levelNoAtMinutes, currentLevelNo, earlyTypeAtLevel, earlyUnitChips, earlyUnitsOf, earlyUnitTotal,
  computeLiveStats, deriveClockCounts, defaultClockConfig, cumulativeMinutesThroughLevel,
  type ClockConfig, type ClockLevel, type ClockState,
} from './clock';

const MIN = 60_000;
/** 오너 예시 그대로 — 5시 스타트, 20분 듀레이션 */
const START = '2026-08-30T17:00:00.000Z';
const L = (minutes: number, kind: 'level' | 'break' = 'level'): ClockLevel => ({ kind, sb: 100, bb: 200, ante: 0, minutes });
const LEVELS20 = Array.from({ length: 10 }, () => L(20));

/** 기준 5천 · 1레벨(더블)=1만 · 2레벨(1얼리)=5천 */
const CFG: ClockConfig = {
  ...defaultClockConfig(),
  levels: LEVELS20,
  earlyBonus: 5_000, doubleEarlyBonus: 10_000,
  earlyDoubleLevel: 1, earlySingleLevel: 2,
  earlyDoubleMin: cumulativeMinutesThroughLevel(LEVELS20, 1),   // 20
  earlySingleMin: cumulativeMinutesThroughLevel(LEVELS20, 2),   // 40
};

function buyin(over: Partial<LedgerBuyin> = {}): LedgerBuyin {
  return {
    id: 't', venueId: 'v', sessionDate: '2026-08-30', gameSeq: 1,
    playerName: 'p', entryNo: 1, paymentMethod: 'cash', isUnpaid: false,
    buyinAt: START, isSplit: false,
    cashAmount: 0, cardAmount: 0, transferAmount: 0,
    ticketCount: 0, unpaidAmount: 0, discountLevel: 0, discountIndex: 0,
    earlyOverride: null,
    ...over,
  };
}
/** 스타트 + n분에 바인한 손님 */
const at = (mins: number, name: string, over: Partial<LedgerBuyin> = {}) =>
  buyin({ ...over, playerName: name, buyinAt: new Date(Date.parse(START) + mins * MIN).toISOString() });

function state(over: Partial<ClockState> = {}): ClockState {
  return {
    venueId: 'v', gameSeq: 1, sessionDate: '2026-08-30', title: 't', config: CFG,
    currentIndex: 0, running: false, endsAt: null, remainingMs: 20 * MIN,
    adjEntries: 0, adjRebuys: 0, adjEarlies: 0, adjAddons: 0, eliminations: 0,
    ...over,
  };
}

// ── #21 ①: 시각 → 레벨 판정 ───────────────────────────────────────────────────
describe('levelNoAtMinutes · 바인 시각을 레벨로 환산', () => {
  it('5시 스타트·20분 듀레이션이면 5시 20분 전 바인은 1레벨', () => {
    expect(levelNoAtMinutes(LEVELS20, 0)).toBe(1);
    expect(levelNoAtMinutes(LEVELS20, 19.999)).toBe(1);
  });

  it('정확히 20분은 2레벨 시작점 · 반열림 경계 [0,20)', () => {
    expect(levelNoAtMinutes(LEVELS20, 20)).toBe(2);
    expect(levelNoAtMinutes(LEVELS20, 39)).toBe(2);
    expect(levelNoAtMinutes(LEVELS20, 40)).toBe(3);
  });

  it('브레이크는 자기 번호를 갖지 않는다. 직전 레벨 번호를 유지', () => {
    const withBreak = [L(20), L(20), L(8, 'break'), L(20)]; // L1 L2 BREAK L3
    expect(levelNoAtMinutes(withBreak, 41)).toBe(2);  // 40~48 = 브레이크 → 여전히 2
    expect(levelNoAtMinutes(withBreak, 47)).toBe(2);
    expect(levelNoAtMinutes(withBreak, 48)).toBe(3);  // 브레이크 끝 = L3
  });

  it('스타트 전(음수)은 0, 구조를 다 소진하면 마지막 레벨', () => {
    expect(levelNoAtMinutes(LEVELS20, -1)).toBe(0);
    expect(levelNoAtMinutes(LEVELS20, 9_999)).toBe(10);
    expect(levelNoAtMinutes([], 5)).toBe(0);
  });
});

describe('currentLevelNo · 낡은 클락 행에서도 지금 레벨', () => {
  const T0 = Date.parse(START);
  it('정지 중이면 currentIndex 그대로', () => {
    expect(currentLevelNo(state({ currentIndex: 2 }), T0)).toBe(3);
  });
  it('running 인데 endsAt 이 지났으면 경과분만큼 전진해서 센다', () => {
    const s = state({ running: true, currentIndex: 0, endsAt: new Date(T0 - 25 * MIN).toISOString() });
    expect(currentLevelNo(s, T0)).toBe(3); // 1레벨 종료 후 25분 더 흘렀다 = L2 소진 + L3 5분째
  });
  it('브레이크 칸에 서 있으면 직전 레벨 번호', () => {
    const cfg = { ...CFG, levels: [L(20), L(20), L(8, 'break'), L(20)] };
    expect(currentLevelNo(state({ config: cfg, currentIndex: 2 }), T0)).toBe(2);
  });
});

// ── #21 ②: 얼리 유형 판정 ─────────────────────────────────────────────────────
describe('earlyTypeAtLevel · 레벨 → 얼리 유형', () => {
  it('더블 1LV · 1얼리 2LV 설정에서 레벨별 판정', () => {
    expect(earlyTypeAtLevel(CFG, 1)).toBe('double');
    expect(earlyTypeAtLevel(CFG, 2)).toBe('single');
    expect(earlyTypeAtLevel(CFG, 3)).toBe('none');
  });
  it('얼리를 안 쓰는 게임이면 null(자동판정에 맡긴다)', () => {
    expect(earlyTypeAtLevel({ earlyDoubleLevel: 0, earlySingleLevel: 0 }, 1)).toBeNull();
    expect(earlyTypeAtLevel(CFG, 0)).toBeNull();
  });
});

describe('earlyTypeOf · 시각 자동판정(기존 규칙 유지)', () => {
  const S = { earlyDoubleMin: 20, earlySingleMin: 40, tournamentStart: START };
  it('1레벨 안 = 더블얼리 · 2레벨 안 = 1얼리 · 그 뒤 = 없음', () => {
    expect(earlyTypeOf(at(5, 'a'), S)).toBe('double');
    expect(earlyTypeOf(at(25, 'b'), S)).toBe('single');
    expect(earlyTypeOf(at(60, 'c'), S)).toBe('none');
  });
  it('리바인(entryNo≥2)은 얼리가 아니다', () => {
    expect(earlyTypeOf(at(5, 'a', { entryNo: 2 }), S)).toBe('none');
  });
  it('수기지정이 시각 자동판정을 이긴다', () => {
    expect(earlyTypeOf(at(60, 'c', { earlyOverride: 'double' }), S)).toBe('double');
    expect(earlyTypeOf(at(5, 'a', { earlyOverride: 'none' }), S)).toBe('none');
  });
});

// ── #21 ③: 오너 산수 재현 — 3명×더블(2) + 1명×1얼리(1) = 7 ─────────────────────
describe('얼리 카운트 = 기준칩 배수의 합 (오너 예시 6 → 7)', () => {
  it('기준 = 설정된 얼리 보너스 중 최솟값', () => {
    expect(earlyUnitChips(CFG)).toBe(5_000);
    expect(earlyUnitsOf(CFG, 'double')).toBe(2);
    expect(earlyUnitsOf(CFG, 'single')).toBe(1);
    expect(earlyUnitsOf(CFG, 'none')).toBe(0);
  });

  it('1레벨 바인 3명 → 얼리 6', () => {
    const bs = [at(2, 'A'), at(7, 'B'), at(15, 'C')];
    const derived = deriveClockCounts(bs, { earlyDoubleMin: 20, earlySingleMin: 40, tournamentStart: START });
    expect(derived.doubleEarlies).toBe(3);
    expect(earlyUnitTotal(derived, CFG)).toBe(6);
  });

  it('2레벨 바인 1명이 더해지면 총 7얼리', () => {
    const bs = [at(2, 'A'), at(7, 'B'), at(15, 'C'), at(25, 'D')];
    const derived = deriveClockCounts(bs, { earlyDoubleMin: 20, earlySingleMin: 40, tournamentStart: START });
    expect(derived.earlies).toBe(4);        // 사람 수는 4
    expect(derived.doubleEarlies).toBe(3);
    expect(earlyUnitTotal(derived, CFG)).toBe(7); // 카운트는 7
    expect(computeLiveStats(state(), derived, CFG).earlies).toBe(7);
  });

  it('이후에 바인한 사람은 올라가지 않는다 (3레벨 이후 = 0)', () => {
    const bs = [at(2, 'A'), at(7, 'B'), at(15, 'C'), at(25, 'D'), at(45, 'E'), at(120, 'F')];
    const derived = deriveClockCounts(bs, { earlyDoubleMin: 20, earlySingleMin: 40, tournamentStart: START });
    expect(computeLiveStats(state(), derived, CFG).earlies).toBe(7); // 그대로 7
    expect(derived.entries).toBe(6);                                  // 엔트리는 6명으로 늘어난다
  });

  it('리바인은 얼리를 올리지 않는다', () => {
    const bs = [at(2, 'A'), at(3, 'A', { entryNo: 2 }), at(4, 'A', { entryNo: 3 })];
    const derived = deriveClockCounts(bs, { earlyDoubleMin: 20, earlySingleMin: 40, tournamentStart: START });
    expect(derived.rebuys).toBe(2);
    expect(earlyUnitTotal(derived, CFG)).toBe(2); // A 1명의 더블얼리 = 2
  });

  it('수기 보정(adjEarlies)은 단위 그대로 가산된다', () => {
    const bs = [at(2, 'A'), at(7, 'B'), at(15, 'C'), at(25, 'D')];
    const derived = deriveClockCounts(bs, { earlyDoubleMin: 20, earlySingleMin: 40, tournamentStart: START });
    expect(computeLiveStats(state({ adjEarlies: 3 }), derived, CFG).earlies).toBe(10);
    expect(computeLiveStats(state({ adjEarlies: -99 }), derived, CFG).earlies).toBe(0); // 음수로 안 내려간다
  });

  it('총 스택은 얼리 카운트가 아니라 실제 보너스 칩으로 계산된다(회귀 방지)', () => {
    const bs = [at(2, 'A'), at(7, 'B'), at(15, 'C'), at(25, 'D')];
    const derived = deriveClockCounts(bs, { earlyDoubleMin: 20, earlySingleMin: 40, tournamentStart: START });
    const ls = computeLiveStats(state(), derived, CFG);
    // 엔트리 4 × 50,000 + 더블 3 × 10,000 + 1얼리 1 × 5,000
    expect(ls.totalStack).toBe(4 * CFG.startStack + 3 * 10_000 + 1 * 5_000);
  });

  it('얼리 보너스를 안 쓰는 게임은 예전처럼 1건 = 1', () => {
    const noBonus = { ...CFG, earlyBonus: 0, doubleEarlyBonus: 0 };
    expect(earlyUnitChips(noBonus)).toBe(0);
    expect(earlyUnitTotal({ earlies: 4, doubleEarlies: 3 }, noBonus)).toBe(4);
  });

  it('더블 보너스만 설정된 게임 · 더블 1, 1얼리 0', () => {
    const dOnly = { ...CFG, earlyBonus: 0, doubleEarlyBonus: 10_000 };
    expect(earlyUnitsOf(dOnly, 'double')).toBe(1);
    expect(earlyUnitsOf(dOnly, 'single')).toBe(0);
  });
});

// ── #20: 레벨 연동 할인 자동 적용 + 정산 반영 ──────────────────────────────────
describe('autoDiscountIndex · 포스터/장부에 적힌 레벨 할인의 자동 적용', () => {
  const DISCS: DiscountPreset[] = [
    { label: '1레벨', amount: 50_000, level: 1 },
    { label: '2레벨', amount: 30_000, level: 2 },
    { label: '지인', amount: 10_000 },            // level 없음 = 수기 전용
  ];
  it('1레벨 바인 → 1번 할인(5만)', () => expect(autoDiscountIndex(DISCS, 1)).toBe(1));
  it('2레벨 바인 → 2번 할인(3만)', () => expect(autoDiscountIndex(DISCS, 2)).toBe(2));
  it('3레벨 바인 → 자동 할인 없음', () => expect(autoDiscountIndex(DISCS, 3)).toBe(0));
  it('level 없는 프리셋은 절대 자동 적용되지 않는다', () => {
    expect(autoDiscountIndex([{ label: '지인', amount: 10_000 }], 1)).toBe(0);
  });
  it('금액 0(빈 칸)은 자동 적용 후보가 아니다', () => {
    expect(autoDiscountIndex([{ label: '', amount: 0, level: 1 }], 1)).toBe(0);
  });
  it('레벨 판정 실패(0)·빈 목록이면 0', () => {
    expect(autoDiscountIndex(DISCS, 0)).toBe(0);
    expect(autoDiscountIndex(undefined, 1)).toBe(0);
    expect(autoDiscountIndex([], 1)).toBe(0);
  });
  it('같은 레벨 후보가 겹치면 앞 자리번호가 이긴다(자리번호 = 바인 계산 기준이라 안정적이어야 함)', () => {
    expect(autoDiscountIndex([{ label: 'a', amount: 1, level: 2 }, { label: 'b', amount: 2, level: 2 }], 1)).toBe(1);
  });
});

describe('discountSummary · 마감정산의 할인 엔트리 · 총 할인액', () => {
  const S = { buyinAmount: 100_000, cardAmount: null, discounts: [
    { label: '1레벨', amount: 50_000, level: 1 },
    { label: '2레벨', amount: 30_000, level: 2 },
  ] };
  it('오너 예시 · 5만 할인 1건이 들어가면 할인 엔트리 1 · 총 할인 5만', () => {
    const r = discountSummary([buyin({ discountIndex: 1 }), buyin({ playerName: 'q' })], S);
    expect(r).toEqual({ count: 1, total: 50_000, entryLoss: 0.5 });
  });
  it('여러 건 합산 · 5만 + 5만 + 3만 = 13만 / 3건', () => {
    const r = discountSummary(
      [buyin({ discountIndex: 1 }), buyin({ discountIndex: 1 }), buyin({ discountIndex: 2 })], S);
    expect(r.count).toBe(3);
    expect(r.total).toBe(130_000);
    expect(r.entryLoss).toBeCloseTo(1.3, 10);
  });
  it('분납 바인의 할인도 동일하게 잡힌다(2026-07 누락 사건 회귀 방지)', () => {
    const split = buyin({ isSplit: true, cashAmount: 50_000, discountIndex: 1 });
    expect(discountSummary([split], S)).toMatchObject({ count: 1, total: 50_000 });
  });
  it('할인 없음(0) · 빈 자리(금액 0)는 집계되지 않는다', () => {
    const s0 = { ...S, discounts: [{ label: '', amount: 0, level: 1 }] };
    expect(discountSummary([buyin({ discountIndex: 1 })], s0)).toEqual({ count: 0, total: 0, entryLoss: 0 });
    expect(discountSummary([buyin()], S)).toEqual({ count: 0, total: 0, entryLoss: 0 });
  });
  it('단가 0(미설정)이어도 터지지 않는다', () => {
    expect(discountSummary([buyin({ discountIndex: 1 })], { buyinAmount: 0, discounts: S.discounts }).entryLoss).toBe(0);
  });
  it('할인 엔트리 합계는 buyinFinance 의 엔트리 계산과 정합한다', () => {
    const bs = [buyin({ discountIndex: 1 }), buyin({ playerName: 'q' })];
    const entries = bs.reduce((n, b) => n + buyinFinance(b, S).entry, 0);
    // 할인 없을 때 2엔트리에서 discountSummary.entryLoss(0.5)만큼 깎인 값
    expect(entries).toBeCloseTo(2 - discountSummary(bs, S).entryLoss, 10);
  });
});
