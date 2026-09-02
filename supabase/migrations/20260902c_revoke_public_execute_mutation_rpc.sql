-- 20260902c — 20260902b ③ 의 보정. `revoke ... from anon` 만으로는 무효인 함수가 19개 남았다:
--   함수 생성 시 PUBLIC 에 EXECUTE 가 기본 부여되므로 anon 은 PUBLIC 경유로 여전히 실행 가능(어드바이저 재실측 66건 잔존).
--   nuri-migration §1 이 이미 못 박아 둔 함정 — "REVOKE FROM anon 만으로는 무효, 반드시 FROM PUBLIC".
--   → PUBLIC·anon 회수 후 authenticated·service_role 에 명시 재부여(로그인 유저 동작 불변).
do $$
declare
  r record;
  mut text[] := array[
    'add_venue_owner','add_venue_staff','approve_buyin_request','cancel_buyin_request','cancel_ledger_buyin',
    'cancel_staff_invite','cast_poll_vote','claim_daily_login_point','create_group','create_my_venue',
    'create_venue_season','delete_ledger_session','end_venue_season','join_group','kill_venue',
    'link_customer_alias','unlink_customer_alias','notify_ledger_open','record_referral','reject_buyin_request',
    'remove_venue_owner','remove_venue_staff','reopen_ledger_session','reply_to_review','reserve_schedule',
    'respond_staff_invite','revoke_ledger_access','send_venue_announcement','set_kill_password','set_my_nickname',
    'set_my_venue_notify','set_pos_cancel_password','set_venue_page_config','set_venue_slug','toggle_post_like',
    'update_venue_address','update_venue_staff'
  ];
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(mut)
  loop
    execute format('revoke execute on function public.%I(%s) from public, anon', r.proname, r.args);
    execute format('grant execute on function public.%I(%s) to authenticated, service_role', r.proname, r.args);
  end loop;
end $$;
notify pgrst, 'reload schema';
-- ROLLBACK: grant execute on function public.<name>(<args>) to public;  (필요 시 함수별)
