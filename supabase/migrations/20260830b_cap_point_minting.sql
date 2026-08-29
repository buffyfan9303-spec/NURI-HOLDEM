-- 20260830b — 발권 상한. 소비 경제(20260830a)를 세우고 나니 '얼마나 벌 수 있나'가
-- 운영자 설정값에 무제한으로 열려 있는 게 드러났다. 소비처에 가격을 매겨도
-- 발권이 무제한이면 가격은 의미가 없다.
--
-- 두 경로 모두 **매장주가 값을 정하고 서버가 그대로 믿는** 구조였다:
--   (1) venues.page_config.placementPoints — [99999] 로 두면 순위 입력만으로 무제한 발권.
--       게다가 음수를 넣으면 남의 점수를 깎을 수 있었다(greatest 로 0 바닥만 있고 입력 검증이 없다).
--   (2) custom_missions.reward — 임의 값. 적용 시점 최대 30 이지만 상한이 없다.
-- 적용 시점에 배점을 설정한 매장은 0곳, 미션 최대 보상 30 — 악용된 흔적은 없다.
-- 매장이 늘기 전에 닫는다.
--
-- 실측(적용 후): 99999 -> 100, -50 -> 0, 정상값 7 -> 7 그대로. 보상 5000 삽입 거부, 150 통과.

-- (1) 순위 배점 — [0, 100] 으로 죈다.
--     기본 1위가 10점이니 100은 큰 대회를 위한 10배 여유이면서 대량 발권은 불가능한 선이다.
--     음수는 0 으로 — '순위에 올렸는데 점수가 깎이는' 동작은 어떤 설정으로도 나오면 안 된다.
create or replace function public.placement_points(p_venue_id uuid, p_position integer)
returns integer
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select least(100, greatest(0, case
    when pp is not null and jsonb_typeof(pp)='array' and jsonb_array_length(pp) > 0 then
      case when p_position between 1 and jsonb_array_length(pp)
           then coalesce((pp->>(p_position-1))::int, 1) else 1 end
    else case p_position when 1 then 10 when 2 then 7 when 3 then 5 when 4 then 3 when 5 then 2 else 1 end
  end))
  from (select (select page_config->'placementPoints' from public.venues where id=p_venue_id) as pp) s;
$function$;

-- (2) 커스텀 미션 보상 — 새 행은 [0, 200] 만 허용(외치기 기본 1회분이 천장).
--     기존 행(최대 30)은 전부 통과하므로 데이터 손실 없음.
alter table public.custom_missions drop constraint if exists custom_missions_reward_cap;
alter table public.custom_missions add constraint custom_missions_reward_cap
  check (reward is null or (reward >= 0 and reward <= 200));

-- 읽는 쪽에서도 죈다 — 제약 도입 이전에 들어간 행이나 제약을 우회한 경로가 있어도
-- 지급 순간에 한 번 더 막힌다(방어선을 한 겹만 두지 않는다).
create or replace function public.claim_mission(p_key text)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_week date; v_ok boolean := false; v_reward int := 0; v_nick text;
  v_cm record; v_goal int; v_type text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  v_week := (date_trunc('week', (now() at time zone 'Asia/Seoul')::timestamp))::date;
  if exists (select 1 from mission_claims where user_id = auth.uid() and mission_key = p_key and week_start = v_week) then
    raise exception '이미 받은 보상입니다';
  end if;
  select coalesce(nickname, name) into v_nick from profiles where id = auth.uid();

  if p_key like 'c%' and p_key ~ '^c[0-9]+$' then
    select * into v_cm from custom_missions where id = substring(p_key from 2)::int and active = true;
    if v_cm is null then raise exception '종료된 미션입니다'; end if;
    -- 매장주가 정한 값이라 그대로 믿지 않는다(상한 200)
    v_reward := least(200, greatest(0, coalesce(v_cm.reward, 0)));
    v_goal := v_cm.goal; v_type := v_cm.goal_type;
  elsif p_key = 'checkin2' then v_reward := 20; v_goal := 2; v_type := 'checkin';
  elsif p_key = 'post1' then v_reward := 10; v_goal := 1; v_type := 'post';
  elsif p_key = 'moneyin1' then v_reward := 30; v_goal := 1; v_type := 'moneyin';
  else raise exception '알 수 없는 미션입니다';
  end if;

  if v_type = 'checkin' then
    select count(*) >= v_goal into v_ok from checkins
     where user_id = auth.uid() and created_at >= (v_week::timestamp at time zone 'Asia/Seoul');
  elsif v_type = 'post' then
    select count(*) >= v_goal into v_ok from community_posts
     where user_id = auth.uid() and created_at >= (v_week::timestamp at time zone 'Asia/Seoul');
  else
    select count(*) >= v_goal into v_ok from venue_rankings
     where lower(nickname) = lower(v_nick) and ranking_date >= v_week;
  end if;
  if not v_ok then raise exception '아직 미션을 달성하지 못했습니다'; end if;
  insert into mission_claims(user_id, mission_key, week_start) values (auth.uid(), p_key, v_week);
  update profiles set activity_points = coalesce(activity_points, 0) + v_reward where id = auth.uid();
  return format('+%s점 지급 완료!', v_reward);
end $function$;

revoke all on function public.claim_mission(text) from public, anon;
grant execute on function public.claim_mission(text) to authenticated, service_role;
revoke all on function public.placement_points(uuid, integer) from public, anon;
grant execute on function public.placement_points(uuid, integer) to authenticated, service_role;
