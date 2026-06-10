-- 출석 도장: QR 체크인 성공 시 활동점수 +3 (같은 매장 하루 1회만 적립; 4시간 중복방지는 기존대로)
CREATE OR REPLACE FUNCTION public.check_in(p_venue_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_name text; v_disp text; v_recent timestamptz; v_today_cnt int;
begin
  if auth.uid() is null then raise exception '로그인 후 체크인할 수 있습니다'; end if;
  select name into v_name from public.venues where id = p_venue_id;
  if v_name is null then raise exception '매장을 찾을 수 없습니다'; end if;
  select created_at into v_recent from public.checkins where venue_id = p_venue_id and user_id = auth.uid() order by created_at desc limit 1;
  if v_recent is not null and v_recent > now() - interval '4 hours' then
    raise exception '이미 체크인했습니다 (4시간 내 중복 방지)';
  end if;
  -- 오늘(KST) 이 매장에 이미 체크인했는지 — 도장 점수는 하루 1회만
  select count(*) into v_today_cnt from public.checkins
   where venue_id = p_venue_id and user_id = auth.uid()
     and created_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  select coalesce(nickname, name) into v_disp from public.profiles where id = auth.uid();
  insert into public.checkins(venue_id, user_id, display_name) values (p_venue_id, auth.uid(), v_disp);
  if v_today_cnt = 0 then
    update public.profiles set activity_points = coalesce(activity_points, 0) + 3 where id = auth.uid();
  end if;
  return v_name;
end $function$;
REVOKE EXECUTE ON FUNCTION public.check_in(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_in(uuid) TO authenticated;
