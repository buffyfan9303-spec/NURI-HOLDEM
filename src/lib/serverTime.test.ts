// D1(2026-09-28) — 서버 시각 오프셋 계약. 음성 대조: syncServerTime 이 offset 을 안 바꾸면 1번이 빨개진다.
import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('./supabase', () => ({ IS_MOCK: false, supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { serverNow, syncServerTime, serverOffsetMs, serverTimeKnown, serverTimeSettled, __setServerOffsetForTest } from './serverTime';

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

  // 🔴 K2(2026-09-29 하네스 실측: +5분 PC 가 레벨을 149초 일찍 넘김) — '쟀는가' 를 따로 들고, 실패하면 15초 뒤 다시 잰다.
  //   음성 대조: syncServerTime 의 known=true 를 성공 여부와 무관하게 세우거나, maybeSync 의 RETRY 를 RESYNC(10분)로 되돌리면 아래가 빨개진다.
  it('🔴 측정 전·실패 뒤에는 known=false — 자동 쓰기 게이트가 닫혀 있다', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '503', message: 'upstream' } });
    expect(serverTimeKnown()).toBe(false);
    await syncServerTime();
    expect(serverTimeKnown()).toBe(false);
    expect(serverTimeSettled()).toBe(true);   // 첫 표시는 풀린다(기기 시계로 보이며 다시 잰다)
  });

  it('🔴 실패하면 15초 뒤 다시 잰다(10분이 아니다) · 성공하면 known', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    rpc.mockResolvedValueOnce({ data: null, error: { code: '503' } });
    await syncServerTime();
    rpc.mockReset();
    rpc.mockResolvedValue({ data: new Date(1_000_000 + 16_000).toISOString(), error: null });
    vi.setSystemTime(1_000_000 + 14_000);
    serverNow();
    expect(rpc).not.toHaveBeenCalled();
    vi.setSystemTime(1_000_000 + 16_000);
    serverNow();
    expect(rpc).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(serverTimeKnown()).toBe(true));
  });

  // 🔴 2026-09-29 CI(PR #30 C2·recheck2 #7) — 측정이 계속 막히면 known 이 영원히 거짓이라 DB 레벨 전진이 영구 정지했다.
  //   음성 대조: fail() 의 known=true 를 지우면 마지막 expect 가 빨개진다.
  it('🔴 측정이 연속 3번(≈30초) 실패하면 기기 시계로 전진을 재개하고, 뒤에 성공하면 서버 오프셋으로 바뀐다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    rpc.mockResolvedValue({ data: null, error: { code: '503', message: 'upstream' } });
    await syncServerTime();                                      // 1회 실패 (t=0)
    expect(serverTimeKnown()).toBe(false);
    vi.setSystemTime(1_000_000 + 16_000); serverNow();          // 15초 뒤 재시도 = 2회 실패
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(serverTimeKnown()).toBe(false);
    vi.setSystemTime(1_000_000 + 32_000); serverNow();          // 3회 실패
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(serverTimeKnown()).toBe(true));
    expect(serverOffsetMs()).toBe(0);                            // 기기 시계(마지막 오프셋)
    // 측정은 15초 간격으로 계속 — 성공하면 서버 기준으로 돌아온다
    rpc.mockReset();
    rpc.mockResolvedValue({ data: new Date(1_000_000 + 48_000 - 60_000).toISOString(), error: null });   // 서버가 1분 느리다
    vi.setSystemTime(1_000_000 + 48_000); serverNow();
    await vi.waitFor(() => expect(Math.abs(serverOffsetMs() + 60_000)).toBeLessThan(200));   // waitFor 가 가짜 시계를 수십 ms 민다
    expect(serverTimeKnown()).toBe(true);
  });

  it('함수가 아예 없으면(PGRST202) 기기 시계가 기준 — known=true(전진이 영영 멈추지 않게)', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } });
    await syncServerTime();
    expect(serverTimeKnown()).toBe(true);
  });
});
