// 로그아웃 청소(clearAuthStorage)가 비밀번호 변경 OTP 마커(nh_pw_otp)까지 걷어내는가(P0-08).
// 키에 사용자 식별이 없어, 로그아웃 뒤 5분 안에 같은 탭에서 로그인한 다음 계정의 보안 탭이
// 이전 계정의 코드 입력 단계로 열렸다(리로드면 App 이 보안 탭을 강제로 연다).
// 실행: npx vitest run src/lib/supabase.clearAuth.test.ts
import { describe, it, expect, vi } from 'vitest';

/** Storage 흉내 — clearAuthStorage 가 쓰는 length/key/getItem/setItem/removeItem 만 */
function fakeStorage() {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}
const local = fakeStorage();
const session = fakeStorage();
vi.stubGlobal('window', { localStorage: local, sessionStorage: session });
// 클라이언트 생성은 이 테스트의 관심 밖 — 저장소 청소 함수만 본다
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));

const { clearAuthStorage } = await import('./supabase');

describe('clearAuthStorage', () => {
  it('sb-*-auth-token* 과 nh_pw_otp 는 지우고, 무관한 키는 남긴다', () => {
    local.setItem('sb-abc-auth-token', '{"access_token":"x"}');
    session.setItem('sb-abc-auth-token-code-verifier', 'v');
    session.setItem('nh_pw_otp', String(Date.now()));
    local.setItem('nuri-theme', 'dark');

    clearAuthStorage();

    expect(local.getItem('sb-abc-auth-token')).toBeNull();
    expect(session.getItem('sb-abc-auth-token-code-verifier')).toBeNull();
    expect(session.getItem('nh_pw_otp'), '로그아웃 뒤에도 OTP 마커가 남아 다음 계정의 보안 탭이 코드 입력 단계로 열린다').toBeNull();
    expect(local.getItem('nuri-theme')).toBe('dark');
  });
});
