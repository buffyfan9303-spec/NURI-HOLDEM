-- ✅ 적용 완료 2026-09-25 (MCP execute_sql, 주석 없는 본문 · 자가검사 통과). 적용 전 md5 15개가 아래 표와 일치함을 확인한 뒤 적용.
--    적용 후 md5: _is_active_venue_staff 82cc49b4 · _ledger_buyin_apply_amount_rule 4282fb1b · _ledger_buyins_client_guard 9e302b03 ·
--    _ledger_require_cancel_auth b46c60db · can_access_ledger a14475ce · cancel_ledger_buyin 6b571d1d · delete_ledger_player a0256942 · update_ledger_buyin_reduce 06ff1ac1
--    리허설 57/57 PASS(critical-reviewer, rollback) · 적용 후 스모크(rollback): 공동운영자 현금 바인 cash=1 → 세션 단가 30000 으로 강제 저장.
-- 20260925f — 직원 권한 게이트(D6·D7) · 취소 인증 단일화(D4) · 바인 금액 서버 강제(D2)
-- 요구: 오너 2026-09-25 MYSTORE-FULL-AUDIT, critical-reviewer 판정 D2·D4·D6·D7 → 리드 결정(같은 날).
--
-- (초안 문구는 적용 완료로 대체됨)
--
-- 요지
--  D6·D7  접근표(ledger_access·schedule_access·voucher_access)는 "부여" 만 기록하고 직원 자격은 profiles 에 따로 있다.
--         → 게이트에서 "지금도 그 매장의 승인된 활성 직원인가"(_is_active_venue_staff)를 함께 본다.
--         can_access_ledger · can_manage_schedule · can_view_vouchers 게이트 + 원시 조회 3곳
--         (can_search_ranking_members · _my_ledger_venue_ids · get_ledger_access_user_ids) 교체.
--         정리 보강: manage_staff remove 가 schedule_access 도 지운다 · respond_staff_invite 수락 시 다른 매장 접근표 삭제.
--         grant_*_access 는 "그 매장 현재 승인 직원에게만"(리드 결정: 비직원 부여는 의도 아님).
--         ※ 거절(approved=false)·정지는 행을 지우지 않는다 — 게이트가 닫고, 재승인하면 부여가 그대로 살아난다.
--  D4     _ledger_require_cancel_auth(venue, pw) 하나로 cancel_ledger_buyin · delete_ledger_player · update_ledger_buyin_reduce 통합.
--         규칙(=20260925e): 관리자 통과 · 비밀번호 미설정 매장은 can_manage_pos 만 비밀번호 없이 · 설정 매장은 누구나 비밀번호.
--         delete_ledger_player 는 플레이어 행을 for update 로 잠근다.
--  D2     _ledger_buyin_apply_amount_rule(row): 세션 행 필수 · 비분납 현금/카드/이체는 세션 (단가 − 할인) 으로 서버가 채움 ·
--         분납은 현금+카드+이체+이용권T×10000+미수 = (단가 − 할인) 아니면 거부. approve_buyin_request 가 이미 하던 규칙과 같다.
--         클라 직접 INSERT/UPDATE(트리거) 와 update_ledger_buyin_reduce(SECURITY DEFINER 라 트리거가 건너뜀) 두 곳에서 부른다.
--         UPDATE 는 금액·결제수단·할인·분납 칸이 바뀔 때만 적용(얼리만 바꾸는 수정·이름 변경은 건드리지 않는다).
--
-- 적용 전 라이브 md5(pg_get_functiondef) — 덮어쓰기 전 대조용(2026-09-25 critical-reviewer 실측, PostgreSQL 17.6)
--   _ledger_buyins_client_guard   f00e83a8fcd62e18f0b74b30bac7f651
--   can_access_ledger             330ee087295f4a9e23ccd52b836499cc   (ACL: PUBLIC·anon 포함 — 공개 읽기 정책이 부른다, 그대로 둔다)
--   can_manage_schedule           bdb9a13ba5e7cdb905e4f0eb91c5558a
--   can_view_vouchers             61a0a5fce46de0e0d78ac541ff4966cd
--   can_search_ranking_members    96d1c104f0dbcc55c3dfb0076cc3f8ae
--   _my_ledger_venue_ids          5ce622975251517a49e608df553aa51f
--   get_ledger_access_user_ids    b904d63a67251545023e759fc05415b1
--   grant_ledger_access           bb42eb1e063d491cecc1a2288d67d09b
--   grant_schedule_access         dd782466884bc223727403eddfacdbf6
--   grant_voucher_access          ebc49ee4949b0eeb31f0089b505a5f74
--   manage_staff                  4996aff1b743f70e620ab49bc47abaf3
--   respond_staff_invite          89823a9ed89a8cfa13f3873fb7fb5cc7
--   cancel_ledger_buyin           ada0907048a177ed297c6eb83eb1beba
--   delete_ledger_player          4cbe9fcf7475f9fd089ff9b55c3397e9
--   update_ledger_buyin_reduce    afe4c209c8f339bc3c5f83d2005ba8c0
--   (신규) _is_active_venue_staff · _ledger_require_cancel_auth · _ledger_buyin_apply_amount_rule — 적용 전 부재 확인할 것
--
-- 시그니처는 전부 그대로다(CREATE OR REPLACE → 기존 ACL 보존). REVOKE/GRANT 는 새로 만들어지는 경우를 위해 함께 적는다.
-- 리허설: scratchpad/mig0925f/rehearsal.sql (begin; 본문; 음성·양성 DO; rollback;)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. 직원 자격 헬퍼
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public._is_active_venue_staff(p_user_id uuid, p_venue_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  select exists (
    select 1 from public.profiles p
     where p_user_id is not null and p_venue_id is not null
       and p.id = p_user_id
       and p.role::text = 'venue_staff'
       and p.venue_id = p_venue_id
       and p.approved is true
       and p.status::text not in ('banned', 'withdrawn')
       and not (p.status::text = 'suspended' and (p.suspended_until is null or p.suspended_until > now()))
  );
$function$;
revoke all on function public._is_active_venue_staff(uuid, uuid) from public, anon, authenticated;
grant execute on function public._is_active_venue_staff(uuid, uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. 게이트 3종
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.can_access_ledger(p_venue_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  select public.can_manage_pos(p_venue_id)
      or ( exists (select 1 from public.ledger_access la where la.venue_id = p_venue_id and la.user_id = auth.uid())
           and public._is_active_venue_staff(auth.uid(), p_venue_id) );
$function$;
-- ACL 은 건드리지 않는다: 라이브가 PUBLIC·anon·authenticated·service_role 실행 가능이고,
-- clock_states_public_read·schedules_select 같은 공개 읽기 정책이 anon 으로 이 함수를 부른다.

create or replace function public.can_manage_schedule(p_venue_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  select public.can_manage_pos(p_venue_id)
      or ( exists (select 1 from public.schedule_access sa where sa.venue_id = p_venue_id and sa.user_id = auth.uid())
           and public._is_active_venue_staff(auth.uid(), p_venue_id) );
$function$;
revoke all on function public.can_manage_schedule(uuid) from public, anon;
grant execute on function public.can_manage_schedule(uuid) to authenticated, service_role;

create or replace function public.can_view_vouchers(p_venue_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  select public.can_manage_pos(p_venue_id)
      or ( exists (select 1 from public.voucher_access va where va.venue_id = p_venue_id and va.user_id = auth.uid())
           and public._is_active_venue_staff(auth.uid(), p_venue_id) );
$function$;
revoke all on function public.can_view_vouchers(uuid) from public, anon;
grant execute on function public.can_view_vouchers(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. 접근표를 원시로 읽던 곳
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.can_search_ranking_members()
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  select exists (
           select 1
           from public.profiles me
           where me.id = auth.uid()
             and (
                  me.role::text = 'admin'
               or (me.role::text = 'venue_owner'
                   and me.approved is true
                   and me.status::text = 'active')
             )
         )
      or exists (
           select 1 from public.ledger_access la
            where la.user_id = auth.uid()
              and public._is_active_venue_staff(auth.uid(), la.venue_id)
         );
$function$;
revoke all on function public.can_search_ranking_members() from public, anon;
grant execute on function public.can_search_ranking_members() to authenticated, service_role;

create or replace function public._my_ledger_venue_ids()
 returns uuid[]
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  select coalesce(array_agg(t.vid), '{}'::uuid[])
    from (
      select v.id as vid from public.venues v
       where coalesce(public.my_role() = 'admin'::user_role, false)
      union
      select v.id from public.venues v where v.owner_id = auth.uid()
      union
      select vo.venue_id from public.venue_owners vo
       where vo.user_id = auth.uid() and vo.status = 'approved'
      union
      select la.venue_id from public.ledger_access la
       where la.user_id = auth.uid()
         and public._is_active_venue_staff(auth.uid(), la.venue_id)
    ) t;
$function$;
revoke all on function public._my_ledger_venue_ids() from public, anon, authenticated;
grant execute on function public._my_ledger_venue_ids() to service_role;

create or replace function public.get_ledger_access_user_ids(p_venue_id uuid)
 returns table(user_id uuid)
 language plpgsql
 stable security definer
 set search_path = public, pg_temp
as $function$
begin
  if p_venue_id is null then
    raise exception '매장이 지정되지 않았습니다' using errcode = '22023';
  end if;
  -- 장부를 볼 수 있는 사람만 — 업주·공동운영자·관리자·장부 권한 직원(담당 직원 후보를 골라야 한다).
  if can_access_ledger(p_venue_id) is distinct from true then
    raise exception '권한 없음' using errcode = '42501';
  end if;
  -- 20260925f: 지금도 그 매장 승인 직원인 사람만 — 거절·정지·이동한 직원의 남은 행은 후보가 아니다.
  return query
    select la.user_id
      from public.ledger_access la
     where la.venue_id = p_venue_id
       and public._is_active_venue_staff(la.user_id, p_venue_id)
     order by la.user_id;
end;
$function$;
revoke all on function public.get_ledger_access_user_ids(uuid) from public, anon;
grant execute on function public.get_ledger_access_user_ids(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 부여는 그 매장 현재 승인 직원에게만
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.grant_ledger_access(p_venue_id uuid, p_user_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
begin
  if can_manage_pos(p_venue_id) is distinct from true then raise exception '권한이 없습니다' using errcode = '42501'; end if;
  if public._is_active_venue_staff(p_user_id, p_venue_id) is distinct from true then
    raise exception '그 매장의 승인된 직원에게만 권한을 줄 수 있습니다' using errcode = '22023';
  end if;
  insert into public.ledger_access (venue_id, user_id) values (p_venue_id, p_user_id)
  on conflict do nothing;
end; $function$;
revoke all on function public.grant_ledger_access(uuid, uuid) from public, anon;
grant execute on function public.grant_ledger_access(uuid, uuid) to authenticated, service_role;

create or replace function public.grant_schedule_access(p_venue_id uuid, p_user_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
begin
  if can_manage_pos(p_venue_id) is distinct from true then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
  if p_venue_id is null or p_user_id is null then
    raise exception '매장 또는 대상이 지정되지 않았습니다' using errcode = '22023';
  end if;
  if public._is_active_venue_staff(p_user_id, p_venue_id) is distinct from true then
    raise exception '그 매장의 승인된 직원에게만 권한을 줄 수 있습니다' using errcode = '22023';
  end if;
  insert into public.schedule_access (venue_id, user_id) values (p_venue_id, p_user_id)
  on conflict do nothing;
end; $function$;
revoke all on function public.grant_schedule_access(uuid, uuid) from public, anon;
grant execute on function public.grant_schedule_access(uuid, uuid) to authenticated, service_role;

create or replace function public.grant_voucher_access(p_venue_id uuid, p_user_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
begin
  if can_manage_pos(p_venue_id) is distinct from true then raise exception '권한이 없습니다' using errcode = '42501'; end if;
  if public._is_active_venue_staff(p_user_id, p_venue_id) is distinct from true then
    raise exception '그 매장의 승인된 직원에게만 권한을 줄 수 있습니다' using errcode = '22023';
  end if;
  insert into public.voucher_access(venue_id, user_id) values (p_venue_id, p_user_id) on conflict do nothing;
end $function$;
revoke all on function public.grant_voucher_access(uuid, uuid) from public, anon;
grant execute on function public.grant_voucher_access(uuid, uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. 자격이 바뀌는 경로의 정리
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.manage_staff(p_staff_id uuid, p_action text)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_staff_venue uuid;
begin
  -- 대상을 먼저 찾는다 — 못 찾으면 게이트를 보기 전에 막는다(운영자는 venue NULL 에도 true 라서).
  select venue_id into v_staff_venue
    from public.profiles where id = p_staff_id and role = 'venue_staff';
  if v_staff_venue is null then
    raise exception '본인 매장 직원만 관리할 수 있습니다';
  end if;

  -- 화면(VenueManageTab 의 staffOk)과 같은 판정: 관리자 · 대표 · 승인 공동사장.
  if not public.can_manage_venue_staff(v_staff_venue) then
    raise exception '직원을 관리할 권한이 없습니다';
  end if;

  if p_action = 'approve' then
    update public.profiles set approved = true  where id = p_staff_id;
  elsif p_action = 'reject' then
    -- 행은 남긴다 — 게이트(_is_active_venue_staff)가 닫고, 재승인하면 부여가 그대로 살아난다(20260925f).
    update public.profiles set approved = false where id = p_staff_id;
  elsif p_action = 'remove' then
    update public.profiles set role = 'user', venue_id = null, approved = false where id = p_staff_id;
    delete from public.ledger_access   where venue_id = v_staff_venue and user_id = p_staff_id;
    delete from public.voucher_access  where venue_id = v_staff_venue and user_id = p_staff_id;
    delete from public.schedule_access where venue_id = v_staff_venue and user_id = p_staff_id;  -- 20260925f D6
  else
    raise exception '알 수 없는 작업';
  end if;
end;
$function$;
revoke all on function public.manage_staff(uuid, text) from public, anon;
grant execute on function public.manage_staff(uuid, text) to authenticated, service_role;

create or replace function public.respond_staff_invite(p_invite_id uuid, p_accept boolean)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_venue uuid; v_user uuid; v_by uuid;
        v_gl boolean; v_gv boolean; v_gs boolean; v_title text; v_ok boolean;
begin
  select venue_id, user_id, invited_by, grant_ledger, grant_voucher, grant_schedule, staff_title
    into v_venue, v_user, v_by, v_gl, v_gv, v_gs, v_title
    from public.venue_staff_invites where id = p_invite_id and status = 'pending';
  -- ⚠ IS DISTINCT FROM — 예전 `<>` 는 비로그인(auth.uid()=NULL)에서 NULL 이 되어 if 를 통째로 건너뛰었다.
  --   그 경로로 초대가 'accepted' 로 바뀌었다(2026-09-15 실측으로 재현·확인).
  if v_user is null or v_user is distinct from auth.uid() then
    raise exception '초대를 찾을 수 없습니다';
  end if;

  if p_accept then
    update public.profiles set role='venue_staff', venue_id=v_venue, approved=true where id=auth.uid();
    if v_title is not null and btrim(v_title) <> '' then
      update public.profiles set staff_title = left(btrim(v_title), 20) where id = auth.uid();
    end if;
    -- 20260925f D7: 직원은 한 매장 소속이다 — 옮겨 가면 이전 매장에서 받은 부여를 지운다.
    delete from public.ledger_access   where user_id = auth.uid() and venue_id is distinct from v_venue;
    delete from public.voucher_access  where user_id = auth.uid() and venue_id is distinct from v_venue;
    delete from public.schedule_access where user_id = auth.uid() and venue_id is distinct from v_venue;
    -- 초대자가 **지금도** 그 매장 권한자인가(초대~수락 사이 해임 대비).
    --   can_manage_pos 는 auth.uid() 기준이라 여기서 못 쓴다 — 지금 auth.uid() 는 수락자다.
    select exists (
      select 1 from public.profiles p where p.id = v_by and p.role = 'admin'
      union all
      select 1 from public.venues v where v.id = v_venue and v.owner_id = v_by
      union all
      select 1 from public.venue_owners vo where vo.venue_id = v_venue and vo.user_id = v_by and vo.status='approved'
    ) into v_ok;
    if coalesce(v_ok,false) then
      if v_gl then insert into public.ledger_access(venue_id,user_id)   values (v_venue, v_user) on conflict do nothing; end if;
      if v_gv then insert into public.voucher_access(venue_id,user_id)  values (v_venue, v_user) on conflict do nothing; end if;
      if v_gs then insert into public.schedule_access(venue_id,user_id) values (v_venue, v_user) on conflict do nothing; end if;
    end if;
    update public.venue_staff_invites set status='accepted' where id=p_invite_id;
  else
    update public.venue_staff_invites set status='declined' where id=p_invite_id;
  end if;
end; $function$;
revoke all on function public.respond_staff_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_staff_invite(uuid, boolean) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. D4 — 취소 인증 단일화
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public._ledger_require_cancel_auth(p_venue uuid, p_password text)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
begin
  if public.my_role() is not distinct from 'admin'::user_role then
    return;                                             -- 관리자: 비밀번호 검사 없음(종전)
  end if;
  if not exists (select 1 from public.venue_pos_settings v
                  where v.venue_id = p_venue and v.cancel_password_hash is not null) then
    if coalesce(public.can_manage_pos(p_venue), false) is distinct from true then
      raise exception '취소 비밀번호가 설정되지 않은 매장은 업주·공동운영자만 할 수 있습니다' using errcode = '42501';
    end if;
    return;                                             -- 비밀번호 미설정 매장: 업주·공동운영자는 비밀번호 없이
  end if;
  perform public._ledger_check_cancel_password(p_venue, p_password);  -- 설정 매장: 누구든 비밀번호
end $function$;
revoke all on function public._ledger_require_cancel_auth(uuid, text) from public, anon, authenticated;
grant execute on function public._ledger_require_cancel_auth(uuid, text) to service_role;

create or replace function public.cancel_ledger_buyin(p_id uuid, p_password text)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_venue uuid; v_date date; v_game smallint; v_req uuid;
begin
  select venue_id, session_date, game_seq into v_venue, v_date, v_game from public.ledger_buyins where id = p_id;
  if v_venue is null then return; end if;
  if not coalesce(can_access_ledger(v_venue), false) then raise exception '권한이 없습니다'; end if;
  if public.ledger_is_closed(v_venue, v_date, v_game) then
    raise exception '마감된 장부의 바인은 취소할 수 없습니다 — 먼저 마감을 해제하세요';
  end if;
  perform public._ledger_require_cancel_auth(v_venue, p_password);
  delete from public.ledger_buyins where id = p_id returning request_id into v_req;
  perform public._restore_voucher_for_request(v_req);
end $function$;
revoke all on function public.cancel_ledger_buyin(uuid, text) from public, anon;
grant execute on function public.cancel_ledger_buyin(uuid, text) to authenticated, service_role;

create or replace function public.delete_ledger_player(p_player_id uuid, p_password text default null)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v record; v_cnt int; v_reqs uuid[]; v_req uuid;
begin
  -- 20260925f: 플레이어 행을 잠근다 — 같은 플레이어의 동시 삭제·이름 변경과 줄 세운다.
  select id, venue_id, session_date, game_seq, name into v
    from public.ledger_players where id = p_player_id for update;
  if v.venue_id is null then return; end if;
  if not coalesce(can_access_ledger(v.venue_id), false) then raise exception '권한이 없습니다'; end if;
  if public.ledger_is_closed(v.venue_id, v.session_date, v.game_seq) then
    raise exception '마감된 장부입니다 — 먼저 마감을 해제하세요';
  end if;
  select count(*) into v_cnt from public.ledger_buyins
   where venue_id = v.venue_id and session_date = v.session_date and game_seq = v.game_seq and player_name = v.name;
  -- 돈 기록 삭제는 바인 취소와 같은 규칙(20260925e/f) — 한 헬퍼로.
  if v_cnt > 0 then
    perform public._ledger_require_cancel_auth(v.venue_id, p_password);
  end if;
  -- 삭제와 복원을 한 흐름으로 — 실제로 지워진 행의 요청만 되돌린다(20260911c 와 같은 규칙, 헬퍼 재사용)
  --   배열로 받는 이유: `for … in with del as (delete …) select …` 는 커서가 되어
  --   "DECLARE CURSOR must not contain data-modifying statements in WITH" 로 막힌다.
  with del as (
    delete from public.ledger_buyins
     where venue_id = v.venue_id and session_date = v.session_date and game_seq = v.game_seq and player_name = v.name
    returning request_id
  )
  select array_agg(distinct d.request_id) into v_reqs from del d where d.request_id is not null;
  foreach v_req in array coalesce(v_reqs, '{}'::uuid[]) loop
    perform public._restore_voucher_for_request(v_req);
  end loop;
  delete from public.ledger_players where id = p_player_id;
end $function$;
revoke all on function public.delete_ledger_player(uuid, text) from public, anon;
grant execute on function public.delete_ledger_player(uuid, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. D2 — 바인 금액 서버 규칙
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY INVOKER: 트리거(호출자 authenticated)에서 부르므로 RLS 가 세션 조회에 그대로 걸린다 —
-- 직접 호출해도 자기가 볼 수 있는 세션의 단가만 알 수 있다. 그래서 authenticated 실행을 준다(_ledger_buyin_tiers 와 같다).
create or replace function public._ledger_buyin_apply_amount_rule(b public.ledger_buyins)
 returns public.ledger_buyins
 language plpgsql
 stable
 set search_path = public, pg_temp
as $function$
declare v_price numeric; v_discs jsonb; v_gross bigint; v_disc bigint := 0; v_net bigint; v_sum bigint;
        v_idx int := coalesce(b.discount_index, 0);
begin
  select s.buyin_amount, s.discounts into v_price, v_discs
    from public.ledger_sessions s
   where s.venue_id = b.venue_id and s.session_date = b.session_date and s.game_seq = b.game_seq;
  if not found then
    raise exception '이 게임의 장부가 아직 열려 있지 않습니다 — 장부에서 게임을 먼저 여세요'
      using errcode = '23514', hint = 'LEDGER_SESSION_MISSING';
  end if;
  -- 할인 클램프는 _ledger_buyin_tiers · ledger.ts discountOf 와 같은 식이다(한쪽만 고치면 판정이 갈린다).
  v_gross := greatest(0, round(coalesce(v_price, 0)));
  if v_idx > 0 and jsonb_typeof(v_discs) = 'array' and jsonb_array_length(v_discs) >= v_idx then
    v_disc := least(v_gross, greatest(0, round(coalesce((v_discs -> (v_idx - 1) ->> 'amount')::numeric, 0))));
  end if;
  v_net := greatest(0, v_gross - v_disc);

  if coalesce(b.is_split, false) then
    v_sum := coalesce(b.cash_amount, 0) + coalesce(b.card_amount, 0) + coalesce(b.transfer_amount, 0)
           + coalesce(b.ticket_count, 0)::bigint * 10000 + coalesce(b.unpaid_amount, 0);
    if v_sum is distinct from v_net then
      raise exception '분납 합계(%원)가 참가비(%원)와 다릅니다 — 화면을 새로 불러와 주세요', v_sum, v_net
        using errcode = '23514', hint = 'LEDGER_SPLIT_MISMATCH';
    end if;
  elsif b.payment_method in ('cash', 'card', 'transfer') then
    -- 비분납은 서버가 채운다(approve_buyin_request 와 같은 식) — 늦게 온 다른 게임 세션 값이 들어와도 이 게임 단가가 된다.
    b.cash_amount     := case when b.payment_method = 'cash'     then v_net else 0 end;
    b.card_amount     := case when b.payment_method = 'card'     then v_net else 0 end;
    b.transfer_amount := case when b.payment_method = 'transfer' then v_net else 0 end;
  end if;
  -- ticket·support 비분납은 종전 그대로 둔다(가치는 세션 기준으로 계산되고 금액 칸을 읽지 않는다).
  return b;
end $function$;
revoke all on function public._ledger_buyin_apply_amount_rule(public.ledger_buyins) from public, anon;
grant execute on function public._ledger_buyin_apply_amount_rule(public.ledger_buyins) to authenticated, service_role;

create or replace function public._ledger_buyins_client_guard()
 returns trigger
 language plpgsql
 set search_path = public, pg_temp
as $function$
declare v_price numeric; v_discs jsonb; o bigint[]; n bigint[];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.request_id is not null then
      raise exception '바인 요청 연결은 서버만 설정할 수 있습니다' using errcode = '42501';
    end if;
    new.created_by := auth.uid();
    new.buyin_at := now();
    -- 권한 없는 삽입은 RLS 가 막게 둔다(여기서 먼저 '장부 없음' 으로 답하지 않는다).
    if coalesce(public.can_access_ledger(new.venue_id), false) then
      new := public._ledger_buyin_apply_amount_rule(new);
    end if;
  else
    if new.request_id is distinct from old.request_id
       or new.created_by is distinct from old.created_by
       or new.buyin_at is distinct from old.buyin_at
       or new.venue_id is distinct from old.venue_id
       or new.session_date is distinct from old.session_date then
      raise exception '기록자·기록 시각·매장·요청 연결은 바꿀 수 없습니다' using errcode = '42501';
    end if;
    if new.game_seq is distinct from old.game_seq then
      raise exception '기록의 게임 번호는 바꿀 수 없습니다' using errcode = '42501';
    end if;
    if (new.payment_method, new.is_unpaid, new.is_split, new.cash_amount, new.card_amount, new.transfer_amount,
        new.ticket_count, new.unpaid_amount, new.discount_index)
       is distinct from
       (old.payment_method, old.is_unpaid, old.is_split, old.cash_amount, old.card_amount, old.transfer_amount,
        old.ticket_count, old.unpaid_amount, old.discount_index) then
      new := public._ledger_buyin_apply_amount_rule(new);
    end if;
    select s.buyin_amount, s.discounts into v_price, v_discs
      from public.ledger_sessions s
     where s.venue_id = old.venue_id and s.session_date = old.session_date and s.game_seq = old.game_seq;
    o := public._ledger_buyin_tiers(old, v_price, v_discs);
    n := public._ledger_buyin_tiers(new, v_price, v_discs);
    if n[1] < o[1] or n[2] < o[2] or n[3] < o[3] then
      raise exception '매출이 줄어드는 수정은 업주 취소 비밀번호가 필요합니다'
        using errcode = '42501', hint = 'LEDGER_REDUCE_NEEDS_PASSWORD';
    end if;
  end if;
  return new;
end $function$;
revoke all on function public._ledger_buyins_client_guard() from public, anon, authenticated;
grant execute on function public._ledger_buyins_client_guard() to service_role;

create or replace function public.update_ledger_buyin_reduce(p_id uuid, p_fields jsonb, p_password text)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare r public.ledger_buyins; x public.ledger_buyins; k text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다' using errcode = '42501'; end if;
  if jsonb_typeof(p_fields) is distinct from 'object' then
    raise exception '수정 내용이 올바르지 않습니다' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_fields) loop
    if not (k = any (array['payment_method','is_unpaid','is_split','cash_amount','card_amount','transfer_amount',
                           'ticket_count','unpaid_amount','discount_level','discount_index','early_override'])) then
      raise exception '수정할 수 없는 항목입니다: %', k using errcode = '42501';
    end if;
  end loop;
  select * into r from public.ledger_buyins where id = p_id for update;
  if not found then raise exception '기록을 찾을 수 없습니다 — 화면을 새로 불러와 주세요' using errcode = 'P0002'; end if;
  if not coalesce(can_access_ledger(r.venue_id), false) then raise exception '권한이 없습니다' using errcode = '42501'; end if;
  if public.ledger_is_closed(r.venue_id, r.session_date, r.game_seq) then
    raise exception '마감된 장부의 바인은 수정할 수 없습니다 — 먼저 마감을 해제하세요';
  end if;
  perform public._ledger_require_cancel_auth(r.venue_id, p_password);
  x := jsonb_populate_record(r, p_fields);
  if x.payment_method is null or x.payment_method not in ('ticket','cash','transfer','card','support') then
    raise exception '결제수단이 올바르지 않습니다' using errcode = '22023';
  end if;
  if least(coalesce(x.cash_amount,0), coalesce(x.card_amount,0), coalesce(x.transfer_amount,0),
           coalesce(x.ticket_count,0), coalesce(x.unpaid_amount,0), coalesce(x.discount_index,0)) < 0 then
    raise exception '금액은 0 이상이어야 합니다' using errcode = '22023';
  end if;
  if x.early_override is not null and x.early_override not in ('double','single','none') then
    raise exception '얼리 유형이 올바르지 않습니다' using errcode = '22023';
  end if;
  -- 20260925f D2: 이 경로는 SECURITY DEFINER 라 트리거 규칙이 건너뛴다 — 같은 규칙을 여기서 부른다.
  if (x.payment_method, x.is_unpaid, x.is_split, x.cash_amount, x.card_amount, x.transfer_amount,
      x.ticket_count, x.unpaid_amount, x.discount_index)
     is distinct from
     (r.payment_method, r.is_unpaid, r.is_split, r.cash_amount, r.card_amount, r.transfer_amount,
      r.ticket_count, r.unpaid_amount, r.discount_index) then
    x := public._ledger_buyin_apply_amount_rule(x);
  end if;
  update public.ledger_buyins set
    payment_method = x.payment_method, is_unpaid = coalesce(x.is_unpaid, false), is_split = coalesce(x.is_split, false),
    cash_amount = coalesce(x.cash_amount, 0), card_amount = coalesce(x.card_amount, 0), transfer_amount = coalesce(x.transfer_amount, 0),
    ticket_count = coalesce(x.ticket_count, 0), unpaid_amount = coalesce(x.unpaid_amount, 0),
    discount_level = coalesce(x.discount_level, 0), discount_index = coalesce(x.discount_index, 0),
    early_override = x.early_override
  where id = p_id;
end $function$;
revoke all on function public.update_ledger_buyin_reduce(uuid, jsonb, text) from public, anon;
grant execute on function public.update_ledger_buyin_reduce(uuid, jsonb, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. 자가검사 — 내부 헬퍼는 anon·authenticated 가 직접 못 부른다 / 게이트 ACL 은 종전 그대로
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if has_function_privilege('anon', 'public._is_active_venue_staff(uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._is_active_venue_staff(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public._ledger_require_cancel_auth(uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public._ledger_require_cancel_auth(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public._ledger_buyin_apply_amount_rule(public.ledger_buyins)', 'execute')
     or has_function_privilege('anon', 'public._my_ledger_venue_ids()', 'execute')
     or has_function_privilege('authenticated', 'public._my_ledger_venue_ids()', 'execute')
     or has_function_privilege('anon', 'public.cancel_ledger_buyin(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.delete_ledger_player(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.update_ledger_buyin_reduce(uuid, jsonb, text)', 'execute')
     or has_function_privilege('anon', 'public.grant_ledger_access(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.manage_staff(uuid, text)', 'execute') then
    raise exception '20260925f 자가검사 실패: 내부/변이 함수 ACL 이 열려 있다';
  end if;
  if not has_function_privilege('authenticated', 'public._ledger_buyin_apply_amount_rule(public.ledger_buyins)', 'execute')
     or not has_function_privilege('authenticated', 'public.can_access_ledger(uuid)', 'execute')
     or not has_function_privilege('anon', 'public.can_access_ledger(uuid)', 'execute') then
    raise exception '20260925f 자가검사 실패: 트리거·공개 정책이 부르는 함수의 실행 권한이 빠졌다';
  end if;
end $$;
