-- ✅ **2026-09-23 라이브 적용 완료** (project idsxiqspecrucvfvtgbw · MCP execute_sql · begin…commit, 자가검사 통과 · notify pgrst)
--   적용 후: check_in(uuid,float8,float8,float8) md5 bc8244cd0a4b2858eff33efdcf0f0eab · ACL {postgres, authenticated, service_role}
--            옛 check_in(uuid) 제거(적용 전 md5 c8ec9b7b…) · set_venue_coords md5 1108f1d5… ACL 동일
--   PostgREST 실측: 옛 번들 형태 {p_venue_id} 만 보낸 비로그인 호출 → 42501 permission denied(함수 해석 OK, PGRST202 아님)
--   롤백 리허설(일반 사용자 47360d8e·fd14c2dc, 로티아레나에 임시 좌표 37.5/127.0):
--     T1 좌표 없는 매장 + 좌표 전송 → '출석 위치가 등록되지 않았어요' · T2 5.5km → '매장 근처에서만' · T3 오차 5000 → '정확도 낮아요'
--     T4 위도만 → '위치 값이 올바르지 않아요' · T5 445m 오차0 → 거부 · T6 445m 오차200 → 통과(checkins 0→1)
--     T7 좌표 없는 옛 호출 → 통과 · T8 비로그인 → 42501 · 리허설 후 ACL {postgres, authenticated, service_role}
--
-- 20260923b — 출석 위치 확인 1단계(CHECKIN-GEO). 오너 결정 2026-09-23:
--   반경 300m + 폰이 알려준 오차를 최대 200m 까지 보정 · 오차 1km 초과는 거부 · 매장 좌표가 없으면 차단.
--
-- 왜: check_in 은 매장 id 만 받아, 주소(/?checkin=<id>)만 알면 집에서 매일 출석·이벤트 카드(→매장이용권)를 받을 수 있었다.
--
-- 무중단 3단계(store-team 설계, 기억 checkin_geo_design_2026-09-23.md)
--   1단계(이 파일): 좌표 인자를 **선택**으로 추가. 좌표가 오면 검사, 안 오면 통과 → 지금 운영 번들(좌표 안 보냄)에 영향 0.
--   2단계: 클라이언트가 좌표를 보낸다(매장 좌표가 채워진 뒤 배포).
--   3단계: 좌표 없는 호출을 거부(옛 번들 소멸 뒤, CREATE OR REPLACE — 같은 시그니처라 ACL 보존).
--
-- 🔴 오버로드 금지: check_in(uuid) 와 check_in(uuid,float8,float8,float8) 를 공존시키면 인자 하나짜리 호출이
--    어느 함수인지 모호해진다(PGRST203). → DROP 후 기본값 인자로 재생성, 한 트랜잭션.
-- 🔴 DROP + 재생성은 ACL 을 초기화한다(PUBLIC·anon 실행 부활 — store-team 리허설에서 실측). REVOKE/GRANT 필수.
-- 한계: 위조 GPS(모의 위치)는 서버가 막을 수 없다. "주소만 알면 집에서" 수준을 막는 장치다.
-- 원좌표는 저장하지 않는다(개인정보). 판정에만 쓴다.

drop function if exists public.check_in(uuid);

create function public.check_in(
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
begin
  if auth.uid() is null then raise exception '로그인 후 체크인할 수 있습니다'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_venue_id::text, 0));
  select name, lat, lng into v_name, v_vlat, v_vlng from public.venues where id = p_venue_id;
  if v_name is null then raise exception '매장을 찾을 수 없습니다'; end if;

  -- 위치 확인 — 1단계: 좌표가 온 호출만 검사한다(3단계에서 좌표 없는 호출도 거부로 바뀐다).
  if p_lat is not null or p_lng is not null then
    if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180
       or (p_accuracy is not null and p_accuracy < 0) then
      raise exception '위치 값이 올바르지 않아요';
    end if;
    if coalesce(p_accuracy, 0) > 1000 then
      raise exception '위치 정확도가 낮아요. 매장 안에서 다시 시도해 주세요';
    end if;
    if v_vlat is null or v_vlng is null then
      raise exception '이 매장은 아직 출석 위치가 등록되지 않았어요. 매장에 문의해 주세요';
    end if;
    v_dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(p_lat - v_vlat) / 2), 2)
      + cos(radians(v_vlat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - v_vlng) / 2), 2)));
    if v_dist > 300 + least(coalesce(p_accuracy, 0), 200) then
      raise exception '매장 근처에서만 출석할 수 있어요';
    end if;
  end if;

  select created_at into v_recent from public.checkins
   where venue_id = p_venue_id and user_id = auth.uid() order by created_at desc limit 1;
  if v_recent is not null and v_recent > now() - interval '4 hours' then
    raise exception '이미 체크인했습니다 (4시간 내 중복 방지)';
  end if;
  return public._apply_checkin(p_venue_id, auth.uid()) || jsonb_build_object('name', v_name);
end $function$;

revoke all on function public.check_in(uuid, double precision, double precision, double precision) from public, anon;
grant execute on function public.check_in(uuid, double precision, double precision, double precision) to authenticated, service_role;

-- set_venue_coords 가드를 NULL-safe 로(현재 can_manage_venue(비로그인)=false 라 열려 있진 않지만 표준 3).
create or replace function public.set_venue_coords(p_venue_id uuid, p_lat double precision, p_lng double precision)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if not coalesce(public.can_manage_venue(p_venue_id), false) then raise exception '권한이 없습니다'; end if;
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception '좌표 값이 올바르지 않습니다';
  end if;
  update public.venues set lat = p_lat, lng = p_lng where id = p_venue_id;
end $function$;
revoke all on function public.set_venue_coords(uuid, double precision, double precision) from public, anon;
grant execute on function public.set_venue_coords(uuid, double precision, double precision) to authenticated, service_role;

do $$
begin
  if to_regprocedure('public.check_in(uuid)') is not null then raise exception 'self-check: 옛 check_in(uuid) 가 남아 오버로드된다'; end if;
  if has_function_privilege('anon', 'public.check_in(uuid,double precision,double precision,double precision)', 'execute') then
    raise exception 'self-check: check_in anon 실행 가능';
  end if;
  if not has_function_privilege('authenticated', 'public.check_in(uuid,double precision,double precision,double precision)', 'execute') then
    raise exception 'self-check: check_in authenticated 실행 불가';
  end if;
end $$;

notify pgrst, 'reload schema';
