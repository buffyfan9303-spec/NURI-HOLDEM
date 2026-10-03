// recheck1 R1(2026-10-03) — 직원 클락 '장부 연동' 목록 판정. 서버(20261003h lb_select · 20261003i 클락 트리거)와 같은 경계를
//   화면이 1시간 당겨(17시간) 따른다. 음성 대조: 마감 창 조건을 지우면(항상 true) '오래된 마감' 단언이 빨개진다.
import { describe, it, expect } from 'vitest';
import { staffSeesSession } from './ledger';

const NOW = Date.parse('2026-10-03T09:00:00Z');   // KST 18:00
const T = '2026-10-03', BIZ = '2026-10-03';
const ago = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe('staffSeesSession', () => {
  it('미마감·오늘·영업일 이후는 보인다', () => {
    expect(staffSeesSession({ sessionDate: '2026-09-20', closed: false }, BIZ, T, NOW)).toBe(true);
    expect(staffSeesSession({ sessionDate: T, closed: true, closedAt: ago(30) }, BIZ, T, NOW)).toBe(true);
    expect(staffSeesSession({ sessionDate: '2026-10-02', closed: true, closedAt: ago(40) }, '2026-10-02', T, NOW)).toBe(true);
  });
  it('어제 게임 · 마감 4시간 전 = 보인다(자정 넘긴 마무리)', () => {
    expect(staffSeesSession({ sessionDate: '2026-10-02', closed: true, closedAt: ago(4) }, BIZ, T, NOW)).toBe(true);
  });
  it('오래된 마감은 안 보인다 — 17시간 경계·closed_at 없음·날짜 하한', () => {
    expect(staffSeesSession({ sessionDate: '2026-10-02', closed: true, closedAt: ago(17.5) }, BIZ, T, NOW)).toBe(false);
    expect(staffSeesSession({ sessionDate: '2026-10-02', closed: true, closedAt: null }, BIZ, T, NOW)).toBe(false);
    expect(staffSeesSession({ sessionDate: '2026-09-29', closed: true, closedAt: ago(1) }, BIZ, T, NOW)).toBe(false);
  });
});
