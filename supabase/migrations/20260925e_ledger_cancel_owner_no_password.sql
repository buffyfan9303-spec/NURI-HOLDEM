-- 20260925e — 장부 바인 취소: 취소 비밀번호가 없는 매장은 업주·공동운영자가 비밀번호 없이 취소할 수 있다
-- 오너 결정 2026-09-25 ②. 이전: 비밀번호 미설정 매장은 업주도 취소 불가(금액 줄이기는 허용 — 두 동작이 어긋났다).
-- 규칙은 update_ledger_buyin_reduce 와 같다:
--   · 관리자: 비밀번호 검사 없음(종전 그대로)
--   · 비밀번호 미설정 매장: can_manage_pos(업주·승인된 공동운영자)만, 비밀번호 없이. 장부 권한만 있는 직원은 거부.
--   · 비밀번호 설정 매장: 누구든(업주 포함) 비밀번호 필요(종전 그대로)
--
-- ✅ 적용 완료 2026-09-25 (MCP execute_sql). 적용 후 md5(pg_get_functiondef) = ada0907048a177ed297c6eb83eb1beba, anon 실행 false.
--    적용 전 md5 4dcfc23270230e2d14011b1edbb3886d.
-- 리허설(begin…rollback, 매장 dddd…0001, 공동운영자 7e435684 를 트랜잭션 안에서 승인 공동운영자로 추가):
--    직원·비번 미설정 → 거부('업주·공동운영자만') · 공동운영자·비번 미설정 → 취소됨(행 0)
--    비번 설정 후 공동운영자 비번 없음/틀림 → '비밀번호가 올바르지 않습니다' · 직원 맞는 비번 → 취소됨
--    (그 매장 업주 c8e3734d 는 role=admin 이라 모든 경우 통과 — 관리자 우회, 종전 동작)

create or replace function public.cancel_ledger_buyin(p_id uuid, p_password text)
 returns void language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_venue uuid; v_date date; v_game smallint; v_req uuid;
begin
  select venue_id, session_date, game_seq into v_venue, v_date, v_game from public.ledger_buyins where id = p_id;
  if v_venue is null then return; end if;
  if not coalesce(can_access_ledger(v_venue), false) then raise exception '권한이 없습니다'; end if;
  if public.ledger_is_closed(v_venue, v_date, v_game) then
    raise exception '마감된 장부의 바인은 취소할 수 없습니다 — 먼저 마감을 해제하세요';
  end if;
  if my_role() is distinct from 'admin'::user_role
     and not exists (select 1 from public.venue_pos_settings v
                      where v.venue_id = v_venue and v.cancel_password_hash is not null) then
    if not coalesce(can_manage_pos(v_venue), false) then
      raise exception '취소 비밀번호가 설정되지 않은 매장은 업주·공동운영자만 취소할 수 있습니다' using errcode = '42501';
    end if;
  else
    perform public._ledger_check_cancel_password(v_venue, p_password);
  end if;
  delete from public.ledger_buyins where id = p_id returning request_id into v_req;
  perform public._restore_voucher_for_request(v_req);
end $function$;
revoke all on function public.cancel_ledger_buyin(uuid, text) from public, anon;
grant execute on function public.cancel_ledger_buyin(uuid, text) to authenticated, service_role;
