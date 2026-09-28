// B1(2026-09-28) — 영업일 단일 원천 계약. 음성 대조: businessDateOf 가 캐시를 무시하고 kstToday 만 돌려주면 1·2번이 빨개진다.
import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('./supabase', () => ({ IS_MOCK: false, supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { businessDateOf, refreshBusinessDate, __resetBusinessDateCache } from './businessDate';

// 2026-09-29 00:30 KST = 2026-09-28T15:30Z
const AFTER_MIDNIGHT = Date.UTC(2026, 8, 28, 15, 30);

describe('영업일(ledger_business_date) 단일 원천', () => {
  afterEach(() => { vi.useRealTimers(); rpc.mockReset(); __resetBusinessDateCache(); });

  it('자정 뒤 어제 장부가 열려 있으면 서버가 준 어제를 쓴다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(AFTER_MIDNIGHT);
    rpc.mockResolvedValue({ data: '2026-09-28', error: null });
    expect(businessDateOf('v1')).toBe('2026-09-29');          // 묻기 전 = 달력 오늘(종전 동작)
    await refreshBusinessDate('v1');
    expect(rpc).toHaveBeenCalledWith('ledger_business_date', { p_venue_id: 'v1' });
    expect(businessDateOf('v1')).toBe('2026-09-28');
    expect(businessDateOf('v2')).toBe('2026-09-29');          // 매장별로 따로
  });

  it('하루가 더 지나 낡은 캐시는 버린다(영업일은 어제·오늘뿐)', async () => {
    vi.useFakeTimers(); vi.setSystemTime(AFTER_MIDNIGHT);
    rpc.mockResolvedValue({ data: '2026-09-28', error: null });
    await refreshBusinessDate('v1');
    vi.setSystemTime(AFTER_MIDNIGHT + 86_400_000);             // 09-30 00:30
    expect(businessDateOf('v1')).toBe('2026-09-30');
  });

  it('실패·이상값은 캐시를 바꾸지 않는다', async () => {
    vi.useFakeTimers(); vi.setSystemTime(AFTER_MIDNIGHT);
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'x' } });
    expect(await refreshBusinessDate('v1')).toBe('2026-09-29');
    rpc.mockResolvedValue({ data: '2020-01-01', error: null });
    expect(await refreshBusinessDate('v1')).toBe('2026-09-29');
  });
});
