import { describe, it, expect } from 'vitest';
import { stripVenuePrefix, voucherGroupLabel, voucherLineLabel } from './voucherLabel';

describe('stripVenuePrefix', () => {
  it('업주가 손으로 박아 둔 매장명 접두사를 걷어낸다(라이브 데이터 100/101장의 실제 형태)', () => {
    expect(stripVenuePrefix('로티아레나 매장이용권', '로티아레나')).toBe('매장이용권');
  });
  it('구분자가 끼어 있어도 걷어낸다', () => {
    expect(stripVenuePrefix('로티아레나 · 데일리 참가권', '로티아레나')).toBe('데일리 참가권');
    expect(stripVenuePrefix('로티아레나-데일리 참가권', '로티아레나')).toBe('데일리 참가권');
  });
  it('접두사가 없으면 그대로 둔다', () => {
    expect(stripVenuePrefix('데일리 1회 참가권', '로티아레나')).toBe('데일리 1회 참가권');
  });
  it('다른 매장명이 앞에 있으면 건드리지 않는다(오표기를 조용히 지우지 않는다)', () => {
    expect(stripVenuePrefix('강남홀덤 매장이용권', '로티아레나')).toBe('강남홀덤 매장이용권');
  });
  it('제목이 매장명뿐이면 기본 명칭으로 되돌린다. 빈 줄 금지', () => {
    expect(stripVenuePrefix('로티아레나', '로티아레나')).toBe('매장이용권');
    expect(stripVenuePrefix('로티아레나 ·', '로티아레나')).toBe('매장이용권');
  });
  it('매장명을 모르면 제목을 그대로 쓴다', () => {
    expect(stripVenuePrefix('로티아레나 매장이용권', null)).toBe('로티아레나 매장이용권');
  });
  it('빈 제목은 기본 명칭', () => {
    expect(stripVenuePrefix('', '로티아레나')).toBe('매장이용권');
    expect(stripVenuePrefix('   ', '로티아레나')).toBe('매장이용권');
  });
  it('연속 공백을 정규화한다', () => {
    expect(stripVenuePrefix('로티아레나   매장이용권', '로티아레나')).toBe('매장이용권');
  });
});

describe('voucherGroupLabel', () => {
  it('매장명 + 매장이용권', () => {
    expect(voucherGroupLabel('로티아레나')).toBe('로티아레나 매장이용권');
  });
  it('매장명을 모르면 억지 합성 대신 미확인으로 말한다', () => {
    expect(voucherGroupLabel(null)).toBe('발급 매장 미확인');
    expect(voucherGroupLabel('  ')).toBe('발급 매장 미확인');
  });
});

describe('voucherLineLabel', () => {
  it('한 줄 안에서 매장 · 이용권 · 중복 접두사 제거 후 합성', () => {
    expect(voucherLineLabel('로티아레나 매장이용권', '로티아레나')).toBe('로티아레나 · 매장이용권');
  });
  it('매장명이 없으면 제목만', () => {
    expect(voucherLineLabel('데일리 참가권', null)).toBe('데일리 참가권');
  });
});
