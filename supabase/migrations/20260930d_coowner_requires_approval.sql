-- ✅ 적용 완료(2026-09-30, nuri-lead · MCP execute_sql — 기록: 인수인계서 §3). 2026-10-01 라이브 재확인: _venue_coowner_ok 존재(13개 함수·정책 교체 — 적용 시 자가검사 SC 전부 통과, 6매장 업주 양성 확인). (원래 머리: '⏳ 미적용 초안' — 적용 뒤 표기만 누락됐었다)
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
--   ── 3차(critical 검토 PR #57 '조건부' → 리드 결정 2026-09-30, 원문 .claude/agent-memory-local/critical-reviewer/coowner_approval_review_2026-09-30.md)
--   respond_staff_invite      부여 절 v_ok 가 초대자 owner_id / vo 'approved' 를 직접 봤다 → 승인 철회 업주가 철회 전에 보낸 초대를
--                              수락하면 장부·이용권·일정 권한이 생겼다(critical 리허설 재현). → _venue_owner_ok(v,by) · _venue_coowner_ok(v,by).
--                              '업주·관리자는 수락 금지' 절은 그대로(좁히면 풀린다).
--   send_weekly_venue_reports  주간 매출·신규 손님 리포트를 승인 무관하게 v.owner_id 에게 → 루프에 _venue_owner_ok(id, owner_id).
--   _notify_buyin_request     ledger_access 분기에 _is_active_venue_staff 추가(정지·거절 직원의 남은 부여 행). profiles 전수 대신
--                              후보(owner_id ∪ venue_owners ∪ ledger_access)를 먼저 뽑아 정본으로 거른다. (알림 문구는 건수뿐 — 손님 이름 없음.)
--   is_verified_owner()       owner_posts read/insert 정책이 쓴다 — approved 를 안 봤다 → _venue_owner_ok(v.id, p.id) 추가(인증 매장 조건 그대로).
--   is_venue_or_group_owner(uuid) 새 공개 판정(정책용 — 정책은 호출자 권한으로 돌아 _ 내부 함수를 못 부른다).
--                              매장(kind='venue')이면 _venue_owner_ok, **그룹이면 종전대로 owner_id = auth.uid()** —
--                              GroupPage 공지(venue_notices)·댓글은 그룹 개설자 기능이라 그대로 둔다(20260926c 그룹 결정).
--   정책 venue_notices_insert · venue_notices_delete · comments_delete(매장 분기) → is_venue_or_group_owner(venue_id).
--        comments_delete 의 일정 작성자 분기(schedules.owner_id)는 그대로 — 업주 판정이 아니라 글쓴이 판정.
-- 바꾸지 않는 것(보고만):
--   정책 storage.objects posters_upload  (critical 재검증 FAIL → 리드 결정으로 제외) 좁히면 매장이 아직 없는 업주의 첫 매장 생성이 깨진다 —
--                              VenueManageTab.tsx 가 createMyVenue 전에 uploadPoster 를 부른다(승인·승인 대기 업주 ok→42501). 잔여 위험은
--                              철회 업주가 자기 폴더에 이미지를 올리는 정도(데이터 권한 아님)라 원래 정책을 유지한다.
--   can_manage_venue          이미 approved·role 을 본다.
--   venues_update 정책        20260926c 가 '심사 중 업주가 자기 신청 정보를 고치는 경로'로 의도적으로 남겼다(리드 결정 유지).
--   set_kill_password         비밀번호만 설정 — kill_venue 자체가 이제 승인을 본다. 무해.
--   댓글 is_owner 배지·notify_on_comment/notify_on_review  표시·알림 문구뿐, 권한·데이터 부여 없음. 무해.
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
      ('public._notify_buyin_request()',           'bdec792307162e3ea51d804498b05025'),
      ('public.respond_staff_invite(uuid,boolean)', '72f32325cbd3597ecce142004cbb6666'),
      ('public.send_weekly_venue_reports()',       '23c462b00584a429a4c8113fd55d27c5'),
      ('public.is_verified_owner()',               '39bf4620b035f7b86ec0bb5a86925e9b')) t(sig, want)
  loop
    if md5(pg_get_functiondef(r.sig::regprocedure)) <> r.want
       and pg_get_functiondef(r.sig::regprocedure) not like '%20260930d%' then
      raise exception '20260930d: % 라이브 본문이 예상(%)과 다릅니다(%). 본문을 다시 맞추세요',
        r.sig, r.want, md5(pg_get_functiondef(r.sig::regprocedure));
    end if;
  end loop;
end $pre$;

-- §0-b 정책 게이트 — md5(qual|with_check) 2026-09-30 라이브. 이미 적용된 정책(is_venue_or_group_owner·admin 단독 분기)이면 통과.
do $prepol$
declare r record; m text; body text;
begin
  for r in select * from (values
      ('public',  'comments',      'comments_delete',      '4d5396ed010f08ee88bd1a5cc98dbd42'),
      ('public',  'venue_notices', 'venue_notices_insert', '21a639e6d34481cca51b40555f98cf63'),
      ('public',  'venue_notices', 'venue_notices_delete', '0cd3d8819150c9d314582da1e4d17df1')) t(sch, tbl, pol, want)
  loop
    select md5(coalesce(qual,'')||'|'||coalesce(with_check,'')), coalesce(qual,'')||coalesce(with_check,'') into m, body
      from pg_policies where schemaname = r.sch and tablename = r.tbl and policyname = r.pol;
    if m is null then raise exception '20260930d: 정책 %.% 이 없습니다', r.tbl, r.pol; end if;
    if m <> r.want and body not like '%is_venue_or_group_owner(%' then
      raise exception '20260930d: 정책 %.% 라이브 본문이 예상(%)과 다릅니다(%)', r.tbl, r.pol, r.want, m;
    end if;
  end loop;
end $prepol$;

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

-- §10-d _notify_buyin_request — 후보를 먼저 뽑고 정본으로 거른다(업주·공동 운영자·활동 중 장부 직원)
create or replace function public._notify_buyin_request()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_cnt int; v_msg text; v_to uuid[];
begin
  -- 20260930d: 후보(owner_id ∪ venue_owners ∪ ledger_access) → 정본 판정. 장부 직원은 활동 중일 때만.
  select count(*) into v_cnt from ledger_buyin_requests where venue_id = NEW.venue_id and session_date = NEW.session_date and status = 'pending';
  v_msg := '🙋 손님 참가(바인) 요청 ' || v_cnt || '건 대기';
  select coalesce(array_agg(c.u), '{}'::uuid[]) into v_to
    from (
      select v.owner_id as u from public.venues v where v.id = NEW.venue_id
      union select vo.user_id from public.venue_owners vo where vo.venue_id = NEW.venue_id
      union select la.user_id from public.ledger_access la where la.venue_id = NEW.venue_id
    ) c
    join public.profiles pr on pr.id = c.u
   where coalesce(pr.mute_venue_notify, false) = false
     and ( public._venue_owner_ok(NEW.venue_id, c.u)
        or public._venue_coowner_ok(NEW.venue_id, c.u)
        or ( exists (select 1 from public.ledger_access la where la.venue_id = NEW.venue_id and la.user_id = c.u)
             and public._is_active_venue_staff(c.u, NEW.venue_id) ) );
  update notifications set message = v_msg, created_at = now()
   where link = '/my-store/ledger' and title = '🙋 손님 바인 요청' and read = false and created_at > now() - interval '30 minutes'
     and user_id = any(v_to);
  insert into notifications (user_id, type, title, message, link, read)
  select u, 'system', '🙋 손님 바인 요청', v_msg, '/my-store/ledger', false
    from unnest(v_to) as u
   where not exists (select 1 from notifications n where n.user_id = u and n.link = '/my-store/ledger' and n.title = '🙋 손님 바인 요청' and n.read = false and n.created_at > now() - interval '30 minutes');
  return NEW;
end; $function$;

-- §10-e is_venue_or_group_owner — 정책용 공개 판정(호출자 본인에 대해서만 참/거짓)
create or replace function public.is_venue_or_group_owner(p_venue_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20260930d: 매장은 승인된 업주만(_venue_owner_ok), 그룹은 종전대로 개설자(owner_id).
  select exists (
    select 1 from public.venues v
     where v.id = p_venue_id
       and v.owner_id = auth.uid()
       and (v.kind <> 'venue' or public._venue_owner_ok(v.id))
  );
$function$;

-- §10-f respond_staff_invite — 부여 절만 정본으로(나머지 본문은 라이브 그대로)
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
  if v_user is null or v_user is distinct from auth.uid() then
    raise exception '초대를 찾을 수 없습니다';
  end if;
  if p_accept then
    if public.my_role() is not distinct from 'admin'::user_role
       or exists (select 1 from public.venues v where v.owner_id = auth.uid())
       or exists (select 1 from public.venue_owners vo where vo.user_id = auth.uid() and vo.status = 'approved') then
      raise exception '업주·관리자 계정은 직원 초대를 수락할 수 없습니다 — 다른 계정으로 수락하거나 매장을 먼저 정리해 주세요' using errcode = '42501';
    end if;
    update public.profiles set role='venue_staff', venue_id=v_venue, approved=true where id=auth.uid();
    if v_title is not null and btrim(v_title) <> '' then
      update public.profiles set staff_title = left(btrim(v_title), 20) where id = auth.uid();
    end if;
    delete from public.ledger_access   where user_id = auth.uid() and venue_id is distinct from v_venue;
    delete from public.voucher_access  where user_id = auth.uid() and venue_id is distinct from v_venue;
    delete from public.schedule_access where user_id = auth.uid() and venue_id is distinct from v_venue;
    -- 20260930d: 초대자가 지금도 승인된 업주·공동 운영자일 때만 권한을 준다(철회 전에 보낸 초대로 부여되지 않게).
    select exists (select 1 from public.profiles p where p.id = v_by and p.role = 'admin')
        or public._venue_owner_ok(v_venue, v_by)
        or public._venue_coowner_ok(v_venue, v_by)
      into v_ok;
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

-- §10-g send_weekly_venue_reports — 수신자(업주)를 정본으로. 나머지 본문은 라이브 그대로
create or replace function public.send_weekly_venue_reports()
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v record;
  v_start date; v_end date;
  v_entries int; v_sales bigint; v_new int; v_total_players int;
  v_worst_day text; v_worst_cnt int; v_best_cnt int; v_days int;
  v_advice text;
  v_side_entries int; v_side_sales bigint; v_side_line text;
begin
  v_start := (date_trunc('week', ((now() at time zone 'Asia/Seoul')::date - 7)::timestamp))::date;
  v_end := v_start + 6;
  for v in select id, name, owner_id from public.venues where owner_id is not null and public._venue_owner_ok(id, owner_id) loop
    -- 20260930d: 승인 철회·승인 전 업주에게는 매출 리포트를 보내지 않는다(_venue_owner_ok).
    -- 매출 = 실수령(현금+카드+이체). 20260927a: 정산 화면(buyinFinance.paid)과 같은 서버 정본 _ledger_buyin_tiers[1].
    select count(*),
           coalesce(sum((public._ledger_buyin_tiers(b, s.buyin_amount, s.discounts))[1]), 0)
      into v_entries, v_sales
      from public.ledger_buyins b
      join public.ledger_sessions s on s.venue_id = b.venue_id and s.session_date = b.session_date and s.game_seq = b.game_seq
     where b.venue_id = v.id and b.session_date between v_start and v_end;
    if v_entries = 0 then continue; end if;

    select count(*),
           coalesce(sum((public._ledger_buyin_tiers(b, s.buyin_amount, s.discounts))[1]), 0)
      into v_side_entries, v_side_sales
      from public.ledger_buyins b
      join public.ledger_sessions s on s.venue_id = b.venue_id and s.session_date = b.session_date and s.game_seq = b.game_seq
     where b.venue_id = v.id and b.session_date between v_start and v_end and b.game_seq > 1;
    if v_side_entries > 0 then
      v_side_line := format(E'\n🎲 사이드 %s회 · 매출 %s만원', v_side_entries, (v_side_sales / 10000)::bigint);
    else
      v_side_line := '';
    end if;

    select count(distinct lp.name) into v_new
      from public.ledger_players lp
     where lp.venue_id = v.id and lp.session_date between v_start and v_end
       and not exists (
         select 1 from public.ledger_players p2
          where p2.venue_id = v.id and p2.name = lp.name and p2.session_date < v_start);
    select count(distinct lp.name) into v_total_players
      from public.ledger_players lp
     where lp.venue_id = v.id and lp.session_date between v_start and v_end;

    select day_label, cnt, max_cnt, n_days into v_worst_day, v_worst_cnt, v_best_cnt, v_days
      from (
        select g.day_label, g.cnt,
               max(g.cnt) over () as max_cnt,
               count(*) over () as n_days
          from (
            select case extract(dow from b.session_date)
                     when 0 then '일' when 1 then '월' when 2 then '화' when 3 then '수'
                     when 4 then '목' when 5 then '금' else '토' end as day_label,
                   count(*) as cnt
              from public.ledger_buyins b
             where b.venue_id = v.id and b.session_date between v_start and v_end
             group by extract(dow from b.session_date)
          ) g
        order by g.cnt asc limit 1
      ) t;

    if v_days >= 2 and v_worst_cnt * 2 < v_best_cnt then
      v_advice := format('%s요일이 약했어요(%s건) — %s요일 프리롤·이벤트로 끌어올려 보세요.', v_worst_day, v_worst_cnt, v_worst_day);
    elsif v_total_players > 0 and v_new * 100 >= v_total_players * 30 then
      v_advice := format('신규 손님이 %s명이나 왔어요 — 첫 방문 쿠폰으로 단골 전환을 노려보세요.', v_new);
    else
      v_advice := '이번 주도 꾸준했어요 — 단골 재방문 이벤트로 한 번 더 끌어올려 보세요.';
    end if;

    insert into public.notifications(user_id, type, title, message, avatar_text, avatar_color, link)
    values (v.owner_id, 'system',
      '📊 ' || v.name || ' 주간 리포트',
      format('지난주(%s~%s) 바이인 %s회 · 매출 %s만원 · 신규 손님 %s명%s' || E'\n' || '💡 %s',
             to_char(v_start, 'MM/DD'), to_char(v_end, 'MM/DD'), v_entries, (v_sales / 10000)::bigint, v_new, v_side_line, v_advice),
      '📊', '#FFD100', '?tab=my-store');
  end loop;
end;
$function$;

-- §10-h is_verified_owner — 승인 업주만(인증 매장 조건 그대로)
create or replace function public.is_verified_owner()
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20260930d: owner_posts read/insert 정책의 업주 판정 — 프로필 승인(_venue_owner_ok)을 함께 본다.
  select exists (
    select 1
    from public.profiles p
    join public.venues v on v.owner_id = p.id
    where p.id = auth.uid()
      and p.role = 'venue_owner'
      and coalesce(p.status, 'active') = 'active'
      and v.verification_status = 'verified'
      and public._venue_owner_ok(v.id, p.id)
  );
$function$;

-- §10-i 정책 — 업주 분기를 정본으로
alter policy venue_notices_insert on public.venue_notices
  with check ((author_id = (select auth.uid())) and ((my_role() = 'admin'::user_role) or public.is_venue_or_group_owner(venue_id)));
alter policy venue_notices_delete on public.venue_notices
  using ((my_role() = 'admin'::user_role) or (author_id = (select auth.uid())) or public.is_venue_or_group_owner(venue_id));
alter policy comments_delete on public.comments
  using ((user_id = (select auth.uid())) or (my_role() = 'admin'::user_role)
         or ((venue_id is not null) and public.is_venue_or_group_owner(venue_id))
         or ((schedule_id is not null) and (exists (select 1 from public.schedules s
                                                    where s.id = comments.schedule_id and s.owner_id = (select auth.uid())))));

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

-- 정책(roles {public})이 부르므로 anon 도 실행 가능해야 한다(anon 은 auth.uid() NULL → 거짓). can_manage_pos 와 같은 이유.
revoke all on function public.is_venue_or_group_owner(uuid) from public, anon, authenticated;
grant execute on function public.is_venue_or_group_owner(uuid) to public, authenticated, service_role;

revoke all on function public.respond_staff_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_staff_invite(uuid, boolean) to authenticated, service_role;

revoke all on function public.send_weekly_venue_reports() from public, anon, authenticated;
grant execute on function public.send_weekly_venue_reports() to service_role;

-- is_verified_owner 는 라이브 ACL 이 PUBLIC·anon·authenticated 실행(정책이 부른다) — 그대로 재기재.
revoke all on function public.is_verified_owner() from public, anon, authenticated;
grant execute on function public.is_verified_owner() to public, anon, authenticated, service_role;

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
  -- 3차 대상
  d := pg_get_functiondef('public.respond_staff_invite(uuid,boolean)'::regprocedure);
  if d not like '%_venue_owner_ok(v_venue, v_by)%' or d not like '%_venue_coowner_ok(v_venue, v_by)%'
     or d ~ 'v\.owner_id\s*=\s*v_by' or d ~ 'vo\.user_id\s*=\s*v_by' or d not like '%업주·관리자 계정은 직원 초대를 수락할 수 없습니다%' then
    raise exception '20260930d 자가검사: respond_staff_invite 부여 절이 정본이 아니거나 수락 금지 절이 빠졌습니다';
  end if;
  if pg_get_functiondef('public.send_weekly_venue_reports()'::regprocedure) not like '%_venue_owner_ok(id, owner_id)%' then
    raise exception '20260930d 자가검사: send_weekly_venue_reports 수신자가 정본이 아닙니다';
  end if;
  if pg_get_functiondef('public._notify_buyin_request()'::regprocedure) not like '%_is_active_venue_staff(c.u, NEW.venue_id)%'
     or pg_get_functiondef('public._notify_buyin_request()'::regprocedure) ~ 'from profiles pr where' then
    raise exception '20260930d 자가검사: _notify_buyin_request 가 직원 활동 검사·후보 방식이 아닙니다';
  end if;
  if pg_get_functiondef('public.is_verified_owner()'::regprocedure) not like '%_venue_owner_ok(v.id, p.id)%'
     or pg_get_functiondef('public.is_verified_owner()'::regprocedure) not like '%verification_status = ''verified''%' then
    raise exception '20260930d 자가검사: is_verified_owner 가 승인·인증을 함께 보지 않습니다';
  end if;
  if pg_get_functiondef('public.is_venue_or_group_owner(uuid)'::regprocedure) not like '%v.kind <> ''venue'' or public._venue_owner_ok(v.id)%' then
    raise exception '20260930d 자가검사: is_venue_or_group_owner 조건이 어긋났습니다';
  end if;
  for r in select schemaname sch, tablename tbl, policyname pol, coalesce(qual,'')||'|'||coalesce(with_check,'') body from pg_policies
            where (schemaname, tablename, policyname) in (('public','comments','comments_delete'),('public','venue_notices','venue_notices_insert'),
                                                          ('public','venue_notices','venue_notices_delete'))
  loop
    if r.body not like '%is_venue_or_group_owner(%' or r.body ~ 'v\.owner_id = \( SELECT auth\.uid' then
      raise exception '20260930d 자가검사: 정책 %.% 업주 분기가 정본이 아닙니다', r.tbl, r.pol;
    end if;
  end loop;
  -- search_path 고정
  for r in select p.oid::regprocedure::text sig, p.proconfig from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname in ('_venue_coowner_ok','can_manage_pos','can_manage_venue_staff','can_manage_venue_schedules',
                                'is_any_venue_manager','_my_ledger_venue_ids','_ledger_can_operate','my_member_venues',
                                'find_user_by_phone','transfer_venue_primary','_venue_owner_ok','kill_venue',
                                '_venue_notify_recipients','_notify_buyin_request','is_venue_or_group_owner',
                                'respond_staff_invite','send_weekly_venue_reports','is_verified_owner')
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
     or has_function_privilege('authenticated', 'public._notify_buyin_request()', 'execute')
     or has_function_privilege('authenticated', 'public.send_weekly_venue_reports()', 'execute')
     or has_function_privilege('anon', 'public.send_weekly_venue_reports()', 'execute') then
    raise exception '20260930d 자가검사: 내부 함수가 열려 있습니다';
  end if;
  if has_function_privilege('anon', 'public.transfer_venue_primary(uuid,uuid)', 'execute')
     or has_function_privilege('anon', 'public.my_member_venues()', 'execute')
     or has_function_privilege('anon', 'public.kill_venue(uuid,text,text)', 'execute')
     or has_function_privilege('anon', 'public.respond_staff_invite(uuid,boolean)', 'execute')
     or has_function_privilege('anon', 'public.find_user_by_phone(text)', 'execute')
     or has_function_privilege('anon', 'public.is_any_venue_manager()', 'execute')
     or has_function_privilege('anon', 'public.can_manage_venue_schedules(uuid)', 'execute') then
    raise exception '20260930d 자가검사: anon 실행 권한이 열려 있습니다';
  end if;
  if not has_function_privilege('authenticated', 'public.can_manage_pos(uuid)', 'execute')
     or not has_function_privilege('anon', 'public.can_manage_pos(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.transfer_venue_primary(uuid,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.my_member_venues()', 'execute')
     or not has_function_privilege('authenticated', 'public.kill_venue(uuid,text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.respond_staff_invite(uuid,boolean)', 'execute')
     or not has_function_privilege('anon', 'public.is_venue_or_group_owner(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.is_venue_or_group_owner(uuid)', 'execute')
     or not has_function_privilege('anon', 'public.is_verified_owner()', 'execute')
     or not has_function_privilege('authenticated', 'public.is_verified_owner()', 'execute') then
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
  -- 라이브 영향(kind 무관): 소유자가 _venue_owner_ok 를 못 넘는 행 = 알림 수신·주간 리포트에서 빠지는 소유자.
  --   수용된 차이는 '관리자 소유 그룹'뿐이다(그룹은 매장 운영 대상이 아니다 — 20260926c. 2026-09-30 라이브 1곳: dealer_team 로켓단).
  --   그 밖의 행(매장 소유자 미승인·일반 회원 소유 그룹)이 하나라도 있으면 멈춘다.
  if exists (select 1 from public.venues v join public.profiles p on p.id = v.owner_id
              where not public._venue_owner_ok(v.id, v.owner_id)
                and not (v.kind <> 'venue' and p.role::text = 'admin')) then
    raise exception '20260930d 자가검사: 알림·리포트 수신에서 빠지는 소유자가 수용 범위(관리자 소유 그룹) 밖에 있습니다 — 리드 확인 전 적용 금지';
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
--     양성 P1 로티 업주·P2 E2E 업주·P5 공동 운영자: 수신자 1 · 바인 요청 알림 1 · 판정 true. P3·P4 관리자: 시험한 매장(E2E·로티)에서 수신자 0(소유자·공동 운영자 아님).
--       ⚠ 정정(critical 검토): '관리자 수신자 종전과 같음' 은 틀렸다 — 관리자 소유 **그룹**(dealer_team 9cf562bd)의 수신자에서 관리자 c8e3 가 빠진다.
--         라이브 영향 0(그룹 운영 알림 없음), 수용(그룹은 매장 운영 대상이 아니다, 20260926c). §12 영향 검사가 이 차이를 kind 무관하게 잡는다.
--     K 승인 복구 뒤 같은 대표의 kill_venue(실명·비밀번호) → 1, 매장 행 0·장부 0 — 기존 경로 그대로 동작.
--     T1·T2 거절, 비로그인 can_manage_pos 참 0.
--   롤백 확인: 새 함수 0 · 로티 매장 1·장부 1 · 킬스위치 0 · vo 1 · 시험 바인 요청 0 · kill_venue·_venue_owner_ok md5 원래 값.
-- ⚠ 3차 리허설 이후 posters_upload 변경을 뺐다(critical 재검증 FAIL: 첫 매장 생성 업로드 42501). 아래 3차의 '포스터 업로드' 줄은 뺀 변경의 결과다.
-- 리허설 3차(18개 함수·정책 4개 판 = 이 파일 전문, 2026-09-30, store-team, 라이브 begin…raise…rollback). §0·§0-b 게이트·§12 자가검사 통과.
--   전수 대조 554칸(프로필 8+비로그인 × 매장 7 × 판정 8 + 사람별 4 + 매장별 수신자 2) 적용 전/후 차이 2칸뿐:
--     dealer_team 9cf562bd 수신자(rcpt·rcptS)에서 관리자 c8e3 빠짐 — 수용된 차이(위 정정 참고). 나머지 552칸 동일.
--   적용 전 → 후 (승인 철회 대표 7e43 = N, 같은 사람 승인 상태 = P):
--     P 공지·업주 글·포스터 업로드 ok/ok/ok · 댓글 삭제 1 → 적용 후도 동일(양성 유지).
--     N 공지 ok→42501 · 업주 글 ok→42501 · 포스터 업로드 ok→42501 · 매장 댓글 삭제 1→0.
--     N 철회 대표가 철회 전에 보낸 초대 수락: la 1·va 1·장부 true → la 0·va 0·장부 false(수락 자체는 됨 — 직원 등록만).
--     P 정상 업주(1a8c) 초대 수락: la 1·va 1·장부 true → 동일(양성).
--     그룹 개설자(일반 회원으로 바꾼 로켓단) 공지: ok → ok(그룹 기능 유지).
--     지난주 바인 1건을 심은 뒤 주간 리포트: 철회 대표에게 1 → 0.
--   prosrc 대조: respond_staff_invite·send_weekly_venue_reports·is_verified_owner 는 20260930d 주석 줄과 바꾼 조각만 되돌리면
--     라이브 원본 md5(prosrc)와 일치(true·true·true) — 옮겨 적다 흘린 곳 없음.
--   롤백 확인: 새 함수 0 · posters_upload·comments_delete 정책 md5 원래 값 · 시험 댓글·초대·바인 0 · 그룹 소유자 원복 · 7e43 approved true.
--   미검증: owner_posts 읽기(최근 24시간 글 0건이라 전후 모두 0 — 구분 안 됨).
