// 상금 분배 — 입력 상한·이상값 회귀 (2026-09-25 전수 스윕: 참가 인원 무제한 → RangeError 로 GTO 탭 크래시).
// 실행: npx vitest run src/lib/payout.test.ts
import { describe, it, expect } from 'vitest';
import { PAYOUT_MAX_ENTRIES, clampEntries, computePayout } from './payout';

describe('computePayout — 인원 상한·이상값', () => {
  it('🔴 4,294,967,296 명도 RangeError 없이 상한(10,000명) 안에서 즉시 끝난다', () => {
    const t0 = performance.now();
    const r = computePayout({ pool: 11_000_000, entries: 4_294_967_296, placesIn: 0, style: 'topheavy' });
    expect(performance.now() - t0, '계산이 100ms 를 넘는다').toBeLessThan(100);
    expect(r.entries).toBe(PAYOUT_MAX_ENTRIES);
    expect(r.places).toBe(Math.round(PAYOUT_MAX_ENTRIES * 0.10));
    expect(r.amounts).toHaveLength(r.places);
    expect(r.amounts.reduce((a, b) => a + b, 0)).toBe(11_000_000);
  });
  it('시상 인원 수동 입력도 상한·참가 인원을 넘지 못한다', () => {
    expect(computePayout({ pool: 1_000_000, entries: 5, placesIn: 12, style: 'flat' }).places).toBe(5);
    expect(computePayout({ pool: 1_000_000, entries: 200_000, placesIn: 200_000, style: 'flat' }).places).toBe(PAYOUT_MAX_ENTRIES);
  });
  it('음수·소수·빈값(NaN)·Infinity 는 0 또는 정수로 접힌다 — 표는 최소 1행', () => {
    expect(clampEntries(-5)).toBe(0);
    expect(clampEntries(7.9)).toBe(7);
    expect(clampEntries(Number.NaN)).toBe(0);
    expect(clampEntries(Number.POSITIVE_INFINITY), '유한하지 않은 값은 상한이 아니라 0 — 입력이 아니라 오류다').toBe(0);
    const r = computePayout({ pool: -100, entries: -3, placesIn: -1, style: 'satellite' });
    expect(r.places).toBe(1);
    expect(r.amounts).toEqual([0]);
    expect(computePayout({ pool: Number.NaN, entries: Number.NaN, placesIn: Number.NaN, style: 'topheavy' }).amounts.every((a) => Number.isFinite(a))).toBe(true);
  });
  it('프리셋(고정 %표)은 인원과 무관하게 %표 길이만큼 — 합계는 총 상금과 같다', () => {
    const r = computePayout({ pool: 900_000, entries: 9, placesIn: 3, style: 'topheavy', presetPct: [50, 30, 20] });
    expect(r.amounts).toEqual([450_000, 270_000, 180_000]);
  });
  it('flat 곡선 잔액 보정으로 1위<2위 가 되지 않는다(합계 불변)', () => {
    for (const pool of [1_000, 7_000, 123_000, 999_000]) for (const entries of [2, 3, 10, 40]) {
      const r = computePayout({ pool, entries, placesIn: 0, style: 'flat' });
      expect(r.amounts[0]).toBeGreaterThanOrEqual(r.amounts[1] ?? 0);
      expect(r.amounts.reduce((a, b) => a + b, 0)).toBe(pool);
    }
  });
});
