-- 20260924p — 매장 영구 삭제(kill_venue): 미사용 이용권이 있으면 거부 + 킬스위치가 원래 동작하지 않던 결함 수정
-- ✅ 2026-09-24 운영 적용 완료(nuri-lead). 적용 후 md5: kill_venue 7c3d73db… · set_kill_password 11c9e5f1… · ACL 불변.
--
-- 오너 결정(2026-09-24): "미사용 이용권 있으면 매장 삭제 막기".
-- 함께 발견한 기존 결함: pgcrypto 는 extensions 스키마에 있는데 두 함수가 search_path = public, pg_temp 에서
--   crypt()/gen_salt() 를 이름만으로 불러 **항상** "function gen_salt/crypt does not exist" 로 실패했다.
--   그래서 킬스위치 비밀번호를 설정한 매장이 0곳이었다(venue_kill_switch 0행). → extensions. 로 한정.
-- 리허설(begin…rollback, 관리자 겸 업주 c8e3 · 매장 dddd(미사용 이용권 1장) / 9cf5(0장)):
--   C0 옛 set_kill_password = ERR gen_salt 없음 · P0 새 설정 OK · N1 이용권 남은 매장 삭제 BLOCKED ·
--   N2 틀린 비밀번호 BLOCKED · N3 대표 아닌 업주 BLOCKED · P1 이용권 0장 매장 삭제 OK(롤백으로 되돌림).
-- 적용 전 md5: kill_venue 7c71599f… · set_kill_password 9513c10e… · ACL {postgres, authenticated, service_role}
-- 되돌리기: 두 함수에서 extensions. 접두사와 v_left 검사를 뺀 본문으로 create or replace(= 고장 상태로 복귀하므로 권하지 않음).

create or replace function public.set_kill_password(p_venue_id uuid, p_password text)
 returns void language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.venues where id = p_venue_id;
  if v_owner is null then raise exception '매장을 찾을 수 없습니다'; end if;
  if auth.uid() is null or auth.uid() <> v_owner then raise exception '매장 대표 업주만 설정할 수 있습니다'; end if;
  if length(coalesce(p_password, '')) < 4 then raise exception '비밀번호는 4자 이상이어야 합니다'; end if;
  if exists(select 1 from public.venue_kill_switch where venue_id = p_venue_id) then
    raise exception '킬스위치 비밀번호는 이미 설정되어 변경할 수 없습니다';
  end if;
  insert into public.venue_kill_switch(venue_id, pw_hash) values(p_venue_id, extensions.crypt(p_password, extensions.gen_salt('bf')));
end $function$;

create or replace function public.kill_venue(p_venue_id uuid, p_owner_name text, p_password text)
 returns integer language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_owner uuid; v_real text; v_hash text; v_tbl text; v_left int;
  v_whitelist text[] := array[
    'comments','schedules','venue_follows','venue_staff_invites','venue_rankings','venue_notices',
    'venue_pos_settings','ledger_access','venue_staff','ledger_sessions','staff_schedule','clock_presets',
    'ranking_point_awards','ledger_buyins','ledger_players','clock_states','staff_wage','waitlist',
    'customer_profiles','coupons','dealer_shifts','store_vouchers','checkins','voucher_access',
    'venue_messages','venue_score_entries','league_members','league_entries','venue_reviews',
    'voucher_credit_requests','venue_owners','ledger_buyin_requests','venue_announcements',
    'venue_seasons','game_presets','venue_kill_switch','league_event_status'
  ];
begin
  select owner_id into v_owner from public.venues where id = p_venue_id;
  if v_owner is null then raise exception '매장을 찾을 수 없습니다'; end if;
  if auth.uid() is null or auth.uid() <> v_owner then raise exception '매장 대표 업주만 실행할 수 있습니다'; end if;
  select real_name into v_real from public.profiles where id = v_owner;
  if coalesce(trim(v_real), '') = '' then raise exception '본인인증(실명)된 업주만 실행할 수 있습니다'; end if;
  if lower(trim(p_owner_name)) <> lower(trim(v_real)) then raise exception '업주 실명이 일치하지 않습니다'; end if;
  select pw_hash into v_hash from public.venue_kill_switch where venue_id = p_venue_id;
  if v_hash is null then raise exception '킬스위치 비밀번호를 먼저 설정하세요'; end if;
  if v_hash <> extensions.crypt(p_password, v_hash) then raise exception '킬스위치 비밀번호가 일치하지 않습니다'; end if;
  select count(*) into v_left from public.store_vouchers
   where venue_id = p_venue_id and status = 'active' and (expires_at is null or expires_at > now());
  if v_left > 0 then
    raise exception '손님이 아직 쓰지 않은 매장이용권이 %장 남아 있어 매장을 삭제할 수 없습니다. 이용권을 모두 사용하거나 회수한 뒤 다시 시도해 주세요', v_left;
  end if;
  perform public._audit('kill_venue', p_venue_id::text, jsonb_build_object('owner_name', p_owner_name));
  update public.profiles set venue_id = null where venue_id = p_venue_id;
  foreach v_tbl in array v_whitelist loop
    execute format('delete from public.%I where venue_id = $1', v_tbl) using p_venue_id;
  end loop;
  delete from public.venues where id = p_venue_id;
  return 1;
end $function$;

revoke all on function public.set_kill_password(uuid, text) from public, anon;
grant execute on function public.set_kill_password(uuid, text) to authenticated, service_role;
revoke all on function public.kill_venue(uuid, text, text) from public, anon;
grant execute on function public.kill_venue(uuid, text, text) to authenticated, service_role;
