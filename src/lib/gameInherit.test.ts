import { describe, expect, it } from 'vitest';
import {
  posterLevelsToClock, clockPatchFromSchedule, clockPrizesFromSchedule,
  applyToClock, applyToPoster, applyToLedger,
  presetFromSchedule, presetFromClockConfig, presetFromRound, presetFromPosterForm,
} from './gameInherit';
import type { Schedule } from '../api/schedules';
import type { GamePresetData } from '../api/presets';
import type { ClockConfig } from '../api/clock';
import type { LedgerSession } from '../api/ledger';

const sched = (over: Record<string, unknown> = {}): Schedule => ({
  id: 's1', title: '데일리 6만', date: '2026-08-26', startTime: '19:00',
  buyIn: { amount: 60_000, startStack: 50_000, rebuyStack: 70_000, addonStack: 100_000 },
  structure: { lateRegLevels: 9, levels: [
    { sb: 100, bb: 200, ante: 0, minutes: 20 },
    { sb: 0, bb: 0, ante: 0, minutes: 10, isBreak: true },
    { sb: 200, bb: 400, ante: 400, minutes: 20 },
  ] },
  rankingPrizes: [
    { rank: '1', amount: 100, unit: '만원' },
    { rank: '2', amount: 300_000, unit: '원' },
    { rank: '3', amount: 10, unit: '%' },      // 돈 아님 — 제외돼야 함
    { rank: '4', amount: 0 },                   // 0 — 제외
  ],
  ...over,
} as unknown as Schedule);

describe('gameInherit · 포스터 → 장부/클락 상속(PL1)', () => {
  it('levels 변환: isBreak → kind, ante 기본 0', () => {
    const lv = posterLevelsToClock(sched().structure!.levels!);
    expect(lv[0]).toEqual({ kind: 'level', minutes: 20, sb: 100, bb: 200, ante: 0 });
    expect(lv[1].kind).toBe('break');
    expect(lv[2].ante).toBe(400);
  });

  it('무금액 패치(PL1a): 제목·레벨·레지레벨·스택·애드온', () => {
    const p = clockPatchFromSchedule(sched());
    expect(p.title).toBe('데일리 6만');
    expect(p.levels).toHaveLength(3);
    expect(p.regCloseLevel).toBe(9);
    expect(p.startStack).toBe(50_000);
    expect(p.rebuyStack).toBe(70_000);
    expect(p.addonStack).toBe(100_000);
    expect(p.isAddon).toBe(true);
  });

  it('구조 없는 포스터는 빈 패치에 가깝다(있는 것만 상속 · 부분 상속 허용)', () => {
    const p = clockPatchFromSchedule(sched({ structure: undefined, buyIn: { amount: 30_000 } }));
    expect(p.levels).toBeUndefined();
    expect(p.startStack).toBeUndefined();
    expect(p.isAddon).toBeUndefined();
  });

  it('금액 상속(PL1b): 만원→원 정규화 · 원 그대로 · %·0 제외 · 1만 배 오기록 차단', () => {
    const prizes = clockPrizesFromSchedule(sched());
    expect(prizes).toEqual([
      { place: '1', amount: 1_000_000 },
      { place: '2', amount: 300_000 },
    ]);
  });

  it('상금 전무 → null(기존 cfg.prizes 를 덮지 않도록)', () => {
    expect(clockPrizesFromSchedule(sched({ rankingPrizes: [] }))).toBeNull();
  });
});

// ── PL2a 어댑터 — 1프리셋 → 3폼, 단위 환산은 어댑터에서만 ─────────────────────────
const fullPreset = (): GamePresetData => ({
  title: '데일리 6만', gameType: '프리즈아웃',
  buyIn: 60_000, buyInWon: 60_000,
  startStack: 50_000, rebuyStack: 70_000, addonStack: 100_000, addonCost: 50_000,
  prizeType: 'GTD', prizeAmount: 100, prizeAmountWon: 1_000_000, prizePercent: 0,
  duration: '레벨당 20분',
  blindLevels: [
    { kind: 'level', sb: 100, bb: 200, ante: 0, minutes: 20 },
    { kind: 'break', sb: 0, bb: 0, ante: 0, minutes: 10 },
  ],
  rankingPrizes: [
    { rank: '1', amount: 100, unit: '만원', amountWon: 1_000_000 },
    { rank: '2', amount: 300_000, unit: '원' },
    { rank: '3', amount: 10, unit: '%' }, // 비화폐 — 클락 제외·포스터는 원문 유지
  ],
  poster: { startTime: '19:00', regCloseTime: '9LV 22:30', region: '서울 강남', paymentMethods: ['현금', '카드'] },
  ledger: {
    cardAmountWon: 65_000, targetEntries: 40,
    discounts: [{ label: '1레벨', amountWon: 10_000 }],
    dealers: '김딜러', eventMemo: '주말 이벤트', tournamentStartTime: '19:30',
  },
  clock: { regCloseLevel: 9, maxLevel: 18, earlyBonus: 5_000, doubleEarlyBonus: 10_000, earlyDoubleLevel: 1, earlySingleLevel: 4 },
});

describe('applyToClock · 프리셋 → 클락(PL2a)', () => {
  it('공용 + clock 네임스페이스 전체 적용, 순위상금은 원 정규화(1만 배 오기록 차단)', () => {
    const p = applyToClock(fullPreset());
    expect(p.title).toBe('데일리 6만');
    expect(p.levels).toHaveLength(2);
    expect(p.startStack).toBe(50_000);
    expect(p.isAddon).toBe(true);
    expect(p.regCloseLevel).toBe(9);
    expect(p.maxLevel).toBe(18);
    expect(p.earlyDoubleLevel).toBe(1);
    expect(p.earlySingleLevel).toBe(4);
    // 만원(amountWon 우선)·원 혼재 → 전부 원, % 제외
    expect(p.prizes).toEqual([{ place: '1', amount: 1_000_000 }, { place: '2', amount: 300_000 }]);
  });
  it('부분 프리셋: 빈 프리셋 → 빈 패치(기존 cfg 를 아무것도 안 덮는다)', () => {
    expect(applyToClock({})).toEqual({});
  });
  it("빈 단위('') 상금은 돈으로 추측하지 않는다(만원 오추정 = 1만 배 사고) · amountWon 정규형은 단위 무관 통과", () => {
    const noGuess = applyToClock({ rankingPrizes: [{ rank: '1', amount: 500_000, unit: '' }] });
    expect(noGuess.prizes).toBeUndefined();
    const normalized = applyToClock({ rankingPrizes: [{ rank: '1', amount: 50, unit: '', amountWon: 500_000 }] });
    expect(normalized.prizes).toEqual([{ place: '1', amount: 500_000 }]);
  });
});

describe('applyToPoster · 프리셋 → 포스터 폼(PL2a)', () => {
  it('GTD 원 → 만원(폼 단위), 순위상금 amountWon → 만원, 비화폐 행 원문 유지 · 1/10,000 회귀', () => {
    const p = applyToPoster(fullPreset());
    expect(p.buyIn).toBe(60_000);                 // 폼 바이인=원 그대로
    expect(p.prizeAmount).toBe(100);              // 1,000,000원 → 100만원 (1_000_000 이 아니어야 함)
    expect(p.rankingPrizes?.[0]).toEqual({ rank: '1', amount: 100, unit: '만원' });
    expect(p.rankingPrizes?.[1]).toEqual({ rank: '2', amount: 300_000, unit: '원' }); // 구형 '원' 행은 원문 무손실
    expect(p.rankingPrizes?.[2]).toEqual({ rank: '3', amount: 10, unit: '%' });       // 비화폐 원문 유지
    expect(p.startTime).toBe('19:00');
    expect(p.region).toBe('서울 강남');
    expect(p.blindLevels?.[1].isBreak).toBe(true);
  });
  it('구형 프리셋(buyIn 만·prizeAmount 만원) 폴백 · 마이그레이션 없이 그대로 열림', () => {
    const p = applyToPoster({ buyIn: 30_000, prizeType: 'GTD', prizeAmount: 500 });
    expect(p.buyIn).toBe(30_000);      // buyInWon 없음 → buyIn(원) 폴백
    expect(p.prizeAmount).toBe(500);   // 500만원(구형) → 5,000,000원 → 500만원 왕복 무손실
  });
  it('부분 프리셋(clock 만) → 포스터 폼 불간섭(빈 패치)', () => {
    expect(applyToPoster({ clock: { regCloseLevel: 9 } })).toEqual({});
  });
});

describe('applyToLedger · 프리셋 → 장부 세션(PL2a)', () => {
  it('원 정규형 그대로 통과 + ledger 네임스페이스(카드단가·할인·딜러)', () => {
    const p = applyToLedger(fullPreset());
    expect(p.buyinAmount).toBe(60_000);
    expect(p.cardAmount).toBe(65_000);
    expect(p.gameType).toBe('gtd');
    expect(p.isAddon).toBe(true);
    expect(p.addonStack).toBe(100_000);
    expect(p.discounts).toEqual([{ label: '1레벨', amount: 10_000, level: 0 }]); // amountWon → 장부 amount(원) · level 동반
    expect(p.dealers).toBe('김딜러');
    expect(p.tournamentStartTime).toBe('19:30');
  });
  it('부분 프리셋(poster 만) → 장부 폼 불간섭', () => {
    expect(applyToLedger({ poster: { region: '서울' } })).toEqual({});
  });
});

describe('PL3 변환기 · 클락 프리셋·회차 스냅샷 → 프리셋', () => {
  const cfg: ClockConfig = {
    title: '터보 10만', startStack: 30_000, rebuyStack: 30_000, addonStack: 0, isAddon: false,
    earlyBonus: 3_000, doubleEarlyBonus: 6_000, regCloseLevel: 8, maxLevel: 15,
    earlyDoubleLevel: 1, earlySingleLevel: 3, earlyDoubleMin: 20, earlySingleMin: 60, mysteryBounty: 0,
    prizes: [{ place: '1위', amount: 500_000 }],
    levels: [{ kind: 'level', sb: 100, bb: 200, ante: 200, minutes: 15 }],
  };
  it('presetFromClockConfig: 클락 prizes(원) → amountWon 병기 + 만원 표시, clock 네임스페이스 이관', () => {
    const d = presetFromClockConfig(cfg);
    expect(d.title).toBe('터보 10만');
    expect(d.rankingPrizes).toEqual([{ rank: '1위', amount: 50, unit: '만원', amountWon: 500_000 }]);
    expect(d.clock).toMatchObject({ regCloseLevel: 8, maxLevel: 15, earlyDoubleLevel: 1, earlySingleLevel: 3 });
    expect(d.blindLevels).toHaveLength(1);
  });
  const sess = {
    venueId: 'v1', sessionDate: '2026-08-24', gameSeq: 1,
    buyinAmount: 100_000, cardAmount: 110_000, gameType: 'gtd', targetEntries: 30, maxEntries: 0,
    isAddon: false, addonStack: 0, title: '주말 하이롤러', dealers: '박딜러',
    discounts: [{ label: '1레벨', amount: 20_000 }],
    regClosed: false, closed: true, earlyDoubleMin: 0, earlySingleMin: 0,
    tournamentStart: '2026-08-24T19:00:00+09:00',
  } as unknown as LedgerSession;
  it('presetFromRound: 장부 단가(원) → buyInWon, 할인 → amountWon, 클락 설정이 스택·구조를 이긴다', () => {
    const d = presetFromRound(sess, cfg, null);
    expect(d.title).toBe('주말 하이롤러');
    expect(d.buyInWon).toBe(100_000);
    expect(d.ledger?.cardAmountWon).toBe(110_000);
    expect(d.ledger?.discounts).toEqual([{ label: '1레벨', amountWon: 20_000, level: 0 }]);
    expect(d.startStack).toBe(30_000);              // 클락 설정 우선
    expect(d.clock?.regCloseLevel).toBe(8);
    expect(d.prizeType).toBe('GTD');
  });
  it('presetFromRound: 클락 스냅샷 없는 회차도 장부 몫만으로 성립(부분 프리셋)', () => {
    const d = presetFromRound(sess, null, null);
    expect(d.buyInWon).toBe(100_000);
    expect(d.blindLevels).toBeUndefined();
    expect(d.clock).toBeUndefined();
  });
});

describe('presetFromSchedule / presetFromPosterForm · 왕복 단위 무손실(1/10,000 회귀)', () => {
  it('presetFromSchedule: 포스터 네임스페이스 + 정규형 병기', () => {
    const d = presetFromSchedule(sched({ startTime: '19:00', region: '서울', paymentMethods: ['현금'] } as unknown as Record<string, unknown>));
    expect(d.buyInWon).toBe(60_000);
    expect(d.poster?.startTime).toBe('19:00');
    expect(d.clock?.regCloseLevel).toBe(9); // lateRegLevels → clock ns
  });
  it('presetFromPosterForm: GTD 만원 입력 → prizeAmountWon(원), 순위 만원 → amountWon', () => {
    const d = presetFromPosterForm({
      title: '데일리', date: '2026-08-26', startTime: '19:00', regCloseTime: '9LV', duration: '', blinds: '',
      prizeType: 'GTD', prizeAmount: 110, prizePercent: 0, buyIn: 60_000, gameType: '', addonStack: 0, addonCost: 0,
      startStack: 0, rebuyStack: 0, region: '서울', isCompetition: false, grade: null,
      paymentMethods: ['현금'], partners: [], prizes: [],
      rankingPrizes: [{ rank: '1', amount: 50, unit: '만원' }], events: [], blindLevels: [],
    });
    expect(d.prizeAmountWon).toBe(1_100_000);
    expect(d.buyInWon).toBe(60_000);
    expect(d.rankingPrizes).toEqual([{ rank: '1', amount: 50, unit: '만원', amountWon: 500_000 }]);
    // 왕복: 포스터 폼 → 프리셋 → 포스터 폼에서 단위가 보존된다
    const back = applyToPoster(d);
    expect(back.prizeAmount).toBe(110);
    expect(back.rankingPrizes?.[0]).toEqual({ rank: '1', amount: 50, unit: '만원' });
  });
});

// ── 할인 자동적용 레벨(#20)이 프리셋 왕복에서 살아남는가 ──────────────────────
// 2026-09-05 감사: 이 값이 조용히 버려져, 프리셋을 불러온 순간 레벨 자동 할인이 꺼졌다.
// 프리셋 화면은 '그대로 적용'이라고 적혀 있어 꺼진 줄 모르고 하루를 돌린다.
describe('할인 level 왕복 보존 (#20 회귀 방지)', () => {
  it('장부 → 프리셋 → 장부 로 돌아도 level 이 유지된다', () => {
    const ledgerDiscounts = [
      { label: '1레벨', amount: 50_000, level: 1 },
      { label: '2레벨', amount: 30_000, level: 2 },
    ];
    // 장부 → 프리셋
    const toPreset = ledgerDiscounts.map((x) => ({ label: x.label ?? '', amountWon: x.amount ?? 0, level: x.level ?? 0 }));
    expect(toPreset).toEqual([
      { label: '1레벨', amountWon: 50_000, level: 1 },
      { label: '2레벨', amountWon: 30_000, level: 2 },
    ]);
    // 프리셋 → 장부
    const back = toPreset.map((x) => ({ label: x.label ?? '', amount: x.amountWon ?? 0, level: x.level ?? 0 }));
    expect(back).toEqual(ledgerDiscounts);
    // 핵심: level 이 0 으로 떨어지지 않는다 — 떨어지면 autoDiscountIndex 가 영영 0 을 돌려준다
    expect(back.every((d) => d.level > 0)).toBe(true);
  });
});
