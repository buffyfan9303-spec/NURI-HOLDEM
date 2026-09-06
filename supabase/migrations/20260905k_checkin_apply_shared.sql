-- ============================================================================
-- 출석 적용 로직 공유화 + check_in 반환 확장 (모바일 점검 2026-09-05 확정 결함 #2 · #22)
--
-- #2  이용권 사용 트리거(_voucher_used_checkin)가 checkins 를 **직삽입**해 점수 +3·연속 출석·7일 보너스·
--     업주 CRM(customer_profiles) 적재가 전부 빠졌고, 그 행 때문에 같은 자리에서 출석 QR 을 찍으면 check_in 이
--     '4시간 내 중복' 으로 거절했다(순서에 따라 결과가 갈림). → 라이브 check_in 본문의 '행 삽입+점수+스트릭+CRM'
--     을 _apply_checkin(p_venue_id, p_uid) 로 추출하고 check_in 과 트리거가 둘 다 그것을 부른다.
--     라이브 본문에 있던 오픈 이벤트(2026-07-20~08-03, +6·알림) 분기는 종료됐으므로 제거하고 +3 고정.
-- #22 check_in 반환이 매장명뿐이라 같은 날 두 번째 체크인(4h 후)에도 클라가 '+3점' 을 확언했다.
--     → returns jsonb {name, points(이번에 실제 부여된 점수: 0 또는 3 [+10 보너스]), streak(갱신된 연속일)}.
--     반환 타입 변경은 CREATE OR REPLACE 로 불가 → DROP 후 재생성 + ACL 재부여.
--     구형 클라이언트는 문자열을 기대하지만 배포 순서상 클라(정규화 처리)가 먼저 나간다.
--
-- 권한: _apply_checkin 은 내부 전용(SECURITY DEFINER 호출자만) — public/anon/authenticated 전부 회수.
--   check_in: authenticated·service_role. 트리거 함수: service_role 만(라이브 ACL 과 동일).
-- 소급 영향: 데이터 변경 0. 이미 트리거로 들어간 과거 checkins 행의 점수·CRM 은 소급하지 않는다.
-- 롤백: 20260623l_crm_checkin_autoload.sql 의 check_in(returns text) 을 DROP 후 재생성(+ACL),
--   20260623c_ranking_consistency.sql 의 _voucher_used_checkin 재실행(+ACL), drop function public._apply_checkin(uuid, uuid).
-- ============================================================================

-- ── ① 공유 적용 함수 — 행 삽입 · 오늘 첫 체크인 +3 · 연속 출석/7일 +10 · CRM 3단계 적재 ──────────
create or replace function public._apply_checkin(p_venue_id uuid, p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_disp text; v_today_cnt int; v_today date; v_last date; v_streak int; v_pts int := 0;
begin
  v_today := (now() at time zone 'Asia/Seoul')::date;
  select count(*) into v_today_cnt from public.checkins
   where venue_id = p_venue_id and user_id = p_uid
     and created_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  select coalesce(nickname, name) into v_disp from public.profiles where id = p_uid;
  insert into public.checkins(venue_id, user_id, display_name) values (p_venue_id, p_uid, v_disp);
  if v_today_cnt = 0 then
    v_pts := v_pts + 3;
    update public.profiles set activity_points = coalesce(activity_points, 0) + 3 where id = p_uid;
  end if;
  select last_checkin_date, checkin_streak into v_last, v_streak from public.profiles where id = p_uid;
  if v_last is distinct from v_today then
    if v_last = v_today - 1 then v_streak := coalesce(v_streak, 0) + 1; else v_streak := 1; end if;
    v_pts := v_pts + (case when v_streak % 7 = 0 then 10 else 0 end);
    update public.profiles
       set checkin_streak = v_streak,
           last_checkin_date = v_today,
           activity_points = coalesce(activity_points, 0) + (case when v_streak % 7 = 0 then 10 else 0 end)
     where id = p_uid;
  end if;
  -- ── CRM 자동 적재: (1) user_id 행 갱신 → (2) 동명 미연결 행에 연결 → (3) 신규 ──
  update public.customer_profiles
     set visit_count = coalesce(visit_count,0) + 1, last_visit_at = now(),
         name = coalesce(nullif(btrim(name),''), v_disp), updated_at = now()
   where venue_id = p_venue_id and user_id = p_uid;
  if not found then
    update public.customer_profiles
       set user_id = p_uid, visit_count = coalesce(visit_count,0) + 1, last_visit_at = now(), updated_at = now()
     where venue_id = p_venue_id and user_id is null and lower(btrim(name)) = lower(btrim(v_disp));
    if not found then
      insert into public.customer_profiles(venue_id, user_id, name, visit_count, first_visit_at, last_visit_at)
      values (p_venue_id, p_uid, v_disp, 1, now(), now())
      on conflict (venue_id, name) do update
        set user_id = coalesce(public.customer_profiles.user_id, excluded.user_id),
            visit_count = coalesce(public.customer_profiles.visit_count,0) + 1,
            last_visit_at = now(), updated_at = now();
    end if;
  end if;
  return jsonb_build_object('points', v_pts, 'streak', coalesce(v_streak, 0));
end $function$;

revoke all on function public._apply_checkin(uuid, uuid) from public, anon, authenticated;
grant execute on function public._apply_checkin(uuid, uuid) to service_role;

-- ── ② check_in — 로그인 게이트·매장 조회·4시간 중복 raise 유지, 적용은 공유 함수로. returns jsonb ─────
drop function if exists public.check_in(uuid);
create or replace function public.check_in(p_venue_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_name text; v_recent timestamptz;
begin
  if auth.uid() is null then raise exception '로그인 후 체크인할 수 있습니다'; end if;
  select name into v_name from public.venues where id = p_venue_id;
  if v_name is null then raise exception '매장을 찾을 수 없습니다'; end if;
  select created_at into v_recent from public.checkins
   where venue_id = p_venue_id and user_id = auth.uid() order by created_at desc limit 1;
  if v_recent is not null and v_recent > now() - interval '4 hours' then
    raise exception '이미 체크인했습니다 (4시간 내 중복 방지)';
  end if;
  return public._apply_checkin(p_venue_id, auth.uid()) || jsonb_build_object('name', v_name);
end $function$;

revoke all on function public.check_in(uuid) from public, anon;
grant execute on function public.check_in(uuid) to authenticated, service_role;

-- ── ③ 이용권 사용 트리거 — 4시간 내 기존 행이 있으면 skip(raise 아님: 이용권 사용을 막지 않는다), 없으면 공유 적용 ──
create or replace function public._voucher_used_checkin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.status = 'used' and (old.status is distinct from 'used') and new.holder_user_id is not null then
    if not exists (
      select 1 from public.checkins
      where venue_id = coalesce(new.used_venue_id, new.venue_id) and user_id = new.holder_user_id
        and created_at > now() - interval '4 hours'
    ) then
      perform public._apply_checkin(coalesce(new.used_venue_id, new.venue_id), new.holder_user_id);
    end if;
  end if;
  return new;
end $function$;

revoke all on function public._voucher_used_checkin() from public, anon, authenticated;
grant execute on function public._voucher_used_checkin() to service_role;
