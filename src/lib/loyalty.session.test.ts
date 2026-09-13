// UI-08-2·3 — 업적·미션·장착마크·명예의 전당 조회가 세션 읽기 실패·쿼리 실패를 '0개/0점/없음' 으로 위장하지 않는다 (2026-09-13).
//
// 결함: getMyBadgeStats / getMissionProgress / getMyEquippedMark 가 `currentUser()`(실패를 null 로 삼킴)를 쓰고
//   `if (!uid) return empty` 라 **세션 조회 실패 = 비로그인 = 0개** 였다. 3쿼리의 error 도 한 번도 읽지 않았다.
//   getMonthlyHall 도 `const { data } = …` 라 장애가 '지난달 입상 없음' 이 됐다.
// 고침: `currentUserStrict`(이미 있던 _session.ts:67 — `if (error) throw error`) + 쿼리 error 검사.
// 음성 대조: loyalty.ts 의 getMyBadgeStats 에서 `currentUserStrict` 를 `currentUser` 로 되돌리면 첫 케이스가 실패한다.
// 실행: npx vitest run src/lib/loyalty.session.test.ts
import { describe, it, expect, vi } from 'vitest';

const SESSION_ERR = { message: 'Load failed', name: 'AuthRetryableFetchError', status: 0 };
const QUERY_ERR = { message: 'permission denied for table checkins', code: '42501' };

function mockSupabase(o: { sessionError?: unknown; noSession?: boolean; queryError?: unknown; rows?: unknown[] }) {
  const q = () => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const k of ['select', 'eq', 'gte', 'lte', 'ilike', 'order', 'limit', 'single']) chain[k] = self;
    chain.then = (resolve: (v: { data: unknown; error: unknown; count: number | null }) => void) =>
      resolve({ data: o.queryError ? null : (o.rows ?? []), error: o.queryError ?? null, count: o.queryError ? null : 0 });
    return chain;
  };
  return {
    IS_MOCK: false,
    supabase: {
      auth: { getSession: async () => ({ data: { session: o.noSession ? null : { user: { id: 'u1' } } }, error: o.sessionError ?? null }) },
      from: () => q(),
      rpc: async () => ({ data: null, error: null }),
    },
  };
}

describe('세션 읽기 실패는 던진다(비로그인 0개로 위장 금지)', () => {
  for (const fn of ['getMyBadgeStats', 'getMissionProgress', 'getMyEquippedMark'] as const) {
    it(`🔴 ${fn}: auth.getSession 실패 → reject`, async () => {
      vi.resetModules();
      vi.doMock('./supabase', () => mockSupabase({ sessionError: SESSION_ERR }));
      const m = await import('./loyalty');
      const call = fn === 'getMyBadgeStats' ? m.getMyBadgeStats('nick', 100) : fn === 'getMissionProgress' ? m.getMissionProgress('nick') : m.getMyEquippedMark();
      await expect(call).rejects.toMatchObject({ message: 'Load failed' });
    });
  }
  it('정말 비로그인(session null)은 여전히 빈 값 — 실패와 구분되는 유일한 0', async () => {
    vi.resetModules();
    vi.doMock('./supabase', () => mockSupabase({ noSession: true }));
    const m = await import('./loyalty');
    await expect(m.getMyBadgeStats('nick', 7)).resolves.toMatchObject({ moneyin: 0, points: 7 });
    await expect(m.getMissionProgress('nick', [{ key: 'm1', type: 'checkin' } as never])).resolves.toEqual([{ key: 'm1', current: 0, claimed: false }]);
    await expect(m.getMyEquippedMark()).resolves.toBeNull();
  });
});

describe('쿼리 실패는 던진다', () => {
  it('🔴 getMyBadgeStats: 체크인 쿼리 42501 → reject(코드 보존)', async () => {
    vi.resetModules();
    vi.doMock('./supabase', () => mockSupabase({ queryError: QUERY_ERR }));
    const m = await import('./loyalty');
    await expect(m.getMyBadgeStats('nick', 1)).rejects.toMatchObject({ code: '42501' });
  });
  it('🔴 getMissionProgress: 쿼리 실패 → reject', async () => {
    vi.resetModules();
    vi.doMock('./supabase', () => mockSupabase({ queryError: QUERY_ERR }));
    const m = await import('./loyalty');
    await expect(m.getMissionProgress('nick')).rejects.toMatchObject({ code: '42501' });
  });
  it('🔴 getMonthlyHall: 쿼리 실패 → reject(예전엔 "지난달 입상 없음")', async () => {
    vi.resetModules();
    vi.doMock('./supabase', () => mockSupabase({ queryError: QUERY_ERR }));
    const m = await import('./loyalty');
    await expect(m.getMonthlyHall()).rejects.toMatchObject({ code: '42501' });
  });
  it('🔴 getMyEquippedMark: 쿼리 실패 → reject(예전엔 null = 미장착)', async () => {
    vi.resetModules();
    vi.doMock('./supabase', () => mockSupabase({ queryError: QUERY_ERR }));
    const m = await import('./loyalty');
    await expect(m.getMyEquippedMark()).rejects.toMatchObject({ code: '42501' });
  });
});
