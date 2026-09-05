// 이용권 발급 근거 목록 — 클라 VOUCHER_REASONS 와 서버(20260905h) CHECK/검증 목록이 같아야 한다.
// 어긋나면 업주의 모든 발급이 서버에서 '발급 사유를 골라 주세요' 로 막힌다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOUCHER_REASONS, voucherReasonLabel } from './vouchers';

const SQL = readFileSync(join(process.cwd(), 'supabase/migrations/20260905h_national_career_board_and_voucher_reason.sql'), 'utf8');
const parse = (src: string) => [...src.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);

describe('VOUCHER_REASONS ↔ 서버 목록', () => {
  const client = VOUCHER_REASONS.map((r) => r.value).sort();
  it('CHECK 제약의 값 집합과 같다', () => {
    const m = SQL.match(/issue_reason in \(([^)]*)\)/);
    expect(m, 'CHECK 제약을 못 찾음').toBeTruthy();
    expect(parse(m![1]).sort()).toEqual(client);
  });
  it('issue_voucher 의 v_reason not in (...) 목록과 같다', () => {
    const m = SQL.match(/v_reason not in \(([^)]*)\)/);
    expect(m, 'v_reason 검증을 못 찾음').toBeTruthy();
    expect(parse(m![1]).sort()).toEqual(client);
  });
  it("구형 클라 기본값 'service' 가 목록에 있다", () => {
    expect(SQL).toMatch(/p_reason text default 'service'/);
    expect(client).toContain('service');
  });
  it('라벨은 전부 한국어이고 순위·시상 사유는 없다', () => {
    for (const r of VOUCHER_REASONS) expect(r.label).not.toMatch(/순위|시상|입상|우승/);
    expect(voucherReasonLabel('bogus')).toBe('');
  });
});
