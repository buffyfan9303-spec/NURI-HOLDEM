// 7곳 복붙을 한 벌로 합치면서 생긴 회귀 위험을 여기서 잡는다.
// 특히 '5초 전이 0분 전으로 뜨던' 신고큐·회원관리 버그가 되살아나는지.
import { describe, it, expect } from 'vitest';
import { relativeTime } from './relativeTime';

const ago = (sec: number) => new Date(Date.now() - sec * 1000).toISOString();

describe('relativeTime', () => {
  it("60초 미만은 '방금 전' — 신고큐·회원관리가 '0분 전'으로 떨어지던 자리", () => {
    expect(relativeTime(ago(0))).toBe('방금 전');
    expect(relativeTime(ago(5))).toBe('방금 전');
    expect(relativeTime(ago(59))).toBe('방금 전');
  });

  it('분·시간·일 경계', () => {
    expect(relativeTime(ago(60))).toBe('1분 전');
    expect(relativeTime(ago(3599))).toBe('59분 전');
    expect(relativeTime(ago(3600))).toBe('1시간 전');
    expect(relativeTime(ago(86399))).toBe('23시간 전');
    expect(relativeTime(ago(86400))).toBe('1일 전');
  });

  it('dateAfterDays 를 주면 그 날부터 M.D 로 접는다(공지 목록)', () => {
    expect(relativeTime(ago(86400 * 6), { dateAfterDays: 7 })).toBe('6일 전');
    const old = ago(86400 * 7);
    const d = new Date(old);
    expect(relativeTime(old, { dateAfterDays: 7 })).toBe(`${d.getMonth() + 1}.${d.getDate()}`);
  });

  it('옵션이 없으면 며칠이 지나도 일수로 센다(종전 동작 유지)', () => {
    expect(relativeTime(ago(86400 * 400))).toBe('400일 전');
  });
});
