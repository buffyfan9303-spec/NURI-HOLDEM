-- ⏳ 미적용 초안 (store-team 2026-10-04) — 적용은 리드가 critical-reviewer 반증 뒤에 MCP execute_sql 로 한 번에. 리허설: supabase/tests/20261004d_rehearsal.sql
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
--   2. set_venue_checkin_geo_required(uuid, boolean) — can_manage_venue(소유·승인 공동운영자·관리자) + 활성 계정. 켤 때는 매장 좌표가 있어야 한다.
--      (venues_update 정책으로 업주가 자기 매장 행을 직접 고치는 길도 있다 — 같은 권한이라 막지 않는다. 좌표 없이 켜면 그 매장 손님이
--       '출석 위치가 등록되지 않았어요'로 막힐 뿐이고 화면은 RPC 만 쓴다.)
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
-- 위치 거부 손님의 대체 경로(오너 결정 (다)-(a)): request_buyin(참가 신청 → 운영자 승인)·직원 장부 직접 입력은 위치와 무관하다 — 이 파일은 그 함수들을 건드리지 않는다.
--
-- 되돌리기(한 트랜잭션): check_in 을 20260930f §4 본문으로 create or replace(같은 시그니처 → ACL 보존) ·
--   drop function public.set_venue_checkin_geo_required(uuid, boolean) · drop function public._checkin_geo_required_from() ·
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
  if to_regprocedure('public.can_manage_venue(uuid)') is null or to_regprocedure('public.is_account_active()') is null then
    raise exception '20261004d: 선행 함수(can_manage_venue·is_account_active)가 없습니다';
  end if;
end $pre$;

-- §1 매장 스위치
alter table public.venues add column if not exists checkin_geo_required boolean not null default false;
comment on column public.venues.checkin_geo_required is
  '위치 확인 출석(20261004d). true 이고 운영 스위치 checkin_geo_enabled=on 일 때만 check_in 이 위치를 쓴다. _checkin_geo_required_from() 이후에는 동의·좌표가 없으면 거부.';

-- §2 확인자료 칸 주석(스키마 변경 없음)
comment on column public.location_access_log.purpose is
  '위치정보법 제2조제5호 이용·제공방법을 겸한다: checkin_radius = 서버에서 매장 반경 판정 후 좌표 즉시 파기(출석 위치 확인) · self_view = 본인 열람(고시 제6조①2호).';

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
  if not coalesce(public.can_manage_venue(p_venue_id), false) then raise exception '권한이 없습니다'; end if;
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
  v_venue_geo := coalesce(v_venue_geo, false)
    and exists (select 1 from public.app_settings where key = 'checkin_geo_enabled' and value = 'on');
  -- 약관판 3 = src/lib/locationTerms.ts LOCATION_TERMS_VERSION. 판을 올리면 이 숫자도 같은 배포에서 올린다(법 제15조① — 동의 없으면 좌표를 쓰지 않는다).
  v_consent := v_venue_geo
    and exists (select 1 from public.location_consents where user_id = auth.uid() and granted and terms_version >= 3);

  -- 20261004d: 시행일(D) 뒤 켠 매장은 동의·좌표 없는 QR 출석을 받지 않는다. 위치를 쓰지 않았으므로 확인자료도 없다.
  --   대체 경로(직원 장부·request_buyin)는 위치와 무관하다 — 문구로 안내한다.
  if v_venue_geo and now() >= public._checkin_geo_required_from() then
    if not v_consent then
      return jsonb_build_object('code', 'geo_consent_required', 'error',
        '위치 확인 출석 매장이라 위치정보 이용에 동의해야 QR 출석이 됩니다. 동의하지 않으시면 매장 직원에게 참가를 요청하거나 오늘 대회의 참가 신청을 이용해 주세요');
    end if;
    if p_lat is null and p_lng is null then
      return jsonb_build_object('code', 'geo_position_required', 'error',
        '위치 확인 출석 매장이라 현재 위치를 확인해야 QR 출석이 됩니다. 위치를 켤 수 없으면 매장 직원에게 참가를 요청하거나 오늘 대회의 참가 신청을 이용해 주세요');
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
     or d not like '%checkin_geo_required into%'
     or d not like '%is_account_active()%' or d not like '%출석을 처리하지 못했어요%' then
    raise exception '20261004d 자가검사: check_in 본문 이상';
  end if;
  -- 위치를 쓰지 않은 거부(동의·좌표 없음)는 확인자료 insert 보다 **앞에서** 돌아가야 한다(쓰지 않은 위치를 기록하지 않는다).
  if position('geo_position_required' in d) > position('insert into public.location_access_log' in d) then
    raise exception '20261004d 자가검사: 위치 미사용 거부가 확인자료 기록 뒤에 있습니다';
  end if;
end $check$;

notify pgrst, 'reload schema';
