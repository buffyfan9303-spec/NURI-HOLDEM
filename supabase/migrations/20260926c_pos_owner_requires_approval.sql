-- ✅ 적용 완료 2026-09-26 (nuri-lead, MCP execute_sql) — §0 게이트·§10 자가검사 통과.
--    적용 후 양성 대조: 승인 업주 3곳 can_manage_pos·can_access_ledger = true(E2E·누리 테스트·로티아레나), 관리자 소유 dealer_team = true.
--    리허설(critical-reviewer v2, 전량 롤백): 승인 전 업주·그룹 소유자 운영 판정 전부 거짓/42501, 그룹 기능 9종 통과.
-- 20260926c — 승인 전 업주는 서버에서도 매장 운영 권한이 없다 (오너 결정 2026-09-26)
--
-- 왜: can_manage_pos 의 업주 분기가 `venues.owner_id = auth.uid()` 만 보고 profiles.approved 를 보지 않는다.
--   create_my_venue 가 매장을 approved=false · status 기본 'active' 로 만들기 때문에, 업주 인증 심사 중인 회원이
--   자기 매장의 장부·바인 요청·클락·급여·일정·이용권 발급까지 서버에서 전권을 받았다
--   (2026-09-26 리허설: ownerpending → can_access_ledger(VO)=true, 바인 요청 1행, 급여 설정 쓰기 ok).
--   can_manage_venue 는 이미 approved 를 본다 — 두 판정이 어긋나 있었다.
--
-- 판정 정본: _venue_owner_ok(venue) — "이 매장의 owner_id 가 나이고, 매장(kind='venue')이며, 내 프로필이 승인됨".
--   · 그룹(kind <> 'venue': club·youtuber·other·dealer_team)의 소유자는 **매장 운영 권한이 없다**(오너 결정 2026-09-26 개정).
--     그룹 본연 기능(게시·채팅·멤버·그룹 소개·공지·이미지)은 이 판정을 쓰지 않는다 — is_group_manager·owner_id 직접 비교·
--     community_images 버킷으로 돌아간다(2026-09-26 전수: 그룹 화면 GroupPage 가 부르는 표·RPC 중 이 계열 사용 0곳).
--     라이브 영향: 그룹 1곳(dealer_team, 관리자 소유 — 관리자 분기로 계속 통과), 그룹 매장의 운영 데이터 행 0.
--   · kind 는 NOT NULL default 'venue', 사용자 변경은 guard_venue_verification 트리거가 막는다(우회 불가).
--   · 공동 운영자(venue_owners.status='approved') 분기는 그대로 — 그 승인 자체가 관리자 승인이다.
--   · 관리자 분기 그대로.
--   · 승인 업주의 두 번째 매장(venues.approved=false)은 **계속 통과** — 매장 승인이 아니라 사람 승인을 본다
--     (라이브에 이 경우 1곳이 운영 중이다, 2026-09-26 실측).
--
-- 바뀌는 함수 7개 + 새 내부 함수 1개(전부 같은 시그니처 create or replace → ACL 보존, 아래 §9 에서 그대로 재기재)
--   can_manage_pos            업주 분기 → _venue_owner_ok. 전이: can_access_ledger·can_manage_schedule·can_view_vouchers·
--                             clock_bg_writable 과 이들을 부르는 정책 60여 개·RPC 80여 개가 그대로 따라온다(보고서 표).
--   _my_ledger_venue_ids      업주 분기 → _venue_owner_ok (회원 검색·양도 대상 검색의 '내 매장' 범위)
--   can_manage_venue_staff    업주 분기 → _venue_owner_ok (직원 추가·초대 취소·권한 변경·직원 목록)
--   can_manage_venue_schedules 업주 분기 → _venue_owner_ok (포스터 insert/update/delete 정책, 화면 게이트)
--   is_any_venue_manager      업주 분기 → _venue_owner_ok (포스터 이미지 업로드 storage 정책, 매칭 글 읽기)
--   notify_venue_staff        `or owner_id = auth.uid()` 우회 절 삭제 → can_manage_pos 만
--   find_user_by_phone        (§8, 리드 결정으로 포함) 허용 조건을 '승인된 매장(kind=venue) 업주·공동운영자·관리자'로.
--                             종전에는 그룹을 만든 **아무 회원**이나 전화번호로 회원을 찾을 수 있었다(create_group → owner_id).
-- 바꾸지 않는 것: venue_is_hidden(보고서 판정 — 미승인 매장의 클락 공개는 이 파일로 원천이 막힌다), venues 정책(심사 중
--   업주가 자기 신청 정보를 고치는 경로), is_group_manager(그룹 전용).
--
-- 되돌리기: 각 함수를 §0 의 md5 가 가리키는 이전 본문으로 create or replace(같은 시그니처 → ACL 보존),
--           그 뒤 drop function public._venue_owner_ok(uuid).

-- §0 적용 전 본문 게이트 — 라이브 본문이 예상과 다르면 멈춘다(이미 이 파일이 적용된 본문이면 통과 = 재적용 가능)
do $pre$
declare r record;
begin
  for r in select * from (values
      ('public.can_manage_pos(uuid)',                    'e72e0404c12752cbf14a051c6aabec3d'),
      ('public._my_ledger_venue_ids()',                  '6433b92745f1b32e898d83f97a35b7b4'),
      ('public.can_manage_venue_staff(uuid)',            'c6117c3706bbe632ea3d045027eec562'),
      ('public.can_manage_venue_schedules(uuid)',        'fa14e7a1929a9a7fff7664f45de9be68'),
      ('public.is_any_venue_manager()',                  '33d5ce5589252f8fd93bf3794baffe25'),
      ('public.notify_venue_staff(uuid,text,text,text)', 'a294a20ec888f7ab0a352347b9e4c685'),
      ('public.find_user_by_phone(text)',                '3ca45305c4a9dafab26920dbabf94aaa')) t(sig, want)
  loop
    if md5(pg_get_functiondef(r.sig::regprocedure)) <> r.want
       and pg_get_functiondef(r.sig::regprocedure) not like '%20260926c%' then
      raise exception '20260926c: % 라이브 본문이 예상(%)과 다릅니다(%). 본문을 다시 맞추세요',
        r.sig, r.want, md5(pg_get_functiondef(r.sig::regprocedure));
    end if;
  end loop;
end $pre$;

-- §1 판정 정본(내부 함수 — 직접 호출 불가, 정의자 함수 안에서만 쓴다)
create or replace function public._venue_owner_ok(p_venue_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20260926c: 매장(kind='venue')의 소유자이고 프로필이 승인됐을 때만 운영자다. 그룹 소유자는 운영자가 아니다.
  select exists (
    select 1
      from public.venues v
      join public.profiles p on p.id = v.owner_id
     where v.id = p_venue_id
       and v.owner_id = auth.uid()
       and v.kind = 'venue'
       and p.approved is true
  );
$function$;

-- §2 can_manage_pos
create or replace function public.can_manage_pos(p_venue_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20260926c: 업주 분기는 _venue_owner_ok(승인된 업주만).
  select (
       coalesce(my_role() = 'admin'::user_role, false)
    or public._venue_owner_ok(p_venue_id)
    or exists (select 1 from public.venue_owners vo
                where vo.venue_id = p_venue_id and vo.user_id = auth.uid()
                  and vo.status = 'approved')
  )
  and not exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and ( p.status::text in ('banned', 'withdrawn')
          or ( p.status::text = 'suspended'
               and (p.suspended_until is null or p.suspended_until > now()) ) )
  );
$function$;

-- §3 _my_ledger_venue_ids
create or replace function public._my_ledger_venue_ids()
 returns uuid[]
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20260926c: 업주 분기는 _venue_owner_ok.
  select coalesce(array_agg(t.vid), '{}'::uuid[])
    from (
      select v.id as vid from public.venues v
       where coalesce(public.my_role() = 'admin'::user_role, false)
      union
      select v.id from public.venues v where v.owner_id = auth.uid() and public._venue_owner_ok(v.id)
      union
      select vo.venue_id from public.venue_owners vo
       where vo.user_id = auth.uid() and vo.status = 'approved'
      union
      select la.venue_id from public.ledger_access la
       where la.user_id = auth.uid()
         and public._is_active_venue_staff(auth.uid(), la.venue_id)
    ) t;
$function$;

-- §4 can_manage_venue_staff
create or replace function public.can_manage_venue_staff(p_venue_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20260926c: 업주 분기는 _venue_owner_ok.
  select coalesce(my_role() = 'admin'::user_role, false)
      or public._venue_owner_ok(p_venue_id)
      or exists (select 1 from public.venue_owners vo
                  where vo.venue_id = p_venue_id and vo.user_id = auth.uid() and vo.status = 'approved');
$function$;

-- §5 can_manage_venue_schedules
create or replace function public.can_manage_venue_schedules(p_venue_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20260926c: 업주 분기는 _venue_owner_ok.
  select coalesce(my_role() = 'admin'::user_role, false)
      or public._venue_owner_ok(p_venue_id)
      or exists (select 1 from public.venue_owners vo
                  where vo.venue_id = p_venue_id and vo.user_id = auth.uid() and vo.status = 'approved');
$function$;

-- §6 is_any_venue_manager
create or replace function public.is_any_venue_manager()
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20260926c: 업주 분기는 _venue_owner_ok.
  select coalesce(public.my_role() = 'admin'::user_role, false)
      or exists (select 1 from public.venues v where v.owner_id = auth.uid() and public._venue_owner_ok(v.id))
      or exists (select 1 from public.venue_owners vo where vo.user_id = auth.uid() and vo.status = 'approved');
$function$;

-- §7 notify_venue_staff — owner_id 우회 절 삭제
create or replace function public.notify_venue_staff(p_venue_id uuid, p_title text, p_message text, p_link text default null::text)
 returns integer
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare n integer;
begin
  -- 20260926c: 소유자 직접 비교 절(venues 소유자 = 나)이 can_manage_pos 를 우회했다 — 판정은 can_manage_pos 하나.
  -- NULL-safe: not can_manage_pos(...) 는 비로그인에서 fail-open 이다(§3).
  if public.can_manage_pos(p_venue_id) is distinct from true then
    raise exception '이 매장에 알림을 보낼 권한이 없습니다';
  end if;
  insert into public.notifications (user_id, type, title, message, link, read)
  select pr.id, 'system', p_title, p_message, p_link, false
  from public.profiles pr
  where pr.venue_id = p_venue_id
    and pr.id is distinct from auth.uid()
    and coalesce(pr.mute_venue_notify, false) = false;
  get diagnostics n = row_count;
  return n;
end;
$function$;

-- §8 find_user_by_phone — (리드 결정: 포함) 허용 조건을 승인된 '매장' 업주·공동운영자·관리자로
create or replace function public.find_user_by_phone(p_phone text)
 returns table(id uuid, display text, verified boolean, phone_masked text)
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_digits text := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
        v_allowed boolean; v_venue uuid; v_n int;
begin
  -- 20260926c: 종전엔 venues.owner_id 면 누구나 — create_group 으로 그룹을 만든 일반 회원·심사 중 업주도 통과했다.
  v_allowed := public.my_role() = 'admin'
            or exists (select 1 from public.venues v
                        where v.owner_id = auth.uid() and v.kind = 'venue' and public._venue_owner_ok(v.id))
            or exists (select 1 from public.venue_owners vo where vo.user_id = auth.uid() and vo.status = 'approved');
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
  insert into public.phone_lookup_audit(caller, venue_id, phone_last4, phone_hash, result_count)
  values (auth.uid(), v_venue, right(v_digits, 4), md5(v_digits), v_n);
  return;
end $function$;

-- §9 ACL — 라이브 실측(2026-09-26) 그대로 재기재. 함수가 새로 만들어지는 경우(DROP 후 재적용)에도 같은 상태가 되게.
--   can_manage_pos·can_manage_venue_staff 는 PUBLIC 실행이 **원래 상태**다 — roles {public} 정책(coupons·clock_states 등)이
--   anon 조회에서도 이 판정을 부르므로 anon 에서 회수하면 anon 의 공개 조회가 0행이 아니라 권한 오류가 된다. 읽기 판정이라 유지.
revoke all on function public._venue_owner_ok(uuid) from public, anon, authenticated;
grant execute on function public._venue_owner_ok(uuid) to service_role;

revoke all on function public.can_manage_pos(uuid) from public, anon, authenticated;
grant execute on function public.can_manage_pos(uuid) to public, authenticated, service_role;

revoke all on function public._my_ledger_venue_ids() from public, anon, authenticated;
grant execute on function public._my_ledger_venue_ids() to service_role;

revoke all on function public.can_manage_venue_staff(uuid) from public, anon, authenticated;
grant execute on function public.can_manage_venue_staff(uuid) to public, authenticated, service_role;

revoke all on function public.can_manage_venue_schedules(uuid) from public, anon;
grant execute on function public.can_manage_venue_schedules(uuid) to authenticated, service_role;

revoke all on function public.is_any_venue_manager() from public, anon;
grant execute on function public.is_any_venue_manager() to authenticated, service_role;

revoke all on function public.notify_venue_staff(uuid, text, text, text) from public, anon;
grant execute on function public.notify_venue_staff(uuid, text, text, text) to authenticated, service_role;

revoke all on function public.find_user_by_phone(text) from public, anon;
grant execute on function public.find_user_by_phone(text) to authenticated, service_role;

-- §10 자가검사
do $check$
declare r record; d text;
begin
  -- 본문: 7개 모두 새 판정을 쓰고, notify 의 우회 절이 없어야 한다
  for r in select * from (values
      ('public.can_manage_pos(uuid)'), ('public._my_ledger_venue_ids()'), ('public.can_manage_venue_staff(uuid)'),
      ('public.can_manage_venue_schedules(uuid)'), ('public.is_any_venue_manager()'), ('public.find_user_by_phone(text)')) t(sig)
  loop
    if pg_get_functiondef(r.sig::regprocedure) not like '%_venue_owner_ok(%' then
      raise exception '20260926c 자가검사: % 가 _venue_owner_ok 를 쓰지 않습니다', r.sig;
    end if;
  end loop;
  d := pg_get_functiondef('public.notify_venue_staff(uuid,text,text,text)'::regprocedure);
  if d ~ 'owner_id\s*=\s*auth\.uid' then raise exception '20260926c 자가검사: notify_venue_staff 에 owner_id 우회 절이 남아 있습니다'; end if;
  if pg_get_functiondef('public._venue_owner_ok(uuid)'::regprocedure) not like '%p.approved is true%'
     or pg_get_functiondef('public._venue_owner_ok(uuid)'::regprocedure) not like '%v.kind = ''venue''%' then
    raise exception '20260926c 자가검사: _venue_owner_ok 에 승인·매장 종류 검사가 없습니다';
  end if;
  -- search_path 고정(8개)
  for r in select p.oid::regprocedure::text sig, p.proconfig from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname in ('_venue_owner_ok','can_manage_pos','_my_ledger_venue_ids','can_manage_venue_staff',
                                'can_manage_venue_schedules','is_any_venue_manager','notify_venue_staff','find_user_by_phone')
  loop
    if r.proconfig is null or not ('search_path=public, pg_temp' = any(r.proconfig)) then
      raise exception '20260926c 자가검사: % search_path 미고정(%)', r.sig, r.proconfig;
    end if;
  end loop;
  -- ACL
  if has_function_privilege('authenticated', 'public._venue_owner_ok(uuid)', 'execute')
     or has_function_privilege('anon', 'public._venue_owner_ok(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._my_ledger_venue_ids()', 'execute')
     or has_function_privilege('anon', 'public._my_ledger_venue_ids()', 'execute') then
    raise exception '20260926c 자가검사: 내부 함수가 열려 있습니다';
  end if;
  if has_function_privilege('anon', 'public.notify_venue_staff(uuid,text,text,text)', 'execute')
     or has_function_privilege('anon', 'public.find_user_by_phone(text)', 'execute')
     or has_function_privilege('anon', 'public.can_manage_venue_schedules(uuid)', 'execute')
     or has_function_privilege('anon', 'public.is_any_venue_manager()', 'execute') then
    raise exception '20260926c 자가검사: anon 실행 권한이 열려 있습니다';
  end if;
  if not has_function_privilege('authenticated', 'public.can_manage_pos(uuid)', 'execute')
     or not has_function_privilege('anon', 'public.can_manage_pos(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.notify_venue_staff(uuid,text,text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.find_user_by_phone(text)', 'execute') then
    raise exception '20260926c 자가검사: 필요한 실행 권한이 빠졌습니다';
  end if;
  -- 행동: 비로그인에서 모든 판정이 false(fail-open 없음)
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from public.venues v where coalesce(public.can_manage_pos(v.id), false)) then
    raise exception '20260926c 자가검사: 비로그인에서 can_manage_pos 가 참인 매장이 있습니다';
  end if;
  if exists (select 1 from public.venues v where coalesce(public._venue_owner_ok(v.id), false)) then
    raise exception '20260926c 자가검사: 비로그인에서 _venue_owner_ok 가 참인 매장이 있습니다';
  end if;
  -- 라이브 영향: 지금 운영 중인 매장(kind=venue)의 소유자 중 권한을 잃는 사람 수 — 0 이어야 한다(심사 중 업주만 잃는다)
  if exists (select 1 from public.venues v join public.profiles p on p.id = v.owner_id
              where v.kind = 'venue' and p.approved is not true and p.role::text <> 'admin'
                and exists (select 1 from public.clock_states c where c.venue_id = v.id)) then
    raise exception '20260926c 자가검사: 클락을 쓰고 있는 매장의 소유자가 미승인입니다 — 적용 전 확인';
  end if;
  -- 라이브 영향: 관리자가 아닌 그룹 소유자의 그룹에 매장 운영 데이터가 있으면 적용 전 멈춘다(그 데이터에 아무도 못 닿게 된다)
  if exists (select 1 from public.venues v join public.profiles p on p.id = v.owner_id
              where v.kind <> 'venue' and p.role::text <> 'admin'
                and ( exists (select 1 from public.ledger_sessions x where x.venue_id = v.id)
                   or exists (select 1 from public.ledger_buyin_requests x where x.venue_id = v.id)
                   or exists (select 1 from public.store_vouchers x where x.venue_id = v.id)
                   or exists (select 1 from public.clock_states x where x.venue_id = v.id)
                   or exists (select 1 from public.staff_schedule x where x.venue_id = v.id)
                   or exists (select 1 from public.staff_wage x where x.venue_id = v.id)
                   or exists (select 1 from public.dealer_shifts x where x.venue_id = v.id)
                   or exists (select 1 from public.venue_rankings x where x.venue_id = v.id))) then
    raise exception '20260926c 자가검사: 그룹 소유자의 그룹에 매장 운영 데이터가 있습니다 — 리드 확인 전 적용 금지';
  end if;
end $check$;

notify pgrst, 'reload schema';
