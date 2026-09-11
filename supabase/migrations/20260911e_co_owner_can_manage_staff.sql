-- 20260911e — 공동 사장(venue_owners)도 직원을 관리한다 (오너 결정 2026-09-11, 안 B)
--
-- 무엇이 문제였나
--   '이 매장을 관리할 수 있는가' 판정이 **세 곳에 따로** 적혀 있었고, 그중 둘만 공동 사장을 포함했다:
--     · can_manage_pos           : admin · venues.owner_id · **venue_owners(approved)**  ← 공동 사장 포함
--     · can_manage_venue_staff   : admin · venues.owner_id                                ← 공동 사장 빠짐
--     · venue_staff / venue_staff_invites 의 RLS : owner_id 를 **인라인으로** 다시 검사    ← 공동 사장 빠짐
--   그래서 공동 사장은 장부·통계는 되는데 '직원 관리'만 막혔다. 게다가 클라이언트는
--   profiles.role 로 메뉴를 열어 줘서, 목록은 자기 행 하나만 뜨고 추가는 거부되는 dead-end 가 됐다.
--   (add_venue_owner 는 profiles.role 을 바꾸지 않는다 — 운영 DB 로 확인. 그래서 둘이 영구히 갈린다.)
--
-- 무엇을 바꾸나
--   ① can_manage_venue_staff 에 venue_owners(approved) 절을 더한다 — can_manage_pos 와 **같은 문장**이 된다.
--   ② venue_staff · venue_staff_invites 의 RLS 가 owner_id 를 다시 검사하지 말고
--      **can_manage_venue_staff() 를 부르게** 한다. 규칙이 한 곳에만 있으면 다시 갈릴 수 없다.
--      (이게 이번 결함의 근본 원인이다 — 같은 규칙의 세 벌 구현.)
--
-- 보존하는 것
--   · 함수 시그니처(p_venue_id uuid) → boolean · SQL · STABLE · SECURITY DEFINER · search_path=public, pg_temp
--   · '본인 행은 본인이 본다'(user_id = auth.uid()) — 직원이 자기 등록 정보·초대를 보는 경로
--   · vsi_read 의 대상 롤(authenticated) · venue_staff_select 의 대상 롤(제한 없음)
--   · ACL — CREATE OR REPLACE 는 ACL 을 초기화하므로(nuri-migration §1) 아래에서 다시 발급한다.
--     ⚠ PUBLIC EXECUTE 를 **그대로 둔다**. RLS 정책이 이 함수를 부르므로, 권한을 뺏으면
--       비로그인 조회가 '0행'이 아니라 **오류**로 떨어진다(회귀). auth.uid() 가 null 이면 false 라 안전하다.
--
-- 데이터 영향: 0행 변경. 판정만 넓어진다.
--   2026-09-11 실측: venue_owners(approved) 1명 · venue_staff 0행 — 지금 당장 바뀌는 화면은 없다.
-- ROLLBACK: 파일 하단 참고.

-- ── ① 관리 권한 판정 — can_manage_pos 와 같은 문장으로 ────────────────────────
create or replace function public.can_manage_venue_staff(p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(my_role() = 'admin'::user_role, false)
      or exists (select 1 from public.venues v
                  where v.id = p_venue_id and v.owner_id = auth.uid())
      -- 2026-09-11(e): 공동 사장 추가. can_manage_pos 가 이미 쓰던 바로 그 절이다.
      or exists (select 1 from public.venue_owners vo
                  where vo.venue_id = p_venue_id and vo.user_id = auth.uid() and vo.status = 'approved');
$$;
-- CREATE OR REPLACE 가 ACL 을 초기화한다 — 원래 상태(PUBLIC 기본 + 두 롤 명시)로 되돌린다.
grant execute on function public.can_manage_venue_staff(uuid) to authenticated, service_role;
comment on function public.can_manage_venue_staff(uuid) is
  '이 매장의 직원(구성원)을 관리할 수 있는가 — 관리자 · 매장주 · 공동 사장(venue_owners approved). 2026-09-11 공동 사장 포함.';

-- ── ② RLS 는 위 함수 하나만 부른다(owner_id 인라인 재검사 제거) ───────────────
drop policy if exists venue_staff_select on public.venue_staff;
create policy venue_staff_select on public.venue_staff
  for select
  using (
    -- 관리자·매장주·공동 사장은 전원 조회
    public.can_manage_venue_staff(venue_id)
    -- 직원 본인은 자기 행만 — 이 절이 빠지면 직원이 자기 등록 정보를 못 본다
    or user_id = (select auth.uid())
  );

drop policy if exists vsi_read on public.venue_staff_invites;
create policy vsi_read on public.venue_staff_invites
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.can_manage_venue_staff(venue_id)
  );

notify pgrst, 'reload schema';

-- ── 검증 — 적용 직후 스스로 확인, 어긋나면 전체 롤백 ──────────────────────────
do $$
declare v_src text;
begin
  select regexp_replace(prosrc, '\s+', ' ', 'g') into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'can_manage_venue_staff';
  if v_src not like '%venue_owners%' then
    raise exception 'ABORT: can_manage_venue_staff 에 공동 사장 절이 안 들어갔다';
  end if;
  if v_src not like '%owner_id = auth.uid()%' then
    raise exception 'ABORT: 매장주 절이 사라졌다';
  end if;
  if v_src not like '%admin%' then raise exception 'ABORT: 관리자 절이 사라졌다'; end if;

  -- SECURITY DEFINER · search_path 가 유지됐는가(하이재킹 방지)
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='public' and p.proname='can_manage_venue_staff'
                    and p.prosecdef
                    and array_to_string(p.proconfig,',') like '%search_path=public, pg_temp%') then
    raise exception 'ABORT: SECURITY DEFINER 또는 search_path 가 풀렸다';
  end if;

  -- RLS 가 함수를 부르는가 + '본인 행' 절이 살아 있는가
  select regexp_replace(pg_get_expr(polqual, polrelid), '\s+', ' ', 'g') into v_src
    from pg_policy where polname = 'venue_staff_select';
  if v_src is null then raise exception 'ABORT: venue_staff_select 정책이 사라졌다'; end if;
  if v_src not like '%can_manage_venue_staff%' then raise exception 'ABORT: venue_staff 정책이 함수를 안 쓴다'; end if;
  if v_src not like '%user_id%' then raise exception 'ABORT: venue_staff 에서 직원 본인 조회 절이 사라졌다'; end if;

  select regexp_replace(pg_get_expr(polqual, polrelid), '\s+', ' ', 'g') into v_src
    from pg_policy where polname = 'vsi_read';
  if v_src is null then raise exception 'ABORT: vsi_read 정책이 사라졌다'; end if;
  if v_src not like '%can_manage_venue_staff%' then raise exception 'ABORT: vsi_read 가 함수를 안 쓴다'; end if;
  if v_src not like '%user_id%' then raise exception 'ABORT: vsi_read 에서 본인 초대 조회 절이 사라졌다'; end if;

  -- RLS 자체가 켜져 있는가(정책을 다시 만들면서 꺼지지 않았는가)
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                  where n.nspname='public' and c.relname='venue_staff' and c.relrowsecurity) then
    raise exception 'ABORT: venue_staff 의 RLS 가 꺼졌다';
  end if;

  -- ACL: authenticated 가 실행할 수 있어야 RLS 평가가 오류로 안 떨어진다
  if not has_function_privilege('authenticated', 'public.can_manage_venue_staff(uuid)', 'execute') then
    raise exception 'ABORT: authenticated 가 판정 함수를 실행할 수 없다 — RLS 조회가 오류가 된다';
  end if;
end $$;

-- ROLLBACK (필요 시 수동)
--   create or replace function public.can_manage_venue_staff(p_venue_id uuid)
--   returns boolean language sql stable security definer set search_path = public, pg_temp as $$
--     select coalesce(my_role() = 'admin'::user_role, false)
--         or exists (select 1 from public.venues v where v.id = p_venue_id and v.owner_id = auth.uid());
--   $$;
--   grant execute on function public.can_manage_venue_staff(uuid) to authenticated, service_role;
--   drop policy if exists venue_staff_select on public.venue_staff;
--   create policy venue_staff_select on public.venue_staff for select using (
--     (my_role() = 'admin'::user_role)
--     or (exists (select 1 from venues v where v.id = venue_staff.venue_id and v.owner_id = (select auth.uid())))
--     or (user_id = (select auth.uid())));
--   drop policy if exists vsi_read on public.venue_staff_invites;
--   create policy vsi_read on public.venue_staff_invites for select to authenticated using (
--     (user_id = (select auth.uid()))
--     or (exists (select 1 from venues v where v.id = venue_staff_invites.venue_id and v.owner_id = (select auth.uid()))));
