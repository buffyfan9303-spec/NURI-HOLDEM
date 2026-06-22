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

// 커뮤니티 글쓰기 모달을 어디서든 열기 — 예: 포스터 상세 '대회 후기 쓰기'(defaultCategory='tourney').
export const OPEN_POST_FORM_EVENT = 'nuri:open-post-form';
export function openPostForm(category?: string): void {
  try { window.dispatchEvent(new CustomEvent(OPEN_POST_FORM_EVENT, { detail: { category } })); } catch { /* noop */ }
}

// ── 본인인증 게이트 ──────────────────────────────────────────────────────────
// 본인인증(휴대폰)이 필요한 민감 기능(글쓰기·중고장터 등록·예약) 시도 시, App이 듣고 본인인증 안내를 띄운다.
export const REQUIRE_VERIFY_EVENT = 'nuri:require-verify';
export function promptVerify(): void {
  try { window.dispatchEvent(new CustomEvent(REQUIRE_VERIFY_EVENT)); } catch { /* noop */ }
}

/**
 * 본인인증 가드. 비로그인이면 로그인 모달, 미인증이면 본인인증 안내를 띄우고 false 반환(호출부는 즉시 return).
 * @returns 로그인 + 본인인증 완료면 true.
 */
export function ensureVerified(user: { verified?: boolean } | null | undefined): boolean {
  if (!user) { promptLogin(); return false; }
  if (!user.verified) { promptVerify(); return false; }
  return true;
}
