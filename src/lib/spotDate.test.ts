// 스팟 날짜 클램프 (2026-09-25 전수 스윕: 2099-12-31 이 그대로 저장됐다). 실행: npx vitest run src/lib/spotDate.test.ts
import { describe, it, expect } from 'vitest';
import { clampSpotDate } from './spotDate';

// 2026-09-25 14:59:59Z = KST 2026-09-25 23:59:59 · 15:00:00Z = KST 2026-09-26 00:00
const T = Date.UTC(2026, 8, 25, 14, 59, 59);

describe('clampSpotDate', () => {
  it('🔴 미래 날짜는 오늘(KST)로 접힌다 — 2099-12-31 · 내일', () => {
    expect(clampSpotDate('2099-12-31', T)).toBe('2026-09-25');
    expect(clampSpotDate('2026-09-26', T)).toBe('2026-09-25');
  });
  it('오늘·과거는 그대로', () => {
    expect(clampSpotDate('2026-09-25', T)).toBe('2026-09-25');
    expect(clampSpotDate('2020-01-01', T)).toBe('2020-01-01');
  });
  it('빈값·형식 밖은 오늘 — 자정 경계는 KST 로 넘어간다', () => {
    expect(clampSpotDate('', T)).toBe('2026-09-25');
    expect(clampSpotDate(null, T)).toBe('2026-09-25');
    expect(clampSpotDate('2099-13-45', T)).toBe('2026-09-25');
    expect(clampSpotDate('2026-09-26', T + 1000)).toBe('2026-09-26');   // KST 자정을 넘긴 뒤엔 26일이 오늘
  });
});
