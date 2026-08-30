-- ============================================================================
-- 20260830j — 순위 4건(오너 #11 · #14 · #15 · #9)
--
--  #11 순위 인증은 '대회'만 받는다                    (rank_verifications 입력·승인 게이트)
--  #14 순위표 표시 이름의 기본값은 '닉네임'           (profiles.ranking_name_pref)
--  #15 머니인 킹 옆 매장 = '가장 점수를 많이 딴 매장' (weekly_moneyin_kings 서버 집계)
--  #9  상점 마크 'hot_streak' 이름만 '핫' 으로        (key·emoji 불변)
--
-- 비파괴 원칙: 컬럼 추가 1개 · 함수 추가/재생성 · UPDATE 1건(이름). 행 삭제 없음.
--   기존에 승인된 '일반 펍' 인증은 소급 삭제하지 않는다(앞으로 들어올 것만 막는다).
-- ============================================================================

-- ── #11 순위 인증 = 대회만 ───────────────────────────────────────────────────
-- 지금까지의 구조: 신청자가 event_kind 를 'official'(정식 대회) / 'pub'(일반 펍) 중
--   골라 제출하고, 운영자가 승인 시 확정했다. 'pub' 으로 승인하면 '기록만 남고
--   국내 순위에서는 제외'였다 — 즉 일반 펍도 인증 절차 자체에는 들어와 있었다.
-- 오너 #11: "일반펍은 순위인증에 포함하지 않음. 대회만 포함."
--   → '기록만 남기는 pub 승인' 경로를 없앤다. 일반 펍 증빙은 승인 대상이 아니라
--     반려 대상이다. 신청 단계에서도 구분 선택을 없애 'official' 로만 들어온다.
--
-- 왜 CHECK 를 NOT VALID 로 다는가: 이미 approved 인 과거 'pub' 행이 있다면 그 행은
--   그대로 둬야 한다(데이터 삭제 금지). NOT VALID 는 앞으로의 INSERT/UPDATE 에만
--   적용되므로 "앞으로 들어오는 것만 막아라"와 정확히 같은 의미다.
--   (2026-08-30 실측: rank_verifications 0행. 그래도 정책은 소급 무해하게 둔다.)
alter table public.rank_verifications
  drop constraint if exists rank_verifications_approved_official_chk;
alter table public.rank_verifications
  add constraint rank_verifications_approved_official_chk
  check (status <> 'approved' or event_kind = 'official') not valid;

comment on constraint rank_verifications_approved_official_chk on public.rank_verifications is
  '오너 #11 — 승인은 정식 대회(official)만. NOT VALID: 과거 행은 건드리지 않고 신규만 차단.';

-- 신청 자체도 대회로만 받는다. 기존 정책(자가 승인 차단)은 그대로 유지하고 한 줄만 더한다.
drop policy if exists rv_insert_own on public.rank_verifications;
create policy rv_insert_own on public.rank_verifications
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'pending'
    and admin_note is null
    and decided_at is null
    and event_kind = 'official'      -- #11: 일반 펍(pub)은 신청 자체가 성립하지 않는다
  );

comment on column public.rank_verifications.event_kind is
  '대회 구분. 2026-08-30(오너 #11)부터 신규 신청·승인은 official 만 허용. pub 값은 과거 행 보존용으로만 남는다.';

-- ── #14 순위표 표시 이름 — 기본은 닉네임, 실명은 본인이 명시적으로 선택 ──────
-- 지금까지 매장 순위표는 rankDisplay() 가 실명을 앞(main)에 두고 닉네임을 마스킹해
--   뒤에 붙였다(예: '홍길동(나*리)'). 매장이 순위를 입력할 때 적은 실명이 그대로
--   공개면에 떴다는 뜻이다.
-- 개인정보보호법 §15·§17 상 실명 공개는 사전·명시적 동의여야 하므로 기본값이
--   실명일 수 없다. 기본을 닉네임으로 뒤집고, 실명은 본인이 고른 경우에만 쓴다.
--
-- NULL 을 남기는 이유는 public_ranking_consent 와 같다 — '아직 고른 적 없음'이며
--   그 상태의 해석은 닉네임이다. backfill(소급 실명 동의 간주)은 하지 않는다.
alter table public.profiles
  add column if not exists ranking_name_pref text;

alter table public.profiles drop constraint if exists profiles_ranking_name_pref_chk;
alter table public.profiles add constraint profiles_ranking_name_pref_chk
  check (ranking_name_pref is null or ranking_name_pref in ('nickname', 'real_name'));

comment on column public.profiles.ranking_name_pref is
  '순위표 표시 이름 선택. NULL=미선택(=닉네임 표시) / nickname / real_name. 기본이 실명이면 안 된다(개인정보보호법).';

-- public_ranking_consent 와의 관계(중복 아님 — 서로 다른 것을 가린다):
--   · public_ranking_consent  = 랭킹 옆에 '자주 가는 매장' 같은 부가 프로필을 붙여도 되는가
--     (체크인 이동 패턴 = 순위표에 원래 없던 새 정보라 별도 동의가 필요하다)
--   · ranking_name_pref       = 순위표에 이미 실려 있는 이름을 무엇으로 쓸까(닉네임/실명)
--   하나로 합치면 "매장 표기는 싫지만 실명은 괜찮다"(또는 그 반대)를 표현할 수 없어
--   동의가 뭉뚱그려진다. 두 항목을 각각 두되 설정 화면에서 한 블록으로 나란히 보여준다.
comment on column public.profiles.public_ranking_consent is
  '랭킹 프로필 공개 동의(부가 정보 — 자주 가는 매장 등). NULL=미응답(기본 비공개)/false=거부/true=동의. 표시 이름 선택은 ranking_name_pref 가 따로 맡는다.';

create or replace function public.set_my_ranking_name_pref(p_pref text)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_pref text := nullif(btrim(coalesce(p_pref, '')), '');
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  if v_pref is not null and v_pref not in ('nickname', 'real_name') then
    raise exception '표시 이름 값이 올바르지 않습니다' using errcode = '22023';
  end if;
  update public.profiles
     set ranking_name_pref = v_pref
   where id = v_uid;
  return coalesce(v_pref, 'nickname');
end;
$fn$;
revoke all on function public.set_my_ranking_name_pref(text) from public, anon;
grant execute on function public.set_my_ranking_name_pref(text) to authenticated, service_role;

-- 매장 순위표 렌더용 — 그 매장 순위에 등장하는 닉네임 중 실명 표시를 고른 사람만.
-- 왜 닉네임 배열이 아니라 venue_id 를 받나: 매장 누적 순위표는 닉네임이 수백 개까지
--   늘어난다. 배열로 넘기면 요청 크기가 참가자 수에 선형이 되고, 화면이 목록을 자르면
--   가려진 사람의 표기가 조용히 틀린다. 집계를 서버에 두면 호출 1회로 끝난다
--   (venue_rating_summary 를 서버 집계로 옮긴 것과 같은 이유).
-- 동명이인(닉네임이 2명 이상 프로필에 걸림)은 통째로 제외한다 — 남의 실명을 남에게
--   붙이는 오귀속은 '표기 없음'보다 훨씬 나쁘다.
create or replace function public.venue_ranking_real_name_optins(p_venue_id uuid)
returns table(nickname_key text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  with nicks as (
    select distinct lower(btrim(r.nickname)) as key
    from public.venue_rankings r
    where r.venue_id = p_venue_id
      and btrim(coalesce(r.nickname, '')) <> ''
  )
  select n.key
  from nicks n
  join public.profiles p
    on lower(btrim(p.nickname)) = n.key
   and coalesce(p.status::text, 'active') = 'active'
   and p.ranking_name_pref = 'real_name'
  group by n.key
  having count(*) = 1;
$fn$;
revoke all on function public.venue_ranking_real_name_optins(uuid) from public;
grant execute on function public.venue_ranking_real_name_optins(uuid) to anon, authenticated, service_role;
-- anon 부여는 의도다: 매장 순위표 자체가 비로그인에게 공개된 화면이고, 이 함수는
-- '실명을 써도 된다고 본인이 고른 닉네임'만 돌려준다. 미선택자는 아예 나오지 않는다.

-- ── #15 머니인 킹 옆 매장 = 가장 점수를 많이 딴 매장 ─────────────────────────
-- 오너 #15: "누리홀덤(로티아레나) 나누리(로티아레나) 이런 식으로, 가장 점수를 많이 딴 매장".
--
-- 왜 weekly_moneyin_kings 안으로 넣는가(별도 RPC 를 더 만들지 않는가):
--   화면은 이미 이 함수를 부른다. 매장을 따로 조회하면 왕복이 2회가 되고, 두 응답의
--   집계 창(주간 범위)이 갈릴 여지가 생긴다. 같은 CTE 에서 뽑으면 '이 점수를 어디서
--   벌었나'가 정의상 항상 일치한다. 반환 컬럼 추가라 DROP 후 재생성한다(행 변화 없음).
--
-- 집계 창은 킹 순위와 같은 주다. '이번 주 머니인 킹'의 괄호가 작년에 자주 갔던
--   매장을 가리키면 같은 줄 안에서 두 기간이 섞인다.
-- 동률 규칙: 점수 → 입상 횟수 → 최근 등록일 → 매장명. 무작위면 새로고침마다 바뀐다.
-- 승인·활성 매장만: 미승인/폐업 매장을 공개면에 띄우지 않는다(ranking_top_venues 와 동일 규약).
--
-- 개인정보 판단(왜 public_ranking_consent 게이트를 걸지 않는가):
--   '자주 가는 매장'(ranking_top_venues)은 checkins 기반이라 순위표에 원래 없던
--   이동 패턴을 새로 드러낸다 → 동의 게이트가 필요했다.
--   반면 '가장 점수를 많이 딴 매장'은 venue_rankings 에서 나온다. 그 (닉네임, 매장,
--   프라이즈) 쌍은 각 매장 페이지 순위표에 이미 공개돼 있고, 지금 표시 중인 점수의
--   출처 그 자체다. 새로 드러나는 정보가 없으므로 별도 동의 대상이 아니다.
--   (ranking_top_venues 와 동의 컬럼은 그대로 살려 둔다 — 되돌릴 수 있게.)
drop function if exists public.weekly_moneyin_kings(date, date, integer);
create function public.weekly_moneyin_kings(
  p_from date, p_to date default null, p_limit integer default 3)
returns table(nickname text, moneyin_points bigint, moneyin_count bigint,
              best_position integer, top_venue text)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $fn$
  with base as (
    select r.nickname, r.venue_id, r.prize, r.position, r.ranking_date
    from public.venue_rankings r
    where coalesce(btrim(r.nickname), '') <> ''
      and r.ranking_date >= p_from
      and (p_to is null or r.ranking_date < p_to)
  ),
  agg as (
    select b.nickname,
           coalesce(sum(public.prize_moneyin_points(b.prize)), 0)::bigint as moneyin_points,
           count(*)::bigint                                              as moneyin_count,
           min(b.position)::integer                                      as best_position
    from base b
    group by b.nickname
    order by 2 desc, 3 desc, 4 asc
    limit greatest(1, least(coalesce(p_limit, 3), 20))
  ),
  by_venue as (
    select b.nickname,
           v.name                                                        as venue_name,
           coalesce(sum(public.prize_moneyin_points(b.prize)), 0)::bigint as pts,
           count(*)::bigint                                              as cnt,
           max(b.ranking_date)                                           as last_date
    from base b
    join agg    a on a.nickname = b.nickname
    join public.venues v on v.id = b.venue_id
                        and v.approved = true
                        and coalesce(v.status::text, 'active') = 'active'
    group by b.nickname, v.name
  ),
  top as (
    select distinct on (nickname) nickname, venue_name
    from by_venue
    order by nickname, pts desc, cnt desc, last_date desc, venue_name asc
  )
  select a.nickname, a.moneyin_points, a.moneyin_count, a.best_position, t.venue_name
  from agg a
  left join top t on t.nickname = a.nickname
  order by a.moneyin_points desc, a.moneyin_count desc, a.best_position asc;
$fn$;
revoke all on function public.weekly_moneyin_kings(date, date, integer) from public;
grant execute on function public.weekly_moneyin_kings(date, date, integer) to anon, authenticated, service_role;

comment on function public.weekly_moneyin_kings(date, date, integer) is
  '주간 머니인 킹 TOP N + 같은 주에 가장 점수를 많이 딴 매장(오너 #15). 점수 규칙은 moneyin_points() 단일 정의.';

-- ── #9 상점 마크 '핫 스트릭' → '핫' (이름만) ─────────────────────────────────
-- key·emoji 는 절대 건드리지 않는다 — key 를 바꾸면 이미 해금·장착한 사람의 마크가
-- 사라지고(profiles.equipped_mark 가 문자열 key 다), emoji 는 닉네임 앞에 붙는 글리프다.
update public.shop_marks set name = '핫' where key = 'hot_streak' and name <> '핫';
