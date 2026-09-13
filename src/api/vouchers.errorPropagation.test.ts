// V04 재현/고정 — 이용권 조회 실패를 '보유 0장'으로 표시하던 결함.
//
// 재현: `const { data } = await supabase.from(...)` 처럼 error 를 구조분해에서 빼면
//   RLS 거부·네트워크 끊김이 전부 빈 배열이 되어 손님 화면에 "보유한 매장이용권이 없습니다"가
//   뜬다 — 돈 주고 산 이용권이 사라진 것처럼 보이는 화면이다.
// 고침: listMyVouchers/listVenueVouchers/voucherUsageByVenue/voucherHolderStats/
//   voucherHolderProfiles/voucherHistory 는 이제 error 를 throw 한다. 호출부
//   (VoucherWallet/MyVoucherSheet/LedgerVoucherRail/VoucherManageModal)는 이미 .catch 로
//   실패를 받는다 — 여기서 조용히 삼키던 게 유일한 결함이었다.
//
// 음성 대조: `if (error) throw error`(또는 `throw new Error(...)`) 를 지우고
//   `const { data } = ...` 로 되돌리면 아래 '거부되면 던진다' 테스트들이 실패한다.
//
// 실행: npx vitest run src/api/vouchers.errorPropagation.test.ts
import { describe, it, expect, vi } from 'vitest';

const RLS_DENIED = { message: 'permission denied for table store_vouchers', code: '42501' };

function makeSupabaseMock(opts: { fromError?: unknown; rpcError?: unknown; uid?: string | null }) {
  return {
    IS_MOCK: false,
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: opts.uid ? { user: { id: opts.uid } } : null } }),
      },
      from: () => {
        const q = {
          select: () => q,
          eq: () => q,
          order: () => q,
          then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
            resolve({ data: null, error: opts.fromError ?? null }),
        };
        return q;
      },
      rpc: async () => ({ data: null, error: opts.rpcError ?? null }),
    },
  };
}

describe('listMyVouchers — 조회 실패를 빈 배열로 위장하지 않는다(V04)', () => {
  it('🔴 RLS 거부는 던진다 — 예전엔 []로 뭉개져 "보유 0장"으로 보였다', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => makeSupabaseMock({ fromError: RLS_DENIED, uid: 'user-a' }));
    const { listMyVouchers } = await import('./vouchers');
    await expect(listMyVouchers()).rejects.toBeTruthy();
  });

  it('성공은 그대로 배열을 돌려준다', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => makeSupabaseMock({ uid: 'user-a' }));
    const { listMyVouchers } = await import('./vouchers');
    await expect(listMyVouchers()).resolves.toEqual([]);
  });

  it('비로그인은 실패가 아니라 빈 배열 — 로그아웃 자체를 에러로 취급하면 안 된다', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => makeSupabaseMock({ uid: null }));
    const { listMyVouchers } = await import('./vouchers');
    await expect(listMyVouchers()).resolves.toEqual([]);
  });
});

describe('listVenueVouchers — 업주 화면도 같은 계약을 쓴다', () => {
  it('🔴 조회 실패를 던진다', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => makeSupabaseMock({ fromError: RLS_DENIED }));
    const { listVenueVouchers } = await import('./vouchers');
    await expect(listVenueVouchers('venue-1')).rejects.toBeTruthy();
  });
});

describe('voucherUsageByVenue / voucherHolderStats / voucherHolderProfiles / voucherHistory — RPC 실패를 던진다', () => {
  it('🔴 voucherUsageByVenue', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => makeSupabaseMock({ rpcError: RLS_DENIED }));
    const { voucherUsageByVenue } = await import('./vouchers');
    await expect(voucherUsageByVenue('venue-1')).rejects.toBeTruthy();
  });

  it('🔴 voucherHolderStats', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => makeSupabaseMock({ rpcError: RLS_DENIED }));
    const { voucherHolderStats } = await import('./vouchers');
    await expect(voucherHolderStats('venue-1')).rejects.toBeTruthy();
  });

  it('🔴 voucherHolderProfiles', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => makeSupabaseMock({ rpcError: RLS_DENIED }));
    const { voucherHolderProfiles } = await import('./vouchers');
    await expect(voucherHolderProfiles('venue-1')).rejects.toBeTruthy();
  });

  it('🔴 voucherHistory', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => makeSupabaseMock({ rpcError: RLS_DENIED }));
    const { voucherHistory } = await import('./vouchers');
    await expect(voucherHistory('venue-1')).rejects.toBeTruthy();
  });
});
