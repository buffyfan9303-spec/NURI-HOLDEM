-- 운영자 커스텀 미션: 고정 3종 외 추가/보상 조정(랭킹 허브 미션 보드에 병합 노출).
-- 적용일: 2026-06-11 (apply_migration 'custom_missions')
CREATE TABLE IF NOT EXISTS public.custom_missions (
  id serial PRIMARY KEY,
  title text NOT NULL,
  goal_type text NOT NULL CHECK (goal_type IN ('checkin','post','moneyin')),
  goal int NOT NULL CHECK (goal BETWEEN 1 AND 50),
  reward int NOT NULL CHECK (reward BETWEEN 1 AND 500),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.custom_missions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS custom_missions_read ON public.custom_missions;
CREATE POLICY custom_missions_read ON public.custom_missions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS custom_missions_admin_write ON public.custom_missions;
CREATE POLICY custom_missions_admin_write ON public.custom_missions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- claim_mission 확장: p_key 'c<id>' = 커스텀 미션. 유형(goal_type)별 동일 서버 검증,
-- 비활성/삭제된 미션은 거부. 고정 3종(checkin2/post1/moneyin1)은 기존 규칙 유지.
CREATE OR REPLACE FUNCTION public.claim_mission(p_key text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    v_reward := v_cm.reward; v_goal := v_cm.goal; v_type := v_cm.goal_type;
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
