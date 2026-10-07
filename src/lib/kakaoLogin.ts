// src/lib/kakaoLogin.ts — 카카오 로그인(OpenID Connect + supabase.auth.signInWithIdToken).
//
// 왜 Supabase 의 카카오 OAuth(signInWithOAuth)를 쓰지 않나 (리드 결정 2026-10-07, B안):
//   Supabase 카카오 공급자는 scope 에 account_email 을 항상 넣는다(supabase/auth internal/api/provider/kakao.go, 추가 scope 는 덧붙기만 한다).
//   account_email 은 비즈 앱만 설정할 수 있는데 우리 앱의 비즈 앱 전환은 거절됐다 → 카카오가 KOE205 로 모든 로그인을 막는다.
//   그래서 openid profile_nickname profile_image 만 요청하고, 받은 id_token 으로 Supabase 세션을 만든다.
//
// 흐름: 버튼 → startKakaoLogin(state·nonce 를 sessionStorage 에, 인가 주소는 엣지 함수가 만든다) → 카카오 →
//   https://<우리 도메인>/auth/kakao?code&state → App 이 completeKakaoLogin 을 부른다 → state 확인 → 엣지 함수가 code→id_token →
//   signInWithIdToken({ provider:'kakao', token, nonce }) → onAuthStateChange(SIGNED_IN) → 프로필 → 이메일·구글 가입자와 **같은**
//   동의 게이트(agreed_to_terms=false) → 본인인증 게이트(ci_hash 없음). 카카오라서 건너뛰는 관문은 없다(게이트는 provider 를 보지 않는다).
//
// nonce: Supabase 는 원문 nonce 를 sha256 hex 로 바꿔 id_token 의 nonce 클레임과 비교한다(supabase/auth internal/api/token_oidc.go).
//   그래서 카카오에는 **해시**를, signInWithIdToken 에는 **원문**을 준다.
import { supabase, IS_MOCK, setKeepSignedIn } from './supabase';
import { msgOf } from './dbError';

export const KAKAO_CALLBACK_PATH = '/auth/kakao';
const FN = 'kakao-oidc-exchange';
const PENDING_KEY = 'nuri:kakao-oidc';
const TTL_MS = 10 * 60_000;

export const KAKAO_MSG = {
  cancelled: '카카오 로그인을 취소했거나 필수 항목에 동의하지 않았습니다. 다시 시도해 주세요',
  expired: '로그인 요청이 만료되었습니다. 다시 시도해 주세요',
  notReady: '카카오 로그인이 아직 준비되지 않았습니다. 이메일 또는 Google 로 로그인해 주세요',
  storage: '이 브라우저 설정에서는 카카오 로그인을 쓸 수 없습니다. 이메일 또는 Google 로 로그인해 주세요',
  dbError: '가입 처리 중 오류가 났습니다. 잠시 후 다시 시도해 주세요',
  failed: '카카오 로그인을 완료하지 못했습니다. 다시 시도해 주세요',
} as const;

/** 공개 스위치(비밀 아님). 콘솔·엣지 함수 설정이 끝나기 전에는 꺼 둔다 — 기본 꺼짐, Vercel env 로 켠다. */
export function kakaoLoginEnabled(): boolean {
  return import.meta.env.VITE_KAKAO_LOGIN_ENABLED === 'true';
}

function rand(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** 엣지 함수 호출 — 서버가 준 **고정 문장**만 밖으로 낸다(원문·네트워크 영문 메시지는 싣지 않는다). */
async function callFn<T>(body: Record<string, string>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(FN, { body });
  if (error) {
    let msg: string = KAKAO_MSG.failed;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (error as any).context;
    if (ctx && typeof ctx.json === 'function') {
      try { const j = await ctx.json(); if (typeof j?.error === 'string') msg = j.error; } catch { /* noop */ }
    }
    throw new Error(msg);
  }
  return data as T;
}

/** 버튼에서 부른다 — 성공하면 페이지를 떠난다. 실패는 사람 말 문장으로 던진다. */
export async function startKakaoLogin(keepSignedIn?: boolean): Promise<void> {
  if (IS_MOCK) throw new Error('데모 모드에서는 카카오 로그인을 사용할 수 없습니다');
  if (typeof keepSignedIn === 'boolean') setKeepSignedIn(keepSignedIn);
  const state = rand();
  const nonce = rand();
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ state, nonce, at: Date.now() })); }
  catch { throw new Error(KAKAO_MSG.storage); }
  const { url } = await callFn<{ url?: string }>({ action: 'start', state, nonceHash: await sha256hex(nonce) });
  if (typeof url !== 'string' || !url.startsWith('https://kauth.kakao.com/')) throw new Error(KAKAO_MSG.failed);
  window.location.assign(url);
}

/** signInWithIdToken 오류 → 고정 문장. 원문은 콘솔에만(진단용). */
export function idTokenErrorText(message: string): string {
  if (/not enabled|unsupported provider/i.test(message)) return KAKAO_MSG.notReady;           // Supabase 카카오 공급자 꺼짐
  if (/email/i.test(message)) return KAKAO_MSG.notReady;                                       // 'Allow users without an email' 꺼짐
  if (/database error saving new user/i.test(message)) return KAKAO_MSG.dbError;               // 가입 트리거 실패(예: profiles.email NOT NULL)
  return KAKAO_MSG.failed;
}

/**
 * `/auth/kakao` 로 돌아왔을 때 App 이 한 번 부른다. 성공이면 null, 실패면 토스트에 띄울 고정 문장.
 * URL 은 맨 먼저 `/` 로 정리한다 — 새로고침해도 같은 코드를 다시 쓰지 않게(카카오 코드는 1회용이다).
 */
export async function completeKakaoLogin(loc: Pick<Location, 'search'> = window.location): Promise<string | null> {
  const q = new URLSearchParams(loc.search);
  const code = q.get('code');
  const state = q.get('state');
  const err = q.get('error');
  let pending: { state?: unknown; nonce?: unknown; at?: unknown } | null;
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    pending = raw ? JSON.parse(raw) : null;
  } catch { pending = null; }
  try { window.history.replaceState(null, '', '/'); } catch { /* noop */ }

  if (err) {
    console.warn('[kakao-return]', { error: err.slice(0, 40) });
    return err === 'access_denied' ? KAKAO_MSG.cancelled : KAKAO_MSG.failed;
  }
  if (!code || !state || !pending || pending.state !== state || typeof pending.nonce !== 'string'
      || typeof pending.at !== 'number' || Date.now() - pending.at > TTL_MS) {
    return KAKAO_MSG.expired;
  }
  try {
    const { id_token } = await callFn<{ id_token?: string }>({ action: 'exchange', code });
    if (typeof id_token !== 'string') return KAKAO_MSG.failed;
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'kakao', token: id_token, nonce: pending.nonce });
    if (error) {
      console.warn('[kakao-idtoken]', error.message.slice(0, 200));
      return idTokenErrorText(error.message);
    }
    return null;
  } catch (e) {
    return msgOf(e, KAKAO_MSG.failed); // callFn 은 서버의 한국어 고정 문장만 던진다 — 그 밖의 원문은 msgOf 가 거른다
  }
}
