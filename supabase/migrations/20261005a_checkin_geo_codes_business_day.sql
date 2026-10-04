-- ⏳ 미적용 초안 (store-team 2026-10-05) — 적용은 리드가 critical 반증 뒤 MCP execute_sql 로. 리허설: supabase/tests/20261004d_rehearsal.sql(20261005a 를 감지해 기대값을 바꾼다)
-- 20261005a — 위치 확인 출석 후속(critical 반증 2026-10-05 P2·P3-c·P3-d). 20261004d(✅ 2026-10-05 적용) 본문을 그대로 가져와 아래만 바꾼다.
--
-- P2   check_in: 위치 확인 출석 매장에서 반경 밖·정확도 낮음 거부에 code 를 붙인다 — 'geo_out_of_range' · 'geo_low_accuracy'.
--      그전에는 code 없이 {error} 만 와서 클라가 토스트만 띄웠고, 재시도 시트의 '출석 요청 보내기'(대체 경로)가 보이지 않았다.
--      문구·확인자료(좌표를 쓴 호출 1행)·판정 순서는 그대로다. 옛 번들은 모르는 code 를 무시하고 error 를 토스트로 보여 준다(호환).
-- P3-c request_checkin·staff_check_in: 요청 날짜 = ledger_business_date(영업일). 자정 넘긴 토너에서 23:50 요청을 00:10 에 승인할 수 있다.
--      staff_check_in 은 KST 오늘 또는 영업일 요청을 인정한다(참가 신청과 같은 축). 하루 1회·5곳 상한도 같은 두 날짜로 센다.
-- P3-d request_checkin: can_manage_pos(대표·승인 공동 운영자·관리자)는 자기 매장에 요청할 수 없다(critical X10 — 운영자끼리 서로 승인).
--
-- 되돌리기: 세 함수를 20261004d 본문으로 create or replace(같은 시그니처 → ACL 보존). 표·데이터 변경 없음.
--
-- 리허설(2026-10-05, 라이브 = 20261004d 적용 상태 · 암묵 트랜잭션 롤백): 이 파일 + supabase/tests/20261004d_rehearsal.sql → 42/42 PASS
--   (기존 39 + G1 정확도 code · B1 영업일 요청·승인 · D1 운영자 요청 거부). 4d 단독 39/39(5a 전용 3건 SKIP). 뒤이어 프로브 표 없음·라이브 함수 그대로.
--   음성 대조: 반경 밖 code 제거 → 자가검사 거부 · +자가검사 제거 → N4·P5 FAIL · 운영자 거부 제거 → D1 · 영업일 승인 제거 → B1 · 정확도 code 제거 → G1.

-- §0 적용 전 게이트 — 라이브 세 함수가 20261004d 적용 본문(2026-10-05 리드 실측 md5(prosrc))이거나 이 파일의 본문이어야 한다.
--   다른 본문이면(그 사이 누가 바꿨다) 덮어쓰지 않고 멈춘다. 재적용이면 통과.
do $pre$
declare
  ci text := (select prosrc from pg_proc where oid = 'public.check_in(uuid,double precision,double precision,double precision)'::regprocedure);
  rq text := (select prosrc from pg_proc where oid = 'public.request_checkin(uuid)'::regprocedure);
  st text := (select prosrc from pg_proc where oid = 'public.staff_check_in(uuid,uuid)'::regprocedure);
begin
  if to_regclass('public.checkin_requests') is null then raise exception '20261005a: checkin_requests 가 없습니다(20261004d 미적용)'; end if;
  if not (md5(ci) = 'fb6a1a319b663b0bb18bfa565b10f27a' or ci like '%''code'', ''geo_out_of_range''%') then
    raise exception '20261005a: check_in 라이브 본문이 20261004d 적용본이 아닙니다(md5 %)', md5(ci);
  end if;
  if not (md5(rq) = 'ffe52bbcea88e2ded23a38acbf2befaf' or rq like '%v_disp, v_biz)%') then
    raise exception '20261005a: request_checkin 라이브 본문이 20261004d 적용본이 아닙니다(md5 %)', md5(rq);
  end if;
  if not (md5(st) = '0bcef09e166f9d170b814007b4a80095' or st like '%r.request_date in (v_today, v_biz)%') then
    raise exception '20261005a: staff_check_in 라이브 본문이 20261004d 적용본이 아닙니다(md5 %)', md5(st);
  end if;
end $pre$;

-- §1 check_in (P2)
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
      -- 20261005a P2: code 를 붙여 클라가 재시도 시트(출석 요청 버튼)를 연다. 확인자료(위 insert)는 이미 남았다 — 예외가 아니라 반환.
      return jsonb_build_object('code', 'geo_low_accuracy', 'error', '위치 정확도가 낮아요. 매장 안에서 다시 시도해 주세요');
    elsif v_vlat is null or v_vlng is null then
      v_err := '이 매장은 아직 출석 위치가 등록되지 않았어요. 매장에 문의해 주세요';
    else
      v_dist := 2 * 6371000 * asin(sqrt(
        power(sin(radians(p_lat - v_vlat) / 2), 2)
        + cos(radians(v_vlat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - v_vlng) / 2), 2)));
      if v_dist > 300 + least(coalesce(p_accuracy, 0), 200) then
        return jsonb_build_object('code', 'geo_out_of_range', 'error', '매장 근처에서만 출석할 수 있어요');
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

-- §2 request_checkin (P3-c·P3-d)
create or replace function public.request_checkin(p_venue_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_today date := (now() at time zone 'Asia/Seoul')::date; v_biz date;
  v_name text; v_geo boolean; v_approved boolean; v_recent timestamptz; v_status text; v_cnt int; v_disp text;
begin
  if auth.uid() is null then raise exception '로그인 후 출석 요청을 보낼 수 있습니다'; end if;
  if p_venue_id is null then raise exception '요청 값이 올바르지 않습니다'; end if;
  if not public.is_account_active() then raise exception '제재 중이거나 비활성화된 계정은 이용할 수 없습니다'; end if;
  select name, checkin_geo_required, approved into v_name, v_geo, v_approved from public.venues where id = p_venue_id;
  if v_name is null or v_approved is distinct from true then raise exception '매장을 찾을 수 없습니다'; end if;
  -- 요청은 위치 확인 출석 매장에서만 받는다 — 그 밖의 매장은 QR 출석에 위치가 필요 없다(요청 남발 표면을 줄인다).
  if v_geo is distinct from true then raise exception '이 매장은 QR로 바로 출석할 수 있습니다'; end if;
  -- 20261005a P3-d: 운영자(can_manage_pos)는 요청할 수 없다 — 운영자끼리 서로 승인해 위치 확인을 건너뛰는 길을 막는다(critical X10).
  if coalesce(public.can_manage_pos(p_venue_id), false) then raise exception '매장 운영자는 출석 요청 대신 매장 출석 QR로 출석해 주세요'; end if;
  -- 20261005a P3-c: 요청 날짜 = 영업일(자정 넘긴 토너는 어제 영업일) — 장부·참가 신청(request_buyin)과 같은 날짜 축.
  v_biz := public.ledger_business_date(p_venue_id);
  -- check_in·staff_check_in 과 같은 잠금 키 — 동시에 온 출석·요청이 한 줄로 선다
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_venue_id::text, 0));
  select created_at into v_recent from public.checkins
   where venue_id = p_venue_id and user_id = auth.uid() order by created_at desc limit 1;
  if v_recent is not null and v_recent > now() - interval '4 hours' then
    raise exception '이미 체크인했습니다 (4시간 내 중복 방지)';
  end if;
  -- 1일 1매장 1회 — 이미 보냈으면 새로 만들지 않고 그 상태를 돌려준다(버튼 연타·재시도도 행 1개)
  select status into v_status from public.checkin_requests
   where venue_id = p_venue_id and user_id = auth.uid() and request_date in (v_today, v_biz)
   order by (status = 'pending') desc limit 1;
  if v_status is not null then
    return jsonb_build_object('status', v_status, 'already', true, 'name', v_name);
  end if;
  select count(*) into v_cnt from public.checkin_requests where user_id = auth.uid() and request_date in (v_today, v_biz);
  if v_cnt >= 5 then raise exception '출석 요청은 하루 5곳까지 보낼 수 있습니다'; end if;
  select coalesce(nullif(btrim(nickname), ''), nullif(btrim(name), ''), '회원') into v_disp from public.profiles where id = auth.uid();
  insert into public.checkin_requests (venue_id, user_id, display_name, request_date)
  values (p_venue_id, auth.uid(), v_disp, v_biz);
  delete from public.checkin_requests where request_date < v_today - 30; -- 목적이 끝난 요청은 보관하지 않는다
  return jsonb_build_object('status', 'pending', 'already', false, 'name', v_name);
end $function$;
revoke all on function public.request_checkin(uuid) from public, anon;
grant execute on function public.request_checkin(uuid) to authenticated, service_role;

-- §3 staff_check_in (P3-c)
create or replace function public.staff_check_in(p_venue_id uuid, p_user_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_name text; v_recent timestamptz; v_res jsonb; v_today date := (now() at time zone 'Asia/Seoul')::date; v_biz date;
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
  v_biz := public.ledger_business_date(p_venue_id); -- 20261005a P3-c: 요청·참가 신청 날짜는 KST 오늘 또는 영업일
  -- v3(오너 B 2026-10-05): 손님이 **오늘 이 매장에** 먼저 손을 든 경우만 — 출석 요청(대기) 또는 앱 참가 신청(request_buyin 행).
  --   이용권 사용 행(voucher_id)은 손님 요청이 아닐 수 있어 넣지 않는다. 참가 신청 날짜는 영업일(자정 넘긴 토너)도 인정한다.
  if not exists (select 1 from public.checkin_requests r
                  where r.venue_id = p_venue_id and r.user_id = p_user_id and r.request_date in (v_today, v_biz) and r.status = 'pending')
     and not exists (select 1 from public.ledger_buyin_requests b
                      where b.venue_id = p_venue_id and b.user_id = p_user_id and b.voucher_id is null
                        and b.session_date in (v_today, v_biz)) then
    raise exception '오늘 이 매장에 출석 요청이나 참가 신청을 보낸 손님만 출석 처리할 수 있습니다';
  end if;
  v_res := public._apply_checkin(p_venue_id, p_user_id);
  update public.checkin_requests set status = 'approved', decided_at = now(), decided_by = auth.uid()
   where venue_id = p_venue_id and user_id = p_user_id and request_date in (v_today, v_biz) and status = 'pending';
  perform public._audit('staff_check_in', p_venue_id::text, jsonb_build_object('user_id', p_user_id));
  return v_res || jsonb_build_object('name', v_name);
end $function$;
revoke all on function public.staff_check_in(uuid, uuid) from public, anon;
grant execute on function public.staff_check_in(uuid, uuid) to authenticated, service_role;

-- §4 자가검사 — 본문 코드에만 있는 문자열로 고른다
do $check$
declare ci text := pg_get_functiondef('public.check_in(uuid,double precision,double precision,double precision)'::regprocedure);
  rq text := pg_get_functiondef('public.request_checkin(uuid)'::regprocedure);
  st text := pg_get_functiondef('public.staff_check_in(uuid,uuid)'::regprocedure);
begin
  if ci not like '%''code'', ''geo_out_of_range''%' or ci not like '%''code'', ''geo_low_accuracy''%'
     or ci not like '%''geo_consent_required''%' or ci not like '%''geo_position_required''%' or ci not like '%terms_version >= 3%'
     or position('''geo_out_of_range''' in ci) < position('insert into public.location_access_log' in ci) then
    raise exception '20261005a 자가검사: check_in 거부 code 이상(또는 확인자료 기록 앞에서 돌아간다)';
  end if;
  if rq not like '%coalesce(public.can_manage_pos(p_venue_id), false) then raise exception%' or rq not like '%values (p_venue_id, auth.uid(), v_disp, v_biz)%' then
    raise exception '20261005a 자가검사: request_checkin 운영자 거부·영업일 이상';
  end if;
  if st not like '%r.request_date in (v_today, v_biz) and r.status = ''pending''%' or st not like '%b.session_date in (v_today, v_biz)%'
     or position('from public.checkin_requests r' in st) > position('v_res := public._apply_checkin' in st) then
    raise exception '20261005a 자가검사: staff_check_in 요청 게이트 이상';
  end if;
  if has_function_privilege('anon', 'public.check_in(uuid,double precision,double precision,double precision)', 'execute')
     or has_function_privilege('anon', 'public.request_checkin(uuid)', 'execute') or has_function_privilege('anon', 'public.staff_check_in(uuid,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.request_checkin(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.staff_check_in(uuid,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.check_in(uuid,double precision,double precision,double precision)', 'execute') then
    raise exception '20261005a 자가검사: ACL 이상';
  end if;
end $check$;

notify pgrst, 'reload schema';
