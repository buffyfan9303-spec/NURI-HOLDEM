// 고객 분석 '결제' 칸 — 분할(분납)로만 낸 손님이 '-' 로 비던 결함(audit10 P3-4, 2026-10-07).
// 음성 대조: reservations.ts 의 `if (pm)` 을 예전 `if (pm && pm !== 'split')` 로 되돌리면 첫 단언이 null 을 받아 실패한다.
// 실행: npx vitest run src/api/reservations.customerStats.test.ts
import { describe, it, expect, vi } from 'vitest';

let rows: unknown[] = [];
const chain: Record<string, unknown> = new Proxy({}, {
  get(_t, prop) {
    if (prop === 'then') return (res: (v: unknown) => void) => res({ data: rows, error: null });
    return () => chain;
  },
});
vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: { from: () => chain, rpc: () => Promise.resolve({ data: [], error: null }) },
}));
vi.mock('./_session', () => ({ currentUser: async () => ({ id: 'u1' }) }));

const { getVenueCustomerStats, paymentLabel } = await import('./reservations');

const b = (name: string, over: Record<string, unknown>) => ({
  player_name: name, session_date: '2026-10-06', payment_method: 'cash', is_unpaid: false, is_split: false, buyin_at: '2026-10-06T13:00:00Z', ...over,
});

describe('getVenueCustomerStats — 최다 결제 수단', () => {
  it('분할로만 낸 손님은 결제 = 분할', async () => {
    rows = [b('손님4', { is_split: true, payment_method: 'cash' })];
    const [s] = await getVenueCustomerStats('v1');
    expect(s.topPayment).toBe('split');
    expect(paymentLabel(s.topPayment)).toBe('분할');
  });

  it('단일 결제는 그대로(현금 2 · 분할 1 → 현금)', async () => {
    rows = [b('손님1', {}), b('손님1', {}), b('손님1', { is_split: true })];
    const [s] = await getVenueCustomerStats('v1');
    expect(paymentLabel(s.topPayment)).toBe('현금');
  });
});
