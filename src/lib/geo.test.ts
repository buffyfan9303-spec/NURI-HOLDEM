// geo.ts 단위 테스트 — 거리순 정렬의 수학을 알려진 실측값으로 고정.
import { describe, it, expect } from 'vitest';
import { haversineKm, fmtKm } from './geo';

describe('haversineKm', () => {
  it('서울시청 ↔ 부산시청 ≈ 325km (실측 직선거리)', () => {
    const d = haversineKm(37.5663, 126.9779, 35.1798, 129.0750);
    expect(d).toBeGreaterThan(315);
    expect(d).toBeLessThan(335);
  });

  it('같은 지점은 0', () => {
    expect(haversineKm(37.5, 127.0, 37.5, 127.0)).toBe(0);
  });

  it('강남역 ↔ 역삼역 ≈ 0.7km — 도보권 판별이 되는 정밀도', () => {
    const d = haversineKm(37.4979, 127.0276, 37.5006, 127.0364);
    expect(d).toBeGreaterThan(0.5);
    expect(d).toBeLessThan(1.0);
  });

  it('대칭성 — a→b 와 b→a 가 같다', () => {
    const ab = haversineKm(37.57, 126.98, 35.18, 129.08);
    const ba = haversineKm(35.18, 129.08, 37.57, 126.98);
    expect(ab).toBeCloseTo(ba, 10);
  });
});

describe('fmtKm', () => {
  it('1km 미만은 m, 이상은 소수 1자리 km', () => {
    expect(fmtKm(0.42)).toBe('420m');
    expect(fmtKm(3.14159)).toBe('3.1km');
  });
  it('비정상 값은 빈 문자열 — 정렬 불가 매장(Infinity)이 UI 에 새지 않게', () => {
    expect(fmtKm(Infinity)).toBe('');
    expect(fmtKm(NaN)).toBe('');
  });
});
