// 운영 쓰기 차단 가드 자체의 계약 — 순수 판정 함수만 검사한다(네트워크 없음).
//  이 스펙이 깨지면 다른 모든 스펙이 운영 DB 에 쓸 수 있는 상태다.
import { test, expect, isAllowedRequest } from './_fixtures';

const P = 'https://idsxiqspecrucvfvtgbw.supabase.co';
const ISO = 'https://abcdefghijklmnopqrst.supabase.co';

test.describe('E2E 쓰기 차단 가드', () => {
  test('운영 프로젝트: 읽기·STABLE RPC·토큰 갱신만 통과, 쓰기는 플래그가 있어도 차단', () => {
    expect(isAllowedRequest('GET', `${P}/rest/v1/schedules?select=*`, true)).toBe(true);
    expect(isAllowedRequest('POST', `${P}/rest/v1/rpc/schedule_reservation_counts`, false)).toBe(true);
    expect(isAllowedRequest('POST', `${P}/auth/v1/token?grant_type=refresh_token`, false)).toBe(true);
    expect(isAllowedRequest('POST', `${P}/rest/v1/rpc/increment_post_view`, true)).toBe(false);
    expect(isAllowedRequest('POST', `${P}/rest/v1/rpc/bump_schedule_view`, true)).toBe(false);
    expect(isAllowedRequest('POST', `${P}/rest/v1/client_errors`, true)).toBe(false);
    expect(isAllowedRequest('PATCH', `${P}/rest/v1/profiles?id=eq.x`, true)).toBe(false);
    expect(isAllowedRequest('DELETE', `${P}/rest/v1/schedule_reservations?id=eq.x`, true)).toBe(false);
    expect(isAllowedRequest('POST', `${P}/storage/v1/object/avatars/x.webp`, true)).toBe(false);
    expect(isAllowedRequest('POST', `${P}/functions/v1/poster-ocr`, true)).toBe(false);
    expect(isAllowedRequest('POST', `${P}/auth/v1/token?grant_type=password`, true)).toBe(false);
  });
  test('격리 프로젝트: E2E_ALLOW_WRITES=1 일 때만 쓰기 통과', () => {
    expect(isAllowedRequest('POST', `${ISO}/rest/v1/clock_states`, true)).toBe(true);
    expect(isAllowedRequest('POST', `${ISO}/rest/v1/clock_states`, false)).toBe(false);
  });
  test('Supabase 밖 요청은 관여하지 않는다', () => {
    expect(isAllowedRequest('POST', 'https://api.example.com/x', false)).toBe(true);
  });
});
