// 엔트리·리바이·애드온 수기 보정의 하한 — #11 과 **같은 부류**, 다른 필드.
//
// 무엇이 문제였나:
//   오너 보고 #11(2026-09-15)은 "얼리 표기가 안 되고 TV 총 칩이 −5,000" 이었다. 그건 얼리만 고쳤다.
//   엔트리·리바이·애드온의 [−] 는 그대로 `Math.max(-9999, …)` 라, 계속 누르면
//     entries = derived.entries + adjEntries  →  음수
//     totalStack = entries × startStack + …   →  음수
//   가 되어 TV '총 칩'이 마이너스로 떨어진다. 증상도 원인도 #11 과 같다.
//   2026-09-16 에 전체화면 오버레이에 엔트리 ± 버튼을 더하면서 이 자리를 누를 수 있는 화면이 늘었다.
//
// 왜 '쓰기 쪽 하한' 하나로만 막는가 (2026-09-17 — 표시 클램프를 시도했다가 철회한 기록):
//   computeLiveStats 에서 `Math.max(0, …)` 로 자르면 applyRemoteStatDelta(리모컨)가 그 **잘린 값**에
//   차분을 얹게 되어 리모컨과 PC 의 계산이 갈린다. 기존 `clock.remoteStats.test.ts` 의 동치 단언이
//   즉시 빨개졌다(자동 12 → 9991 로 튐). 얼리가 `earliesRaw`(클램프 전 값)를 따로 들고 다니는 이유가 이것이다.
//   엔트리·리바이·애드온은 **카운트와 칩이 같은 변수**를 쓰므로 둘이 갈릴 일이 없다 →
//   쓰기 시점에 음수를 못 만들게 하면 표시에서 잘라 낼 것 자체가 생기지 않는다. 필드 3개를 더 만들지 않는다.
//   라이브 실측(2026-09-17): clock_states 1행 · 음수 보정 0건 — 되돌려야 할 낡은 행이 없다.
//
// ⚠ 음성 대조: clampAdjCount 를 `Math.max(-9999, …)` 로 되돌리면 '하한'·'도달가능' 단언이 실패한다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  clampAdjCount, computeLiveStats, defaultClockConfig, emptyClockState,
  type ClockState, type DerivedCounts,
} from './clock';

const VENUE = '00000000-0000-0000-0000-000000000001';
const cfg = {
  ...defaultClockConfig(),
  // 칩 단언을 읽기 쉽게 고정한다(기본값 변화에 흔들리지 않게)
  startStack: 50_000, rebuyStack: 70_000, addonStack: 30_000, earlyBonus: 0, doubleEarlyBonus: 0,
};

const derivedOf = (entries: number, rebuys = 0): DerivedCounts =>
  ({ entries, rebuys, earlies: 0, doubleEarlies: 0, totalBuyins: entries + rebuys });

const st = (over: Partial<ClockState> = {}): ClockState => ({ ...emptyClockState(VENUE, cfg, 1), ...over });

describe('엔트리·리바이·애드온 보정 하한 (#11 과 같은 부류)', () => {
  // ── 하한 규칙 ──────────────────────────────────────────────────────────────
  it('🔴 하한: 자동 몫보다 더 내려가지 않는다', () => {
    // 자동 3 → 보정은 −3 까지만
    expect(clampAdjCount(3, 0, -1)).toBe(-1);
    expect(clampAdjCount(3, -2, -1)).toBe(-3);
    expect(clampAdjCount(3, -3, -1)).toBe(-3);   // 여기서 멈춘다
    // 자동 0(애드온 · 장부 미연동) → 보정은 0 이 하한
    expect(clampAdjCount(0, 0, -1)).toBe(0);
    expect(Object.is(clampAdjCount(0, 0, -1), -0)).toBe(false); // -0 이 새지 않는다
  });

  it('🔴 하한: 이미 범위 밖인 낡은 값은 그 자리에 두되 더 내려가지 않고, [+] 로는 올라온다', () => {
    expect(clampAdjCount(0, -5, -1)).toBe(-5);
    expect(clampAdjCount(0, -5, 1)).toBe(-4);
    expect(clampAdjCount(3, 2, 1)).toBe(3);      // 위쪽은 제한이 없다
  });

  it('얼리와 같은 규칙을 쓴다 — clampAdjEarlies 가 이 함수로 내려간다', async () => {
    const { clampAdjEarlies } = await import('./clock');
    // 자동 3(earliesRaw 3 · adj 0) 에서 −1 을 네 번: −1 −2 −3 −3
    let adj = 0;
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      adj = clampAdjEarlies({ earlies: Math.max(0, 3 + adj), earliesRaw: 3 + adj }, adj, -1);
      seen.push(adj);
    }
    expect(seen).toEqual([-1, -2, -3, -3]);
  });

  // ── 도달 가능한 상태에서는 음수가 나오지 않는다(진짜 계약) ───────────────────
  it('🔴 도달가능: [−] 를 아무리 눌러도 카운트·총칩이 음수가 되지 않는다', () => {
    const AUTO_E = 3, AUTO_R = 1;
    let adjEntries = 0, adjRebuys = 0, adjAddons = 0;
    for (let i = 0; i < 30; i++) {          // 바닥을 한참 지나도록 계속 누른다
      adjEntries = clampAdjCount(AUTO_E, adjEntries, -1);
      adjRebuys = clampAdjCount(AUTO_R, adjRebuys, -1);
      adjAddons = clampAdjCount(0, adjAddons, -1);
      const ls = computeLiveStats(st({ adjEntries, adjRebuys, adjAddons }), derivedOf(AUTO_E, AUTO_R), cfg);
      expect(ls.entries, `${i}번째 [−] 뒤 엔트리`).toBeGreaterThanOrEqual(0);
      expect(ls.rebuys, `${i}번째 [−] 뒤 리바이`).toBeGreaterThanOrEqual(0);
      expect(ls.addons, `${i}번째 [−] 뒤 애드온`).toBeGreaterThanOrEqual(0);
      expect(ls.totalStack, `${i}번째 [−] 뒤 총 칩`).toBeGreaterThanOrEqual(0);
    }
    // 바닥에 정확히 앉았는지(덜 내려가지도, 더 내려가지도 않았다)
    expect([adjEntries, adjRebuys, adjAddons]).toEqual([-AUTO_E, -AUTO_R, 0]);
    const ls = computeLiveStats(st({ adjEntries, adjRebuys, adjAddons }), derivedOf(AUTO_E, AUTO_R), cfg);
    expect([ls.entries, ls.rebuys, ls.addons, ls.totalStack]).toEqual([0, 0, 0, 0]);
  });

  it('정상 구간은 종전과 같다 — 하한이 멀쩡한 값을 건드리지 않는다', () => {
    const ls = computeLiveStats(st({ adjEntries: 2, adjRebuys: 1, adjAddons: 3 }), derivedOf(10, 4), cfg);
    expect(ls.entries).toBe(12);
    expect(ls.rebuys).toBe(5);
    expect(ls.addons).toBe(3);
    expect(ls.totalStack).toBe(12 * 50_000 + 5 * 70_000 + 3 * 30_000);
  });

  it('[−] 를 바닥에서 누른 뒤 [+] 한 번이면 바로 숫자가 움직인다 (#11 의 "표기가 안되고")', () => {
    let adj = 0;
    for (let i = 0; i < 10; i++) adj = clampAdjCount(2, adj, -1);   // 바닥(−2)에서 여덟 번 더 누름
    expect(adj).toBe(-2);
    expect(computeLiveStats(st({ adjEntries: adj }), derivedOf(2), cfg).entries).toBe(0);
    adj = clampAdjCount(2, adj, 1);                                  // [+] 한 번
    expect(computeLiveStats(st({ adjEntries: adj }), derivedOf(2), cfg).entries).toBe(1);
  });

  // ── 소스 배선 — 한 화면만 옛 하한으로 남으면 그 화면에서만 뚫린다 ──────────────
  it('🔴 배선: 엔트리·리바이·애드온 [−] 버튼이 모두 clampAdjCount 를 거친다', () => {
    const wired: [string, string][] = [
      ['../components/features/clock/ClockRemote.tsx', 'ClockRemote'],
      ['../components/features/clock/TournamentClock.tsx', 'TournamentClock'],
    ];
    for (const [path, name] of wired) {
      const s = readFileSync(join(__dirname, path), 'utf8');
      expect(s, `${name} 가 clampAdjCount 를 쓰지 않는다`).toMatch(/clampAdjCount\(/);
      expect(s, `${name} 에 옛 무제한 하한이 adj 보정에 남아 있다`)
        .not.toMatch(/adjEntries[^\n]*-9999|adjRebuys[^\n]*-9999|adjAddons[^\n]*-9999|-9999[^\n]*state\[key\]/);
    }
  });
});
