-- 2026-06-24 #6 RLS initplan 최적화: auth.uid() → (select auth.uid()) 래핑.
-- auth.* 는 쿼리 내 STABLE 이므로 스칼라 서브쿼리로 감싸면 행마다 재평가(per-row) 대신
-- 1회(initPlan)만 평가됨 — 의미 동일, 대량 행에서 RLS 성능 개선(Supabase 공식 패턴).
-- 적용 결과: public 정책 155개 중 auth.uid() 사용 82개 래핑, advisor auth_rls_initplan 82→0.
-- 자기검증형: 래핑 후 (1)정책 수 불변 (2)역변환=원본 정확일치 (3)미래핑 auth.fn() 0 을 확인,
-- 하나라도 어긋나면 RAISE 로 전체 롤백(DDL 트랜잭셔널). 정책 로직은 한 줄도 바뀌지 않음.
do $$
declare
  r record;
  v_before int;
  v_mismatch int;
  v_unwrapped int;
begin
  create temp table _pol_snap_initplan on commit drop as
    select tablename, policyname, qual, with_check
    from pg_policies where schemaname='public';
  select count(*) into v_before from _pol_snap_initplan;

  for r in
    select * from _pol_snap_initplan
    where (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~ 'auth\.(uid|role|jwt|email)\(\)'
  loop
    execute format('alter policy %I on public.%I %s %s',
      r.policyname, r.tablename,
      case when r.qual is not null
        then 'using (' || regexp_replace(r.qual, 'auth\.(uid|role|jwt|email)\(\)', '(select auth.\1())', 'g') || ')'
        else '' end,
      case when r.with_check is not null
        then 'with check (' || regexp_replace(r.with_check, 'auth\.(uid|role|jwt|email)\(\)', '(select auth.\1())', 'g') || ')'
        else '' end
    );
  end loop;

  -- VERIFY 1: 정책 추가/삭제 없음
  if (select count(*) from pg_policies where schemaname='public') <> v_before then
    raise exception 'INITPLAN ABORT: policy count changed % -> %',
      v_before, (select count(*) from pg_policies where schemaname='public');
  end if;

  -- VERIFY 2: 역변환(new)=old 정확 일치 → 래핑 외 변경 0 증명
  select count(*) into v_mismatch
  from pg_policies p
  join _pol_snap_initplan s on s.tablename=p.tablename and s.policyname=p.policyname
  where coalesce(regexp_replace(coalesce(p.qual,''),
          '\( SELECT (auth\.(uid|role|jwt|email)\(\)) AS (uid|role|jwt|email)\)', '\1', 'g'),'') <> coalesce(s.qual,'')
     or coalesce(regexp_replace(coalesce(p.with_check,''),
          '\( SELECT (auth\.(uid|role|jwt|email)\(\)) AS (uid|role|jwt|email)\)', '\1', 'g'),'') <> coalesce(s.with_check,'');
  if v_mismatch <> 0 then
    raise exception 'INITPLAN ABORT: reverse-transform mismatch in % policies', v_mismatch;
  end if;

  -- VERIFY 3: 미래핑 auth.fn() 잔존 0 (래핑 완전성)
  select count(*) into v_unwrapped
  from pg_policies p
  where p.schemaname='public'
    and regexp_replace(coalesce(p.qual,'') || ' ' || coalesce(p.with_check,''),
          '\( SELECT auth\.(uid|role|jwt|email)\(\) AS (uid|role|jwt|email)\)', '', 'g')
        ~ 'auth\.(uid|role|jwt|email)\(\)';
  if v_unwrapped <> 0 then
    raise exception 'INITPLAN ABORT: % policies still have UNWRAPPED auth.fn()', v_unwrapped;
  end if;

  raise notice 'INITPLAN OK: % policies total, all auth.uid() wrapped, exact reverse-transform verified', v_before;
end $$;
