import { describe, it, expect } from 'vitest';
import { voucherRecipientLabel, type VoucherRecipient } from './vouchers';

const base: VoucherRecipient = { userId: 'u', nickname: '길동이', realName: null, verified: true, matched: 'partial' };

describe('voucherRecipientLabel — 후보 한 줄(오너 2026-09-24: 실명 → 닉네임)', () => {
  it('실명이 확인된 후보는 "실명 → 닉네임"', () => {
    expect(voucherRecipientLabel({ ...base, realName: '홍길동', matched: 'real_name' }, '홍길동')).toBe('홍길동 → 길동이');
  });
  it('옛 닉네임으로 찾았으면 "옛 → 지금"', () => {
    expect(voucherRecipientLabel({ ...base, matched: 'old_nickname' }, ' 동이 ')).toBe('동이 → 길동이');
  });
  it('실명이 없으면(서버가 안 실음) 닉네임만 — 입력이 실명처럼 보여도 지어내지 않는다', () => {
    expect(voucherRecipientLabel(base, '홍길')).toBe('길동이');
  });
});
