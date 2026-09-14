-- 20260915a — 직원 권한 보유자 목록 조회에서 "비인가" 와 "아무도 없음" 이 같은 200+0행이던 것 (P02 재작업 완성, 2026-09-15)
-- 초안 20260913c 를 완성해 적용한다. 클라이언트(src/api/ledger.ts getLedgerAccessUserIds)를 **같은 배포**에서
-- `supabase.rpc('get_ledger_access_user_ids')` 로 전환했다 — 서버만 먼저 나가면 구버전 클라가 계속 테이블을 읽고(증상 그대로),
-- 클라만 먼저 나가면 PGRST202(함수 없음) 배너가 뜬다. 커밋·배포는 리드가 한 번에 한다.
--
-- 라이브 실측(2026-09-15, 적용 전):
--   · PostgreSQL 17.6. get_ledger_access_user_ids 는 **라이브에 없다**(새로 만들어진다 → REVOKE/GRANT 필수).
--   · get_voucher_access_user_ids 는 있다: language sql · volatile · SECURITY DEFINER · search_path public,pg_temp ·
--     ACL {postgres,authenticated,service_role} (이미 anon 회수됨). 인자·반환 동일 → CREATE OR REPLACE(ACL 보존).
--   · ledger_access 0행 · voucher_access 0행 → 데이터 영향 0.
--   · RLS la_select / voucher_access_select = can_manage_pos(venue_id) OR user_id = auth.uid() — 비인가 0행·직원 자기 행만.
--
-- 근본 원인(독립 검증 FAIL 항목)
--   · getLedgerAccessUserIds 는 ledger_access 테이블을 RLS 로 직접 읽었다. 비인가는 오류가 아니라 **0행**, 장부직원은 **자기 행만**
--     → 화면은 "아무도 권한이 없다" / 담당 후보 "나 혼자" 로 그렸다(부분 목록).
--   · get_voucher_access_user_ids 는 `where … and can_manage_pos(p_venue_id)` 로 인가를 WHERE 절에 넣어 마찬가지로 200+0행.
--   · 그래서 클라이언트의 `if (error) throw error`(P02 1차)는 세션 만료(PGRST301)·구버전 서버(PGRST202)·네트워크만 잡고,
--     42501 은 서버가 만들 수 없는 조건이었다.
--
-- 고치는 방법 — "모른다/안 된다" 는 오류로, "없다" 만 0행으로
--   ① get_ledger_access_user_ids(p_venue_id): SECURITY DEFINER, can_access_ledger 게이트.
--      장부를 볼 수 있는 사람(업주·공동운영자·관리자·ledger_access 보유자)은 **전체** 목록(담당 후보 = 전체 보유자).
--      아닌 사람은 42501(insufficient_privilege) → 클라이언트 isDenied → ACCESS_LOAD_DENIED_MSG(계정 안내).
--   ② get_voucher_access_user_ids: WHERE 절 인가를 raise 로(can_manage_pos 유지 — 이용권 내역 권한 목록은 운영자만).
--   ③ 클라이언트(같은 배포): ledger.ts 를 RPC 로. vouchers.ts 는 호출 그대로(오류 형태만 바뀐다).
--      staffAccess.errorPropagation.test.ts 에 42501 케이스와 RPC 이름 계약을 추가했다.
--
-- NULL-안전: 게이트는 `is distinct from true` — 헬퍼가 NULL 을 반환할 수 없게 고쳤지만(20260828d) 이 파일 혼자서도 닫혀 있어야 한다.
-- 자가검사(맨 아래 DO): 정의·ACL 검사 + **동작 검사** — role authenticated(auth.uid() NULL)로 두 함수를 실제 호출해
--   42501 이 아니면 예외 → 트랜잭션째 롤백. authenticated 의 EXECUTE 권한을 먼저 양성 확인해 "실행 권한이 없어서 42501" 로 거짓 통과하지 않게 한다.

create or replace function public.get_ledger_access_user_ids(p_venue_id uuid)
returns table(user_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_venue_id is null then
    raise exception '매장이 지정되지 않았습니다' using errcode = '22023';
  end if;
  -- 장부를 볼 수 있는 사람만 — 업주·공동운영자·관리자·ledger_access 보유자(담당 직원 후보를 골라야 한다).
  if can_access_ledger(p_venue_id) is distinct from true then
    raise exception '권한 없음' using errcode = '42501';
  end if;
  return query
    select la.user_id
      from public.ledger_access la
     where la.venue_id = p_venue_id
     order by la.user_id;
end;
$$;

revoke execute on function public.get_ledger_access_user_ids(uuid) from public, anon;
grant  execute on function public.get_ledger_access_user_ids(uuid) to authenticated, service_role;

create or replace function public.get_voucher_access_user_ids(p_venue_id uuid)
returns table(user_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_venue_id is null then
    raise exception '매장이 지정되지 않았습니다' using errcode = '22023';
  end if;
  -- 이용권 내역 열람 권한 목록은 운영자(업주·공동운영자·관리자)만 — 종전 WHERE 절 조건을 오류로 승격.
  if can_manage_pos(p_venue_id) is distinct from true then
    raise exception '권한 없음' using errcode = '42501';
  end if;
  return query
    select va.user_id
      from public.voucher_access va
     where va.venue_id = p_venue_id
     order by va.user_id;
end;
$$;

revoke execute on function public.get_voucher_access_user_ids(uuid) from public, anon;
grant  execute on function public.get_voucher_access_user_ids(uuid) to authenticated, service_role;

-- 자가검사(적용 시 함께 실행 — 실패하면 트랜잭션이 롤백된다)
do $check$
declare
  v_fn  text;
  v_def text;
  v_acl aclitem[];
  v_cnt int;
begin
  foreach v_fn in array array['get_ledger_access_user_ids', 'get_voucher_access_user_ids'] loop
    select pg_get_functiondef(p.oid), p.proacl into v_def, v_acl
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn and pg_get_function_identity_arguments(p.oid) = 'p_venue_id uuid';
    if v_def is null then raise exception '자가검사: % 가 없다', v_fn; end if;
    if v_def !~* 'security definer' then raise exception '자가검사: % SECURITY DEFINER 누락', v_fn; end if;
    if v_def !~* 'search_path\s*(=|to)\s*''?public''?\s*,\s*''?pg_temp''?' then raise exception '자가검사: % search_path 누락', v_fn; end if;
    if v_def !~ 'is distinct from true' then raise exception '자가검사: % NULL-안전 게이트 누락', v_fn; end if;
    if v_def !~ '42501' then raise exception '자가검사: % 비인가 raise 누락', v_fn; end if;
    if v_acl is null then raise exception '자가검사: % ACL 이 기본값(PUBLIC 실행 가능) — REVOKE 가 적용되지 않았다', v_fn; end if;
    if has_function_privilege('anon', format('public.%I(uuid)', v_fn), 'execute') then
      raise exception '자가검사: anon 이 % 를 실행할 수 있다', v_fn;
    end if;
    -- 양성 대조: authenticated 는 실행할 수 있어야 한다(아래 동작 검사의 42501 이 "실행 권한 없음" 이 아니라 게이트에서 난 것임을 보장)
    if not has_function_privilege('authenticated', format('public.%I(uuid)', v_fn), 'execute') then
      raise exception '자가검사: authenticated 가 % 를 실행할 수 없다(과잉 회수)', v_fn;
    end if;
  end loop;

  -- 동작 검사: 비로그인 authenticated(auth.uid() = NULL, request.jwt.claims 없음) → 두 함수 모두 42501 이어야 한다(fail-open 대조).
  -- SET ROLE 은 예외 블록 **밖**에서 — SET ROLE 자체의 실패(42501)를 게이트 거부로 오인하지 않게.
  execute 'set local role authenticated';
  if current_user <> 'authenticated' then raise exception '자가검사: role 전환 실패(%)', current_user; end if;
  foreach v_fn in array array['get_ledger_access_user_ids', 'get_voucher_access_user_ids'] loop
    begin
      execute format('select count(*) from public.%I(%L::uuid)', v_fn, '00000000-0000-0000-0000-000000000000') into v_cnt;
      raise exception '자가검사: 비로그인 호출이 % 에서 오류 없이 %행을 받았다(fail-open)', v_fn, v_cnt;
    exception
      when insufficient_privilege then null; -- 기대한 42501
    end;
  end loop;
  execute 'reset role';
end
$check$;
