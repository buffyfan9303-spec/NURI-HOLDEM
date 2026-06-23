-- 2026-06-23 매장 파이프라인 end-to-end 재점검 후속 수정.
-- (A) venues_season_leaders: 등수점수 하드코딩 → placement_points 헬퍼(커스텀 배점 반영).
--     #8에서 current_season_standings/save_venue_rankings 만 고쳐 '시즌 리더 카드'만 어긋났던 것 보강.
create or replace function public.venues_season_leaders(p_venue_ids uuid[])
returns table(venue_id uuid, season_name text, nickname text, real_name text, points integer)
language sql stable security definer set search_path to 'public' as $function$
  with s as (
    select venue_id, name, starts_on, ends_on
    from public.venue_seasons where status = 'active' and venue_id = any(p_venue_ids)
  ),
  agg as (
    select s.venue_id, s.name as season_name, vr.nickname, max(vr.real_name) as real_name,
      sum(public.placement_points(s.venue_id, vr.position))::int as points
    from s
    join public.venue_rankings vr
      on vr.venue_id = s.venue_id and vr.ranking_date >= s.starts_on and vr.ranking_date <= s.ends_on
     and coalesce(trim(vr.nickname), '') <> ''
    group by s.venue_id, s.name, vr.nickname
  )
  select distinct on (venue_id) venue_id, season_name, nickname, real_name, points
  from agg order by venue_id, points desc, nickname;
$function$;

-- (B) 코드엔 구독이 있으나 퍼블리케이션 누락으로 발화 안 되던 테이블 추가(프론트 변경 없이 실시간 활성화).
--     checkins(subscribeCheckins/CheckinModal), league_event_status·leagues(subscribeLeagueStatus/LeagueLiveBoard).
--     venue_seasons·venue_season_results 는 향후 시즌 보드 구독 대비 선등록.
do $$
declare t text;
begin
  foreach t in array array['checkins','league_event_status','leagues','venue_seasons','venue_season_results'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
