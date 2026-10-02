// 로그인·가입·비밀번호·본인인증 흐름의 오류 → 한국어 한 문장 — Supabase Auth(GoTrue) 오류 코드 표.
//
// 왜 따로 두나: Auth 오류는 PostgREST 오류와 모양이 다르다. 코드는 SQLSTATE 5글자가 아니라 snake_case 단어
// (`invalid_credentials`·`over_email_send_rate_limit`)이고, 원문은 영어 문장('Invalid login credentials')이라 msgOf 에 그냥 넘기면
// 전부 fallback 으로 뭉개져 "왜 못 들어가는지" 가 사라진다. 코드를 아는 것만 사람 말로 옮기고, 모르는 건 msgOf 에 맡긴다
// (원문은 화면이 아니라 콘솔로만 — 보안 표준 6).
//
// 코드 표는 supabase/auth 의 error_codes.go 를 따랐다. 코드가 없는 옛 응답(GoTrue < 2.9x)은 원문 모양으로도 알아본다.
// ⚠ 여기 문장은 api/auth.ts 가 직접 던지는 한국어 문장('이미 가입된 이메일입니다 — …')과 같은 말을 쓴다.
import { msgOf } from './dbError';

const RELOGIN = '로그인이 만료되었습니다. 다시 로그인해 주세요';
const RETRY_LATER = '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요';
const OAUTH_EXPIRED = '로그인 시간이 만료되었습니다. 처음부터 다시 시도해 주세요';
const TRANSIENT = '일시적인 오류입니다. 잠시 후 다시 시도해 주세요';
const ALREADY_USER = '이미 가입된 이메일입니다 — 로그인하거나 비밀번호 찾기를 이용해 주세요';

export const AUTH_CODE_TEXT: Readonly<Record<string, string>> = {
  invalid_credentials: '이메일 또는 비밀번호를 확인해 주세요',
  email_not_confirmed: '이메일 인증이 필요합니다. 받은 편지함의 인증 메일을 확인해 주세요',
  phone_not_confirmed: '휴대폰 인증이 필요합니다',
  user_already_exists: ALREADY_USER,
  email_exists: ALREADY_USER,
  phone_exists: '이미 사용 중인 휴대폰 번호입니다',
  identity_already_exists: '이미 다른 로그인 방식에 연결된 계정입니다',
  weak_password: '비밀번호가 너무 약합니다. 더 길고 복잡하게 만들어 주세요',
  same_password: '이전과 다른 새 비밀번호를 입력해 주세요',
  over_request_rate_limit: RETRY_LATER,
  over_email_send_rate_limit: RETRY_LATER,
  over_sms_send_rate_limit: RETRY_LATER,
  otp_expired: '인증번호가 만료되었거나 올바르지 않습니다. 다시 요청해 주세요',
  reauthentication_needed: '보안을 위해 다시 로그인한 뒤 시도해 주세요',
  reauthentication_not_valid: '확인 코드가 올바르지 않습니다',
  session_expired: RELOGIN,
  session_not_found: RELOGIN,
  refresh_token_not_found: RELOGIN,
  refresh_token_already_used: RELOGIN,
  bad_jwt: RELOGIN,
  no_authorization: RELOGIN,
  user_not_found: '계정을 찾을 수 없습니다',
  user_banned: '이용이 제한된 계정입니다',
  signup_disabled: '지금은 새로 가입할 수 없습니다',
  email_address_invalid: '사용할 수 없는 이메일 주소입니다',
  email_address_not_authorized: '이 이메일 주소로는 메일을 보낼 수 없습니다',
  validation_failed: '입력 형식이 올바르지 않습니다',
  flow_state_expired: OAUTH_EXPIRED,
  flow_state_not_found: OAUTH_EXPIRED,
  bad_oauth_state: OAUTH_EXPIRED,
  bad_oauth_callback: OAUTH_EXPIRED,
  provider_disabled: '이 로그인 방식은 지금 사용할 수 없습니다',
  oauth_provider_not_supported: '이 로그인 방식은 지금 사용할 수 없습니다',
  provider_email_needs_verification: '이메일 인증을 마친 뒤 다시 로그인해 주세요',
  captcha_failed: '자동 입력 방지 확인에 실패했습니다. 다시 시도해 주세요',
  sms_send_failed: '문자를 보내지 못했습니다. 잠시 후 다시 시도해 주세요',
  request_timeout: TRANSIENT,
  unexpected_failure: TRANSIENT,
  hook_timeout: TRANSIENT,
  conflict: TRANSIENT,
};

// 코드가 없는 응답(옛 GoTrue·SDK 가 직접 만든 오류)은 원문 모양으로 코드를 되찾는다.
const AUTH_MESSAGE_CODE: ReadonlyArray<readonly [RegExp, string]> = [
  [/invalid login credentials/i, 'invalid_credentials'],
  [/email not confirmed/i, 'email_not_confirmed'],
  [/user already registered/i, 'user_already_exists'],
  [/password should be at least|weak password/i, 'weak_password'],
  [/new password should be different/i, 'same_password'],
  [/token has expired or is invalid|otp.{0,20}expired/i, 'otp_expired'],
  [/auth session missing|invalid refresh token|refresh token not found/i, 'session_not_found'],
  [/signups? not allowed/i, 'signup_disabled'],
  [/unable to validate email address/i, 'email_address_invalid'],
  [/user not found/i, 'user_not_found'],
];
// 'For security purposes, you can only request this after 45 seconds.' — 기다릴 초가 문장에 들어 있다.
const WAIT_SECONDS = /you can only request this (?:after|once every) (\d+) seconds?/i;

/** 오류 코드 → 표 문장(표에 없으면 undefined). 코드는 URL(?error_code=)처럼 바깥에서 올 수도 있으니 **own 키만** 본다 —
 *  `constructor`·`__proto__` 같은 프로토타입 키가 문장 대신 함수를 돌려주지 않게. */
export function authCodeText(code: unknown): string | undefined {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(AUTH_CODE_TEXT, code) ? AUTH_CODE_TEXT[code] : undefined;
}

/** Supabase Auth 오류 코드/원문 → 한국어 한 문장. Auth 오류가 아니면 msgOf 와 같다. */
export function authMsgOf(e: unknown, fallback?: string): string {
  const r = (e && typeof e === 'object' ? e : {}) as { code?: unknown; message?: unknown };
  const code = typeof r.code === 'string' ? r.code : '';
  const raw = typeof r.message === 'string' ? r.message : '';
  const wait = WAIT_SECONDS.exec(raw);
  if (wait) return `${wait[1]}초 뒤에 다시 시도해 주세요`;
  const byCode = authCodeText(code);
  if (byCode) return byCode;
  if (raw) {
    for (const [re, c] of AUTH_MESSAGE_CODE) if (re.test(raw)) return AUTH_CODE_TEXT[c];
    if (/rate limit/i.test(raw)) return RETRY_LATER;
  }
  return msgOf(e, fallback);
}
