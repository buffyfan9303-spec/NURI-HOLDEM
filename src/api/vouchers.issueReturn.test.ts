// Q2(2026-09-20) — issueVoucher 가 서버의 실제 발급 수량(정수)을 돌려주는지 잠근다.
//
// 왜 필요한가: 서버 issue_voucher(20260905i)는 `least(greatest(p_count,1),1000)` 로 clamp 한
//   실제 발급 수량을 RETURNS integer 로 돌려준다. 예전 클라이언트는 이 반환값을 버리고
//   Promise<void> 였다 — 서버가 요청보다 적게 발급해도(한도 clamp 등) 화면은 항상
//   "요청 수량만큼 성공"으로 표시했다. 호출부(VoucherManageModal·CheckinModal)가 이 수량과
//   요청 count 를 대조해 불일치를 "결과 확인 필요"로 보여주려면, 이 함수가 먼저 숫자를 돌려줘야 한다.
//
// 음성 대조: 반환 타입을 다시 Promise<void> 로 돌리거나 `data` 를 버리면 아래 '정수를 그대로
//   돌려준다' 테스트가 타입 에러 또는 값 불일치로 실패한다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

type RpcCall = { fn: string; args: Record<string, unknown> };
let calls: RpcCall[] = [];
let rpcData: unknown = null;
let rpcError: unknown = null;
// IS_MOCK 은 살아있는 바인딩으로 노출한다 — 테스트마다 vi.doMock 으로 모듈을 다시 갈면(IS_MOCK 테스트처럼)
// 그 뒤의 vi.resetModules() 가 최상위 vi.mock 팩토리까지 날려 **진짜 lib/supabase** 가 로드되고,
// 진짜 클라이언트가 실제 네트워크로 RPC 를 쏴 버린다(이 파일 초안에서 실제로 'permission denied' 가 났다).
let isMock = false;

vi.mock('../lib/supabase', () => ({
  get IS_MOCK() { return isMock; },
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: rpcData, error: rpcError });
    },
  },
}));
vi.mock('../lib/identityFlag', () => ({
  IDENTITY_FLAG_KEY: 'identity_voucher_enabled',
  identityEnabled: () => true,
  useIdentityEnabled: () => true,
  refreshIdentityFlag: () => Promise.resolve(true),
}));

const load = async () => await import('./vouchers');

beforeEach(() => { vi.resetModules(); calls = []; rpcData = null; rpcError = null; isMock = false; });

describe('issueVoucher — 서버가 돌려준 실제 발급 수량을 그대로 반환한다', () => {
  it('요청 5장에 서버가 5를 돌려주면 5를 반환한다', async () => {
    rpcData = 5;
    const { issueVoucher } = await load();
    await expect(issueVoucher('venue-1', { title: 'x', count: 5, reason: 'visit' })).resolves.toBe(5);
  });

  it('🔴 서버가 한도로 clamp 해 요청보다 적게(3) 돌려주면 3을 반환한다 — 요청 수량(5)으로 덮지 않는다', async () => {
    rpcData = 3;
    const { issueVoucher } = await load();
    const n = await issueVoucher('venue-1', { title: 'x', count: 5, reason: 'visit' });
    expect(n, '요청 count 로 조용히 대체하면 호출부가 불일치를 못 잡는다').toBe(3);
    expect(n).not.toBe(5);
  });

  it('🔴 구버전 RPC 처럼 data 가 숫자가 아니면(null) 0을 반환한다 — 요청 수량으로 대체하지 않는다', async () => {
    rpcData = null;
    const { issueVoucher } = await load();
    const n = await issueVoucher('venue-1', { title: 'x', count: 7, reason: 'visit' });
    expect(n, '알 수 없는 반환을 요청 수량(7)으로 뭉개면 실제 불일치를 놓친다').toBe(0);
  });

  it('RPC 오류는 그대로 던진다(반환값 변경과 무관하게 기존 계약 유지)', async () => {
    rpcError = { message: '발급 한도가 부족합니다 (잔여 0개)', code: 'P0001' };
    const { issueVoucher } = await load();
    await expect(issueVoucher('venue-1', { title: 'x', count: 1, reason: 'visit' })).rejects.toThrow('발급 한도가 부족합니다');
  });

  it('IS_MOCK 모드는 요청 count(또는 기본 1)를 그대로 반환한다', async () => {
    isMock = true;
    const { issueVoucher } = await load();
    await expect(issueVoucher('venue-1', { title: 'x', count: 4, reason: 'visit' })).resolves.toBe(4);
    await expect(issueVoucher('venue-1', { title: 'x', reason: 'visit' })).resolves.toBe(1);
    expect(calls, 'IS_MOCK 은 RPC 를 부르지 않아야 한다').toHaveLength(0);
  });

  it('RPC 로 넘어가는 인자는 그대로(p_count 등) 유지된다 — 회귀 확인', async () => {
    rpcData = 2;
    const { issueVoucher } = await load();
    await issueVoucher('venue-9', { title: '이용권', count: 2, holderUserId: 'u1', reason: 'visit' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ fn: 'issue_voucher', args: { p_venue_id: 'venue-9', p_count: 2, p_holder_user_id: 'u1', p_reason: 'visit' } });
  });
});
