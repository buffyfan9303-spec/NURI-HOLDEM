-- ✅ 적용 완료 2026-09-26 (nuri-lead, MCP execute_sql) — §0 게이트·§7 자가검사 통과. check_in md5 bc8244cd→de2c147d.
--    적용 후 양성: 좌표 없는 check_in 성공(이름 반환), 좌표 동반 호출은 스위치 꺼짐(checkin_geo_enabled 행 없음)이라 위치 판정 없이 종전 경로.
--    리허설(home-team, 전량 롤백): T1~T14·N1~N7·P1·W1·L1 PASS.
-- 20260926b — 위치정보 이용 동의 · 이용사실 확인자료 자동 기록 · 6개월 파기 (오너 2026-09-26 LOCATION-READY)
--
-- 근거(국가법령정보센터 Open API 원문, 2026-09-26 조회):
--   위치정보법(시행 2025-10-01, MST 277359)
--     제2조제5호  이용·제공사실 확인자료 = 제공받는 자·취득경로·이용·제공일시·이용·제공방법(위치정보는 제외)
--     제15조①    동의 없이 개인위치정보 수집·이용 금지            → 서버가 동의 기록 없으면 좌표를 쓰지 않는다
--     제16조②    확인자료를 위치정보시스템에 자동 기록·보존        → check_in 안에서 좌표를 쓸 때마다 1행
--     제24조①②  언제든 동의 철회·일시 중지                     → set_my_location_consent(false)
--     제24조③    확인자료 열람 요구                            → get_my_location_access_log
--     제24조④    철회 시 확인자료 지체 없이 파기                 → 철회 즉시 본인 행 삭제
--   고시 「위치정보의 관리적·기술적 보호조치 기준」(2026-05-18 시행, 제2026-11호)
--     제6조①     취급대장 = 확인자료 + 열람·고지 사실            → purpose 'self_view' 도 기록
--     제6조④     식별정보 최소                                → user_id 만(좌표·매장·판정 결과 저장 안 함)
--     제6조⑤     취급대장 최소 6개월 보관                       → 6개월 지난 행 매일 파기(04:10 UTC)
--
-- 바뀌는 것
--   1. location_consents(회원별 1행: 동의 여부·약관 버전·동의/철회 시각) — RLS, 직접 접근 없음, RPC 로만
--   2. location_access_log(좌표 없음: 누가·언제·무슨 목적·취득경로·제공받는 자) — RLS, 직접 접근 없음
--   3. get_my_location_consent / set_my_location_consent / get_my_location_access_log — authenticated 만
--   4. check_in: (a) 4시간 중복 검사를 위치 판정 **앞으로**(중복이면 위치를 쓰지 않는다)
--               (b) 좌표는 **운영 스위치 'on' 이고 동의가 있을 때만** 쓴다 — 아니면 좌표 없는 호출처럼 처리(버림)
--               (c) 좌표를 쓰면 확인자료 1행 — 위치 판정 거부도 **예외 대신 {"error": 문구}** 로 돌려 기록이 롤백되지 않게
--               (d) _apply_checkin 예외도 좌표를 쓴 호출에서는 {"error": 문구} — 같은 이유.
--                   문구는 우리가 raise 한 안내문(SQLSTATE P0001)만 그대로, 그 밖의 내부 오류는 고정 문구
--                   '출석을 처리하지 못했어요'(원문은 raise log 로 서버 로그에만 — 보안 표준 6, critical-reviewer 2026-09-26)
--               (e) 동의는 **현재 약관판(제2판) 이상**일 때만 유효 — 옛 판 동의면 좌표를 버린다(클라 LOCATION_TERMS_VERSION 과 같은 값)
--               좌표 없는 호출(옛 번들·스위치 꺼짐·동의 없음)은 **종전과 같은 경로·같은 예외**다.
--   5. 탈퇴(status→withdrawn) 시 두 표의 본인 행 즉시 삭제(트리거 — 탈퇴 함수 두 개는 고치지 않는다)
--   6. _purge_location_access_log + cron 'purge-location-access-log' 10 4 * * *
--
-- 되돌리기: check_in 은 20260923b 본문으로 create or replace(같은 시그니처 → ACL 보존).
--           cron.unschedule('purge-location-access-log'); drop trigger/function/table 순.

-- §0 적용 전 본문 확인 — 라이브 check_in 이 20260923b(bc8244cd…)가 아니면 멈춘다(재적용은 통과)
do $pre$
declare d text := pg_get_functiondef('public.check_in(uuid,double precision,double precision,double precision)'::regprocedure);
begin
  if md5(d) <> 'bc8244cd0a4b2858eff33efdcf0f0eab' and d not like '%location_access_log%' then
    raise exception '20260926b: check_in 라이브 본문이 예상(bc8244cd…)과 다릅니다(%). 본문을 다시 맞추세요', md5(d);
  end if;
end $pre$;

-- §1 동의 기록
create table if not exists public.location_consents (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  granted       boolean not null,
  terms_version integer not null check (terms_version between 1 and 1000),
  granted_at    timestamptz,
  revoked_at    timestamptz,
  updated_at    timestamptz not null default now()
);
alter table public.location_consents enable row level security;
revoke all on table public.location_consents from public, anon, authenticated;

-- §2 이용사실 확인자료(좌표 없음)
create table if not exists public.location_access_log (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  purpose      text not null check (purpose in ('checkin_radius', 'self_view')),
  acquired_via text not null check (acquired_via in ('device_gps', 'none')),
  recipient    text,                           -- 제3자 제공 없음 = null (제2조제5호 '제공받는 자')
  created_at   timestamptz not null default now()
);
create index if not exists location_access_log_user_idx on public.location_access_log (user_id, created_at desc);
create index if not exists location_access_log_created_idx on public.location_access_log (created_at);
alter table public.location_access_log enable row level security;
revoke all on table public.location_access_log from public, anon, authenticated;

-- §3 본인 RPC
create or replace function public.get_my_location_consent()
 returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $function$
declare r public.location_consents;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  select * into r from public.location_consents where user_id = auth.uid();
  if not found then return jsonb_build_object('state', 'unset'); end if;
  return jsonb_build_object('state', case when r.granted then 'granted' else 'denied' end,
    'terms_version', r.terms_version, 'granted_at', r.granted_at, 'revoked_at', r.revoked_at);
end $function$;
revoke all on function public.get_my_location_consent() from public, anon;
grant execute on function public.get_my_location_consent() to authenticated, service_role;

create or replace function public.set_my_location_consent(p_granted boolean, p_terms_version integer)
 returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_uid uuid := auth.uid(); v_prev boolean;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  if p_granted is null or p_terms_version is null or p_terms_version < 1 or p_terms_version > 1000 then
    raise exception '요청 값이 올바르지 않습니다';
  end if;
  select granted into v_prev from public.location_consents where user_id = v_uid for update;
  insert into public.location_consents as c (user_id, granted, terms_version, granted_at, revoked_at, updated_at)
  values (v_uid, p_granted, p_terms_version,
          case when p_granted then now() end, null, now())
  on conflict (user_id) do update set
    granted       = excluded.granted,
    terms_version = excluded.terms_version,
    granted_at    = case when excluded.granted then now() else c.granted_at end,
    revoked_at    = case when excluded.granted then null
                         when c.granted then now() else c.revoked_at end,
    updated_at    = now();
  -- 법 제24조④ — 철회하면 확인자료를 지체 없이 파기한다
  if not p_granted then
    delete from public.location_access_log where user_id = v_uid;
  end if;
  return public.get_my_location_consent();
end $function$;
revoke all on function public.set_my_location_consent(boolean, integer) from public, anon;
grant execute on function public.set_my_location_consent(boolean, integer) to authenticated, service_role;

-- 열람(제24조③). 열람 사실도 취급대장이다(고시 제6조①2호) — 조회할 때마다 1행 남긴다.
create or replace function public.get_my_location_access_log(p_limit integer default 100)
 returns table (used_at timestamptz, purpose text, acquired_via text, recipient text)
 language plpgsql security definer set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  insert into public.location_access_log (user_id, purpose, acquired_via) values (auth.uid(), 'self_view', 'none');
  return query
    select l.created_at, l.purpose, l.acquired_via, l.recipient
      from public.location_access_log l
     where l.user_id = auth.uid()
     order by l.created_at desc, l.id desc
     limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $function$;
revoke all on function public.get_my_location_access_log(integer) from public, anon;
grant execute on function public.get_my_location_access_log(integer) to authenticated, service_role;

-- §4 check_in — 같은 시그니처(ACL 보존). 좌표 없는 경로는 20260923b 와 같은 동작.
create or replace function public.check_in(
  p_venue_id uuid,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy double precision default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_name text; v_recent timestamptz; v_vlat double precision; v_vlng double precision; v_dist double precision;
  v_geo boolean := false; v_err text; v_res jsonb;
begin
  if auth.uid() is null then raise exception '로그인 후 체크인할 수 있습니다'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_venue_id::text, 0));
  select name, lat, lng into v_name, v_vlat, v_vlng from public.venues where id = p_venue_id;
  if v_name is null then raise exception '매장을 찾을 수 없습니다'; end if;

  -- 20260926b: 중복 검사를 위치 판정보다 먼저 — 어차피 거부될 출석에는 위치를 쓰지 않는다
  select created_at into v_recent from public.checkins
   where venue_id = p_venue_id and user_id = auth.uid() order by created_at desc limit 1;
  if v_recent is not null and v_recent > now() - interval '4 hours' then
    raise exception '이미 체크인했습니다 (4시간 내 중복 방지)';
  end if;

  -- 20260926b: 좌표는 운영 스위치 'on' + 본인 동의가 있을 때만 쓴다(법 제15조①). 아니면 받은 좌표를 버리고 좌표 없는 출석으로 처리.
  if (p_lat is not null or p_lng is not null)
     and exists (select 1 from public.app_settings where key = 'checkin_geo_enabled' and value = 'on')
     -- 약관판 2 = src/lib/locationConsent.ts LOCATION_TERMS_VERSION. 판을 올리면 이 숫자도 같은 배포에서 올린다.
     and exists (select 1 from public.location_consents where user_id = auth.uid() and granted and terms_version >= 2) then
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

-- §5 탈퇴 시 즉시 삭제(회원 정보는 탈퇴 즉시 파기 — 오너 2026-09-25)
create or replace function public._tg_location_purge_on_withdraw()
 returns trigger language plpgsql security definer set search_path = public, pg_temp
as $function$
begin
  delete from public.location_access_log where user_id = new.id;
  delete from public.location_consents   where user_id = new.id;
  return null;
end $function$;
revoke all on function public._tg_location_purge_on_withdraw() from public, anon, authenticated;
grant execute on function public._tg_location_purge_on_withdraw() to service_role;

drop trigger if exists trg_location_purge_on_withdraw on public.profiles;
create trigger trg_location_purge_on_withdraw
  after update of status on public.profiles
  for each row
  when (new.status::text = 'withdrawn' and old.status::text is distinct from 'withdrawn')
  execute function public._tg_location_purge_on_withdraw();

-- §6 6개월 파기(고시 제6조⑤ 최소 6개월 — 6개월이 지나는 날 지운다)
create or replace function public._purge_location_access_log()
 returns integer language plpgsql security definer set search_path = public, pg_temp
as $function$
declare n integer;
begin
  delete from public.location_access_log where created_at < now() - interval '6 months';
  get diagnostics n = row_count;
  return n;
end $function$;
revoke all on function public._purge_location_access_log() from public, anon, authenticated;
grant execute on function public._purge_location_access_log() to service_role;

do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'purge-location-access-log') then
    perform cron.unschedule('purge-location-access-log');
  end if;
  perform cron.schedule('purge-location-access-log', '10 4 * * *', 'select public._purge_location_access_log()');
end $cron$;

-- §7 자가검사
do $check$
declare d text := pg_get_functiondef('public.check_in(uuid,double precision,double precision,double precision)'::regprocedure);
begin
  if has_function_privilege('anon', 'public.check_in(uuid,double precision,double precision,double precision)', 'execute')
     or not has_function_privilege('authenticated', 'public.check_in(uuid,double precision,double precision,double precision)', 'execute') then
    raise exception '20260926b 자가검사: check_in ACL 이상';
  end if;
  if has_function_privilege('anon', 'public.set_my_location_consent(boolean,integer)', 'execute')
     or has_function_privilege('anon', 'public.get_my_location_consent()', 'execute')
     or has_function_privilege('anon', 'public.get_my_location_access_log(integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.set_my_location_consent(boolean,integer)', 'execute') then
    raise exception '20260926b 자가검사: 본인 RPC ACL 이상';
  end if;
  if has_function_privilege('authenticated', 'public._purge_location_access_log()', 'execute')
     or has_function_privilege('anon', 'public._purge_location_access_log()', 'execute')
     or has_function_privilege('authenticated', 'public._tg_location_purge_on_withdraw()', 'execute') then
    raise exception '20260926b 자가검사: 내부 함수 ACL 이 열려 있습니다';
  end if;
  if has_table_privilege('authenticated', 'public.location_access_log', 'select')
     or has_table_privilege('anon', 'public.location_access_log', 'select')
     or has_table_privilege('authenticated', 'public.location_consents', 'select')
     or has_table_privilege('authenticated', 'public.location_consents', 'insert') then
    raise exception '20260926b 자가검사: 표 직접 권한이 열려 있습니다';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.location_access_log'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.location_consents'::regclass) then
    raise exception '20260926b 자가검사: RLS 꺼짐';
  end if;
  if d not like '%location_access_log%' or d not like '%checkin_geo_enabled%' or d not like '%location_consents%'
     or d not like '%terms_version >= 2%' or d not like '%출석을 처리하지 못했어요%'
     or d like '%if v_geo then return jsonb_build_object(''error'', sqlerrm)%' then
    raise exception '20260926b 자가검사: check_in 본문 이상';
  end if;
  if (select count(*) from cron.job where jobname = 'purge-location-access-log') <> 1 then
    raise exception '20260926b 자가검사: 파기 크론이 없습니다';
  end if;
end $check$;

notify pgrst, 'reload schema';
