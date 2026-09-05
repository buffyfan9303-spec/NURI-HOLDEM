// '방문' 단위 = 매장별 KST 날짜 distinct (점검 #8, 2026-09-05) — 서버 my_visited_venues(20260905l) 와 같은 규칙.
// 어긋나면 프로필 '방문 N회'·업적 뱃지 임계(단골 입문 5회)·대시보드 매장별 방문이 화면마다 다른 숫자를 보인다.
// 실행: npx vitest run src/api/checkins.visits.test.ts
import { describe, it, expect } from 'vitest';
import { countVisitDays } from './checkins';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

describe('countVisitDays — 매장별 KST 날짜 distinct', () => {
  it('빈 목록은 0', () => {
    expect(countVisitDays([])).toBe(0);
  });
  it('같은 매장 같은 KST 날짜 재스캔(4시간 후) = 1방문', () => {
    expect(countVisitDays([
      { venue_id: A, created_at: '2026-09-05T03:00:00+00:00' }, // 12:00 KST
      { venue_id: A, created_at: '2026-09-05T08:30:00+00:00' }, // 17:30 KST
    ])).toBe(1);
  });
  it('UTC 로는 같은 날이라도 KST 자정을 넘기면 2방문 (14:59Z = 23:59 KST · 15:00Z = 00:00 KST 다음날)', () => {
    expect(countVisitDays([
      { venue_id: A, created_at: '2026-09-05T14:59:00Z' },
      { venue_id: A, created_at: '2026-09-05T15:00:00Z' },
    ])).toBe(2);
  });
  it('같은 날 다른 매장은 각각 1방문 → 합계 = my_visited_venues 의 visits 합', () => {
    expect(countVisitDays([
      { venue_id: A, created_at: '2026-09-05T03:00:00Z' },
      { venue_id: B, created_at: '2026-09-05T05:00:00Z' },
      { venue_id: B, created_at: '2026-09-05T09:00:00Z' },
    ])).toBe(2);
  });
});
