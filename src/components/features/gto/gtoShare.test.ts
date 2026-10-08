// H03-01 — 공유 해시(#gto=)가 잘못된 % escape 여도 던지지 않는다. 던지면 App 최상위 ErrorBoundary 까지 올라가 앱 전체가 오류 화면이 된다.
import { describe, it, expect } from 'vitest';
import { decodeSpot, readGtoHash } from './gtoShare';

describe('readGtoHash', () => {
  it('잘못된 escape 는 null(던지지 않음)', () => {
    for (const h of ['#gto=%', '#gto=%E0%A4%A', '#gto=%ZZ', '#gto=As%']) {
      expect(() => readGtoHash(h)).not.toThrow();
      expect(readGtoHash(h)).toBeNull();
    }
  });
  it('빈 값·해시 없음은 null', () => {
    expect(readGtoHash('')).toBeNull();
    expect(readGtoHash('#gto=')).toBeNull();
    expect(readGtoHash('#tool=icm')).toBeNull();
  });
  it('정상 코드·정상 escape 는 그대로', () => {
    expect(readGtoHash('#gto=AsKd-QhJh-2c3d4h')).toBe('AsKd-QhJh-2c3d4h');
    expect(readGtoHash('#gto=%41s')).toBe('As');
    expect(decodeSpot(readGtoHash('#gto=AsKd-QhJh-2c3d4h')!).board).toHaveLength(3);
  });
  it('길이 초과 코드는 null(정상 최대 = 4+1+4+1+10 = 20자)', () => {
    expect(readGtoHash('#gto=' + 'As'.repeat(5000))).toBeNull();
  });
});
