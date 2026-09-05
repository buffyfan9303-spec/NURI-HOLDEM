// 체크인 반환 정규화 · 내 바인 요청 매핑 — 모바일 점검 2026-09-05 #1 · #22 의 클라 쪽 계약을 값으로 못 박는다.
//
// 왜 필요한가: check_in 은 20260905k 부터 jsonb {name, points, streak} 를 돌려주지만 배포 순서상 클라가
//   먼저 나간다 — 구형 서버의 문자열도 옛 문구와 같은 {points: 3} 으로 읽혀야 토스트가 깨지지 않는다.
//   바인 요청은 get_my_buyin_requests_current(영업일 기준) 의 평평한 행(venue_name)으로 바뀌었다 —
//   venues(name) 조인 시절 폴백('매장')이 그대로 살아 있어야 한다.
//
// 실행: npx vitest run src/api/checkins.result.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeCheckInResult } from './checkins';
import { toMyBuyinRequest } from './ledger';

describe('normalizeCheckInResult', () => {
  it('구형 서버(문자열) → 매장명 + 옛 문구와 같은 +3, streak 은 모름', () => {
    expect(normalizeCheckInResult('누리 홀덤')).toEqual({ name: '누리 홀덤', points: 3, streak: null });
  });
  it('새 서버(jsonb) → 실제 부여 점수를 그대로(같은 날 두 번째 = 0)', () => {
    expect(normalizeCheckInResult({ name: '누리 홀덤', points: 0, streak: 4 })).toEqual({ name: '누리 홀덤', points: 0, streak: 4 });
    expect(normalizeCheckInResult({ name: '누리 홀덤', points: 13, streak: 7 })).toEqual({ name: '누리 홀덤', points: 13, streak: 7 });
  });
  it('빈·이상 값은 던지지 않는다', () => {
    expect(normalizeCheckInResult(null)).toEqual({ name: '', points: 3, streak: null });
    expect(normalizeCheckInResult({ points: 'x' })).toEqual({ name: '', points: 0, streak: null });
  });
});

describe('toMyBuyinRequest', () => {
  it('RPC 행 → 화면 모델, 매장명 없으면 폴백', () => {
    expect(toMyBuyinRequest({ id: 'r1', venue_id: 'v1', status: 'approved', requested_game_seq: 2, game_seq: 1, resolve_note: null, venue_name: '누리 홀덤' }))
      .toEqual({ id: 'r1', venueId: 'v1', venueName: '누리 홀덤', status: 'approved', requestedGameSeq: 2, gameSeq: 1, rejectReason: null });
    expect(toMyBuyinRequest({ id: 'r2', venue_id: 'v2', status: 'rejected', resolve_note: '마감', venue_name: null }))
      .toEqual({ id: 'r2', venueId: 'v2', venueName: '매장', status: 'rejected', requestedGameSeq: null, gameSeq: null, rejectReason: '마감' });
  });
});
