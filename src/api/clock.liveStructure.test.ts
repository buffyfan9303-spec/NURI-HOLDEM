// C10(오너 2026-09-25) — 진행 중 블라인드 구조 수정. 레벨·엔트리·탈락·경과를 지우지 않고
//   (a) 뒤에 레벨 추가 (b) 아직 안 온 레벨 수정 (c) 현재 레벨 남은 시간은 Min/Sec ± — 지난 레벨은 수정 불가,
//   끝난 클락은 덧붙이면 첫 새 레벨에서 일시정지로 이어진다.
// 음성 대조: liveStructurePatch 의 '지난 레벨 대조' 루프를 지우면 ②가, finished 분기를 지우면 ⑤가 빨개진다.
import { describe, it, expect } from 'vitest';
import { liveStructurePatch, liveLockedCount, emptyClockState, defaultClockConfig, type ClockLevel, type ClockState } from './clock';
import { clockPhase } from '../lib/clockLevel';

const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);
const L = (sb: number, minutes = 20): ClockLevel => ({ kind: 'level', sb, bb: sb * 2, ante: sb * 2, minutes });
const B: ClockLevel = { kind: 'break', sb: 0, bb: 0, ante: 0, minutes: 10, label: 'BREAK' };
const LEVELS = [L(100), L(200), B, L(300)];
const running = (over: Partial<ClockState> = {}): ClockState => ({
  ...emptyClockState('v', { ...defaultClockConfig(), levels: LEVELS, maxLevel: 3 }, 1),
  currentIndex: 1, running: true, endsAt: new Date(NOW + 5 * 60_000).toISOString(), remainingMs: 0,
  adjEntries: 12, eliminations: 3, ...over,
});

describe('C10 — 진행 중 구조 수정', () => {
  it('① 아직 안 온 레벨 수정 + 뒤에 레벨 추가 → config 만 바뀐다(진행 필드 보존)', () => {
    const s = running();
    const next = [LEVELS[0], LEVELS[1], B, L(400, 15), L(500), L(600)];
    const r = liveStructurePatch(s, next, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.patch)).toEqual(['config']);
    expect(r.patch.config!.levels).toEqual(next);
    expect(r.patch.config!.maxLevel).toBe(5);
  });
  it('② 이미 지난 레벨은 못 바꾼다', () => {
    const r = liveStructurePatch(running(), [L(150), LEVELS[1], B, LEVELS[3]], NOW);
    expect(r).toMatchObject({ ok: false });
  });
  it('③ 현재 레벨의 블라인드는 고칠 수 있고, 길이는 못 바꾼다', () => {
    expect(liveStructurePatch(running(), [LEVELS[0], L(250), B, LEVELS[3]], NOW).ok).toBe(true);
    expect(liveStructurePatch(running(), [LEVELS[0], L(200, 30), B, LEVELS[3]], NOW)).toMatchObject({ ok: false });
  });
  it('④ 드리프트(endsAt 지남)면 실효 레벨까지가 지난 레벨이다', () => {
    // 현재 index 1 의 endsAt 이 1분 지났다 → 실효는 브레이크(index 2) → index 1 도 잠긴다
    const s = running({ endsAt: new Date(NOW - 60_000).toISOString() });
    expect(liveLockedCount(s, NOW)).toEqual({ passed: 2, current: 2 });
    expect(liveStructurePatch(s, [LEVELS[0], L(250), B, LEVELS[3]], NOW)).toMatchObject({ ok: false });
  });
  it('⑤ 끝난 대회에 레벨을 덧붙이면 첫 새 레벨에서 일시정지로 이어진다(재개 가능)', () => {
    const s = running({ currentIndex: 3, running: false, endsAt: null, remainingMs: 0 });
    expect(clockPhase(s, NOW)).toBe('finished');
    const r = liveStructurePatch(s, [...LEVELS, L(400, 15)], NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resumed).toBe(true);
    expect(r.patch).toMatchObject({ currentIndex: 4, running: false, endsAt: null, remainingMs: 15 * 60_000 });
    const after = { ...s, ...r.patch } as ClockState;
    expect(clockPhase(after, NOW)).toBe('paused');       // [계속하기] 로 재개된다
    expect(after.eliminations).toBe(3);
    expect(after.adjEntries).toBe(12);
  });
  it('⑥ 끝난 대회의 기존 레벨 수정만으로는 이어 갈 수 없다', () => {
    const s = running({ currentIndex: 3, running: false, endsAt: null, remainingMs: 0 });
    expect(liveStructurePatch(s, [LEVELS[0], LEVELS[1], B, L(350)], NOW)).toMatchObject({ ok: false });
  });
  it('⑦ 시간 0분·BB 0 은 거절', () => {
    expect(liveStructurePatch(running(), [...LEVELS, L(400, 0)], NOW)).toMatchObject({ ok: false });
    expect(liveStructurePatch(running(), [...LEVELS, { ...L(400), bb: 0 }], NOW)).toMatchObject({ ok: false });
  });
  it('⑧ 시작 전 클락은 1레벨 길이를 바꾸면 남은 시간도 새 길이로(계속 시작 전)', () => {
    const s = emptyClockState('v', { ...defaultClockConfig(), levels: LEVELS }, 1);
    const r = liveStructurePatch(s, [L(100, 25), ...LEVELS.slice(1)], NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(clockPhase({ ...s, ...r.patch } as ClockState, NOW)).toBe('idle');
  });
});
