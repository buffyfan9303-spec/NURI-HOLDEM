-- ============================================================================
-- 순위표 실명(venue_rankings.real_name) 서버 마스킹 (2026-09-10, 런칭 전 보안 점검 — 20260910a 재설계)
--
-- 왜 다시 썼나: 20260910a(미적용·폐기)는 security_invoker 뷰 + 원본 정책 축소였다. 둘을 같이 하면 뷰가
--   호출자 권한으로 원본을 읽으므로 비로그인에겐 순위표가 통째로 빈다 — 설계 결함.
--
-- 무엇이 문제였나(변함없음)
--   · vr_read 가 `to public using(true)` 라 anon 키 하나로 전원의 실명을 긁을 수 있었다.
--   · 공개 RPC 셋(current_season_standings·venues_season_leaders·venue_hall_of_fame)도 실명을 그대로 내려보냈다.
--   · '동의한 사람만 실명' 규칙(rankDisplay ↔ venue_ranking_real_name_optins)은 **클라이언트에만** 있었다.
--     CLAUDE.md 보안 표준 §2(인가는 서버가) · §6(응답에 민감 컬럼을 싣지 않는다) 위반.
--
-- 설계
--   A. 읽기 RPC venue_rankings_public(p_venue_ids, p_dates) — SECURITY DEFINER. 실명은
--      ① 호출자가 매장 관리자·운영자(can_manage_venue)이거나 ② 그 닉네임이 실명 표시를 본인이 고른 경우
--      (venue_ranking_real_name_optins 와 **같은 규칙**: profiles.ranking_name_pref='real_name' · active · 닉네임 유일)
--      에만 싣고 나머지는 NULL. 공개 RPC 셋도 같은 규칙으로 마스킹한다.
--      시즌 종료 스냅샷(_end_season_internal)은 마스킹 전 원본(_current_season_standings_raw)을 읽는다 —
--      명예의 전당은 읽을 때 가린다(venue_hall_of_fame). 저장본을 가리면 나중에 동의해도 못 살린다.
--   B. 원본 테이블의 real_name 컬럼 권한 회수(컬럼 단위 GRANT). 뷰·정책이 아니라 컬럼 권한인 이유:
--      · RLS 로 행을 숨기면 realtime(postgres_changes)이 그 역할에게 이벤트를 안 준다(순위 자동 갱신 소실).
--      · 컬럼 권한은 realtime 이 지원한다 — realtime.subscription_check_filters 가 has_column_privilege 로
--        필터 컬럼(venue_id)만 검사하고, payload 에서 권한 없는 컬럼만 뺀다(운영 DB 함수 본문으로 확인, 2026-09-10).
--      · security_definer 뷰는 어드바이저 ERROR.
--   순서: A 적용 → 클라이언트가 RPC 를 쓰도록 배포(src/api/rankings.ts·reservations.ts) → B 적용.
--         B 를 먼저 하면 옛 번들의 `select … real_name` 이 42501 로 깨진다.
--
-- 롤백
--   B: grant select on public.venue_rankings to anon, authenticated;   (컬럼 GRANT 는 남아 있어도 무해)
--   A: drop function public.venue_rankings_public(uuid[], date[]);
--      drop function public._can_see_ranking_real_names(uuid); drop function public._ranking_real_name_opted_in(text);
--      current_season_standings·venues_season_leaders·venue_hall_of_fame·_end_season_internal 은 20260905g/h/i 판으로 재생성.
-- ============================================================================

-- ── A-1. 규칙 두 개를 함수로 — 단일 출처 ─────────────────────────────────────
-- 실명 표시를 본인이 고른 닉네임인가(venue_ranking_real_name_optins 와 같은 규칙).
create or replace function public._ranking_real_name_opted_in(p_nickname text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select count(*) = 1
    from public.profiles p
   where lower(btrim(p.nickname)) = lower(btrim(coalesce(p_nickname, '')))
     and coalesce(p.status::text, 'active') = 'active'
     and p.ranking_name_pref = 'real_name';
$$;
revoke execute on function public._ranking_real_name_opted_in(text) from public, anon, authenticated;

-- 호출자가 이 매장의 실명을 볼 자격이 있는가(운영자는 can_manage_venue 가 포함). NULL-safe.
create or replace function public._can_see_ranking_real_names(p_venue_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.can_manage_venue(p_venue_id), false);
$$;
revoke execute on function public._can_see_ranking_real_names(uuid) from public, anon, authenticated;

-- ── A-2. 공개 읽기 RPC — 클라이언트의 venue_rankings 직접 select 3곳을 대체 ────────
create or replace function public.venue_rankings_public(p_venue_ids uuid[], p_dates date[] default null)
-- ⚠ position 은 예약어라 반환 목록에서 따옴표가 필요하다(테이블 컬럼 참조 r.position 은 그대로 된다).
returns table(id uuid, venue_id uuid, ranking_date date, "position" integer, nickname text, real_name text, prize text, event_name text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with v as (
    select x.vid, public._can_see_ranking_real_names(x.vid) as can_see
      from unnest(coalesce(p_venue_ids, '{}'::uuid[])) as x(vid)
  )
  select r.id, r.venue_id, r.ranking_date, r.position, r.nickname,
         case when v.can_see or public._ranking_real_name_opted_in(r.nickname) then r.real_name else null end as real_name,
         r.prize, r.event_name
    from public.venue_rankings r
    join v on v.vid = r.venue_id
   where p_dates is null or r.ranking_date = any(p_dates)
   order by r.venue_id, r.ranking_date, r.position;
$$;
revoke execute on function public.venue_rankings_public(uuid[], date[]) from public;
grant execute on function public.venue_rankings_public(uuid[], date[]) to anon, authenticated, service_role;

-- ── A-3. 시즌 집계 — 원본(내부)과 마스킹(공개)을 나눈다 ───────────────────────
create or replace function public._current_season_standings_raw(p_venue_id uuid)
returns table(rank integer, nickname text, real_name text, points integer, prize_man integer, appearances integer, best_position integer)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with s as (select starts_on, ends_on from public.venue_seasons where venue_id = p_venue_id and status = 'active' limit 1),
  agg as (
    select vr.nickname, max(vr.real_name) as real_name,
           sum(public.placement_points(p_venue_id, vr.position))::int as points,
           sum(public.parse_prize_man(vr.prize))::int as prize_man,   -- 과거 원본 합계(표시·정렬에 쓰지 않음, 스냅샷 보존용)
           count(*)::int as appearances, min(vr.position)::int as best_position
      from public.venue_rankings vr, s
     where vr.venue_id = p_venue_id and vr.ranking_date >= s.starts_on and vr.ranking_date <= s.ends_on
       and coalesce(trim(vr.nickname), '') <> ''
     group by vr.nickname
  )
  select (row_number() over (order by points desc, best_position asc, appearances desc, nickname))::int as rank,
         nickname, real_name, points, prize_man, appearances, best_position
    from agg order by rank;
$$;
revoke execute on function public._current_season_standings_raw(uuid) from public, anon, authenticated;

create or replace function public.current_season_standings(p_venue_id uuid)
returns table(rank integer, nickname text, real_name text, points integer, prize_man integer, appearances integer, best_position integer)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select s.rank, s.nickname,
         case when public._can_see_ranking_real_names(p_venue_id) or public._ranking_real_name_opted_in(s.nickname) then s.real_name else null end,
         s.points, s.prize_man, s.appearances, s.best_position
    from public._current_season_standings_raw(p_venue_id) s
   order by s.rank;
$$;
revoke execute on function public.current_season_standings(uuid) from public;
grant execute on function public.current_season_standings(uuid) to anon, authenticated, service_role;

-- 시즌 종료 스냅샷은 원본을 저장한다(본문은 종전과 같고 읽는 함수만 raw 로 바뀐다). ACL 종전대로 전부 회수.
create or replace function public._end_season_internal(p_season_id uuid)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $function$
declare v_venue uuid; r record; n int := 0;
begin
  select venue_id into v_venue from public.venue_seasons where id = p_season_id and status = 'active';
  if v_venue is null then return 0; end if;
  insert into public.venue_season_results (season_id, rank, nickname, real_name, points, prize_man, appearances, best_position)
  select p_season_id, rank, nickname, real_name, points, prize_man, appearances, best_position
    from public._current_season_standings_raw(v_venue);
  get diagnostics n = row_count;
  -- 상위 3명 알림은 남긴다(성적 알림). 활동점수 +1000/500/300 은 2026-09-05 부터 지급하지 않는다.
  for r in select rank, nickname from public.venue_season_results where season_id = p_season_id and rank <= 3 loop
    insert into public.notifications (user_id, type, title, message, link)
    select id, 'system', '🏆 시즌 결과', '시즌 ' || r.rank || '위 달성! 기록은 명예의 전당에 남습니다', '/community/' || v_venue
      from public.profiles where lower(nickname) = lower(r.nickname);
  end loop;
  update public.venue_seasons set status = 'ended', ended_at = now() where id = p_season_id;
  return n;
end
$function$;
revoke execute on function public._end_season_internal(uuid) from public, anon, authenticated;

-- ── A-4. 나머지 공개 RPC 둘도 같은 규칙 ────────────────────────────────────────
create or replace function public.venues_season_leaders(p_venue_ids uuid[])
returns table(venue_id uuid, season_name text, nickname text, real_name text, points integer)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with s as (
    select venue_id, name, starts_on, ends_on from public.venue_seasons where status = 'active' and venue_id = any(p_venue_ids)
  ), agg as (
    select s.venue_id, s.name as season_name, vr.nickname, max(vr.real_name) as real_name,
           sum(public.placement_points(s.venue_id, vr.position))::int as points
      from s join public.venue_rankings vr
        on vr.venue_id = s.venue_id and vr.ranking_date >= s.starts_on and vr.ranking_date <= s.ends_on
       and coalesce(trim(vr.nickname), '') <> ''
     group by s.venue_id, s.name, vr.nickname
  ), lead as (
    select distinct on (venue_id) venue_id, season_name, nickname, real_name, points
      from agg order by venue_id, points desc, nickname
  )
  select l.venue_id, l.season_name, l.nickname,
         case when public._can_see_ranking_real_names(l.venue_id) or public._ranking_real_name_opted_in(l.nickname) then l.real_name else null end,
         l.points
    from lead l;
$$;
revoke execute on function public.venues_season_leaders(uuid[]) from public;
grant execute on function public.venues_season_leaders(uuid[]) to anon, authenticated, service_role;

create or replace function public.venue_hall_of_fame(p_venue_id uuid)
returns table(season_id uuid, season_name text, ends_on date, nickname text, real_name text, points integer)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select s.id, s.name, s.ends_on, r.nickname,
         case when public._can_see_ranking_real_names(p_venue_id) or public._ranking_real_name_opted_in(r.nickname) then r.real_name else null end,
         r.points
    from public.venue_seasons s
    join public.venue_season_results r on r.season_id = s.id and r.rank = 1
   where s.venue_id = p_venue_id and s.status = 'ended'
   order by s.ends_on desc;
$$;
revoke execute on function public.venue_hall_of_fame(uuid) from public;
grant execute on function public.venue_hall_of_fame(uuid) to anon, authenticated, service_role;

-- ============================================================================
-- B. 원본 컬럼 권한 회수 — **클라이언트 배포가 끝난 뒤에만** (별도 실행, 이 블록은 A 와 같이 돌리지 않는다)
--   revoke select on public.venue_rankings from public, anon, authenticated;
--   grant select (id, venue_id, ranking_date, position, nickname, created_by, created_at, prize, event_name)
--     on public.venue_rankings to anon, authenticated;
--   -- 검증: anon 으로 real_name 을 고르면 42501, 나머지 컬럼은 통과
--   set role anon; select nickname from public.venue_rankings limit 1;           -- 통과
--   select real_name from public.venue_rankings limit 1;                          -- permission denied
--   reset role;
--   -- realtime: has_column_privilege('anon', 'public.venue_rankings', 'venue_id', 'select') → true 여야 구독이 붙는다
-- ============================================================================
