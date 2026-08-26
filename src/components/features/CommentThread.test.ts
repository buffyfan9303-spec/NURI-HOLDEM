// CommentThread 읽기시점 재그룹(검증 #05) 단위 테스트
// 버그: 대댓글의 replies 를 하드코딩 빈 배열로 렌더 → 3레벨 이상 댓글 화면 유실.
// 수정: groupThreads 가 루트 밑으로 전체 하위 트리를 평탄 수집(4레벨+ 흡수)하고,
//       루트 직속이 아닌 답글엔 원부모 닉(mentionOf='@원부모닉' 프리픽스 재료)을 붙인다.
import { describe, it, expect } from 'vitest';
import { groupThreads } from './CommentThread';
import type { Comment } from '../../api/community';

const c = (id: string, parentId: string | undefined, userName: string): Comment => ({
  id,
  parentId,
  userId: `u-${id}`,
  userName,
  userRole: 'user',
  isOwner: false,
  content: `내용 ${id}`,
  createdAt: '2026-08-01T00:00:00.000Z',
});

describe('groupThreads — 3레벨+ 대댓글 유실 0', () => {
  // 픽스처: 루트1 아래 4레벨 체인 + 루트2 아래 1레벨
  //   r1 ← a(2레벨) ← b(3레벨) ← d(4레벨)
  //   r2 ← e(2레벨)
  const fixture: Comment[] = [
    c('r1', undefined, '철수'),
    c('a', 'r1', '영희'),
    c('b', 'a', '민수'),
    c('d', 'b', '지연'),
    c('r2', undefined, '동혁'),
    c('e', 'r2', '수진'),
  ];

  it('3레벨+ 포함 전체 댓글이 렌더 트리에 남는다(유실 0)', () => {
    const threads = groupThreads(fixture);
    const renderedIds = threads.flatMap((t) => [t.root.id, ...t.replies.map((r) => r.comment.id)]);
    expect(renderedIds).toHaveLength(fixture.length); // 유실 0
    expect(new Set(renderedIds)).toEqual(new Set(fixture.map((x) => x.id)));
  });

  it('루트 밑으로 하위 트리를 DFS 순서로 평탄 수집한다', () => {
    const threads = groupThreads(fixture);
    const t1 = threads.find((t) => t.root.id === 'r1')!;
    expect(t1.replies.map((r) => r.comment.id)).toEqual(['a', 'b', 'd']);
    const t2 = threads.find((t) => t.root.id === 'r2')!;
    expect(t2.replies.map((r) => r.comment.id)).toEqual(['e']);
  });

  it("3레벨+ 답글에만 '@원부모닉' 표기(mentionOf)가 붙는다", () => {
    const t1 = groupThreads(fixture).find((t) => t.root.id === 'r1')!;
    const byId = Object.fromEntries(t1.replies.map((r) => [r.comment.id, r.mentionOf]));
    expect(byId['a']).toBeUndefined();  // 루트 직속 — 문맥이 바로 위라 생략
    expect(byId['b']).toBe('영희');     // 3레벨 — 원부모 a(영희)
    expect(byId['d']).toBe('민수');     // 4레벨 — 원부모 b(민수)
  });

  it('부모가 유실된 고아 답글은 루트로 승격되어 화면에서 사라지지 않는다', () => {
    const withOrphan = [...fixture, c('x', 'ghost', '고아')];
    const threads = groupThreads(withOrphan);
    const renderedIds = threads.flatMap((t) => [t.root.id, ...t.replies.map((r) => r.comment.id)]);
    expect(renderedIds).toContain('x');
    expect(threads.some((t) => t.root.id === 'x')).toBe(true);
  });
});
