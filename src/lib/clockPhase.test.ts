// 클락 생애 상태 — 오너 보고 "시작 전 클락이 일시정지로 표시된다"를 못박는다(2026-09-11).
//
// 이 파일이 없던 동안 8개 파일 16곳이 각자 `running ? A : B` 를 썼고, 그래서
// 같은 클락을 운영자('일시정지')·TV('PAUSED')·대시보드('미실행')가 다르게 불렀다.
import { describe, it, expect } from 'vitest';
import { clockPhase, clockIsLive, CLOCK_PHASE_LABEL, CLOCK_PHASE_ACTION, type ClockPhaseInput } from './clockLevel';

const LEVELS = [
  { kind: 'level' as const, minutes: 20 },
  { kind: 'level' as const, minutes: 20 },
  { kind: 'break' as const, minutes: 10 },
  { kind: 'level' as const, minutes: 20 },
];
const base = (o: Partial<ClockPhaseInput> = {}): ClockPhaseInput => ({
  config: { levels: LEVELS }, running: false, currentIndex: 0, endsAt: null, remainingMs: 20 * 60_000, ...o,
});
const NOW = Date.UTC(2026, 8, 11, 12, 0, 0);
const inMin = (m: number) => new Date(NOW + m * 60_000).toISOString();

describe('클락 상태 파생 — 다섯 상태가 실제로 갈린다', () => {
  it('🔴 새 클락(시작 준비)은 "시작 전" — 예전엔 여기가 "일시정지"였다', () => {
    // emptyClockState 가 쓰는 그 모양: running=false · endsAt=null · index=0 · 1레벨 만액
    const s = base();
    expect(clockPhase(s, NOW)).toBe('idle');
    expect(CLOCK_PHASE_LABEL[clockPhase(s, NOW)]).toBe('시작 전');
    expect(CLOCK_PHASE_ACTION[clockPhase(s, NOW)]).toBe('시작');
  });

  it('시작 → 진행 중', () => {
    const s = base({ running: true, endsAt: inMin(20) });
    expect(clockPhase(s, NOW)).toBe('running');
    expect(CLOCK_PHASE_ACTION[clockPhase(s, NOW)]).toBe('일시정지');
  });

  it('🔴 1레벨에서 일시정지 → "일시정지" (같은 index=0 인데 idle 과 갈린다)', () => {
    // 12분 남기고 멈췄다 — 만액(20분)보다 작으므로 '아직 안 돌았다'가 아니다
    const s = base({ running: false, endsAt: null, remainingMs: 12 * 60_000 });
    expect(clockPhase(s, NOW)).toBe('paused');
    expect(clockIsLive(s, NOW)).toBe(true);   // 예전 clockActive 식은 여기서 false('미실행')였다
  });

  it('재개 → 남은 시간부터 다시 진행 중', () => {
    const s = base({ running: true, endsAt: inMin(12), remainingMs: 12 * 60_000 });
    expect(clockPhase(s, NOW)).toBe('running');
  });

  it('브레이크 레벨에서 진행 중이면 "브레이크"', () => {
    const s = base({ running: true, currentIndex: 2, endsAt: inMin(10) });
    expect(clockPhase(s, NOW)).toBe('break');
    expect(CLOCK_PHASE_LABEL[clockPhase(s, NOW)]).toBe('브레이크');
  });

  it('브레이크 중 일시정지는 "일시정지"(브레이크가 아니다) — 운영자가 멈춘 것이다', () => {
    expect(clockPhase(base({ currentIndex: 2, remainingMs: 3 * 60_000 }), NOW)).toBe('paused');
  });

  it('마지막 레벨이 0 으로 끝나면 "종료"', () => {
    const s = base({ currentIndex: 3, remainingMs: 0, running: false, endsAt: null });
    expect(clockPhase(s, NOW)).toBe('finished');
    expect(CLOCK_PHASE_ACTION[clockPhase(s, NOW)]).toBe('다시 시작');
  });

  it('🔴 running=true 는 어떤 경우에도 PAUSED 로 표시되지 않는다', () => {
    for (const idx of [0, 1, 2, 3]) {
      const p = clockPhase(base({ running: true, currentIndex: idx, endsAt: inMin(5) }), NOW);
      expect(p === 'running' || p === 'break', `index ${idx} → ${p}`).toBe(true);
    }
  });

  it('endsAt 이 지났는데 아무도 전진을 못 쓴 행도 실효 레벨로 옳게 읽는다', () => {
    // 레벨 구성: [20분, 20분, 브레이크 10분, 20분]
    // 5분 초과 = 2레벨(index 1) 진행 중 — 아직 레벨이라 'running'
    expect(clockPhase(base({ running: true, currentIndex: 0, endsAt: new Date(NOW - 5 * 60_000).toISOString() }), NOW)).toBe('running');
    // 25분 초과 = 2레벨(20분)까지 지나 **브레이크 안**이다 — 전진을 못 쓴 행에서도 TV 가 '브레이크'라고 말해야 한다
    expect(clockPhase(base({ running: true, currentIndex: 0, endsAt: new Date(NOW - 25 * 60_000).toISOString() }), NOW)).toBe('break');
  });

  it('[초기화] 직후는 다시 "시작 전"(TournamentClock 의 reset 과 같은 모양)', () => {
    const s = base({ currentIndex: 0, remainingMs: 20 * 60_000, endsAt: null, running: false });
    expect(clockPhase(s, NOW)).toBe('idle');
    expect(clockIsLive(s, NOW)).toBe(false);
  });

  it('시간 +로 만액보다 늘려 둔 시작 전 클락도 "시작 전"', () => {
    expect(clockPhase(base({ remainingMs: 30 * 60_000 }), NOW)).toBe('idle');
  });

  it('레벨이 없는 설정은 "끝났다"고 말하지 않는다', () => {
    expect(clockPhase({ config: { levels: [] }, running: false, currentIndex: 0, endsAt: null, remainingMs: 0 }, NOW)).toBe('idle');
  });

  it('🔴 운영자·TV·리모컨이 같은 함수를 쓰므로 상태가 갈릴 수 없다', () => {
    // 같은 입력 → 같은 phase. 화면마다 조건식을 복제하지 않는 것이 이 테스트의 요지다.
    const s = base({ running: false, remainingMs: 7 * 60_000 });
    const p = clockPhase(s, NOW);
    expect(new Set([p, clockPhase(s, NOW), clockPhase({ ...s }, NOW)]).size).toBe(1);
    expect(p).toBe('paused');
  });
});
