// 찜 낙관적 토글 계산 고정 — '하트는 채워졌는데 서버엔 없다'를 만든 결함(2026-07)의 재발 방지.
// 서버 왕복 전 뒤집는 값과 실패 시 되돌릴 값이 정확히 맞물려야 하고,
// 음수 하한은 서버 RPC 의 greatest(0, ..) 와 같은 규칙이어야 화면과 DB 가 갈라지지 않는다.
import { describe, it, expect } from 'vitest';
import { nextLikeState } from './marketplace';

describe('nextLikeState · 장터 찜 낙관적 토글', () => {
  it('찜 안 한 상태에서 누르면 liked=true, 카운트 +1', () => {
    expect(nextLikeState({ liked: false, likeCount: 3 })).toEqual({ liked: true, likeCount: 4 });
  });

  it('찜한 상태에서 누르면 liked=false, 카운트 -1', () => {
    expect(nextLikeState({ liked: true, likeCount: 3 })).toEqual({ liked: false, likeCount: 2 });
  });

  it('카운트 0 에서 취소를 눌러도 음수로 내려가지 않는다(서버 greatest(0,..) 와 동일)', () => {
    expect(nextLikeState({ liked: true, likeCount: 0 })).toEqual({ liked: false, likeCount: 0 });
  });

  it('🔴 두 번 누르면 원상복구. 실패 시 되돌리기가 항상 성립한다', () => {
    const start = { liked: false, likeCount: 7 };
    expect(nextLikeState(nextLikeState(start))).toEqual(start);
  });
});
