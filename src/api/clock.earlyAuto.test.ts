// 장부 라이브 클락 패널의 '얼리 보정 · 자동 N ±M' — N 을 클램프된 값으로 역산하던 결함 (2026-09-13)
//
// 재현(수정 전 실측, computeLiveStats 로 만든 진짜 스냅샷 기준):
//   earlyBonus 5,000 · doubleEarlyBonus 10,000 · 장부 자동 몫 3단위
//   · adjEarlies −5 → earliesRaw −2 / earlies 0 → 화면 '자동' = 0 − (−5) = **5** (참값 3)
//   · 장부 자동 0 · adjEarlies −5 → earliesRaw −5 / earlies 0 → 화면 '자동' = **5** (참값 0)
//   즉 adjEarlies 를 음수로 크게 내리면 '자동' 이 |adjEarlies| 로 **고정**됐다.
//   리모컨·장부의 [얼리 −] 는 Math.max(-9999, …) 까지 내려가므로 실제로 도달하는 구간이다.
//
// 원인: `liveStats.earlies` 는 computeLiveStats 에서 `Math.max(0, earliesRaw)` 로 클램프된 값이라
//   보정을 되빼는 역산이 성립하지 않는다. N4 가 남긴 클램프 전 값(earliesRaw)이 정확히 이때 필요한
//   기준인데 이 소비처만 이어지지 않았다(applyRemoteStatDelta 는 이미 earliesRaw 를 쓴다).
//
// 음성 대조: clock.ts 의 earlyAutoOf 를 `(ls?.earlies ?? 0) - (adjEarlies ?? 0)` 로 되돌리면
//   아래 '🔴 음수 보정' 두 단언이 실패한다.
// 실행: npx vitest run src/api/clock.earlyAuto.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { earlyAutoOf, computeLiveStats, defaultClockConfig, emptyClockState, earlyUnitTotal } from './clock';

const cfg = { ...defaultClockConfig(), earlyBonus: 5_000, doubleEarlyBonus: 10_000 };

/** 화면이 실제로 보는 두 값 — 장부 자동 몫(단위)과 수기 보정으로 스냅샷을 만든다. */
function screen(autoSingles: number, adjEarlies: number) {
  const derived = { entries: 10, rebuys: 0, earlies: autoSingles, doubleEarlies: 0, totalBuyins: 10 };
  const ls = computeLiveStats({ ...emptyClockState('v1', cfg), adjEarlies }, derived, cfg);
  return {
    total: ls.earlies ?? 0,                 // 합계(=화면 가운데 숫자) — 클램프된 값이 맞다
    auto: earlyAutoOf(ls, adjEarlies),      // '자동 N'
    truth: earlyUnitTotal(derived, cfg),    // 참값 = 장부 파생분 그 자체
  };
}

describe("얼리 '자동' — 클램프 전 값(earliesRaw)에서 되뺀다", () => {
  it('🔴 음수 보정: 자동 3 · 보정 −5 → 자동은 3 이다(수정 전 5)', () => {
    const s = screen(3, -5);
    expect(s.truth).toBe(3);
    expect(s.auto).toBe(3);
    expect(s.total).toBe(0); // 합계는 0 하한 유지 — 화면에 음수 얼리를 띄우지 않는다
  });

  it('🔴 음수 보정: 자동 0 · 보정 −5 → 자동은 0 이다(수정 전 5)', () => {
    const s = screen(0, -5);
    expect(s.auto).toBe(0);
    expect(s.total).toBe(0);
  });

  it('정상 구간(보정 ≥ 0)은 구 동작과 같다 — 회귀 없음', () => {
    for (const [auto, adj] of [[3, 0], [3, 1], [0, 2], [7, 4]] as const) {
      expect(earlyAutoOf(screenStats(auto, adj), adj), `auto=${auto} adj=${adj}`).toBe(auto);
    }
  });

  it('합계 = 자동 + 보정 이 음수가 아닌 한 화면 두 수가 맞아떨어진다', () => {
    const s = screen(3, 1);
    expect(s.auto + 1).toBe(s.total);
  });

  it('낡은 스냅샷(earliesRaw 없음)은 구 동작으로 떨어진다', () => {
    // earliesRaw 가 저장되기 전 clock_states 행 — earlies 만 있다
    expect(earlyAutoOf({ earlies: 4 }, 1)).toBe(3);
    expect(earlyAutoOf({ earlies: 0 }, -5)).toBe(5); // 구 동작 그대로(복원 불가 — 정보가 없다)
    expect(earlyAutoOf(null, -5)).toBe(5);
    expect(earlyAutoOf(undefined, undefined)).toBe(0);
  });
});

// 값 테스트만으로는 '아무도 안 부르는 함수'도 통과한다(21-team-store #9). 배선을 따로 못 박는다.
describe('배선 — 장부 라이브 클락 패널이 그 한 곳을 부른다', () => {
  const src = readFileSync(join(__dirname, '..', 'components', 'features', 'NuriPosLedger.tsx'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  it('🔴 earlyAutoOf 를 import 해서 쓰고, 옛 클램프 역산은 사라졌다', () => {
    expect(src).toMatch(/\bearlyAutoOf\b[^\n]*from '\.\.\/\.\.\/api\/clock'/);
    expect(src).toMatch(/const earlyAuto = earlyAutoOf\(ls, clock\.adjEarlies\);/);
    expect(src).not.toMatch(/const earlyAuto = earlyTotal - \(clock\.adjEarlies \?\? 0\);/);
  });
});

function screenStats(autoSingles: number, adjEarlies: number) {
  const derived = { entries: 10, rebuys: 0, earlies: autoSingles, doubleEarlies: 0, totalBuyins: 10 };
  return computeLiveStats({ ...emptyClockState('v1', cfg), adjEarlies }, derived, cfg);
}
