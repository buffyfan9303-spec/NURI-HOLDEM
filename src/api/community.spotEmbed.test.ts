// 2026-10-01 시안 A — 게시판 목록이 SPOT 미리보기를 **같은 요청 하나에** 끼워 받는가(N+1 금지).
// ① getPosts·searchPosts·getPostById 의 select 에 post_spots 공개 열 3개만 끼운다(칸 단위 GRANT — `*` 금지).
// ② 끼워 받기가 실패하면 `*` 로 한 번 더 받아 목록이 죽지 않는다.
// ③ rowToPost: 키 없음 = 모름(undefined) · null/[] = 스팟 글 아님 · 객체/배열 첫 행 = 스팟.
// 실행: npx vitest run src/api/community.spotEmbed.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const state = { selects: [] as string[], failEmbed: false, rows: [] as Record<string, unknown>[] };

vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    from: () => {
      let sel = '';
      const done = () => Promise.resolve(state.failEmbed && sel.includes('post_spots')
        ? { data: null, error: { message: 'Could not find a relationship' } }
        : { data: state.rows, error: null });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = {
        select: (s: string) => { sel = s; state.selects.push(s); return q; },
        eq: () => q, gt: () => q, not: () => q, or: () => q, order: () => q, in: () => q,
        limit: () => done(),
        maybeSingle: () => done().then((r) => ({ ...r, data: r.data ? (r.data as unknown[])[0] ?? null : null })),
      };
      return q;
    },
  },
}));

const { getPosts, searchPosts, getPostById, rowToPost } = await import('./community');

const UUID = '0000000b-0000-4000-8000-00000000000b';
const base = { id: UUID, user_id: 'u', user_name: 'w', user_role: 'user', content: 'c', created_at: '2026-10-01T00:00:00Z', like_count: 0, comment_count: 0 };
const EMBED = 'post_spots(spot, reveal_villain, reveal_result)';

beforeEach(() => { state.selects = []; state.failEmbed = false; state.rows = [base]; });

describe('게시판 목록 — 스팟 끼워 받기', () => {
  it('getPosts·searchPosts·getPostById 가 같은 요청에 공개 열 3개만 끼워 받는다', async () => {
    await getPosts();
    await searchPosts({});
    await getPostById(UUID);
    const postSelects = state.selects.filter((s) => s !== 'post_id');   // post_likes 조회 제외
    expect(postSelects.length).toBeGreaterThanOrEqual(5);
    for (const s of postSelects) expect(s).toBe(`*, ${EMBED}`);
  });

  it('끼워 받기가 실패하면 * 로 다시 받아 목록은 산다(미리보기만 빠진다)', async () => {
    state.failEmbed = true;
    const posts = await getPosts();
    expect(posts.map((p) => p.id)).toEqual([UUID]);
    expect(posts[0].spotEmbed).toBeUndefined();
    expect(state.selects).toContain('*');
  });

  it('rowToPost — 키 없음=모름 · null/빈 배열=스팟 아님 · 객체/배열=스팟 행', () => {
    const spotRow = { spot: { v: 3 }, reveal_villain: false, reveal_result: false };
    expect(rowToPost(base).spotEmbed).toBeUndefined();
    expect(rowToPost({ ...base, post_spots: null }).spotEmbed).toBeNull();
    expect(rowToPost({ ...base, post_spots: [] }).spotEmbed).toBeNull();
    expect(rowToPost({ ...base, post_spots: spotRow }).spotEmbed).toBe(spotRow);
    expect(rowToPost({ ...base, post_spots: [spotRow] }).spotEmbed).toBe(spotRow);
  });
});
