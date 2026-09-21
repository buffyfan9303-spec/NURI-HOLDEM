import { afterEach, expect, it, vi } from 'vitest';

const backend = vi.hoisted(() => ({ error: new Error('configured backend reached') }));
vi.mock('../lib/supabase', () => ({
  get IS_MOCK() {
    return !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY;
  },
  supabase: { from: () => { throw backend.error; } },
}));

afterEach(() => vi.unstubAllEnvs());

async function reads() {
  const [auth, community, market, schedules, mock] = await Promise.all([
    import('./auth'), import('./community'), import('./marketplace'), import('./schedules'), import('../mock/data'),
  ]);
  return [
    [() => auth.listAllUsers(), mock.MOCK_USERS],
    [() => community.getVenues(), mock.MOCK_VENUES],
    [() => community.getAllVenues(), mock.MOCK_VENUES],
    [() => community.getPosts(), mock.MOCK_COMMUNITY_POSTS],
    [() => community.getPostById(mock.MOCK_COMMUNITY_POSTS[0].id), mock.MOCK_COMMUNITY_POSTS[0]],
    [() => community.getComments({}), mock.MOCK_COMMENTS],
    [() => community.searchPosts({ limit: 0 }), { posts: [], nextCursor: null }],
    [() => market.getListings(), mock.MOCK_LISTINGS],
    [() => market.getNotices(), mock.MOCK_NOTICES],
    [() => schedules.getSchedules(), mock.MOCK_SCHEDULES],
    [() => schedules.getScheduleById(mock.MOCK_SCHEDULES[0].id), mock.MOCK_SCHEDULES[0]],
  ] as const;
}

it.each([
  ['', ''], ['', 'test-key'], ['https://example.supabase.co', ''],
])('URL=%s, key=%s: 설정 누락 시 모든 Mock 조회를 보존한다', async (url, key) => {
  vi.stubEnv('VITE_SUPABASE_URL', url);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', key);
  for (const [read, expected] of await reads()) await expect(read()).resolves.toEqual(expected);
});

it('설정이 있으면 Mock을 반환하지 않고 기존 서버 경로와 오류를 유지한다', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-key');
  for (const [read] of await reads()) await expect(read()).rejects.toBe(backend.error);
});
