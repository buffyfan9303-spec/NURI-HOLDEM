-- ============================================================================
-- 순위 입력 회원 조회를 매장 범위 안으로 (2026-09-11 · 20260911h 의 형제 건)
-- 파일명: supabase/migrations/20260911j_ranking_member_search_venue_scope.sql
--
-- 원인
--   순위 입력 화면이 쓰는 조회 RPC 는 호출자 게이트(can_search_ranking_members)만 있고
--   **검색 대상에 범위가 없다**(20260905c). 어느 매장이든 장부·순위 권한 하나면
--     · 두 글자로 플랫폼 전 회원의 가입명이 나오고(search_ranking_members)
--     · 닉네임 목록만 있으면 100개씩 신원을 매핑할 수 있다(resolve_ranking_members).
--   보안 표준 §6 위반이고, 20260910b 가 순위표에 세운 '실명은 볼 자격이 있는 사람에게만' 과 어긋난다.
--
-- 바꾸는 것
--   ① 20260911h 가 장부에 세운 '이 매장 손님' 판정을 함수 하나로 뽑는다(_venue_customer_ids).
--      h 본문의 같은 union 을 이 호출로 교체한다 — 규칙이 두 벌이 되지 않게 하는 것이 목적이다.
--      (의미 동일·행 변화 0. h 파일 자체는 수정하지 않는다.)
--   ② 순위 RPC 는 매장 인자를 받지 않으므로 매장 집합을 호출자에게서 구한다(_my_ledger_venue_ids).
--      그 집합 = can_access_ledger(v) 가 참인 v 의 집합(= admin ∪ owner ∪ 승인 공동운영자 ∪ ledger_access).
--      h 가 매장마다 검사하던 경계를 뒤집어 놓은 것뿐이고, 새 신뢰 경계를 만들지 않았다.
--   ③ search_ranking_members / resolve_ranking_members: **시그니처 그대로.** 내 매장 손님은 종전과
--      똑같이 부분 일치 + 이름, 그 밖의 회원은 닉네임 정확 일치만 · 이름 칸은 비운다.
--      회원 여부(id·verified)는 범위와 무관하게 종전 그대로 나간다 — 좁히면 20260905c 가 고쳤던
--      '가입 회원 줄에 비회원 배지' 거짓말이 그대로 재발한다.
--   ④ search_members_for_ranking 은 드롭한다. 실행 호출부 0(6378e15 에서 마지막 소비자 제거,
--      src·e2e 전수 grep 결과 주석만 남음)이고 매장 인자가 없어 범위를 걸 수단 자체가 없다.
--
-- 순위 입력 기능은 죽지 않는다
--   그날 처음 온 선수는 ⓐ 장부 명단 칩(로컬 배열, RPC 를 타지 않는다)으로 들어오고 — 장부 표기
--   '실명(닉네임)' 은 splitLedgerName 이 갈라 이름 칸까지 채운다 — ⓑ 체크인·예약·CRM 중 하나라도
--   있으면 종전과 같은 부분 일치 + 이름이며 ⓒ 아무것도 없으면 닉네임을 통째로 치면 회원으로 잡힌다.
--   저장 검증은 닉네임만 필수이고 이름은 선택이라(VenueManageTab.save) 어느 경로로도 막히지 않는다.
--
-- 일부러 안 하는 것
--   · **시그니처에 p_venue_id 를 더하지 않는다.** 이 저장소 CI 에는 supabase db push 가 없어
--     앱이 먼저(Vercel), DB 가 나중(오너 수동)이 기본 순서다. 인자를 바꾸면 그 창에서 옛 번들이
--     PGRST202 를 받고, resolve 의 error 경로는 '모든 키가 빈 배열' 인 Map 을 그대로 돌려주므로
--     화면이 **실제 회원 전원에게 비회원 배지**를 붙인다 — 20260905c 가 고쳤던 그 거짓말이다.
--   · **인덱스를 만들지 않는다.** 닉네임 정확 일치는 uniq_profiles_nickname_ci(20260601b,
--     lower(trim(nickname)) = lower(btrim(nickname)))가 그대로 받고, 나머지 술어는 매장 손님 집합 안에서만 돈다.
--   · profiles.status 는 종전대로 active 만(20260905c 유지). 순위는 기록이라 제재자 제외가 정본이다.
--   · 이름 칸의 출처는 20260905c 그대로 profiles.name(가입명)이다. 장부 쪽은 profiles.real_name(CI 실명)이라
--     두 화면이 서로 다른 컬럼을 '실명' 이라 부르는 기존 불일치가 남는다 — 노출 범위 수정에 값의 의미까지
--     얹으면 회귀 폭이 커진다(h 가 visits 를 남겨 둔 것과 같은 판단). 별건으로 남긴다.
--   · 반환 컬럼 수·이름·순서 전부 유지. §6 최소화는 이름 값(남이면 null)에서 달성한다.
--   · 권한 실패는 예외가 아니라 0행 그대로 — 호출부가 error 를 빈 배열로 삼킨다.
--
-- 눈에 보이는 변화(기록)
--   · 정렬이 `(nickname = q) desc` → `정확일치(대소문자·공백 무시) desc` 가 된다(h 와 같은 규칙).
--   · 다른 매장 손님의 자동완성은 닉네임을 다 쳐야 뜨고, 이름은 뜨지 않는다.
--
-- ponytail: admin 은 _my_ledger_venue_ids() 가 전 매장을 돌려주므로 _venue_customer_ids 가
--   checkins·customer_profiles·schedule_reservations 를 사실상 전수 훑는다. 운영자만 타는 드문
--   경로라 그대로 둔다. 관리자 화면에서 자동완성이 굼뜨면 admin 을 매장 집합이 아니라
--   부분 일치 분기의 술어에서 단락시켜라(그때는 반대편 분기에 not admin 을 같이 넣어야 중복이 안 난다).
--
-- 롤백
--   20260905c 본문 3개 재실행 + 20260911h 본문 재실행 + 아래 두 `_` 함수 drop.
--   (되돌리면 전 회원 이름 훑기가 그대로 살아난다 — 되돌릴 이유가 없으면 하지 마라.)
-- ============================================================================

-- ── ① 공용 정의: '이 매장 손님' — 20260911h 가 쓴 세 경로 그대로 ─────────────
create or replace function public._venue_customer_ids(p_venue_ids uuid[])
returns table(uid uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- 왔다
  select c.user_id
    from public.checkins c
   where c.venue_id = any(coalesce(p_venue_ids, '{}'::uuid[]))
  union
  -- 업주가 명단에 넣었다
  select cp.user_id
    from public.customer_profiles cp
   where cp.venue_id = any(coalesce(p_venue_ids, '{}'::uuid[]))
     and cp.user_id is not null
  union
  -- 온다(예약)
  select r.user_id
    from public.schedule_reservations r
    join public.schedules s on s.id = r.schedule_id
   where s.venue_id = any(coalesce(p_venue_ids, '{}'::uuid[]))
     and r.user_id is not null;
$$;

-- 내부 헬퍼 — 직접 부르면 그 매장 손님 명단을 통째로 받는다. 클라이언트 두 역할 모두 회수한다
-- (보안 표준 §3. 20260910b 의 _ranking_real_name_opted_in 과 같은 취급 —
--  SECURITY DEFINER 안에서의 호출은 소유자 권한으로 검사되므로 이 회수가 호출부를 막지 않는다).
revoke all on function public._venue_customer_ids(uuid[]) from public, anon, authenticated;
grant execute on function public._venue_customer_ids(uuid[]) to service_role;

comment on function public._venue_customer_ids(uuid[]) is
  '매장 손님 판정 단일 출처 — 체크인·CRM 연결·예약 중 하나. 장부(search_registered_players)와 순위(search_ranking_members)가 같은 것을 부른다. (20260911j)';

-- ── ② 호출자가 장부를 볼 수 있는 매장들 = can_access_ledger 가 참인 매장 집합 ──
create or replace function public._my_ledger_venue_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(t.vid), '{}'::uuid[])
    from (
      -- 운영자는 전 매장(20260910b 의 실명 열람 규칙도 admin 을 포함한다).
      select v.id as vid from public.venues v
       where coalesce(public.my_role() = 'admin'::user_role, false)
      union
      select v.id from public.venues v where v.owner_id = auth.uid()
      union
      select vo.venue_id from public.venue_owners vo
       where vo.user_id = auth.uid() and vo.status = 'approved'
      union
      select la.venue_id from public.ledger_access la where la.user_id = auth.uid()
    ) t;
$$;

revoke all on function public._my_ledger_venue_ids() from public, anon, authenticated;
grant execute on function public._my_ledger_venue_ids() to service_role;

comment on function public._my_ledger_venue_ids() is
  '호출자가 장부를 볼 수 있는 매장 집합(= can_access_ledger 가 참인 매장). 매장 인자가 없는 순위 RPC 가 범위를 구하는 데 쓴다. (20260911j)';

-- ── ③ 장부 손님 검색 — 범위 정의만 공용 함수로 교체(행 변화 0) ────────────────
-- 20260911h 와 동작이 완전히 같다. h 의 rel 첫 갈래는 이 매장 체크인 사용자였고(checkins.user_id 는
-- not null), 공용 함수의 첫 갈래가 같은 집합이다. 시그니처 그대로라 배포 중 어느 번들도 영향받지 않는다.
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
  rel as materialized (
    select t.uid from public._venue_customer_ids(array[p_venue_id]) t
  ),
  hit as (
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

revoke all on function public.search_registered_players(uuid, text) from public, anon;
grant execute on function public.search_registered_players(uuid, text) to authenticated, service_role;

comment on function public.search_registered_players(uuid, text) is
  '장부 접수대 손님 자동완성. 범위 판정은 순위 검색과 같은 공용 함수를 쓴다 — 두 화면이 같은 질문에 같은 답을 한다. (20260911h → 20260911j)';

-- ── ④ 순위 입력 자동완성 — 시그니처 유지, 범위만 걸린다 ──────────────────────
create or replace function public.search_ranking_members(p_q text)
returns table(id uuid, nickname text, real_name text, verified boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with rel as materialized (
    select t.uid from public._venue_customer_ids(public._my_ledger_venue_ids()) t
  ),
  hit as (
    -- 내 매장 손님: 종전과 같은 부분 일치 + 이름.
    select p.id as uid,
           p.nickname as nick,
           p.name as rn,
           public.is_ci_verified(p.ci_hash, p.verified_at) as ver,
           coalesce(lower(btrim(p.nickname)) = lower(btrim(coalesce(p_q, ''))), false) as is_exact
      from rel
      join public.profiles p on p.id = rel.uid
     where public.can_search_ranking_members()
       and coalesce(p.status::text, 'active') = 'active'
       and btrim(coalesce(p_q, '')) <> ''
       and (p.nickname ilike '%' || btrim(p_q) || '%' or p.name ilike '%' || btrim(p_q) || '%')
    union all
    -- 그 밖의 회원: 닉네임을 통째로 맞춰야 나오고, 이름 칸은 비운다.
    select p.id,
           p.nickname,
           null::text,
           public.is_ci_verified(p.ci_hash, p.verified_at),
           true
      from public.profiles p
     where public.can_search_ranking_members()
       and coalesce(p.status::text, 'active') = 'active'
       and btrim(coalesce(p_q, '')) <> ''
       and lower(btrim(p.nickname)) = lower(btrim(p_q))
       and not exists (select 1 from rel where rel.uid = p.id)
  )
  select h.uid, h.nick, h.rn, h.ver
    from hit h
   order by h.is_exact desc, h.nick
   limit 12;
$$;

revoke all on function public.search_ranking_members(text) from public, anon;
grant execute on function public.search_ranking_members(text) to authenticated, service_role;

comment on function public.search_ranking_members(text) is
  '순위 입력 자동완성. 게이트 can_search_ranking_members. 내 매장 손님만 부분 일치 + 이름 표시, 그 밖은 닉네임 정확 일치만이고 이름은 싣지 않는다. (20260911j)';

-- ── ⑤ 닉네임 일괄 대조 — 매칭 규칙은 그대로, 이름만 조건부 ────────────────────
create or replace function public.resolve_ranking_members(p_names text[])
returns table(q text, id uuid, nickname text, real_name text, verified boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- 범위 판정은 한 번만 평가한다(이름 100개에 매장 스캔이 100번 되지 않게).
  with rel as materialized (
    select t.uid from public._venue_customer_ids(public._my_ledger_venue_ids()) t
  )
  -- 행의 존재(회원 여부·인증)는 종전 그대로 나간다 — 좁히면 그 매장에 처음 온 회원이 비회원으로 보인다.
  select n.q,
         p.id,
         p.nickname,
         case when c.uid is not null then p.name else null::text end,
         public.is_ci_verified(p.ci_hash, p.verified_at)
    from unnest((coalesce(p_names, '{}'::text[]))[1:100]) as n(q)
    join public.profiles p
      on lower(btrim(p.nickname)) = lower(btrim(n.q))
    left join rel c on c.uid = p.id
   where public.can_search_ranking_members()
     and coalesce(p.status::text, 'active') = 'active'
     and btrim(coalesce(n.q, '')) <> '';
$$;

revoke all on function public.resolve_ranking_members(text[]) from public, anon;
grant execute on function public.resolve_ranking_members(text[]) to authenticated, service_role;

comment on function public.resolve_ranking_members(text[]) is
  '순위 행 이름 → 회원 대조(닉네임 정확 일치, 최대 100). 회원 여부·인증은 종전대로 주고, 이름은 내 매장 손님일 때만 싣는다. (20260911j)';

-- ── ⑥ 호출부 0 인 형제 함수는 드롭 ───────────────────────────────────────────
-- 마지막 소비자(장부 화면 병합)는 6378e15 에서 제거됐고 src·e2e 전수 grep 결과 주석만 남았다.
-- 옛 캐시 번들의 그 호출부는 실패를 빈 배열로 흡수했다(catch → setMemSuggest([])).
drop function if exists public.search_members_for_ranking(text);

-- ── 적용 검증 — 스스로 확인한다(20260818f·20260911e·h 선례) ──────────────────
do $$
declare v_src text; v_n int;
begin
  -- 공용 범위 정의가 세 경로를 다 들고 있는가
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_venue_customer_ids';
  if v_src is null then raise exception 'ABORT: _venue_customer_ids 가 없다'; end if;
  if v_src not like '%public.checkins c%'
     or v_src not like '%public.customer_profiles cp%'
     or v_src not like '%public.schedule_reservations r%' then
    raise exception 'ABORT: 매장 범위 세 경로가 공용 정의에 다 없다';
  end if;

  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_my_ledger_venue_ids';
  if v_src is null then raise exception 'ABORT: _my_ledger_venue_ids 가 없다'; end if;
  if v_src not like '%public.ledger_access la%' or v_src not like '%public.venue_owners vo%' then
    raise exception 'ABORT: 호출자 매장 집합이 장부 권한 경계와 어긋난다';
  end if;

  -- 장부 검색이 자기 사본을 버리고 공용 정의를 부르는가(규칙이 두 벌이 되면 안 된다)
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'search_registered_players' and p.pronargs = 2;
  if v_src is null then raise exception 'ABORT: search_registered_players 가 없다'; end if;
  if v_src not like '%public._venue_customer_ids(array[p_venue_id])%' then
    raise exception 'ABORT: 장부 검색이 공용 범위 정의를 부르지 않는다';
  end if;
  if v_src like '%public.customer_profiles cp%' then
    raise exception 'ABORT: 장부 검색이 범위 정의 사본을 그대로 들고 있다';
  end if;
  if v_src not like '%can_access_ledger(p_venue_id)%' then
    raise exception 'ABORT: 장부 권한 게이트가 사라졌다';
  end if;

  -- 순위 자동완성
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'search_ranking_members';
  if v_src is null then raise exception 'ABORT: search_ranking_members 가 없다'; end if;
  if v_src not like '%public._venue_customer_ids(%' or v_src not like '%public._my_ledger_venue_ids(%' then
    raise exception 'ABORT: 순위 자동완성에 매장 범위가 없다 — 전 회원 검색으로 되돌아갔다';
  end if;
  if v_src not like '%not exists (select 1 from rel where rel.uid = p.id)%' then
    raise exception 'ABORT: 내 매장 밖 회원 분기가 분리돼 있지 않다';
  end if;
  if v_src not like '%null::text,%' then
    raise exception 'ABORT: 내 매장 밖 회원에게 이름이 다시 실렸다';
  end if;
  if v_src not like '%can_search_ranking_members()%' then
    raise exception 'ABORT: 순위 조회 게이트가 사라졌다';
  end if;

  -- 일괄 대조
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'resolve_ranking_members';
  if v_src is null then raise exception 'ABORT: resolve_ranking_members 가 없다'; end if;
  if v_src not like '%public._venue_customer_ids(%' then
    raise exception 'ABORT: 일괄 대조에 매장 범위가 없다';
  end if;
  if v_src not like '%case when c.uid is not null then p.name else null::text end%' then
    raise exception 'ABORT: 일괄 대조가 이름을 무조건 싣는다 — 닉네임 목록으로 신원을 매핑할 수 있다';
  end if;
  if v_src not like '%public.is_ci_verified(p.ci_hash, p.verified_at)%' then
    raise exception 'ABORT: 회원 판정이 사라졌다 — 화면이 전원을 비회원으로 표시한다';
  end if;

  -- 드롭 확인
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'search_members_for_ranking';
  if v_n <> 0 then raise exception 'ABORT: 호출부 0 인 전 회원 검색 RPC 가 남아 있다'; end if;

  -- ACL(보안 표준 §1·§3) — CREATE OR REPLACE 가 초기화하므로 실제 권한으로 확인한다
  if has_function_privilege('anon', 'public.search_ranking_members(text)', 'execute')
     or has_function_privilege('anon', 'public.resolve_ranking_members(text[])', 'execute')
     or has_function_privilege('anon', 'public.search_registered_players(uuid, text)', 'execute') then
    raise exception 'ABORT: 이름을 싣는 조회 RPC 가 anon 에 열려 있다';
  end if;
  if has_function_privilege('anon', 'public._venue_customer_ids(uuid[])', 'execute')
     or has_function_privilege('authenticated', 'public._venue_customer_ids(uuid[])', 'execute')
     or has_function_privilege('anon', 'public._my_ledger_venue_ids()', 'execute')
     or has_function_privilege('authenticated', 'public._my_ledger_venue_ids()', 'execute') then
    raise exception 'ABORT: 내부 헬퍼가 클라이언트에 열려 있다';
  end if;
  if not has_function_privilege('authenticated', 'public.search_ranking_members(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.resolve_ranking_members(text[])', 'execute')
     or not has_function_privilege('authenticated', 'public.search_registered_players(uuid, text)', 'execute') then
    raise exception 'ABORT: authenticated 에 닫혀 있다 — 순위·장부 자동완성이 죽는다';
  end if;

  -- 닉네임 정확 일치가 매 타건 전수 스캔이 되지 않으려면 기존 유니크 인덱스가 살아 있어야 한다.
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and tablename = 'profiles' and indexname = 'uniq_profiles_nickname_ci'
  ) then
    raise exception 'ABORT: uniq_profiles_nickname_ci 가 없다 — 닉네임 정확 일치가 전수 스캔한다';
  end if;

  raise notice '순위 회원 조회 OK — 범위 정의 1벌(장부·순위 공용) · 내 매장 밖은 닉네임 정확일치·이름 미노출 · 사용처 0 RPC 드롭 · ACL 확인';
end $$;

notify pgrst, 'reload schema';
