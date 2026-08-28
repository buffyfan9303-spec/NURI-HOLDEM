-- ============================================================================
-- SECURITY DEFINER 함수의 search_path 에 pg_temp 를 명시 (2026-08-29, 심층방어)
--
-- 무엇이 문제인가
--   우리 SECURITY DEFINER 함수 대부분이 `set search_path to 'public'` 이다.
--   직관과 반대로, **pg_temp 를 안 적으면 빠지는 게 아니라 암묵적으로 맨 앞에서 검색된다**
--   (PostgreSQL 문서: 임시 스키마는 search_path 에 명시되지 않으면 pg_catalog 보다도 먼저
--    테이블·뷰 조회 대상이 된다). 즉 지금 상태는 "pg_temp 1순위" 이고,
--   `set search_path to 'public', 'pg_temp'` 로 적어야 비로소 **마지막**으로 밀린다.
--
--   그러면 임시 테이블을 만들 수 있는 세션이 `pg_temp.store_vouchers` 같은 이름을 선점해
--   정의자 권한으로 도는 함수 본문의 참조를 가로챌 수 있다. 정의자는 서비스 롤이므로
--   가로채기가 성립하면 RLS 를 우회한 읽기·쓰기가 된다.
--
-- 실착취 가능성 (정직하게)
--   현재 클라이언트는 PostgREST 뿐이라 임의 SQL(CREATE TEMP TABLE)을 넣을 경로가 없다.
--   즉 **지금 뚫려 있다는 뜻이 아니다.** 그러나 이건 한 줄로 닫히는 심층방어이고,
--   앞으로 커넥션 풀러·psql·백오피스가 하나라도 붙는 순간 전제가 바뀐다.
--
-- 왜 본문을 안 건드리나
--   ALTER FUNCTION ... SET 은 함수 설정만 바꾼다. 본문·시그니처·권한을 손대지 않으므로
--   185개를 한 번에 정렬해도 동작 변화가 없다. 반대로 CREATE OR REPLACE 로 하려면
--   본문 185개를 다시 써야 하고, 그 과정에서 실수가 날 여지가 훨씬 크다.
--
-- 안전 확인 (적용 전 실측)
--   · 대상 185개 중 임시 테이블을 만드는 함수 **0개** (prosrc 정규식 전수).
--     pg_temp 를 마지막에 두어도 CREATE TEMP TABLE 자체는 계속 동작하므로,
--     설령 앞으로 생겨도 깨지지 않는다.
--   · 이미 'public, pg_temp' 인 함수(20260829a·b 등)는 대상에서 제외 — 재적용해도 무해하지만
--     불필요한 변경을 남기지 않는다.
-- ============================================================================

do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prosecdef                                   -- SECURITY DEFINER 만
      and p.proconfig @> array['search_path=public']     -- 정확히 public 만 걸린 것
  loop
    execute format('alter function %s set search_path to %L, %L', r.sig, 'public', 'pg_temp');
    n := n + 1;
  end loop;
  raise notice 'search_path 에 pg_temp 를 명시한 함수: %개', n;
end
$$;
