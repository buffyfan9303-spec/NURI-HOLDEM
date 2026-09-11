-- ============================================================================
-- 장부 접수대 손님 검색을 매장 범위 안으로 (2026-09-11 · 보안 점검 M2)
-- 파일명: supabase/migrations/20260911h_ledger_player_search_venue_scope.sql
--
-- 원인
--   search_registered_players 는 호출자 게이트(can_access_ledger)만 있고 **검색 대상에 범위가 없다**.
--   profiles 전체를 nickname·real_name·name 부분 일치로 훑고 실명을 그대로 내려보낸다.
--   그래서 어느 매장이든 장부 권한 하나만 받으면, 그 매장에 한 번도 온 적 없는 사람의 실명까지
--   두 글자 입력으로 나온다 — 직원 한 명이 플랫폼 전 회원 실명을 조회할 수 있는 상태다.
--   (보안 표준 §6 위반. 20260910b 가 순위표에 세운 '실명은 볼 자격이 있는 사람에게만' 과도 어긋난다.)
--
-- 바꾸는 것
--   ① '이 매장 손님' 을 정의한다 — QR 체크인(checkins) · 업주 CRM 연결(customer_profiles.user_id)
--      · 이 매장 게임 예약(schedule_reservations → schedules.venue_id) 중 하나라도 있으면 손님이다.
--      이 사람들은 종전과 똑같이 부분 일치 + 실명 표시(직원이 장부에서 이미 다루는 이름이다).
--   ② 그 밖의 전 회원은 **닉네임 정확 일치**만 나오고 **실명 칸은 비운다**.
--      정확 일치'만'으로는 부족하다 — 닉네임은 순위표·커뮤니티에서 공개라 목록을 만들 수 있고
--      그러면 닉네임→실명 매핑으로 같은 유출이 된다. 실제 차단선은 실명을 빼는 쪽이다.
--   ③ ACL 재선언. 읽기 RPC 지만 실명을 싣는 함수라 anon 은 회수한다
--      (비로그인은 게이트에서 어차피 0행이었다 — 실질 동작 변화 없음).
--
--   접수대 기능은 죽지 않는다: 처음 오는 손님은 ⓐ 닉네임을 정확히 대면 회원으로 잡히고,
--   ⓑ 아니면 종전 그대로 '입력값 그대로 등록'(비회원) 으로 장부에 오른다. ledger_players 는
--   user_id 를 저장하지 않고 name 문자열만 넣으므로(src/api/ledger.ts:944) 이 검색은
--   **오타 방지용 자동완성**이고, 좁혀도 끊기는 데이터 연결이 없다.
--
-- 일부러 안 바꾸는 것
--   · **인덱스를 새로 깔지 않는다.** 닉네임 정확 일치가 쓰는 표현식
--     `lower(btrim(nickname))` 은 이미 `uniq_profiles_nickname_ci`(20260601b:37,
--     `on public.profiles (lower(trim(nickname))) where nickname is not null`)가 인덱싱하고 있다
--     — `trim(x)` 는 파서가 `btrim(x)` 로 접으므로 완전히 같은 표현식이고, 등호 조건이 nickname 에
--     strict 이라 플래너가 부분 인덱스 술어(`is not null`)를 증명해 그대로 쓴다.
--     같은 인덱스를 하나 더 만들면 profiles 의 모든 쓰기에 영구 비용만 붙고, 라이브에서
--     가장 뜨거운 테이블에 빌드 동안 ACCESS EXCLUSIVE 락을 잡는다. 얻는 것이 0이라 안 만든다.
--   · visits 는 종전대로 count(*) 다. 20260905l 이 못박은 정본(KST 날짜 distinct)과 다르지만
--     이번 건은 노출 범위 수정이라 숫자 의미까지 같이 바꾸지 않는다 — 별건으로 남긴다.
--   · profiles.status 필터를 넣지 않는다. 제재 중인 단골이 접수대에서 사라지면 그게 더 큰 사고다.
--   · 권한 실패는 예외가 아니라 0행 그대로. 화면 진입은 이미 can_access_ledger 로 막혀 있고
--     호출부는 error 를 빈 배열로 삼킨다 — 예외로 바꿔도 화면이 달라지지 않는다.
--   · 부분 일치 분기의 '%'·'_' 이스케이프는 안 한다. 이제 그 분기는 이 매장 손님 집합 안이라
--     '%' 를 쳐도 그 매장 손님만 나온다.
--   · 반환 컬럼 4개 유지 — user_id 는 자동완성 목록의 React key 로 실제로 쓰인다.
--     §6 최소화는 실명 쪽(비방문자 null)에서 달성한다.
--   · 형제 함수 search_members_for_ranking 은 손대지 않는다 — 매장 인자가 없는 순위 입력용이라
--     여기서 범위를 걸 수 없다(별도 항목). 대신 **장부 화면의 그 호출은 클라이언트에서 걷어낸다**.
--
-- 바뀌는 것 중 눈에 보이는 것(기록)
--   · 정렬이 `visits desc, nickname` → `정확일치 우선, visits desc, nickname` 이 된다.
--     닉네임을 통째로 친 경우 그 사람이 첫 줄에 온다.
--
-- 롤백
--   supabase/baseline/2026-07-20-live-snapshot.sql 4051줄 본문으로 다시 덮은 뒤
--   revoke all … from public; 만 남기면 PUBLIC 기본 GRANT 상태(= 종전 anon 실행 가능)로 돌아간다.
--   (되돌리면 전 회원 실명 부분 일치가 그대로 살아난다 — 되돌릴 이유가 없으면 하지 마라.)
--   인덱스는 만들지 않으므로 되돌릴 것이 없다.
-- ============================================================================

create or replace function public.search_registered_players(p_venue_id uuid, p_query text)
returns table(user_id uuid, real_name text, nickname text, visits integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- 이 매장 체크인 집계 = 방문 횟수의 출처(checkins_venue_idx 로 한 번만 훑는다).
  with v as (
    select c.user_id as uid, count(*)::int as n
      from public.checkins c
     where c.venue_id = p_venue_id
     group by c.user_id
  ),
  -- '이 매장 손님' — 셋 중 하나라도 있으면 손님이다.
  --   체크인(왔다) · CRM 연결(업주가 명단에 넣었다) · 예약(오늘 온다).
  rel as (
    select uid from v
    union
    select cp.user_id from public.customer_profiles cp
     where cp.venue_id = p_venue_id and cp.user_id is not null
    union
    select r.user_id from public.schedule_reservations r
      join public.schedules s on s.id = r.schedule_id
     where s.venue_id = p_venue_id and r.user_id is not null
  ),
  hit as (
    -- ① 이 매장 손님: 종전과 같은 부분 일치 + 실명 표시.
    select p.id as uid,
           p.real_name as rn,
           p.nickname as nick,
           coalesce(v.n, 0) as vis,
           coalesce(lower(btrim(p.nickname)) = lower(btrim(coalesce(p_query, ''))), false) as is_exact
      from rel
      join public.profiles p on p.id = rel.uid
      left join v on v.uid = p.id
     where public.can_access_ledger(p_venue_id)
       and btrim(coalesce(p_query, '')) <> ''
       and (p.nickname  ilike '%' || btrim(p_query) || '%'
         or p.real_name ilike '%' || btrim(p_query) || '%'
         or p.name      ilike '%' || btrim(p_query) || '%')
    union all
    -- ② 그 밖의 전 회원: 닉네임을 통째로 맞춰야 한다. 실명 칸은 비운다 —
    --    닉네임 목록만 있으면 조각 검색 없이도 전 회원 신원을 매핑할 수 있어서, 차단선은 여기다.
    --    uniq_profiles_nickname_ci(lower(btrim(nickname))) 가 이 조건을 그대로 받는다.
    select p.id, null::text, p.nickname, 0, true
      from public.profiles p
     where public.can_access_ledger(p_venue_id)
       and btrim(coalesce(p_query, '')) <> ''
       and lower(btrim(p.nickname)) = lower(btrim(p_query))
       and not exists (select 1 from rel where rel.uid = p.id)
  )
  select h.uid, h.rn, h.nick, h.vis
    from hit h
   order by h.is_exact desc, h.vis desc, h.nick
   limit 8;
$$;

-- CREATE OR REPLACE 는 ACL 을 초기화한다(보안 표준 §3) → 다시 건다.
-- `from anon` 만으로는 PUBLIC 기본 GRANT 가 남으므로 public 을 같이 회수한다.
revoke all on function public.search_registered_players(uuid, text) from public, anon;
grant execute on function public.search_registered_players(uuid, text) to authenticated, service_role;

comment on function public.search_registered_players(uuid, text) is
  '장부 접수대 손님 자동완성. 게이트 can_access_ledger(venue). 이 매장 손님(체크인·CRM·예약)은 부분 일치 + 실명, 그 밖의 회원은 닉네임 정확 일치만이고 실명은 싣지 않는다. (20260911h)';

-- ── 적용 검증 — 스스로 확인한다(20260818f·20260911e·20260911f 선례) ─────────
do $$
declare v_src text;
begin
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'search_registered_players' and p.pronargs = 2;
  if v_src is null then
    raise exception 'ABORT: search_registered_players(uuid, text) 가 없다';
  end if;

  if v_src not like '%can_access_ledger(p_venue_id)%' then
    raise exception 'ABORT: 장부 권한 게이트가 사라졌다';
  end if;
  if v_src not like '%public.checkins c%'
     or v_src not like '%public.customer_profiles cp%'
     or v_src not like '%public.schedule_reservations r%' then
    raise exception 'ABORT: 매장 범위(체크인·CRM·예약) 정의가 빠졌다 — 전 회원 검색으로 되돌아갔다';
  end if;
  if v_src not like '%not exists (select 1 from rel where rel.uid = p.id)%' then
    raise exception 'ABORT: 비방문 회원 분기가 매장 손님과 분리돼 있지 않다';
  end if;
  if v_src not like '%null::text, p.nickname%' then
    raise exception 'ABORT: 비방문 회원에게 실명이 다시 실렸다';
  end if;

  if has_function_privilege('anon', 'public.search_registered_players(uuid, text)', 'execute') then
    raise exception 'ABORT: 실명을 싣는 검색 RPC 가 anon 에 열려 있다';
  end if;
  if not has_function_privilege('authenticated', 'public.search_registered_players(uuid, text)', 'execute') then
    raise exception 'ABORT: authenticated 에 닫혀 있다 — 접수대 자동완성이 죽는다';
  end if;

  -- 닉네임 정확 일치가 전수 스캔이 되지 않으려면 기존 유니크 인덱스가 살아 있어야 한다.
  -- (새로 만들지 않는다 — 이미 있는 것을 확인만 한다.)
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and tablename = 'profiles' and indexname = 'uniq_profiles_nickname_ci'
  ) then
    raise exception 'ABORT: uniq_profiles_nickname_ci 가 없다 — 닉네임 정확 일치가 매 타건 전수 스캔한다';
  end if;

  raise notice '장부 손님 검색 OK — 매장 범위 3경로 · 비방문자는 닉네임 정확일치·실명 미노출 · ACL · 기존 닉네임 인덱스 확인';
end $$;

notify pgrst, 'reload schema';
