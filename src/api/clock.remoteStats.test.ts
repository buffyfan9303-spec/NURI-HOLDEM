// 라이브 통계 합성 — composeLiveStats 단일 정본 (K1·K5, 2026-09-29 실측으로 applyRemoteStatDelta 를 대체).
//
// 왜 바꿨나: 리모컨이 '정본 스냅샷에 차분을 얹어' live_stats 를 **통째로** 쓰던 구조는 낡은 사본 하나가 남의 변경을 지웠다
//   (하네스 2B: 리모컨A 엔트리+ · 200ms 뒤 리모컨B 탈락 → 열 값 10/11 인데 TV 9/10 이 35초 뒤에도 그대로).
//   이제 live_stats 에서 믿는 것은 **장부 몫(ledger)** 뿐이고, 생존·엔트리·총칩은 읽는 쪽이 행의 열과 합성한다.
//   예전 두 사고는 이 합성이 그대로 막는다:
//  (1) 기능 소실(C02 뒤): 리모컨 탈락·보정이 TV 에 안 나갔다 → 합성이 열을 직접 읽으므로 쓰기가 필요 없다.
//  (2) C02: 리모컨의 낡은 장부로 장부 몫을 덮으면 안 된다 → 합성은 **저장된** 장부 몫만 쓴다.
// 음성 대조: composeLiveStats 가 `ls?.ledger` 분기에서 저장된 `ls` 를 그대로 돌려주게 하면 '탈락'·'2B' 단언이 빨개진다.
// 실행: npx vitest run src/api/clock.remoteStats.test.ts
import { describe, it, expect } from 'vitest';
import {
  composeLiveStats, computeLiveStats, ledgerLiveStats, earlyUnitTotal,
  type ClockConfig, type ClockState, type DerivedCounts, type ClockLiveStats,
} from './clock';

const cfg: ClockConfig = {
  title: 'T', startStack: 30000, rebuyStack: 30000, addonStack: 20000, isAddon: true,
  earlyBonus: 5000, doubleEarlyBonus: 10000, regCloseLevel: 9, maxLevel: 30,
  earlyDoubleLevel: 3, earlySingleLevel: 6, earlyDoubleMin: 60, earlySingleMin: 120,
  mysteryBounty: 0, prizes: [], levels: [{ kind: 'level', sb: 100, bb: 200, ante: 0, minutes: 20 }],
};

const st = (o: Partial<ClockState> = {}): ClockState => ({
  venueId: 'v1', gameSeq: 1, sessionDate: '2026-09-13', title: 'T', config: cfg,
  currentIndex: 0, running: true, endsAt: null, remainingMs: 600_000,
  adjEntries: 0, adjRebuys: 0, adjEarlies: 0, adjAddons: 0, eliminations: 4, ...o,
});

const LEDGER: DerivedCounts = { entries: 20, rebuys: 5, earlies: 6, doubleEarlies: 2, totalBuyins: 25 };
/** 어떤 기기가 그 순간의 **자기 사본**(adj·탈락)으로 계산해 저장한 스냅샷 — 옛 필드는 그 사본 기준이다 */
const saved = (writer: ClockState): ClockLiveStats => ({
  ...computeLiveStats(writer, LEDGER, cfg), buyInAmount: 60_000, ledger: { ...LEDGER, earlyUnits: earlyUnitTotal(LEDGER, cfg) },
});

describe('composeLiveStats · 표시는 장부 몫 + 행의 열', () => {
  it('🔴 탈락이 늘면 생존이 준다 — 저장된 alive(옛 사본)를 믿지 않는다', () => {
    const row = st({ eliminations: 5, liveStats: saved(st({ eliminations: 4 })) });
    expect(row.liveStats!.alive).toBe(16);            // 저장값(옛 사본) — 여기에 멈추면 TV 가 굳는다
    expect(composeLiveStats(row)!.alive).toBe(15);
  });

  it('🔴 2B — 한 기기의 엔트리+ 와 다른 기기의 탈락이 겹쳐도 열 값 그대로(10/11)', () => {
    const L0: DerivedCounts = { entries: 0, rebuys: 0, earlies: 0, doubleEarlies: 0, totalBuyins: 0 };
    // 리모컨B 가 엔트리+ 를 모르는 사본(adj 10 · 탈락 1)으로 쓴 스냅샷 = 9/10
    const stale = { ...computeLiveStats(st({ adjEntries: 10, eliminations: 1 }), L0, cfg), ledger: { ...L0, earlyUnits: 0 } };
    const row = st({ adjEntries: 11, eliminations: 1, liveStats: stale });
    const c = composeLiveStats(row)!;
    expect(`${c.alive}/${c.entries}`).toBe('10/11');
  });

  it('computeLiveStats 와 완전히 같은 식이다(장부 몫이 같으면)', () => {
    const row = st({ adjEntries: 2, adjRebuys: -1, adjEarlies: 3, adjAddons: 4, eliminations: 7, liveStats: saved(st()) });
    const { buyInAmount, ledger, ...rest } = composeLiveStats(row)!;
    expect(rest).toEqual(computeLiveStats(row, LEDGER, cfg));
    expect(buyInAmount).toBe(60_000);
    expect(ledger).toEqual({ ...LEDGER, earlyUnits: earlyUnitTotal(LEDGER, cfg) });
  });

  it('C02 — 장부 몫은 저장된 것만 쓴다(어느 화면의 낡은 장부도 합성에 안 들어간다)', () => {
    const row = st({ liveStats: saved(st()) });
    expect(composeLiveStats(row)!.entries).toBe(20);
  });

  it('장부 미연동 — 한 번도 안 눌렀으면 null(시작 전 0/0 금지), 누르면 열이 곧 전부', () => {
    const idle = st({ sessionDate: null, eliminations: 0, liveStats: null });
    expect(composeLiveStats(idle)).toBeNull();
    const c = composeLiveStats(st({ sessionDate: null, adjEntries: 9, eliminations: 2, liveStats: null }))!;
    expect(`${c.alive}/${c.entries}`).toBe('7/9');
    expect(c.totalStack).toBe(9 * cfg.startStack);
  });

  it('장부 몫이 없는 낡은 스냅샷은 그대로(예전 동작) — 새 판 작성기가 장부 몫을 채우면 합성으로 넘어간다', () => {
    const legacy = { ...computeLiveStats(st(), LEDGER, cfg), buyInAmount: 1 };
    expect(composeLiveStats(st({ eliminations: 9, liveStats: legacy }))).toBe(legacy);
  });

  it('ledgerLiveStats(저장용)의 장부 몫은 세션 얼리 창으로 센다(K4) — 합성과 이어진다', () => {
    const s = st({ eliminations: 0, liveStats: null });
    const out = ledgerLiveStats(s, [], { earlyDoubleMin: 0, earlySingleMin: 0, tournamentStart: null, openedAt: null, buyinAmount: 5 });
    expect(out.ledger).toEqual({ entries: 0, rebuys: 0, earlies: 0, doubleEarlies: 0, totalBuyins: 0, earlyUnits: 0 });
    expect(composeLiveStats({ ...s, adjEntries: 3, liveStats: out })!.alive).toBe(3);
  });
});
