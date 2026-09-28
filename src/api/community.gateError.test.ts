// 서버 거절 사유가 사라지던 결함(2026-09-29 C-4) — 글쓰기·실시간 한 줄·딜러 글·신고가 `throw error`(평범한 객체)라
// 호출부의 `err instanceof Error` 판정이 거짓이 되어 '실패했습니다' 로 뭉개졌다. 댓글만 new Error 로 감싸 사유가 살아 있었다.
// 12초/5초 쿨다운·제재·금칙어는 plpgsql raise(P0001)라 그 문장을 그대로 올려야 한다. 그 밖의 오류는 내부 식별자 노출 없이 기본 문구.
// 실행: npx vitest run src/api/community.gateError.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const state = { error: null as unknown };

vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
vi.mock('./_session', () => ({ currentUser: async () => ({ id: 'u1', role: 'user' }) }));
vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    from: () => {
      const res = () => ({ data: null, error: state.error });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = {
        insert: () => q,
        select: () => q,
        single: () => Promise.resolve(res()),
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(res()).then(ok, ko),
      };
      return q;
    },
  },
}));

const { addPost, addLiveMessage, createDealerPost } = await import('./community');
const { submitReport } = await import('./reports');

const P0001 = (message: string) => ({ code: 'P0001', message, details: null, hint: null }); // supabase-js 의 {error} 는 평범한 객체
const RLS = { code: '42501', message: 'new row violates row-level security policy for table "community_posts"' };

const post = { userId: 'u1', userName: 'n', userRole: 'user' as const, userColor: '#888', content: '본문' };
const live = { userId: 'u1', userName: 'n', userRole: 'user' as const, userColor: '#888', content: '한 줄' };
const dealer = { kind: 'general' as const, content: '내용' };
const report = { targetType: 'post' as const, targetId: 'p1', reason: '스팸' };

const calls: [string, () => Promise<unknown>, string][] = [
  ['addPost', () => addPost(post), '게시글 등록에 실패했습니다'],
  ['addLiveMessage', () => addLiveMessage(live), '전송에 실패했습니다'],
  ['createDealerPost', () => createDealerPost(dealer), '등록에 실패했습니다'],
  ['submitReport', () => submitReport(report), '신고 접수에 실패했습니다'],
];

beforeEach(() => { state.error = null; });

describe.each(calls)('%s — 서버 거절 사유', (_name, run, fallback) => {
  it('P0001(쿨다운·제재·금칙어)은 서버 문장이 그대로 올라온다 — Error 인스턴스로', async () => {
    state.error = P0001('12초에 한 번만 작성할 수 있습니다.');
    const e = await run().then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(Error);
    expect((e as Error).message).toBe('12초에 한 번만 작성할 수 있습니다.');
  });
  it('RLS 같은 기술 오류는 테이블·정책 이름 없이 기본 문구로 시작한다', async () => {
    state.error = RLS;
    const e = await run().then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(Error);
    expect((e as Error).message).toContain(fallback);
    expect((e as Error).message).not.toMatch(/community_posts|row-level|policy/);
  });
});
