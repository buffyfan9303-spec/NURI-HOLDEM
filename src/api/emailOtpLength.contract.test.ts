// 이메일 인증코드 자릿수는 **한 곳**에서만 정한다.
//
// 왜 계약이 필요한가 (2026-09-17 — 실제로 어긋나 있었다)
//   오너가 "메일로 8자리가 오는데 맞냐"고 물어 파 보니, 한 흐름 안에 **서로 다른 숫자 셋**이 있었다:
//     · 코드 주석 · supabase/config.toml  → "6자리"
//     · 입력칸 slice(0, 8) · maxLength={8} → 8
//     · 제출 가드 `code.length < 6`        → 6
//   실제로 오는 것은 **8**이었다. 아무도 못 알아챈 이유는 `supabase/config.toml` 의 otp_length 가
//   **로컬 개발(supabase start) 전용**이라 호스팅 프로젝트에 적용되지 않기 때문이다 —
//   저장소만 읽으면 6처럼 보이는데 라이브는 8이다.
//
//   증상이 가벼워 보여도 부류는 위험하다: 가드가 6이면 6자만 넣고도 제출이 열려 서버 거절을 받고,
//   slice 가 8이면 설정을 9·10 으로 올리는 순간 **붙여넣은 코드의 마지막 글자를 조용히 버린다**
//   (사용자는 "코드가 틀렸다"고만 본다).
//
// 이 파일이 지키는 것
//   ① 자릿수 정본은 src/api/auth.ts 의 EMAIL_OTP_LENGTH 하나뿐이다
//   ② 두 입력 화면(ProfileModal · AuthModal)이 그 상수를 실제로 import 해서 쓴다
//   ③ 그 화면들에 자릿수 리터럴을 다시 박지 않는다
//   ④ 값이 Supabase 가 허용하는 범위(6~10) 안이다
//   ⑤ 로컬 config.toml 의 otp_length 가 같은 값이다 — 로컬에서만 6자리가 와서 헷갈리는 일을 막는다
//
// ⚠ 이 계약은 '라이브 설정이 8이다'를 증명하지 못한다. 그건 Supabase 대시보드에 있고 저장소 밖이다.
//   설정을 바꾸면 EMAIL_OTP_LENGTH 도 같이 고쳐야 한다 — 그 사실을 여기 적어 두는 것까지가 이 파일의 일이다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EMAIL_OTP_LENGTH } from './auth';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');
/** 주석 안의 숫자가 단언을 거짓 실패시키지 않도록 코드만 남긴다. */
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const AUTH = read('./auth.ts');
const PROFILE = codeOnly(read('../components/features/ProfileModal.tsx'));
const AUTHMODAL = codeOnly(read('../components/features/AuthModal.tsx'));
const CONFIG = readFileSync(join(__dirname, '../../supabase/config.toml'), 'utf8');

describe('이메일 OTP 자릿수 — 정본이 하나다', () => {
  it('정규식이 죽으면 조용히 통과하는 것을 막는다 — 재료가 실제로 있다', () => {
    expect(AUTH).toContain('EMAIL_OTP_LENGTH');
    expect(PROFILE).toContain('requestPasswordChangeCode');
    expect(AUTHMODAL).toContain('verifyPasswordResetOtp');
  });

  it('🔴 Supabase 가 허용하는 범위(6~10) 안이다', () => {
    expect(Number.isInteger(EMAIL_OTP_LENGTH)).toBe(true);
    expect(EMAIL_OTP_LENGTH).toBeGreaterThanOrEqual(6);
    expect(EMAIL_OTP_LENGTH).toBeLessThanOrEqual(10);
  });

  it('🔴 상수 선언은 딱 한 곳이다 — 두 번째 정본이 생기면 다시 갈라진다', () => {
    const decls = [...AUTH.matchAll(/export const EMAIL_OTP_LENGTH\s*=/g)];
    expect(decls.length, 'api/auth.ts 에 EMAIL_OTP_LENGTH 선언이 정확히 1개여야 한다').toBe(1);
  });

  it.each([
    ['ProfileModal', PROFILE],
    ['AuthModal', AUTHMODAL],
  ])('🔴 %s 가 상수를 import 해서 쓴다', (_name, src) => {
    expect(src).toContain('EMAIL_OTP_LENGTH');
    expect(src, '자르기가 상수를 안 쓴다 — 설정이 커지면 붙여넣은 코드를 조용히 버린다')
      .toContain('.slice(0, EMAIL_OTP_LENGTH)');
    expect(src, '입력칸 상한이 상수를 안 쓴다').toContain('maxLength={EMAIL_OTP_LENGTH}');
    expect(src, '제출 가드가 상수를 안 쓴다 — 짧은 코드로도 제출이 열린다')
      .toMatch(/length < EMAIL_OTP_LENGTH/);
  });

  it.each([
    ['ProfileModal', PROFILE],
    ['AuthModal', AUTHMODAL],
  ])('🔴 %s 에 자릿수 리터럴이 다시 박혀 있지 않다', (_name, src) => {
    // 이 화면들에서 6~10 리터럴이 붙을 수 있는 자리만 좁혀서 본다(비밀번호 minLength 등은 무관).
    const bad = [
      ...[...src.matchAll(/\.slice\(0,\s*(\d+)\)/g)].map((m) => `slice(0, ${m[1]})`),
      ...[...src.matchAll(/maxLength=\{(\d+)\}/g)]
        .filter((m) => Number(m[1]) >= 6 && Number(m[1]) <= 10)
        .map((m) => `maxLength={${m[1]}}`),
      ...[...src.matchAll(/code(?:\.trim\(\))?\.length\s*[<>=!]+\s*(\d+)/g)].map((m) => `code.length … ${m[1]}`),
    ];
    expect(bad, `자릿수 리터럴이 남아 있다: ${bad.join(' / ')}`).toEqual([]);
  });

  it('🔴 로컬 개발 설정(config.toml)도 같은 값이다 — 로컬만 다르면 다시 헷갈린다', () => {
    const m = CONFIG.match(/^otp_length\s*=\s*(\d+)\s*$/m);
    expect(m, 'supabase/config.toml 에서 otp_length 를 못 찾았다').not.toBeNull();
    expect(Number(m![1]), 'config.toml 의 otp_length 가 EMAIL_OTP_LENGTH 와 다르다').toBe(EMAIL_OTP_LENGTH);
  });
});
