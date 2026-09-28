// D1(2026-09-28) — 서버 시각 오프셋 계약. 음성 대조: syncServerTime 이 offset 을 안 바꾸면 1번이 빨개진다.
import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('./supabase', () => ({ IS_MOCK: false, supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { serverNow, syncServerTime, serverOffsetMs, __setServerOffsetForTest } from './serverTime';

describe('서버 시각 오프셋', () => {
  afterEach(() => { vi.useRealTimers(); rpc.mockReset(); __setServerOffsetForTest(0, false); });

  it('기기가 5분 빠르면 오프셋 −5분 — serverNow 는 서버 시각을 준다', async () => {
    vi.useFakeTimers();
    const server = Date.UTC(2026, 8, 28, 10, 0, 0);
    vi.setSystemTime(server + 5 * 60_000);                      // 기기 시계 +5분
    rpc.mockImplementation(async () => ({ data: new Date(server).toISOString(), error: null }));
    await syncServerTime();
    expect(serverOffsetMs()).toBe(-5 * 60_000);
    expect(serverNow()).toBe(server);
  });

  it('함수가 없으면(42883) 오프셋 0 = 종전 동작', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } });
    await syncServerTime();
    expect(serverOffsetMs()).toBe(0);
  });

  it('왕복이 5초를 넘으면 버린다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    rpc.mockImplementation(async () => { vi.setSystemTime(6_000); return { data: new Date(100_000).toISOString(), error: null }; });
    await syncServerTime();
    expect(serverOffsetMs()).toBe(0);
  });
});
