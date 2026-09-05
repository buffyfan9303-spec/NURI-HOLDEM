// '보유 중' 술어 — 지갑(VoucherWallet)과 시트의 매장별 장수(MyVoucherSheet)가 같이 쓰는 단일 정본.
// 회수는 used_at 을 남기지 않고 status 만 바꾸고, 만료는 status 가 active 인 채 expires_at 만 지난다 —
// 어느 한쪽만 걸러도 장수가 부풀려진다(2026-09-05 점검 #9).
import { describe, it, expect } from 'vitest';
import { isHeldVoucher } from './vouchers';

const NOW = Date.parse('2026-09-05T12:00:00+09:00');

describe('isHeldVoucher', () => {
  it('정상(active · 무기한 또는 만료 전)은 보유', () => {
    expect(isHeldVoucher({ status: 'active', expiresAt: null }, NOW)).toBe(true);
    expect(isHeldVoucher({ status: 'active', expiresAt: '2026-09-06T00:00:00+09:00' }, NOW)).toBe(true);
  });
  it('사용됨(used)은 보유 아님', () => {
    expect(isHeldVoucher({ status: 'used', expiresAt: null }, NOW)).toBe(false);
  });
  it('회수됨(revoked · used_at 은 null)은 보유 아님', () => {
    expect(isHeldVoucher({ status: 'revoked', expiresAt: null }, NOW)).toBe(false);
  });
  it('만료됨(status 는 active · expires_at 이 지남)은 보유 아님', () => {
    expect(isHeldVoucher({ status: 'active', expiresAt: '2026-09-05T11:59:59+09:00' }, NOW)).toBe(false);
  });
});
