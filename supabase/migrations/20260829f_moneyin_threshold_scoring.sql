-- 20260829f — 오너 #6/#7: 머니인 점수를 '횟수'에서 '금액 임계'로 재정의.
--
-- 왜: 주간리그·머니인 탭이 모두 venue_rankings 의 '행 수'(입상 횟수)로 점수를 매겼다.
--   동네 펍에서 소액으로 여러 번 머니인하면 등수점수(1등 10점)가 그대로 누적돼
--   해외 정식 대회 한 번보다 큰 점수가 나왔다.
-- 규칙: 100만원(10T)당 1점 — floor(금액 / 1,000,000). 임계 미만은 0점.
--   비례 구간을 택한 이유: '100만=1점, 250만=2점'은 한 문장으로 설명되고 단조증가라
--   큰 대회가 항상 작은 대회보다 크거나 같다. 계단식(구간표)은 경계에서 역전이 생긴다.
-- 단일 정의: 아래 moneyin_points() 가 유일한 정의다. 주간리그·머니인탭·국내순위·머니인킹
--   네 소비처가 전부 이 함수를 경유한다(클라이언트 재계산 금지).

-- ── 1) 규칙의 단일 정의 ──────────────────────────────────────────────────────
create or replace function public.moneyin_points(p_won bigint)
returns integer language sql immutable
set search_path to 'public', 'pg_temp'
as $fn$ select greatest(0, floor(coalesce(p_won, 0)::numeric / 1000000))::int $fn$;

comment on function public.moneyin_points(bigint) is
  '머니인 점수의 유일한 정의 — 100만원(10T)당 1점, 임계 미만 0점. 바꾸려면 여기만 바꾼다.';

-- venue_rankings.prize 는 만원 단위 자유 텍스트 → 원으로 승격 후 같은 규칙 적용
create or replace function public.prize_moneyin_points(p_prize text)
returns integer language sql immutable
set search_path to 'public', 'pg_temp'
as $fn$ select public.moneyin_points(public.parse_prize_man(p_prize)::bigint * 10000) $fn$;

comment on function public.prize_moneyin_points(text) is
  'prize(만원 텍스트) 전용 어댑터 — 규칙 자체는 moneyin_points() 에만 있다.';

-- 내부 헬퍼: 클라이언트 직접 호출 불필요(모든 소비처가 SECURITY DEFINER 안에서 호출하므로
--   호출자 권한과 무관하다). PUBLIC 회수만으로는 부족하다 — Supabase 기본 권한이 생성 시점에
--   anon/authenticated 에 EXECUTE 를 명시적으로 부여하므로 그 둘도 함께 회수한다.
revoke all on function public.moneyin_points(bigint) from public, anon, authenticated;
revoke all on function public.prize_moneyin_points(text) from public, anon, authenticated;
grant execute on function public.moneyin_points(bigint) to service_role;
grant execute on function public.prize_moneyin_points(text) to service_role;

-- ── 2) 정식 대회 구분(#7) — additive ─────────────────────────────────────────
-- event_kind: 'official'=정식 대회(해외 포함, 순위 인정) / 'pub'=일반 펍(기록만, 순위 제외)
-- is_overseas: 해외 개최 여부 — 표시·심사 참고용(해외도 정식이면 인정되므로 제외 조건 아님)
alter table public.rank_verifications
  add column if not exists event_kind  text    not null default 'official',
  add column if not exists is_overseas boolean not null default false;

alter table public.rank_verifications drop constraint if exists rank_verifications_event_kind_chk;
alter table public.rank_verifications add constraint rank_verifications_event_kind_chk
  check (event_kind in ('official', 'pub'));

comment on column public.rank_verifications.event_kind is
  '신청자가 고르고 운영자가 승인 시 확정하는 대회 구분. 국내 순위는 official 만 합산.';

-- ── 3) 승인 게이트 실효화 — 자가 승인 구멍 폐쇄 ──────────────────────────────
-- 실측(2026-08-29): 기존 rv_insert_own 의 WITH CHECK 는 user_id 일치만 봤다.
--   로그인 사용자가 status='approved' 를 직접 넣으면 운영자를 한 번도 거치지 않고
--   get_domestic_rankings 1위로 올라왔다(재현 완료). 신청은 항상 pending 으로만 생성한다.
drop policy if exists rv_insert_own on public.rank_verifications;
create policy rv_insert_own on public.rank_verifications
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'pending'
    and admin_note is null
    and decided_at is null
  );

-- ── 4) 국내 순위(#7) — 승인 + 정식 대회 + 금액 임계 ──────────────────────────
drop function if exists public.get_domestic_rankings(integer);
create function public.get_domestic_rankings(p_limit integer default 30)
returns table(nickname text, points bigint, total_won bigint, wins integer, overseas integer)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select rv.nickname,
         sum(public.moneyin_points(rv.amount_won))::bigint                as points,
         sum(rv.amount_won)::bigint                                       as total_won,
         count(*)::integer                                                as wins,
         count(*) filter (where rv.is_overseas)::integer                  as overseas
  from public.rank_verifications rv
  where rv.status = 'approved'          -- 운영자 승인분만
    and rv.event_kind = 'official'      -- 정식 대회(해외 포함)만
  group by rv.nickname
  having sum(public.moneyin_points(rv.amount_won)) > 0
  order by points desc, total_won desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$fn$;
revoke all on function public.get_domestic_rankings(integer) from public;
grant execute on function public.get_domestic_rankings(integer) to anon, authenticated, service_role;

-- ── 5) 랭킹 머니인 탭(#6) — 금액 임계 점수 추가(횟수는 보존해 함께 표시) ──────
drop function if exists public.global_ranking_totals();
create function public.global_ranking_totals()
returns table(nickname text, moneyin_count bigint, moneyin_points bigint,
              prize_points bigint, best_position integer, venues bigint)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select r.nickname,
         count(*)::bigint                                                   as moneyin_count,
         coalesce(sum(public.prize_moneyin_points(r.prize)), 0)::bigint     as moneyin_points,
         coalesce(sum(public.parse_prize_man(r.prize)), 0)::bigint          as prize_points,
         min(r.position)::integer                                           as best_position,
         count(distinct r.venue_id)::bigint                                 as venues
  from public.venue_rankings r
  where coalesce(trim(r.nickname), '') <> ''
  group by r.nickname
$fn$;
revoke all on function public.global_ranking_totals() from public;
grant execute on function public.global_ranking_totals() to anon, authenticated, service_role;

-- ── 6) 주간 리그(#6) — 등수점수(1등 10점) → 머니인 금액 점수 ─────────────────
-- 체크인 ×3 항은 오너 지시 범위 밖이라 그대로 둔다(가중치 재조정은 별도 결정 필요).
drop function if exists public.weekly_league(integer);
create function public.weekly_league(p_limit integer default 20)
returns table(user_id uuid, nickname text, score bigint, checkins bigint,
              placements bigint, moneyin_points bigint)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $fn$
  with wk as (select (date_trunc('week', (now() at time zone 'Asia/Seoul')::timestamp))::date as s),
  ck as (
    select c.user_id, count(*) as n
    from public.checkins c, wk
    where c.created_at >= (wk.s::timestamp at time zone 'Asia/Seoul')
    group by c.user_id
  ),
  pl as (
    select p.id as user_id, count(*) as n,
           sum(public.prize_moneyin_points(vr.prize)) as pts
    from public.venue_rankings vr
    join public.profiles p on lower(p.nickname) = lower(vr.nickname), wk
    where vr.ranking_date >= wk.s
    group by p.id
  )
  select pr.id, coalesce(pr.nickname, pr.name),
         (coalesce(ck.n, 0) * 3 + coalesce(pl.pts, 0))::bigint,
         coalesce(ck.n, 0)::bigint,
         coalesce(pl.n, 0)::bigint,
         coalesce(pl.pts, 0)::bigint
  from public.profiles pr
  left join ck on ck.user_id = pr.id
  left join pl on pl.user_id = pr.id
  where pr.role <> 'admin' and (coalesce(ck.n, 0) > 0 or coalesce(pl.n, 0) > 0)
  order by 3 desc, 4 desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$fn$;
revoke all on function public.weekly_league(integer) from public;
grant execute on function public.weekly_league(integer) to anon, authenticated, service_role;

-- ── 7) 주간 머니인 킹 위젯 — 같은 규칙을 쓰도록 서버로 이관 ──────────────────
-- 기존엔 클라이언트가 venue_rankings 를 통째로 받아 행 수를 셌다(규칙 2중 정의 + 전량 전송).
create or replace function public.weekly_moneyin_kings(
  p_from date, p_to date default null, p_limit integer default 3)
returns table(nickname text, moneyin_points bigint, moneyin_count bigint, best_position integer)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select r.nickname,
         coalesce(sum(public.prize_moneyin_points(r.prize)), 0)::bigint as moneyin_points,
         count(*)::bigint                                              as moneyin_count,
         min(r.position)::integer                                      as best_position
  from public.venue_rankings r
  where coalesce(trim(r.nickname), '') <> ''
    and r.ranking_date >= p_from
    and (p_to is null or r.ranking_date < p_to)
  group by r.nickname
  order by 2 desc, 3 desc, 4 asc
  limit greatest(1, least(coalesce(p_limit, 3), 20));
$fn$;
revoke all on function public.weekly_moneyin_kings(date, date, integer) from public;
grant execute on function public.weekly_moneyin_kings(date, date, integer) to anon, authenticated, service_role;
