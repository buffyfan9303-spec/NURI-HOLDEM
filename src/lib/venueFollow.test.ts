// 매장 팔로우 낙관 갱신 단위 테스트(F07)
// 버그 ①: 팔로우/해제 직후 버튼만 '팔로잉' 이 되고 '팔로워 N' 스탯은 그대로였다.
// 버그 ②: 늦게 도착한 초기 팔로우 목록 GET 이 방금 누른 낙관 토글을 덮어써
//          '팔로우 완료' 토스트 뒤 버튼이 '팔로우' 로 되돌아갔다.
import { describe, it, expect } from 'vitest';
import { followToggle, followMergeFetch, type FollowView } from './venueFollow';

const base: FollowView = { following: false, count: 12 };

describe('followToggle · 버튼과 팔로워 수가 함께 움직인다', () => {
  it('팔로우하면 +1', () => {
    expect(followToggle(base, true)).toEqual({ following: true, count: 13 });
  });

  it('해제하면 -1', () => {
    expect(followToggle({ following: true, count: 13 }, false)).toEqual({ following: false, count: 12 });
  });

  it('0 아래로 내려가지 않는다(서버 값이 이미 0인데 해제가 들어온 경우)', () => {
    expect(followToggle({ following: true, count: 0 }, false)).toEqual({ following: false, count: 0 });
  });

  it('원본을 변형하지 않는다 — 실패하면 그대로 원복해야 한다', () => {
    followToggle(base, true);
    expect(base).toEqual({ following: false, count: 12 });
  });
});

describe('followMergeFetch · 늦은 응답이 낙관 토글을 덮지 않는다', () => {
  it('요청 이후 토글이 없었으면 서버 값을 반영한다', () => {
    expect(followMergeFetch(base, 1, 1, true)).toEqual({ following: true, count: 12 });
  });

  it('같은 값이면 참조를 유지한다(불필요한 렌더 방지)', () => {
    expect(followMergeFetch(base, 1, 1, false)).toBe(base);
  });

  it('요청 이후 토글이 있었으면(seq 불일치) 응답을 버린다', () => {
    const optimistic = followToggle(base, true);            // 사용자가 '팔로우' 를 눌러 seq 1 → 2
    const late = followMergeFetch(optimistic, 1, 2, false); // 그 전에 나간 GET 이 '팔로우 아님' 으로 도착
    expect(late).toBe(optimistic);
    expect(late.following).toBe(true);
  });

  it('병합해도 팔로워 수는 건드리지 않는다 — GET 응답에 수가 없다', () => {
    const optimistic = followToggle(base, true);            // count 13
    expect(followMergeFetch(optimistic, 3, 3, false).count).toBe(13);
  });
});
