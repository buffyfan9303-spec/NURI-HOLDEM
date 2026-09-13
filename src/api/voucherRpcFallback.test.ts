// 이용권 사용 RPC — **서버가 코드보다 늦어도 죽지 않는다** (V06 배포 순서 갭).
//
// 왜 필요한가 (2026-09-12 독립 검증에서 발견):
//   V06 수정이 `redeem_my_voucher_by_qr/by_phone` 에 `p_game_seq` 인자를 추가했다.
//   그런데 **PostgREST 는 인자 이름으로 함수를 찾는다** — 구 시그니처 서버에 없는 인자를 주면
//   조용히 무시되는 게 아니라 `PGRST202`(Could not find the function) 로 **실패**한다.
//   이 저장소는 지금도 **미적용 마이그레이션이 12개** 밀려 있고(오너 결정 #20),
//   앱이 서버보다 먼저 나가는 일이 실제로 반복됐다. 그대로 배포했다면
//   **모든 손님의 이용권 QR·전화 사용이 통째로 죽었을 것**이다.
//
//   그래서 한 번 실패하면 구 시그니처로 되돌려 재시도하고 세션에 기억한다
//   (`api/ads.ts` 의 `community_ads_public` 폴백과 같은 방식).
//   게임 지정만 못 할 뿐(= 수정 전과 같은 동작) 사용 자체는 계속 된다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = { fn: string; args: Record<string, unknown> };
let calls: Call[] = [];
/** 서버가 `p_game_seq` 를 모르는 구 시그니처인가. */
let legacyServer = false;

const PGRST202 = { code: 'PGRST202', message: 'Could not find the function public.redeem_my_voucher_by_qr(p_game_seq, p_venue_id, p_voucher_id)' };

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (legacyServer && 'p_game_seq' in args) return Promise.resolve({ data: null, error: PGRST202 });
      return Promise.resolve({ data: 'req-1', error: null });
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

beforeEach(() => { vi.resetModules(); calls = []; legacyServer = false; });

describe('최신 서버 — 게임 번호를 실어 보낸다', () => {
  it('QR 사용이 p_game_seq 를 포함한다', async () => {
    const { redeemMyVoucherByQr } = await load();
    await redeemMyVoucherByQr('v1', 'venue-1', 2);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toMatchObject({ p_voucher_id: 'v1', p_venue_id: 'venue-1', p_game_seq: 2 });
  });

  it('게임을 지정하지 않으면 null 로 보낸다 — 서버가 미지정으로 처리한다', async () => {
    const { redeemMyVoucherByQr } = await load();
    await redeemMyVoucherByQr('v1', 'venue-1');
    expect(calls[0].args).toMatchObject({ p_game_seq: null });
  });
});

describe('🔴 구 시그니처 서버 — 죽지 않고 되돌려 재시도한다', () => {
  it('PGRST202 가 나면 p_game_seq 없이 다시 불러 성공한다', async () => {
    legacyServer = true;
    const { redeemMyVoucherByQr } = await load();
    await expect(redeemMyVoucherByQr('v1', 'venue-1', 2), '구 서버에서 사용이 실패했다').resolves.toBe('req-1');
    expect(calls).toHaveLength(2);
    expect(calls[0].args, '첫 시도는 새 인자를 포함해야 한다').toHaveProperty('p_game_seq');
    expect(calls[1].args, '재시도가 구 시그니처가 아니다').not.toHaveProperty('p_game_seq');
  });

  it('한 번 확인했으면 이후에는 **곧장** 구 시그니처로 간다 — 매번 실패를 반복하지 않는다', async () => {
    legacyServer = true;
    const { redeemMyVoucherByQr } = await load();
    await redeemMyVoucherByQr('v1', 'venue-1', 2);   // 2회(실패+재시도)
    calls = [];
    await redeemMyVoucherByQr('v2', 'venue-1', 2);   // 1회여야 한다
    expect(calls).toHaveLength(1);
    expect(calls[0].args).not.toHaveProperty('p_game_seq');
  });

  it('전화번호 경로도 같은 폴백을 쓴다 — 한쪽만 고치면 나머지가 죽는다', async () => {
    legacyServer = true;
    const { redeemMyVoucherByPhone } = await load();
    await expect(redeemMyVoucherByPhone('v1', '01012345678')).resolves.toBe('req-1');
    expect(calls[calls.length - 1].args).not.toHaveProperty('p_game_seq');
  });

  it('QR 에서 확인한 사실을 전화번호 경로도 함께 쓴다 — 같은 서버다', async () => {
    legacyServer = true;
    const { redeemMyVoucherByQr, redeemMyVoucherByPhone } = await load();
    await redeemMyVoucherByQr('v1', 'venue-1', 2);
    calls = [];
    await redeemMyVoucherByPhone('v2', '01012345678');
    expect(calls, '전화번호 경로가 또 한 번 실패를 겪었다').toHaveLength(1);
  });
});

describe('진짜 오류는 삼키지 않는다', () => {
  it('🔴 만료·권한 같은 실제 실패는 그대로 던진다 — 폴백으로 뭉개지 않는다', async () => {
    // 함수를 못 찾은 게 아니라 업무 규칙 위반이다.
    vi.doMock('../lib/supabase', () => ({
      IS_MOCK: false,
      supabase: { rpc: () => Promise.resolve({ data: null, error: { code: 'P0001', message: '만료된 이용권입니다' } }) },
    }));
    vi.resetModules();
    const { redeemMyVoucherByQr } = await import('./vouchers');
    await expect(redeemMyVoucherByQr('v1', 'venue-1', 2)).rejects.toThrow('만료된 이용권입니다');
  });
});
