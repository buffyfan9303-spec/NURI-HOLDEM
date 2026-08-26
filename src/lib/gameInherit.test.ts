import { describe, expect, it } from 'vitest';
import { posterLevelsToClock, clockPatchFromSchedule, clockPrizesFromSchedule } from './gameInherit';
import type { Schedule } from '../api/schedules';

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

describe('gameInherit — 포스터 → 장부/클락 상속(PL1)', () => {
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

  it('구조 없는 포스터는 빈 패치에 가깝다(있는 것만 상속 — 부분 상속 허용)', () => {
    const p = clockPatchFromSchedule(sched({ structure: undefined, buyIn: { amount: 30_000 } }));
    expect(p.levels).toBeUndefined();
    expect(p.startStack).toBeUndefined();
    expect(p.isAddon).toBeUndefined();
  });

  it('금액 상속(PL1b): 만원→원 정규화 · 원 그대로 · %·0 제외 — 1만 배 오기록 차단', () => {
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
