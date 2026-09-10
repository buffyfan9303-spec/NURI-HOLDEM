// 소셜 로그인 시작 파라미터(AUTH-03) — Google 은 prompt=select_account 를 붙인다.
// 브라우저에 Google 계정이 하나만 살아 있으면 Google 은 계정 선택 없이 그 계정으로 즉시 돌려보내서,
// 앱에서 로그아웃한 뒤 '다른 계정으로' 들어올 길이 없었다. (카카오 로그인은 2026-09-10 삭제 — 소셜은 Google 하나.)
// 실행: npx vitest run src/api/auth.social.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { signInWithOAuth } = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(async () => ({ data: { provider: 'google', url: 'https://x/authorize' }, error: null })),
}));

vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  setKeepSignedIn: () => {},
  clearAuthStorage: () => {},
  supabase: { auth: { signInWithOAuth } },
}));
vi.mock('./_session', () => ({ currentUser: async () => null }));

// signInWithOAuth 의 redirectTo 는 window.location.origin — node 환경엔 window 가 없다
(globalThis as unknown as { window: unknown }).window = { location: { origin: 'https://nuriholdem.com' } };

const auth = await import('./auth');

beforeEach(() => { signInWithOAuth.mockClear(); });

describe('OAuth 시작 파라미터', () => {
  it('Google — prompt=select_account 를 붙여 계정 선택 화면을 강제한다', async () => {
    await auth.signInWithGoogle();
    expect(signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'google',
      options: expect.objectContaining({ redirectTo: 'https://nuriholdem.com', queryParams: { prompt: 'select_account' } }),
    }));
  });

  it('카카오 로그인 진입점이 남아 있지 않다(2026-09-10 삭제)', () => {
    expect('loginWithKakao' in auth).toBe(false);
    expect('KAKAO_LOGIN_ENABLED' in auth).toBe(false);
  });
});
