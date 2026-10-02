// 프리셋 → 포스터 → 장부 시작(클락) 사슬에서 프리셋의 클락 몫이 사라지지 않는다 (audit-link-1002 L-08, 2026-10-02)
//
//  ① 레지 마감 정본은 포스터 원문 하나다 — 프리셋 안 두 칸(poster.regCloseTime · clock.regCloseLevel)이 다르면
//     프리셋을 클락에 직접 적용할 때도 포스터 원문 레벨을 쓴다(손님 광고 레벨 = 클락 레벨).
//  ② 프리셋 → 포스터 폼이 클락 몫 중 포스터에 칸이 있는 것(레지 레벨·얼리 단계)을 옮긴다 →
//     그 포스터로 장부를 시작하면(clockPatchFromSchedule) 프리셋의 얼리·레지 레벨이 클락에 온다.
// 실행: npx vitest run src/lib/gameInherit.presetLink.test.ts
import { describe, it, expect } from 'vitest';
import { applyToClock, applyToPoster, clockPatchFromSchedule } from './gameInherit';
import { buyInOwnedFields } from './posterPayload';
import type { GamePresetData } from '../api/presets';
import type { Schedule } from '../api/schedules';

const preset: GamePresetData = {
  title: '데일리 딥스택', buyInWon: 60000, startStack: 30000,
  poster: { regCloseTime: '16LV 00:12' },
  clock: { regCloseLevel: 12, earlyDoubleLevel: 2, doubleEarlyBonus: 10000, earlySingleLevel: 4, earlyBonus: 5000, maxLevel: 30 },
};

describe('L-08 ① 레지 마감 한 칸 정본', () => {
  it('🔴 프리셋을 클락에 직접 적용해도 포스터 원문 레벨(16)이 이긴다', () => {
    expect(applyToClock(preset).regCloseLevel).toBe(16);
  });
  it('포스터 원문에 레벨이 없으면 클락 칸(양성 대조)', () => {
    expect(applyToClock({ ...preset, poster: { regCloseTime: '22:00' } }).regCloseLevel).toBe(12);
    expect(applyToClock({ ...preset, poster: undefined }).regCloseLevel).toBe(12);
  });
});

describe('L-08 ② 프리셋 → 포스터 → 장부 시작 클락', () => {
  /** 포스터 폼 → 저장된 포스터(Schedule) — 실제 저장 경로(buyInOwnedFields)로 buy_in 을 만든다. */
  const posterFrom = (d: GamePresetData): Schedule => {
    const form = applyToPoster(d);
    const buyIn = buyInOwnedFields({ buyIn: form.buyIn ?? 0, earlyTiers: form.earlyTiers } as Parameters<typeof buyInOwnedFields>[0]);
    return { title: form.title ?? '', regCloseTime: form.regCloseTime ?? '', buyIn } as unknown as Schedule;
  };

  it('🔴 프리셋의 얼리 단계가 포스터를 건너 클락에 온다', () => {
    const p = clockPatchFromSchedule(posterFrom(preset));
    expect(p.earlyDoubleLevel).toBe(2);
    expect(p.doubleEarlyBonus).toBe(10000);
    expect(p.earlySingleLevel).toBe(4);
    expect(p.earlyBonus).toBe(5000);
  });
  it('🔴 포스터 원문이 없는 프리셋도 레지 레벨이 포스터를 건너 클락에 온다', () => {
    const p = clockPatchFromSchedule(posterFrom({ ...preset, poster: undefined }));
    expect(p.regCloseLevel).toBe(12);
  });
  it('포스터 원문이 있으면 원문을 덮지 않는다(16LV 00:12 유지)', () => {
    expect(applyToPoster(preset).regCloseTime).toBe('16LV 00:12');
    expect(clockPatchFromSchedule(posterFrom(preset)).regCloseLevel).toBe(16);
  });
  it('얼리가 없는 프리셋은 포스터 얼리 칸을 건드리지 않는다(부분 프리셋 규칙)', () => {
    expect(applyToPoster({ title: 'x', clock: { maxLevel: 30 } })).not.toHaveProperty('earlyTiers');
  });
});
