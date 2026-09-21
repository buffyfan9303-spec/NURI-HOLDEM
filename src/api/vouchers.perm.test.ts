// 🔴 2026-09-21 — `iCanViewVouchers` 의 두 계약을 잠근다. 뮤테이션에서 `return data === true;` 가 **생존**했다.
//
// 이 함수는 권한 판정이다 — 원문 주석: '현재 사용자가 이 매장 이용권 내역을 볼 수 있는지(업주 또는 권한 부여 직원)'.
//
// ① `data === true` — 서버가 **정확히 true** 를 줄 때만 보여 준다.
//    느슨해지면(문자열 'true'·1 도 통과) 화면이 권한을 과하게 연다.
//    ⚠ 진짜 관문은 서버 RLS 다(CLAUDE.md: '인가는 서버가 한다. 클라 판정은 UI 분기용일 뿐이다').
//      그래도 화면이 서버 판정을 **그대로** 비추지 않으면, 열린 줄 알고 들어갔다 막히는 화면이 된다.
// ② 조회 **실패를 '권한 없음' 으로 둔갑시키지 않는다** — 원문 주석이 적는 과거 사고다:
//    'error 를 구조분해에서 빼면 실패가 권한 없음이 된다 — 같은 Promise.all 의 형제들과 함께
//     호출부의 재시도 카드를 죽였다.' 즉 네트워크 오류에 **던져야** 호출부가 재시도를 띄운다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

let rpcResult: unknown = true;
let rpcError: unknown = null;
const rpcCalls: { fn: string; args?: Record<string, unknown> }[] = [];

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    auth: { onAuthStateChange: () => {} },
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return { data: rpcResult, error: rpcError };
    },
  },
}));

const v = await import('./vouchers');

beforeEach(() => { rpcCalls.length = 0; rpcError = null; });

describe('iCanViewVouchers — 서버 판정을 그대로 비춘다', () => {
  it.each([
    [true, true],
    [false, false],
    ['true', false],   // 🔴 문자열은 허가가 아니다
    [1, false],
    [null, false],
    [undefined, false],
  ])('RPC 가 %s 를 돌려주면 → %s', async (given, want) => {
    rpcResult = given;
    expect(await v.iCanViewVouchers('venue-1')).toBe(want);
  });

  it('전제: 실제로 can_view_vouchers 를 매장 id 와 함께 묻는다(목킹이 걸렸다는 증거)', async () => {
    rpcResult = true;
    await v.iCanViewVouchers('venue-42');
    expect(rpcCalls.length).toBe(1);
    expect(rpcCalls[0].fn).toBe('can_view_vouchers');
    expect(rpcCalls[0].args).toMatchObject({ p_venue_id: 'venue-42' });
  });

  it('🔴 조회 실패는 던진다 — false(권한 없음)로 둔갑시키지 않는다', async () => {
    rpcResult = null;
    rpcError = { message: '네트워크 실패', code: '500' };
    await expect(v.iCanViewVouchers('venue-1'),
      '실패를 false 로 뭉개면 호출부가 재시도 카드를 못 띄운다(원문 주석의 과거 사고)')
      .rejects.toBeTruthy();
  });
});
