// src/lib/password.ts — 비밀번호 규칙(오너 지시 2026-09-03: 8자 이상 + 대문자·특수문자).
// 서버(Supabase Auth → Password requirements)와 같은 규칙을 클라이언트에서 먼저 걸러
// "왜 안 되는지" 를 입력 아래에 보여 준다. 숫자는 오너 지시 범위 밖이라 요구하지 않는다.
// 특수문자 집합은 Supabase 가 허용하는 심볼과 동일: !@#$%^&*()_+-=[]{};'\:"|<>?,./`~

export const PASSWORD_RULES: ReadonlyArray<{ label: string; test: (pw: string) => boolean }> = [
  { label: '8자 이상',      test: (pw) => pw.length >= 8 },
  { label: '대문자 포함',   test: (pw) => /[A-Z]/.test(pw) },
  { label: '소문자 포함',   test: (pw) => /[a-z]/.test(pw) },
  { label: '특수문자 포함', test: (pw) => /[!@#$%^&*()_+\-=[\]{};'\\:"|<>?,./`~]/.test(pw) },
];

export const PASSWORD_RULE_HINT = '8자 이상, 대문자·특수문자 포함';
export const PASSWORD_PLACEHOLDER = '8자 이상 · 대문자·특수문자';

/** ok=모든 규칙 충족 · reasons=미충족 규칙 라벨(표시 순서 고정) */
export function validatePassword(pw: string): { ok: boolean; reasons: string[] } {
  const reasons = PASSWORD_RULES.filter((r) => !r.test(pw)).map((r) => r.label);
  return { ok: reasons.length === 0, reasons };
}
