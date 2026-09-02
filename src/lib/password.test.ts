import { describe, it, expect } from 'vitest';
import { validatePassword } from './password';

describe('validatePassword — 8자 이상 · 대문자 · 소문자 · 숫자 · 특수문자(서버 가장 강한 프리셋과 동일 집합)', () => {
  it('규칙을 모두 만족하면 ok', () => {
    expect(validatePassword('Holdem!pass1')).toEqual({ ok: true, reasons: [] });
    expect(validatePassword('Abcdef1~')).toEqual({ ok: true, reasons: [] }); // ` ~ 도 특수문자
  });

  it('미충족 항목을 순서대로 알려 준다', () => {
    expect(validatePassword('abc')).toEqual({ ok: false, reasons: ['8자 이상', '대문자 포함', '숫자 포함', '특수문자 포함'] });
    expect(validatePassword('ABCDEF1!')).toEqual({ ok: false, reasons: ['소문자 포함'] });
    expect(validatePassword('Holdem!pass')).toEqual({ ok: false, reasons: ['숫자 포함'] }); // 숫자 없으면 서버가 거부하므로 여기서도 막는다
    expect(validatePassword('Abcdefgh1')).toEqual({ ok: false, reasons: ['특수문자 포함'] }); // 숫자는 특수문자가 아니다
    expect(validatePassword('')).toEqual({ ok: false, reasons: ['8자 이상', '대문자 포함', '소문자 포함', '숫자 포함', '특수문자 포함'] });
  });

  it('길이는 7자면 실패, 8자면 통과', () => {
    expect(validatePassword('Abcde1!').ok).toBe(false);
    expect(validatePassword('Abcdef1!').ok).toBe(true);
  });
});
