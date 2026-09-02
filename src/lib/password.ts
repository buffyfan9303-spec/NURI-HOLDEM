// src/lib/password.ts — 비밀번호 규칙(오너 지시 2026-09-03: 8자 이상 + 영문·숫자·특수문자. 같은 날 "대문자는 빼 달라" 로 대소문자 구분 없음).
// 서버(Supabase Auth → Password requirements)보다 클라이언트가 **같거나 더 엄격** 해야 여기서 통과한 값이
// signUp/updateUser 에서 영어 원문 에러로 튕기지 않는다. 대시보드 프리셋은 4개뿐(없음 / 영문+숫자 / 대·소문자+숫자 /
// 대·소문자+숫자+심볼)이라 서버는 '영문+숫자'(Letters and digits) 프리셋 + 최소 8자로 두고, 특수문자는 클라이언트가 더 요구한다.
// 특수문자 집합은 Supabase 가 허용하는 심볼과 동일: !@#$%^&*()_+-=[]{};'\:"|<>?,./`~

export const PASSWORD_RULES: ReadonlyArray<{ label: string; test: (pw: string) => boolean }> = [
  { label: '8자 이상',      test: (pw) => pw.length >= 8 },
  { label: '영문 포함',     test: (pw) => /[A-Za-z]/.test(pw) }, // 대소문자 구분 없음(오너 지시)
  { label: '숫자 포함',     test: (pw) => /\d/.test(pw) },
  { label: '특수문자 포함', test: (pw) => /[!@#$%^&*()_+\-=[\]{};'\\:"|<>?,./`~]/.test(pw) },
];

export const PASSWORD_RULE_HINT = '8자 이상, 영문·숫자·특수문자 포함';
export const PASSWORD_PLACEHOLDER = '8자 이상 · 영문·숫자·특수문자';

/** ok=모든 규칙 충족 · reasons=미충족 규칙 라벨(표시 순서 고정) */
export function validatePassword(pw: string): { ok: boolean; reasons: string[] } {
  const reasons = PASSWORD_RULES.filter((r) => !r.test(pw)).map((r) => r.label);
  return { ok: reasons.length === 0, reasons };
}
