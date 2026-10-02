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
import { voucherErrorText, ownerSafe } from './vouchers';

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
    expect(SRC).toMatch(/redeemMyVouchersByQr[\s\S]{0,220}\.then\(humanize\)/);
    expect(SRC).toMatch(/redeemMyVouchersByPhone[\s\S]{0,220}\.then\(humanize\)/);
  });

  it('🔴 업주 경로는 손님 문장(humanize)이 아니라 ownerSafe(msgOf)로 거른다 — 2026-10-03 D1', () => {
    // 종전엔 원문 그대로였다(보안 표준 6 과 충돌). 사장님에게 필요한 한국어 사유는 남기고 SQL·식별자만 막는다.
    expect(SRC).toContain('export const deleteVouchers = (ids: string[]) => bulk(ids, deleteVoucher).then(ownerSafe);');
    expect(SRC).not.toMatch(/deleteVouchers[\s\S]{0,120}\.then\(humanize\)/);
    const revoke = SRC.slice(SRC.indexOf('export async function revokeVouchers'));
    const body = revoke.slice(0, revoke.search(/\r?\n\}/));
    expect(body).not.toContain('humanize');
    expect(body).not.toMatch(/reasons: \[error\.message\]/);
    expect(body).toMatch(/bulk\(ids, revokeVoucher\)\.then\(ownerSafe\)/);
    expect(body).toMatch(/return ownerSafe\(\{/);
  });
});

describe('ownerSafe — 업주 화면 사유', () => {
  it('🔴 SQL·제약·테이블 이름 원문은 막고, 서버의 한국어 사유는 그대로 둔다', () => {
    const r = ownerSafe({ ok: 1, failed: 3, reasons: [
      'duplicate key value violates unique constraint "store_vouchers_pkey"',
      '이미 사용한 이용권입니다',
      'permission denied for table store_vouchers',
    ] });
    const all = r.reasons.join(' | ');
    expect(all).not.toMatch(/pkey|store_vouchers|duplicate key|permission denied/);
    expect(r.reasons).toContain('이미 사용한 이용권입니다');
    expect(r.reasons.some((m) => m.includes('권한'))).toBe(true);
    expect(r).toMatchObject({ ok: 1, failed: 3 });
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
