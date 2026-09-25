import { describe, it, expect } from 'vitest';
import { createBackoff } from './retryBackoff';

describe('createBackoff', () => {
  it('연속 실패마다 대기가 1·2·4…초로 늘고 30초에서 멈춘다', () => {
    const b = createBackoff(1000, 30_000);
    let t = 0;
    const waits: number[] = [];
    for (let i = 0; i < 7; i++) {
      b.fail(t);
      let w = 0; while (b.blocked(t + w)) w += 1000;
      waits.push(w);
      t += w;
    }
    expect(waits).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });

  it('성공하면 즉시 풀리고 다음 실패는 다시 1초부터', () => {
    const b = createBackoff();
    b.fail(0); b.fail(1000); b.fail(3000);
    expect(b.blocked(3500)).toBe(true);
    b.ok();
    expect(b.blocked(3500)).toBe(false);
    b.fail(4000);
    expect(b.blocked(4999)).toBe(true);
    expect(b.blocked(5000)).toBe(false);
  });

  it('1초 틱으로 10초 동안 계속 실패해도 시도는 4번뿐이다(예전 10번 이상)', () => {
    const b = createBackoff();
    let tries = 0;
    for (let t = 0; t < 10_000; t += 1000) { if (!b.blocked(t)) { tries++; b.fail(t); } }
    expect(tries).toBe(4); // t=0,1s,3s,7s
  });
});
