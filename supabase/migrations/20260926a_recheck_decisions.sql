-- ✅ 적용 완료 2026-09-26 (nuri-lead, MCP execute_sql) — 클라 배포(80e50284, live index-pjvDv4Ce.js) 확인 뒤 적용. 자가검사 통과.
--    ⚠ 초안과 다른 점: 20260926c 가 먼저 적용돼 find_user_by_phone 정본 md5 가 980b57fa 로 바뀌었다 → §0 게이트 값 교체,
--      D6 본문은 20260926c 본문(승인된 매장 업주 조건 _venue_owner_ok)을 유지하고 phone_hash 저장만 뺐다(초안 본문을 쓰면 c 가 되돌아간다).
--    적용 후 양성: 업주 get_my_venue_staff 호출 성공(직원 0명 매장 → 0행), bump_schedule_view 2회 → view_count +1(1인 1회).
-- 20260926a — 서버 전수 재점검(full_recheck_server_2026-09-26)의 남은 저위험 6종 중 오너가 고른 5종.
--   D1 is_email_available   : 로그인 없이 확인 못 하게 — anon·PUBLIC 실행 회수. 호출부는 가입 전 화면 1곳(src/api/auth.ts:172 ←
--                             AuthModal.tsx:896 useEmailCheck)뿐이고 로그인 상태 호출은 0 → authenticated 도 회수(service_role 만 남긴다).
--   D2 트리거 함수 3개      : block_ugc_trigger·guard_schedule_boost·update_qna_count 의 anon·authenticated·PUBLIC 실행 회수.
--                             트리거는 발화 시 EXECUTE 를 검사하지 않는다(라이브 _ledger_sessions_client_insert_guard 가 {postgres,service_role}
--                             ACL 로 authenticated INSERT 에 이미 발화 중) → 회귀 0. 리허설 D2-4 가 authenticated INSERT 발화를 양성 대조한다.
--   D3 bump_schedule_view   : 일정×사람 평생 1회. schedule_views(schedule_id,user_id) 원장 + on conflict do nothing 뒤 새 행일 때만 +1.
--                             **비로그인(auth.uid() null)은 세지 않는다**(식별 불가 — 오너 결정). 호출부 src/App.tsx:1345 는 로그인 여부와
--                             무관하게 부르므로 anon 실행을 회수하면 비로그인 열람은 permission denied 를 받고 `.catch(() => {})` 로 삼켜진다
--                             (화면 영향 0). 원장 RLS 전면 잠금(정책 0 · anon/authenticated 권한 0).
--   D4 venue_today_games    : 현행 유지(손대지 않음). §0 게이트에만 md5 를 둔다.
--   D5 _ledger_can_operate  : authenticated 실행 회수(오라클 차단). 유일 호출부 트리거 _ledger_sessions_client_insert_guard 를
--                             SECURITY DEFINER 로 바꾼다. ⚠ definer 안에서는 current_user 가 소유자(postgres)로 바뀌어 기존
--                             `current_user not in ('authenticated','anon')` 판정이 항상 참 → 가드가 전부 열린다(fail-open).
--                             2026-09-26 라이브 프로브 실측(definer 함수 안, set local role 뒤):
--                               authenticated: cu=postgres roleguc=authenticated authrole=authenticated
--                               anon:          cu=postgres roleguc=anon          authrole=anon
--                               service_role:  cu=postgres roleguc=service_role  authrole=service_role
--                               postgres 직접: cu=postgres roleguc=none          authrole=<null>
--                             → 클라 판정을 `current_setting('role', true)`(PostgREST 가 SET ROLE 한 값) **또는** `auth.role()`(JWT claim)
--                               로 바꾼다. 둘 중 하나라도 클라면 가드 적용(fail-closed 방향).
--   D6 phone_lookup_audit.phone_hash : md5(숫자) 는 10^10 공간이라 역산 가능. 서버 비밀(phone 전용 HMAC 키)이 없으므로
--                             **저장하지 않는다**(null). find_user_by_phone 본문은 20260925h 정의 그대로, 해시 줄만 뺀다.
--                             기존 행 phone_hash → null(라이브 2026-09-26 실측 0행). vault 에 phone_hmac_key 를 만들면 그때 HMAC 으로 바꾼다.
--   A  get_my_venue_staff    : 반환에 is_active boolean(= _is_active_venue_staff(직원, 매장)) 추가 — 미승인·정지·차단 직원의 권한 토글을
--                             화면이 숨길 수 있게. 반환 타입 변경 → DROP + 재생성 + ACL 재부여({postgres,authenticated,service_role} 그대로).
--                             본문은 라이브 md5 70599b57 그대로, 칸만 더한다. DB 안 호출부 0. 클라 호출부: src/api/auth.ts:313(getMyVenueStaff,
--                             StaffRow 매퍼 :298) ← VenueManageTab.tsx:2345(구성원 목록, 토글 렌더 :2684 · grant 핸들러 :2409) ·
--                             NuriPosLedger.tsx:208 · StaffPayroll.tsx:41 · StaffSchedule.tsx:58 (뒤 셋은 칸을 무시해도 동작 불변).
--   B  포스터 재심사 알림     : 승인된 포스터의 핵심 항목(제목·바이인·프라이즈·GTD·날짜·시작시간) 수정 → prevent_self_approve_poster 가
--                             approved true→false 로 되돌린다. 지금 _notify_admin_pending_poster 는 AFTER INSERT 전용이라 관리자가 모른다.
--                             → 같은 함수에 tg_op 분기(UPDATE 면 제목 '📢 포스터 재심사 대기' · 문구에 '수정 후 재심사')를 넣고
--                               AFTER UPDATE 트리거를 WHEN (old.approved and not new.approved and new.rejected_at is null) 로 건다
--                               (`OF approved` 금지 — 아래 B 절 주석).
--                             연속 수정 1건: 두 번째 수정은 old.approved 가 이미 false 라 전이가 없다 → 구조적으로 1건(시간창 코드 불필요).
--                             관리자 반려(approved=false + rejected_at, src/api/schedules.ts:303)는 WHEN 의 rejected_at is null 로 제외.
--                             링크는 '/admin' 그대로 — App.tsx:3081 이 `link === '/admin'` 등식으로 관리자 탭을 연다(뒤에 무엇을 붙이면 깨진다).
--
-- ── 적용 전 라이브 정본(2026-09-26 실측 md5 = md5(pg_get_functiondef)) — §0 게이트가 다르면 멈춘다. 다시 읽어라 ──
--   is_email_available(text)                     ce20e6e76bcebd1a25a8a3eab91b0918  acl {postgres,authenticated,service_role,anon}
--   bump_schedule_view(uuid)                     113a7900fe33c4fd1f422300d4aa7c09  acl {postgres,anon,authenticated,service_role}  (sql, secdef)
--   _ledger_can_operate(uuid,uuid)               4d2f4525db3a1daaa152edfaa68b8ea6  acl {postgres,authenticated,service_role}
--   _ledger_sessions_client_insert_guard()       f13a64be100254c94c768c53b884ff8d  acl {postgres,service_role} · secdef=false
--   block_ugc_trigger()                          80e3f3853fff8a52f357e45b2123dba9  acl {PUBLIC,postgres,anon,authenticated,service_role}
--   guard_schedule_boost()                       b2884e02175b6a8d6c768e03712f4e00  acl {PUBLIC,postgres,anon,authenticated,service_role}
--   update_qna_count()                           417f6944b78c89981c371da7680f9120  acl {PUBLIC,postgres,anon,authenticated,service_role}
--   find_user_by_phone(text)                     3ca45305c4a9dafab26920dbabf94aaa  acl {postgres,authenticated,service_role}  (20260925h 적용본)
--   venue_today_games(uuid)                      afa7e21bf196696917e6f7e5f924152f  (D4 · 손대지 않음)
--   get_my_venue_staff(uuid)                     70599b577ef63ec73d1f8a3f0bf3513b  acl {postgres,authenticated,service_role}  (A · DROP 대상)
--   _notify_admin_pending_poster()               8d21694302160efa0222fa7cf9c1d971  acl {postgres,service_role} · AFTER INSERT WHEN (new.approved=false)
--   schedule_views: 없음(신규). phone_lookup_audit: 0행. PostgreSQL 17.6.
--   전이 폐쇄(라이브 pg_get_functiondef ilike): _ledger_can_operate 호출부 = _ledger_sessions_client_insert_guard 1개, 정책 0.
--     is_email_available·bump_schedule_view 를 부르는 DB 함수·정책 0. 클라 호출부(worktree 9b840c5a): auth.ts:172 · schedules.ts:164(App.tsx:1345) ·
--     ledger.ts:1278(venue_today_games, 유지) · vouchers.ts:373(find_user_by_phone, 시그니처 불변).
-- 롤백: 각 절 끝의 주석 참조(정의는 위 md5 의 라이브 본문으로 되돌린다).

-- ═══ 0. 정본 게이트 ═══════════════════════════════════════════════════════════
do $$
declare bad text;
begin
  select string_agg(p.proname || '=' || md5(pg_get_functiondef(p.oid)), ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('is_email_available','bump_schedule_view','_ledger_can_operate','_ledger_sessions_client_insert_guard',
                       'block_ugc_trigger','guard_schedule_boost','update_qna_count','find_user_by_phone','venue_today_games',
                       'get_my_venue_staff','_notify_admin_pending_poster')
     and (p.proname, md5(pg_get_functiondef(p.oid))) not in (
       ('get_my_venue_staff','70599b577ef63ec73d1f8a3f0bf3513b'),
       ('_notify_admin_pending_poster','8d21694302160efa0222fa7cf9c1d971'),
       ('is_email_available','ce20e6e76bcebd1a25a8a3eab91b0918'),
       ('bump_schedule_view','113a7900fe33c4fd1f422300d4aa7c09'),
       ('_ledger_can_operate','4d2f4525db3a1daaa152edfaa68b8ea6'),
       ('_ledger_sessions_client_insert_guard','f13a64be100254c94c768c53b884ff8d'),
       ('block_ugc_trigger','80e3f3853fff8a52f357e45b2123dba9'),
       ('guard_schedule_boost','b2884e02175b6a8d6c768e03712f4e00'),
       ('update_qna_count','417f6944b78c89981c371da7680f9120'),
       ('find_user_by_phone','980b57fa4f6d570c66d7c05e934c9a68'),
       ('venue_today_games','afa7e21bf196696917e6f7e5f924152f'));
  if bad is not null then
    raise exception '20260926a 중단 — 라이브 정본이 헤더 md5 와 다르다: %', bad;
  end if;
  if to_regclass('public.schedule_views') is not null then
    raise exception '20260926a 중단 — public.schedule_views 가 이미 있다. 이 파일이 적용된 적 있는지 확인해라';
  end if;
end $$;

-- ═══ D1. is_email_available — 로그인 없이(그리고 로그인해도) 못 부른다 ═════════
-- 호출부 전수(worktree 9b840c5a): src/api/auth.ts:172 checkEmailAvailable ← AuthModal.tsx:896 useEmailCheck(가입 전 화면, anon).
-- 로그인 상태 호출 0 → authenticated 도 회수. 화면은 다른 편집자가 "가입 시도 결과로 안내" 로 바꾼다.
revoke all on function public.is_email_available(text) from public, anon, authenticated;
grant execute on function public.is_email_available(text) to service_role;
-- 롤백: grant execute on function public.is_email_available(text) to anon, authenticated;

-- ═══ D2. 트리거 함수 3개 — 직접 실행권 회수(표준 3항) ═══════════════════════
revoke all on function public.block_ugc_trigger()    from public, anon, authenticated;
revoke all on function public.guard_schedule_boost() from public, anon, authenticated;
revoke all on function public.update_qna_count()     from public, anon, authenticated;
grant execute on function public.block_ugc_trigger()    to service_role;
grant execute on function public.guard_schedule_boost() to service_role;
grant execute on function public.update_qna_count()     to service_role;
-- 롤백: grant execute on function public.<각>() to public, anon, authenticated;

-- ═══ D3. 포스터 조회수 — 일정×사람 평생 1회, 비로그인 미집계 ══════════════════
-- 원장. user_id 에 FK 를 두지 않는다(탈퇴는 가명화라 행이 남고, 계정 삭제를 원장이 막아서는 안 된다).
create table if not exists public.schedule_views (
  schedule_id uuid        not null references public.schedules(id) on delete cascade,
  user_id     uuid        not null,
  viewed_at   timestamptz not null default now(),
  primary key (schedule_id, user_id)
);
alter table public.schedule_views enable row level security;
revoke all on table public.schedule_views from public, anon, authenticated;
comment on table public.schedule_views is '포스터 조회 원장(일정×사람 평생 1회). 정책 0 = 클라 직접 접근 불가, bump_schedule_view(definer)만 쓴다. 20260926a';

create or replace function public.bump_schedule_view(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;                                   -- 비로그인: 식별 불가 → 세지 않는다(오너 결정)
  if not exists (select 1 from public.schedules s where s.id = p_id and s.approved = true) then return; end if;
  insert into public.schedule_views(schedule_id, user_id) values (p_id, v_uid)
  on conflict do nothing;
  if found then
    update public.schedules set view_count = view_count + 1 where id = p_id and approved = true;
  end if;
end $$;
revoke all on function public.bump_schedule_view(uuid) from public, anon;
grant execute on function public.bump_schedule_view(uuid) to authenticated, service_role;
-- 롤백: 라이브 md5 113a7900 본문(sql: update … set view_count = view_count + 1 where id = p_id and approved = true) 로 되돌리고
--       grant execute … to anon; drop table public.schedule_views;

-- ═══ D5. _ledger_can_operate 오라클 차단 + 트리거 definer 전환 ════════════════
create or replace function public._ledger_sessions_client_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_kst date := (now() at time zone 'Asia/Seoul')::date;
begin
  -- ⚠ SECURITY DEFINER 안에서는 current_user 가 소유자(postgres)다. 클라 판정은 PostgREST 가 SET ROLE 한 값(`role` GUC)
  --   또는 JWT claim(auth.role()) 으로 한다 — 둘 중 하나라도 클라면 가드 적용(2026-09-26 라이브 프로브 실측, 파일 머리 참조).
  if not (   coalesce(current_setting('role', true), '') in ('authenticated', 'anon')
          or coalesce(auth.role(), '')                    in ('authenticated', 'anon') ) then
    return new;
  end if;
  if exists (select 1 from public.ledger_sessions s
              where s.venue_id = new.venue_id and s.session_date = new.session_date and s.game_seq = new.game_seq) then
    return new;
  end if;
  new.closed := false; new.closed_at := null; new.close_memo := null;
  new.reg_closed := false; new.reg_closed_at := null;
  if new.opened_by is not null and new.opened_by is distinct from auth.uid()
     and not coalesce(public._ledger_can_operate(new.opened_by, new.venue_id), false) then
    raise exception '담당자는 이 매장의 장부 권한자만 지정할 수 있습니다' using errcode = '42501', hint = 'LEDGER_OPERATOR_INVALID';
  end if;
  if not coalesce(public.can_manage_pos(new.venue_id), false)
     and new.session_date <> v_kst and new.session_date <> public.ledger_business_date(new.venue_id) then
    raise exception '직원은 오늘(또는 진행 중인 영업일) 장부만 새로 열 수 있습니다 — 지난 날짜 장부는 업주에게 요청해 주세요'
      using errcode = '42501', hint = 'LEDGER_DATE_NOT_ALLOWED';
  end if;
  return new;
end $$;
revoke all on function public._ledger_sessions_client_insert_guard() from public, anon, authenticated;
grant execute on function public._ledger_sessions_client_insert_guard() to service_role;

revoke all on function public._ledger_can_operate(uuid, uuid) from public, anon, authenticated;
grant execute on function public._ledger_can_operate(uuid, uuid) to service_role;
-- 롤백: 트리거를 md5 f13a64be 본문(invoker, current_user 판정)으로 되돌린 뒤 grant execute on function public._ledger_can_operate(uuid,uuid) to authenticated;

-- ═══ D6. phone_lookup_audit.phone_hash — 저장하지 않는다 ═══════════════════════
-- 20260925h 정의(md5 3ca45305) 그대로, insert 의 phone_hash 만 뺀다(컬럼 nullable → null).
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
  insert into public.phone_lookup_audit(caller, venue_id, phone_last4, result_count)
  values (auth.uid(), v_venue, right(v_digits, 4), v_n);
  return;
end $function$;
revoke all on function public.find_user_by_phone(text) from public, anon;
grant execute on function public.find_user_by_phone(text) to authenticated, service_role;
update public.phone_lookup_audit set phone_hash = null where phone_hash is not null;
comment on column public.phone_lookup_audit.phone_hash is '20260926a 부터 항상 null(역산 가능한 md5 폐기). HMAC 키(vault phone_hmac_key)를 만들면 hmac(digits, key, sha256) 으로 재개.';
-- 롤백: 20260925h 본문(values … md5(v_digits) …)으로 create or replace.

-- ═══ A. get_my_venue_staff — is_active 칸 추가(반환 타입 변경 → DROP + 재생성 + ACL 재부여) ═══
drop function if exists public.get_my_venue_staff(uuid);
create function public.get_my_venue_staff(p_venue_id uuid default null::uuid)
returns table(id uuid, name text, nickname text, email text, avatar_color text, staff_title text, is_active boolean)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  with v as (select coalesce(p_venue_id, (select v.id from public.venues v where v.owner_id = auth.uid() order by v.id limit 1)) as id)
  select s.id, s.name, s.nickname, s.email, s.avatar_color, s.staff_title,
         public._is_active_venue_staff(s.id, v.id) as is_active   -- 승인·정지·차단·탈퇴를 한 판정으로(장부 게이트와 같은 함수)
  from public.profiles s, v
  where s.role = 'venue_staff'
    and s.venue_id = v.id
    and public.can_manage_pos(v.id)
  order by s.approved asc, s.joined_at desc;
$$;
revoke all on function public.get_my_venue_staff(uuid) from public, anon;
grant execute on function public.get_my_venue_staff(uuid) to authenticated, service_role;
-- 롤백: drop 후 md5 70599b57 본문(6칸)으로 재생성 + 같은 GRANT.

-- ═══ B. 승인 포스터가 수정으로 재심사 대기로 돌아가면 관리자 알림 ═══════════════
create or replace function public._notify_admin_pending_poster()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_venue text;
begin
  select name into v_venue from public.venues where id = new.venue_id;
  insert into public.notifications (user_id, type, title, message, link)
  select p.id, 'system',
         case when tg_op = 'UPDATE' then '📢 포스터 재심사 대기' else '📢 포스터 승인 대기' end,
         coalesce(new.title,'(제목 없음)') || ' · ' || coalesce(v_venue,'-')
           || case when tg_op = 'UPDATE' then ' — 수정 후 재심사 대기입니다. 승인하면 다시 일정탐색에 노출됩니다'
                                          else ' — 승인하면 일정탐색에 노출됩니다' end,
         '/admin'   -- App.tsx:3081 이 등식으로 관리자 탭을 연다. 뒤에 아무것도 붙이지 마라
  from public.profiles p where p.role = 'admin';
  return new;
end $$;
revoke all on function public._notify_admin_pending_poster() from public, anon, authenticated;
grant execute on function public._notify_admin_pending_poster() to service_role;

-- 전이(true→false)에서만 발화 → 같은 포스터 연속 수정은 두 번째부터 old.approved=false 라 구조적으로 1건.
-- 관리자 반려(approved=false + rejected_at)는 rejected_at is null 로 제외(prevent_self_approve_poster 가 업주 수정에서는 rejected_at 을 null 로 둔다).
-- ⚠ `after update OF approved` 로 쓰면 안 된다 — 업주의 UPDATE 문은 title/updated_at 만 SET 하고 approved 는 BEFORE 트리거가 바꾼다.
--   `UPDATE OF 열` 은 문장의 SET 목록으로 판정하므로 그 경우 발화하지 않는다(2026-09-26 리허설 1차 B-2 FAIL 로 실측). WHEN 은 실제 값으로 판정한다.
drop trigger if exists trg_notify_admin_rereview_poster on public.schedules;
create trigger trg_notify_admin_rereview_poster
  after update on public.schedules
  for each row
  when (old.approved = true and new.approved = false and new.rejected_at is null)
  execute function public._notify_admin_pending_poster();
-- 롤백: drop trigger trg_notify_admin_rereview_poster on public.schedules; 함수는 md5 8d216943 본문으로 create or replace.

-- ═══ 자가검사 ═══════════════════════════════════════════════════════════════
do $$
declare bad text[] := '{}';
begin
  -- D1
  if has_function_privilege('anon', 'public.is_email_available(text)', 'execute') then bad := bad || 'D1 anon still executes is_email_available'; end if;
  if has_function_privilege('authenticated', 'public.is_email_available(text)', 'execute') then bad := bad || 'D1 authenticated still executes is_email_available'; end if;
  if not has_function_privilege('service_role', 'public.is_email_available(text)', 'execute') then bad := bad || 'D1 service_role lost is_email_available'; end if;
  -- D2
  if has_function_privilege('anon', 'public.block_ugc_trigger()', 'execute') or has_function_privilege('authenticated', 'public.block_ugc_trigger()', 'execute') then bad := bad || 'D2 block_ugc_trigger open'; end if;
  if has_function_privilege('anon', 'public.guard_schedule_boost()', 'execute') or has_function_privilege('authenticated', 'public.guard_schedule_boost()', 'execute') then bad := bad || 'D2 guard_schedule_boost open'; end if;
  if has_function_privilege('anon', 'public.update_qna_count()', 'execute') or has_function_privilege('authenticated', 'public.update_qna_count()', 'execute') then bad := bad || 'D2 update_qna_count open'; end if;
  if (select count(*) from pg_trigger t join pg_proc p on p.oid = t.tgfoid where not t.tgisinternal and p.proname in ('block_ugc_trigger','guard_schedule_boost','update_qna_count')) <> 5 then bad := bad || 'D2 trigger count changed (expected 5)'; end if;
  -- D3
  if to_regclass('public.schedule_views') is null then bad := bad || 'D3 schedule_views missing'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.schedule_views'::regclass) then bad := bad || 'D3 schedule_views RLS off'; end if;
  if (select count(*) from pg_policy where polrelid = 'public.schedule_views'::regclass) <> 0 then bad := bad || 'D3 schedule_views has a policy'; end if;
  if has_table_privilege('anon', 'public.schedule_views', 'select') or has_table_privilege('authenticated', 'public.schedule_views', 'select,insert,update,delete') then bad := bad || 'D3 schedule_views readable by client'; end if;
  if has_function_privilege('anon', 'public.bump_schedule_view(uuid)', 'execute') then bad := bad || 'D3 anon still executes bump_schedule_view'; end if;
  if not has_function_privilege('authenticated', 'public.bump_schedule_view(uuid)', 'execute') then bad := bad || 'D3 authenticated lost bump_schedule_view'; end if;
  if not (select prosecdef from pg_proc where oid = 'public.bump_schedule_view(uuid)'::regprocedure) then bad := bad || 'D3 bump_schedule_view not definer'; end if;
  -- D4 (불변)
  if md5(pg_get_functiondef('public.venue_today_games(uuid)'::regprocedure)) <> 'afa7e21bf196696917e6f7e5f924152f' then bad := bad || 'D4 venue_today_games changed'; end if;
  if not has_function_privilege('anon', 'public.venue_today_games(uuid)', 'execute') then bad := bad || 'D4 anon lost venue_today_games'; end if;
  -- D5
  if has_function_privilege('authenticated', 'public._ledger_can_operate(uuid,uuid)', 'execute') or has_function_privilege('anon', 'public._ledger_can_operate(uuid,uuid)', 'execute') then bad := bad || 'D5 _ledger_can_operate still open'; end if;
  if not (select prosecdef from pg_proc where oid = 'public._ledger_sessions_client_insert_guard()'::regprocedure) then bad := bad || 'D5 insert guard not definer'; end if;
  if (select coalesce(proconfig::text,'') from pg_proc where oid = 'public._ledger_sessions_client_insert_guard()'::regprocedure) not ilike '%search_path=public, pg_temp%' then bad := bad || 'D5 insert guard search_path not pinned'; end if;
  if pg_get_functiondef('public._ledger_sessions_client_insert_guard()'::regprocedure) ilike '%current_user%' then bad := bad || 'D5 insert guard still reads current_user'; end if;
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relname = 'ledger_sessions' and t.tgname = 'trg_a0_ledger_sessions_client_insert_guard') then bad := bad || 'D5 trigger missing'; end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname <> '_ledger_can_operate' and p.proname <> '_ledger_sessions_client_insert_guard' and pg_get_functiondef(p.oid) ilike '%_ledger_can_operate%') <> 0 then bad := bad || 'D5 another caller of _ledger_can_operate appeared'; end if;
  -- D6
  if (select count(*) from public.phone_lookup_audit where phone_hash is not null) <> 0 then bad := bad || 'D6 phone_hash rows remain'; end if;
  if pg_get_functiondef('public.find_user_by_phone(text)'::regprocedure) ilike '%md5(%' then bad := bad || 'D6 find_user_by_phone still hashes'; end if;
  if has_function_privilege('anon', 'public.find_user_by_phone(text)', 'execute') or not has_function_privilege('authenticated', 'public.find_user_by_phone(text)', 'execute') then bad := bad || 'D6 find_user_by_phone ACL wrong'; end if;
  -- A
  if pg_get_function_result('public.get_my_venue_staff(uuid)'::regprocedure) not ilike '%is_active boolean%' then bad := bad || 'A get_my_venue_staff lacks is_active'; end if;
  if has_function_privilege('anon', 'public.get_my_venue_staff(uuid)', 'execute') or not has_function_privilege('authenticated', 'public.get_my_venue_staff(uuid)', 'execute') or not has_function_privilege('service_role', 'public.get_my_venue_staff(uuid)', 'execute') then bad := bad || 'A get_my_venue_staff ACL wrong (DROP resets ACL)'; end if;
  -- B
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relname = 'schedules' and t.tgname = 'trg_notify_admin_rereview_poster' and pg_get_triggerdef(t.oid) ilike '%rejected_at IS NULL%') then bad := bad || 'B rereview trigger missing or WHEN wrong'; end if;
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relname = 'schedules' and t.tgname = 'trg_notify_admin_pending_poster') then bad := bad || 'B insert trigger lost'; end if;
  if has_function_privilege('anon', 'public._notify_admin_pending_poster()', 'execute') or has_function_privilege('authenticated', 'public._notify_admin_pending_poster()', 'execute') then bad := bad || 'B _notify_admin_pending_poster open'; end if;
  if pg_get_functiondef('public._notify_admin_pending_poster()'::regprocedure) not ilike '%''/admin''%' then bad := bad || 'B link is not /admin'; end if;
  -- 공통: 이번에 만진 definer 전부 search_path 고정
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef
               and p.proname in ('bump_schedule_view','_ledger_sessions_client_insert_guard','find_user_by_phone','get_my_venue_staff','_notify_admin_pending_poster')
               and coalesce(p.proconfig::text,'') not ilike '%search_path=public, pg_temp%') then bad := bad || 'search_path unpinned'; end if;
  if array_length(bad, 1) > 0 then
    raise exception '20260926a 자가검사 실패: %', array_to_string(bad, ' | ');
  end if;
end $$;

notify pgrst, 'reload schema';
