import { describe, it, expect } from 'vitest';
import { maskPhone } from './maskPhone';

// 오너 2026-09-25 CUSTOMER-PHONE-MASK — 앞 3 · 가운데 별표 · 뒤 4. 음성 대조: 가운데 숫자가 하나라도 남으면 실패.
describe('maskPhone', () => {
  it('휴대폰(하이픈·무하이픈) → 010-****-5678', () => {
    expect(maskPhone('010-1234-5678')).toBe('010-****-5678');
    expect(maskPhone('01012345678')).toBe('010-****-5678');
    expect(maskPhone(' 010 1234 5678 ')).toBe('010-****-5678');
  });
  it('가운데 숫자가 절대 남지 않는다', () => {
    for (const p of ['010-1234-5678', '01012345678', '02-123-4567', '+82-10-1234-5678']) {
      const out = maskPhone(p).replace(/[^0-9*]/g, '');
      expect(out.slice(3, -4)).toMatch(/^\*+$/);
    }
  });
  it('지역번호·국제번호도 같은 규칙', () => {
    expect(maskPhone('02-123-4567')).toBe('021-**-4567');
    expect(maskPhone('+82-10-1234-5678')).toBe('+821-*****-5678');
  });
  it('빈값·null·undefined·숫자 없음 → 빈 문자열', () => {
    expect(maskPhone('')).toBe('');
    expect(maskPhone('   ')).toBe('');
    expect(maskPhone(null)).toBe('');
    expect(maskPhone(undefined)).toBe('');
    expect(maskPhone('없음')).toBe('');
  });
  it('짧은 번호는 뒤 4자리만 남는다', () => {
    expect(maskPhone('1234')).toBe('****');
    expect(maskPhone('123456')).toBe('**-3456');
    expect(maskPhone('1234567')).toBe('123-4567');
  });
});
