// 관리자 지표 '못 읽음'이 '없음/0'으로 보이던 자리 — 점검 A-10(2026-10-01)
// 실행: npx vitest run src/api/adminStats.failures.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

let rpcResult: { data: unknown; error: { message: string } | null };
let counts: Record<string, number>;

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    rpc: () => Promise.resolve(rpcResult),
    from: (tbl: string) => {
      const q: Record<string, unknown> = {};
      for (const k of ['select', 'eq', 'in', 'gt', 'is']) q[k] = () => q;
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ count: counts[tbl] ?? 0, error: null }).then(res);
      return q;
    },
  },
}));

const stats = await import('./adminStats');
const community = await import('./community');

beforeEach(() => { rpcResult = { data: [], error: null }; counts = {}; });

describe('RPC 지표는 실패를 삼키지 않는다', () => {
  it('🔴 admin_platform_stats 오류 → 던진다(예전엔 null 이라 이유도 재시도도 없었다)', async () => {
    rpcResult = { data: null, error: { message: '관리자만 조회할 수 있습니다' } };
    await expect(stats.getAdminPlatformStats()).rejects.toThrow('관리자만');
  });
  it('빈 응답도 던진다', async () => {
    await expect(stats.getAdminPlatformStats()).rejects.toThrow();
  });
  it('🔴 free_plan_usage 오류 → 던진다(예전엔 [] 라 카드가 조용히 사라졌다)', async () => {
    rpcResult = { data: null, error: { message: 'boom' } };
    await expect(stats.getFreePlanUsage()).rejects.toThrow('boom');
  });
  it('정상 응답은 행을 매핑한다', async () => {
    rpcResult = { data: [{ metric: 'DB', used: 1, limit_val: 10, pct: 10, status: 'ok' }], error: null };
    await expect(stats.getFreePlanUsage()).resolves.toEqual([{ metric: 'DB', used: 1, limitVal: 10, pct: 10, status: 'ok' }]);
  });
});

describe('getAdminStats — RLS 거부는 0 이 아니라 실패', () => {
  it('🔴 profiles count 가 0(관리자 본인 행도 못 읽음) → 던진다', async () => {
    await expect(community.getAdminStats()).rejects.toThrow('운영 지표를 읽을 수 없습니다');
  });
  it('회원이 있으면 정상', async () => {
    counts = { profiles: 12, community_posts: 3 };
    await expect(community.getAdminStats()).resolves.toMatchObject({ users: 12, posts: 3 });
  });
});
