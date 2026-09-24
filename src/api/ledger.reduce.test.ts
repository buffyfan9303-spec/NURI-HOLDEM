// LEDGER-REDUCE-PASSWORD(오너 2026-09-24) — "직원이 장부 금액을 0으로 고치는 것도 취소 비밀번호로 막아."
//
// 감액 = 행 가치 세 겹(완납 매출 · 수납 완료 · 받을 가치) 중 하나라도 줄어드는 수정.
// 서버 쌍둥이 _ledger_buyin_tiers(supabase/migrations/20260924j) 와 같은 표를 여기서 고정한다.
//
// 음성 대조: ledger.ts isRevenueReduction 의 비교를 `n[0] < o[0]` 하나로 줄이면 🔴 표시 5건이 실패한다
//   (이용권 가불 전환 · 이용권 행 할인 · 분납 이용권 축소 · 미수 탕감 · 분납 통로) — 2026-09-24 실측 5 failed | 20 passed.
// 실행: npx vitest run src/api/ledger.reduce.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buyinTiers, isRevenueReduction, REDUCE_NEEDS_PW, type LedgerBuyin } from './ledger';

const S = { buyinAmount: 100_000, cardAmount: null, discounts: [{ label: '1레벨', amount: 50_000, level: 1 }] };

function b(over: Partial<LedgerBuyin> = {}): LedgerBuyin {
  return {
    id: 't', venueId: 'v', sessionDate: '2026-09-24', gameSeq: 1, playerName: 'p', entryNo: 1,
    paymentMethod: 'cash', isUnpaid: false, buyinAt: '2026-09-24T12:00:00Z', isSplit: false,
    cashAmount: 100_000, cardAmount: 0, transferAmount: 0, ticketCount: 0, unpaidAmount: 0,
    discountLevel: 0, discountIndex: 0, earlyOverride: null, ...over,
  };
}
const cash = b();
const ticket = b({ paymentMethod: 'ticket', cashAmount: 0 });
const split = b({ isSplit: true, cashAmount: 50_000, ticketCount: 5 });

describe('buyinTiers — [완납 매출, 수납 완료, 받을 가치]', () => {
  it('현금 10만 = [10만, 10만, 10만] · 가게지원 = 0 · 티켓 = [0, 10만, 10만] · 가불 티켓 = [0, 0, 10만]', () => {
    expect(buyinTiers(cash, S)).toEqual([100_000, 100_000, 100_000]);
    expect(buyinTiers(b({ paymentMethod: 'support', cashAmount: 0 }), S)).toEqual([0, 0, 0]);
    expect(buyinTiers(ticket, S)).toEqual([0, 100_000, 100_000]);
    expect(buyinTiers(b({ paymentMethod: 'ticket', cashAmount: 0, isUnpaid: true }), S)).toEqual([0, 0, 100_000]);
    expect(buyinTiers(split, S)).toEqual([50_000, 100_000, 100_000]);
  });
});

describe('isRevenueReduction — 감액이면 비밀번호', () => {
  const cases: [string, LedgerBuyin, LedgerBuyin, boolean][] = [
    ['현금 10만 → 0원', cash, b({ cashAmount: 0 }), true],
    ['현금 → 가게지원', cash, b({ paymentMethod: 'support', cashAmount: 0 }), true],
    ['현금 → 카드(같은 금액)', cash, b({ paymentMethod: 'card', cashAmount: 0, cardAmount: 100_000 }), false],
    ['현금 → 이체(같은 금액)', cash, b({ paymentMethod: 'transfer', cashAmount: 0, transferAmount: 100_000 }), false],
    ['증액 10만 → 11만', cash, b({ cashAmount: 110_000 }), false],
    ['완납 → 미수', cash, b({ isUnpaid: true }), true],
    ['미수 → 완납', b({ isUnpaid: true }), cash, false],
    ['현금 → 이용권', cash, ticket, true],
    ['이용권 → 현금', ticket, cash, false],
    ['🔴 이용권 → 가불 이용권', ticket, b({ paymentMethod: 'ticket', cashAmount: 0, isUnpaid: true }), true],
    ['가불 이용권 → 이용권(회수)', b({ paymentMethod: 'ticket', cashAmount: 0, isUnpaid: true }), ticket, false],
    ['🔴 이용권 행에 할인 자리(10T → 5T)', ticket, b({ paymentMethod: 'ticket', cashAmount: 0, discountIndex: 1 }), true],
    ['현금 할인 적용(스냅샷 10만 → 5만)', cash, b({ cashAmount: 50_000, discountIndex: 1 }), true],
    ['🔴 분납 이용권 5T → 3T + 미수 2만', split, b({ isSplit: true, cashAmount: 50_000, ticketCount: 3, unpaidAmount: 20_000 }), true],
    ['분납 현금 6만+미수 4만 → 현금 10만', b({ isSplit: true, cashAmount: 60_000, unpaidAmount: 40_000 }), b({ isSplit: true, cashAmount: 100_000 }), false],
    ['🔴 분납 미수 4만 탕감', b({ isSplit: true, cashAmount: 60_000, unpaidAmount: 40_000 }), b({ isSplit: true, cashAmount: 60_000 }), true],
    ['분납 → 비분납 현금 같은 금액', b({ isSplit: true, cashAmount: 100_000 }), cash, false],
    ['얼리만 변경', cash, b({ earlyOverride: 'double' }), false],
    ['레거시(금액 미저장) 행에 할인', b({ cashAmount: 0, buyinAt: '2026-08-01T00:00:00Z' }), b({ cashAmount: 0, buyinAt: '2026-08-01T00:00:00Z', discountIndex: 1 }), true],
  ];
  for (const [name, before, after, want] of cases) {
    it(`${name} → ${want ? '감액' : '통과'}`, () => { expect(isRevenueReduction(before, after, S)).toBe(want); });
  }
});

describe('upsertBuyin 수정 경로 — 감액은 직접 UPDATE 하지 않는다', () => {
  function mock(opts: { updateError?: unknown } = {}) {
    const calls = { update: 0, rpc: [] as [string, unknown][] };
    return {
      calls,
      mod: {
        IS_MOCK: false,
        supabase: {
          from: () => {
            const q = {
              update: () => { calls.update++; return q; }, eq: () => q,
              select: async () => ({ data: opts.updateError ? null : [{}], error: opts.updateError ?? null }),
            };
            return q;
          },
          rpc: async (name: string, args: unknown) => { calls.rpc.push([name, args]); return { data: null, error: null }; },
        },
      },
    };
  }
  async function load(m: ReturnType<typeof mock>) {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => m.mod);
    vi.doMock('./_session', () => ({ currentUser: async () => ({ id: 'u' }) }));
    return import('./ledger');
  }
  const base = { venueId: 'v', sessionDate: '2026-09-24', playerName: 'p', entryNo: 1, isUnpaid: false, existingId: 't',
    snapshot: S };

  it('🔴 현금 → 가게지원(비밀번호 없음)은 보내기 전에 REDUCE_NEEDS_PW', async () => {
    const m = mock(); const { upsertBuyin } = await load(m);
    await expect(upsertBuyin({ ...base, paymentMethod: 'support', reduce: { before: cash, session: S } }))
      .rejects.toThrow(REDUCE_NEEDS_PW);
    expect(m.calls.update).toBe(0);
    expect(m.calls.rpc).toEqual([]);
  });

  it('비밀번호를 주면 update_ledger_buyin_reduce 로 보낸다(직접 UPDATE 없음)', async () => {
    const m = mock(); const { upsertBuyin } = await load(m);
    await upsertBuyin({ ...base, paymentMethod: 'support', reduce: { before: cash, session: S, password: '4321' } });
    expect(m.calls.update).toBe(0);
    expect(m.calls.rpc[0][0]).toBe('update_ledger_buyin_reduce');
    expect(m.calls.rpc[0][1]).toMatchObject({ p_id: 't', p_password: '4321', p_fields: { payment_method: 'support', cash_amount: 0 } });
  });

  it('같은 가치 수단 변경(현금 → 카드)은 지금처럼 직접 UPDATE', async () => {
    const m = mock(); const { upsertBuyin } = await load(m);
    await upsertBuyin({ ...base, paymentMethod: 'card', reduce: { before: cash, session: S } });
    expect(m.calls.update).toBe(1);
    expect(m.calls.rpc).toEqual([]);
  });

  it('서버 가드가 hint 로 거절하면 같은 REDUCE_NEEDS_PW 로 바꾼다(클라 판정과 갈려도 비밀번호 시트로 간다)', async () => {
    const m = mock({ updateError: { message: '매출이 줄어드는 수정은 업주 취소 비밀번호가 필요합니다', code: '42501', hint: REDUCE_NEEDS_PW } });
    const { upsertBuyin } = await load(m);
    await expect(upsertBuyin({ ...base, paymentMethod: 'card', reduce: { before: cash, session: S } }))
      .rejects.toThrow(REDUCE_NEEDS_PW);
  });

  it('🔴 분납 이용권 축소도 같은 통로', async () => {
    const m = mock(); const { upsertBuyinSplit } = await load(m);
    await expect(upsertBuyinSplit({ venueId: 'v', sessionDate: '2026-09-24', playerName: 'p', entryNo: 1, existingId: 't',
      cashAmount: 50_000, cardAmount: 0, transferAmount: 0, ticketCount: 3, unpaidAmount: 20_000,
      reduce: { before: split, session: S } })).rejects.toThrow(REDUCE_NEEDS_PW);
    expect(m.calls.update).toBe(0);
  });
});
