-- ① 출석 스트릭: 연속 체크인 일수(전 매장 기준, KST). 7일 연속마다(7,14,21…) 활동점수 +10
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS checkin_streak int NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_checkin_date date;

CREATE OR REPLACE FUNCTION public.check_in(p_venue_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_name text; v_disp text; v_recent timestamptz; v_today_cnt int;
  v_today date; v_last date; v_streak int;
begin
  if auth.uid() is null then raise exception '로그인 후 체크인할 수 있습니다'; end if;
  select name into v_name from public.venues where id = p_venue_id;
  if v_name is null then raise exception '매장을 찾을 수 없습니다'; end if;
  select created_at into v_recent from public.checkins where venue_id = p_venue_id and user_id = auth.uid() order by created_at desc limit 1;
  if v_recent is not null and v_recent > now() - interval '4 hours' then
    raise exception '이미 체크인했습니다 (4시간 내 중복 방지)';
  end if;
  v_today := (now() at time zone 'Asia/Seoul')::date;
  -- 오늘 이 매장 체크인 여부 — 도장 점수(+3)는 매장당 하루 1회
  select count(*) into v_today_cnt from public.checkins
   where venue_id = p_venue_id and user_id = auth.uid()
     and created_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  select coalesce(nickname, name) into v_disp from public.profiles where id = auth.uid();
  insert into public.checkins(venue_id, user_id, display_name) values (p_venue_id, auth.uid(), v_disp);
  if v_today_cnt = 0 then
    update public.profiles set activity_points = coalesce(activity_points, 0) + 3 where id = auth.uid();
  end if;
  -- 출석 스트릭(전 매장 기준 하루 1회): 어제도 체크인했으면 +1, 끊겼으면 1로 리셋. 7의 배수 달성 시 +10
  select last_checkin_date, checkin_streak into v_last, v_streak from public.profiles where id = auth.uid();
  if v_last is distinct from v_today then
    if v_last = v_today - 1 then v_streak := coalesce(v_streak, 0) + 1; else v_streak := 1; end if;
    update public.profiles
       set checkin_streak = v_streak,
           last_checkin_date = v_today,
           activity_points = coalesce(activity_points, 0) + (case when v_streak % 7 = 0 then 10 else 0 end)
     where id = auth.uid();
  end if;
  return v_name;
end $function$;
REVOKE EXECUTE ON FUNCTION public.check_in(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_in(uuid) TO authenticated;

-- ② 클라이언트 에러 수집: 쓰기는 모두(비로그인 포함), 읽기/삭제는 관리자만
CREATE TABLE IF NOT EXISTS public.client_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  message text NOT NULL,
  stack text,
  url text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_errors_insert ON public.client_errors;
CREATE POLICY client_errors_insert ON public.client_errors FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS client_errors_admin_select ON public.client_errors;
CREATE POLICY client_errors_admin_select ON public.client_errors FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS client_errors_admin_delete ON public.client_errors;
CREATE POLICY client_errors_admin_delete ON public.client_errors FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
