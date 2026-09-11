// 일괄 삭제 두 경로에서도 이용권이 지갑으로 돌아가는가 — **서버(SQL)** 계약 (20260911i, 2026-09-11)
//
// 왜 마이그레이션 텍스트를 테스트하나
//   20260911b·c 가 다섯 경로를 닫은 뒤에도, 바인을 여러 건 한꺼번에 지우는 두 경로
//   (delete_ledger_player · delete_ledger_session)가 티켓 바인을 그대로 지워 이용권을 'used' 에 가뒀다.
//   수정은 전부 DB 함수 안이라 단위 테스트가 실행으로 검증할 수 없다 → SQL 텍스트를 잠근다
//   (실행 검증은 적용 시 마이그레이션 하단 검증 블록이 맡는다 — 어긋나면 전체 롤백).
//
// 이 테스트가 잡는 회귀: 복원 호출을 지우는 것 · 헬퍼를 한 벌 더 만드는 것 ·
// 비밀번호/마감/권한 가드를 복원 작업 중에 흘리는 것 · create or replace 뒤 ACL 재선언을 빠뜨리는 것 ·
// 장부 삭제에 '좋은 뜻으로' 마감 가드를 넣어 마감 장부를 못 지우게 만드는 것.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20260911i_bulk_delete_voucher_restore.sql'),
  'utf-8',
);
/** 함수 본문만 잘라 본다 — 머리말 주석이 통과시켜 주는 착시를 막는다(20260911b·c 테스트와 같은 관행). */
const bodyOf = (name: string): string => {
  const start = SQL.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} 정의가 없다`).toBeGreaterThan(-1);
  const end = SQL.indexOf('$$;', SQL.indexOf('as $$', start));
  return SQL.slice(start, end);
};

describe('20260911i — 일괄 삭제도 이용권을 지갑으로 되돌린다', () => {
  it('선행 마이그레이션을 머리말에 못박는다', () => {
    expect(SQL).toContain('20260911b');
    expect(SQL).toContain('20260911c');
  });

  it('복원 규칙은 한 벌뿐이다 — 헬퍼를 새로 만들지 않고 20260911c 것을 쓴다', () => {
    expect(SQL).not.toContain('create or replace function public._restore_voucher');
    expect(SQL).toContain('perform public._restore_voucher_for_request(v_req);');
  });

  for (const fn of ['delete_ledger_player', 'delete_ledger_session']) {
    it(`${fn}: 실제로 지워진 바인의 요청만 되돌린다(delete … returning)`, () => {
      const b = bodyOf(fn);
      expect(b).toContain('returning request_id');
      expect(b).toContain('_restore_voucher_for_request');
      // 복원은 삭제 **뒤**에 온다 — 먼저 되돌리면 삭제가 막혔을 때 이용권만 풀린다
      expect(b.indexOf('delete from public.ledger_buyins'))
        .toBeLessThan(b.indexOf('_restore_voucher_for_request'));
      // 지워진 행에서만 고른다(테이블을 다시 훑지 않는다)
      expect(b).toContain('select array_agg(distinct d.request_id) into v_reqs from del d where d.request_id is not null;');
    });
  }

  it('플레이어 삭제: 비밀번호·마감 가드가 그대로고 권한 판정이 NULL-safe 다', () => {
    const b = bodyOf('delete_ledger_player');
    expect(b).toContain('cancel_password_hash');
    expect(b).toContain('ledger_is_closed');
    expect(b).toContain("my_role() is distinct from 'admin'::user_role");
    expect(b).toContain('if not coalesce(can_access_ledger(v.venue_id), false)');
    // 원래 하던 일(명단 행 삭제)을 계속 한다
    expect(b).toContain('delete from public.ledger_players where id = p_player_id;');
  });

  it('장부 삭제: 권한 가드가 그대로고 명단·세션도 계속 지운다(기능 보존)', () => {
    const b = bodyOf('delete_ledger_session');
    expect(b).toContain('if not coalesce(public.can_manage_pos(p_venue_id), false)');
    expect(b).toContain('delete from public.ledger_players');
    expect(b).toContain('delete from public.ledger_sessions');
    // 마감된 장부를 지우는 것이 이 함수의 용도다 — 마감 가드를 넣으면 영영 못 지운다
    expect(b).not.toContain('ledger_is_closed');
  });

  it('create or replace 가 지운 ACL 을 두 함수 모두 다시 닫는다(PUBLIC 포함)', () => {
    expect(SQL).toContain('revoke all on function public.delete_ledger_player(uuid, text) from public, anon;');
    expect(SQL).toContain('grant execute on function public.delete_ledger_player(uuid, text) to authenticated, service_role;');
    expect(SQL).toContain('revoke all on function public.delete_ledger_session(uuid, date, smallint) from public, anon;');
    expect(SQL).toContain('grant execute on function public.delete_ledger_session(uuid, date, smallint) to authenticated, service_role;');
  });

  it('앞으로 생길 삭제 경로까지 같은 규칙 아래 둔다 — 적용 시 전수 검사가 돈다', () => {
    expect(SQL).toContain("p.prosrc ~ 'delete\\s+from\\s+(public\\.)?ledger_buyins\\M'");
    // LIKE '%_restore_voucher%' 는 `_` 가 와일드카드라 느슨하다 — 정확한 substring 비교를 잠근다
    expect(SQL).toContain("strpos(p.prosrc, '_restore_voucher') = 0");
    expect(SQL).toContain('ABORT: 이용권 복원 없이 바인을 지우는 함수가 남아 있다');
  });

  it('검증 ④ 를 요청 테이블까지 넓히지 않는다 — 넓히면 expire 가 인라인 복원이라 반드시 ABORT 한다', () => {
    expect(SQL).not.toContain('ledger_buyin_requests\\M');
  });
});
