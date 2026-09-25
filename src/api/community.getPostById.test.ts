// FULL-ERROR-SWEEP-B(2026-09-25) — ?post=·알림 링크의 글 id 는 URL 에서 온 남의 입력이다.
// uuid 꼴이 아니면 PostgREST 가 400(22P02) 을 돌려주던 것을 **요청 없이** null 로 끝낸다(호출부는 '찾을 수 없는 글' 안내).
// 양성 대조: uuid 꼴이면 종전대로 단건 조회가 나간다. 실행: npx vitest run src/api/community.getPostById.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const state = { rows: [] as Record<string, unknown>[], ops: [] as string[] };

vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    from: (table: string) => {
      state.ops.push(`from:${table}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = {
        select: () => q,
        eq: (col: string, val: unknown) => { state.ops.push(`eq:${col}=${String(val)}`); return q; },
        limit: () => Promise.resolve({ data: [], error: null }),
        maybeSingle: () => Promise.resolve({ data: state.rows[0] ?? null, error: null }),
      };
      return q;
    },
  },
}));

const { getPostById } = await import('./community');

const UUID = '0000000b-0000-4000-8000-00000000000b';
const row = {
  id: UUID, user_id: 'u', user_name: '작성자', user_role: 'user', user_color: '#888', user_avatar: null,
  content: '본문', created_at: '2026-09-01T00:00:00.000Z', like_count: 0, comment_count: 0, view_count: 0,
  category: 'free', title: null, images: [], cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
};

beforeEach(() => { state.rows = []; state.ops = []; });

describe('getPostById — id 형식 검증', () => {
  it('uuid 꼴이 아니면 요청 없이 null', async () => {
    for (const bad of ['not-a-uuid', '', 'n2', '0000000b-0000-4000-8000-00000000000'])
      expect(await getPostById(bad)).toBeNull();
    expect(state.ops).toEqual([]);
  });
  it('uuid 꼴이면 종전대로 단건 조회가 나간다(대소문자 무관)', async () => {
    state.rows = [row];
    const got = await getPostById(UUID.toUpperCase());
    expect(got?.id).toBe(UUID);
    expect(state.ops).toContain('from:community_posts');
    expect(state.ops).toContain(`eq:id=${UUID.toUpperCase()}`);
  });
});
