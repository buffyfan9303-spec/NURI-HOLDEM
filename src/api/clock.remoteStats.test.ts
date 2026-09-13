// 리모컨 통계 delta — 재현/고정 (2026-09-13).
//
// 두 개의 사고를 **동시에** 잠근다.
//  (1) 기능 소실: C02(2026-09-12)로 리모컨이 장부 연동 클락의 liveStats 를 손대지 않게 했더니,
//      리모컨의 탈락·보정이 TV 보드(ClockDisplay 는 liveStats.alive 를 읽는다)에 영원히 반영되지 않았다.
//      → applyRemoteStatDelta 가 state 파생 필드를 갱신한다. (되돌려 `next.liveStats` 를 그대로 흘리면
//        아래 '탈락' 테스트가 실패한다 — 음성 대조.)
//  (2) C02 회귀: 리모컨이 진입 시 1회 읽은 낡은 buyins 로 장부 파생 필드를 덮어쓰면 안 된다.
//      → '장부 파생 필드는 리모컨이 덮어쓰지 않는다' 테스트가 그 경로를 막는다.
// 실행: npx vitest run src/api/clock.remoteStats.test.ts
import { describe, it, expect } from 'vitest';
import {
  applyRemoteStatDelta, computeLiveStats,
  type ClockConfig, type ClockState, type DerivedCounts,
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

/** 정본(PC·장부가 최신 장부로 계산해 둔 스냅샷) — 장부에 20명이 들어와 있는 상태 */
const LEDGER_NOW: DerivedCounts = { entries: 20, rebuys: 5, earlies: 6, doubleEarlies: 2, totalBuyins: 25 };
/** 리모컨이 진입 시 1회 읽고 그대로 굳어 버린 낡은 장부(그 뒤 8명이 더 들어왔다) */
const LEDGER_STALE: DerivedCounts = { entries: 12, rebuys: 1, earlies: 2, doubleEarlies: 0, totalBuyins: 13 };

const canonOf = (s: ClockState) => ({ ...computeLiveStats(s, LEDGER_NOW, cfg), buyInAmount: 60_000 });

describe('applyRemoteStatDelta · 리모컨 조작이 TV 보드에 반영된다', () => {
  it('탈락(eliminations)을 누르면 alive 가 줄어든다 — 정본을 그대로 흘리면 그대로다', () => {
    const prev = st({ eliminations: 4 });
    const canon = canonOf(prev);
    expect(canon.alive).toBe(16);

    const next = st({ eliminations: 5 }); // 리모컨 [탈락 −]
    const out = applyRemoteStatDelta(canon, prev, next, cfg)!;
    expect(out.eliminations).toBe(5);
    expect(out.alive).toBe(15); // ← C02 이전 동작(`next.liveStats` 그대로)이면 16 이라 여기서 실패한다
    expect(out.avgStack).toBe(Math.round(canon.totalStack / 15));
  });

  it('생존 +(탈락 취소)도 반영된다', () => {
    const prev = st({ eliminations: 4 });
    const next = st({ eliminations: 3 });
    expect(applyRemoteStatDelta(canonOf(prev), prev, next, cfg)!.alive).toBe(17);
  });

  it('보정(adj*)이 카운트와 총칩에 반영된다', () => {
    const prev = st();
    const canon = canonOf(prev);
    const next = st({ adjEntries: 1, adjRebuys: 2, adjAddons: 3, adjEarlies: 1 });
    const out = applyRemoteStatDelta(canon, prev, next, cfg)!;
    expect(out.entries).toBe(canon.entries + 1);
    expect(out.rebuys).toBe(canon.rebuys + 2);
    expect(out.addons).toBe(canon.addons + 3);
    expect(out.earlies).toBe(canon.earlies + 1);
    expect(out.totalStack).toBe(canon.totalStack + 30000 + 2 * 30000 + 3 * 20000 + 5000);
  });

  it('computeLiveStats 와 같은 식이다 — 같은 장부면 결과가 완전히 일치한다', () => {
    const prev = st({ adjEntries: 2, adjRebuys: 1, adjEarlies: 1, adjAddons: 0, eliminations: 4 });
    const next = st({ adjEntries: 3, adjRebuys: 1, adjEarlies: 2, adjAddons: 4, eliminations: 7 });
    const viaDelta = applyRemoteStatDelta(computeLiveStats(prev, LEDGER_NOW, cfg), prev, next, cfg)!;
    const direct = computeLiveStats(next, LEDGER_NOW, cfg);
    const rest = { ...viaDelta };
    delete rest.buyInAmount; // 장부 세션값 — computeLiveStats 는 이 키를 만들지 않는다
    expect(rest).toEqual(direct);
  });
});

// ── 클램프가 실제로 걸리는 입력까지 항등식을 넓힌다 (N4, 2026-09-13) ───────────────
//
// 왜: 위 항등식 테스트는 adjEarlies 가 **양수**인 경우만 봤다. computeLiveStats 의
//     `earlies = Math.max(0, 장부몫 + adjEarlies)` 는 음수 보정에서 클램프가 걸리는데,
//     delta 합성은 이미 클램프된 canon.earlies 를 기준으로 삼았기 때문에 그 구간에서
//     두 식이 갈렸다 — "같은 식이다" 라는 약속을 통과하던 이유가 "그 경우를 안 봐서" 였다.
// 재현(검증자 N4): 장부 얼리 0 · adjEarlies −5 → −3 이면 canon.earlies=0, 차분 +2 → 2.
//     직접 계산은 max(0, 0−3)=0. 리모컨은 `Math.max(-9999, …)` 까지 내려갈 수 있으므로 도달 가능하다.
const LEDGER_NO_EARLY: DerivedCounts = { entries: 20, rebuys: 5, earlies: 0, doubleEarlies: 0, totalBuyins: 25 };

describe('클램프 구간에서도 computeLiveStats 와 같은 식이다', () => {
  it('장부 얼리 0 · 보정 −5 → −3 은 2 가 아니라 0 이다', () => {
    const prev = st({ adjEarlies: -5 });
    const next = st({ adjEarlies: -3 });
    const canon = computeLiveStats(prev, LEDGER_NO_EARLY, cfg);
    expect(canon.earlies).toBe(0); // 이미 클램프된 값이 canon 이다
    const out = applyRemoteStatDelta(canon, prev, next, cfg)!;
    expect(out.earlies).toBe(0);
    expect(out.earlies).toBe(computeLiveStats(next, LEDGER_NO_EARLY, cfg).earlies);
  });

  // 전 필드 × 클램프 경계 전수 — earlies 만이 아니라 entries/rebuys/addons/alive/totalStack/avgStack 도
  // 같은 종류의 합성 문제가 없는지 본다(alive 도 max(0,…) 클램프가 걸린다).
  it('모든 보정·탈락 조합에서 delta 합성 = 직접 계산 (클램프 경계 전수)', () => {
    const LEDGERS: Array<[string, DerivedCounts]> = [
      ['장부 얼리 0', LEDGER_NO_EARLY],
      ['장부 얼리 있음', LEDGER_NOW],
    ];
    const ADJ = [-9999, -8, -5, -3, -1, 0, 1, 4];
    const ELIM = [0, 4, 6, 20, 25, 9999]; // 20/25 = entries 경계(생존 0 클램프)
    let checked = 0;
    for (const [name, ledger] of LEDGERS) {
      for (const a of ADJ) {
        for (const b of ADJ) {
          for (const e0 of ELIM) {
            for (const e1 of ELIM) {
              const prev = st({ adjEarlies: a, adjEntries: a, adjRebuys: b, adjAddons: a, eliminations: e0 });
              const next = st({ adjEarlies: b, adjEntries: b, adjRebuys: a, adjAddons: b, eliminations: e1 });
              const viaDelta = applyRemoteStatDelta(computeLiveStats(prev, ledger, cfg), prev, next, cfg)!;
              const direct = computeLiveStats(next, ledger, cfg);
              const rest = { ...viaDelta };
              delete rest.buyInAmount;
              expect(rest, `${name} · adj ${a}→${b} · elim ${e0}→${e1}`).toEqual(direct);
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBe(2 * 8 * 8 * 6 * 6);
  });
});

describe('C02 회귀 방지 · 장부 파생 필드는 리모컨이 덮어쓰지 않는다', () => {
  it('리모컨의 낡은 장부(buyins)는 결과에 전혀 들어가지 않는다', () => {
    const prev = st({ eliminations: 4 });
    const canon = canonOf(prev);
    const next = st({ eliminations: 5 });

    const out = applyRemoteStatDelta(canon, prev, next, cfg)!;
    // 정본 장부 몫(20명·5리바이)이 그대로 살아 있어야 한다
    expect(out.entries).toBe(canon.entries);
    expect(out.rebuys).toBe(canon.rebuys);
    expect(out.earlies).toBe(canon.earlies);
    expect(out.buyInAmount).toBe(60_000); // 장부 세션값 — 리모컨이 건드리지 않는다

    // 리모컨이 자기 낡은 장부로 재계산했다면 이 값이 나왔을 것이다(= 정본을 8명 깎아 덮어쓴다)
    const ifRecomputed = computeLiveStats(next, LEDGER_STALE, cfg);
    expect(ifRecomputed.entries).toBe(12);
    expect(out.entries).not.toBe(ifRecomputed.entries);
    expect(out.totalStack).not.toBe(ifRecomputed.totalStack);
  });

  it('정본 스냅샷이 아직 없으면(null) 없는 기준에 delta 를 얹지 않는다', () => {
    expect(applyRemoteStatDelta(null, st(), st({ eliminations: 9 }), cfg)).toBeNull();
    expect(applyRemoteStatDelta(undefined, st(), st(), cfg)).toBeNull();
  });

  it('alive·earlies 는 음수로 내려가지 않는다', () => {
    const prev = st({ eliminations: 0, adjEarlies: 0 });
    const canon = canonOf(prev);
    const next = st({ eliminations: 999, adjEarlies: -999 });
    const out = applyRemoteStatDelta(canon, prev, next, cfg)!;
    expect(out.alive).toBe(0);
    expect(out.earlies).toBe(0);
    expect(out.avgStack).toBe(0);
  });
});
