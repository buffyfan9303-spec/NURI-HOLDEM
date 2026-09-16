-- 20260917a — '화면이 유일한 가드' 3건 차단 (CLAUDE.md 보안 표준 2번)
--
-- 무엇이 문제였나 (2026-09-17 실측)
-- ─────────────────────────────────────────────────────────────────────────────
-- ① public.venue_player_counts(uuid)
--    SECURITY DEFINER · anon EXECUTE 가능 · **본문에 권한 검사 0줄**.
--    반환값은 `ledger_buyins.player_name` — 장부에 적힌 고객 이름 + 바인 횟수 + 방문 일수다.
--    화면(VenuePage.tsx:1045)은 업주가 공개한 보드일 때만 부른다:
--      `wantsCounts = rankMetrics 에 moneyin_rate|buyin_count|visit_count 가 있을 때`
--    그런데 **서버는 아무나 부르면 그냥 준다.**
--    실측: 로티아레나의 rankMetrics = ["prize","custom:cgt6pzq"] — 카운트 보드를 공개한 적이 없는데
--          anon 키로 REST 직접 호출 → **4행 반환**(이름 + 7·2·6·12회).
--          라이브 전체에서 카운트 보드를 공개한 매장은 **0곳**이었다. 즉 100% 의도 밖 노출이었다.
--
-- ② public.venue_buyin_counts(uuid)
--    같은 테이블에서 이름 + 바인 횟수를 주는 **①의 부분집합**. 역시 anon 실행 가능.
--    래퍼 `getVenueBuyinCounts`(src/api/rankings.ts:383) 의 **호출부가 0곳**이다(전수 grep 확인).
--    → 화면이 안 쓰는 문이므로 실행 권한 자체를 회수한다. (함수는 남긴다 — 되돌리기 쉽게)
--
-- ③ public.free_plan_usage()
--    SECURITY DEFINER 로 DB 용량 · 스토리지 · MAU · 커넥션 수를 준다. 관리자 화면 전용인데
--    (src/api/adminStats.ts:18 → 관리자 탭) 20260915c 가 anon 만 회수하고
--    **authenticated 전원에게는 열어 뒀다.** 로그인한 아무나 인프라 지표를 읽는다.
--
-- 고치는 방식
-- ─────────────────────────────────────────────────────────────────────────────
-- ①은 **권한을 회수하지 않는다.** 비로그인 방문자가 공개된 바인왕·출석왕 보드를 봐야 하기 때문이다.
--   대신 **본문에 서버 게이트**를 넣어 '업주가 실제로 공개한 보드' 이거나 '장부 접근권자' 일 때만 행을 준다.
--   화면의 `wantsCounts` 판정을 서버가 똑같이 하게 만드는 것이다 — 화면이 유일한 가드인 상태를 끝낸다.
-- ③은 본문에 admin 검사. WHERE 절이라 my_role() 이 NULL(비로그인)이면 행이 사라진다 = fail-closed.
--   그래도 coalesce 로 명시한다(can_manage_pos 와 같은 관용구).
--
-- ⚠ ACL 주의(CLAUDE.md 보안 표준 3번): `CREATE OR REPLACE` 는 ACL 을 **보존**한다.
--   그래서 ①의 anon GRANT 는 아래 REPLACE 후에도 그대로 남는다(그게 의도다).
--   ②의 REVOKE 는 `FROM public` 을 반드시 포함한다 — `FROM anon` 만으로는 PUBLIC 기본 GRANT 때문에 무효다.
--
-- 롤백 리허설 (begin … rollback, 2026-09-17 실측)
--   비로그인 + 보드 미공개 → 0행 (기대 0)   ← 막혔다
--   업주 호출              → 4행 (기대 >0)  ← 내 매장 미리보기가 안 깨진다
--   비로그인 + 보드 공개후 → 4행 (기대 >0)  ← 공개 보드가 안 깨진다
--   → REHEARSAL_PASS
--
-- PostgreSQL 17.6 (실측). jsonb `?|` 연산자 사용.

begin;

-- ─── ① venue_player_counts — 서버 게이트 ──────────────────────────────────────
create or replace function public.venue_player_counts(p_venue_id uuid)
returns table(name text, buyin_count bigint, visit_count bigint)
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $fn$
  select b.player_name as name,
         count(*)::bigint as buyin_count,
         count(distinct b.session_date)::bigint as visit_count
  from public.ledger_buyins b
  where b.venue_id = p_venue_id
    and (
      -- 장부를 볼 수 있는 사람(업주·승인된 공동업주·관리자·ledger_access)
      public.can_access_ledger(p_venue_id)
      or public.can_manage_venue(p_venue_id)
      -- 또는 업주가 이 카운트를 쓰는 보드를 실제로 공개했을 때(화면의 wantsCounts 와 같은 판정)
      or exists (
        select 1 from public.venues v
        where v.id = p_venue_id
          and (v.page_config->'rankMetrics') ?| array['moneyin_rate','buyin_count','visit_count']
      )
    )
  group by b.player_name
$fn$;

comment on function public.venue_player_counts(uuid) is
  '매장 공개 보드(바인왕·출석왕·머니인 비율)용 이름별 집계. 2026-09-17: 본문 서버 게이트 추가 — '
  '업주가 rankMetrics 에 moneyin_rate|buyin_count|visit_count 를 공개했거나 장부 접근권자일 때만 행을 준다. '
  'anon EXECUTE 는 유지한다(비로그인 방문자가 공개 보드를 봐야 한다).';

-- anon 은 유지(공개 보드). 새로 만들어지는 경우를 대비해 명시해 둔다.
revoke execute on function public.venue_player_counts(uuid) from public;
grant  execute on function public.venue_player_counts(uuid) to anon, authenticated, service_role;

-- ─── ② venue_buyin_counts — 호출부 0곳이므로 실행 권한 회수 ───────────────────
revoke execute on function public.venue_buyin_counts(uuid) from public, anon, authenticated;
grant  execute on function public.venue_buyin_counts(uuid) to service_role;

comment on function public.venue_buyin_counts(uuid) is
  '2026-09-17 실행 권한 회수 — venue_player_counts 의 부분집합이고 화면 호출부가 0곳이다(전수 grep). '
  '함수는 되돌리기 쉽도록 남긴다. 다시 쓰려면 venue_player_counts 와 같은 서버 게이트를 먼저 넣어라.';

-- ─── ③ free_plan_usage — 관리자 전용 ────────────────────────────────────────
create or replace function public.free_plan_usage()
returns table(metric text, used numeric, limit_val numeric, pct numeric, status text)
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $fn$
  with g as (
    -- fail-closed: 비로그인이면 my_role() 이 NULL → coalesce 로 false
    select coalesce(public.my_role() = 'admin'::user_role, false) as ok
  ), m as (
    select 'DB 용량(MB · Pro 8GB)' as metric,
           round((pg_database_size(current_database())/1024.0/1024.0)::numeric, 1) as used,
           8192::numeric as limit_val
    union all
    select '스토리지(MB · Pro 100GB)',
           round((coalesce((select sum((metadata->>'size')::bigint) from storage.objects),0)/1024.0/1024.0)::numeric, 1),
           102400::numeric
    union all
    select 'MAU(30일 로그인 · Pro 10만)',
           (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days')::numeric,
           100000::numeric
    union all
    select '커넥션(참고 · 컴퓨트)',
           (select count(*) from pg_stat_activity)::numeric,
           current_setting('max_connections')::numeric
  )
  select m.metric, m.used, m.limit_val,
         round(100 * m.used / nullif(m.limit_val,0), 1) as pct,
         case
           when m.metric = '커넥션(참고 · 컴퓨트)' then 'ℹ️ 참고(요금제 아님 · 대부분 인프라 상주)'
           when m.used / nullif(m.limit_val,0) >= 0.90 then '🔴 위험(상향 검토)'
           when m.used / nullif(m.limit_val,0) >= 0.70 then '🟠 주의(최적화 필요)'
           when m.used / nullif(m.limit_val,0) >= 0.50 then '🟡 관찰'
           else '🟢 여유' end as status
  from m cross join g
  where g.ok
  order by (m.metric = '커넥션(참고 · 컴퓨트)'), 4 desc nulls last, 2 desc;
$fn$;

comment on function public.free_plan_usage() is
  '관리자 플랫폼 지표(Supabase Pro 한도 사용률). 2026-09-17: 본문에 admin 검사 추가 — '
  '20260915c 는 anon 만 회수하고 authenticated 전원에게 열려 있어 로그인한 아무나 인프라 지표를 읽었다.';

revoke execute on function public.free_plan_usage() from public, anon;
grant  execute on function public.free_plan_usage() to authenticated, service_role;

-- ─── 자가검사 — 실패할 때만 멈춘다(통과는 조용히) ─────────────────────────────
do $$
declare
  v_roti uuid;
  n_anon int; n_owner int; v_owner uuid;
  anon_pc  boolean; anon_bc boolean; auth_bc boolean; anon_fpu boolean; auth_fpu boolean;
begin
  -- ACL 단언
  anon_pc  := has_function_privilege('anon',          'public.venue_player_counts(uuid)', 'execute');
  anon_bc  := has_function_privilege('anon',          'public.venue_buyin_counts(uuid)',  'execute');
  auth_bc  := has_function_privilege('authenticated', 'public.venue_buyin_counts(uuid)',  'execute');
  anon_fpu := has_function_privilege('anon',          'public.free_plan_usage()',          'execute');
  auth_fpu := has_function_privilege('authenticated', 'public.free_plan_usage()',          'execute');

  if not anon_pc then
    raise exception 'SELFCHECK_FAIL: venue_player_counts 는 anon 실행이 유지돼야 한다(공개 보드가 죽는다)';
  end if;
  if anon_bc or auth_bc then
    raise exception 'SELFCHECK_FAIL: venue_buyin_counts 회수 실패 (anon=% auth=%)', anon_bc, auth_bc;
  end if;
  if anon_fpu or not auth_fpu then
    raise exception 'SELFCHECK_FAIL: free_plan_usage ACL 이상 (anon=% auth=%)', anon_fpu, auth_fpu;
  end if;

  -- 행 단언 — 카운트 보드를 공개하지 않은 매장을 골라 음성/양성 둘 다 본다
  select v.id, v.owner_id into v_roti, v_owner
  from public.venues v
  where exists (select 1 from public.ledger_buyins b where b.venue_id = v.id)
    and not ((v.page_config->'rankMetrics') ?| array['moneyin_rate','buyin_count','visit_count'])
  limit 1;

  if v_roti is null then
    raise warning 'SELFCHECK_SKIP: 장부 행이 있으면서 카운트 보드 미공개인 매장이 없어 행 단언을 건너뛴다';
    return;
  end if;

  -- 음성: 비로그인 → 0행
  perform set_config('request.jwt.claims', '', true);
  select count(*) into n_anon from public.venue_player_counts(v_roti);
  if n_anon <> 0 then
    raise exception 'SELFCHECK_FAIL: 비로그인이 미공개 매장의 플레이어 집계를 %행 읽었다', n_anon;
  end if;

  -- 양성: 업주 → 그대로 보여야 한다(아무도 못 보게 만든 고장을 잡는다)
  if v_owner is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
    select count(*) into n_owner from public.venue_player_counts(v_roti);
    if n_owner = 0 then
      raise exception 'SELFCHECK_FAIL: 업주도 못 읽는다 — 게이트가 너무 좁다(내 매장 미리보기가 깨진다)';
    end if;
  end if;
  perform set_config('request.jwt.claims', '', true);
end $$;

commit;
