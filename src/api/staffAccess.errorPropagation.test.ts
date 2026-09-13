// P02 재현/고정 — 직원 권한 조회 실패를 '권한 없음'으로 표시하던 결함 (2026-09-13).
//
// ⚠ 재작업(2026-09-13 독립 검증 FAIL): 원래 이 파일은 42501(RLS 거부)을 목킹했는데 **서버가 만들 수 없는 조건**이다 —
//   get_ledger_access_user_ids / get_voucher_access_user_ids 는 인가를 WHERE 절(`and can_manage_pos(p_venue_id)`)로 표현해 비인가
//   호출자에게 **200 + 0행**을 준다. `if (error) throw error` 로는 그 경우를 절대 못 잡는다(그건 DB 초안 20260913c 가 다룬다).
//   여기서 잠그는 것은 **실제로 나는 실패**다: 세션 만료(PGRST301) · 구버전 서버(PGRST202) · 네트워크.
//   그 셋이 [] 로 resolve 되면 '전원 권한 없음' 이 된다 — 그 위장을 막는다.
//
// 재현: getLedgerAccessUserIds 는 `if (error) return [];` 로, getVoucherAccessUserIds 는 `const { data } = …` 로
//   error 를 버려서 세션 만료·구버전 서버·네트워크 끊김이 전부 **빈 배열**이 됐다. 호출부 StaffManager 는
//   `access.includes(id)` 만 보므로 조회가 실패하면 **모든 직원이 '장부·순위 권한 없음'·'이용권내역 ✗'** 로 뜨고,
//   업주가 "다 꺼져 있네" 하고 다시 누르면 has=false 로 grant 를 쏜다. NuriPosLedger 의 담당 직원 후보도 조용히 빈다.
// 고침: 두 함수가 형제(myVisitedVenues·voucherHolderStats V04·iCanViewVouchers·canAccessLedger)와 같이 `if (error) throw error`.
//   호출부는 실패를 별도 상태(확인 실패)로 받아 재시도 카드를 띄우고, 그 상태에서는 토글을 저장하지 않는다
//   (화면 배선은 src/components/features/StaffAccessState.contract.test.ts 가 잠근다).
//
// 음성 대조: ledger.ts 의 `if (error) throw error;`(getLedgerAccessUserIds) 를 `if (error) return [];` 로,
//   vouchers.ts 의 `const { data, error } = …get_voucher_access_user_ids` 를 `const { data } = …` 로 되돌리면
//   아래 🔴 테스트가 각각 실패한다 — 실패 메시지에 `[]` 로 resolve 된 것이 그대로 찍힌다.
//
// 실행: npx vitest run src/api/staffAccess.errorPropagation.test.ts
import { describe, it, expect, vi } from 'vitest';

const SESSION_EXPIRED = { message: 'JWT expired', code: 'PGRST301', details: null, hint: null };
const OLD_SERVER = { message: 'Could not find the function public.get_ledger_access_user_ids', code: 'PGRST202', details: null, hint: null };
const NET_DOWN = { message: 'TypeError: Failed to fetch' };

function makeSupabaseMock(opts: { fromError?: unknown; fromRows?: unknown[]; rpcError?: unknown; rpcRows?: unknown[] }) {
  return {
    IS_MOCK: false,
    supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'owner-1' } } } }) },
      from: () => {
        const q = {
          select: () => q,
          eq: () => q,
          order: () => q,
          then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
            resolve({ data: opts.fromError ? null : (opts.fromRows ?? []), error: opts.fromError ?? null }),
        };
        return q;
      },
      rpc: async () => ({ data: opts.rpcError ? null : (opts.rpcRows ?? []), error: opts.rpcError ?? null }),
    },
  };
}

describe('getLedgerAccessUserIds — 조회 실패를 빈 배열(=전원 권한 없음)로 위장하지 않는다', () => {
  it('🔴 세션 만료(PGRST301)는 그대로 던진다 — code 가 살아야 화면이 "재로그인" 갈래를 안다(다시 시도로는 영원히 실패)', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => makeSupabaseMock({ fromError: SESSION_EXPIRED }));
    const { getLedgerAccessUserIds } = await import('./ledger');
    await expect(getLedgerAccessUserIds('venue-1')).rejects.toMatchObject({ code: 'PGRST301' });
  });
  it('🔴 구버전 서버(PGRST202 — RPC/뷰 미적용)도 던진다', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => makeSupabaseMock({ fromError: OLD_SERVER }));
    const { getLedgerAccessUserIds } = await import('./ledger');
    await expect(getLedgerAccessUserIds('venue-1')).rejects.toMatchObject({ code: 'PGRST202' });
  });

  it('🔴 네트워크 끊김도 던진다 — 예전엔 [] 로 뭉개져 모든 직원이 "장부·순위 권한 없음" 으로 보였다', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => makeSupabaseMock({ fromError: NET_DOWN }));
    const { getLedgerAccessUserIds } = await import('./ledger');
    await expect(getLedgerAccessUserIds('venue-1')).rejects.toBeTruthy();
  });

  it('성공은 user_id 배열 — 실제 0건(아무도 권한 없음)은 여전히 [] 다(실패와 구분되는 유일한 0건)', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => makeSupabaseMock({ fromRows: [{ user_id: 'u1' }, { user_id: 'u2' }] }));
    const { getLedgerAccessUserIds } = await import('./ledger');
    await expect(getLedgerAccessUserIds('venue-1')).resolves.toEqual(['u1', 'u2']);
    vi.resetModules();
    vi.doMock('../lib/supabase', () => makeSupabaseMock({ fromRows: [] }));
    const again = await import('./ledger');
    await expect(again.getLedgerAccessUserIds('venue-1')).resolves.toEqual([]);
  });
});

describe('getVoucherAccessUserIds — 같은 계약(형제 voucherHolderStats V04 와 같은 관용구)', () => {
  it('🔴 세션 만료(PGRST301)·구버전 서버(PGRST202)는 그대로 던진다(42501 은 이 RPC 가 만들 수 없다 — WHERE 절 인가 = 200+0행)', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => makeSupabaseMock({ rpcError: SESSION_EXPIRED }));
    const { getVoucherAccessUserIds } = await import('./vouchers');
    await expect(getVoucherAccessUserIds('venue-1')).rejects.toMatchObject({ code: 'PGRST301' });
    vi.resetModules();
    vi.doMock('../lib/supabase', () => makeSupabaseMock({ rpcError: OLD_SERVER }));
    const again = await import('./vouchers');
    await expect(again.getVoucherAccessUserIds('venue-1')).rejects.toMatchObject({ code: 'PGRST202' });
  });

  it('🔴 네트워크 끊김도 던진다 — 예전엔 error 를 구조분해에서 아예 빼서 [] 가 됐다', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => makeSupabaseMock({ rpcError: NET_DOWN }));
    const { getVoucherAccessUserIds } = await import('./vouchers');
    await expect(getVoucherAccessUserIds('venue-1')).rejects.toBeTruthy();
  });

  it('성공은 user_id 배열 · 실제 0건은 []', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => makeSupabaseMock({ rpcRows: [{ user_id: 'u9' }] }));
    const { getVoucherAccessUserIds } = await import('./vouchers');
    await expect(getVoucherAccessUserIds('venue-1')).resolves.toEqual(['u9']);
  });
});

describe('grant/revokeVoucherAccess — 오류 객체를 그대로 던진다(P02 재작업 3)', () => {
  // 예전 `throw new Error(error.message)` 는 code 를 버려 msgOf 가 세션 만료를 '변경 실패' 로만 말했다. 형제 ledger.grantLedgerAccess 와 같이 객체 그대로.
  it('🔴 grant: code 가 산다', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => makeSupabaseMock({ rpcError: SESSION_EXPIRED }));
    const { grantVoucherAccess } = await import('./vouchers');
    await expect(grantVoucherAccess('venue-1', 'u1')).rejects.toMatchObject({ code: 'PGRST301' });
  });
  it('🔴 revoke: code 가 산다', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => makeSupabaseMock({ rpcError: SESSION_EXPIRED }));
    const { revokeVoucherAccess } = await import('./vouchers');
    await expect(revokeVoucherAccess('venue-1', 'u1')).rejects.toMatchObject({ code: 'PGRST301' });
  });
});
