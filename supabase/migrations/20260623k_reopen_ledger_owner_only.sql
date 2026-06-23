-- 2026-06-23 장부 마감 해제를 서버에서 업주(can_manage_pos: owner/co-owner/admin) 전용으로 강제.
-- 기존엔 직접 update(ls_update RLS=can_access_ledger)라 ledger_access 직원도 DB상 해제 가능했음(클라 게이트만 의존).
create or replace function public.reopen_ledger_session(p_venue_id uuid, p_date date, p_game_seq smallint default 1)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.can_manage_pos(p_venue_id) then raise exception '마감 해제는 매장 업주만 가능합니다'; end if;
  update public.ledger_sessions
    set closed = false, closed_at = null, updated_at = now()
    where venue_id = p_venue_id and session_date = p_date and game_seq = p_game_seq;
end; $$;
revoke all on function public.reopen_ledger_session(uuid, date, smallint) from public;
grant execute on function public.reopen_ledger_session(uuid, date, smallint) to authenticated;
