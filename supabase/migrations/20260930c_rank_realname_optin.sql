-- 20260930c — 순위표 실명은 **본인이 켠 경우에만, 본인인증 실명으로** 보인다.
--
-- ⏳ 미적용 — 적용은 nuri-lead 가 MCP execute_sql 로 한다(파일 하단 '리허설' 먼저).
-- 🧪 2026-09-30 라이브 리허설(begin … rollback, PG 17.6) — 전문 + 자가검사 + 아래 리허설 블록:
--   결과 `REHEARSAL_OK`(모든 단언 통과 후 의도적으로 멈춤). 뒤이어 확인: _ranking_optin_real_name 0개 ·
--   global_ranking_totals 반환형 원래대로(real_name 없음) · 임시 행 0 · 시험 계정 pref NULL 그대로 → 롤백 확인.
--   음성 3역할(비로그인·일반 회원·타매장 업주) × 비동의 실명 노출 0건 / 옵트인 실명 1건 보임 · 전국 순위 동일 ·
--   양성(해당 매장 업주) 원문 실명 2/2 · 해제 후 실명 0건 · 제3자 불일치 0건.
--   적용 전 대조(현 라이브): 같은 조건에서 anon 노출 0 · **옵트인 실명 보임 0** — 켜도 안 보이던 결함 ① 재현.
--
-- 오너 2026-09-30: "기존 가입자는 기본 실명 비공개. 실명 공개를 본인이 선택하게 만들 예정이니
--   그 선택만 제대로 할 수 있게 해." (이름 숨기기 별도 옵션은 넣지 않는다 — 오너 결정)
--
-- ── 무엇이 문제였나 (2026-09-30 라이브 실측) ──────────────────────────────────
-- ① **켜도 안 보인다.** 공개 순위 RPC 5개는 옵트인한 사람에게 `venue_rankings.real_name`(업주가 손으로 적은 칸)을
--    풀어 줬다. 그런데 라이브 venue_rankings 8행 중 real_name 이 적힌 행은 **0행**이다(순위는 클락·장부에서
--    닉네임으로 들어온다). 즉 본인이 '실명'을 골라도 어떤 순위 화면에도 실명이 뜨지 않았다.
--    → 옵트인한 사람의 실명은 **본인인증으로 확정된 profiles.real_name** 에서 가져온다. 본인이 동의한 값이
--      바로 그것이고, 업주가 적은 철자와 무관하게 늘 같은 값이 나온다.
-- ② **전국 랭킹(global_ranking_totals)** 은 닉네임만 돌려줘 옵트인해도 실명이 붙을 자리가 없었다 → real_name 열 추가.
-- ③ 매장 순위의 '실명 켠 닉네임' 목록(venue_ranking_real_name_optins)은 본인인증·20260918b 의 제3자 불일치 검사를
--    **빼먹은 채** 판정해, 서버 판정(_ranking_real_name_opted_in)과 답이 갈릴 수 있었다 → 판정 한 벌로 통일.
--
-- ── 바꾸지 않는 것 ──────────────────────────────────────────────────────────
-- · 업무 경로: 그 매장 장부 권한자(_can_see_ranking_real_names = can_access_ledger — 업주·승인 공동업주·운영자·
--   장부 권한 직원)는 지금처럼 **업주가 적은 real_name 원문**을 받는다. 순위 편집기(VenueManageTab)가 그 값을 다시 저장하므로
--   여기에 프로필 실명을 섞으면 저장 한 번에 표 데이터가 바뀐다. 그래서 업무 경로는 원문 그대로다.
-- · 데이터: 한 행도 바꾸지 않는다(오너 확인 — 실명 공개 선택자 0명, 나머지는 NULL=닉네임).
-- · 옵트인 조건(20260918b): 본인인증(ci_hash) + 활성 계정 + 실명 보유 + 그 닉네임 행에 **다른 실명이 적힌 행이 없음**.
--
-- ── 권한 경계(전이 폐쇄) ────────────────────────────────────────────────────
--   _can_see_ranking_real_names(v) → can_access_ledger(v) → can_manage_pos(v) | (ledger_access ∧ _is_active_venue_staff)
--   이 함수를 부르는 곳: venue_rankings_public · current_season_standings · season_results · venue_hall_of_fame ·
--   venues_season_leaders (2026-09-30 prosrc 전수). 다섯 곳 모두 아래에서 같은 식으로 바꾼다.
--   비로그인(auth.uid() NULL): can_manage_pos 의 my_role()='admin' 은 coalesce(false), 나머지 exists 는 거짓 → 닫힘.
--
-- ⚠ ACL: 다섯 공개 RPC·optins·_ranking_real_name_opted_in 은 CREATE OR REPLACE(ACL 보존)지만 관행대로 다시 적는다.
--   global_ranking_totals 는 반환 열이 늘어 **DROP 후 재생성** → ACL 초기화되므로 반드시 다시 적는다.

-- ── 1. 옵트인 실명 한 벌 ─────────────────────────────────────────────────────
-- 옵트인이면 본인인증 실명(trim), 아니면 NULL. 모든 공개 순위 RPC 가 이 함수 하나만 본다.
create or replace function public._ranking_optin_real_name(p_nickname text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select btrim(p.real_name)
    from public.profiles p
   where btrim(coalesce(p_nickname, '')) <> ''
     and lower(btrim(p.nickname)) = lower(btrim(p_nickname))   -- 닉네임은 대소문자·공백 무시 유일(uniq_profiles_nickname_ci)
     and coalesce(p.status::text, 'active') = 'active'
     and p.ranking_name_pref = 'real_name'
     and p.ci_hash is not null
     and nullif(btrim(coalesce(p.real_name, '')), '') is not null
     -- 20260918b: 그 닉네임으로 적힌 순위 행에 **다른** 실명이 하나라도 있으면(=워크인 손님이 섞였으면) 닫는다.
     and not exists (
       select 1 from public.venue_rankings r
        where lower(btrim(r.nickname)) = lower(btrim(p_nickname))
          and nullif(btrim(coalesce(r.real_name, '')), '') is not null
          and lower(btrim(r.real_name)) is distinct from lower(btrim(p.real_name))
     )
   limit 1;
$$;
revoke all on function public._ranking_optin_real_name(text) from public, anon, authenticated;
grant execute on function public._ranking_optin_real_name(text) to service_role;

-- 옛 판정 함수는 같은 답을 내도록 한 벌에 묶어 둔다(외부 호출부 0 — 남겨 두는 것은 되돌리기 안전판).
create or replace function public._ranking_real_name_opted_in(p_nickname text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public._ranking_optin_real_name(p_nickname) is not null;
$$;
revoke all on function public._ranking_real_name_opted_in(text) from public, anon, authenticated;
grant execute on function public._ranking_real_name_opted_in(text) to service_role;

-- ── 2. 이 매장 순위표에서 실명을 켠 닉네임 ─────────────────────────────────────
create or replace function public.venue_ranking_real_name_optins(p_venue_id uuid)
returns table(nickname_key text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with nicks as (
    select distinct lower(btrim(r.nickname)) as key
      from public.venue_rankings r
     where r.venue_id = p_venue_id
       and btrim(coalesce(r.nickname, '')) <> ''
  )
  select n.key from nicks n
   where public._ranking_optin_real_name(n.key) is not null;
$$;
revoke all on function public.venue_ranking_real_name_optins(uuid) from public;
grant execute on function public.venue_ranking_real_name_optins(uuid) to anon, authenticated, service_role;

-- ── 3. 공개 순위 RPC 다섯 곳 — 업무 경로는 원문, 그 밖은 옵트인 실명만 ──────────────
create or replace function public.venue_rankings_public(p_venue_ids uuid[], p_dates date[] default null::date[])
returns table(id uuid, venue_id uuid, ranking_date date, "position" integer, nickname text, real_name text, prize text, event_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with v as (
    select x.vid, public._can_see_ranking_real_names(x.vid) as can_see
      from unnest(coalesce(p_venue_ids, '{}'::uuid[])) as x(vid)
  )
  select r.id, r.venue_id, r.ranking_date, r.position, r.nickname,
         case when v.can_see then r.real_name else public._ranking_optin_real_name(r.nickname) end as real_name,
         r.prize, r.event_name
    from public.venue_rankings r
    join v on v.vid = r.venue_id
   where p_dates is null or r.ranking_date = any(p_dates)
   order by r.venue_id, r.ranking_date, r.position;
$$;
revoke all on function public.venue_rankings_public(uuid[], date[]) from public;
grant execute on function public.venue_rankings_public(uuid[], date[]) to anon, authenticated, service_role;

create or replace function public.current_season_standings(p_venue_id uuid)
returns table(rank integer, nickname text, real_name text, points integer, prize_man integer, appearances integer, best_position integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.rank, s.nickname,
         case when public._can_see_ranking_real_names(p_venue_id) then s.real_name
              else public._ranking_optin_real_name(s.nickname) end,
         s.points, s.prize_man, s.appearances, s.best_position
    from public._current_season_standings_raw(p_venue_id) s
   order by s.rank;
$$;
revoke all on function public.current_season_standings(uuid) from public;
grant execute on function public.current_season_standings(uuid) to anon, authenticated, service_role;

create or replace function public.season_results(p_season_id uuid)
returns setof public.venue_season_results
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.season_id, r.rank, r.nickname,
         case when public._can_see_ranking_real_names(s.venue_id) then r.real_name
              else public._ranking_optin_real_name(r.nickname) end,
         r.points, r.prize_man, r.appearances, r.best_position
    from public.venue_season_results r
    join public.venue_seasons s on s.id = r.season_id
   where r.season_id = p_season_id
   order by r.rank;
$$;
revoke all on function public.season_results(uuid) from public;
grant execute on function public.season_results(uuid) to anon, authenticated, service_role;

create or replace function public.venue_hall_of_fame(p_venue_id uuid)
returns table(season_id uuid, season_name text, ends_on date, nickname text, real_name text, points integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id, s.name, s.ends_on, r.nickname,
         case when public._can_see_ranking_real_names(p_venue_id) then r.real_name
              else public._ranking_optin_real_name(r.nickname) end,
         r.points
    from public.venue_seasons s
    join public.venue_season_results r on r.season_id = s.id and r.rank = 1
   where s.venue_id = p_venue_id and s.status = 'ended'
   order by s.ends_on desc;
$$;
revoke all on function public.venue_hall_of_fame(uuid) from public;
grant execute on function public.venue_hall_of_fame(uuid) to anon, authenticated, service_role;

create or replace function public.venues_season_leaders(p_venue_ids uuid[])
returns table(venue_id uuid, season_name text, nickname text, real_name text, points integer)
language sql
stable
security definer
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
         case when public._can_see_ranking_real_names(l.venue_id) then l.real_name
              else public._ranking_optin_real_name(l.nickname) end,
         l.points
    from lead l;
$$;
revoke all on function public.venues_season_leaders(uuid[]) from public;
grant execute on function public.venues_season_leaders(uuid[]) to anon, authenticated, service_role;

-- ── 4. 전국 랭킹 — 옵트인 실명 열 추가(업무 경로 없음: 여러 매장이 섞인 공개 표라 원문 실명은 누구에게도 안 준다) ──
drop function if exists public.global_ranking_totals(date);
create function public.global_ranking_totals(p_since date default null::date)
returns table(nickname text, moneyin_count bigint, wins bigint, top3 bigint, best_position integer, venues bigint, last_date date, real_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.nickname,
         count(*)::bigint                                          as moneyin_count,
         count(*) filter (where r.position = 1)::bigint             as wins,
         count(*) filter (where r.position <= 3)::bigint            as top3,
         min(r.position)::integer                                   as best_position,
         count(distinct r.venue_id)::bigint                         as venues,
         max(r.ranking_date)::date                                  as last_date,
         public._ranking_optin_real_name(r.nickname)                as real_name
  from public.venue_rankings r
  where coalesce(trim(r.nickname), '') <> ''
    and (p_since is null or r.ranking_date >= p_since)
  group by r.nickname
  order by moneyin_count desc, wins desc, top3 desc, best_position asc, last_date desc, r.nickname
$$;
revoke all on function public.global_ranking_totals(date) from public;
grant execute on function public.global_ranking_totals(date) to anon, authenticated, service_role;

-- ── 5. 자가검사 — ACL·search_path ────────────────────────────────────────────
do $check$
declare
  f text;
begin
  foreach f in array array['public._ranking_optin_real_name(text)', 'public._ranking_real_name_opted_in(text)'] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception '20260930c: 내부 함수 % 가 anon/authenticated 에 열려 있다', f;
    end if;
  end loop;
  foreach f in array array['public.global_ranking_totals(date)', 'public.venue_rankings_public(uuid[],date[])',
                           'public.current_season_standings(uuid)', 'public.season_results(uuid)',
                           'public.venue_hall_of_fame(uuid)', 'public.venues_season_leaders(uuid[])',
                           'public.venue_ranking_real_name_optins(uuid)'] loop
    if not has_function_privilege('anon', f, 'execute') then
      raise exception '20260930c: 공개 읽기 RPC % 를 anon 이 못 부른다(화면이 빈다)', f;
    end if;
    if not exists (select 1 from pg_proc where oid = f::regprocedure and prosecdef
                     and proconfig @> array['search_path=public, pg_temp']) then
      raise exception '20260930c: % search_path 고정 누락', f;
    end if;
  end loop;
end
$check$;

-- ════════════════════════════════════════════════════════════════════════════
-- 리허설 (라이브, 무료) — 위 전문을 붙인 뒤 이 블록을 붙여 `begin; … rollback;` 으로 한 번에 돌린다.
--   시험 계정(2026-09-30 profiles 실측으로 고름 — 역할·소유·인증 확인):
--     OWNER  7e435684-2c8c-458d-985c-31b784a44893  venue_owner · f35b42d1… 소유+venue_owners approved · 인증
--     OTHER  1a8c5117-a4c7-42fe-abb6-021544adcd16  venue_owner · 615376fa… 소유(f35b 와 무관)
--     MEMBER 708de904-913e-4082-8803-8a2766b342f9  user · 미인증 · 소유 없음
--     OPTIN  47360d8e-fd0e-49f3-ab3f-22e1fc1e9e60  user · 인증+실명 보유 · 순위 행 0 (트랜잭션 안에서 켠다)
--     NOOPT  fd14c2dc-d994-46e4-8f12-b6cf38104983  user · 인증 · ranking_name_pref='nickname'
--   ⚠ admin(c8e3…·f5d3…)은 전 매장 can_manage_pos 라 음성 대상으로 쓰지 않는다.
--   임시 순위 행 3개(매장 f35b, 날짜 2000-01-01): OPTIN 닉네임 · NOOPT 닉네임+업주가 적은 실명 · 닉네임 없는 옛 행+실명
-- ────────────────────────────────────────────────────────────────────────────
-- begin;
--   <위 1~5 전문>
--   do $rh$
--   declare
--     V uuid := 'f35b42d1-2d54-4905-95c1-1fda24e0f178';
--     D date := '2000-01-01';
--     n_opt text; n_no text; rn_opt text;
--     who record; got int; leak int; pos int;
--   begin
--     select nickname, btrim(real_name) into n_opt, rn_opt from profiles where id = '47360d8e-fd0e-49f3-ab3f-22e1fc1e9e60';
--     select nickname into n_no from profiles where id = 'fd14c2dc-d994-46e4-8f12-b6cf38104983';
--     update profiles set ranking_name_pref = 'real_name' where id = '47360d8e-fd0e-49f3-ab3f-22e1fc1e9e60';
--     insert into venue_rankings(venue_id, ranking_date, position, nickname, real_name) values
--       (V, D, 1, n_opt, null), (V, D, 2, n_no, '리허설비동의실명'), (V, D, 3, '', '리허설옛행실명');
--
--     -- 음성: 비로그인 · 일반 회원 · 타매장 업주 — 비동의 실명(업주가 적은 것·옛 행) 0건, 옵트인 실명은 보인다
--     for who in select * from (values (null::uuid), ('708de904-913e-4082-8803-8a2766b342f9'::uuid), ('1a8c5117-a4c7-42fe-abb6-021544adcd16'::uuid)) t(uid) loop
--       perform set_config('request.jwt.claims', case when who.uid is null then '' else json_build_object('sub', who.uid, 'role', 'authenticated')::text end, true);
--       select count(*) into leak from venue_rankings_public(array[V], array[D]) where real_name in ('리허설비동의실명', '리허설옛행실명');
--       if leak <> 0 then raise exception 'FAIL 음성 %: 비동의 실명 % 건 노출', who.uid, leak; end if;
--       select count(*) into got from venue_rankings_public(array[V], array[D]) where nickname = n_opt and real_name = rn_opt;
--       if got <> 1 then raise exception 'FAIL 양성(옵트인) %: 옵트인 실명이 안 보인다(%)', who.uid, got; end if;
--       select count(*) into leak from global_ranking_totals(D) where real_name is not null and nickname <> n_opt;
--       if leak <> 0 then raise exception 'FAIL 전국 %: 옵트인 아닌 실명 % 건', who.uid, leak; end if;
--       select count(*) into got from global_ranking_totals(D) where nickname = n_opt and real_name = rn_opt;
--       if got <> 1 then raise exception 'FAIL 전국 양성 %', who.uid; end if;
--       select count(*) into got from venue_ranking_real_name_optins(V) where nickname_key = lower(btrim(n_opt));
--       if got <> 1 then raise exception 'FAIL optins %', who.uid; end if;
--       select count(*) into leak from venue_ranking_real_name_optins(V) where nickname_key = lower(btrim(n_no));
--       if leak <> 0 then raise exception 'FAIL optins 비동의 %', who.uid; end if;
--     end loop;
--
--     -- 양성(업무 경로): 해당 매장 업주는 업주가 적은 원문 실명을 그대로 받는다(순위 편집기 저장이 원문을 잃지 않게)
--     perform set_config('request.jwt.claims', json_build_object('sub', '7e435684-2c8c-458d-985c-31b784a44893', 'role', 'authenticated')::text, true);
--     select count(*) into got from venue_rankings_public(array[V], array[D]) where real_name in ('리허설비동의실명', '리허설옛행실명');
--     if got <> 2 then raise exception 'FAIL 양성(업주): 원문 실명 %/2', got; end if;
--
--     -- 끄면 즉시 닉네임: 옵트인 해제 → 비로그인에게 옵트인 실명도 0
--     update profiles set ranking_name_pref = 'nickname' where id = '47360d8e-fd0e-49f3-ab3f-22e1fc1e9e60';
--     perform set_config('request.jwt.claims', '', true);
--     select count(*) into leak from venue_rankings_public(array[V], array[D]) where real_name is not null;
--     if leak <> 0 then raise exception 'FAIL 해제 후에도 실명 % 건', leak; end if;
--
--     -- 제3자 불일치(20260918b): 켠 사람 닉네임 행에 다른 실명이 적혀 있으면 닫힌다
--     update profiles set ranking_name_pref = 'real_name' where id = '47360d8e-fd0e-49f3-ab3f-22e1fc1e9e60';
--     update venue_rankings set real_name = '다른사람' where venue_id = V and ranking_date = D and position = 1;
--     select count(*) into leak from venue_rankings_public(array[V], array[D]) where real_name is not null;
--     if leak <> 0 then raise exception 'FAIL 제3자 불일치인데 % 건', leak; end if;
--
--     raise exception 'REHEARSAL_OK';  -- 전부 통과하면 이 문구로 멈춘다(= rollback)
--   end
--   $rh$;
-- rollback;
