// KW-1a(2026-09-30) — W단계 1차 결함표의 계산·데이터 계층 묶음을 포스터 원문 수치로 고정한다.
// 요구 원문: store-team W-defects.md(W-03·04·05·06·10·12·13·14·19·25·27·28) + 오너/리드 결정 2026-09-30.
// 보는 것: 각 결함의 재현 입력(포스터 A 로티 부스터데이 · B 깐부전 · C 루나 · D 퀸 · E 키키 구조)이 포스터 값과 같은 답을 내는가.
// 못 보는 것: 화면 배치(TV·장부 폼) — e2e 몫. 서버 식은 clockLedgerPart.contract.test.ts(픽스처 + SQL 해시)가 본다.
// 음성 대조(2026-09-30 실행): chipRules.earlyTierIndexAt 의 `mins < min` → `<=` 로 바꾸면 'W-27' 이,
//   msToRegCloseAt 의 `num > target` → `>=` 로 바꾸면 'W-03' 이, windowEndMinute 를 levelStartMinute(levels, level) 로 바꾸면 'W-05' 가 빨개진다.
// 실행: npx vitest run src/lib/chipRules.test.ts
import { describe, it, expect } from 'vitest';
import {
  windowEndMinute, earlyTierWindows, earlyTierIndexAt, normalizeEarlyTiers, rebuyStackAt, rebuyChipsOf,
  msToRegCloseAt, prizePlaceCount, targetEntriesOf,
} from './chipRules';
import { computeLiveStats, deriveClockCounts, emptyClockState, defaultClockConfig, withDerivedEarly, applyEarlyEdit, clockIsLeftover, type ClockConfig, type ClockLevel, type ClockState } from '../api/clock';
import { discountAllowed, autoDiscountIndex, earlyTypeOf, type LedgerBuyin, type LedgerSession } from '../api/ledger';
import { settlementReport } from './ledgerSettlement';
import { ledgerStartClockConfig, sessionEarlyOf, sessionPatchFromSchedule, clockStartAction } from './ledgerStart';
import { prizeTotalOf } from '../components/features/clock/prizeFit';
import type { Schedule } from '../api/schedules';

const L = (minutes: number): ClockLevel => ({ kind: 'level', sb: 100, bb: 200, ante: 200, minutes });
const B = (minutes: number): ClockLevel => ({ kind: 'break', sb: 0, bb: 0, ante: 0, minutes });
// 포스터 A(로티 부스터데이)를 줄인 구조: 25분 × 4 · 브레이크 8 · 25분 × 12 · 16LV 뒤 브레이크 12('REG CLOSE') · 20분 × 2
const levelsA: ClockLevel[] = [L(25), L(25), L(25), L(25), B(8), ...Array.from({ length: 12 }, () => L(25)), B(12), L(20), L(20)];
// 포스터 E(키키) 앞부분: 30분 × 4 · 브레이크 8
const levelsE: ClockLevel[] = [L(30), L(30), L(30), L(30), B(8), L(30), L(30)];

describe('W-05 · 얼리 창 끝 = 다음 레벨 시작 분(앞 브레이크 포함)', () => {
  it('A "5LV 시작 전 +5,000" = 4LV 끝 100분 + 브레이크 8 = 108분', () => {
    expect(windowEndMinute(levelsA, 4)).toBe(108);
    expect(windowEndMinute(levelsA, 1)).toBe(25);
    expect(windowEndMinute(levelsA, 0)).toBe(0);
  });
  it('withDerivedEarly 가 같은 규칙으로 두 칸 분을 만든다(예전엔 100분 = 브레이크 중 도착 손님 얼리 0)', () => {
    const cfg = withDerivedEarly({ ...defaultClockConfig(), levels: levelsA, earlyDoubleLevel: 1, earlySingleLevel: 4 });
    expect([cfg.earlyDoubleMin, cfg.earlySingleMin]).toEqual([25, 108]);
  });
});

describe('W-27 · 경계는 반열림 한 규칙', () => {
  const w = earlyTierWindows([{ level: 1, chips: 10_000 }, { level: 4, chips: 5_000 }], levelsA);
  it('24.999분 = 1단, 25분 정각 = 2단(2LV 시작), 107.999 = 2단, 108 = 없음', () => {
    expect([24.999, 25, 107.999, 108, -0.01].map((m) => earlyTierIndexAt(m, w))).toEqual([0, 1, 1, -1, -1]);
  });
  it('두 칸 경로(earlyTypeOf)도 같은 규칙 — 25:00 정각 도착은 더블이 아니라 1얼리', () => {
    const s = { earlyDoubleMin: 25, earlySingleMin: 108, tournamentStart: '2026-09-29T10:00:00.000Z' };
    const b = (iso: string) => ({ entryNo: 1, buyinAt: iso, earlyOverride: null }) as unknown as LedgerBuyin;
    expect(earlyTypeOf(b('2026-09-29T10:25:00.000Z'), s)).toBe('single');
    expect(earlyTypeOf(b('2026-09-29T10:24:59.999Z'), s)).toBe('double');
    expect(earlyTypeOf(b('2026-09-29T11:48:00.000Z'), s)).toBe('none');
  });
});

describe('W-04 · 포스터 얼리 단계(최대 4, 없으면 0)', () => {
  it('정리: 0·음수·중복 레벨 제거 · 레벨 오름차순 · 4단 상한', () => {
    expect(normalizeEarlyTiers([{ level: 3, chips: 10 }, { level: 1, chips: 20 }, { level: 1, chips: 5 }, { level: 0, chips: 9 }, { level: 2, chips: 0 },
      { level: 4, chips: 1 }, { level: 5, chips: 1 }, { level: 6, chips: 1 }])).toEqual([
      { level: 1, chips: 20 }, { level: 3, chips: 10 }, { level: 4, chips: 1 }, { level: 5, chips: 1 }]);
  });
  const buyin = (name: string, min: number, entryNo = 1) => ({
    id: name + min, venueId: 'v', sessionDate: '2026-09-29', gameSeq: 1, playerName: name, entryNo, paymentMethod: 'cash', isUnpaid: false,
    buyinAt: new Date(Date.parse('2026-09-29T10:00:00.000Z') + min * 60_000).toISOString(), isSplit: false, cashAmount: 0, cardAmount: 0,
    transferAmount: 0, ticketCount: 0, unpaidAmount: 0, discountLevel: 0, discountIndex: 0, earlyOverride: null,
  }) as unknown as LedgerBuyin;
  it('E 키키 4단(20k·15k·10k·5k): 10·40·70·125(브레이크 중)분 도착 = 50,000칩 · 128분 = 0', () => {
    const cfg = withDerivedEarly({ ...defaultClockConfig(), levels: levelsE, startStack: 60_000,
      earlyTiers: [{ level: 1, chips: 20_000 }, { level: 2, chips: 15_000 }, { level: 3, chips: 10_000 }, { level: 4, chips: 5_000 }] });
    const sess = { ...sessionEarlyOf(cfg), tournamentStart: '2026-09-29T10:00:00.000Z' };
    expect(sess.earlyTiers?.map((x) => x.min)).toEqual([30, 60, 90, 128]);
    const d = deriveClockCounts([buyin('a', 10), buyin('b', 40), buyin('c', 70), buyin('d', 125), buyin('e', 128)], sess);
    expect([d.earlies, d.doubleEarlies, d.earlyChips, d.earlyUnits]).toEqual([4, 1, 50_000, 10]);
    const live = computeLiveStats({ ...emptyClockState('v', cfg, 1) }, d, cfg);
    expect(live.totalStack).toBe(5 * 60_000 + 50_000);
  });
  it('D·C 처럼 포스터에 얼리가 없으면(빈 배열) 기본 5,000/10,000 이 붙지 않는다', () => {
    const cfg = withDerivedEarly({ ...defaultClockConfig(), levels: levelsA, earlyTiers: [] });
    expect([cfg.earlyBonus, cfg.doubleEarlyBonus, cfg.earlyDoubleMin, cfg.earlySingleMin]).toEqual([0, 0, 0, 0]);
  });
  it('두 칸(더블·1얼리)을 고치면 1·2단이 바뀌고 3·4단은 그대로다', () => {
    const base = withDerivedEarly({ ...defaultClockConfig(), levels: levelsE,
      earlyTiers: [{ level: 1, chips: 20_000 }, { level: 2, chips: 15_000 }, { level: 3, chips: 10_000 }, { level: 4, chips: 5_000 }] });
    expect([base.doubleEarlyBonus, base.earlyBonus]).toEqual([20_000, 15_000]);   // 두 칸 = 1·2단 거울값
    const cfg = withDerivedEarly(applyEarlyEdit(base, { doubleEarlyBonus: 25_000 }));
    expect(cfg.earlyTiers).toEqual([{ level: 1, chips: 25_000 }, { level: 2, chips: 15_000 }, { level: 3, chips: 10_000 }, { level: 4, chips: 5_000 }]);
  });
});

describe('W-03 · 레지마감 "N LV" = N레벨 끝 + 뒤 브레이크까지', () => {
  it('A 16LV: 시작 직후(잔여 25분) → 16LV 끝 408분(브레이크 8 포함) + 뒤 브레이크 12 = 420분 뒤 마감(예전 뜻 = 16LV 시작 383분)', () => {
    expect(msToRegCloseAt(levelsA, 16, 0, 25 * 60_000)).toBe(420 * 60_000);
  });
  it('16LV 진행 중·뒤 브레이크 중은 열림, 17LV 에서 0', () => {
    const i16 = levelsA.findIndex((_, i) => levelsA.slice(0, i + 1).filter((l) => l.kind === 'level').length === 16);
    expect(msToRegCloseAt(levelsA, 16, i16, 60_000)).toBe((1 + 12) * 60_000);
    expect(msToRegCloseAt(levelsA, 16, i16 + 1, 60_000)).toBe(60_000);
    expect(msToRegCloseAt(levelsA, 16, i16 + 2, 60_000)).toBe(0);
  });
});

describe('W-10 · 계단 리엔트리 스택', () => {
  it('B 깐부전: 첫바인 50,000 + 리엔트리 70k·70k·80k = 270,000(예전 단일값 260,000)', () => {
    expect([1, 2, 3, 4].map((o) => rebuyStackAt(o, [70_000, 70_000, 80_000], 70_000))).toEqual([70_000, 70_000, 80_000, 80_000]);
    expect(rebuyChipsOf([1, 1, 1], [70_000, 70_000, 80_000], 70_000)).toBe(220_000);
    const cfg: ClockConfig = { ...defaultClockConfig(), startStack: 50_000, rebuyStack: 70_000, rebuyStacks: [70_000, 70_000, 80_000], earlyBonus: 0, doubleEarlyBonus: 0 };
    const live = computeLiveStats(emptyClockState('v', cfg, 1), { entries: 1, rebuys: 3, earlies: 0, doubleEarlies: 0, totalBuyins: 4, rebuyOrd: [1, 1, 1] }, cfg);
    expect(live.totalStack).toBe(270_000);
  });
  it('배열이 없으면 단일값(기존 동작)', () => {
    expect(rebuyStackAt(3, undefined, 70_000)).toBe(70_000);
    const cfg: ClockConfig = { ...defaultClockConfig(), startStack: 50_000, rebuyStack: 70_000, earlyBonus: 0, doubleEarlyBonus: 0 };
    expect(computeLiveStats(emptyClockState('v', cfg, 1), { entries: 1, rebuys: 3, earlies: 0, doubleEarlies: 0, totalBuyins: 4 }, cfg).totalStack).toBe(260_000);
  });
});

describe('W-12·W-25 · 범위 순위 × 자리 수 · 입력 단위 그대로', () => {
  it('자리 수', () => {
    expect(['11-15th', '11~16th', '12~13th', '1st', '이벤트', '20~25th'].map(prizePlaceCount)).toEqual([5, 6, 2, 1, 1, 6]);
  });
  it('A 합계 = 1,000T(= GTD 1,000만) · 예전 960 · 단위가 섞이면 합계 없음', () => {
    const rows = [400, 150, 100, 70, 50, 40, 30, 25, 20, 15].map((a, i) => ({ place: `${i + 1}`, amount: a, unit: 'T' }));
    expect(prizeTotalOf([...rows, { place: '11-15th', amount: 10, unit: 'T', count: 5 }, { place: '이벤트', amount: 50, unit: 'T' }])).toEqual({ amount: 1000, unit: 'T' });
    expect(prizeTotalOf([{ place: '1', amount: 400, unit: 'T' }, { place: '2', amount: 100 }])).toBeNull();
  });
});

describe('W-06 · 애드온(부스터) 엔트리', () => {
  const sess = (addonEntry?: number) => ({ venueId: 'v', sessionDate: '2026-09-29', gameSeq: 1, buyinAmount: 100_000, cardAmount: null, gameType: 'gtd',
    targetEntries: 100, maxEntries: 0, isAddon: true, addonStack: 50_000, addonAmount: 50_000, discounts: [], earlyDoubleMin: 0, earlySingleMin: 0,
    regClosed: false, closed: false, operators: [], addonEntry }) as unknown as LedgerSession;
  const row = (id: string, name: string, entryNo: number, addon: boolean) => ({ id, venueId: 'v', sessionDate: '2026-09-29', gameSeq: 1, playerName: name, entryNo,
    paymentMethod: 'cash', isUnpaid: false, buyinAt: '2026-09-29T10:00:00.000Z', isSplit: false, cashAmount: 100_000, cardAmount: 0, transferAmount: 0,
    ticketCount: 0, unpaidAmount: 0, discountLevel: 0, discountIndex: 0, earlyOverride: null, addonMethod: addon ? 'cash' : null, addonUnpaid: false, addonAmount: addon ? 50_000 : 0 }) as LedgerBuyin;
  const rows = [row('1', '가', 1, true), row('2', '나', 1, false)];
  it('로티 "부스터바인은 0.5엔트리" — 2바인 + 부스터 1회 = 2.5', () => {
    expect(settlementReport('2026-09-29', [sess(0.5)], rows, []).games[0].entries).toBe(2.5);
  });
  it('기본 0(칸 없음) = 예전 동작 2', () => {
    expect(settlementReport('2026-09-29', [sess(undefined)], rows, []).games[0].entries).toBe(2);
  });
});

describe('W-28 · 할인 유형 = 적용 조건', () => {
  const discs = [{ label: '첫 리바인 50%', amount: 50_000, level: 3, kind: 'rebuy' as const }, { label: '첫 바인', amount: 30_000, level: 5, kind: 'firstBuyin' as const }];
  it('리바인 할인은 첫 바인에 안 되고, 첫 바인 할인은 리엔트리에 안 된다', () => {
    expect([discountAllowed(discs[0], 1), discountAllowed(discs[0], 2), discountAllowed(discs[1], 1), discountAllowed(discs[1], 2), discountAllowed({}, 1)])
      .toEqual([false, true, true, false, true]);
  });
  it('KW-1b 첫 리바인 할인(firstRebuy)은 2번째 바인에만 — 첫 바인·3번째 리바인에는 안 된다(퀸 「첫 리바인 50%」)', () => {
    const fr = { kind: 'firstRebuy' as const };
    expect([1, 2, 3, 4].map((n) => discountAllowed(fr, n))).toEqual([false, true, false, false]);
    expect(autoDiscountIndex([{ label: '첫 리바인', amount: 50_000, level: 20, kind: 'firstRebuy' }], 1, 3)).toBe(0);
    expect(autoDiscountIndex([{ label: '첫 리바인', amount: 50_000, level: 20, kind: 'firstRebuy' }], 1, 2)).toBe(1);
  });
  it('자동 선택도 같은 조건 — 첫 바인은 3레벨 리바인 할인 대신 첫 바인 할인(2번)', () => {
    expect(autoDiscountIndex(discs, 1, 1)).toBe(2);
    expect(autoDiscountIndex(discs, 1, 2)).toBe(1);
    expect(autoDiscountIndex(discs, 1)).toBe(1);   // 순번을 모르는 호출(서버 트리거가 거른다)은 종전 규칙
  });
});

describe('W-13·W-19 · 포스터 → 장부 시작 병합', () => {
  const poster = (over: Partial<Schedule>): Schedule => ({ id: 'p', title: '퀸', venueId: 'v', date: '2026-09-29', buyIn: { amount: 100_000 },
    guaranteed: true, prizePool: 24_100_000, structure: { levels: [] }, ...over } as unknown as Schedule);
  const form = { earlyBonus: 5_000, doubleEarlyBonus: 10_000, earlyDoubleLevel: 1, earlySingleLevel: 4, startStack: 50_000, rebuyStack: 70_000 };
  it('W-13: 비화폐 시상이면 지난 클락 상금표(1위 400…)를 남기지 않고 입력 단위 그대로', () => {
    const cfg = ledgerStartClockConfig(defaultClockConfig(), poster({ rankingPrizes: [{ rank: '1st', amount: 7_000_000, unit: ' 퀸포인트' }] }), null, form);
    expect(cfg.prizes).toEqual([{ place: '1st', amount: 7_000_000, unit: '퀸포인트' }]);
    const none = ledgerStartClockConfig(defaultClockConfig(), poster({ rankingPrizes: [] }), null, form);
    expect(none.prizes).toEqual([]);
    expect(ledgerStartClockConfig(defaultClockConfig(), null, null, form).prizes).toEqual(defaultClockConfig().prizes);   // 포스터 없는 장부 = 기존 동작
  });
  it('W-19: 기준 엔트리 = GTD ÷ 참가비(A 100 · B 150 · C 400 · D 241) · GTD 아님 = 미설정', () => {
    expect([[10_000_000, 100_000], [15_000_000, 100_000], [12_000_000, 30_000], [24_100_000, 100_000]].map(([g, b]) => targetEntriesOf(true, g, b))).toEqual([100, 150, 400, 241]);
    expect(targetEntriesOf(false, 10_000_000, 100_000)).toBe(0);
    expect(sessionPatchFromSchedule(poster({}))).toEqual({ targetEntries: 241 });
    expect(sessionPatchFromSchedule(poster({ buyIn: { amount: 100_000, addonEntry: 0.5 } as Schedule['buyIn'] }))).toEqual({ targetEntries: 241, addonEntry: 0.5 });
  });
});

describe('W-14 · 지난 날 멈춘 채 남은 클락만 새로 채운다', () => {
  const st = (over: Partial<ClockState>): ClockState => ({ ...emptyClockState('v'), ...over });
  it('로티 9/24 잔여(연결 장부 없음·탈락 3·멈춤) → 오늘 장부 시작 = reset', () => {
    const left = st({ eliminations: 3, adjEntries: 14, sessionDate: null, updatedAt: '2026-09-24T12:00:00.000Z' });
    expect(clockIsLeftover(left, '2026-09-30')).toBe(true);
    expect(clockStartAction(left, '2026-09-30')).toBe('reset');
  });
  it('오늘 돌고 있거나 오늘 멈춘 클락 · 같은 장부 날짜 · 마지막 쓰기 모름 = protect', () => {
    expect(clockStartAction(st({ running: true, updatedAt: '2026-09-24T12:00:00.000Z' }), '2026-09-30')).toBe('protect');
    expect(clockStartAction(st({ eliminations: 1, updatedAt: '2026-09-30T03:00:00.000Z' }), '2026-09-30')).toBe('protect');
    expect(clockStartAction(st({ eliminations: 1, sessionDate: '2026-09-30', updatedAt: '2026-09-29T03:00:00.000Z' }), '2026-09-30')).toBe('protect');
    expect(clockStartAction(st({ eliminations: 1, updatedAt: null }), '2026-09-30')).toBe('protect');
  });
  it('흔적 없는 행 = update · 행 없음 = new', () => {
    expect(clockStartAction(st({}), '2026-09-30')).toBe('update');
    expect(clockStartAction(null, '2026-09-30')).toBe('new');
  });
});
