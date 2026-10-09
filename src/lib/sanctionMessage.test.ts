// critical-211 P2-2 — 이메일이 없는 회원(카카오)도 제재 사유와 기간을 앱 안에서 받는다.
// 실행: npx vitest run src/lib/sanctionMessage.test.ts
import { describe, it, expect } from 'vitest';
import { sanctionMessage } from './sanctionMessage';

const until = new Date(Date.now() + 7 * 86_400_000).toISOString();

describe('sanctionMessage — 기간과 사유', () => {
  it('기간 정지: 기간과 사유를 모두 말한다', () => {
    const m = sanctionMessage({ status: 'suspended', suspendedUntil: until, sanctionReason: '반복 도배' })!;
    expect(m).toContain('이용이 일시 정지된 계정입니다');
    expect(m).toContain(new Date(until).toLocaleDateString());
    expect(m).toContain('사유: 반복 도배.');
  });

  it('영구 제한·기간 없는 정지도 사유를 말한다(끝 마침표는 한 번만)', () => {
    expect(sanctionMessage({ status: 'banned', sanctionReason: '불법 환전 권유.' })).toContain('사유: 불법 환전 권유. ');
    expect(sanctionMessage({ status: 'suspended', sanctionReason: '사칭' })).toContain('사유: 사칭.');
  });

  it('사유가 비면 사유 문장을 만들지 않는다', () => {
    expect(sanctionMessage({ status: 'banned', sanctionReason: '  ' })).toBe('이용이 영구 제한된 계정입니다. 고객센터로 문의해 주세요.');
  });

  it('정상·탈퇴 계정', () => {
    expect(sanctionMessage({ status: 'active' })).toBeNull();
    expect(sanctionMessage({ status: 'withdrawn', sanctionReason: '본인 탈퇴' })).not.toContain('사유');
  });
});
