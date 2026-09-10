// CountUp 순수 보간 — 재타깃이 '현재 표시값'에서 이어지고(역주행 금지), 경계가 정확한지.
import { describe, it, expect } from 'vitest';
import { countUpAt } from './CountUp';

describe('countUpAt', () => {
  it('p=0 은 출발값 그대로, p=1 은 목표값 — 값이 바뀌면 현재 표시값(150)에서 출발해야 0 으로 튀지 않는다', () => {
    expect(countUpAt(150, 220, 0)).toBe(150);
    expect(countUpAt(150, 220, 1)).toBe(220);
    // 경계 밖 진행률은 잘라낸다(rAF 타임스탬프가 duration 을 넘겨도 목표값을 지나치지 않는다)
    expect(countUpAt(0, 100, 2)).toBe(100);
    expect(countUpAt(0, 100, -1)).toBe(0);
  });

  it('단조 — 오르는 목표는 프레임마다 내려가지 않고, 내리는 목표는 올라가지 않는다', () => {
    let prev = -Infinity;
    for (let i = 0; i <= 60; i++) { const v = countUpAt(0, 1234, i / 60); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
    prev = Infinity;
    for (let i = 0; i <= 60; i++) { const v = countUpAt(500, 20, i / 60); expect(v).toBeLessThanOrEqual(prev); prev = v; }
  });
});
