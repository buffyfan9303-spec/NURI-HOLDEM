// 승인된 바인을 취소해도 이용권이 돌아오는가 — **서버(SQL)** 계약 (20260911c, 2026-09-11)
//
// 왜 마이그레이션 텍스트를 테스트하나
//   20260911b 는 요청이 '끝나는' 세 경로만 닫았다. 승인되어 장부에 들어간 뒤 업주가 그 바인을 지우면
//   이용권은 여전히 'used' 에 갇혔다 — ledger_buyins 에 어느 요청에서 왔는지가 없어 되짚을 수 없었기 때문이다.
//   그 링크(request_id)와 복원 경로는 전부 DB 함수 안에 있어 단위 테스트가 실행으로 검증할 수 없다.
//   그래서 **링크와 복원이 SQL 안에 실제로 적혀 있는지**를 잠근다(실행 검증은 적용 시 하단 검증 블록).
//
// 이 테스트가 잡는 회귀: 누가 request_id 를 빠뜨리거나, 복원 호출을 지우거나,
// 요청의 voucher_id 를 비우지 않아(부분 유니크) 되살린 이용권을 다시 못 쓰게 만드는 것.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20260911c_buyin_request_link_and_cancel_restore.sql'),
  'utf-8',
);
const bodyOf = (name: string): string => {
  const start = SQL.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} 정의가 없다`).toBeGreaterThan(-1);
  const end = SQL.indexOf('$$;', SQL.indexOf('as $$', start));
  return SQL.slice(start, end);
};

describe('20260911c — 앱 요청에서 온 바인은 어느 요청에서 왔는지 적어 둔다', () => {
  it('링크 컬럼은 추가만 하고(비파괴) 요청이 지워지면 연결만 끊는다', () => {
    expect(SQL).toContain('add column if not exists request_id uuid references public.ledger_buyin_requests(id) on delete set null');
    // ON DELETE SET NULL 이 순차 스캔이 되지 않게 — 부분 인덱스
    expect(SQL).toContain('create index if not exists ledger_buyins_request_idx');
    expect(SQL).toContain('where request_id is not null');
  });

  it('승인이 만드는 바인 세 종류(티켓·분납·단건) 모두에 링크를 적는다', () => {
    const b = bodyOf('approve_buyin_request');
    const inserts = [...b.matchAll(/insert into ledger_buyins \(([^)]*)\)/g)].map((m) => m[1]);
    expect(inserts, '승인의 ledger_buyins insert 가 3개가 아니다').toHaveLength(3);
    for (const cols of inserts) expect(cols, `링크 없는 insert: ${cols.slice(0, 60)}…`).toContain('request_id');
  });

  it('승인의 기존 가드는 그대로다 — 이 수정이 통제를 풀지 않았다', () => {
    const b = bodyOf('approve_buyin_request');
    expect(b).toContain("if r.status is distinct from 'pending' then raise exception");
    expect(b).toContain('if not coalesce(can_access_ledger(r.venue_id), false)');
    expect(b).toContain('ledger_is_closed');
  });
});

describe('20260911c — 바인을 취소하면 이용권이 지갑으로 돌아온다', () => {
  it('복원 헬퍼는 이용권을 되살리고 요청의 소유권을 놓는다', () => {
    const b = bodyOf('_restore_voucher_for_request');
    expect(b).toContain('select voucher_id into v_voucher');
    // 소유권을 놓지 않으면 uniq_ledger_req_voucher 가 재사용을 막는다 — 되살려 놓고 못 쓰게 된다
    expect(b).toContain('set voucher_id = null');
    expect(b).toContain('perform public._restore_voucher(v_voucher);');
    // 값을 읽은 뒤에 비워야 한다(UPDATE … RETURNING 은 새 값을 준다)
    expect(b.indexOf('select voucher_id into v_voucher')).toBeLessThan(b.indexOf('set voucher_id = null'));
  });

  it('복원 헬퍼는 내부 전용이다', () => {
    expect(SQL).toContain('revoke all on function public._restore_voucher_for_request(uuid) from public, anon, authenticated;');
    expect(SQL).toContain('grant execute on function public._restore_voucher_for_request(uuid) to service_role;');
  });

  for (const fn of ['cancel_ledger_buyin', 'cancel_my_recent_buyin']) {
    it(`${fn}: 실제로 지워진 행의 요청만 복원한다`, () => {
      const b = bodyOf(fn);
      expect(b).toContain('returning request_id into v_req');
      expect(b).toContain('perform public._restore_voucher_for_request(v_req);');
      expect(b.indexOf('delete from public.ledger_buyins')).toBeLessThan(b.indexOf('_restore_voucher_for_request'));
      // 기존 가드가 살아 있다 — 마감 봉인은 20260818f 가 세운 것이다
      expect(b, `${fn} 마감 가드가 사라졌다`).toContain('ledger_is_closed');
      // 권한 검사는 NULL-safe 여야 한다(비로그인에서 가드가 열리지 않게)
      expect(b).toContain('coalesce(can_access_ledger');
    });
  }

  it('비밀번호 검사와 90초 창은 그대로다 — 취소 통제를 풀지 않았다', () => {
    expect(bodyOf('cancel_ledger_buyin')).toContain('extensions.crypt(coalesce(p_password,\'\'), v_hash) <> v_hash');
    expect(bodyOf('cancel_my_recent_buyin')).toContain("interval '90 seconds'");
  });
});

describe('20260911c — 손님 화면이 이용권 요청인지 알 수 있다', () => {
  it('반환 타입이 바뀌므로 DROP 후 재생성하고 ACL 을 다시 쓴다', () => {
    expect(SQL).toContain('drop function if exists public.get_my_buyin_requests_current();');
    expect(SQL).toContain('(r.voucher_id is not null) as used_voucher');
    expect(SQL).toContain('revoke all on function public.get_my_buyin_requests_current() from public, anon;');
    expect(SQL).toContain('grant execute on function public.get_my_buyin_requests_current() to authenticated, service_role;');
  });

  it('이용권 id 자체는 손님에게 내려보내지 않는다 — 필요한 최소만', () => {
    const start = SQL.indexOf('returns table(\n  id uuid, venue_id uuid, status text');
    const body = SQL.slice(start, SQL.indexOf('$function$;', start));
    expect(body).not.toMatch(/\br\.voucher_id\b(?!\s+is not null)/);
  });

  it('영업일 기준(20260905j)이 그대로다 — 자정 넘긴 요청이 사라지지 않는다', () => {
    expect(SQL).toContain('r.session_date = public.ledger_business_date(r.venue_id)');
  });
});

describe('20260911c — 안전 장치', () => {
  it('선행 마이그레이션(20260911b)이 없으면 중단한다', () => {
    expect(SQL).toContain("raise exception 'ABORT: 20260911b 를 먼저 적용해야 한다");
  });
  it('모든 함수가 search_path 를 고정한다', () => {
    for (const fn of ['approve_buyin_request', '_restore_voucher_for_request', 'cancel_ledger_buyin', 'cancel_my_recent_buyin']) {
      expect(bodyOf(fn), `${fn} search_path 미고정`).toContain('set search_path = public, pg_temp');
    }
  });
  it('되돌리는 법이 파일에 적혀 있다', () => {
    expect(SQL).toContain('-- ROLLBACK');
  });
});
