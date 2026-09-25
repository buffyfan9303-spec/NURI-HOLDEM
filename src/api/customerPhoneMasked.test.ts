// CUSTOMER-PHONE-MASK(오너 2026-09-25) — 20260925h 가 손님 검색 RPC 5개에 phone_masked 를 실었다.
// 매핑이 그 칸을 phoneMasked 로 옮기고, 없거나 빈 값이면 null 로 만든다(화면은 null 이면 자리도 차지하지 않는다).
import { describe, it, expect } from 'vitest';
import { toTransferTarget, toVoucherRecipient } from './vouchers';
import { toMember } from './rankings';

const withPhone = { id: 'u1', display: '길동이', verified: true, phone_masked: '010-****-5678' };
const noPhone = { id: 'u2', display: '누구', verified: false, phone_masked: null };

describe('phone_masked → phoneMasked 매핑', () => {
  it('find_user_for_transfer / find_user_by_phone 행', () => {
    expect(toTransferTarget(withPhone)).toEqual({ id: 'u1', display: '길동이', verified: true, phoneMasked: '010-****-5678' });
    expect(toTransferTarget(noPhone).phoneMasked).toBeNull();
    // 20260925h 이전 행(칸 자체가 없음)·빈 문자열 → null
    expect(toTransferTarget({ id: 'u3', display: 'x' }).phoneMasked).toBeNull();
    expect(toTransferTarget({ id: 'u3', display: 'x', phone_masked: '' }).phoneMasked).toBeNull();
  });
  it('search_voucher_recipients 행', () => {
    const r = toVoucherRecipient({ user_id: 'u1', nickname: '길동이', real_name: null, verified: true, matched: 'partial', phone_masked: '010-****-5678' });
    expect(r.phoneMasked).toBe('010-****-5678');
    expect(toVoucherRecipient({ user_id: 'u2', nickname: 'a', verified: false, matched: 'partial' }).phoneMasked).toBeNull();
  });
  it('search_ranking_members / resolve_ranking_members 행', () => {
    expect(toMember({ id: 'u1', nickname: '길동이', real_name: '홍길동', verified: true, phone_masked: '010-****-5678' }).phoneMasked).toBe('010-****-5678');
    expect(toMember({ id: 'u2', nickname: 'a', real_name: null, verified: false, phone_masked: null }).phoneMasked).toBeNull();
  });
  it('원문 phone 은 어떤 매핑도 옮기지 않는다', () => {
    const leak = { ...withPhone, phone: '01012345678' };
    expect(JSON.stringify(toTransferTarget(leak))).not.toContain('01012345678');
    expect(JSON.stringify(toMember({ ...leak, real_name: null }))).not.toContain('01012345678');
  });
});
