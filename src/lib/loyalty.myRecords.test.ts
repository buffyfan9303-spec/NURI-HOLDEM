// 20261004a(오너 10-04 Q1) — '내 업적'(머니인·챔피언)은 서버가 '그 이름의 주인이 된 뒤' 행만 고른 my_ranking_history 로 센다.
// 결함: getMyBadgeStats 가 venue_rankings 를 지금 닉네임 ilike 로 읽어, 가입 전 같은 이름 워크인 행(남의 기록)까지 내 머니인·챔피언으로 셌다.
// 음성 대조: loyalty.ts 의 rpc('my_ranking_history', …) 를 옛 `.from('venue_rankings')…ilike(…)` 로 되돌리면 첫 케이스가 실패한다.
// 실행: npx vitest run src/lib/loyalty.myRecords.test.ts
import { describe, it, expect, vi } from 'vitest';

const WALKIN_ROW = { nickname: 'kim', position: 1 }; // 같은 이름 · 가입 전 워크인 — 서버 판정에서 빠진다

function mockSupabase(rpcResult: { data: unknown; error: unknown }) {
  const calls: { rpc: [string, unknown][]; from: string[] } = { rpc: [], from: [] };
  const mod = {
    IS_MOCK: false,
    supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } }, error: null }) },
      rpc: async (fn: string, args: unknown) => { calls.rpc.push([fn, args]); return rpcResult; },
      from: (table: string) => {
        calls.from.push(table);
        const rows = table === 'venue_rankings' ? [WALKIN_ROW] : table === 'profiles' ? [{ checkin_streak: 0 }] : [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const q: any = {
          select: () => q, eq: () => q, ilike: () => q,
          single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
          then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data: rows, error: null }),
        };
        return q;
      },
    },
  };
  return { mod, calls };
}

async function load(rpcResult: { data: unknown; error: unknown }) {
  vi.resetModules();
  const { mod, calls } = mockSupabase(rpcResult);
  vi.doMock('./supabase', () => mod);
  const m = await import('./loyalty');
  return { getMyBadgeStats: m.getMyBadgeStats, calls };
}

describe('내 업적 — 서버 이름 소유 판정(my_ranking_history)', () => {
  it('🔴 머니인·최고 등수는 서버가 돌려준 내 행으로만 — 같은 이름 워크인 1위 행은 섞이지 않는다', async () => {
    const { getMyBadgeStats, calls } = await load({ data: [{ position: 3 }, { position: 5 }], error: null });
    const s = await getMyBadgeStats('kim', 0);
    expect(s).toMatchObject({ moneyin: 2, bestPosition: 3 });
    expect(calls.rpc).toContainEqual(['my_ranking_history', { p_limit: 200 }]);
    expect(calls.from).not.toContain('venue_rankings');
  });

  it('🔴 서버 실패는 던진다(업적 0개로 위장 금지)', async () => {
    const { getMyBadgeStats } = await load({ data: null, error: { code: 'PGRST301', message: 'JWT' } });
    await expect(getMyBadgeStats('kim', 0)).rejects.toMatchObject({ code: 'PGRST301' });
  });

  it('양성 대조: 닉네임이 없으면 서버를 부르지 않고 0', async () => {
    const { getMyBadgeStats, calls } = await load({ data: [{ position: 1 }], error: null });
    await expect(getMyBadgeStats(null, 0)).resolves.toMatchObject({ moneyin: 0, bestPosition: 9999 });
    expect(calls.rpc.filter(([fn]) => fn === 'my_ranking_history')).toHaveLength(0);
  });
});
