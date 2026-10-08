// 실행: npx vitest run src/lib/venueVisitRank.test.ts
// 음성 대조: visitCountRows 의 `viewerIsManager &&` 를 지우면 '일반 회원' 케이스가 실패한다.
import { describe, it, expect } from 'vitest';
import { visitCountRows } from './venueVisitRank';

const pc = [{ name: 'a', visits: 5 }, { name: 'b', visits: 3 }, { name: 'c', visits: 1 }];
const mine = [{ name: 'me', count: 3 }];

describe('visitCountRows — 출석왕 보드는 보는 사람과 무관하게 같다', () => {
  it('일반 회원: 자기 QR 한 줄이 아니라 장부 3명을 본다', () => {
    expect(visitCountRows(mine, pc, false).map((r) => r.name)).toEqual(['a', 'b', 'c']);
  });
  it('비로그인(QR 없음)과 일반 회원의 결과가 같다', () => {
    expect(visitCountRows(mine, pc, false)).toEqual(visitCountRows([], pc, false));
  });
  it('업주: QR 기록이 있으면 QR 전체 집계를 쓴다', () => {
    expect(visitCountRows([{ name: 'x', count: 2 }, { name: 'y', count: 9 }], pc, true).map((r) => r.name)).toEqual(['y', 'x']);
  });
  it('업주라도 QR 기록이 없으면 장부로 폴백한다', () => {
    expect(visitCountRows([], pc, true).map((r) => r.name)).toEqual(['a', 'b', 'c']);
  });
});
