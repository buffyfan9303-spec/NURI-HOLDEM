-- 장부 감사 정비 3차: 이름변경·플레이어삭제 원자화. (라이브 적용: ledger_atomic_player_ops)
-- 기존엔 클라이언트가 다단계(명단 update → 바인 N건 순차 RPC)로 처리해, 새벽 와이파이 블립 한 번에
-- '명단과 돈 기록이 반쯤 갈라진' 중간 상태가 남았다. 단일 트랜잭션 RPC 로 전부 또는 전무.
create or replace function public.rename_ledger_player(p_player_id uuid, p_new_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v record; v_new text := btrim(coalesce(p_new_name, ''));
begin
  select venue_id, session_date, game_seq, name into v from public.ledger_players where id = p_player_id;
  if v.venue_id is null then return; end if;
  if not can_access_ledger(v.venue_id) then raise exception '권한이 없습니다'; end if;
  if public.ledger_is_closed(v.venue_id, v.session_date, v.game_seq) then
    raise exception '마감된 장부입니다 — 먼저 마감을 해제하세요';
  end if;
  if v_new = '' or v_new = v.name then return; end if;
  if exists (select 1 from public.ledger_players
             where venue_id = v.venue_id and session_date = v.session_date and game_seq = v.game_seq
               and name = v_new and id <> p_player_id) then
    raise exception '같은 이름의 플레이어가 이미 있습니다';
  end if;
  update public.ledger_players set name = v_new where id = p_player_id;
  update public.ledger_buyins set player_name = v_new
   where venue_id = v.venue_id and session_date = v.session_date and game_seq = v.game_seq and player_name = v.name;
end $function$;
revoke all on function public.rename_ledger_player(uuid, text) from public, anon;
grant execute on function public.rename_ledger_player(uuid, text) to authenticated, service_role;

create or replace function public.delete_ledger_player(p_player_id uuid, p_password text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v record; v_hash text; v_cnt int;
begin
  select venue_id, session_date, game_seq, name into v from public.ledger_players where id = p_player_id;
  if v.venue_id is null then return; end if;
  if not can_access_ledger(v.venue_id) then raise exception '권한이 없습니다'; end if;
  if public.ledger_is_closed(v.venue_id, v.session_date, v.game_seq) then
    raise exception '마감된 장부입니다 — 먼저 마감을 해제하세요';
  end if;
  select count(*) into v_cnt from public.ledger_buyins
   where venue_id = v.venue_id and session_date = v.session_date and game_seq = v.game_seq and player_name = v.name;
  if v_cnt > 0 and my_role() <> 'admin'::user_role then
    -- 돈 기록 삭제는 기존 정책 그대로 취소 비밀번호 검증
    select cancel_password_hash into v_hash from public.venue_pos_settings where venue_id = v.venue_id;
    if v_hash is null then raise exception '취소 비밀번호가 설정되지 않았습니다. 업주가 먼저 설정해야 합니다'; end if;
    if extensions.crypt(coalesce(p_password, ''), v_hash) <> v_hash then raise exception '비밀번호가 올바르지 않습니다'; end if;
  end if;
  delete from public.ledger_buyins
   where venue_id = v.venue_id and session_date = v.session_date and game_seq = v.game_seq and player_name = v.name;
  delete from public.ledger_players where id = p_player_id;
end $function$;
revoke all on function public.delete_ledger_player(uuid, text) from public, anon;
grant execute on function public.delete_ledger_player(uuid, text) to authenticated, service_role;

do $verify$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='rename_ledger_player'
      and p.prosrc like '%ledger_is_closed%') then raise exception 'ABORT: rename 마감가드'; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='delete_ledger_player'
      and p.prosrc like '%cancel_password_hash%') then raise exception 'ABORT: delete 비번검증'; end if;
  if has_function_privilege('anon', 'public.delete_ledger_player(uuid, text)', 'execute') then
    raise exception 'ABORT: anon 실행권한'; end if;
  raise notice 'ATOMIC PLAYER OPS OK';
end $verify$;
