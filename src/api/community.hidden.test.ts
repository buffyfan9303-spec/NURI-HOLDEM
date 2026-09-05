// 숨김(blinded) 글 열람 판정 — 서버 RLS(20260905m posts_select: blinded=false or 본인 or admin)와
// 클라 PostDetailModal 이 같은 식을 쓰는지 고정한다. 갈리면 '서버는 막았는데 캐시된 글이 열리는' 구멍이 된다.
import { describe, it, expect } from 'vitest';
import { isPostHidden } from './community';

const post = { blinded: true, userId: 'author' };

describe('isPostHidden — blinded 글은 작성자·운영자만 본다', () => {
  it('비로그인·타인은 숨김, 작성자·운영자는 열람', () => {
    expect(isPostHidden(post, null)).toBe(true);
    expect(isPostHidden(post, undefined)).toBe(true);
    expect(isPostHidden(post, { id: 'other', role: 'user' })).toBe(true);
    expect(isPostHidden(post, { id: 'other', role: 'venue_owner' })).toBe(true);
    expect(isPostHidden(post, { id: 'author', role: 'user' })).toBe(false);
    expect(isPostHidden(post, { id: 'other', role: 'admin' })).toBe(false);
  });
  it('blinded 가 아니면(미정의 포함) 누구에게도 숨기지 않는다', () => {
    expect(isPostHidden({ blinded: false, userId: 'author' }, null)).toBe(false);
    expect(isPostHidden({ userId: 'author' }, { id: 'other', role: 'user' })).toBe(false);
  });
});
