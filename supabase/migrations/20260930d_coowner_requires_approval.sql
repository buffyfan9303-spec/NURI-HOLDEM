-- ⏳ 미적용 초안 (store-team 작성, 2026-09-30). 적용은 리드가 MCP execute_sql 로. 리허설 결과는 아래 "리허설" 절.
-- 20260930d — 공동 운영자(venue_owners) 분기도 프로필 승인을 본다 (오너 2026-09-30 "승인 전인 업주 계정도 통과 — 이건 안 되게")
--
-- 왜: 20260926c 가 업주 분기(venues.owner_id)를 _venue_owner_ok(= p.approved is true)로 막았지만,
--   공동 운영자 분기 `venue_owners.status = 'approved'` 는 profiles.approved 를 보지 않는다.
--   20260926c 는 "그 승인 자체가 관리자 승인이다" 로 그대로 뒀는데, 그 전제는 **승인 순간**에만 맞다:
--   · venue_owners 'approved' 행을 만드는 네 경로(admin_decide_venue_owner · admin_update_venue · transfer_venue_primary ·
--     create_my_venue[호출자가 이미 승인됐을 때만])는 모두 같은 순간 profiles.approved = true 를 쓴다(2026-09-30 라이브 prosrc).
--   · 그런데 **승인 철회**(관리자 화면 approveOwner(id,false) → profiles.approved=false 만 씀 · 가입 심사 거절 → banned+approved=false
--     뒤 제재 해제 시 status 만 active 로 돌아옴)는 venue_owners 행을 건드리지 않는다.
--   · 대표 업주는 create_my_venue/admin_update_venue 로 **자기 매장에 자기 'approved' 행**을 갖는다(라이브 1행: 로티아레나 대표).
--   → 승인을 철회해도 이 행으로 can_manage_pos·장부·바인·클락·급여·일정·이용권 전권이 남는다
--     (critical-reviewer 리허설 2026-09-30: profiles.approved=false 업주가 그대로 통과).
--   can_manage_venue 는 이미 공동 운영자에게도 `role='venue_owner' and approved` 를 요구한다 — 판정이 어긋나 있었다.
--
-- 판정 정본: _venue_coowner_ok(venue, user) — "이 매장(kind='venue')의 승인된 venue_owners 행이 있고, 그 사람 프로필이 승인됨".
--   · 정상 공동 운영자는 잠기지 않는다: 승인 경로 네 곳이 전부 approved=true 를 쓴다(일반 회원 기본값은 null — 라이브 user 4명 전부 null).
--   · kind='venue' — _venue_owner_ok 와 같은 기준(그룹은 매장 운영 권한 없음, 20260926c). 라이브 그룹의 venue_owners 행 0.
--   · user 인자를 받는다 — _ledger_can_operate(p_user,…)·transfer_venue_primary(새 대표 검사)가 auth.uid() 가 아닌 사람을 판정한다.
--
-- 바뀌는 함수 13개 + 새 내부 함수 2개(전부 같은 시그니처 create or replace → ACL 보존, §11 에서 라이브 ACL 그대로 재기재)
--   _venue_owner_ok(uuid,uuid) 새 오버로드 — 업주 판정을 '임의의 사람'에 대해(알림 수신자·_ledger_can_operate).
--   _venue_owner_ok(uuid)      본문을 2인자 정본에 위임(auth.uid()) — 조건은 20260926c 그대로(kind='venue' · approved is true).
--   can_manage_pos             공동 운영자 분기 → _venue_coowner_ok. 전이: 함수 54곳·정책 32개(can_access_ledger 15/25 ·
--                              can_view_vouchers 5/3 · can_manage_schedule 0/4 · clock_bg_writable 0/4 포함, 2026-09-30 prosrc/pg_policies 실측)
--   can_manage_venue_staff     공동 운영자 분기 → _venue_coowner_ok (함수 6·정책 2)
--   can_manage_venue_schedules 공동 운영자 분기 → _venue_coowner_ok (함수 1·정책 3)
--   is_any_venue_manager       공동 운영자 분기 → _venue_coowner_ok (정책 2 — 포스터 이미지 업로드·매칭 글)
--   _my_ledger_venue_ids       공동 운영자 분기 → _venue_coowner_ok (resolve/search_ranking_members · find_user_for_transfer)
--   _ledger_can_operate        공동 운영자 분기 → _venue_coowner_ok (_ledger_sessions_client_insert_guard · notify_ledger_open)
--   my_member_venues           'coowner' 행 → _venue_coowner_ok (매장 전환기 목록 — 열리지 않는 매장을 보여 주지 않게)
--   find_user_by_phone         허용 조건의 공동 운영자 분기 → _venue_coowner_ok
--   transfer_venue_primary     ① 호출자 가드: 종전 `not (my_role()='admin' or owner_id = auth.uid())` 는 NULL 이면 통과(fail-open 모양)였고
--                                승인 철회된 대표도 통과했다 → `is distinct from true` + _venue_owner_ok.
--                              ② 새 대표 검사: 'approved' 행만 보고 **새 대표의 approved 를 true 로 다시 써서** 철회를 되살렸다
--                                (대표가 승인 철회된 공동 운영자를 대표로 올리면 관리자 없이 재승인) → _venue_coowner_ok.
--   kill_venue                (리드 결정 2026-09-30) 승인 철회된 대표가 자기 매장·장부를 통째로 지울 수 있었다.
--                              대표 본인 조건·실명·비밀번호·잔여 이용권 검사는 그대로 두고 '승인된 업주 또는 관리자' 를 더한다.
--                              관리자라도 남의 매장은 못 지운다(대표 본인 조건 유지 — 권한을 넓히지 않는다).
--   _venue_notify_recipients  (리드 결정) 업주·공동 운영자 수신자를 _venue_owner_ok(v,u)·_venue_coowner_ok(v,u) 로 거른다.
--                              호출: notify_venue_staff · notify_venue_match_response/decision · notify_league_invite/response.
--   _notify_buyin_request     (리드 결정, 트리거 trg_buyin_request_notify@ledger_buyin_requests) 손님 바인 요청 알림 수신자를 같은 정본으로.
--                              ledger_access 분기는 그대로(직원 — 이번 범위 밖, 아래 보고).
-- 바꾸지 않는 것(보고만):
--   can_manage_venue          이미 approved·role 을 본다.
--   _notify_buyin_request 의 ledger_access 분기  _is_active_venue_staff 를 안 본다 — 퇴사 처리 전 직원 부여 행이 남으면 알림이 간다.
--   respond_staff_invite      venue_owners 를 '수락 금지' 조건으로 쓴다 — 좁히면 오히려 풀린다. 그대로.
--   add/remove_venue_owner · list_venue_owners  can_manage_pos 를 부르므로 자동으로 따라온다.
--
-- 라이브 영향(2026-09-30 실측): venue_owners 1행(approved·대표·profiles.approved=true·active). 권한을 잃는 사람 0.
-- 되돌리기: 각 함수를 §0 md5 가 가리키는 이전 본문으로 create or replace(같은 시그니처 → ACL 보존), 그 뒤 drop function public._venue_coowner_ok(uuid,uuid), public._venue_owner_ok(uuid,uuid)
--           (1인자 _venue_owner_ok 를 먼저 이전 본문으로 되돌린 다음에).

-- §0 적용 전 본문 게이트 — 2026-09-30 라이브 md5(pg_get_functiondef). 이미 이 파일이 적용된 본문이면 통과(재적용 가능).
do $pre$
declare r record;
begin
  for r in select * from (values
      ('public.can_manage_pos(uuid)',              '839329dd951fccf1033911eff4d8e0c9'),
      ('public.can_manage_venue_staff(uuid)',      'a10a5e7e67dc14e77498f1a2928a63e0'),
      ('public.can_manage_venue_schedules(uuid)',  '957bfda6f7ea205ed1ae3064e5997ee4'),
      ('public.is_any_venue_manager()',            '9b05a631ce3c0d05135030b5f33f8f51'),
      ('public._my_ledger_venue_ids()',            '902901bfefd5dfb996c3cb1c649a8573'),
      ('public._ledger_can_operate(uuid,uuid)',    'ab0b50c7fbf6352a58e8b8428653b167'),
      ('public.my_member_venues()',                'f52b77fd1865ed58788d60950819aa95'),
      ('public.find_user_by_phone(text)',          'ca1d68d96f32868b596251e748a07b89'),
      ('public.transfer_venue_primary(uuid,uuid)', '8133628a9ffeb8ac7b683d79b0125b41'),
      ('public._venue_owner_ok(uuid)',             '8234e8ed98cd26cf714054243081d65d'),
      ('public.kill_venue(uuid,text,text)',        '649231e5d02beacfa04db76a90147533'),
      ('public._venue_notify_recipients(uuid,boolean)', 'dfc8b7a10e490b5671df6a9809bde62f'),
      ('public._notify_buyin_request()',           'bdec792307162e3ea51d804498b05025')) t(sig, want)
  loop
    if md5(pg_get_functiondef(r.sig::regprocedure)) <> r.want
       and pg_get_functiondef(r.sig::regprocedure) not like '%20260930d%' then
      raise exception '20260930d: % 라이브 본문이 예상(%)과 다릅니다(%). 본문을 다시 맞추세요',
        r.sig, r.want, md5(pg_get_functiondef(r.sig::regprocedure));
    end if;
  end loop;
end $pre$;

-- §1 판정 정본(내부 함수 — 정의자 함수 안에서만 쓴다)
create or replace function public._venue_coowner_ok(p_venue_id uuid, p_user_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20260930d: 승인된 공동 운영자 행 + 매장(kind='venue') + 그 사람 프로필이 승인됨. 승인 철회 뒤 남은 행으로는 못 연다.
  select exists (
    select 1
      from public.venue_owners vo
      join public.venues   v on v.id = vo.venue_id
      join public.profiles p on p.id = vo.user_id
     where vo.venue_id = p_venue_id
       and vo.user_id  = p_user_id
       and vo.status   = 'approved'
       and v.kind      = 'venue'
       and p.approved is true
  );
$function$;

-- §1-b 업주 판정 정본 — 사람 인자판. 1인자판은 이것에 위임한다(조건 한 곳).
create or replace function public._venue_owner_ok(p_venue_id uuid, p_user_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20260930d: 20260926c 조건을 사람 인자로 — 매장(kind='venue')의 소유자이고 프로필이 승인됨.
  select exists (
    select 1
      from public.venues v
      join public.profiles p on p.id = v.owner_id
     where v.id = p_venue_id
       and v.owner_id = p_user_id
       and v.kind = 'venue'
       and p.approved is true
  );
$function$;

create or replace function public._venue_owner_ok(p_venue_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20260926c: 매장(kind='venue')의 소유자이고 프로필이 승인됐을 때만 운영자다. 그룹 소유자는 운영자가 아니다.
  -- 20260930d: 조건은 2인자 정본 한 곳에.
  select public._venue_owner_ok(p_venue_id, auth.uid());
$function$;

-- §2 can_manage_pos
create or replace function public.can_manage_pos(p_venue_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20260926c: 업주 분기는 _venue_owner_ok. 20260930d: 공동 운영자 분기는 _venue_coowner_ok.
  select (
       coalesce(my_role() = 'admin'::user_role, false)
    or public._venue_owner_ok(p_venue_id)
    or public._venue_coowner_ok(p_venue_id, auth.uid())
  )
  and not exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and ( p.status::text in ('banned', 'withdrawn')
          or ( p.status::text = 'suspended'
               and (p.suspended_until is null or p.suspended_until > now()) ) )
  );
$function$;

-- §3 can_manage_venue_staff
create or replace function public.can_manage_venue_staff(p_venue_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20260930d: 공동 운영자 분기는 _venue_coowner_ok.
  select ( coalesce(my_role() = 'admin'::user_role, false)
      or public._venue_owner_ok(p_venue_id)
      or public._venue_coowner_ok(p_venue_id, auth.uid()) )
     and public._actor_not_sanctioned();
$function$;

-- §4 can_manage_venue_schedules
create or replace function public.can_manage_venue_schedules(p_venue_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20260930d: 공동 운영자 분기는 _venue_coowner_ok.
  select ( coalesce(my_role() = 'admin'::user_role, false)
      or public._venue_owner_ok(p_venue_id)
      or public._venue_coowner_ok(p_venue_id, auth.uid()) )
     and public._actor_not_sanctioned();
$function$;

-- §5 is_any_venue_manager
create or replace function public.is_any_venue_manager()
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20260926c: 업주 분기는 _venue_owner_ok. 20260930d: 공동 운영자 분기는 _venue_coowner_ok.
  select coalesce(public.my_role() = 'admin'::user_role, false)
      or exists (select 1 from public.venues v where v.owner_id = auth.uid() and public._venue_owner_ok(v.id))
      or exists (select 1 from public.venue_owners vo
                  where vo.user_id = auth.uid() and public._venue_coowner_ok(vo.venue_id, vo.user_id));
$function$;

-- §6 _my_ledger_venue_ids
create or replace function public._my_ledger_venue_ids()
 returns uuid[]
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20260926c: 업주 분기는 _venue_owner_ok. 20260930d: 공동 운영자 분기는 _venue_coowner_ok.
  select coalesce(array_agg(t.vid), '{}'::uuid[])
    from (
      select v.id as vid from public.venues v
       where coalesce(public.my_role() = 'admin'::user_role, false)
      union
      select v.id from public.venues v where v.owner_id = auth.uid() and public._venue_owner_ok(v.id)
      union
      select vo.venue_id from public.venue_owners vo
       where vo.user_id = auth.uid() and public._venue_coowner_ok(vo.venue_id, vo.user_id)
      union
      select la.venue_id from public.ledger_access la
       where la.user_id = auth.uid()
         and public._is_active_venue_staff(auth.uid(), la.venue_id)
    ) t;
$function$;

-- §7 _ledger_can_operate
create or replace function public._ledger_can_operate(p_user uuid, p_venue uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20260930d: 업주 분기는 _venue_owner_ok(p_venue, p_user), 공동 운영자 분기는 _venue_coowner_ok(p_venue, p_user).
  select p_user is not null and p_venue is not null and (
       exists (select 1 from public.profiles p where p.id = p_user and p.role = 'admin'::user_role)
    or public._venue_owner_ok(p_venue, p_user)
    or public._venue_coowner_ok(p_venue, p_user)
    or ( exists (select 1 from public.ledger_access la where la.venue_id = p_venue and la.user_id = p_user)
         and public._is_active_venue_staff(p_user, p_venue) )
  );
$function$;

-- §8 my_member_venues
create or replace function public.my_member_venues()
 returns table(id uuid, name text, relation text)
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20260930d: 'coowner' 는 _venue_coowner_ok — 열리지 않는 매장을 전환기에 보여 주지 않는다.
  select distinct on (v.id) v.id, v.name, r.relation
    from (
      select v0.id as vid, 'owner'::text as relation, 0 as rk
        from public.venues v0 where v0.owner_id = auth.uid() and public._venue_owner_ok(v0.id)
      union all
      select vo.venue_id, 'coowner', 1 from public.venue_owners vo
       where vo.user_id = auth.uid() and public._venue_coowner_ok(vo.venue_id, vo.user_id)
      union all
      select p.venue_id, 'staff', 2 from public.profiles p
       where p.id = auth.uid() and p.role = 'venue_staff' and p.venue_id is not null
         and public._is_active_venue_staff(auth.uid(), p.venue_id)
    ) r
    join public.venues v on v.id = r.vid
   where auth.uid() is not null
   order by v.id, r.rk;
$function$;

-- §9 find_user_by_phone — 허용 조건의 공동 운영자 분기만 바뀐다(감사 기록의 v_venue 선택은 그대로)
create or replace function public.find_user_by_phone(p_phone text)
 returns table(id uuid, display text, verified boolean, phone_masked text)
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_digits text := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
        v_allowed boolean; v_venue uuid; v_n int;
begin
  -- 20260926c: 승인된 매장(kind=venue) 업주·공동운영자·관리자만. 20260926a D6: phone_hash 저장 안 함.
  -- 20260930d: 공동 운영자도 프로필 승인이 있어야 한다(_venue_coowner_ok).
  v_allowed := public.my_role() = 'admin'
            or exists (select 1 from public.venues v
                        where v.owner_id = auth.uid() and v.kind = 'venue' and public._venue_owner_ok(v.id))
            or exists (select 1 from public.venue_owners vo
                        where vo.user_id = auth.uid() and public._venue_coowner_ok(vo.venue_id, vo.user_id));
  if not coalesce(v_allowed, false) or length(v_digits) < 9 then
    return;
  end if;
  return query
  select p.id, coalesce(p.nickname, p.name), public.is_ci_verified(p.ci_hash, p.verified_at), public._mask_phone(p.phone)
    from public.profiles p
   where coalesce(p.status::text, 'active') = 'active'
     and regexp_replace(coalesce(p.phone,''), '[^0-9]', '', 'g') <> ''
     and right(regexp_replace(coalesce(p.phone,''), '[^0-9]', '', 'g'), 10) = right(v_digits, 10)
   limit 5;
  get diagnostics v_n = row_count;
  v_venue := coalesce(
    (select v.id from public.venues v where v.owner_id = auth.uid() and v.kind = 'venue' order by v.id limit 1),
    (select vo.venue_id from public.venue_owners vo where vo.user_id = auth.uid() and vo.status = 'approved' order by vo.venue_id limit 1),
    (select pr.venue_id from public.profiles pr where pr.id = auth.uid()));
  insert into public.phone_lookup_audit(caller, venue_id, phone_last4, result_count)
  values (auth.uid(), v_venue, right(v_digits, 4), v_n);
  return;
end $function$;

-- §10 transfer_venue_primary — 호출자 가드 NULL-safe + 승인 대표만, 새 대표는 승인된 공동 운영자만
create or replace function public.transfer_venue_primary(p_venue_id uuid, p_new_owner_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
begin
  -- 20260930d: 종전 `not (… or owner_id = auth.uid())` 는 NULL 에서 통과했고 승인 철회 대표도 통과했다.
  if (coalesce(my_role() = 'admin'::user_role, false) or public._venue_owner_ok(p_venue_id)) is distinct from true then
    raise exception '대표 교체는 현재 대표 또는 운영자만 가능합니다';
  end if;
  -- 20260930d: 아래 update 가 approved=true 를 쓰므로, 승인 철회된 공동 운영자를 올리면 관리자 없이 재승인됐다.
  if public._venue_coowner_ok(p_venue_id, p_new_owner_id) is distinct from true then
    raise exception '새 대표는 먼저 승인된 공동 사장이어야 합니다';
  end if;
  update public.venues set owner_id = p_new_owner_id, updated_at = now() where id = p_venue_id;
  update public.profiles set venue_id = coalesce(venue_id, p_venue_id), role = 'venue_owner', approved = true where id = p_new_owner_id;
end $function$;

-- §10-b kill_venue — 승인된 업주(또는 관리자인 대표)만. 나머지 본문은 라이브 그대로.
create or replace function public.kill_venue(p_venue_id uuid, p_owner_name text, p_password text)
 returns integer
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_owner uuid; v_real text; v_hash text; v_tbl text; v_left int;
  v_whitelist text[] := array[
    'comments','schedules','venue_follows','venue_staff_invites','venue_rankings','venue_notices',
    'venue_pos_settings','ledger_access','schedule_access','venue_staff','ledger_sessions','staff_schedule','clock_presets',
    'ranking_point_awards','ledger_buyins','ledger_players','clock_states','staff_wage','waitlist',
    'customer_profiles','customer_aliases','coupons','dealer_shifts','store_vouchers','checkins','voucher_access',
    'venue_messages','venue_score_entries','league_members','league_entries','venue_reviews',
    'voucher_credit_requests','venue_event_requests','venue_owners','ledger_buyin_requests','venue_announcements',
    'venue_seasons','game_presets','venue_kill_switch','league_event_status'
  ];
begin
  select owner_id into v_owner from public.venues where id = p_venue_id;
  if v_owner is null then raise exception '매장을 찾을 수 없습니다'; end if;
  if auth.uid() is null or auth.uid() <> v_owner then raise exception '매장 대표 업주만 실행할 수 있습니다'; end if;
  -- 20260930d: 승인 철회·승인 전 대표는 매장을 지울 수 없다(대표 본인 조건은 위에서 그대로).
  if (public._venue_owner_ok(p_venue_id) or coalesce(public.my_role() = 'admin'::user_role, false)) is distinct from true then
    raise exception '승인된 업주만 매장을 삭제할 수 있습니다';
  end if;
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
  perform public._audit('kill_venue', p_venue_id::text, jsonb_build_object('owner_name_verified', true));
  update public.profiles set role = 'user', approved = false, staff_title = null, venue_id = null
   where venue_id = p_venue_id and role = 'venue_staff';
  update public.profiles set venue_id = null where venue_id = p_venue_id;
  foreach v_tbl in array v_whitelist loop
    execute format('delete from public.%I where venue_id = $1', v_tbl) using p_venue_id;
  end loop;
  execute format('drop sequence if exists public.%I', public._ledger_pw_seq_name(p_venue_id));
  perform set_config('nuri.voucher_purge_venue', p_venue_id::text, true);
  delete from public.voucher_events where venue_id = p_venue_id;
  perform set_config('nuri.voucher_purge_venue', '', true);
  delete from public.venues where id = p_venue_id;
  return 1;
end $function$;

-- §10-c _venue_notify_recipients — 업주·공동 운영자 수신자를 정본으로 거른다
create or replace function public._venue_notify_recipients(p_venue uuid, p_include_staff boolean default false)
 returns setof uuid
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20260930d: 승인 철회·승인 전 업주·공동 운영자에게는 매장 알림을 보내지 않는다.
  select u from (
    select v.owner_id as u from public.venues v where v.id = p_venue and public._venue_owner_ok(p_venue, v.owner_id)
    union select vo.user_id from public.venue_owners vo where vo.venue_id = p_venue and public._venue_coowner_ok(p_venue, vo.user_id)
    union select pr.id from public.profiles pr where p_include_staff and public._is_active_venue_staff(pr.id, p_venue)
  ) s
  where u is not null
    and not exists (select 1 from public.profiles m where m.id = s.u and coalesce(m.mute_venue_notify, false));
$function$;

-- §10-d _notify_buyin_request — 손님 바인 요청 알림 수신자(업주·공동 운영자 분기)를 정본으로
create or replace function public._notify_buyin_request()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_cnt int; v_msg text;
begin
  -- 20260930d: 업주·공동 운영자 분기는 _venue_owner_ok(v,u)·_venue_coowner_ok(v,u).
  select count(*) into v_cnt from ledger_buyin_requests where venue_id = NEW.venue_id and session_date = NEW.session_date and status = 'pending';
  v_msg := '🙋 손님 참가(바인) 요청 ' || v_cnt || '건 대기';
  update notifications set message = v_msg, created_at = now()
   where link = '/my-store/ledger' and title = '🙋 손님 바인 요청' and read = false and created_at > now() - interval '30 minutes'
     and user_id in (
       select pr.id from profiles pr where coalesce(pr.mute_venue_notify, false) = false and (
         public._venue_owner_ok(NEW.venue_id, pr.id)
         or public._venue_coowner_ok(NEW.venue_id, pr.id)
         or exists (select 1 from ledger_access la where la.venue_id = NEW.venue_id and la.user_id = pr.id)));
  insert into notifications (user_id, type, title, message, link, read)
  select pr.id, 'system', '🙋 손님 바인 요청', v_msg, '/my-store/ledger', false
  from profiles pr where coalesce(pr.mute_venue_notify, false) = false and (
    public._venue_owner_ok(NEW.venue_id, pr.id)
    or public._venue_coowner_ok(NEW.venue_id, pr.id)
    or exists (select 1 from ledger_access la where la.venue_id = NEW.venue_id and la.user_id = pr.id))
   and not exists (select 1 from notifications n where n.user_id = pr.id and n.link = '/my-store/ledger' and n.title = '🙋 손님 바인 요청' and n.read = false and n.created_at > now() - interval '30 minutes');
  return NEW;
end; $function$;

-- §11 ACL — 2026-09-30 라이브 proacl 그대로 재기재(DROP 후 재적용되는 경우에도 같은 상태가 되게).
--   can_manage_pos·can_manage_venue_staff 는 PUBLIC 실행이 원래 상태(roles {public} 정책이 anon 조회에서도 부른다 — 20260926c §9).
revoke all on function public._venue_coowner_ok(uuid, uuid) from public, anon, authenticated;
grant execute on function public._venue_coowner_ok(uuid, uuid) to service_role;

revoke all on function public.can_manage_pos(uuid) from public, anon, authenticated;
grant execute on function public.can_manage_pos(uuid) to public, authenticated, service_role;

revoke all on function public.can_manage_venue_staff(uuid) from public, anon, authenticated;
grant execute on function public.can_manage_venue_staff(uuid) to public, authenticated, service_role;

revoke all on function public.can_manage_venue_schedules(uuid) from public, anon;
grant execute on function public.can_manage_venue_schedules(uuid) to authenticated, service_role;

revoke all on function public.is_any_venue_manager() from public, anon;
grant execute on function public.is_any_venue_manager() to authenticated, service_role;

revoke all on function public._my_ledger_venue_ids() from public, anon, authenticated;
grant execute on function public._my_ledger_venue_ids() to service_role;

revoke all on function public._ledger_can_operate(uuid, uuid) from public, anon, authenticated;
grant execute on function public._ledger_can_operate(uuid, uuid) to service_role;

revoke all on function public.my_member_venues() from public, anon;
grant execute on function public.my_member_venues() to authenticated, service_role;

revoke all on function public.find_user_by_phone(text) from public, anon;
grant execute on function public.find_user_by_phone(text) to authenticated, service_role;

revoke all on function public.transfer_venue_primary(uuid, uuid) from public, anon;
grant execute on function public.transfer_venue_primary(uuid, uuid) to authenticated, service_role;

revoke all on function public._venue_owner_ok(uuid, uuid) from public, anon, authenticated;
grant execute on function public._venue_owner_ok(uuid, uuid) to service_role;

revoke all on function public._venue_owner_ok(uuid) from public, anon, authenticated;
grant execute on function public._venue_owner_ok(uuid) to service_role;

revoke all on function public.kill_venue(uuid, text, text) from public, anon;
grant execute on function public.kill_venue(uuid, text, text) to authenticated, service_role;

revoke all on function public._venue_notify_recipients(uuid, boolean) from public, anon, authenticated;
grant execute on function public._venue_notify_recipients(uuid, boolean) to service_role;

revoke all on function public._notify_buyin_request() from public, anon, authenticated;
grant execute on function public._notify_buyin_request() to service_role;

-- §12 자가검사
do $check$
declare r record; d text;
begin
  -- 본문: 공동 운영자 분기가 전부 정본을 거친다. "vo.status = 'approved'" 를 권한 판정으로 직접 쓰는 곳이 없어야 한다
  --   (find_user_by_phone 은 감사 기록 v_venue 선택 1곳만 남는다 — 허용 판정 뒤라 권한이 아니다).
  for r in select * from (values
      ('public.can_manage_pos(uuid)'), ('public.can_manage_venue_staff(uuid)'), ('public.can_manage_venue_schedules(uuid)'),
      ('public.is_any_venue_manager()'), ('public._my_ledger_venue_ids()'), ('public._ledger_can_operate(uuid,uuid)'),
      ('public.my_member_venues()'), ('public.find_user_by_phone(text)'), ('public.transfer_venue_primary(uuid,uuid)')) t(sig)
  loop
    d := pg_get_functiondef(r.sig::regprocedure);
    if d not like '%_venue_coowner_ok(%' then
      raise exception '20260930d 자가검사: % 가 _venue_coowner_ok 를 쓰지 않습니다', r.sig;
    end if;
    if r.sig <> 'public.find_user_by_phone(text)' and d ~ 'status\s*=\s*''approved''' then
      raise exception '20260930d 자가검사: % 에 venue_owners 승인 행 직접 판정이 남아 있습니다', r.sig;
    end if;
  end loop;
  d := pg_get_functiondef('public._venue_coowner_ok(uuid,uuid)'::regprocedure);
  if d not like '%p.approved is true%' or d not like '%v.kind      = ''venue''%' or d not like '%vo.status   = ''approved''%' then
    raise exception '20260930d 자가검사: _venue_coowner_ok 에 승인·매장 종류·행 상태 검사가 없습니다';
  end if;
  if pg_get_functiondef('public.transfer_venue_primary(uuid,uuid)'::regprocedure) !~ 'is distinct from true\s+then\s+raise exception ''대표 교체' then
    raise exception '20260930d 자가검사: transfer_venue_primary 호출자 가드가 NULL-safe 가 아닙니다';
  end if;
  -- 새 대상 4개: 정본 사용
  if pg_get_functiondef('public._venue_owner_ok(uuid)'::regprocedure) not like '%_venue_owner_ok(p_venue_id, auth.uid())%'
     or pg_get_functiondef('public._venue_owner_ok(uuid,uuid)'::regprocedure) not like '%p.approved is true%'
     or pg_get_functiondef('public._venue_owner_ok(uuid,uuid)'::regprocedure) not like '%v.kind = ''venue''%' then
    raise exception '20260930d 자가검사: _venue_owner_ok 정본이 어긋났습니다';
  end if;
  d := pg_get_functiondef('public._ledger_can_operate(uuid,uuid)'::regprocedure);
  if d not like '%_venue_owner_ok(p_venue, p_user)%' then
    raise exception '20260930d 자가검사: _ledger_can_operate 업주 분기가 정본을 쓰지 않습니다';
  end if;
  d := pg_get_functiondef('public.kill_venue(uuid,text,text)'::regprocedure);
  if d !~ '_venue_owner_ok\(p_venue_id\) or coalesce\(public\.my_role\(\) = ''admin''::user_role, false\)\) is distinct from true'
     or d not like '%auth.uid() <> v_owner%' or d not like '%extensions.crypt(p_password, v_hash)%' or d not like '%v_left > 0%' then
    raise exception '20260930d 자가검사: kill_venue 가드(승인·대표 본인·비밀번호·잔여 이용권)가 빠졌습니다';
  end if;
  for r in select * from (values ('public._venue_notify_recipients(uuid,boolean)'), ('public._notify_buyin_request()')) t(sig) loop
    d := pg_get_functiondef(r.sig::regprocedure);
    if d not like '%_venue_owner_ok(%' or d not like '%_venue_coowner_ok(%' or d ~ 'status\s*=\s*''approved''' or d ~ 'v\.owner_id\s*=\s*pr\.id' then
      raise exception '20260930d 자가검사: % 수신자가 정본으로 걸러지지 않습니다', r.sig;
    end if;
  end loop;
  -- search_path 고정
  for r in select p.oid::regprocedure::text sig, p.proconfig from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname in ('_venue_coowner_ok','can_manage_pos','can_manage_venue_staff','can_manage_venue_schedules',
                                'is_any_venue_manager','_my_ledger_venue_ids','_ledger_can_operate','my_member_venues',
                                'find_user_by_phone','transfer_venue_primary','_venue_owner_ok','kill_venue',
                                '_venue_notify_recipients','_notify_buyin_request')
  loop
    if r.proconfig is null or not ('search_path=public, pg_temp' = any(r.proconfig)) then
      raise exception '20260930d 자가검사: % search_path 미고정(%)', r.sig, r.proconfig;
    end if;
  end loop;
  -- ACL
  if has_function_privilege('authenticated', 'public._venue_coowner_ok(uuid,uuid)', 'execute')
     or has_function_privilege('anon', 'public._venue_coowner_ok(uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._ledger_can_operate(uuid,uuid)', 'execute')
     or has_function_privilege('anon', 'public._ledger_can_operate(uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._my_ledger_venue_ids()', 'execute')
     or has_function_privilege('authenticated', 'public._venue_owner_ok(uuid,uuid)', 'execute')
     or has_function_privilege('anon', 'public._venue_owner_ok(uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._venue_owner_ok(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._venue_notify_recipients(uuid,boolean)', 'execute')
     or has_function_privilege('authenticated', 'public._notify_buyin_request()', 'execute') then
    raise exception '20260930d 자가검사: 내부 함수가 열려 있습니다';
  end if;
  if has_function_privilege('anon', 'public.transfer_venue_primary(uuid,uuid)', 'execute')
     or has_function_privilege('anon', 'public.my_member_venues()', 'execute')
     or has_function_privilege('anon', 'public.kill_venue(uuid,text,text)', 'execute')
     or has_function_privilege('anon', 'public.find_user_by_phone(text)', 'execute')
     or has_function_privilege('anon', 'public.is_any_venue_manager()', 'execute')
     or has_function_privilege('anon', 'public.can_manage_venue_schedules(uuid)', 'execute') then
    raise exception '20260930d 자가검사: anon 실행 권한이 열려 있습니다';
  end if;
  if not has_function_privilege('authenticated', 'public.can_manage_pos(uuid)', 'execute')
     or not has_function_privilege('anon', 'public.can_manage_pos(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.transfer_venue_primary(uuid,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.my_member_venues()', 'execute')
     or not has_function_privilege('authenticated', 'public.kill_venue(uuid,text,text)', 'execute') then
    raise exception '20260930d 자가검사: 필요한 실행 권한이 빠졌습니다';
  end if;
  -- 행동: 비로그인에서 fail-open 없음
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from public.venues v where coalesce(public.can_manage_pos(v.id), false)) then
    raise exception '20260930d 자가검사: 비로그인에서 can_manage_pos 가 참인 매장이 있습니다';
  end if;
  -- 라이브 영향: 지금 승인된 venue_owners 행 중 권한을 잃는 행(프로필 미승인·그룹) — 0 이어야 한다
  if exists (select 1 from public.venue_owners vo
              where vo.status = 'approved' and not public._venue_coowner_ok(vo.venue_id, vo.user_id)
                and exists (select 1 from public.profiles p where p.id = vo.user_id and p.role::text <> 'admin')) then
    raise exception '20260930d 자가검사: 지금 권한을 잃는 공동 운영자 행이 있습니다 — 리드 확인 전 적용 금지';
  end if;
  -- 라이브 영향: 운영 중인 매장(kind=venue)의 관리자 아닌 소유자가 미승인이면 알림을 잃는다 — 0 이어야 한다
  if exists (select 1 from public.venues v join public.profiles p on p.id = v.owner_id
              where v.kind = 'venue' and p.role::text <> 'admin' and not public._venue_owner_ok(v.id, v.owner_id)) then
    raise exception '20260930d 자가검사: 미승인 매장 소유자가 있습니다(알림 수신 제외 대상) — 리드 확인 전 적용 금지';
  end if;
end $check$;

notify pgrst, 'reload schema';

-- 리허설 1차(9개 함수 판, 2026-09-30, store-team, 라이브 begin…rollback · 결과를 raise 로 받아 전량 롤백, 뒤에 새 함수 0·vo 1행·md5 원복 확인)
--   §0 게이트·§12 자가검사 통과. 정상 공동 운영자는 실제 경로(add_venue_owner → admin_decide_venue_owner)로 만들었다.
--   적용 전(같은 시험, 마이그레이션 없이): N1·N2·N3 전부 pos/led/vch/stf/sch/any = true, 전화 조회 통과, T1 은 승인 전 사람을 대표로 올리며 approved=true 로 되살림.
--   적용 후:
--     양성 P1 로티 업주·P2 E2E 업주·P3 관리자·P4 관리자(approved null)·P5 공동 운영자: 판정 7종 true, 장부·클락·급여 쓰기 RLS 통과
--       (바인 23514 = RLS 통과 뒤 CHECK 제약 — 시험 값 탓), 전화 조회 감사 1건.
--     음성 N1 승인 철회 업주(자기 매장 'approved' 행 보유)·N2 승인 전 업주+공동 운영자 행·N3 승인 철회 공동 운영자:
--       판정 7종 false, 전환기 0, 장부·바인·클락·급여 쓰기 42501, 전화 조회 0.
--     T1 승인 업주가 승인 전 사람을 대표로 → '새 대표는 먼저…' 거절. T2 승인 철회 대표의 교체 → '대표 교체는…' 거절. 비로그인 can_manage_pos 참 0.
-- 리허설 2차(13개 함수 판 = 이 파일 전문, 2026-09-30, store-team, 라이브 begin…raise…rollback). §0 게이트·§12 자가검사 통과.
--   적용 전(같은 시험): N1 승인 철회 대표 kill_venue = 성공(매장 행 0 — 트랜잭션 안), N1·N2·N3 알림 수신자·바인 요청 알림 1건씩.
--   적용 후:
--     음성 N1·N2·N3: 수신자 목록 0 · 바인 요청 알림 0 · 판정 7종 false · 쓰기 4종 42501 · 전화 조회 0.
--       N1 kill_venue → '승인된 업주만 매장을 삭제할 수 있습니다' 거절, 매장 행 1(그대로).
--     양성 P1 로티 업주·P2 E2E 업주·P5 공동 운영자: 수신자 1 · 바인 요청 알림 1 · 판정 true. P3·P4 관리자: 수신자 0(소유자·공동 운영자 아님, 종전과 같음).
--     K 승인 복구 뒤 같은 대표의 kill_venue(실명·비밀번호) → 1, 매장 행 0·장부 0 — 기존 경로 그대로 동작.
--     T1·T2 거절, 비로그인 can_manage_pos 참 0.
--   롤백 확인: 새 함수 0 · 로티 매장 1·장부 1 · 킬스위치 0 · vo 1 · 시험 바인 요청 0 · kill_venue·_venue_owner_ok md5 원래 값.
