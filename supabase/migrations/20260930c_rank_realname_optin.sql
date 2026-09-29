-- 20260930c — 순위표 실명은 **본인이 켠 경우에만, 본인인증 실명으로** 보인다.
--
-- ⏳ 미적용 — 적용은 nuri-lead 가 MCP execute_sql 로 한다(파일 하단 '리허설' 먼저).
-- 🧪 2026-09-30 라이브 리허설(begin … rollback, PG 17.6) — 전문 + 자가검사 + 아래 리허설 블록:
--   결과 `REHEARSAL_OK`(모든 단언 통과 후 의도적으로 멈춤). 뒤이어 확인: _ranking_optin_real_name 0개 ·
--   global_ranking_totals 반환형 원래대로(real_name 없음) · 임시 행 0 · 시험 계정 pref NULL 그대로 → 롤백 확인.
--   음성 3역할(비로그인·일반 회원·타매장 업주) × 비동의 실명 노출 0건 / 옵트인 실명 1건 보임 · 전국 순위 동일 ·
--   양성(해당 매장 업주) 원문 실명 2/2 · 해제 후 실명 0건 · 제3자 불일치 0건.
--   적용 전 대조(현 라이브): 같은 조건에서 anon 노출 0 · **옵트인 실명 보임 0** — 켜도 안 보이던 결함 ① 재현.
-- 🧪 2026-09-30 오후 재리허설(PR #56 후속 + critical-reviewer 지적 1~3 반영판, 같은 방식) — `REHEARSAL_OK`:
--   업주·원문 없음·켠 사람 → optin_real_name=인증 실명 1 · 저장값 real_name NULL 유지 / 업주·원문 있음 → 원문 1 · optin NULL /
--   업주 시즌 표시 2/2(원문·인증 실명) / 지난 대회(optin_real_name): 음성 3역할 × 켠 사람 1 · 안 켠 사람 0 /
--   미인증 set_my_ranking_name_pref('real_name') → 42501 거부 · 'nickname' 은 저장 /
--   닉네임 재사용(A 비동의 기록 2000-01-05 → A 닉 변경 → B 가 그 닉+켬): venue_rankings_public 0 · 전국 0 · optins 0 · 시즌 0 ·
--   선두 0 · 업주 분기 0 / B 본인 행(2000-01-06) real_name·optin 모두 인증 실명 1 · 전국(B 행만) 1 · 전국(A 행 섞임) 0.
--   뒤이어 SELECT: 새 함수 0 · 반환형 원래대로 · 인덱스 0 · 임시 행/시즌/닉/이력 0 · 시험 계정 pref 원래대로 → 롤백 확인.
--   음성 대조(라이브, 롤백): 판정에서 nickname_owner_at 줄을 빼면 재사용 행 노출 1건.
-- 🧪 2026-09-30 저녁 재리허설(critical 재검토 R1·R2 반영판 — 판정 시각 = 대회 날짜(KST), 본인 이력으로 그날 닉네임 확인) — `REHEARSAL_OK`:
--   위 모든 단언 유지 + R1 재저장: 업주가 save_venue_rankings 로 A 의 날(09-25)·B 의 날(09-29) 재저장(created_at=now() 2/2 확인) 뒤
--   비로그인·업주 × (A 시절·늦은 첫 입력 09-25 · 빈 틈 09-27 · A 얻기 전 07-20 · A 얻은 당일 08-01 · A→C→A 순환 틈 08-15 ·
--   A 본인 08-25(A 는 해제 상태)) venue_rankings_public 0 · 전국(섞임) 0 · optins 0 · 시즌 0 · 선두 0 /
--   B 본인 09-29 옵트인 실명 1 · 전국(B 행만) 1 / 순환 중 A 가 켰을 때 A 본인 08-25 = 1, 틈·얻기 전·당일 = 0.
--   가짜 시각은 이력 DELETE+INSERT 로 넣었다(이력 UPDATE 는 트리거가 막는다 — 트랜잭션 안, 롤백). B 의 시각은 라이브 merge(09-24 05:53 UTC) 뒤로.
--   음성 대조(라이브, 롤백): 판정 날짜를 created_at(KST 날짜)으로 바꾸면 재저장 전 0 → 재저장 뒤 1(누출 재현).
--   뒤이어 SELECT: 새 함수 0 · 반환형 원래대로 · 인덱스 0 · 임시 행/시즌/닉/이력 0(이력 3건 = 라이브 merge 그대로) · 시험 계정 pref 원래대로.
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
-- ⚠ ACL: 시즌 RPC 넷·optins·_ranking_real_name_opted_in 은 CREATE OR REPLACE(ACL 보존)지만 관행대로 다시 적는다.
--   global_ranking_totals·venue_rankings_public 은 반환 열이 늘어 **DROP 후 재생성** → ACL 초기화되므로 반드시 다시 적는다.

-- ── 0. 닉네임으로 순위 행을 찾는 식에 맞춘 인덱스(행마다 전수 스캔 방지 — critical-reviewer 2026-09-30 지적 3) ──
create index if not exists idx_vr_nickname_ci on public.venue_rankings (lower(btrim(nickname)));

-- ── 1. 옵트인 실명 한 벌 ─────────────────────────────────────────────────────
-- 판정은 **이 함수 하나**다. 다른 모든 곳(공개 순위 RPC 여섯·optins·아래 _span)은 이 함수만 부른다.
-- 옵트인이면 본인인증 실명(trim), 아니면 NULL.
-- p_date = 그 순위 행의 대회 날짜(venue_rankings.ranking_date, KST 하루). 그날 **이 프로필이 실제로 그 닉네임을 가지고 있었을 때만** 연다.
--   (critical-reviewer 2026-09-30 지적 1 — 결함): 예전엔 닉네임 글자만으로 행을 이어서, 남이 버린 닉네임을 가져가
--   실명 공개를 켜면 **남의 입상 기록에 내 본인인증 실명**이 공개로 붙었다.
--   (재검토 R1): 기록 시각(created_at)으로 재면 안 된다 — save_venue_rankings 는 delete+insert 라 재저장·늦은 첫 입력마다
--   created_at 이 now() 가 되어 **지금 주인**으로 판정됐다. 그래서 대회 날짜로 잰다.
--   (재검토 R2): 공용 nickname_owner_at 은 '놓은' 기록만 봐서, 아무도 안 쓰던 틈·지금 주인이 얻기 전 날짜가 지금 주인으로 떨어진다.
--   그래서 이 프로필 **자신의** 이력으로 '그날 끝 시각의 내 닉네임'을 구한다(공용 함수는 다른 곳이 써서 건드리지 않는다):
--     그날 끝 이후 내 첫 변경의 old_nickname — 없으면(그 뒤 안 바꿈) 지금 닉네임, 단 가입(joined_at)이 그날 끝 전일 때만.
--   그리고 그날 KST 하루 안에 이 닉네임이 **누구에게서든** 바뀐(얻거나 놓은) 기록이 있으면 닫는다 — 그날 두 사람이 나눠 가졌을 수 있다.
--   (그날 끝에 내가 가졌고 그날 이 닉네임 변경이 없으면, 그날 이 닉네임은 나만 가졌다 — 닉네임은 대소문자·공백 무시 유일.)
create or replace function public._ranking_optin_real_name(p_nickname text, p_date date)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with q as (
    select lower(btrim(coalesce(p_nickname, ''))) as k,
           (p_date::timestamp at time zone 'Asia/Seoul')       as day_start,
           ((p_date + 1)::timestamp at time zone 'Asia/Seoul') as day_end
  )
  select btrim(p.real_name)
    from public.profiles p, q
   where q.k <> '' and p_date is not null
     and lower(btrim(p.nickname)) = q.k                        -- 닉네임은 대소문자·공백 무시 유일(uniq_profiles_nickname_ci)
     and coalesce(p.status::text, 'active') = 'active'
     and p.ranking_name_pref = 'real_name'
     and p.ci_hash is not null
     and nullif(btrim(coalesce(p.real_name, '')), '') is not null
     -- 그날 끝 시각에 이 프로필의 닉네임이 바로 이것이었다(내 이력 기준 — 얻기 전·놓은 뒤·빈 틈은 NULL)
     and lower(btrim(coalesce(
           (select h.old_nickname from public.nickname_history h
             where h.user_id = p.id and h.changed_at >= q.day_end
             order by h.changed_at, h.id limit 1),
           case when p.joined_at < q.day_end then p.nickname end,
           ''))) = q.k
     -- 그날 KST 하루 안에 이 닉네임을 누가 얻거나 놓은 기록이 없다
     and not exists (
       select 1 from public.nickname_history h
        where h.changed_at >= q.day_start and h.changed_at < q.day_end
          and (lower(btrim(h.old_nickname)) = q.k or lower(btrim(h.new_nickname)) = q.k)
     )
     -- 20260918b: 그 닉네임으로 적힌 순위 행에 **다른** 실명이 하나라도 있으면(=워크인 손님이 섞였으면) 닫는다.
     and not exists (
       select 1 from public.venue_rankings r
        where lower(btrim(r.nickname)) = q.k
          and nullif(btrim(coalesce(r.real_name, '')), '') is not null
          and lower(btrim(r.real_name)) is distinct from lower(btrim(p.real_name))
     )
   limit 1;
$$;
revoke all on function public._ranking_optin_real_name(text, date) from public, anon, authenticated;
grant execute on function public._ranking_optin_real_name(text, date) to service_role;

-- 여러 행을 한 줄로 합친 표(시즌·전국·optins)용 — 합쳐진 행 **전부**가 위 판정을 통과하고 같은 실명일 때만 연다.
--   (한 행이라도 다른 주인 시절 기록이면 NULL — 남의 기록이 섞인 합계에 내 실명을 붙이지 않는다.)
--   판정 자체는 하지 않는다. 행마다 _ranking_optin_real_name 을 부를 뿐이다.
create or replace function public._ranking_optin_real_name_span(p_venue_id uuid, p_nickname text, p_from date, p_to date)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when count(*) > 0 and count(o.name) = count(*) and count(distinct o.name) = 1 then min(o.name) end
    from public.venue_rankings r
    cross join lateral (select public._ranking_optin_real_name(r.nickname, r.ranking_date) as name) o
   where btrim(coalesce(p_nickname, '')) <> ''
     and lower(btrim(r.nickname)) = lower(btrim(p_nickname))
     and (p_venue_id is null or r.venue_id = p_venue_id)
     and (p_from is null or r.ranking_date >= p_from)
     and (p_to is null or r.ranking_date <= p_to);
$$;
revoke all on function public._ranking_optin_real_name_span(uuid, text, date, date) from public, anon, authenticated;
grant execute on function public._ranking_optin_real_name_span(uuid, text, date, date) to service_role;

-- 옛 판정 함수는 같은 판정에 묶어 둔다(이 파일 적용 뒤 호출부 0 — 남겨 두는 것은 되돌리기 안전판. 날짜는 오늘 KST).
create or replace function public._ranking_real_name_opted_in(p_nickname text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public._ranking_optin_real_name(p_nickname, (now() at time zone 'Asia/Seoul')::date) is not null;
$$;
revoke all on function public._ranking_real_name_opted_in(text) from public, anon, authenticated;
grant execute on function public._ranking_real_name_opted_in(text) to service_role;

-- ── 1-b. 실명 공개 선택은 본인인증 뒤에만(critical-reviewer 2026-09-30 지적 2) ──────────────
-- 화면은 미인증에게 '실명'을 막아 두지만 RPC 는 받고 있었다. 서버도 같은 조건으로 거부한다.
create or replace function public.set_my_ranking_name_pref(p_pref text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
  if v_pref = 'real_name' and not exists (
       select 1 from public.profiles p
        where p.id = v_uid and p.ci_hash is not null
          and nullif(btrim(coalesce(p.real_name, '')), '') is not null) then
    raise exception '본인인증을 마친 뒤에 실명 공개를 고를 수 있습니다' using errcode = '42501';
  end if;
  update public.profiles
     set ranking_name_pref = v_pref
   where id = v_uid;
  return coalesce(v_pref, 'nickname');
end;
$$;
revoke all on function public.set_my_ranking_name_pref(text) from public, anon;
grant execute on function public.set_my_ranking_name_pref(text) to authenticated, service_role;

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
   where public._ranking_optin_real_name_span(p_venue_id, n.key, null, null) is not null;
$$;
revoke all on function public.venue_ranking_real_name_optins(uuid) from public;
grant execute on function public.venue_ranking_real_name_optins(uuid) to anon, authenticated, service_role;

-- ── 3. 공개 순위 RPC 다섯 곳 — 업무 경로는 원문, 그 밖은 옵트인 실명만 ──────────────
-- 리드 결정(2026-09-30, PR #56 후속 ①): 업주(장부 권한자)가 **공개 매장 페이지**를 볼 때 이름은
--   업주가 적은 원문 → 없으면 본인이 켠 사람의 본인인증 실명(일반 방문자와 같은 값) → 둘 다 없으면 닉네임.
-- · venue_rankings_public 의 real_name 은 **저장값**이다 — 순위 편집기(VenueManageTab)가 이 값을 그대로 다시 저장한다.
--   그래서 옵트인 실명은 real_name 에 섞지 않고 **별도 열 optin_real_name**(누가 불러도 같은 값)으로 준다.
--   화면은 real_name → optin_real_name → 닉네임 순으로 고른다. 홈 '지난 대회'(오너 지시 ②)는 optin_real_name 만 쓴다
--   — 업주가 홈을 봐도 켜지 않은 사람은 닉네임이다.
--   반환 열이 늘어 **DROP 후 재생성**(ACL 초기화 → 아래 REVOKE/GRANT 필수).
-- · 시즌 RPC 넷(current_season_standings·season_results·venue_hall_of_fame·venues_season_leaders)은 편집기가
--   다시 저장하지 않는 표시 전용이라 업무 경로에서 원문 → 옵트인 실명 순으로 바로 합친다.
-- · 업무 경로의 옵트인 분기도 같은 판정(시점 주인 포함)을 거친다.
drop function if exists public.venue_rankings_public(uuid[], date[]);
create function public.venue_rankings_public(p_venue_ids uuid[], p_dates date[] default null::date[])
returns table(id uuid, venue_id uuid, ranking_date date, "position" integer, nickname text, real_name text, prize text, event_name text, optin_real_name text)
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
         case when v.can_see then r.real_name else o.name end as real_name,
         r.prize, r.event_name,
         o.name as optin_real_name
    from public.venue_rankings r
    join v on v.vid = r.venue_id
    cross join lateral (select public._ranking_optin_real_name(r.nickname, r.ranking_date) as name) o
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
         case when public._can_see_ranking_real_names(p_venue_id)
              then coalesce(nullif(btrim(s.real_name), ''), o.name)
              else o.name end,
         s.points, s.prize_man, s.appearances, s.best_position
    from public._current_season_standings_raw(p_venue_id) s
    left join lateral (
      select public._ranking_optin_real_name_span(p_venue_id, s.nickname, ss.starts_on, ss.ends_on) as name
        from public.venue_seasons ss
       where ss.venue_id = p_venue_id and ss.status = 'active'
       limit 1
    ) o on true
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
         case when public._can_see_ranking_real_names(s.venue_id)
              then coalesce(nullif(btrim(r.real_name), ''), public._ranking_optin_real_name_span(s.venue_id, r.nickname, s.starts_on, s.ends_on))
              else public._ranking_optin_real_name_span(s.venue_id, r.nickname, s.starts_on, s.ends_on) end,
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
         case when public._can_see_ranking_real_names(p_venue_id)
              then coalesce(nullif(btrim(r.real_name), ''), public._ranking_optin_real_name_span(p_venue_id, r.nickname, s.starts_on, s.ends_on))
              else public._ranking_optin_real_name_span(p_venue_id, r.nickname, s.starts_on, s.ends_on) end,
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
    select s.venue_id, s.name as season_name, s.starts_on, s.ends_on, vr.nickname, max(vr.real_name) as real_name,
           sum(public.placement_points(s.venue_id, vr.position))::int as points
      from s join public.venue_rankings vr
        on vr.venue_id = s.venue_id and vr.ranking_date >= s.starts_on and vr.ranking_date <= s.ends_on
       and coalesce(trim(vr.nickname), '') <> ''
     group by s.venue_id, s.name, s.starts_on, s.ends_on, vr.nickname
  ), lead as (
    select distinct on (venue_id) venue_id, season_name, starts_on, ends_on, nickname, real_name, points
      from agg order by venue_id, points desc, nickname
  )
  select l.venue_id, l.season_name, l.nickname,
         case when public._can_see_ranking_real_names(l.venue_id)
              then coalesce(nullif(btrim(l.real_name), ''), public._ranking_optin_real_name_span(l.venue_id, l.nickname, l.starts_on, l.ends_on))
              else public._ranking_optin_real_name_span(l.venue_id, l.nickname, l.starts_on, l.ends_on) end,
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
         public._ranking_optin_real_name_span(null, r.nickname, p_since, null) as real_name
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
  foreach f in array array['public._ranking_optin_real_name(text,date)', 'public._ranking_optin_real_name_span(uuid,text,date,date)',
                           'public._ranking_real_name_opted_in(text)'] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception '20260930c: 내부 함수 % 가 anon/authenticated 에 열려 있다', f;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.set_my_ranking_name_pref(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.set_my_ranking_name_pref(text)', 'execute') then
    raise exception '20260930c: set_my_ranking_name_pref ACL 이 틀렸다(anon 닫힘·authenticated 열림이어야 한다)';
  end if;
  foreach f in array array['public.global_ranking_totals(date)', 'public.venue_rankings_public(uuid[],date[])',
                           'public.current_season_standings(uuid)', 'public.season_results(uuid)',
                           'public.venue_hall_of_fame(uuid)', 'public.venues_season_leaders(uuid[])',
                           'public.venue_ranking_real_name_optins(uuid)'] loop
    if not has_function_privilege('anon', f, 'execute') then
      raise exception '20260930c: 공개 읽기 RPC % 를 anon 이 못 부른다(화면이 빈다)', f;
    end if;
  end loop;
  foreach f in array array['public.global_ranking_totals(date)', 'public.venue_rankings_public(uuid[],date[])',
                           'public.current_season_standings(uuid)', 'public.season_results(uuid)',
                           'public.venue_hall_of_fame(uuid)', 'public.venues_season_leaders(uuid[])',
                           'public.venue_ranking_real_name_optins(uuid)', 'public._ranking_optin_real_name(text,date)',
                           'public._ranking_optin_real_name_span(uuid,text,date,date)', 'public.set_my_ranking_name_pref(text)'] loop
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
--   임시 순위 행 3개(매장 f35b, 날짜 2026-09-26): OPTIN 닉네임 · NOOPT 닉네임+업주가 적은 실명 · 닉네임 없는 옛 행+실명
--   + 닉네임 시간축 반례 행(2026-07-20~09-29, 가짜 이력 시각) — 블록 안 주석 참고
-- ────────────────────────────────────────────────────────────────────────────
-- begin;
--   <위 1~5 전문>
--   do $rh$
--   declare
--     V uuid := 'f35b42d1-2d54-4905-95c1-1fda24e0f178';
--     D date := '2026-09-26';   -- B 가입(09-18)·B merge 이력(09-24 05:53 UTC) 이후, 라이브 순위 행(09-03·09-10)과 겹치지 않는 날
--     OPTIN uuid := '47360d8e-fd0e-49f3-ab3f-22e1fc1e9e60';
--     NOOPT uuid := 'fd14c2dc-d994-46e4-8f12-b6cf38104983';
--     OWNER uuid := '7e435684-2c8c-458d-985c-31b784a44893';
--     K text := 'rh_reuse_0930';
--     n_opt text; n_no text; rn_opt text; rn_no text;
--     who record; got int; leak int;
--   begin
--     select nickname, btrim(real_name) into n_opt, rn_opt from profiles where id = OPTIN;
--     select nickname, btrim(real_name) into n_no, rn_no from profiles where id = NOOPT;
--     update profiles set ranking_name_pref = 'real_name' where id = OPTIN;
--     insert into venue_rankings(venue_id, ranking_date, position, nickname, real_name) values
--       (V, D, 1, n_opt, null), (V, D, 2, n_no, '리허설비동의실명'), (V, D, 3, '', '리허설옛행실명');
--     insert into venue_seasons(venue_id, name, starts_on, ends_on, status) values (V, '리허설시즌', D, D, 'active');
--
--     -- 음성: 비로그인 · 일반 회원 · 타매장 업주
--     for who in select * from (values (null::uuid), ('708de904-913e-4082-8803-8a2766b342f9'::uuid), ('1a8c5117-a4c7-42fe-abb6-021544adcd16'::uuid)) t(uid) loop
--       perform set_config('request.jwt.claims', case when who.uid is null then '' else json_build_object('sub', who.uid, 'role', 'authenticated')::text end, true);
--       select count(*) into leak from venue_rankings_public(array[V], array[D]) where real_name in ('리허설비동의실명', '리허설옛행실명');
--       if leak <> 0 then raise exception 'FAIL 음성 %: 비동의 실명 % 건 노출', who.uid, leak; end if;
--       select count(*) into got from venue_rankings_public(array[V], array[D]) where nickname = n_opt and real_name = rn_opt;
--       if got <> 1 then raise exception 'FAIL 양성(옵트인) %: %', who.uid, got; end if;
--       select count(*) into leak from global_ranking_totals(D) where real_name is not null and nickname <> n_opt;
--       if leak <> 0 then raise exception 'FAIL 전국 %: %', who.uid, leak; end if;
--       select count(*) into got from global_ranking_totals(D) where nickname = n_opt and real_name = rn_opt;
--       if got <> 1 then raise exception 'FAIL 전국 양성 %', who.uid; end if;
--       select count(*) into got from venue_ranking_real_name_optins(V) where nickname_key = lower(btrim(n_opt));
--       if got <> 1 then raise exception 'FAIL optins %', who.uid; end if;
--       select count(*) into leak from venue_ranking_real_name_optins(V) where nickname_key = lower(btrim(n_no));
--       if leak <> 0 then raise exception 'FAIL optins 비동의 %', who.uid; end if;
--       -- ② 홈 '지난 대회'(optin_real_name): 켠 사람 실명 1 · 안 켠 사람(업주가 실명을 적었어도) 0
--       select count(*) into got from venue_rankings_public(array[V], array[D]) where nickname = n_opt and optin_real_name = rn_opt;
--       if got <> 1 then raise exception 'FAIL ② 지난 대회 켠 사람 %: %', who.uid, got; end if;
--       select count(*) into leak from venue_rankings_public(array[V], array[D]) where nickname is distinct from n_opt and optin_real_name is not null;
--       if leak <> 0 then raise exception 'FAIL ② 지난 대회 안 켠 사람 %: %', who.uid, leak; end if;
--       -- 시즌 표시(방문자): 켠 사람만 실명
--       select count(*) into got from current_season_standings(V) where nickname = n_opt and real_name = rn_opt;
--       if got <> 1 then raise exception 'FAIL 시즌 방문자 켠 사람 %', who.uid; end if;
--       select count(*) into leak from current_season_standings(V) where nickname = n_no and real_name is not null;
--       if leak <> 0 then raise exception 'FAIL 시즌 방문자 원문 노출 %', who.uid; end if;
--     end loop;
--
--     -- 지적 2: 미인증 회원은 서버에서도 '실명'을 못 고른다(708de904 = 미인증)
--     perform set_config('request.jwt.claims', json_build_object('sub', '708de904-913e-4082-8803-8a2766b342f9', 'role', 'authenticated')::text, true);
--     begin
--       perform set_my_ranking_name_pref('real_name');
--       raise exception 'FAIL 지적2: 미인증인데 real_name 저장됨';
--     exception when insufficient_privilege then null;
--     end;
--     if (select set_my_ranking_name_pref('nickname')) <> 'nickname' then raise exception 'FAIL 지적2: nickname 저장 실패'; end if;
--
--     -- 양성(업무 경로): 해당 매장 업주는 업주가 적은 원문 실명을 그대로 받는다(순위 편집기 저장이 원문을 잃지 않게)
--     perform set_config('request.jwt.claims', json_build_object('sub', OWNER, 'role', 'authenticated')::text, true);
--     select count(*) into got from venue_rankings_public(array[V], array[D]) where real_name in ('리허설비동의실명', '리허설옛행실명');
--     if got <> 2 then raise exception 'FAIL 양성(업주): 원문 실명 %/2', got; end if;
--     -- ① 업주가 공개 페이지를 볼 때: 원문 없음·켠 사람 → 인증 실명(optin_real_name) · 저장값 real_name 은 NULL 그대로
--     select count(*) into got from venue_rankings_public(array[V], array[D]) where nickname = n_opt and real_name is null and optin_real_name = rn_opt;
--     if got <> 1 then raise exception 'FAIL ① 업주·원문 없음·켠 사람: %', got; end if;
--     --   원문 있음 → 원문(저장값) · 안 켠 사람이라 optin_real_name 은 NULL
--     select count(*) into got from venue_rankings_public(array[V], array[D]) where nickname = n_no and real_name = '리허설비동의실명' and optin_real_name is null;
--     if got <> 1 then raise exception 'FAIL ① 업주·원문 있음: %', got; end if;
--     --   시즌 표시 전용 RPC 는 서버가 합친다: 켠 사람 → 인증 실명, 원문 있는 사람 → 원문
--     select count(*) into got from current_season_standings(V) where (nickname = n_opt and real_name = rn_opt) or (nickname = n_no and real_name = '리허설비동의실명');
--     if got <> 2 then raise exception 'FAIL ① 업주 시즌 표시 %/2', got; end if;
--
--     -- 끄면 즉시 닉네임
--     update profiles set ranking_name_pref = 'nickname' where id = OPTIN;
--     perform set_config('request.jwt.claims', '', true);
--     select count(*) into leak from venue_rankings_public(array[V], array[D]) where real_name is not null or optin_real_name is not null;
--     if leak <> 0 then raise exception 'FAIL 해제 후에도 실명 % 건', leak; end if;
--
--     -- 제3자 불일치(20260918b)
--     update profiles set ranking_name_pref = 'real_name' where id = OPTIN;
--     update venue_rankings set real_name = '다른사람' where venue_id = V and ranking_date = D and position = 1;
--     select count(*) into leak from venue_rankings_public(array[V], array[D]) where real_name is not null or optin_real_name is not null;
--     if leak <> 0 then raise exception 'FAIL 제3자 불일치인데 % 건', leak; end if;
--     update profiles set ranking_name_pref = 'nickname' where id = OPTIN;
--
--     -- ── 닉네임 시간축 반례(지적 1·R1·R2) ── 닉네임 변경은 트리거가 now() 로 이력을 남긴다 → 곧바로 지우고 같은 내용을 가짜 과거 시각으로 다시 넣는다(이력 UPDATE 는 트리거가 막는다, DELETE 는 트랜잭션 안에서만·롤백).
--     --   B(OPTIN) 의 라이브 merge 이력(2026-09-24 05:53 UTC)과 섞이지 않게 B 의 시각은 그 뒤(09-28)로 잡는다. A(NOOPT) 는 라이브 이력 0.
--     -- A→C→A 순환: A 가 08-01 K 를 얻고 → 08-10 놓고(K→C) → 08-20 되찾는다
--     update profiles set nickname = K where id = NOOPT;
--     with d as (delete from nickname_history where user_id = NOOPT and changed_at = now() returning *) insert into nickname_history(user_id, old_nickname, new_nickname, changed_at, changed_by, source) select user_id, old_nickname, new_nickname, '2026-08-01 12:00+09', changed_by, source from d;
--     update profiles set nickname = 'rh_c_0930' where id = NOOPT;
--     with d as (delete from nickname_history where user_id = NOOPT and changed_at = now() returning *) insert into nickname_history(user_id, old_nickname, new_nickname, changed_at, changed_by, source) select user_id, old_nickname, new_nickname, '2026-08-10 12:00+09', changed_by, source from d;
--     update profiles set nickname = K where id = NOOPT;
--     with d as (delete from nickname_history where user_id = NOOPT and changed_at = now() returning *) insert into nickname_history(user_id, old_nickname, new_nickname, changed_at, changed_by, source) select user_id, old_nickname, new_nickname, '2026-08-20 12:00+09', changed_by, source from d;
--     update profiles set ranking_name_pref = 'real_name' where id = NOOPT;   -- A 가 잠시 켠다(A 본인 양성·빈 틈 확인용)
--     insert into venue_rankings(venue_id, ranking_date, position, nickname) values
--       (V, '2026-07-20', 1, K),   -- A 가 얻기 전
--       (V, '2026-08-01', 1, K),   -- 얻은 당일(그날 변경 기록)
--       (V, '2026-08-15', 1, K),   -- 빈 틈(A 는 C 였다)
--       (V, '2026-08-25', 1, K);   -- A 본인
--     select count(*) into leak from venue_rankings_public(array[V], array['2026-07-20', '2026-08-01', '2026-08-15']::date[]) where real_name is not null or optin_real_name is not null;
--     if leak <> 0 then raise exception 'FAIL R2 순환·얻기 전·당일 %', leak; end if;
--     select count(*) into got from venue_rankings_public(array[V], array['2026-08-25'::date]) where optin_real_name = rn_no;
--     if got <> 1 then raise exception 'FAIL R2 A 본인 양성 %', got; end if;
--     update profiles set ranking_name_pref = 'nickname' where id = NOOPT;
--
--     -- A 가 09-25 1위(늦은 첫 입력: 행은 지금 들어간다) → 09-26 A 가 K 를 놓음 → 09-27 빈 틈 행 → 09-28 B 가 K 를 얻고 켬 → 09-29 B 1위
--     insert into venue_rankings(venue_id, ranking_date, position, nickname) values (V, '2026-09-25', 1, K);
--     update profiles set nickname = 'rh_a2_0930' where id = NOOPT;
--     with d as (delete from nickname_history where user_id = NOOPT and changed_at = now() returning *) insert into nickname_history(user_id, old_nickname, new_nickname, changed_at, changed_by, source) select user_id, old_nickname, new_nickname, '2026-09-26 12:00+09', changed_by, source from d;
--     insert into venue_rankings(venue_id, ranking_date, position, nickname) values (V, '2026-09-27', 1, K);
--     update profiles set nickname = K, ranking_name_pref = 'real_name' where id = OPTIN;
--     with d as (delete from nickname_history where user_id = OPTIN and changed_at = now() returning *) insert into nickname_history(user_id, old_nickname, new_nickname, changed_at, changed_by, source) select user_id, old_nickname, new_nickname, '2026-09-28 12:00+09', changed_by, source from d;
--     insert into venue_rankings(venue_id, ranking_date, position, nickname) values (V, '2026-09-29', 1, K);
--     update venue_seasons set starts_on = '2026-07-01', ends_on = '2026-09-29' where venue_id = V and name = '리허설시즌';
--
--     -- R1 재저장: 업주가 A 의 날(09-25)과 B 의 날(09-29)을 순위 편집기 그대로 다시 저장 → created_at 이 now() 로 바뀐다
--     perform set_config('request.jwt.claims', json_build_object('sub', OWNER, 'role', 'authenticated')::text, true);
--     perform save_venue_rankings(V, '2026-09-25', jsonb_build_array(jsonb_build_object('nickname', K)), '');
--     perform save_venue_rankings(V, '2026-09-29', jsonb_build_array(jsonb_build_object('nickname', K)), '');
--     select count(*) into got from venue_rankings where venue_id = V and nickname = K and ranking_date in ('2026-09-25', '2026-09-29') and created_at = now();
--     if got <> 2 then raise exception 'FAIL R1 전제: 재저장 행 created_at=now() 가 %/2', got; end if;
--
--     for who in select * from (values (null::uuid), (OWNER)) t(uid) loop
--       perform set_config('request.jwt.claims', case when who.uid is null then '' else json_build_object('sub', who.uid, 'role', 'authenticated')::text end, true);
--       -- A 시절·빈 틈·얻기 전·재저장 행 → 모든 공개 경로 0
--       select count(*) into leak from venue_rankings_public(array[V], array['2026-07-20', '2026-08-01', '2026-08-15', '2026-08-25', '2026-09-25', '2026-09-27']::date[])
--         where real_name is not null or optin_real_name is not null;
--       if leak <> 0 then raise exception 'FAIL 재사용 venue_rankings_public %: %', who.uid, leak; end if;
--       select count(*) into leak from global_ranking_totals('2026-07-01') where nickname = K and real_name is not null;
--       if leak <> 0 then raise exception 'FAIL 재사용 전국(섞임) %', who.uid; end if;
--       select count(*) into leak from venue_ranking_real_name_optins(V) where nickname_key = K;
--       if leak <> 0 then raise exception 'FAIL 재사용 optins %', who.uid; end if;
--       select count(*) into leak from current_season_standings(V) where nickname = K and real_name is not null;
--       if leak <> 0 then raise exception 'FAIL 재사용 시즌 %', who.uid; end if;
--       select count(*) into leak from venues_season_leaders(array[V]) where nickname = K and real_name is not null;
--       if leak <> 0 then raise exception 'FAIL 재사용 선두 %', who.uid; end if;
--       -- B 본인 행(09-29, 재저장 뒤에도) → 인증 실명 1
--       select count(*) into got from venue_rankings_public(array[V], array['2026-09-29'::date]) where nickname = K and optin_real_name = rn_opt;
--       if got <> 1 then raise exception 'FAIL 재사용 B 본인 양성 %: %', who.uid, got; end if;
--       select count(*) into got from global_ranking_totals('2026-09-29') where nickname = K and real_name = rn_opt;
--       if got <> 1 then raise exception 'FAIL 재사용 전국(B 만) %: %', who.uid, got; end if;
--     end loop;
--
--     raise exception 'REHEARSAL_OK';  -- 전부 통과하면 이 문구로 멈춘다(= rollback)
--   end
--   $rh$;
-- rollback;
