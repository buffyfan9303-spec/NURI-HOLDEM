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

  test('브라우저 라우트가 실제로 설치돼 있다 — 페이지에서 낸 쓰기 요청이 끊긴다', async ({ page }) => {
    await page.goto('/');
    const out = await page.evaluate(async (base) => {
      const r = { write: '', read: '' };
      try { await fetch(`${base}/rest/v1/rpc/increment_post_view`, { method: 'POST', body: '{}' }); r.write = 'passed'; }
      catch (e) { r.write = `blocked:${e instanceof Error ? e.name : 'err'}`; }
      try { const res = await fetch(`${base}/rest/v1/`, { method: 'GET' }); r.read = `status:${res.status}`; }
      catch (e) { r.read = `blocked:${e instanceof Error ? e.name : 'err'}`; }
      return r;
    }, 'https://idsxiqspecrucvfvtgbw.supabase.co');
    expect(out.write).toContain('blocked');   // 쓰기는 네트워크 단에서 끊긴다
    expect(out.read).toContain('status:');    // 읽기는 그대로 나간다(앱이 정상 동작해야 하므로)
  });

  test('Supabase 밖 요청은 관여하지 않는다', () => {
    expect(isAllowedRequest('POST', 'https://api.example.com/x', false)).toBe(true);
  });
});
