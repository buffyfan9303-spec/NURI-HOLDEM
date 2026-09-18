// 이용권 발급 근거 목록 — 클라 VOUCHER_REASONS 와 서버(20260905h 기반 + 20260919a 패치) CHECK/검증
// 목록이 같아야 한다. 어긋나면 업주의 모든 발급이 서버에서 '발급 사유를 골라 주세요' 로 막힌다.
//
// 20260919a(2026-09-19, 오너 "내역도 '이용권 지급'으로 보이게 해라") 가 'grant' 를 추가했다.
// 그 마이그레이션은 라이브 함수를 **문자열 치환**으로 패치한다(본문을 다시 타이핑하지 않는다) —
// 그래서 issue_voucher 쪽은 20260905h 의 원본 함수 정의가 아니라 20260919a 의 `$new$…$new$`
// 치환 결과 리터럴을 정본으로 본다(그게 패치 후 실제로 함수에 들어간 값이다).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOUCHER_REASONS, voucherReasonLabel } from './vouchers';

const BASE_SQL = readFileSync(join(process.cwd(), 'supabase/migrations/20260905h_national_career_board_and_voucher_reason.sql'), 'utf8');
const GRANT_SQL = readFileSync(join(process.cwd(), 'supabase/migrations/20260919a_voucher_reason_grant.sql'), 'utf8');
const parse = (src: string) => [...src.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);

describe('VOUCHER_REASONS ↔ 서버 목록', () => {
  const client = VOUCHER_REASONS.map((r) => r.value).sort();
  it('CHECK 제약(20260919a, 최신)의 값 집합과 같다', () => {
    const m = GRANT_SQL.match(/issue_reason in \(([^)]*)\)/);
    expect(m, 'CHECK 제약을 못 찾음').toBeTruthy();
    expect(parse(m![1]).sort()).toEqual(client);
  });
  it('issue_voucher 가드의 패치 후(new) 목록과 같다', () => {
    const m = GRANT_SQL.match(/\$new\$in \(([^)]*)\)\$new\$/);
    expect(m, 'v_reason 새 목록을 못 찾음').toBeTruthy();
    expect(parse(m![1]).sort()).toEqual(client);
  });
  it('20260919a 는 패치 전(old) 목록으로 기존 5개를 그대로 넓힌다(누락 없음)', () => {
    const m = GRANT_SQL.match(/\$old\$in \(([^)]*)\)\$old\$/);
    expect(m, 'v_reason 옛 목록을 못 찾음').toBeTruthy();
    expect(parse(m![1]).sort()).toEqual(['event', 'other', 'service', 'visit', 'welcome']);
  });
  it("구형 클라 기본값 'service' 가 목록에 있다", () => {
    expect(BASE_SQL).toMatch(/p_reason text default 'service'/);
    expect(client).toContain('service');
  });
  it('라벨은 전부 한국어이고 순위·시상 사유는 없다', () => {
    for (const r of VOUCHER_REASONS) expect(r.label).not.toMatch(/순위|시상|입상|우승/);
    expect(voucherReasonLabel('bogus')).toBe('');
  });
});
