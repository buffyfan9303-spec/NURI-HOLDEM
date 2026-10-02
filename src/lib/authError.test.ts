// 인증 흐름 오류 → 한국어 표(authError.ts) + 그룹 P0001 한국어 문장 통과 + DB 원문 차단.
// 음성 대조: authError.ts 의 `AUTH_CODE_TEXT[code]` 분기를 지우면 ① ② 가, msgOf 의 P0001 통과를 지우면 ④ 가,
//   isUserSentence 를 항상 true 로 바꾸면 ⑤ 가 빨개진다.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AUTH_CODE_TEXT, authMsgOf } from './authError';
import { msgOf } from './dbError';

afterEach(() => { vi.restoreAllMocks(); });

const FB = '기본 문구';
const quiet = () => vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('① Supabase Auth 오류 코드 → 한국어', () => {
  const CASES: Array<[string, string]> = [
    ['invalid_credentials', 'Invalid login credentials'],
    ['email_not_confirmed', 'Email not confirmed'],
    ['user_already_exists', 'User already registered'],
    ['weak_password', 'Password should be at least 8 characters.'],
    ['same_password', 'New password should be different from the old password.'],
    ['over_email_send_rate_limit', 'email rate limit exceeded'],
    ['otp_expired', 'Token has expired or is invalid'],
    ['session_not_found', 'Session from session_id claim in JWT does not exist'],
  ];
  for (const [code, message] of CASES) {
    it(`${code}`, () => {
      const out = authMsgOf({ name: 'AuthApiError', status: 400, code, message }, FB);
      expect(out).toBe(AUTH_CODE_TEXT[code]);
      expect(out).not.toBe(FB);
      expect(out).not.toMatch(/[A-Za-z]{3}/);   // 영어 원문이 한 단어도 새지 않는다
    });
  }

  it('표의 모든 문장은 한국어 한 문장이고 msgOf 도 그대로 통과시킨다(영문·식별자 없음)', () => {
    for (const [code, text] of Object.entries(AUTH_CODE_TEXT)) {
      expect(text, code).toMatch(/[가-힣]/);
      expect(text, code).not.toMatch(/[A-Za-z]{2}/);
      expect(msgOf({ message: text }, FB), code).toBe(text);
    }
  });
});

describe('② 코드가 없는 옛 응답은 원문 모양으로 알아본다', () => {
  it('Invalid login credentials', () => {
    expect(authMsgOf(new Error('Invalid login credentials'), FB)).toBe(AUTH_CODE_TEXT.invalid_credentials);
  });
  it('User already registered', () => {
    expect(authMsgOf(new Error('User already registered'), FB)).toBe(AUTH_CODE_TEXT.user_already_exists);
  });
  it('Auth session missing! → 다시 로그인', () => {
    expect(authMsgOf(new Error('Auth session missing!'), FB)).toBe(AUTH_CODE_TEXT.session_not_found);
  });
  it('For security purposes, you can only request this after 45 seconds → 기다릴 초를 살린다', () => {
    expect(authMsgOf({ message: 'For security purposes, you can only request this after 45 seconds.' }, FB))
      .toBe('45초 뒤에 다시 시도해 주세요');
  });
});

describe('③ Auth 가 아닌 오류는 msgOf 와 같다', () => {
  it('null → fallback · 네트워크 끊김 → 네트워크 문장', () => {
    expect(authMsgOf(null, FB)).toBe(FB);
    expect(authMsgOf(new TypeError('Failed to fetch'), FB)).toBe(msgOf(new TypeError('Failed to fetch'), FB));
  });
  it('모르는 영문 원문은 화면에 안 나간다', () => {
    quiet();
    expect(authMsgOf(new Error('Something exploded in gotrue'), FB)).toBe(FB);
  });
  it('fallback 을 생략하면 msgOf 의 기본 문구', () => {
    quiet();
    expect(authMsgOf({ code: '99999', message: 'boom boom boom' })).toBe(msgOf({ code: '99999', message: 'boom boom boom' }));
  });
});

describe('④ 서버가 의도적으로 던진 한국어 문장(P0001)은 그대로 보인다', () => {
  const GROUP = [
    '그룹을 찾을 수 없습니다',
    '이 그룹에서 내보내진 계정이라 다시 가입할 수 없습니다. 개설자가 차단을 풀면 가입할 수 있어요.',
    '이미 이 그룹의 구성원입니다',
  ];
  for (const g of GROUP) {
    it(g, () => {
      const warn = quiet();
      expect(msgOf({ code: 'P0001', message: g }, FB)).toBe(g);
      expect(msgOf(new Error(g), FB)).toBe(g);          // api 가 code 를 버리고 Error 로 감싼 경우
      expect(authMsgOf({ code: 'P0001', message: g }, FB)).toBe(g);
      expect(warn).not.toHaveBeenCalled();
    });
  }
});

describe('⑤ SQL·식별자·스키마 원문은 차단된다', () => {
  const RAW: Array<[string, unknown]> = [
    ['PGRST116', { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }],
    ['42501', { code: '42501', message: 'permission denied for table legal_consents' }],
    ['23503 details', { code: '23503', message: 'insert or update on table "x" violates foreign key constraint "x_fk"', details: 'Key (venue_id)=(1c0e7d2a-2f5e-4c43-9f0f-0a3a4a1b2c3d) is not present in table "venues".' }],
    ['42P01', { code: '42P01', message: 'relation "secret_settings" does not exist' }],
    ['한글 접두 + 원문', new Error('저장 실패: duplicate key value violates unique constraint "profiles_nickname_key"')],
    ['함수 원문', new Error('function public.my_rpc(uuid) does not exist')],
  ];
  for (const [name, err] of RAW) {
    it(name, () => {
      quiet();
      const out = msgOf(err, FB);
      expect(out).not.toMatch(/relation|constraint|schema|profiles_|venue_id|legal_consents|public\.|secret_settings|[0-9a-f]{8}-[0-9a-f]{4}/i);
      expect(authMsgOf(err, FB)).toBe(out);
    });
  }
});
