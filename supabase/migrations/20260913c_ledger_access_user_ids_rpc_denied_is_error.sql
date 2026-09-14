-- 20260913c — 직원 권한 보유자 목록 조회에서 "비인가" 와 "아무도 없음" 이 같은 200+0행이던 것 (P02 재작업, 2026-09-13)
-- ⛔ 20260915a_ledger_access_user_ids_rpc_denied_is_error.sql 로 대체됨(2026-09-15 라이브 적용). 이 파일은 적용하지 않는다.
-- ⚠ 초안(DRAFT) — 라이브 적용 금지. 매장 담당(store-team)이 계약만 확정한다. 적용·클라이언트 전환은 nuri-lead 가
--   nuri-migration 절차(격리 컨테이너 자가검사 → 임퍼소네이션 + ROLLBACK 검증)를 밟은 뒤에만 한다.
--   이 파일이 적용되기 전까지 클라이언트(src/api/ledger.ts getLedgerAccessUserIds · src/api/vouchers.ts getVoucherAccessUserIds)는
--   그대로 두고, 적용과 **같은 배포**에서 아래 ③ 대로 전환한다(먼저 전환하면 구서버에서 PGRST202 → 배너).
--
-- 근본 원인(독립 검증 FAIL 항목)
--   · getLedgerAccessUserIds 는 ledger_access 테이블을 RLS(la_select: can_manage_pos(venue_id) OR user_id = auth.uid())로 읽는다.
--     비인가 호출자는 오류가 아니라 **0행** 을 받는다 — 화면은 "아무도 권한이 없다" 로 그린다.
--   · get_voucher_access_user_ids 는 `where … and can_manage_pos(p_venue_id)` 로 인가를 WHERE 절에 넣어 마찬가지로 200+0행이다.
--   · 그래서 클라이언트의 `if (error) throw error`(P02 1차)는 세션 만료(PGRST301)·구버전 서버(PGRST202)·네트워크만 잡고,
--     42501 은 **서버가 만들 수 없는 조건**이었다(errorPropagation 테스트가 42501 을 목킹한 것이 독립 검증에서 지적됐다).
--   · 실피해: 매장 직원(ledger_access 보유자)이 NuriPosLedger 에서 담당 직원 후보를 볼 때 RLS 가 자기 행만 주어
--     후보가 '나 혼자' 로 보였다(부분 목록). 업주 아닌 공동운영자 후보 승인 전 상태도 동일.
--
-- 고치는 방법 — "모른다/안 된다" 는 오류로, "없다" 만 0행으로
--   ① get_ledger_access_user_ids(p_venue_id): SECURITY DEFINER, can_access_ledger 게이트.
--      장부를 볼 수 있는 사람(업주·공동운영자·관리자·ledger_access 보유자)은 **전체** 목록을 받는다(담당 후보 = 전체 보유자).
--      아닌 사람은 42501(insufficient_privilege)을 받는다 → 클라이언트 isDenied → ACCESS_LOAD_DENIED_MSG(계정 안내).
--   ② get_voucher_access_user_ids: WHERE 절 인가를 raise 로 바꾼다(can_manage_pos 유지 — 이용권 내역 권한 목록은 운영자만).
--      반환 타입·인자 동일 → CREATE OR REPLACE(ACL 보존). 그래도 REVOKE/GRANT 를 같이 적는다(새로 만들어지는 환경 대비).
--   ③ 클라이언트(적용과 같은 배포): ledger.ts getLedgerAccessUserIds 를 `supabase.rpc('get_ledger_access_user_ids', { p_venue_id })` 로.
--      vouchers.ts 는 호출 그대로(오류 형태만 바뀐다). errorPropagation 테스트에 42501 케이스를 **그때** 되살린다.
--
-- NULL-안전: 게이트는 `is distinct from true` — 헬퍼가 NULL 을 반환할 수 없게 고쳤지만(20260828d) 이 파일 혼자서도 닫혀 있어야 한다.
-- 데이터 영향: 0(읽기 전용 함수 2개). 정상 사용자 영향: 인가된 호출자는 종전과 같은 행을 받는다.
--   달라지는 것은 '비인가 → 0행' 이 '비인가 → 42501' 이 되는 것뿐이고, 클라이언트는 그 코드를 이미 isDenied 로 분류한다.

begin;

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
  v_def text;
  v_acl aclitem[];
begin
  for v_def in
    select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('get_ledger_access_user_ids', 'get_voucher_access_user_ids')
  loop
    if v_def !~* 'security definer' then raise exception '자가검사: SECURITY DEFINER 누락'; end if;
    if v_def !~* 'search_path\s*(=|to)\s*''?public''?\s*,\s*''?pg_temp''?' then raise exception '자가검사: search_path 누락'; end if;
    if v_def !~ 'is distinct from true' then raise exception '자가검사: NULL-안전 게이트 누락'; end if;
    if v_def !~ '42501' then raise exception '자가검사: 비인가 raise 누락'; end if;
  end loop;
  select p.proacl into v_acl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_ledger_access_user_ids';
  if v_acl is null then raise exception '자가검사: ACL 이 기본값(PUBLIC 실행 가능) — REVOKE 가 적용되지 않았다'; end if;
  if has_function_privilege('anon', 'public.get_ledger_access_user_ids(uuid)', 'execute') then
    raise exception '자가검사: anon 이 get_ledger_access_user_ids 를 실행할 수 있다';
  end if;
  if has_function_privilege('anon', 'public.get_voucher_access_user_ids(uuid)', 'execute') then
    raise exception '자가검사: anon 이 get_voucher_access_user_ids 를 실행할 수 있다';
  end if;
end
$check$;

commit;
