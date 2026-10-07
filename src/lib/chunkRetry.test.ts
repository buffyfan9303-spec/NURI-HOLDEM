// PR #206 — 나중 청크 재시도 일정(chunkRetry)과 아이콘 청크 로더(iconsExtraLoader)가 상한 뒤에도 끊지 않고
// 보이는 동안 60초마다 다시 받는지, 숨김이면 멈추고 보이면 즉시 1회 받는지 가짜 타이머로 본다.
// 음성 대조: chunkRetry 의 60초 분기를 '멈춤'으로 바꾸거나 visibilitychange 처리를 빼면 빨개진다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeDoc extends EventTarget { visibilityState = 'visible'; readyState = 'loading'; }
let doc: FakeDoc;
const g = globalThis as Record<string, unknown>;
const setVis = (v: 'visible' | 'hidden') => { doc.visibilityState = v; doc.dispatchEvent(new Event('visibilitychange')); };
/** 진짜 I/O 틱을 돌린다(동적 import 가 끝나게) — setImmediate 는 가짜로 만들지 않았다. */
const io = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  doc = new FakeDoc();
  g.document = doc;
  g.window = new EventTarget();
});
afterEach(() => {
  vi.useRealTimers();
  delete g.document;
  delete g.window;
});

describe('chunkRetry — 상한 뒤에도 보이는 동안 60초마다', () => {
  it('처음 limit 번은 두 배씩(cap), 그 뒤는 60초 간격으로 끝없이', async () => {
    const { chunkRetry } = await import('./chunkRetry');
    const at: number[] = [];
    const t0 = Date.now();
    const r = chunkRetry(() => { at.push(Date.now() - t0); r.failed(); }, { limit: 3, cap: 2000 });
    r.failed();
    vi.advanceTimersByTime(1000 + 2000 + 2000 + 60_000 * 3);
    expect(at).toEqual([1000, 3000, 5000, 65_000, 125_000, 185_000]);
  });

  it('숨김이면 멈추고, 보이면 즉시 1회 부른 뒤 60초 간격으로 돈다', async () => {
    const { chunkRetry } = await import('./chunkRetry');
    let calls = 0;
    const r = chunkRetry(() => { calls++; r.failed(); }, { limit: 1, cap: 1000 });
    r.failed();
    vi.advanceTimersByTime(1000);
    expect(calls).toBe(1);
    setVis('hidden');
    vi.advanceTimersByTime(30 * 60_000);
    expect(calls, '숨김 동안 0회').toBe(1);
    setVis('visible');
    expect(calls, '보이자마자 1회').toBe(2);
    vi.advanceTimersByTime(59_999);
    expect(calls).toBe(2);
    vi.advanceTimersByTime(1);
    expect(calls).toBe(3);
  });

  it('숨김 상태에서 도착한 실패(받던 중 숨겨짐)는 타이머를 걸지 않는다', async () => {
    const { chunkRetry } = await import('./chunkRetry');
    let calls = 0;
    const r = chunkRetry(() => { calls++; }, { limit: 2, cap: 1000 });
    setVis('hidden');
    r.failed();                     // 받던 요청이 숨김 뒤에 실패로 끝났다
    vi.advanceTimersByTime(30 * 60_000);
    expect(calls, '숨김 동안 0회').toBe(0);
    setVis('visible');
    expect(calls, '보이자마자 1회').toBe(1);
  });

  it('받은 뒤(done)에는 타이머·보임·online·클릭이 아무것도 부르지 않는다', async () => {
    const { chunkRetry } = await import('./chunkRetry');
    let calls = 0;
    const r = chunkRetry(() => { calls++; }, { limit: 2, cap: 1000 });
    r.failed();
    r.done();
    vi.advanceTimersByTime(10 * 60_000);
    setVis('hidden'); setVis('visible');
    (g.window as EventTarget).dispatchEvent(new Event('online'));
    doc.dispatchEvent(new Event('click'));
    expect(calls).toBe(0);
  });
});

describe('iconsExtraLoader — 8번 뒤에도 60초마다 다시 받는다(예전엔 8번에서 멈췄다)', () => {
  it('항상 실패하는 아이콘 청크: 빠른 8번 뒤 60초 간격, 숨김이면 0회, 보이면 즉시', async () => {
    vi.resetModules();
    let attempts = 0;
    vi.doMock('../components/atoms/iconsExtra', () => { attempts++; throw new Error('chunk 404'); });
    try {
      const { loadIconsExtra } = await import('../components/atoms/iconsExtraLoader');
      await loadIconsExtra().catch(() => {});
      await io();
      expect(attempts).toBe(1);
      // 빠른 8번: 1·2·4·8·8·8·8·8초
      for (const ms of [1000, 2000, 4000, 8000, 8000, 8000, 8000, 8000]) { vi.advanceTimersByTime(ms); await io(); }
      expect(attempts).toBe(9);
      vi.advanceTimersByTime(59_999); await io();
      expect(attempts, '상한 뒤 60초 전에는 안 부른다').toBe(9);
      vi.advanceTimersByTime(1); await io();
      expect(attempts, '상한 뒤에도 60초에 다시').toBe(10);
      vi.advanceTimersByTime(60_000); await io();
      expect(attempts).toBe(11);
      setVis('hidden');
      vi.advanceTimersByTime(10 * 60_000); await io();
      expect(attempts, '숨김 동안 0회').toBe(11);
      setVis('visible'); await io();
      expect(attempts, '보이자마자 1회').toBe(12);
    } finally {
      vi.doUnmock('../components/atoms/iconsExtra');
    }
  });
});
