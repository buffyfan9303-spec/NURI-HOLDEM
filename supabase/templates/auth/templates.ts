// supabase/templates/auth/templates.ts — Supabase 인증 메일 템플릿의 **원본**. 같은 폴더의 *.html·subjects.json 은 생성물이다.
//   재생성: node scripts/gen-email-templates.mjs   (일치 확인: --check · src/lib/emailTemplates.test.ts 도 매번 대조)
//   적용: 리드가 Management API PATCH /v1/projects/{ref}/config/auth 로 mailer_templates_*_content · mailer_subjects_* 를 넣는다.
//
// 🔴 Go 템플릿 변수는 **원본(대시보드) 템플릿이 쓰던 것만** 쓴다 — 없는 변수를 쓰면 빈 문자열이 나간다.
//   confirmation·magic_link: {{ .ConfirmationURL }} · email_change: {{ .ConfirmationURL }} {{ .NewEmail }}
//   recovery·reauthentication: {{ .Token }} (앱이 코드 입력 흐름이다 — src/api/auth.ts verifyOtp('recovery') · reauthenticate())
// 🔴 유효시간은 Supabase 설정 mailer_otp_exp(링크·코드 공용)를 **따라 적는** 값이다. 앱도 5분으로 가정한다
//   (App.tsx 'nh_pw_otp' 5 * 60 * 1000). 설정을 바꾸면 여기와 그 두 곳을 같이 바꾼다.
import { button, codeBox, eyebrow, h1, layout, linkFallback, notice, p, small, strong } from '../../functions/_shared/email/layout.ts';

export const OTP_EXPIRY_MIN = 5;

const ignore = (what: string) => notice(`본인이 요청하지 않았다면 이 메일을 무시해 주세요. ${what}`);

export interface AuthTemplate {
  /** Management API 필드 이름 */
  subjectKey: string;
  contentKey: string;
  subject: string;
  html: string;
}

const t = (key: string, subject: string, preheader: string, body: string[]): [string, AuthTemplate] => [key, {
  subjectKey: `mailer_subjects_${key}`,
  contentKey: `mailer_templates_${key}_content`,
  subject,
  html: layout({ title: subject, preheader, body: body.join('\n') }),
}];

export const AUTH_TEMPLATES: Record<string, AuthTemplate> = Object.fromEntries([
  t('confirmation', '[NURI HOLDEM] 이메일 인증을 완료해 주세요', '버튼 한 번이면 가입이 끝나요.', [
    eyebrow('이메일 인증'),
    h1('가입을 환영해요'),
    p('아래 버튼을 누르면 이메일 인증이 끝나고 NURI HOLDEM 을 바로 이용할 수 있어요.', 20),
    button('{{ .ConfirmationURL }}', '이메일 인증하기'),
    small(`인증 링크는 ${strong(`${OTP_EXPIRY_MIN}분`)} 동안, 한 번만 쓸 수 있어요. 시간이 지났다면 앱에서 인증 메일을 다시 받아 주세요.`, 16),
    linkFallback('{{ .ConfirmationURL }}'),
    ignore('가입은 완료되지 않습니다.'),
  ]),
  t('recovery', '[NURI HOLDEM] 비밀번호 재설정 인증번호', '앱 화면에 인증번호를 입력해 주세요.', [
    eyebrow('비밀번호 재설정'),
    h1('비밀번호 재설정 인증번호'),
    p('아래 인증번호를 앱의 비밀번호 찾기 화면에 입력하면 새 비밀번호를 정할 수 있어요.', 20),
    codeBox('{{ .Token }}'),
    small(`인증번호는 ${strong(`${OTP_EXPIRY_MIN}분`)} 뒤에 만료돼요. 누구에게도 알려 주지 마세요 — 운영팀도 인증번호를 묻지 않습니다.`, 20),
    ignore('비밀번호는 바뀌지 않습니다.'),
  ]),
  t('magic_link', '[NURI HOLDEM] 로그인 링크', '버튼을 누르면 바로 로그인돼요.', [
    eyebrow('로그인'),
    h1('로그인 링크가 도착했어요'),
    p('아래 버튼을 누르면 NURI HOLDEM 에 로그인돼요.', 20),
    button('{{ .ConfirmationURL }}', '로그인하기'),
    small(`링크는 ${strong(`${OTP_EXPIRY_MIN}분`)} 동안, 한 번만 쓸 수 있어요.`, 16),
    linkFallback('{{ .ConfirmationURL }}'),
    ignore('로그인되지 않습니다.'),
  ]),
  t('email_change', '[NURI HOLDEM] 새 이메일 주소를 확인해 주세요', '이메일 변경을 마치려면 확인이 필요해요.', [
    eyebrow('이메일 변경'),
    h1('새 이메일 주소를 확인해 주세요'),
    p(`계정 이메일을 ${strong('{{ .NewEmail }}')} 로 바꾸려면 아래 버튼을 눌러 주세요.`, 20),
    button('{{ .ConfirmationURL }}', '이메일 변경 확인하기'),
    small(`링크는 ${strong(`${OTP_EXPIRY_MIN}분`)} 동안, 한 번만 쓸 수 있어요.`, 16),
    linkFallback('{{ .ConfirmationURL }}'),
    ignore('이메일은 바뀌지 않습니다.'),
  ]),
  t('reauthentication', '[NURI HOLDEM] 본인 확인 인증번호', '비밀번호 변경을 위한 본인 확인이에요.', [
    eyebrow('본인 확인'),
    h1('본인 확인 인증번호'),
    p('비밀번호를 바꾸려면 아래 인증번호를 앱 화면에 입력해 주세요.', 20),
    codeBox('{{ .Token }}'),
    small(`인증번호는 ${strong(`${OTP_EXPIRY_MIN}분`)} 뒤에 만료돼요. 누구에게도 알려 주지 마세요 — 운영팀도 인증번호를 묻지 않습니다.`, 20),
    ignore('비밀번호는 바뀌지 않습니다.'),
  ]),
]);

/** 각 템플릿이 반드시 담아야 하는 Go 변수 — 원본 템플릿(대시보드 사본)에서 옮겨 적었다. 계약 테스트가 대조한다. */
export const REQUIRED_VARS: Record<string, string[]> = {
  confirmation: ['{{ .ConfirmationURL }}'],
  recovery: ['{{ .Token }}'],
  magic_link: ['{{ .ConfirmationURL }}'],
  email_change: ['{{ .ConfirmationURL }}', '{{ .NewEmail }}'],
  reauthentication: ['{{ .Token }}'],
};
