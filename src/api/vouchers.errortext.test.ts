// 손님 화면에 나가는 이용권 실패 문구 — DB 원문이 그대로 새지 않는가 (2026-09-11)
//
// 배경(2026-09-11 장부 점검): 같은 날 같은 매장에 이용권 2장을 보내면 두 번째가 대기중 유니크
//   인덱스에 걸린다. 그때 PostgREST 가 준 영문 원문
//   `duplicate key value violates unique constraint "buyin_requests_pending_uidx"` 이
//   **내부 인덱스 이름까지 달고** 손님 토스트에 그대로 떴다.
//   CLAUDE.md 보안 표준 §6(에러 메시지에 내부 식별자·SQL 을 노출하지 않는다)에 걸린다.
//
// 이 테스트가 잡는 회귀: 매핑을 지우거나, 업주용 경로까지 뭉뚱그려 원문을 잃는 것.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { voucherErrorText } from './vouchers';

describe('voucherErrorText — 내부 식별자를 손님에게 보이지 않는다', () => {
  it('🔴 유니크 위반 원문이 그대로 나가지 않는다', () => {
    const raw = 'duplicate key value violates unique constraint "buyin_requests_pending_uidx"';
    const out = voucherErrorText(raw);
    expect(out).not.toContain('uidx');
    expect(out).not.toContain('duplicate key');
    expect(out).toContain('같은 날 같은 매장');
  });

  it.each([
    ['permission denied for table store_vouchers', '권한'],
    ['new row violates row-level security policy', '권한'],
    ['insert or update violates foreign key constraint "x_fkey"', '매장'],
    ['fetch failed', '통신'],
    ['statement timeout', '통신'],
  ])('영문 원문 %s → 사람 말', (raw, expected) => {
    const out = voucherErrorText(raw);
    expect(out).toContain(expected);
    expect(out).not.toContain(raw);
  });

  it('모르는 영문 원문도 통째로 새지 않는다 (기본값이 안전한 쪽)', () => {
    const raw = 'ERROR: relation "secret_settings" does not exist at character 42';
    const out = voucherErrorText(raw);
    expect(out).not.toContain('secret_settings');
    expect(out).toBe('처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  });

  it('🔴 우리가 쓴 한국어 문구는 그대로 통과한다 — 그게 정본이다', () => {
    for (const ours of [
      '유효기간이 지난 이용권입니다 (만료 2026-09-01)',
      '이 매장에서만 사용할 수 있어요',
      '이미 사용한 이용권입니다',
    ]) expect(voucherErrorText(ours)).toBe(ours);
  });

  it('빈 문자열도 빈 토스트를 만들지 않는다', () => {
    expect(voucherErrorText('')).toBeTruthy();
    expect(voucherErrorText('   ')).toBeTruthy();
  });
});

describe('매핑을 거는 자리 — 손님 경로에만', () => {
  const SRC = readFileSync(join(__dirname, 'vouchers.ts'), 'utf8');

  it('손님 사용 경로 2개는 사람 말로 바꾼다', () => {
    expect(SRC).toMatch(/redeemMyVouchersByQr[\s\S]{0,160}\.then\(humanize\)/);
    expect(SRC).toMatch(/redeemMyVouchersByPhone[\s\S]{0,160}\.then\(humanize\)/);
  });

  it('🔴 업주 경로는 원문을 잃지 않는다 — 사장님은 원문을 봐야 문의를 넣을 수 있다', () => {
    // deleteVouchers / revokeVouchers 는 bulk 결과를 그대로 돌려준다.
    expect(SRC).toContain('export const deleteVouchers = (ids: string[]) => bulk(ids, deleteVoucher);');
    expect(SRC).not.toMatch(/deleteVouchers[\s\S]{0,120}\.then\(humanize\)/);
    const revoke = SRC.slice(SRC.indexOf('export async function revokeVouchers'));
    expect(revoke.slice(0, revoke.indexOf('\n}'))).not.toContain('humanize');
  });
});

describe('부분 실패를 초록 토스트로 띄우지 않는다', () => {
  const UI = readFileSync(join(__dirname, '..', 'components', 'features', 'MyVoucherSheet.tsx'), 'utf8');

  it('🔴 토스트 색을 전량 성공 여부로 정한다', () => {
    expect(UI).toContain("toast.show(msg, ok ? 'success' : 'error')");
    expect(UI).not.toContain("toast.show(msg, 'success')");
  });

  it('전량 성공일 때만 ok=true 로 넘긴다', () => {
    expect(UI).toContain('r.failed === 0,');
  });
});
