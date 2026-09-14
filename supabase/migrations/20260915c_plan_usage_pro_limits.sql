-- 20260915c — 요금제 사용률 표가 **무료 한도**를 기준으로 말하고 있었다. Pro 기준으로 바로잡는다.
--
-- 왜
--   오너가 2026-09-15 Supabase **Pro($25/월)** 를 구독했다. 그런데 `free_plan_usage()` 안의 한도가
--   무료 요금제 값으로 박혀 있어, 관리자 화면이 **실제보다 8~100배 빡빡한 숫자**를 보여 주고 있었다.
--   운영 지표가 틀린 기준으로 '위험'을 말하면 **없는 위기에 대응하거나, 진짜 위기를 놓친다.**
--
-- 실측 (2026-09-15, 적용 직전)
--   DB 39.0MB · 스토리지 1.1MB · MAU(30일) 2명(가입 4명) · 커넥션 40/60
--   → 무료 기준: DB 7.8% · 스토리지 0.1% · MAU 0.004% · 커넥션 66.7%
--   → Pro 기준: DB **0.5%** · 스토리지 **0.001%** · MAU **0.002%**
--
-- 한도 출처 (오너가 붙여 준 Pro 플랜 안내 · 2026-09-15)
--   MAU 100,000 · 디스크 8GB · egress 250GB · 파일 스토리지 100GB · 일 백업 7일 보관 · 로그 7일
--
-- ⚠ 함수 이름은 `free_plan_usage` 그대로 둔다 — 호출부(`src/api/adminStats.ts:18`)가 그 이름을 쓰고,
--   이름을 바꾸면 클라이언트를 같이 고쳐야 하는데 **얻는 것이 없다.** 이름은 역사적 산물이다.
-- ⚠ **반환 타입(컬럼 구성)도 바꾸지 않는다.** 처음엔 `plan text` 컬럼을 더하려 했는데,
--   반환 타입 변경은 `CREATE OR REPLACE` 가 거부하고 `DROP` + 재생성을 강요한다 →
--   그 순간 **ACL 이 초기화된다**(CLAUDE.md 보안 §3 · 2026-09-12 실측). 클라이언트도 같이 고쳐야 한다.
--   요금제는 **메트릭 라벨에 적어** 같은 효과를 낸다 — 스키마를 안 건드리는 쪽이 싸고 안전하다.
--
-- ⚠⚠ 커넥션 지표를 **고쳐 적는다. 이게 이번 마이그레이션에서 제일 중요하다.**
--   40/60 = 66.7% 라 종전 기준이면 '🟡 관찰' 로 떴는데, **그 40 은 전부 Supabase 인프라다**
--   (실측: postgrest 풀 20 · realtime 7 · storage/pg_net/pg_cron/exporter/pgbouncer/mgmt 등 13).
--   PostgREST 는 **고정 크기 풀**을 쓰므로 유저가 늘어도 이 수는 안 늘어난다 — 즉 **바닥값이지 사용률이 아니다.**
--   그대로 두면 "유저도 없는데 67%" 라는 **거짓 경고**가 상시로 뜬다.
--   → 그래서 이 지표에는 **경고 등급을 매기지 않는다**(ℹ️ 참고). 숫자는 그대로 보여 주되 색으로 겁주지 않는다.
--
-- ⚠ 이 함수가 못 보는 것(화면에 그렇게 적는다): **egress 는 DB 안에서 잴 수 없다.**
--   Supabase 대시보드에서만 보인다. 그래서 메트릭으로 넣지 않는다 — 0 으로 그리면 거짓 안심이 된다.
--
-- ⚠ Pro 는 **쿼터**를 올린 것이지 **컴퓨트**를 올린 것이 아니다(실측: shared_buffers 256MB ·
--   effective_cache_size 768MB · max_connections 60 = Micro 인스턴스). 컴퓨트 상향은 별도 과금이다.
--
-- 되돌리기: `limit_val` 을 500 / 1024 / 50000 으로, 라벨의 'Pro …' 를 지우면 종전과 같아진다.
--   (데이터를 만들거나 지우지 않으므로 되돌려도 잃는 것이 없다.)

create or replace function public.free_plan_usage()
returns table(metric text, used numeric, limit_val numeric, pct numeric, status text)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with m as (
    select 'DB 용량(MB · Pro 8GB)' as metric,
           round((pg_database_size(current_database())/1024.0/1024.0)::numeric, 1) as used,
           8192::numeric as limit_val            -- Pro: 8 GB (초과분 $0.125/GB)
    union all
    select '스토리지(MB · Pro 100GB)',
           round((coalesce((select sum((metadata->>'size')::bigint) from storage.objects),0)/1024.0/1024.0)::numeric, 1),
           102400::numeric                       -- Pro: 100 GB (초과분 $0.0213/GB)
    union all
    select 'MAU(30일 로그인 · Pro 10만)',
           (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days')::numeric,
           100000::numeric                       -- Pro: 100,000 MAU (초과분 $0.00325/MAU)
    union all
    -- 커넥션은 **요금제 쿼터가 아니다**(컴퓨트가 정한다). 그래서 경고 등급을 매기지 않는다 — 위 ⚠⚠ 참고.
    select '커넥션(참고 · 컴퓨트)',
           (select count(*) from pg_stat_activity)::numeric,
           current_setting('max_connections')::numeric
  )
  select m.metric, m.used, m.limit_val,
         round(100 * m.used / nullif(m.limit_val,0), 1) as pct,
         case
           -- 요금제와 무관한 지표는 색을 칠하지 않는다. 40/60 은 인프라 바닥값이라
           -- '🟡 관찰' 로 뜨면 **유저가 없는데도 상시 경고**가 된다(2026-09-15 실측: 40 중 40 이 인프라).
           when m.metric = '커넥션(참고 · 컴퓨트)' then 'ℹ️ 참고(요금제 아님 · 대부분 인프라 상주)'
           when m.used / nullif(m.limit_val,0) >= 0.90 then '🔴 위험(상향 검토)'
           when m.used / nullif(m.limit_val,0) >= 0.70 then '🟠 주의(최적화 필요)'
           when m.used / nullif(m.limit_val,0) >= 0.50 then '🟡 관찰'
           else '🟢 여유' end as status
  from m
  order by (m.metric = '커넥션(참고 · 컴퓨트)'), 4 desc nulls last, 2 desc;
$function$;

comment on function public.free_plan_usage() is
  '요금제 사용률(관리자 전용). 이름은 역사적 산물이고 기준은 **Pro** 다(2026-09-15 구독). '
  'egress 는 DB 에서 잴 수 없어 빠져 있다 — 대시보드에서 확인할 것. '
  '커넥션은 요금제가 아니라 컴퓨트가 정하므로 경고 등급을 매기지 않는다(대부분 인프라 상주분).';

-- ACL — 관리자 화면 전용 읽기 RPC. CREATE OR REPLACE 는 ACL 을 보존하지만(2026-09-12 실측),
-- **새로 만들어지는 경우**를 위해 같이 적어 둔다. `from public` 이 없으면 PUBLIC 기본 GRANT 로 무효다.
revoke execute on function public.free_plan_usage() from public, anon;
grant  execute on function public.free_plan_usage() to authenticated, service_role;

-- ── 자가검사 ────────────────────────────────────────────────────────────────
-- 적용이 실제로 반영됐는지 파일이 스스로 확인한다. 실패하면 트랜잭션이 죽는다.
do $$
declare
  db_limit numeric;
  st_limit numeric;
  mau_limit numeric;
  n_metrics int;
  anon_ok boolean;
  auth_ok boolean;
begin
  select limit_val into db_limit  from public.free_plan_usage() where metric = 'DB 용량(MB · Pro 8GB)';
  select limit_val into st_limit  from public.free_plan_usage() where metric = '스토리지(MB · Pro 100GB)';
  select limit_val into mau_limit from public.free_plan_usage() where metric = 'MAU(30일 로그인 · Pro 10만)';
  select count(*)  into n_metrics from public.free_plan_usage();

  if db_limit is distinct from 8192   then raise exception '자가검사 실패: DB 한도가 % (8192 이어야 함)', db_limit; end if;
  if st_limit is distinct from 102400 then raise exception '자가검사 실패: 스토리지 한도가 % (102400 이어야 함)', st_limit; end if;
  if mau_limit is distinct from 100000 then raise exception '자가검사 실패: MAU 한도가 % (100000 이어야 함)', mau_limit; end if;
  if n_metrics <> 4 then raise exception '자가검사 실패: 메트릭이 %개다(4개여야 함)', n_metrics; end if;

  -- 권한: anon 은 못 부르고 authenticated 는 불러야 한다.
  anon_ok := has_function_privilege('anon', 'public.free_plan_usage()', 'execute');
  auth_ok := has_function_privilege('authenticated', 'public.free_plan_usage()', 'execute');
  if anon_ok then raise exception '자가검사 실패: anon 이 아직 실행할 수 있다'; end if;
  if not auth_ok then raise exception '자가검사 실패: authenticated 가 실행할 수 없다(양성 대조)'; end if;

  raise notice '✅ 20260915c 자가검사 통과 — DB % / 스토리지 % / MAU % · anon 차단 · authenticated 허용',
    db_limit, st_limit, mau_limit;
end $$;
