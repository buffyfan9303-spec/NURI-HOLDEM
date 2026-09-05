// 예약 조회·취소의 실패 판정 고정 — F08(조회 오류 위장) · F06-b(거짓 취소 성공) 재발 방지.
//
// 왜 이 세 줄이 중요한가: PostgREST 는 throwOnError 를 켜지 않으면 401/403/500 은 물론
// fetch 거부(오프라인)까지 { data: null, error } 객체로 흡수한다. 그래서 API 가 error 를 보지 않고
// null/[]/{0,0,0} 을 돌려주면 **모든 호출자의 실패 UI 가 죽은 코드가 된다** — 예약한 손님에게
// '예약하기'를 다시 내밀고, 캘린더·내 정보는 '예약이 없습니다'라고 말한다.
// 삭제도 같다: RLS 나 '이미 취소된 예약'은 error 없이 0행이라, 0행을 성공으로 보면
// 서버에는 예약이 남은 채 화면에서만 사라진다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 응답을 테스트가 정하는 최소 supabase 스텁 — 체이닝(.select().eq()…)은 자기 자신을 돌려주고,
// 마지막에 await 되는 지점(thenable)에서 정해둔 응답을 준다.
let response: { data: unknown; error: unknown } = { data: null, error: null };
const chain = new Proxy(function () {} as unknown as Record<string, unknown>, {
  get(_t, prop) {
    if (prop === 'then') return (res: (v: unknown) => void) => res(response);
    return () => chain;
  },
  apply: () => chain,
}) as unknown as { then: unknown };

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  get supabase() { return chain; },
}));
vi.mock('./_session', () => ({
  currentUser: async () => ({ id: 'u1' }),
}));

const { getMyReservation, getMyReservations, getMyVisitStats, getReservationCounts, cancelMyReservation } =
  await import('./reservations');

const ERR = { code: '42501', message: 'permission denied' };

beforeEach(() => { response = { data: null, error: null }; });

describe('조회 실패는 빈 결과로 접지 않는다(throw)', () => {
  it('getMyReservation — 오류면 throw(null = 예약 없음 과 구분)', async () => {
    response = { data: null, error: ERR };
    await expect(getMyReservation('s1')).rejects.toBe(ERR);
  });

  it('getMyReservation — 성공·행 없음은 null(비로그인·없음은 실패가 아니다)', async () => {
    response = { data: null, error: null };
    await expect(getMyReservation('s1')).resolves.toBeNull();
  });

  it('getMyReservations — 오류면 throw', async () => {
    response = { data: null, error: ERR };
    await expect(getMyReservations()).rejects.toBe(ERR);
  });

  it('getMyReservations — 성공·빈 결과는 빈 배열', async () => {
    response = { data: [], error: null };
    await expect(getMyReservations()).resolves.toEqual([]);
  });

  it('getMyVisitStats — 오류면 throw(방문 뱃지를 0 으로 떨어뜨리지 않는다)', async () => {
    response = { data: null, error: ERR };
    await expect(getMyVisitStats()).rejects.toBe(ERR);
  });

  it('getMyVisitStats — 성공·빈 결과는 0/0/0', async () => {
    response = { data: [], error: null };
    await expect(getMyVisitStats()).resolves.toEqual({ visits: 0, upcoming: 0, total: 0 });
  });

  it('getReservationCounts — RPC 오류면 throw(카드 예약 수 0·마감임박 소실 방지)', async () => {
    response = { data: null, error: ERR };
    await expect(getReservationCounts(['s1'])).rejects.toBe(ERR);
  });

  it('getReservationCounts — 성공이면 scheduleId → 수 맵', async () => {
    response = { data: [{ schedule_id: 's1', cnt: 3 }], error: null };
    await expect(getReservationCounts(['s1'])).resolves.toEqual({ s1: 3 });
  });
});

describe('취소는 실제로 지워졌을 때만 성공이다', () => {
  it('0행 삭제(권한 없음·이미 취소됨)는 throw — 형제 deleteReservation 과 같은 규칙', async () => {
    response = { data: [], error: null };
    await expect(cancelMyReservation('s1')).rejects.toThrow('취소할 예약을 찾지 못했습니다');
  });

  it('오류면 throw', async () => {
    response = { data: null, error: ERR };
    await expect(cancelMyReservation('s1')).rejects.toBe(ERR);
  });

  it('1행 삭제는 성공', async () => {
    response = { data: [{ id: 'r1' }], error: null };
    await expect(cancelMyReservation('s1')).resolves.toBeUndefined();
  });
});
