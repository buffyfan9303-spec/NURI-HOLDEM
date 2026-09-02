// 닉네임(profiles.name) 형식 검증 — 서버 is_name_available 과 같은 경계(공백 정리 후 2~20자).
import { describe, it, expect } from 'vitest';
import { isValidDisplayName } from './displayName';

describe('isValidDisplayName. 공백을 정리한 뒤 2~20자', () => {
  it('앞뒤 공백은 길이에 세지 않는다', () => {
    expect(isValidDisplayName('  a ')).toBe(false);   // 정리하면 1자
    expect(isValidDisplayName(' ab ')).toBe(true);
    expect(isValidDisplayName('   ')).toBe(false);
  });

  it('경계: 2자 통과 · 20자 통과 · 21자 탈락', () => {
    expect(isValidDisplayName('홍길')).toBe(true);
    expect(isValidDisplayName('가'.repeat(20))).toBe(true);
    expect(isValidDisplayName('가'.repeat(21))).toBe(false);
    expect(isValidDisplayName('')).toBe(false);
  });
});
