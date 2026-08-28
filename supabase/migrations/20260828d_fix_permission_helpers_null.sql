-- ============================================================================
-- 권한 헬퍼 fail-open 폐쇄 (2026-08-28, 라이브 보안 수정)
--
-- 무엇이 문제였나
--   can_manage_pos / can_manage_venue_staff / is_group_manager 는
--     select my_role() = 'admin'::user_role or exists(...) or exists(...)
--   구조인데, 비로그인(anon)은 profiles 행이 없어 my_role() 이 NULL 이다.
--   SQL 3값 논리에서 `NULL = 'admin'` → NULL, `NULL or false` → **NULL**.
--   호출부는 대부분 plpgsql 의
--     if not can_manage_pos(v_venue) then raise exception '권한 없음'; end if;
--   인데 `not NULL` = NULL 이고 **IF 는 NULL 을 거짓으로 취급해 raise 를 건너뛴다**
--   → 권한 검사가 통째로 열린다(fail-open). 실측으로 세 함수 모두 NULL 확인.
--   특히 set_venue_page_config 는 SECURITY DEFINER 에 이 가드 하나뿐이라
--   비로그인이 임의 매장의 page_config 를 덮어쓸 수 있는 상태였다.
--
-- 왜 이렇게 고치나
--   호출부 22곳을 각각 `is distinct from true` 로 고치는 대신 **헬퍼 3개를 NULL 을
--   반환할 수 없게** 만든다. 이들을 쓰는 모든 함수와 RLS 정책이 한 번에 닫히고,
--   앞으로 추가될 호출부도 자동으로 안전하다(빠뜨릴 수 있는 곳이 없다).
--
-- 정상 사용자 영향 0
--   로그인 + 소유자/공동운영자/관리자는 기존과 동일하게 true.
--   달라지는 것은 '판정 불가(NULL)' 였던 경우가 명시적 false 가 되는 것뿐이다.
-- ============================================================================

create or replace function public.can_manage_pos(p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(my_role() = 'admin'::user_role, false)
      or exists (select 1 from public.venues v where v.id = p_venue_id and v.owner_id = auth.uid())
      or exists (select 1 from public.venue_owners vo
                 where vo.venue_id = p_venue_id and vo.user_id = auth.uid() and vo.status = 'approved');
$$;

create or replace function public.can_manage_venue_staff(p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(my_role() = 'admin'::user_role, false)
      or exists (select 1 from public.venues v where v.id = p_venue_id and v.owner_id = auth.uid());
$$;

create or replace function public.is_group_manager(gid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(public.my_role() = 'admin'::user_role, false)
      or exists (select 1 from public.venues v where v.id = gid and v.owner_id = auth.uid())
      or exists (select 1 from public.group_members m
                 where m.group_id = gid and m.user_id = auth.uid()
                   and m.role = 'manager' and m.status = 'approved');
$$;

-- 비로그인은 이 판정을 물어볼 이유가 없다(RLS 정책은 서버 내부에서 호출하므로 영향 없음).
revoke execute on function public.can_manage_pos(uuid)         from anon;
revoke execute on function public.can_manage_venue_staff(uuid) from anon;
revoke execute on function public.is_group_manager(uuid)       from anon;
