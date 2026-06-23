-- 2026-06-23 순위/이용권 정합성 단일화 (감사 #3, #4, #8)
-- 적대 검증 3렌즈 통과(divergence 0, intended 3변경만): 트리거 used_venue_id / prize=parse_prize_man / 등수=placement_points.

-- #4 prize 파싱 단일화: 콤마 제거 후 '첫 숫자군(소수 허용)' 반올림 — 클라 parsePrizeMan 과 동일.
create or replace function public.parse_prize_man(p_prize text)
returns integer language sql immutable set search_path = public, pg_temp as $$
  select coalesce(round(substring(replace(coalesce(p_prize,''),',','') from '[0-9]+(?:\.[0-9]+)?')::numeric)::int, 0);
$$;

-- #8 등수 점수 단일화: venues.page_config->placementPoints(number[]) 적용 — 클라 placementPointsOf 와 동일.
--   배열 있으면 pos∈[1,len] → arr[pos-1](null→1), 그 외 → 1. 미설정/빈배열 → 기존 10/7/5/3/2/1 폴백(무변경).
create or replace function public.placement_points(p_venue_id uuid, p_position int)
returns integer language sql stable set search_path = public, pg_temp as $$
  select case
    when pp is not null and jsonb_typeof(pp)='array' and jsonb_array_length(pp) > 0 then
      case when p_position between 1 and jsonb_array_length(pp)
           then coalesce((pp->>(p_position-1))::int, 1) else 1 end
    else case p_position when 1 then 10 when 2 then 7 when 3 then 5 when 4 then 3 when 5 then 2 else 1 end
  end
  from (select (select page_config->'placementPoints' from public.venues where id=p_venue_id) as pp) s;
$$;

-- #3 이용권 사용 출석 체크인을 '사용매장' 기준으로 통일(장부요청 트리거와 동일). 사용≠발급 시 엉뚱한 매장 기록 방지.
create or replace function public._voucher_used_checkin()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.status = 'used' and (old.status is distinct from 'used') and new.holder_user_id is not null then
    if not exists (
      select 1 from public.checkins
      where venue_id = coalesce(new.used_venue_id, new.venue_id) and user_id = new.holder_user_id
        and created_at > now() - interval '4 hours'
    ) then
      insert into public.checkins(venue_id, user_id, display_name)
      values (coalesce(new.used_venue_id, new.venue_id), new.holder_user_id,
              (select coalesce(nickname, name) from public.profiles where id = new.holder_user_id));
    end if;
  end if;
  return new;
end $function$;

-- #4 적용: 전매장 통합 랭킹 prize_points = parse_prize_man 합(보드 간 일치)
create or replace function public.global_ranking_totals()
returns table(nickname text, moneyin_count bigint, prize_points bigint, best_position integer, venues bigint)
language sql stable security definer set search_path to 'public' as $function$
  select r.nickname,
         count(*)::bigint as moneyin_count,
         coalesce(sum(public.parse_prize_man(r.prize)),0)::bigint as prize_points,
         min(r.position)::integer as best_position,
         count(distinct r.venue_id)::bigint as venues
  from public.venue_rankings r
  where coalesce(trim(r.nickname), '') <> ''
  group by r.nickname
$function$;

-- #4+#8 적용: 시즌 누적 보드 points=placement_points(커스텀 반영), prize_man=parse_prize_man
create or replace function public.current_season_standings(p_venue_id uuid)
returns table(rank integer, nickname text, real_name text, points integer, prize_man integer, appearances integer, best_position integer)
language sql stable security definer set search_path to 'public' as $function$
  with s as (select starts_on, ends_on from public.venue_seasons where venue_id=p_venue_id and status='active' limit 1),
  agg as (
    select vr.nickname,
      max(vr.real_name) as real_name,
      sum(public.placement_points(p_venue_id, vr.position))::int as points,
      sum(public.parse_prize_man(vr.prize))::int as prize_man,
      count(*)::int as appearances,
      min(vr.position)::int as best_position
    from public.venue_rankings vr, s
    where vr.venue_id=p_venue_id and vr.ranking_date >= s.starts_on and vr.ranking_date <= s.ends_on and coalesce(trim(vr.nickname),'')<>''
    group by vr.nickname
  )
  select (row_number() over (order by points desc, prize_man desc, best_position asc, appearances desc))::int as rank,
    nickname, real_name, points, prize_man, appearances, best_position
  from agg order by rank;
$function$;

-- #8 적용: 순위 저장 시 회원 등수점수도 placement_points(커스텀 반영). 3-인자/4-인자 오버로드 동일.
create or replace function public.save_venue_rankings(p_venue_id uuid, p_date date, p_entries jsonb)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare e jsonb; i int := 0; v_uid uuid; v_pts int;
begin
  if not public.can_manage_venue(p_venue_id) then raise exception '순위를 입력할 권한이 없습니다'; end if;
  update public.profiles p set activity_points = greatest(0, coalesce(p.activity_points,0) - a.points)
    from public.ranking_point_awards a
    where a.venue_id = p_venue_id and a.ranking_date = p_date and a.user_id = p.id;
  delete from public.ranking_point_awards where venue_id = p_venue_id and ranking_date = p_date;
  delete from public.venue_rankings where venue_id = p_venue_id and ranking_date = p_date;
  for e in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    if coalesce(trim(e->>'nickname'), '') = '' then continue; end if;
    i := i + 1;
    insert into public.venue_rankings (venue_id, ranking_date, position, nickname, real_name, prize, created_by)
    values (p_venue_id, p_date, i,
            left(trim(coalesce(e->>'nickname', '')), 30),
            nullif(left(trim(coalesce(e->>'realName', '')), 20), ''),
            nullif(left(trim(coalesce(e->>'prize', '')), 40), ''),
            auth.uid());
    select id into v_uid from public.profiles where lower(trim(nickname)) = lower(trim(e->>'nickname')) limit 1;
    if v_uid is not null then
      v_pts := public.placement_points(p_venue_id, i);
      insert into public.ranking_point_awards(venue_id, ranking_date, user_id, points)
        values (p_venue_id, p_date, v_uid, v_pts)
        on conflict (venue_id, ranking_date, user_id) do update set points = ranking_point_awards.points + excluded.points;
      update public.profiles set activity_points = coalesce(activity_points,0) + v_pts where id = v_uid;
    end if;
  end loop;
end;
$function$;

create or replace function public.save_venue_rankings(p_venue_id uuid, p_date date, p_entries jsonb, p_event text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare e jsonb; i int := 0; v_uid uuid; v_pts int; v_ev text := left(coalesce(trim(p_event), ''), 40);
begin
  if not public.can_manage_venue(p_venue_id) then raise exception '순위를 입력할 권한이 없습니다'; end if;
  update public.profiles p set activity_points = greatest(0, coalesce(p.activity_points,0) - a.points)
    from public.ranking_point_awards a
    where a.venue_id = p_venue_id and a.ranking_date = p_date and a.event_name = v_ev and a.user_id = p.id;
  delete from public.ranking_point_awards where venue_id = p_venue_id and ranking_date = p_date and event_name = v_ev;
  delete from public.venue_rankings where venue_id = p_venue_id and ranking_date = p_date and event_name = v_ev;
  for e in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    if coalesce(trim(e->>'nickname'), '') = '' then continue; end if;
    i := i + 1;
    insert into public.venue_rankings (venue_id, ranking_date, event_name, position, nickname, real_name, prize, created_by)
    values (p_venue_id, p_date, v_ev, i,
            left(trim(coalesce(e->>'nickname', '')), 30),
            nullif(left(trim(coalesce(e->>'realName', '')), 20), ''),
            nullif(left(trim(coalesce(e->>'prize', '')), 40), ''),
            auth.uid());
    select id into v_uid from public.profiles where lower(trim(nickname)) = lower(trim(e->>'nickname')) limit 1;
    if v_uid is not null then
      v_pts := public.placement_points(p_venue_id, i);
      insert into public.ranking_point_awards(venue_id, ranking_date, event_name, user_id, points)
        values (p_venue_id, p_date, v_ev, v_uid, v_pts)
        on conflict (venue_id, ranking_date, event_name, user_id) do update set points = ranking_point_awards.points + excluded.points;
      update public.profiles set activity_points = coalesce(activity_points,0) + v_pts where id = v_uid;
    end if;
  end loop;
end;
$function$;
