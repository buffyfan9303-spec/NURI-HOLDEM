// 얼리 보정이 0 밑으로 내려가 **칩이 음수가 되던** 결함 (오너 보고 #11, 2026-09-15)
//
// 오너 원문: "클락에 얼리 표기가 안되고 0에서 -1 이면 -5000이 되어 있어 — 음수는 안되게"
//
// 재현(수정 전 실측 — 아래 screen() 이 그대로 그 계산이다):
//   earlyBonus 5,000 · doubleEarlyBonus 10,000 · 장부 자동 얼리 0
//   [얼리 −] 1회 → adjEarlies = −1
//     · earlies       = max(0, 0 + (−1)) = **0**  ← 화면 숫자는 그대로 0 ("표기가 안되고")
//     · adjChips      = (−1) × 5,000     = **−5,000**
//     · totalStack    = **−5,000**       ← TV '총 칩' 이 −5,000 ("−5000이 되어 있어")
//     · avgStack      = 생존이 있으면 음수까지 내려간다
//   즉 **카운트만 0 으로 클램프되고 칩은 클램프되지 않아** 두 값이 갈렸다.
//
// 번지는 범위(실측 grep): liveStats.totalStack·avgStack 을 읽는 세 화면이 전부 음수를 그대로 그린다 —
//   ClockStage.tsx:427·428(TV '총 칩'·'평균 스택') · LiveGamesTab.tsx:413·509(유저 라이브 탭 평균) ·
//   ScheduleDetailModal.tsx:930·931(TOTAL CHIPS / AVG STACK).
//   장부·정산·순위는 adj* 를 읽지 않는다(ledgerSettlement.ts:193) — 돈(원) 경로로는 안 번진다.
//
// 막는 곳이 둘인 이유:
//   ① 상태 하한 — clampAdjEarlies() 로 실효 카운트(자동+보정)가 0 밑으로 내려가지 않게 한다.
//      리모컨·운영자·장부 세 버튼이 같은 하한을 쓴다(소스 배선 단언으로 잠근다).
//   ② 칩 하한 — 이미 음수로 저장된 낡은 행·직접 호출·리모컨 차분 경로에서도 칩이 음수가 되지 않게
//      computeLiveStats / applyRemoteStatDelta 가 **클램프된 실효 보정분**으로 칩을 환산한다.
//   ①만 하면 DB 에 남아 있는 음수 행이 계속 −5,000 을 그린다. ②만 하면 버튼이 계속 죽은 채로 눌린다.
//
// 음성 대조: clock.ts 의 adjChips 를 `st.adjEarlies * (earlyUnitChips(cfg) || cfg.earlyBonus)` 로
//   되돌리면 '🔴 칩' 단언이, clampAdjEarlies 를 `Math.max(-9999, …)` 로 되돌리면 '🔴 하한' 단언이 실패한다.
// 실행: npx vitest run src/api/clock.earlyFloor.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyRemoteStatDelta, clampAdjEarlies, computeLiveStats, defaultClockConfig, emptyClockState,
} from './clock';

const cfg = { ...defaultClockConfig(), earlyBonus: 5_000, doubleEarlyBonus: 10_000, startStack: 0, rebuyStack: 0, addonStack: 0 };
/** 얼리 보너스를 안 쓰는 게임 — 기준 단위가 0 이라 구 동작(1건 = 1)으로 떨어지는 경로. */
const cfgNoBonus = { ...cfg, earlyBonus: 0, doubleEarlyBonus: 0 };

const derivedOf = (autoSingles: number) => ({ entries: 0, rebuys: 0, earlies: autoSingles, doubleEarlies: 0, totalBuyins: 0 });

/** 오너가 본 그대로 — 장부 자동 몫과 수기 보정으로 스냅샷을 만들고 화면 3값을 돌려준다. */
function screen(autoSingles: number, adjEarlies: number, c = cfg) {
  const ls = computeLiveStats({ ...emptyClockState('v1', c), adjEarlies }, derivedOf(autoSingles), c);
  return { earlies: ls.earlies, totalStack: ls.totalStack, avgStack: ls.avgStack };
}

describe('얼리 음수 #11 — 카운트도 칩도 0 밑으로 안 내려간다', () => {
  it('🔴 칩: 자동 0 · 보정 −1 → 총 칩 0 (수정 전 −5,000)', () => {
    expect(screen(0, -1)).toEqual({ earlies: 0, totalStack: 0, avgStack: 0 });
  });

  it('🔴 칩: 보정을 아무리 내려도 총 칩이 음수가 되지 않는다', () => {
    for (const adj of [-1, -2, -7, -9999]) {
      expect(screen(0, adj).totalStack).toBe(0);
      expect(screen(0, adj).earlies).toBe(0);
    }
  });

  it('🔴 칩: 자동이 있을 때 초과 차감도 0 에서 멈춘다(자동 3 · 보정 −9 → 얼리 0 · 칩 0)', () => {
    expect(screen(3, -9)).toEqual({ earlies: 0, totalStack: 0, avgStack: 0 });
  });

  it('정상 구간은 종전과 같다 — 클램프가 걸리지 않으면 값이 변하지 않는다', () => {
    // 자동 3단위(1얼리 3명 = 15,000칩) · 보정 −1 → 2단위 = 10,000칩
    expect(screen(3, -1)).toEqual({ earlies: 2, totalStack: 10_000, avgStack: 0 });
    expect(screen(3, 0)).toEqual({ earlies: 3, totalStack: 15_000, avgStack: 0 });
    expect(screen(3, 2)).toEqual({ earlies: 5, totalStack: 25_000, avgStack: 0 });
    // 더블얼리(10,000 = 2단위)도 그대로
    const d = { entries: 0, rebuys: 0, earlies: 2, doubleEarlies: 1, totalBuyins: 0 };
    const ls = computeLiveStats({ ...emptyClockState('v1', cfg), adjEarlies: 0 }, d, cfg);
    expect(ls.earlies).toBe(3);          // 더블 2단위 + 1얼리 1단위
    expect(ls.totalStack).toBe(15_000);  // 10,000 + 5,000
  });

  it('얼리 보너스 미설정 게임(단위 0)에서도 칩은 0 이고 카운트만 움직인다', () => {
    expect(screen(0, -3, cfgNoBonus)).toEqual({ earlies: 0, totalStack: 0, avgStack: 0 });
    expect(screen(2, 0, cfgNoBonus)).toEqual({ earlies: 2, totalStack: 0, avgStack: 0 });
  });

  it('🔴 하한: clampAdjEarlies 는 실효 카운트를 0 밑으로 내리지 않는다', () => {
    // 장부 자동 0 — 0 에서 [−] 를 눌러도 보정은 0 에 머문다(예전엔 −1 로 내려갔다)
    const ls0 = computeLiveStats({ ...emptyClockState('v1', cfg), adjEarlies: 0 }, derivedOf(0), cfg);
    expect(clampAdjEarlies(ls0, 0, -1)).toBe(0);
    // 장부 자동 3 — −3 까지는 내려가고 그 밑으로는 안 내려간다
    // (스냅샷은 언제나 **그 시점의 보정값**으로 계산된 것이 넘어온다 — 호출부가 state 와 liveStats 를 같이 들고 있다)
    const snap = (adjEarlies: number) => computeLiveStats({ ...emptyClockState('v1', cfg), adjEarlies }, derivedOf(3), cfg);
    expect(clampAdjEarlies(snap(0), 0, -1)).toBe(-1);
    expect(clampAdjEarlies(snap(-2), -2, -1)).toBe(-3);
    expect(clampAdjEarlies(snap(-3), -3, -1)).toBe(-3);
    // 이미 음수로 저장된 낡은 행에서 [−] 를 눌러도 더 내려가지 않는다
    const lsBad = computeLiveStats({ ...emptyClockState('v1', cfg), adjEarlies: -5 }, derivedOf(0), cfg);
    expect(clampAdjEarlies(lsBad, -5, -1)).toBe(-5);
    // [+] 는 언제나 자유롭다
    expect(clampAdjEarlies(ls0, 0, 1)).toBe(1);
    expect(clampAdjEarlies(lsBad, -5, 1)).toBe(-4);
    // liveStats 가 아직 없는 클락(장부 미연동) — 보정이 곧 카운트라 0 이 하한이다
    expect(clampAdjEarlies(null, 0, -1)).toBe(0);
    expect(clampAdjEarlies(null, 3, -1)).toBe(2);
  });

  it('🔴 칩: 리모컨 차분 경로(applyRemoteStatDelta)도 같은 하한을 쓴다', () => {
    const st = (adjEarlies: number) => ({ ...emptyClockState('v1', cfg), adjEarlies });
    const canon = computeLiveStats(st(0), derivedOf(0), cfg);
    const next = applyRemoteStatDelta(canon, st(0), st(-1), cfg)!;
    expect(next.earlies).toBe(0);
    expect(next.totalStack).toBe(0);   // 수정 전 −5,000
    // 정상 구간(자동 3 · 0 → −1)은 종전과 같다
    const canon3 = computeLiveStats(st(0), derivedOf(3), cfg);
    const next3 = applyRemoteStatDelta(canon3, st(0), st(-1), cfg)!;
    expect(next3.earlies).toBe(2);
    expect(next3.totalStack).toBe(10_000);
  });

  it('🔴 하한: 얼리 [−] 세 버튼이 모두 clampAdjEarlies 를 거친다(소스 배선)', () => {
    // 하나라도 Math.max(-9999, …) 로 남아 있으면 그 화면에서만 음수가 뚫린다.
    const src = (p: string) => readFileSync(join(__dirname, p), 'utf8');
    const wired: [string, string][] = [
      ['../components/features/clock/ClockRemote.tsx', 'ClockRemote'],
      ['../components/features/clock/TournamentClock.tsx', 'TournamentClock'],
      ['../components/features/NuriPosLedger.tsx', 'NuriPosLedger'],
    ];
    for (const [path, name] of wired) {
      const s = src(path);
      expect(s, `${name} 가 clampAdjEarlies 를 import 하지 않는다`).toMatch(/clampAdjEarlies/);
      expect(s, `${name} 에 옛 무제한 하한(-9999)이 남아 있다`).not.toMatch(/adjEarlies[^\n]*-9999|-9999[^\n]*adjEarlies/);
    }
  });
});
