// 커뮤니티 광고 = 게시글 승격 — API 계약 (2026-09-11 오너 지시)
//
// 잠그는 것
//  ① 광고를 **한 번의 RPC** 로 가져온다 — 광고마다 게시글을 따로 부르는 N+1 을 만들지 않는다.
//  ② '조회 실패' 와 '광고 0개' 를 구분해서 돌려준다. 종전 구현은 `.catch(() => {})` 로 둘을 같게 만들어,
//     조회가 깨져도 화면은 '광고 없음' 처럼 보였다(운영자가 게재 사실을 확인할 방법이 없었다).
//  ③ 게시글 매핑이 일반 피드와 **같은 함수**(community.rowToPost)를 탄다 — 매핑이 두 벌이면
//     한쪽만 고쳐져 광고 카드만 필드가 비는 사고가 난다.
// 실행: npx vitest run src/api/ads.promoted.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** 이번 호출에서 실제로 나간 요청들 — 몇 번, 어디로 나갔는가 */
const calls: { kind: 'rpc' | 'from'; name: string }[] = [];
let rpcResult: { data: unknown; error: unknown } = { data: [], error: null };

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    rpc: (name: string) => {
      calls.push({ kind: 'rpc', name });
      return Promise.resolve(rpcResult);
    },
    from: (name: string) => {
      calls.push({ kind: 'from', name });
      const q = {
        select: () => q,
        order: () => Promise.resolve({ data: [], error: null }),
        eq: () => q,
        upsert: () => Promise.resolve({ error: null }),
        update: () => q,
      };
      return q;
    },
  },
}));

const { getActivePromotedPosts } = await import('./ads');

/** community_ads_public 이 돌려주는 한 행 = 슬롯 + 게시글 컬럼(테이블과 같은 이름) */
const row = (slot: number, id: string, over: Record<string, unknown> = {}) => ({
  slot,
  id, user_id: 'u-' + id, user_name: '작성자' + id, user_role: 'user', user_color: '#888', user_avatar: null,
  content: '본문 ' + id, created_at: '2026-09-10T00:00:00Z',
  like_count: 3, comment_count: 2, view_count: 11,
  category: 'free', title: '제목 ' + id, images: [],
  cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
  ...over,
});

beforeEach(() => { calls.length = 0; rpcResult = { data: [], error: null }; });

describe('getActivePromotedPosts — 광고는 승격된 게시글이다', () => {
  it('요청은 community_ads_public RPC **한 번**뿐이다 (광고마다 글을 따로 부르지 않는다)', async () => {
    rpcResult = { data: [row(1, 'p1'), row(3, 'p2'), row(5, 'p3')], error: null };
    const { ads } = await getActivePromotedPosts();
    expect(ads).toHaveLength(3);
    expect(calls).toEqual([{ kind: 'rpc', name: 'community_ads_public' }]);
    // 게시글 단건 조회(from('community_posts'))가 단 한 번도 나가지 않아야 한다 = N+1 없음
    expect(calls.filter((c) => c.kind === 'from')).toEqual([]);
  });

  it('게시글 필드가 일반 피드와 같은 모양으로 매핑된다', async () => {
    rpcResult = { data: [row(2, 'abc', { like_count: 7, view_count: 42, title: '광고할 글' })], error: null };
    const { ads } = await getActivePromotedPosts();
    expect(ads[0].slot).toBe(2);
    expect(ads[0].post).toMatchObject({
      id: 'abc', userId: 'u-abc', userName: '작성자abc',
      title: '광고할 글', likeCount: 7, viewCount: 42, commentCount: 2,
      blinded: false,
    });
  });

  it("'광고 0개' 는 error 가 null 이다 — 실패로 읽히면 안 된다", async () => {
    rpcResult = { data: [], error: null };
    const r = await getActivePromotedPosts();
    expect(r.ads).toEqual([]);
    expect(r.error).toBeNull();
  });

  it("'조회 실패' 는 error 를 그대로 돌려준다 — 0개로 위장하지 않는다", async () => {
    const boom = { message: 'permission denied' };
    rpcResult = { data: null, error: boom };
    const r = await getActivePromotedPosts();
    expect(r.ads).toEqual([]);
    expect(r.error).toBe(boom);   // 화면이 '광고 없음' 과 구분할 수 있어야 한다
  });

  it('서버가 준 슬롯 순서를 그대로 쓴다 (클라이언트가 다시 정렬하지 않는다)', async () => {
    rpcResult = { data: [row(1, 'a'), row(2, 'b'), row(4, 'c')], error: null };
    const { ads } = await getActivePromotedPosts();
    expect(ads.map((a) => a.slot)).toEqual([1, 2, 4]);
  });
});
