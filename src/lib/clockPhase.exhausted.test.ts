// C3·C7(오너 2026-09-25 MYSTORE-FULL-AUDIT) — running=true 인데 마지막 레벨까지 소진한 클락은 '종료'다.
//
// 실측: 운영 dddd…0000 더미 클락이 9/17 부터 running=true 로 남아 라이브 탭에 '진행 중 1게임' 으로 떠 있었다.
//   종료를 DB 에 쓰는 주체(운영자 워치독·장부 백업 전진자)가 떠 있지 않으면 running 이 영영 true 다.
//   표시 판정(clockPhase)과 라이브 목록(getRunningClocks)이 같은 규칙(clockExhausted)으로 걸러야 한다.
// 음성 대조: clockLevel.ts 의 `if (clockExhausted(s, nowMs)) return 'finished';` 줄을 지우면 ①②가 'running' 으로 빨개진다.
import { describe, it, expect } from 'vitest';
import { clockPhase, clockExhausted, CLOCK_PHASE_ACTION, type ClockPhaseInput } from './clockLevel';

const LEVELS = [
  { kind: 'level' as const, minutes: 20 },
  { kind: 'break' as const, minutes: 10 },
  { kind: 'level' as const, minutes: 20 },
];
const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);
const at = (m: number) => new Date(NOW + m * 60_000).toISOString();
const run = (o: Partial<ClockPhaseInput>): ClockPhaseInput => ({
  config: { levels: LEVELS }, running: true, currentIndex: 0, endsAt: at(10), remainingMs: 20 * 60_000, ...o,
});

describe('C3 — 켜져 있어도 마지막 레벨을 다 쓰면 종료', () => {
  it('① 마지막 레벨의 endsAt 이 지났다 → finished', () => {
    const s = run({ currentIndex: 2, endsAt: at(-1) });
    expect(clockExhausted(s, NOW)).toBe(true);
    expect(clockPhase(s, NOW)).toBe('finished');
  });
  it('② 첫 레벨에서 8일 방치(누가 전진도 안 씀) → finished', () => {
    const s = run({ currentIndex: 0, endsAt: at(-8 * 24 * 60) });
    expect(clockPhase(s, NOW)).toBe('finished');
  });
  it('③ 마지막 레벨 1분 남음 → 아직 running(반례)', () => {
    const s = run({ currentIndex: 2, endsAt: at(1) });
    expect(clockExhausted(s, NOW)).toBe(false);
    expect(clockPhase(s, NOW)).toBe('running');
  });
  it('④ 첫 레벨이 끝나 브레이크 안(드리프트) → break, 종료 아님(반례)', () => {
    const s = run({ currentIndex: 0, endsAt: at(-5) });
    expect(clockPhase(s, NOW)).toBe('break');
  });
  it('⑤ 정지 행은 clockExhausted 대상이 아니다', () => {
    expect(clockExhausted(run({ running: false, endsAt: null, currentIndex: 2, remainingMs: 0 }), NOW)).toBe(false);
  });
});

describe('C7 — 종료 상태의 주 버튼 문구는 누를 게 없음을 말한다', () => {
  it("finished → '대회 종료'", () => {
    expect(CLOCK_PHASE_ACTION.finished).toBe('대회 종료');
  });
});
