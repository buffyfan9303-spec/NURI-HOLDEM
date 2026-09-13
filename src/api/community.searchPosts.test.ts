// N06(2026-09-12) 재현·수정 검증 — 게시판 검색·인기 정렬·더보기가 App 이 준 최신 50건(+고정·끌올
// 예외)에 갇혀 있었다. 61번째로 오래된 글은 검색해도 안 나왔다(로컬 배열 필터라서). searchPosts 는
// 서버 커서 계약 — id 를 항상 타이브레이커로 넣어 같은 초에 만들어진 글도 페이지 경계에서
// 빠지거나 중복되지 않게 한다("stable cursor"). 실행: npx vitest run src/api/community.searchPosts.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const state = { rows: [] as Record<string, unknown>[], error: null as unknown, ops: [] as string[] };

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    from: (table: string) => {
      state.ops.push(`from:${table}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = {
        select: () => { state.ops.push('select'); return q; },
        eq: (col: string, val: unknown) => { state.ops.push(`eq:${col}=${String(val)}`); return q; },
        or: (expr: string) => { state.ops.push(`or:${expr}`); return q; },
        order: (col: string, opts?: unknown) => { state.ops.push(`order:${col}:${JSON.stringify(opts)}`); return q; },
        limit: (n: number) => { state.ops.push(`limit:${n}`); return Promise.resolve({ data: state.rows, error: state.error }); },
      };
      return q;
    },
  },
}));

const { searchPosts } = await import('./community');

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, user_id: 'u-' + id, user_name: '작성자' + id, user_role: 'user', user_color: '#888', user_avatar: null,
  content: '본문 ' + id, created_at: '2026-09-01T00:00:00.000Z',
  like_count: 0, comment_count: 0, view_count: 0,
  category: 'free', title: null, images: [],
  cheer_count: 0, bumped_until: null, bump_count: 0, pinned_at: null,
  ...over,
});

beforeEach(() => { state.rows = []; state.error = null; state.ops = []; });

describe('searchPosts — N06 서버 커서 계약', () => {
  it('limit 만큼 꽉 차면 마지막 행 기준으로 nextCursor 를 돌려준다(더 있을 수 있다)', async () => {
    state.rows = [row('a'), row('b', { created_at: '2026-09-01T00:00:01.000Z' })];
    const r = await searchPosts({ limit: 2 });
    expect(r.nextCursor).toEqual({ createdAt: '2026-09-01T00:00:01.000Z', id: 'b', likeCount: 0 });
  });

  it('limit 보다 적게 오면 더 없다는 뜻이라 nextCursor 가 null 이다', async () => {
    state.rows = [row('a')];
    const r = await searchPosts({ limit: 5 });
    expect(r.nextCursor).toBeNull();
  });

  it('검색어에 콤마·괄호·따옴표가 있어도 or() 필터 문법을 깨지 않는다(값 전체를 따옴표로 감싼다)', async () => {
    await searchPosts({ q: 'a,b(c)"d' });
    const orOp = state.ops.find((o) => o.startsWith('or:') && o.includes('content.ilike'))!;
    expect(orOp).toBeDefined();
    expect(orOp).toContain('"%a,b(c)\\"d%"');
  });

  it('카테고리 필터는 eq 로 나간다(전체가 아닐 때만)', async () => {
    await searchPosts({ category: 'hand' });
    expect(state.ops).toContain('eq:category=hand');
    state.ops = [];
    await searchPosts({ category: 'all' });
    expect(state.ops.some((o) => o.startsWith('eq:category'))).toBe(false);
  });

  it('61번째 글도 찾도록 커서를 넘기면 최신순 축(created_at·id)으로 그 다음만 요청한다', async () => {
    await searchPosts({ cursor: { createdAt: '2026-09-01T00:00:00.000Z', id: 'x', likeCount: 3 } });
    expect(state.ops.some((o) => o.startsWith('or:created_at.lt'))).toBe(true);
    expect(state.ops.some((o) => o.includes('order:created_at'))).toBe(true);
  });

  it('인기 정렬은 like_count 축 커서를 쓴다 — 최신순 커서와 섞이지 않는다', async () => {
    await searchPosts({ order: 'popular', cursor: { createdAt: '2026-09-01T00:00:00.000Z', id: 'x', likeCount: 3 } });
    expect(state.ops.some((o) => o.startsWith('or:like_count.lt'))).toBe(true);
    expect(state.ops.some((o) => o.includes('order:like_count'))).toBe(true);
    expect(state.ops.some((o) => o.startsWith('or:created_at.lt'))).toBe(false);
  });

  it('커서가 없으면(첫 페이지) 범위 or() 를 걸지 않는다', async () => {
    await searchPosts({});
    expect(state.ops.some((o) => o.startsWith('or:created_at.lt') || o.startsWith('or:like_count.lt'))).toBe(false);
  });
});
