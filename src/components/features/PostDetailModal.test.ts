// N04(2026-09-12) 재현·수정 검증 — 댓글 저장(handleSubmitComment)이 addComment(...).catch(...)
// 로 fire-and-forget 호출됐다. 실패해도 원문이 이미 컴포넌트 밖으로 넘어가 사라졌고,
// 저장 중 다른 글로 이동하면 늦게 온 성공이 새 글에 붙는 문제도 있었다.
// submitPostComment 는 그 판정 로직을 React 밖으로 뽑은 순수 함수 — 렌더러 없이(vitest
// environment: node) 여기서 직접 검증한다.
import { describe, it, expect } from 'vitest';
import { submitPostComment, applyCommentEvent } from './PostDetailModal';
import type { Comment } from '../../api/community';
import type { UserRole } from '../../api/auth';

const user: { id: string; name: string; role: UserRole } = { id: 'u1', name: '철수', role: 'user' };

const fakeSaved: Comment = {
  id: 'c1', parentId: undefined, userId: user.id, userName: user.name,
  userRole: 'user', isOwner: false, content: '저장됨', createdAt: '2026-09-12T00:00:00.000Z',
};

describe('submitPostComment · N04 저장 계약', () => {
  it('성공하면 onSaved 가 호출되고 onError 는 호출되지 않는다', async () => {
    let saved: Comment | null = null;
    let errored = false;
    await submitPostComment('안녕하세요', {
      postId: 'p1', user,
      addComment: async () => fakeSaved,
      getCurrentPostId: () => 'p1',
      onSaved: (s) => { saved = s; },
      onError: () => { errored = true; },
    });
    expect(saved).toEqual(fakeSaved);
    expect(errored).toBe(false);
  });

  it('실패하면 onError 로 알리고 다시 throw 한다(호출부가 입력을 지우지 않게)', async () => {
    let errorMsg: string | null = null;
    await expect(submitPostComment('제재 중에 쓴 글', {
      postId: 'p1', user,
      addComment: async () => { throw new Error('P0001: 제재 중입니다'); },
      getCurrentPostId: () => 'p1',
      onSaved: () => { throw new Error('onSaved 는 호출되면 안 된다'); },
      onError: (msg) => { errorMsg = msg; },
    })).rejects.toThrow('P0001');
    expect(errorMsg).toBe('P0001: 제재 중입니다');
  });

  it('④ 저장 중 다른 글로 이동했으면 늦게 온 성공을 그 글에 붙이지 않는다', async () => {
    let saved: Comment | null = null;
    // 응답이 도착한 시점엔 이미 p2 글이 열려 있다(사용자가 저장 중에 다른 글로 옮김)
    await submitPostComment('p1에 쓴 댓글', {
      postId: 'p1', user,
      addComment: async () => fakeSaved,
      getCurrentPostId: () => 'p2', // 응답 시점의 "현재 글"이 p1이 아니다
      onSaved: (s) => { saved = s; },
      onError: () => {},
    });
    expect(saved).toBeNull(); // p2에 붙지 않았다
  });

  it('저장 중 다시 같은 글로 돌아와 있으면(이동 안 함) 정상 반영한다', async () => {
    let saved: Comment | null = null;
    await submitPostComment('p1에 쓴 댓글', {
      postId: 'p1', user,
      addComment: async () => fakeSaved,
      getCurrentPostId: () => 'p1',
      onSaved: (s) => { saved = s; },
      onError: () => {},
    });
    expect(saved).toEqual(fakeSaved);
  });
});

// N05(2026-09-12) 재현·수정 검증 — 열린 글 상세는 열 때만 getComments 로 조회됐고, 다른 사람이
// 같은 글에 새 댓글을 달거나 관리자가 수정·삭제해도 닫았다 다시 열기 전까지 반영되지 않았다.
// applyCommentEvent 는 subscribePostComments 이벤트를 기존 replies 에 병합하는 순수 함수 — 이게 계약이다.
describe('applyCommentEvent · N05 실시간 댓글 병합 계약', () => {
  const c2: Comment = { id: 'c2', userId: 'u2', userName: '영희', userRole: 'user', isOwner: false, content: '새 댓글', createdAt: '2026-09-12T00:01:00.000Z' };

  it('다른 사람의 새 댓글(insert)이 목록 앞에 붙는다', () => {
    const next = applyCommentEvent([fakeSaved], { type: 'insert', comment: c2 });
    expect(next.map((c) => c.id)).toEqual(['c2', 'c1']);
  });

  it('내가 방금 쓴 댓글의 에코(같은 id)는 중복으로 붙지 않는다', () => {
    const next = applyCommentEvent([fakeSaved], { type: 'insert', comment: fakeSaved });
    expect(next).toEqual([fakeSaved]); // 참조까지 그대로(불필요한 리렌더 방지)
  });

  it('아직 목록을 못 불러온 상태(null)에서도 insert 를 받으면 배열이 된다', () => {
    const next = applyCommentEvent(null, { type: 'insert', comment: c2 });
    expect(next).toEqual([c2]);
  });

  it('수정(update)은 같은 id 행만 바뀐다 — 나머지 순서·내용은 그대로', () => {
    const edited: Comment = { ...fakeSaved, content: '수정됨', edited: true };
    const next = applyCommentEvent([fakeSaved, c2], { type: 'update', comment: edited });
    expect(next).toEqual([edited, c2]);
  });

  it('삭제(delete)는 그 댓글과 그 댓글의 대댓글까지 함께 지운다', () => {
    const reply: Comment = { id: 'c3', parentId: 'c1', userId: 'u3', userName: '민수', userRole: 'user', isOwner: false, content: '대댓글', createdAt: '2026-09-12T00:02:00.000Z' };
    const next = applyCommentEvent([fakeSaved, c2, reply], { type: 'delete', id: 'c1' });
    expect(next.map((c) => c.id)).toEqual(['c2']);
  });
});
