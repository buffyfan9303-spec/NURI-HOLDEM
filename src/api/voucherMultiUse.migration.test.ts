// 이용권 N장이 같은 날 같은 매장에 들어갈 수 있는가 — 그 규칙이 **서버(SQL)** 에 적혀 있는가 (2026-09-11, M1)
//
// 왜 마이그레이션 텍스트를 테스트하나
//   '대기 유니크 인덱스'와 'request_buyin 의 중복 접기'는 DB 안에만 있는 규칙이라 단위 테스트가
//   실행으로 검증할 수 없다. 그래서 두 규칙이 **같은 조건(voucher_id is null)으로** SQL 에 적혀 있는지를 잠근다.
//   둘 중 하나만 되돌아가면 그 자체가 결함이다 — 인덱스만 풀면 request_buyin 의 UPDATE 가
//   이용권 대기 행 전부의 note·requested_game_seq 를 덮어쓰고, request_buyin 만 고치면 2장째가 그대로 실패한다.
//   (실행 검증은 적용 시 파일 하단의 검증 블록이 맡는다 — 어긋나면 전체 롤백.)
//
// 이 테스트가 잡는 회귀: 누가 인덱스 조건을 예전으로 되돌리거나, request_buyin 을 옛 본문으로 덮거나,
// ACL 재발급을 빠뜨리거나, RLS 에서 voucher_id 차단을 빼는 것.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20260911g_voucher_multi_use_pending_uniq.sql'),
  'utf-8',
);
/** 주석(-- …)을 걷어낸 실행 텍스트만 본다 — 머리말·ROLLBACK 주석이 통과시켜 주는 착시를 막는다. */
const CODE = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
/** 함수 본문만 잘라 본다. */
const bodyOf = (name: string): string => {
  const start = CODE.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} 정의가 없다`).toBeGreaterThan(-1);
  return CODE.slice(start, CODE.indexOf('$function$;', start));
};

describe('20260911g — 이용권 N장은 대기 요청 N건이 된다', () => {
  it('대기 유니크 인덱스는 이용권이 붙지 않은 요청에만 걸린다', () => {
    expect(CODE).toContain('drop index if exists public.ledger_buyin_req_uniq_pending;');
    expect(CODE).toContain('on public.ledger_buyin_requests (venue_id, session_date, user_id)');
    expect(CODE).toContain("where status = 'pending' and voucher_id is null;");
    // 이름은 유지한다 — baseline·운영 로그가 이 이름으로 남아 있다
    expect(CODE).toContain('create unique index if not exists ledger_buyin_req_uniq_pending');
  });

  it("예전의 넓은 조건(status='pending' 만)은 실행 텍스트에 남아 있지 않다", () => {
    expect(CODE).not.toMatch(/where\s+status\s*=\s*'pending'\s*;/);
  });

  it('이용권 1장당 요청 1건을 막는 인덱스는 건드리지 않는다', () => {
    expect(CODE).not.toMatch(/drop\s+index\s+if\s+exists\s+(public\.)?uniq_ledger_req_voucher/);
  });

  it('request_buyin 의 중복 접기도 같은 조건으로 좁혀졌다 — 검사와 갱신 두 곳 모두', () => {
    const b = bodyOf('request_buyin');
    const hits = b.match(/and status = 'pending' and voucher_id is null/g) ?? [];
    expect(hits.length, '검사(if exists)와 갱신(update … where) 두 곳이어야 한다').toBe(2);
  });

  it('request_buyin 의 영업일 귀속·날짜 가드는 그대로다 (옛 정의를 베껴 오다 잃는 자리)', () => {
    const b = bodyOf('request_buyin');
    expect(b).toContain('v_biz := public.ledger_business_date(p_venue_id);');   // 20260818f
    expect(b).toContain('현장 참가 신청은 대회 당일에만');                        // 20260726b
    expect(b).toContain('security definer');
    expect(b).toContain('set search_path = public, pg_temp');
  });

  it('CREATE OR REPLACE 뒤 ACL 을 다시 쓴다 — from anon 만으로는 무효다', () => {
    expect(CODE).toContain('revoke all on function public.request_buyin(uuid, text, smallint, date) from public, anon;');
    expect(CODE).toContain('grant execute on function public.request_buyin(uuid, text, smallint, date) to authenticated, service_role;');
  });

  it('클라이언트는 voucher_id 를 직접 꽂을 수 없다 — 인덱스를 좁힌 만큼 RLS 로 되돌린다', () => {
    expect(CODE).toContain('drop policy if exists lbr_insert_self on public.ledger_buyin_requests;');
    expect(CODE).toContain('with check (user_id = (select auth.uid()) and voucher_id is null);');
  });

  it('적용 직후 스스로 확인하고 어긋나면 중단한다', () => {
    expect(CODE).toContain('raise exception');
    expect(SQL).toMatch(/ABORT: 대기 인덱스가 아직 이용권 요청까지 막는다/);
    expect(SQL).toMatch(/ABORT: request_buyin 의 중복 접기가 두 곳/);
    expect(SQL).toMatch(/ABORT: 클라이언트가 voucher_id 를 직접 꽂을 수 있다/);
  });
});
