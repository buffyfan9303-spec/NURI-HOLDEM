// 일정 커밋 게이트 — '구값이 신값을 덮는다'와 '지운 포스터가 되살아난다'를 못 박는다.
//
// 이 두 실패는 화면만 틀리는 게 아니다: 두 커밋 지점 모두 writeSnap('schedules') 로
// 다음 방문의 첫 화면(캐시 퍼스트)까지 같은 값으로 쓴다 — 한 번 역행하면 새로고침해도 구값이다.
import { describe, it, expect } from 'vitest';
import { commitSchedules } from './scheduleCommit';

const row = (id: string) => ({ id, title: id });

describe('최신 요청 가드. 늦게 온 구값은 커밋하지 않는다', () => {
  it('요청 번호가 최신이면 그대로 커밋한다', () => {
    const rows = [row('a')];
    expect(commitSchedules(rows, 3, 3, [])).toBe(rows); // 참조까지 그대로(memo 보존)
  });

  it('🔴 A(구값) 지연 → B(신값) 커밋 → A 도착: A 는 버려진다', () => {
    const older = [row('a')];
    // B 가 이미 나갔으므로 latest 는 2 — A(1)의 응답은 화면에도 스냅샷에도 오르지 않는다
    expect(commitSchedules(older, 1, 2, [])).toBeNull();
  });

  it('요청 번호가 앞선 값(경합으로 ref 가 되감긴 상황)도 커밋하지 않는다', () => {
    expect(commitSchedules([row('a')], 5, 4, [])).toBeNull();
  });

  it('늦게 온 응답은 삭제 필터보다 먼저 걸린다(빈 배열이 아니라 null)', () => {
    expect(commitSchedules([row('a')], 1, 2, ['a'])).toBeNull();
  });
});

describe('삭제 유예 필터. 5초 안의 재조회가 지운 포스터를 되살리지 않는다', () => {
  it('🔴 유예 중인 id 는 서버가 아직 돌려줘도 목록에서 뺀다', () => {
    const next = commitSchedules([row('a'), row('b'), row('c')], 1, 1, ['b']);
    expect(next?.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('여러 건을 연속으로 지운 경우도 전부 뺀다', () => {
    const next = commitSchedules([row('a'), row('b'), row('c')], 1, 1, ['a', 'c']);
    expect(next?.map((r) => r.id)).toEqual(['b']);
  });

  it('되돌리기로 큐가 비면(=유예 id 없음) 다음 재조회에서 되살아난다', () => {
    const rows = [row('a'), row('b')];
    expect(commitSchedules(rows, 1, 1, [])).toBe(rows);
  });

  it('이미 서버에서 사라진 id 가 유예 목록에 남아 있어도 터지지 않는다', () => {
    const next = commitSchedules([row('a')], 1, 1, ['zzz']);
    expect(next?.map((r) => r.id)).toEqual(['a']);
  });

  it('Set 이든 배열이든 같은 결과(호출부가 큐의 keys() 를 그대로 넘긴다)', () => {
    const rows = [row('a'), row('b')];
    expect(commitSchedules(rows, 1, 1, new Set(['a']))?.map((r) => r.id)).toEqual(['b']);
  });
});
