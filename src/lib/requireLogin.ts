// src/lib/requireLogin.ts
// 비로그인 사용자가 쓰기(글·댓글·반응·채팅·예약 등)를 시도하면 로그인 모달을 띄우도록
// 앱 어디서든 호출할 수 있는 전역 신호. App.tsx가 이 이벤트를 듣고 AuthModal을 연다.
export const REQUIRE_LOGIN_EVENT = 'nuri:require-login';

/** 로그인 모달을 띄운다. 비로그인 상태에서 쓰기 시도 시 호출. */
export function promptLogin(): void {
  try { window.dispatchEvent(new CustomEvent(REQUIRE_LOGIN_EVENT)); } catch { /* SSR/noop */ }
}

/**
 * 로그인 가드. user가 없으면 로그인 모달을 띄우고 false 반환(호출부는 즉시 return).
 * @returns 로그인되어 있으면 true.
 */
export function ensureLogin(user: unknown): boolean {
  if (user) return true;
  promptLogin();
  return false;
}
