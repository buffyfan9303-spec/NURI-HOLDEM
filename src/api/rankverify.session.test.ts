// UI-08-3 — 순위 인증 신청 이력(개인정보·증빙 제출 이력)이 세션 읽기 실패를 '신청 이력 없음' 으로 위장하지 않는다 (2026-09-13).
//   `currentUser()` 는 실패를 null 로 삼켜 `if (!u) return []` 가 됐다 → 회원이 중복 제출한다. `currentUserStrict` 로.
// 음성 대조: rankverify.ts 의 myRankVerifications 에서 currentUserStrict 를 currentUser 로 되돌리면 첫 케이스가 실패한다.
// 실행: npx vitest run src/api/rankverify.session.test.ts
import { describe, it, expect, vi } from 'vitest';

function mockSupabase(o: { sessionError?: unknown; noSession?: boolean; rows?: unknown[] }) {
  const chain: Record<string, unknown> = {};
  for (const k of ['select', 'eq', 'order', 'limit']) chain[k] = () => chain;
  chain.then = (resolve: (v: { data: unknown; error: unknown }) => void) => resolve({ data: o.rows ?? [], error: null });
  return { IS_MOCK: false, supabase: { auth: { getSession: async () => ({ data: { session: o.noSession ? null : { user: { id: 'u1' } } }, error: o.sessionError ?? null }) }, from: () => chain, storage: { from: () => ({}) } } };
}

describe('myRankVerifications', () => {
  it('🔴 세션 읽기 실패 → reject(이력 없음으로 위장하지 않는다)', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => mockSupabase({ sessionError: { message: 'Load failed' } }));
    const m = await import('./rankverify');
    await expect(m.myRankVerifications()).rejects.toMatchObject({ message: 'Load failed' });
  });
  it('정말 비로그인은 [] · 로그인은 행 매핑', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase', () => mockSupabase({ noSession: true }));
    const m = await import('./rankverify');
    await expect(m.myRankVerifications()).resolves.toEqual([]);
  });
});
