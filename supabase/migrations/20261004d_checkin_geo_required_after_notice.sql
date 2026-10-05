-- ✅ 적용 완료 2026-10-05 (리드, 오너 승인 · MCP execute_sql) — 실측 md5(prosrc): check_in fb6a1a31 · staff_check_in 0bcef09e · request_checkin ffe52bbc ·
--   set_venue_checkin_geo_required fedbd1a1 · _checkin_geo_required_from 1af50c8a(anon·authenticated 실행 불가) · checkin_requests RLS on·정책 1·authenticated insert 불가 ·
--   venues.checkin_geo_required true 0곳 · app_settings.checkin_geo_enabled 행 없음. 후속 변경은 20261005a(이 파일을 고치지 않는다).
-- (원래 머리) v3 초안 (store-team 2026-10-05) — 리허설: supabase/tests/20261004d_rehearsal.sql
-- v3(오너 결정 2026-10-05 B): 직원 출석 처리는 '손님 요청 후 승인'만 — §1-2 checkin_requests · §4-1 request_checkin · §5-1 staff_check_in 요청 게이트.
--   대체 경로 문구 = src/lib/locationTerms.ts CHECKIN_ALT_PATH '매장에서 출석 요청을 보내면 업주 승인으로 출석할 수 있습니다'.
--   리허설(2026-10-05, 라이브 암묵 트랜잭션 롤백 · Management API): 38/38 PASS(기존 28 + Q1~Q10). 뒤이어 표·함수·칸 0, check_in md5 099a82e7… 그대로.
--   음성 대조: 요청 게이트 제거 → 자가검사 거부 · 게이트+자가검사 제거 → Q1·Q2 FAIL · 정책 using(true) → Q8 FAIL · 5곳 상한 제거 → Q10 FAIL · 중복 접기 제거 → Q4 FAIL.
-- 20261004d — 위치 확인을 켠 매장의 QR 출석은 위치정보 이용 동의 + 현재 위치가 있어야 된다(오너 결정 (다) 2026-10-04)
--
-- 원천: 오너 지시 2026-10-04 "출석 QR 위치정보 (다) — 법적으로 완벽하게 적용"
--       법규 조사 C:\Users\buffy\Documents\누리홀덤_영상분석_0930\location-law-1004.md (0-1절 ①~⑤)
--       위치기반서비스사업 신고 설명자료 ②: "매장 QR로 출석할 때(매장·운영자가 기능을 켠 경우) 위치정보 이용 동의를 확인한 뒤
--         현재 위치를 1회 받아 서버로 전송, 서버가 반경(300m, 측위 오차 보정) 안인지 판정 · 좌표 미저장 · 확인자료만 기록 · 제3자 제공 없음"
--       → 이 파일은 그 범위 안이다: '매장·운영자가 켠 경우' = 운영 스위치(checkin_geo_enabled) **그리고** 매장 스위치(이 파일의 새 칸).
--
-- 바뀌는 것
--   1. venues.checkin_geo_required boolean not null default false — 매장이 켜는 '위치 확인 출석'. 기존 매장은 전부 false(지금과 같다).
--   2. set_venue_checkin_geo_required(uuid, boolean) — **대표 업주(_venue_owner_ok)·관리자만** + 활성 계정(critical F1·리드 결정 2026-10-04).
--      공동 운영자는 못 바꾼다 — S-08(20261001m) 칸 가드(_guard_venue_coowner_columns)와 같은 선. ⚠ 정의자 함수 안에서는 current_user=postgres
--      라 그 트리거가 꺼지므로 이 RPC 가 스스로 검사해야 한다(critical 실측 X2a). 직접 UPDATE 는 트리거 허용 목록에 이 칸이 없어 공동 운영자에게 막힌다.
--   2-1. CHECK venues_checkin_geo_needs_coords — 켜져 있으면 좌표가 있어야 한다(critical F2). 업주 직접 UPDATE 로 좌표 없이 켜거나,
--      켜진 채 좌표를 지우는(공동 운영자는 lat·lng 를 고칠 수 있다) 길을 DB 가 막는다. 기존 행은 전부 false 라 위반 0.
--      check_in 도 좌표 없는 매장에는 위치 확인을 적용하지 않는다(겹 방어).
--   2-2. staff_check_in(uuid, uuid) — 업주가 **손님의 요청을 승인**해 출석 처리(critical L1 → 오너 B 2026-10-05): _apply_checkin 그대로(활동 점수·연속 출석·
--      CRM 방문·이벤트 참여권 = checkins 행). 위치 동의를 하지 않은 손님이 잃는 것이 없게 하는 **동등한 대체 경로**다.
--      권한 = can_manage_pos(대표·승인 공동 운영자·관리자, 정지·차단 제외) — 근거: 출석은 이벤트 참여권(→ 매장이용권)으로 이어지므로
--      매장이용권 발급(issue_voucher)과 같은 선보다 낮추지 않는다(venue_staff 는 실행 불가 → 문구도 '업주 승인'). 장부 권한만 있는 직원은 장부로 참가를 받는다.
--      🔴 v3: 대상은 **오늘(KST) 이 매장에 출석 요청(checkin_requests pending) 또는 참가 신청(request_buyin 행, 이용권 행 제외)을 보낸 회원**뿐이다.
--      v2 는 search_voucher_recipients 로 플랫폼 전 회원을 골라 손님 모르게 출석·점수·참여권·CRM 행을 만들 수 있었다(critical 재검토 2026-10-05).
--      남용 방지: 같은 손님·매장 4시간 중복 가드(check_in 과 같은 잠금·같은 문구) · 본인 출석 불가 ·
--      제재 계정 대상 불가 · audit_log(_audit 'staff_check_in', 매장, 손님) 기록. 위치를 쓰지 않으므로 확인자료 대상이 아니다.
--   2-3. checkin_requests 표 + request_checkin(uuid) — 손님이 위치 확인 출석 매장에서 '출석 요청'을 보낸다(재시도 시트의 버튼).
--      1일(KST) 1매장 1회(unique) · 하루 5매장 상한 · 이미 4시간 안에 출석했으면 거부 · 위치 확인 출석을 켠 승인 매장만 · 제재 계정 불가.
--      쓰기는 RPC 만(표에 insert/update/delete 정책·권한 없음). 읽기 RLS = 본인 또는 can_manage_pos(staff_check_in 과 같은 선).
--      30일 지난 요청은 request_checkin 이 지운다(목적 달성 뒤 보관 이유 없음). 업주 명단 실시간 갱신용으로 supabase_realtime 에 넣는다.
--   3. _checkin_geo_required_from() — 거부 시작 시각 D = 2026-11-05 00:00 KST.
--      근거: 이 변경은 동의하지 않는 이용자에게 불리할 수 있다 → 이용약관 제16조②("회원에게 불리한 변경의 경우에는 적용일 30일 전부터
--      서비스 내에 공지") · 개인정보처리방침 제14조②(중대한 변경 30일 전). 공지일 2026-10-05 + 31일. 위치정보법 제12조①(변경 이유·내용 공개)는
--      약관 부칙(제3판)에 적었다. 🔴 공지가 늦어지면 이 함수와 src/lib/locationTerms.ts 의 두 날짜를 **같은 커밋에서** 미룬다
--      (src/lib/locationTerms.contract.test.ts 가 둘이 같은지 잠근다).
--   4. check_in:
--      (a) 위치는 운영 스위치 on + 매장 켬 + 본인 동의(제3판 이상) + 좌표가 왔을 때만 쓴다. 매장이 안 켰으면 받은 좌표를 버린다(신고서 ② · 최소 수집).
--      (b) D 이후 + 운영 스위치 on + 매장 켬: 동의가 없으면 {error, code:'geo_consent_required'}, 좌표가 없으면 {error, code:'geo_position_required'}.
--          위치를 쓰지 않았으므로 확인자료를 남기지 않는다(쓴 것만 기록 — 법 제16조② · 고시 제6조). 예외가 아니라 jsonb 로 돌려주는 것은
--          클라가 code 로 재시도 시트를 고르기 위해서다(현재 번들은 {error} 를 Error 로 바꾼다 — 20260926b 부터).
--      (c) 나머지(로그인·제재·잠금·4시간 중복·반경 판정·오류 문구·좌표 쓴 호출의 확인자료·_apply_checkin 예외 처리)는 20260930f 본문 그대로.
--      (d) 동의 판 2 → 3 (src/lib/locationTerms.ts LOCATION_TERMS_VERSION 과 같은 배포). 제2판 동의자는 다음 위치 확인 출석 때 다시 묻는다 —
--          그 전까지 좌표는 버려지고, D 전에는 좌표 없는 출석으로 처리된다(지금 동작).
--      ⇒ D 전: 매장이 켰든 안 켰든 출석은 지금처럼 된다(켠 매장에서 동의·좌표가 있으면 반경 판정만 더 한다 — 지금도 스위치 on + 동의면 하는 일).
--      ⇒ 매장이 안 켰으면 D 뒤에도 지금과 같다(오너 결정 (다)-(g)).
--   5. location_access_log.purpose 에 주석 — 법 제2조제5호 '이용·제공방법'을 겸한다는 사실(값 하나 = 방법 하나). 칸 추가는 하지 않는다(보고서 참고).
--
-- 위치 거부 손님의 대체 경로(오너 결정 (다)-(a) · B): 출석 요청(2-3) → 업주 승인 staff_check_in(2-2, 출석과 같은 혜택) · request_buyin(참가 신청 → 운영자 승인) ·
--   직원 장부 직접 입력. 뒤 둘은 출석 혜택을 주지 않는다(critical 2026-10-04) — 그래서 2-2 를 만들었다. 참가 신청을 보낸 손님은 2-2 로도 출석 처리할 수 있다.
--
-- 되돌리기(한 트랜잭션): check_in 을 20260930f §4 본문으로 create or replace(같은 시그니처 → ACL 보존) ·
--   drop function public.request_checkin(uuid) · alter publication supabase_realtime drop table public.checkin_requests · drop table public.checkin_requests ·
--   drop function public.set_venue_checkin_geo_required(uuid, boolean) · drop function public.staff_check_in(uuid, uuid) ·
--   drop function public._checkin_geo_required_from() · alter table public.venues drop constraint venues_checkin_geo_needs_coords ·
--   (칸은 남겨도 무해 — 지우려면 alter table public.venues drop column checkin_geo_required).
--   클라 LOCATION_TERMS_VERSION 을 2 로 되돌리지 않으면 제3판 동의 행(terms_version 3)도 옛 본문(>= 2)에서 유효하다 — 순서 무관.

-- §0 적용 전 본문 게이트 — 라이브 check_in 이 20260930f 본문(제재 가드 + 동의 판 2)이 아니면 멈춘다. 이 파일이 이미 적용됐으면 통과(재적용 가능).
do $pre$
declare d text := pg_get_functiondef('public.check_in(uuid,double precision,double precision,double precision)'::regprocedure);
begin
  if d like '%_checkin_geo_required_from%' then
    return; -- 재적용
  end if;
  if d not like '%is_account_active%' or d not like '%terms_version >= 2%' or d not like '%location_access_log%' then
    raise exception '20261004d: check_in 라이브 본문이 예상(20260930f)과 다릅니다(md5 %). 본문을 다시 맞추세요', md5(d);
  end if;
  if to_regprocedure('public.can_manage_pos(uuid)') is null or to_regprocedure('public.is_account_active()') is null
     or to_regprocedure('public._venue_owner_ok(uuid)') is null or to_regprocedure('public._apply_checkin(uuid,uuid)') is null
     or to_regprocedure('public._audit(text,text,jsonb)') is null or to_regprocedure('public.my_role()') is null
     or to_regprocedure('public.ledger_business_date(uuid)') is null or to_regclass('public.ledger_buyin_requests') is null then
    raise exception '20261004d: 선행 함수·표(can_manage_pos·is_account_active·_venue_owner_ok·_apply_checkin·_audit·my_role·ledger_business_date·ledger_buyin_requests)가 없습니다';
  end if;
  -- 공동 운영자 칸 가드(20261001m)가 살아 있고 허용 목록에 새 칸이 없어야 F1 의 '직접 UPDATE 불가'가 성립한다.
  if not exists (select 1 from pg_trigger where tgrelid = 'public.venues'::regclass and tgname = 'trg_guard_venue_coowner_columns' and tgenabled <> 'D')
     or pg_get_functiondef('public._guard_venue_coowner_columns()'::regprocedure) like '%checkin_geo_required%' then
    raise exception '20261004d: 공동 운영자 칸 가드(trg_guard_venue_coowner_columns)가 없거나 새 칸을 허용합니다';
  end if;
end $pre$;

-- §1 매장 스위치
alter table public.venues add column if not exists checkin_geo_required boolean not null default false;
-- 2-1 켜져 있으면 좌표 필수(F2)
do $c$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.venues'::regclass and conname = 'venues_checkin_geo_needs_coords') then
    alter table public.venues add constraint venues_checkin_geo_needs_coords
      check (not checkin_geo_required or (lat is not null and lng is not null));
  end if;
end $c$;
comment on column public.venues.checkin_geo_required is
  '위치 확인 출석(20261004d). true 이고 운영 스위치 checkin_geo_enabled=on 일 때만 check_in 이 위치를 쓴다. _checkin_geo_required_from() 이후에는 동의·좌표가 없으면 거부.';

-- §2 확인자료 칸 주석(스키마 변경 없음)
comment on column public.location_access_log.purpose is
  '위치정보법 제2조제5호 이용·제공방법을 겸한다: checkin_radius = 서버에서 매장 반경 판정 후 좌표 즉시 파기(출석 위치 확인) · self_view = 본인 열람(고시 제6조①2호).';

-- §2-1 출석 요청(2-3) — 쓰기는 request_checkin·staff_check_in(정의자) 만. 표에 쓰기 권한·정책을 주지 않는다.
create table if not exists public.checkin_requests (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  display_name text,
  request_date date not null,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  constraint checkin_requests_one_per_day unique (venue_id, user_id, request_date)
);
create index if not exists checkin_requests_user_date on public.checkin_requests (user_id, request_date);
alter table public.checkin_requests enable row level security;
revoke all on table public.checkin_requests from public, anon, authenticated;
grant select on table public.checkin_requests to authenticated;
grant all on table public.checkin_requests to service_role;
drop policy if exists checkin_requests_select on public.checkin_requests;
create policy checkin_requests_select on public.checkin_requests for select to authenticated
  using (user_id = (select auth.uid()) or coalesce(public.can_manage_pos(venue_id), false));
comment on table public.checkin_requests is
  '출석 요청(20261004d v3) — 위치 확인 출석 매장에서 손님이 보내고, 업주(can_manage_pos)가 staff_check_in 으로 승인한다. 1일(KST) 1매장 1회.';
do $pub$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'checkin_requests') then
    alter publication supabase_realtime add table public.checkin_requests;
  end if;
end $pub$;

-- §3 거부 시작 시각 D — 내부 함수(리허설은 트랜잭션 안에서 이 함수만 과거 시각으로 바꿔 D 이후를 시험한다)
create or replace function public._checkin_geo_required_from()
 returns timestamptz
 language sql
 stable
 set search_path = public, pg_temp
as $function$
  select timestamptz '2026-11-05 00:00:00+09'
$function$;
revoke all on function public._checkin_geo_required_from() from public, anon, authenticated;
grant execute on function public._checkin_geo_required_from() to service_role;

-- §4 매장 스위치 RPC
create or replace function public.set_venue_checkin_geo_required(p_venue_id uuid, p_on boolean)
 returns boolean
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_lat double precision; v_lng double precision; v_new boolean;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if p_venue_id is null or p_on is null then raise exception '요청 값이 올바르지 않습니다'; end if;
  if not public.is_account_active() then raise exception '제재 중이거나 비활성화된 계정은 이용할 수 없습니다'; end if;
  -- F1: 대표 업주·관리자만(공동 운영자 불가 — S-08 칸 가드와 같은 선). NULL-safe: 비로그인·조회 실패면 거부.
  if (coalesce(public.my_role() = 'admin'::user_role, false) or public._venue_owner_ok(p_venue_id)) is distinct from true then
    raise exception '위치 확인 출석은 대표 업주만 켜고 끌 수 있습니다';
  end if;
  select lat, lng into v_lat, v_lng from public.venues where id = p_venue_id for update;
  if not found then raise exception '매장을 찾을 수 없습니다'; end if;
  if p_on and (v_lat is null or v_lng is null) then
    raise exception '출석 위치를 먼저 등록해 주세요';
  end if;
  update public.venues set checkin_geo_required = p_on where id = p_venue_id
  returning checkin_geo_required into v_new;
  return v_new;
end $function$;
revoke all on function public.set_venue_checkin_geo_required(uuid, boolean) from public, anon;
grant execute on function public.set_venue_checkin_geo_required(uuid, boolean) to authenticated, service_role;

-- §4-1 출석 요청 RPC(2-3) — 반환 {status: pending|approved, already: bool, name}
create or replace function public.request_checkin(p_venue_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_name text; v_geo boolean; v_approved boolean; v_recent timestamptz; v_status text; v_cnt int; v_disp text;
begin
  if auth.uid() is null then raise exception '로그인 후 출석 요청을 보낼 수 있습니다'; end if;
  if p_venue_id is null then raise exception '요청 값이 올바르지 않습니다'; end if;
  if not public.is_account_active() then raise exception '제재 중이거나 비활성화된 계정은 이용할 수 없습니다'; end if;
  select name, checkin_geo_required, approved into v_name, v_geo, v_approved from public.venues where id = p_venue_id;
  if v_name is null or v_approved is distinct from true then raise exception '매장을 찾을 수 없습니다'; end if;
  -- 요청은 위치 확인 출석 매장에서만 받는다 — 그 밖의 매장은 QR 출석에 위치가 필요 없다(요청 남발 표면을 줄인다).
  if v_geo is distinct from true then raise exception '이 매장은 QR로 바로 출석할 수 있습니다'; end if;
  -- check_in·staff_check_in 과 같은 잠금 키 — 동시에 온 출석·요청이 한 줄로 선다
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_venue_id::text, 0));
  select created_at into v_recent from public.checkins
   where venue_id = p_venue_id and user_id = auth.uid() order by created_at desc limit 1;
  if v_recent is not null and v_recent > now() - interval '4 hours' then
    raise exception '이미 체크인했습니다 (4시간 내 중복 방지)';
  end if;
  -- 1일 1매장 1회 — 이미 보냈으면 새로 만들지 않고 그 상태를 돌려준다(버튼 연타·재시도도 행 1개)
  select status into v_status from public.checkin_requests
   where venue_id = p_venue_id and user_id = auth.uid() and request_date = v_today;
  if v_status is not null then
    return jsonb_build_object('status', v_status, 'already', true, 'name', v_name);
  end if;
  select count(*) into v_cnt from public.checkin_requests where user_id = auth.uid() and request_date = v_today;
  if v_cnt >= 5 then raise exception '출석 요청은 하루 5곳까지 보낼 수 있습니다'; end if;
  select coalesce(nullif(btrim(nickname), ''), nullif(btrim(name), ''), '회원') into v_disp from public.profiles where id = auth.uid();
  insert into public.checkin_requests (venue_id, user_id, display_name, request_date)
  values (p_venue_id, auth.uid(), v_disp, v_today);
  delete from public.checkin_requests where request_date < v_today - 30; -- 목적이 끝난 요청은 보관하지 않는다
  return jsonb_build_object('status', 'pending', 'already', false, 'name', v_name);
end $function$;
revoke all on function public.request_checkin(uuid) from public, anon;
grant execute on function public.request_checkin(uuid) to authenticated, service_role;

-- §5 check_in — 같은 시그니처(ACL 보존). 20260930f 본문에서 위치 판정 블록만 바뀐다.
create or replace function public.check_in(p_venue_id uuid, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_accuracy double precision DEFAULT NULL::double precision)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_name text; v_recent timestamptz; v_vlat double precision; v_vlng double precision; v_dist double precision;
  v_geo boolean := false; v_err text; v_res jsonb;
  v_venue_geo boolean; v_consent boolean;
begin
  if auth.uid() is null then raise exception '로그인 후 체크인할 수 있습니다'; end if;
  -- 20260930f: 제재 계정은 출석·활동 점수·방문 수를 만들 수 없다.
  if not public.is_account_active() then raise exception '제재 중이거나 비활성화된 계정은 이용할 수 없습니다'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_venue_id::text, 0));
  select name, lat, lng, checkin_geo_required into v_name, v_vlat, v_vlng, v_venue_geo from public.venues where id = p_venue_id;
  if v_name is null then raise exception '매장을 찾을 수 없습니다'; end if;

  -- 20260926b: 중복 검사를 위치 판정보다 먼저 — 어차피 거부될 출석에는 위치를 쓰지 않는다
  select created_at into v_recent from public.checkins
   where venue_id = p_venue_id and user_id = auth.uid() order by created_at desc limit 1;
  if v_recent is not null and v_recent > now() - interval '4 hours' then
    raise exception '이미 체크인했습니다 (4시간 내 중복 방지)';
  end if;

  -- 20261004d: 위치는 운영 스위치 'on' + 매장의 '위치 확인 출석' 켬 일 때만 다룬다(신고서 ② '매장·운영자가 켠 경우').
  --   좌표 없는 매장에는 적용하지 않는다(F2 겹 방어 — CHECK venues_checkin_geo_needs_coords 가 1차로 막는다).
  v_venue_geo := coalesce(v_venue_geo, false) and v_vlat is not null and v_vlng is not null
    and exists (select 1 from public.app_settings where key = 'checkin_geo_enabled' and value = 'on');
  -- 약관판 3 = src/lib/locationTerms.ts LOCATION_TERMS_VERSION. 판을 올리면 이 숫자도 같은 배포에서 올린다(법 제15조① — 동의 없으면 좌표를 쓰지 않는다).
  v_consent := v_venue_geo
    and exists (select 1 from public.location_consents where user_id = auth.uid() and granted and terms_version >= 3);

  -- 20261004d: 시행일(D) 뒤 켠 매장은 동의·좌표 없는 출석(QR 스캔·매장 페이지 출석 버튼·앱 카메라 — 셋 다 이 함수)을 받지 않는다.
  --   위치를 쓰지 않았으므로 확인자료도 없다. 대체 경로 = 출석 요청 → 업주 승인 staff_check_in(같은 혜택) — 문구로 안내한다.
  if v_venue_geo and now() >= public._checkin_geo_required_from() then
    if not v_consent then
      return jsonb_build_object('code', 'geo_consent_required', 'error',
        '위치 확인 출석 매장이라 위치정보 이용에 동의해야 이 매장에서 출석할 수 있습니다. 동의하지 않아도 매장에서 출석 요청을 보내면 업주 승인으로 출석할 수 있습니다');
    end if;
    if p_lat is null and p_lng is null then
      return jsonb_build_object('code', 'geo_position_required', 'error',
        '위치 확인 출석 매장이라 현재 위치를 확인해야 이 매장에서 출석할 수 있습니다. 위치를 켤 수 없어도 매장에서 출석 요청을 보내면 업주 승인으로 출석할 수 있습니다');
    end if;
  end if;

  -- 좌표는 위 조건 + 본인 동의가 있을 때만 쓴다. 아니면 받은 좌표를 버리고 좌표 없는 출석으로 처리(D 전·매장 꺼짐).
  if (p_lat is not null or p_lng is not null) and v_consent then
    v_geo := true;
    -- 법 제16조② 확인자료 — 좌표·매장·판정 결과는 넣지 않는다
    insert into public.location_access_log (user_id, purpose, acquired_via) values (auth.uid(), 'checkin_radius', 'device_gps');
    if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180
       or (p_accuracy is not null and p_accuracy < 0) then
      v_err := '위치 값이 올바르지 않아요';
    elsif coalesce(p_accuracy, 0) > 1000 then
      v_err := '위치 정확도가 낮아요. 매장 안에서 다시 시도해 주세요';
    elsif v_vlat is null or v_vlng is null then
      v_err := '이 매장은 아직 출석 위치가 등록되지 않았어요. 매장에 문의해 주세요';
    else
      v_dist := 2 * 6371000 * asin(sqrt(
        power(sin(radians(p_lat - v_vlat) / 2), 2)
        + cos(radians(v_vlat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - v_vlng) / 2), 2)));
      if v_dist > 300 + least(coalesce(p_accuracy, 0), 200) then
        v_err := '매장 근처에서만 출석할 수 있어요';
      end if;
    end if;
    -- 예외로 던지면 위 확인자료 행까지 롤백된다 → 문구를 돌려준다(클라이언트 checkIn 이 Error 로 바꾼다)
    if v_err is not null then return jsonb_build_object('error', v_err); end if;
  end if;

  begin
    v_res := public._apply_checkin(p_venue_id, auth.uid());
  exception when others then
    if v_geo then
      -- P0001 = 우리 함수가 raise 한 안내문(제재·중복 등) — 좌표 없는 경로에서도 손님에게 그대로 보이는 문구라 유지한다.
      if sqlstate = 'P0001' then return jsonb_build_object('error', sqlerrm); end if;
      raise log 'check_in(geo) _apply_checkin 실패 %: %', sqlstate, sqlerrm;
      return jsonb_build_object('error', '출석을 처리하지 못했어요');
    end if;
    raise;
  end;
  return v_res || jsonb_build_object('name', v_name);
end $function$;

revoke all on function public.check_in(uuid, double precision, double precision, double precision) from public, anon;
grant execute on function public.check_in(uuid, double precision, double precision, double precision) to authenticated, service_role;

-- §5-1 staff_check_in — 업주가 손님의 요청을 승인해 출석 처리(2-2). 반환 모양은 check_in 과 같다({points, streak, name}).
create or replace function public.staff_check_in(p_venue_id uuid, p_user_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_name text; v_recent timestamptz; v_res jsonb; v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if p_venue_id is null or p_user_id is null then raise exception '요청 값이 올바르지 않습니다'; end if;
  if not public.is_account_active() then raise exception '제재 중이거나 비활성화된 계정은 이용할 수 없습니다'; end if;
  if not coalesce(public.can_manage_pos(p_venue_id), false) then raise exception '출석 처리 권한이 없습니다'; end if;
  if p_user_id = auth.uid() then raise exception '본인 출석은 매장 출석 QR로 해 주세요'; end if;
  -- 대상 손님: 있는 계정이고 활동 중이어야 한다(제재 계정은 출석·점수를 만들 수 없다 — 20260930f 와 같은 판정)
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.status::text = 'active'
                   and (p.suspended_until is null or p.suspended_until < now())) then
    raise exception '이 회원은 출석 처리할 수 없습니다';
  end if;
  -- check_in 과 같은 잠금 키·같은 4시간 중복 가드 — 손님 QR 과 직원 처리가 겹쳐도 한 번만 들어간다
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_venue_id::text, 0));
  select name into v_name from public.venues where id = p_venue_id;
  if v_name is null then raise exception '매장을 찾을 수 없습니다'; end if;
  select created_at into v_recent from public.checkins
   where venue_id = p_venue_id and user_id = p_user_id order by created_at desc limit 1;
  if v_recent is not null and v_recent > now() - interval '4 hours' then
    raise exception '이미 체크인했습니다 (4시간 내 중복 방지)';
  end if;
  -- v3(오너 B 2026-10-05): 손님이 **오늘 이 매장에** 먼저 손을 든 경우만 — 출석 요청(대기) 또는 앱 참가 신청(request_buyin 행).
  --   이용권 사용 행(voucher_id)은 손님 요청이 아닐 수 있어 넣지 않는다. 참가 신청 날짜는 영업일(자정 넘긴 토너)도 인정한다.
  if not exists (select 1 from public.checkin_requests r
                  where r.venue_id = p_venue_id and r.user_id = p_user_id and r.request_date = v_today and r.status = 'pending')
     and not exists (select 1 from public.ledger_buyin_requests b
                      where b.venue_id = p_venue_id and b.user_id = p_user_id and b.voucher_id is null
                        and b.session_date in (v_today, public.ledger_business_date(p_venue_id))) then
    raise exception '오늘 이 매장에 출석 요청이나 참가 신청을 보낸 손님만 출석 처리할 수 있습니다';
  end if;
  v_res := public._apply_checkin(p_venue_id, p_user_id);
  update public.checkin_requests set status = 'approved', decided_at = now(), decided_by = auth.uid()
   where venue_id = p_venue_id and user_id = p_user_id and request_date = v_today and status = 'pending';
  perform public._audit('staff_check_in', p_venue_id::text, jsonb_build_object('user_id', p_user_id));
  return v_res || jsonb_build_object('name', v_name);
end $function$;
revoke all on function public.staff_check_in(uuid, uuid) from public, anon;
grant execute on function public.staff_check_in(uuid, uuid) to authenticated, service_role;

-- §6 자가검사 — 검사 문자열은 본문 **코드**에만 있는 것으로 고른다(주석에 같은 글자를 두면 지워도 통과한다 — store-team 기억 2026-09-12).
do $check$
declare d text := pg_get_functiondef('public.check_in(uuid,double precision,double precision,double precision)'::regprocedure);
begin
  if has_function_privilege('anon', 'public.check_in(uuid,double precision,double precision,double precision)', 'execute')
     or not has_function_privilege('authenticated', 'public.check_in(uuid,double precision,double precision,double precision)', 'execute') then
    raise exception '20261004d 자가검사: check_in ACL 이상';
  end if;
  if has_function_privilege('anon', 'public.set_venue_checkin_geo_required(uuid,boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.set_venue_checkin_geo_required(uuid,boolean)', 'execute') then
    raise exception '20261004d 자가검사: set_venue_checkin_geo_required ACL 이상';
  end if;
  if has_function_privilege('anon', 'public._checkin_geo_required_from()', 'execute')
     or has_function_privilege('authenticated', 'public._checkin_geo_required_from()', 'execute') then
    raise exception '20261004d 자가검사: 내부 함수 _checkin_geo_required_from 이 열려 있습니다';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'venues'
                  and column_name = 'checkin_geo_required' and is_nullable = 'NO' and column_default = 'false') then
    raise exception '20261004d 자가검사: venues.checkin_geo_required 칸이 없거나 not null default false 가 아닙니다';
  end if;
  if (select public._checkin_geo_required_from()) <> timestamptz '2026-11-05 00:00:00+09' then
    raise exception '20261004d 자가검사: 시행 시각이 2026-11-05 00:00 KST 가 아닙니다';
  end if;
  if d not like '%terms_version >= 3%' or d like '%terms_version >= 2%'
     or d not like '%now() >= public._checkin_geo_required_from()%'
     or d not like '%''geo_consent_required''%' or d not like '%''geo_position_required''%'
     or d not like '%checkin_geo_required into%' or d not like '%and v_vlat is not null and v_vlng is not null%'
     or d not like '%is_account_active()%' or d not like '%출석을 처리하지 못했어요%' then
    raise exception '20261004d 자가검사: check_in 본문 이상';
  end if;
  if pg_get_functiondef('public.set_venue_checkin_geo_required(uuid,boolean)'::regprocedure) not like '%public._venue_owner_ok(p_venue_id)) is distinct from true%'
     or pg_get_functiondef('public.set_venue_checkin_geo_required(uuid,boolean)'::regprocedure) like '%can_manage%' then
    raise exception '20261004d 자가검사: 매장 스위치 RPC 가 대표·관리자 전용이 아닙니다';
  end if;
  if has_function_privilege('anon', 'public.staff_check_in(uuid,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.staff_check_in(uuid,uuid)', 'execute') then
    raise exception '20261004d 자가검사: staff_check_in ACL 이상';
  end if;
  if pg_get_functiondef('public.staff_check_in(uuid,uuid)'::regprocedure) not like '%coalesce(public.can_manage_pos(p_venue_id), false)%'
     or pg_get_functiondef('public.staff_check_in(uuid,uuid)'::regprocedure) not like '%interval ''4 hours''%'
     or pg_get_functiondef('public.staff_check_in(uuid,uuid)'::regprocedure) not like '%public._audit(''staff_check_in''%' then
    raise exception '20261004d 자가검사: staff_check_in 본문 이상(권한·중복 가드·감사)';
  end if;
  -- v3: 요청 게이트(출석 요청 대기 또는 참가 신청)가 _apply_checkin **앞에** 있어야 한다
  if position('from public.checkin_requests r' in pg_get_functiondef('public.staff_check_in(uuid,uuid)'::regprocedure)) = 0
     or position('from public.ledger_buyin_requests b' in pg_get_functiondef('public.staff_check_in(uuid,uuid)'::regprocedure)) = 0
     or position('from public.checkin_requests r' in pg_get_functiondef('public.staff_check_in(uuid,uuid)'::regprocedure))
        > position('v_res := public._apply_checkin' in pg_get_functiondef('public.staff_check_in(uuid,uuid)'::regprocedure)) then
    raise exception '20261004d 자가검사: staff_check_in 요청 게이트가 없거나 출석 기록 뒤에 있습니다';
  end if;
  if has_function_privilege('anon', 'public.request_checkin(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.request_checkin(uuid)', 'execute') then
    raise exception '20261004d 자가검사: request_checkin ACL 이상';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.checkin_requests'::regclass)
     or has_table_privilege('anon', 'public.checkin_requests', 'select')
     or has_table_privilege('authenticated', 'public.checkin_requests', 'insert')
     or has_table_privilege('authenticated', 'public.checkin_requests', 'update')
     or has_table_privilege('authenticated', 'public.checkin_requests', 'delete')
     or not has_table_privilege('authenticated', 'public.checkin_requests', 'select')
     or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'checkin_requests') <> 1 then
    raise exception '20261004d 자가검사: checkin_requests RLS·권한 이상(RLS 켜짐·anon 0·authenticated 읽기만·정책 1개)';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.venues'::regclass and conname = 'venues_checkin_geo_needs_coords' and convalidated) then
    raise exception '20261004d 자가검사: CHECK venues_checkin_geo_needs_coords 가 없습니다';
  end if;
  -- 위치를 쓰지 않은 거부(동의·좌표 없음)는 확인자료 insert 보다 **앞에서** 돌아가야 한다(쓰지 않은 위치를 기록하지 않는다).
  if position('geo_position_required' in d) > position('insert into public.location_access_log' in d) then
    raise exception '20261004d 자가검사: 위치 미사용 거부가 확인자료 기록 뒤에 있습니다';
  end if;
end $check$;

notify pgrst, 'reload schema';
