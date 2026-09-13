// UI-04 이전/다음 글 — 이웃 계약의 동작 검사 (2026-09-13). 실행: npx vitest run src/lib/postNav.test.ts
// 음성 대조: postNav.ts 의 `if (skipped > maxSkip) return { post: null, edge: 'skipped'` 를 지우면 '상한' 케이스가,
//   `if (ctx.order !== 'new') return … 'loaded-end'` 를 지우면 '인기 정렬' 케이스가, appendPage 의 `cursor: page.nextCursor` 를 빼면 '라이브락' 케이스가 실패한다.
import { describe, it, expect } from 'vitest';
import { neighborsOf, appendPage, dropFromCtx, canExtend, type PostNavCtx } from './postNav';
import type { CommunityPost } from '../api/community';

const P = (id: string, blinded = false): CommunityPost => ({ id, blinded, userId: 'u', userName: 'n', content: id, createdAt: '2026-09-13T00:00:00Z', likeCount: 0, commentCount: 0 } as unknown as CommunityPost);
const ctx = (ids: string[], over: Partial<PostNavCtx> = {}): PostNavCtx => ({ key: 'k', q: '', category: 'all', order: 'new', items: ids.map((i) => P(i)), cursor: null, done: true, ...over });
const hid = (p: CommunityPost) => !!p.blinded;

describe('neighborsOf — 열었던 목록의 화면 순서', () => {
  it('🔴 가운데 글: 이전 = 바로 앞, 다음 = 바로 뒤(App.posts 의 시간순이 아니라 스냅샷 순서)', () => {
    const n = neighborsOf(ctx(['c', 'a', 'b']), 'a', hid);
    expect(n.index).toBe(1);
    expect(n.prev.post?.id).toBe('c'); expect(n.next.post?.id).toBe('b');
  });
  it('🔴 첫 글은 prev 가 first, 마지막 글(서버 done)은 next 가 end — 불러온 끝은 done 이 아니면 more', () => {
    expect(neighborsOf(ctx(['a', 'b']), 'a', hid).prev.edge).toBe('first');
    expect(neighborsOf(ctx(['a', 'b'], { done: true }), 'b', hid).next.edge).toBe('end');
    expect(neighborsOf(ctx(['a', 'b'], { done: false, cursor: { createdAt: 'x', id: 'b' } }), 'b', hid).next.edge).toBe('more');
  });
  it('🔴 인기 정렬은 커서가 화면 순서를 표현하지 못한다 — 불러온 끝에서 loaded-end(이동 비활성 + 목록으로)', () => {
    const c = ctx(['a', 'b'], { order: 'popular', done: false, cursor: { createdAt: 'x', id: 'b', likeCount: 3 } });
    expect(neighborsOf(c, 'b', hid).next.edge).toBe('loaded-end');
    expect(canExtend(c)).toBe(false);
    expect(canExtend(ctx(['a'], { done: false }))).toBe(true);
  });
  it('🔴 숨김 글은 건너뛰고, 연속 건너뛰기가 상한(5)을 넘으면 skipped 로 막힌다', () => {
    const items = ['a', 'h1', 'b'];
    const n = neighborsOf({ ...ctx(items), items: [P('a'), P('h1', true), P('b')] }, 'a', hid);
    expect(n.next.post?.id).toBe('b'); expect(n.next.skipped).toBe(1);
    const many = { ...ctx([]), items: [P('a'), ...Array.from({ length: 6 }, (_, i) => P(`h${i}`, true)), P('z')] };
    const m = neighborsOf(many, 'a', hid);
    expect(m.next.post).toBeNull(); expect(m.next.edge).toBe('skipped'); expect(m.next.skipped).toBe(6);
    const five = { ...ctx([]), items: [P('a'), ...Array.from({ length: 5 }, (_, i) => P(`h${i}`, true)), P('z')] };
    expect(neighborsOf(five, 'a', hid).next.post?.id).toBe('z');
  });
  it('🔴 맥락이 없거나 현재 글이 목록에 없으면(광고 승격 글·딥링크) 양쪽 no-context', () => {
    expect(neighborsOf(null, 'a', hid).prev.edge).toBe('no-context');
    const n = neighborsOf(ctx(['a', 'b']), 'ad', hid);
    expect(n.index).toBe(-1); expect(n.next.edge).toBe('no-context'); expect(n.prev.post).toBeNull();
  });
});

describe('appendPage / dropFromCtx', () => {
  it('🔴 라이브락 방지: 다음 페이지를 이으면 cursor 가 전진하고 items 가 늘며, 커서가 없으면 done', () => {
    const c = ctx(['a', 'b'], { done: false, cursor: { createdAt: 'x', id: 'b' } });
    const c2 = appendPage(c, { posts: [P('b'), P('c'), P('d')], nextCursor: { createdAt: 'y', id: 'd' } });
    expect(c2.items.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(c2.cursor).toEqual({ createdAt: 'y', id: 'd' }); expect(c2.done).toBe(false);
    expect(neighborsOf(c2, 'b', hid).next.post?.id).toBe('c');
    const c3 = appendPage(c2, { posts: [], nextCursor: null });
    expect(c3.done).toBe(true);
    expect(neighborsOf(c3, 'd', hid).next.edge).toBe('end');
  });
  it('남의 글 삭제는 스냅샷에서 그 글만 빼고 맥락은 남긴다', () => {
    const c = ctx(['a', 'b', 'c']);
    const d = dropFromCtx(c, 'b')!;
    expect(d.items.map((p) => p.id)).toEqual(['a', 'c']);
    expect(neighborsOf(d, 'a', hid).next.post?.id).toBe('c');
    expect(dropFromCtx(c, 'zzz')).toBe(c);
    expect(dropFromCtx(null, 'a')).toBeNull();
  });
});
