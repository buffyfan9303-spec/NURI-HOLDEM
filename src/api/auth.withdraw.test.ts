// 탈퇴 두 경로가 카카오 연결 끊기(kakao-unlink)를 **탈퇴 RPC 전에** 부르고, 실패해도 탈퇴는 진행한다(critical-211 P2-1).
// 순서가 중요한 이유: 탈퇴 RPC 가 auth.identities 를 지우면 엣지가 카카오 회원번호를 더는 못 읽는다.
// 실행: npx vitest run src/api/auth.withdraw.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { calls, invoke, rpc } = vi.hoisted(() => {
  const calls: string[] = [];
  return {
    calls,
    invoke: vi.fn(async (name: string, opts?: unknown): Promise<{ data: unknown; error: Error | null }> => { void opts; calls.push('invoke:' + name); return { data: { unlinked: true }, error: null }; }),
    rpc: vi.fn(async (name: string, args?: unknown) => { void args; calls.push('rpc:' + name); return { data: null, error: null }; }),
  };
});

// adminWithdrawUser 의 사전 확인(매장 대표·관리자 대상)용 select 사슬 — 둘 다 '해당 없음'
const chain = () => {
  const c: Record<string, unknown> = {};
  for (const k of ['select', 'eq', 'limit']) c[k] = () => c;
  c.maybeSingle = async () => ({ data: { role: 'user' }, error: null });
  c.then = (res: (v: unknown) => unknown) => res({ data: [], error: null });
  return c;
};

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  setKeepSignedIn: () => {},
  clearAuthStorage: () => {},
  supabase: { functions: { invoke }, rpc, from: () => chain() },
}));
vi.mock('./_session', () => ({ currentUser: async () => ({ id: 'me' }) }));

const auth = await import('./auth');
const T = '22222222-2222-4222-8222-222222222222';

beforeEach(() => { calls.length = 0; invoke.mockClear(); rpc.mockClear(); });

describe('탈퇴 직전 카카오 연결 끊기', () => {
  it('본인 탈퇴 — kakao-unlink(본인) 다음에 withdraw_my_account', async () => {
    await auth.withdrawMyAccount();
    expect(calls).toEqual(['invoke:kakao-unlink', 'rpc:withdraw_my_account']);
    expect(invoke.mock.calls[0][1]).toMatchObject({ body: {} });
  });

  it('관리자 강제 탈퇴 — 대상 userId 로 kakao-unlink 다음에 admin_withdraw_user', async () => {
    await auth.adminWithdrawUser(T, '사유');
    const i = calls.indexOf('invoke:kakao-unlink');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(calls.indexOf('rpc:admin_withdraw_user'));
    expect(invoke.mock.calls.find((c) => c[0] === 'kakao-unlink')![1]).toMatchObject({ body: { userId: T } });
  });

  it.each([
    ['엣지가 던짐(미배포·네트워크)', async () => { throw new Error('fetch failed'); }],
    ['엣지가 오류 응답', async () => ({ data: null, error: new Error('500') })],
    ['카카오가 거절해 큐에 남김', async () => ({ data: { unlinked: false, queued: true }, error: null })],
  ])('%s — 그래도 탈퇴 RPC 는 진행한다(탈퇴 권리 우선)', async (_n, impl) => {
    invoke.mockImplementationOnce(async (name: string) => { calls.push('invoke:' + name); return impl(); });
    await expect(auth.withdrawMyAccount()).resolves.toBeUndefined();
    expect(calls).toEqual(['invoke:kakao-unlink', 'rpc:withdraw_my_account']);
  });
});
