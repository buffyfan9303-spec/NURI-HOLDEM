// warmFetch — 미리 받은 응답은 한 번만 넘겨주고, 실패한 응답은 넘기지 않는다(받는 쪽이 직접 다시 받는다).
// 실행: npx vitest run src/lib/warmFetch.test.ts
import { describe, it, expect } from 'vitest';
import { warm, takeWarm, dropWarm } from './warmFetch';

describe('warmFetch', () => {
  it('다 받은 값은 done·v 로 바로 꺼낼 수 있고, 꺼내면 지워진다', async () => {
    warm('k1', () => Promise.resolve([1, 2]));
    await Promise.resolve(); await Promise.resolve();
    const s = takeWarm<number[]>('k1');
    expect(s?.done).toBe(true);
    expect(s?.v).toEqual([1, 2]);
    expect(takeWarm('k1'), '같은 응답을 두 번 넘겼다').toBeNull();
  });

  it('아직 오는 중이면 같은 약속(p)을 넘겨 요청을 두 번 보내지 않는다', async () => {
    let calls = 0;
    let done!: (v: string) => void;
    warm('k2', () => { calls++; return new Promise<string>((r) => { done = r; }); });
    const s = takeWarm<string>('k2')!;
    expect(s.done).toBe(false);
    done('x');
    await expect(s.p).resolves.toBe('x');
    expect(calls).toBe(1);
  });

  it('실패한 응답은 넘기지 않는다', async () => {
    warm('k3', () => Promise.reject(new Error('401')));
    await new Promise((r) => setTimeout(r, 0));
    expect(takeWarm('k3')).toBeNull();
  });

  it('dropWarm 뒤에는 넘기지 않는다(닫힌 열림의 값이 다음 진입로로 새지 않는다)', async () => {
    warm('k5', () => Promise.resolve('old'));
    await Promise.resolve(); await Promise.resolve();
    dropWarm('k5');
    expect(takeWarm('k5')).toBeNull();
  });

  it('다시 warm 하면 새 응답으로 바뀐다(열 때마다 최신)', async () => {
    warm('k4', () => Promise.resolve('old'));
    warm('k4', () => Promise.resolve('new'));
    await Promise.resolve(); await Promise.resolve();
    expect(takeWarm<string>('k4')?.v).toBe('new');
  });
});
