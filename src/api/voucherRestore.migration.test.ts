// 이용권 복원·거절 가드가 **서버(SQL)** 에 실제로 적혀 있는가 (2026-09-11)
//
// 왜 마이그레이션 텍스트를 테스트하나
//   이용권이 거절·취소·만료로 증발하던 결함의 수정은 전부 DB 함수 안에 있다. DB 에 적용해야만 도는 코드라
//   단위 테스트가 실행으로 검증할 수 없다. 그래서 **복원 경로와 가드가 SQL 안에 실제로 적혀 있는지**를 잠근다.
//   (실행 검증은 적용 시 마이그레이션 하단의 검증 블록이 맡는다 — 어긋나면 전체 롤백.)
//
// 이 테스트가 잡는 회귀: 누가 복원 한 줄을 지우거나, reject 에 마감 가드를 '좋은 뜻으로' 넣거나,
// 헬퍼 ACL 을 열어 두는 것.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20260911b_voucher_restore_and_reject_guard.sql'),
  'utf-8',
);
/** 함수 본문만 잘라 본다 — 머리말 주석에 적힌 설명이 통과시켜 주는 착시를 막는다. */
const bodyOf = (name: string): string => {
  const start = SQL.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} 정의가 없다`).toBeGreaterThan(-1);
  const end = SQL.indexOf('$$;', SQL.indexOf('as $$', start));
  return SQL.slice(start, end);
};

describe('20260911b — 이용권은 거절·취소·만료 뒤 지갑으로 돌아간다', () => {
  it('복원 헬퍼는 used 인 이용권만 active 로 되돌리고 사용 흔적을 지운다', () => {
    const b = bodyOf('_restore_voucher');
    expect(b).toContain("set status = 'active', used_venue_id = null, used_at = null");
    expect(b).toContain("where id = p_voucher_id and status = 'used'");
  });

  it('헬퍼는 내부 전용이다 — anon·authenticated 에서 실행 권한을 회수한다', () => {
    expect(SQL).toContain('revoke all on function public._restore_voucher(uuid) from public, anon, authenticated;');
    expect(SQL).toContain('grant execute on function public._restore_voucher(uuid) to service_role;');
  });

  it('거절: 이미 처리된 요청은 뒤집지 못하고, 거절하면 이용권이 돌아온다', () => {
    const b = bodyOf('reject_buyin_request');
    expect(b).toContain("if r.status is distinct from 'pending' then raise exception");
    expect(b).toContain('perform public._restore_voucher(r.voucher_id);');
    // NULL-safe 권한 검사 — approve 와 같은 형태
    expect(b).toContain('if not coalesce(public.can_access_ledger(r.venue_id), false)');
  });

  it('거절 전이는 한 문장이다 — 검사와 갱신 사이에 승인이 끼어도 승인된 행을 덮지 않는다', () => {
    const b = bodyOf('reject_buyin_request');
    expect(b).toContain("where id = p_request_id and status = 'pending';");
    // 갱신 직후 not found 검사 → 그 뒤에야 복원
    const upd = b.indexOf("and status = 'pending';");
    expect(b.indexOf("if not found then raise exception '이미 처리된 요청입니다'", upd)).toBeGreaterThan(upd);
    expect(b.indexOf('_restore_voucher')).toBeGreaterThan(upd);
  });

  it('거절에는 마감 가드를 넣지 않는다 — 마감 뒤 남은 대기 요청을 닫을 유일한 길이다', () => {
    expect(bodyOf('reject_buyin_request')).not.toContain('ledger_is_closed');
  });

  it('손님 취소: 지워진 행의 이용권만 되돌린다(delete … returning 한 문장)', () => {
    const b = bodyOf('cancel_buyin_request');
    expect(b).toContain('returning voucher_id into v_voucher');
    expect(b).toContain('perform public._restore_voucher(v_voucher);');
    // 복원이 삭제 **뒤**에 온다 — 조회→삭제 사이에 승인이 끼면 이중 상태가 된다
    expect(b.indexOf('delete from public.ledger_buyin_requests')).toBeLessThan(b.indexOf('_restore_voucher'));
  });

  it('크론 만료: 삭제와 복원이 한 문장(CTE)이라 실제로 지워진 행의 이용권만 되돌린다', () => {
    const b = bodyOf('expire_old_buyin_requests');
    expect(b).toContain('returning r.voucher_id');
    expect(b).toContain("set status = 'active', used_venue_id = null, used_at = null");
    // delete(del) → update(restored) 순서, 그리고 복원 대상은 del 에서만 고른다
    expect(b.indexOf('delete from ledger_buyin_requests')).toBeLessThan(b.indexOf('update public.store_vouchers'));
    expect(b).toContain('select d.voucher_id from del d where d.voucher_id is not null');
    expect(b).toContain('select count(*) into n from del;');
    expect(b).not.toContain('get diagnostics');
    // 20260818f 의 만료 조건(영업일·미마감 장부)이 그대로다
    expect(b).toContain("v_today date := (now() at time zone 'Asia/Seoul')::date");
    expect(b).toContain('ls.closed = false');
  });

  it('네 함수 모두 search_path 를 고정하고, CREATE OR REPLACE 뒤 ACL 을 다시 쓴다', () => {
    for (const fn of ['_restore_voucher', 'reject_buyin_request', 'cancel_buyin_request', 'expire_old_buyin_requests']) {
      expect(bodyOf(fn), `${fn} 에 search_path 고정이 없다`).toContain('set search_path = public, pg_temp');
    }
    for (const fn of ['reject_buyin_request(uuid, text)', 'cancel_buyin_request(uuid)']) {
      expect(SQL).toContain(`revoke all on function public.${fn} from public, anon;`);
      expect(SQL).toContain(`grant execute on function public.${fn} to authenticated, service_role;`);
    }
    expect(SQL).toContain('revoke all on function public.expire_old_buyin_requests() from public, anon, authenticated;');
  });

  it('적용 직후 스스로 검증하고 어긋나면 중단한다', () => {
    expect(SQL).toContain("raise exception 'ABORT: reject 에 이용권 복원 없음'");
    expect(SQL).toContain("raise exception 'ABORT: reject 에 마감 가드가 들어갔다");
    expect(SQL).toContain("raise exception 'ABORT: _restore_voucher 가 외부에 열려 있다'");
  });
});
