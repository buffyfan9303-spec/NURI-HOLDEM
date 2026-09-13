-- Close the game validation/use TOCTOU left after
-- 20260913123648_event_voucher_bundle_20260913_hardened.
-- The trigger is the shared atomic boundary for QR and phone redemption.
-- APPLIED 2026-09-13: production version 20260913132414 / voucher_game_session_lock.

begin;

do $preflight$
begin
  if to_regprocedure('public.voucher_redeem_to_ledger_request()') is null then
    raise exception 'ABORT: voucher_redeem_to_ledger_request() 없음';
  end if;
  if to_regprocedure('public.ledger_business_date(uuid)') is null then
    raise exception 'ABORT: ledger_business_date(uuid) 없음';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.ledger_sessions'::regclass and contype = 'p'
       and pg_get_constraintdef(oid) = 'PRIMARY KEY (venue_id, session_date, game_seq)'
  ) then
    raise exception 'ABORT: ledger_sessions 복합 PK가 예상과 다름';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'ledger_sessions'
       and column_name = 'closed' and udt_name = 'bool' and is_nullable = 'NO'
  ) then
    raise exception 'ABORT: ledger_sessions.closed boolean not null 없음';
  end if;
end $preflight$;

create or replace function public.voucher_redeem_to_ledger_request()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_seq smallint;
  v_biz date;
  v_game_closed boolean;
begin
  if new.status = 'used' and (old.status is distinct from 'used') and new.used_venue_id is not null then
    v_seq := nullif(current_setting('nuri.voucher_game_seq', true), '')::smallint;

    if v_seq is not null then
      if v_seq < 1 then
        raise exception '게임 번호가 올바르지 않습니다 — 접수대에서 게임을 다시 선택해 주세요';
      end if;
      v_biz := public.ledger_business_date(new.used_venue_id);
      select ls.closed
        into v_game_closed
        from public.ledger_sessions ls
       where ls.venue_id = new.used_venue_id
         and ls.session_date = v_biz
         and ls.game_seq = v_seq
       for share;
      if not found then
        raise exception '해당 게임을 찾을 수 없습니다 — 접수대에서 게임을 다시 선택해 주세요';
      end if;
      if v_game_closed then
        raise exception '이미 마감된 게임입니다 — 접수대에서 다른 게임으로 다시 요청해 주세요';
      end if;
    end if;

    insert into public.ledger_buyin_requests(
      venue_id, session_date, user_id, player_name, note, status, voucher_id, requested_game_seq
    )
    select
      new.used_venue_id,
      public.ledger_business_date(new.used_venue_id),
      new.holder_user_id,
      coalesce(nullif(btrim(new.holder_name), ''), '이용권 사용자'),
      '🎟 이용권 사용 — ' || coalesce(nullif(btrim(new.title), ''), '매장이용권') || ' · 수량/현금 확인 후 승인',
      'pending',
      new.id,
      v_seq
    where not exists (
      select 1 from public.ledger_buyin_requests
       where voucher_id = new.id and status <> 'rejected'
    );
  end if;
  return new;
end;
$function$;

revoke all on function public.voucher_redeem_to_ledger_request() from public, anon, authenticated;

do $check$
declare
  v_oid oid := to_regprocedure('public.voucher_redeem_to_ledger_request()');
  v_src text;
  v_cfg text[];
  v_secdef boolean;
  p_guard int;
  p_select int;
  p_lock int;
  p_missing int;
  p_closed int;
  p_insert int;
begin
  select prosrc, proconfig, prosecdef
    into v_src, v_cfg, v_secdef
    from pg_proc where oid = v_oid;
  if not v_secdef
     or coalesce(array_to_string(v_cfg, ','), '') not like '%search_path=public, pg_temp%' then
    raise exception 'ABORT: 트리거 함수 SECURITY DEFINER/search_path 불일치';
  end if;

  p_guard := strpos(lower(v_src), 'v_seq < 1');
  p_select := strpos(lower(v_src), 'select ls.closed');
  p_lock := strpos(lower(v_src), 'for share');
  p_missing := strpos(lower(v_src), 'if not found');
  p_closed := strpos(lower(v_src), 'if v_game_closed');
  p_insert := strpos(lower(v_src), 'insert into public.ledger_buyin_requests');
  if p_guard = 0 or p_select = 0 or p_lock = 0 or p_missing = 0 or p_closed = 0 or p_insert = 0
     or not (p_guard < p_select and p_select < p_lock and p_lock < p_missing
             and p_missing < p_closed and p_closed < p_insert) then
    raise exception 'ABORT: 게임 행 잠금/검증 순서 불일치';
  end if;

  if has_function_privilege('anon', v_oid, 'execute')
     or has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception 'ABORT: 내부 트리거 함수가 클라이언트 롤에 열림';
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.store_vouchers'::regclass
       and tgfoid = v_oid and not tgisinternal
  ) then
    raise exception 'ABORT: store_vouchers 트리거 연결 없음';
  end if;
end $check$;

notify pgrst, 'reload schema';

commit;
