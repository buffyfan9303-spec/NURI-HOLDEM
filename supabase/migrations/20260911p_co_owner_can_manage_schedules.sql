-- 20260911p — 공동 사장(venue_owners)도 포스터·예약을 관리한다 (오너 지시 2026-09-11: "공동사장 직원관리처럼 열어줘")
--
-- 무엇이 문제였나 — 20260911e 와 **같은 모양의 결함**이 포스터 쪽에 남아 있었다
--   직원 관리는 20260911e 에서 판정을 한 함수로 모아 공동 사장을 포함시켰다. 그런데 포스터는
--   클라이언트가 `user.role === 'venue_owner'` 로 메뉴를 열고(VenueManageTab canPosters),
--   서버 RLS 는 `my_role() = any('venue_owner','admin')` 를 요구한다 — **둘 다 공동 사장을 뺀다.**
--   add_venue_owner 는 profiles.role 을 바꾸지 않으므로(운영 DB 확인) 공동 사장은 role 이 'user' 인 채로
--   "이 매장의 사장" 이 된다. 그래서 포스터 메뉴가 아예 안 보이고, 보이더라도 등록이 거부된다.
--
-- 무엇을 바꾸나
--   ① 판정 함수 하나를 새로 만든다 — can_manage_venue_schedules(venue_id).
--      can_manage_pos · can_manage_venue_staff 와 **같은 문장**이다(관리자 · 매장주 · 공동 사장 approved).
--      규칙이 한 곳에 있으면 다시 갈릴 수 없다 — 20260911e 가 배운 것이 그것이다.
--   ② schedules 의 insert · update · delete 정책이 그 함수를 **OR 로 더한다**.
--
--   ⚠ 순수 가산(purely additive)으로 쓴다. 종전 절을 그대로 두고 `or` 한 줄만 붙인다 —
--     라이브 서비스라 **지금 통과하던 것이 하나라도 막히면 안 된다**. 특히 venue_id 가 NULL 인 포스터
--     (매장 없이 등록된 옛 행·관리자 등록)가 있어서, 판정 함수만으로 갈아치우면 그것들이 통째로 잠긴다.
--
--   ③ update 에 WITH CHECK 을 새로 붙인다(종전 null). USING 만 있으면 '고칠 수 있는 사람'이
--     그 행의 venue_id 를 **자기가 관리하지 않는 매장으로 옮길 수** 있다. 공동 사장이 들어오는 지금
--     그 구멍을 열어 둔 채로 두면 안 된다. 종전에 통과하던 경로(본인 명의 수정·관리자)는 그대로 통과한다.
--
-- 건드리지 않는 것
--   · schedules_select — 20260911m(미적용)이 그 정책을 다시 쓴다. 여기서 함께 건드리면 적용 순서에 따라
--     한쪽이 다른 쪽을 되돌린다. 대신 알아 둘 것: 미승인(approved=false) 포스터는 **작성자 본인과 관리자**
--     에게만 보인다 → 인증 매장이 아닌 곳에서는 공동 사장이 대표의 심사 대기 포스터를 못 본다.
--     인증 매장은 등록 즉시 approved=true 라 이 틈이 없다. 넓히려면 m 적용 후 별도 마이그레이션으로.
--   · owner_id 의 의미 — 여전히 '등록한 사람' 이다. 공동 사장이 올린 포스터의 owner_id 는 공동 사장이다.
--     화면의 '내 포스터' 목록은 같은 커밋에서 owner 가 아니라 **매장** 기준으로 바꿨다(MyPostersTab).
--
-- 데이터 영향: 0행 변경. 판정만 넓어진다.
-- ROLLBACK: 파일 하단 참고.

-- ── ① 관리 권한 판정 — can_manage_pos · can_manage_venue_staff 와 같은 문장 ──────
create or replace function public.can_manage_venue_schedules(p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(my_role() = 'admin'::user_role, false)
      or exists (select 1 from public.venues v
                  where v.id = p_venue_id and v.owner_id = auth.uid())
      or exists (select 1 from public.venue_owners vo
                  where vo.venue_id = p_venue_id and vo.user_id = auth.uid() and vo.status = 'approved');
$$;
-- CREATE OR REPLACE 는 ACL 을 초기화한다(nuri-migration §1) — 다시 발급한다.
-- 이 함수는 쓰기 정책에서만 불린다(anon 은 SELECT 만 한다) → PUBLIC 회수가 안전하다.
-- ⚠ `from anon` 만으로는 무효다(PUBLIC 기본 GRANT). 반드시 `from public` 을 함께.
revoke execute on function public.can_manage_venue_schedules(uuid) from public, anon;
grant execute on function public.can_manage_venue_schedules(uuid) to authenticated, service_role;
comment on function public.can_manage_venue_schedules(uuid) is
  '이 매장의 포스터·예약을 관리할 수 있는가 — 관리자 · 매장주 · 공동 사장(venue_owners approved). 2026-09-11 신설.';

-- ── ② 쓰기 정책 3종 — 종전 절 그대로 + 공동 사장 한 줄 ────────────────────────
drop policy if exists "schedules_insert" on public.schedules;
create policy "schedules_insert" on public.schedules
  for insert to public
  with check (
    -- 명의는 언제나 본인 — 남의 이름으로 등록하는 경로는 열지 않는다(종전과 동일)
    owner_id = (select auth.uid())
    and (
      -- 종전 규칙 그대로: 승인된 업주 또는 관리자
      (my_role() = any (array['venue_owner'::user_role, 'admin'::user_role])
        and (
          my_role() = 'admin'::user_role
          or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved = true)
        ))
      -- 2026-09-11(p) 추가: 이 매장의 공동 사장이면 자기 명의로 등록할 수 있다
      or (venue_id is not null and public.can_manage_venue_schedules(venue_id))
    )
  );

drop policy if exists "schedules_update" on public.schedules;
create policy "schedules_update" on public.schedules
  for update to public
  using (
    owner_id = (select auth.uid())
    or my_role() = 'admin'::user_role
    or (venue_id is not null and public.can_manage_venue_schedules(venue_id))
  )
  -- ③ 종전에 없던 WITH CHECK — 수정으로 **남의 매장으로 옮기는 것**을 막는다.
  --    종전 통과 경로(본인 명의 · 관리자)는 그대로다.
  with check (
    owner_id = (select auth.uid())
    or my_role() = 'admin'::user_role
    or (venue_id is not null and public.can_manage_venue_schedules(venue_id))
  );

drop policy if exists "schedules_delete" on public.schedules;
create policy "schedules_delete" on public.schedules
  for delete to public
  using (
    owner_id = (select auth.uid())
    or my_role() = 'admin'::user_role
    or (venue_id is not null and public.can_manage_venue_schedules(venue_id))
  );

notify pgrst, 'reload schema';

-- ── 검증 — 적용 직후 스스로 확인, 어긋나면 전체 롤백 ──────────────────────────
do $$
declare v_src text;
begin
  -- 함수: 세 절이 다 있고 SECURITY DEFINER · search_path 가 고정인가
  select regexp_replace(prosrc, '\s+', ' ', 'g') into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'can_manage_venue_schedules';
  if v_src is null then raise exception 'ABORT: 판정 함수가 생성되지 않았다'; end if;
  if v_src not like '%venue_owners%' then raise exception 'ABORT: 공동 사장 절이 없다'; end if;
  if v_src not like '%owner_id = auth.uid()%' then raise exception 'ABORT: 매장주 절이 없다'; end if;
  if v_src not like '%admin%' then raise exception 'ABORT: 관리자 절이 없다'; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='public' and p.proname='can_manage_venue_schedules'
                    and p.prosecdef
                    and array_to_string(p.proconfig,',') like '%search_path=public, pg_temp%') then
    raise exception 'ABORT: SECURITY DEFINER 또는 search_path 가 풀렸다';
  end if;

  -- ACL: authenticated 는 실행할 수 있고 anon 은 못 한다
  if not has_function_privilege('authenticated', 'public.can_manage_venue_schedules(uuid)', 'execute') then
    raise exception 'ABORT: authenticated 가 판정 함수를 실행할 수 없다 — 화면이 영영 닫힌다';
  end if;
  if has_function_privilege('anon', 'public.can_manage_venue_schedules(uuid)', 'execute') then
    raise exception 'ABORT: anon 이 판정 함수를 실행할 수 있다 — PUBLIC 회수가 안 됐다';
  end if;

  -- 정책 3종: 공동 사장 절이 들어갔고 **종전 절이 살아 있는가**(가산이어야 한다)
  select regexp_replace(pg_get_expr(polwithcheck, polrelid), '\s+', ' ', 'g') into v_src
    from pg_policy where polname = 'schedules_insert';
  if v_src is null then raise exception 'ABORT: schedules_insert 가 사라졌다'; end if;
  if v_src not like '%can_manage_venue_schedules%' then raise exception 'ABORT: insert 에 공동 사장 절이 없다'; end if;
  if v_src not like '%venue_owner%' then raise exception 'ABORT: insert 의 종전 업주 절이 사라졌다 — 가산이 아니다'; end if;
  if v_src not like '%approved%' then raise exception 'ABORT: insert 의 승인 업주 조건이 사라졌다'; end if;
  if v_src not like '%owner_id%' then raise exception 'ABORT: insert 의 본인 명의 조건이 사라졌다'; end if;

  select regexp_replace(pg_get_expr(polqual, polrelid), '\s+', ' ', 'g') into v_src
    from pg_policy where polname = 'schedules_update';
  if v_src is null then raise exception 'ABORT: schedules_update 가 사라졌다'; end if;
  if v_src not like '%can_manage_venue_schedules%' then raise exception 'ABORT: update 에 공동 사장 절이 없다'; end if;
  if v_src not like '%owner_id%' then raise exception 'ABORT: update 의 본인 절이 사라졌다'; end if;
  select regexp_replace(pg_get_expr(polwithcheck, polrelid), '\s+', ' ', 'g') into v_src
    from pg_policy where polname = 'schedules_update';
  if v_src is null then raise exception 'ABORT: update 의 WITH CHECK 이 안 붙었다 — 남의 매장으로 옮기는 구멍이 남는다'; end if;

  select regexp_replace(pg_get_expr(polqual, polrelid), '\s+', ' ', 'g') into v_src
    from pg_policy where polname = 'schedules_delete';
  if v_src is null then raise exception 'ABORT: schedules_delete 가 사라졌다'; end if;
  if v_src not like '%can_manage_venue_schedules%' then raise exception 'ABORT: delete 에 공동 사장 절이 없다'; end if;
  if v_src not like '%owner_id%' then raise exception 'ABORT: delete 의 본인 절이 사라졌다'; end if;

  -- schedules_select 는 건드리지 않았다(20260911m 과 충돌 방지)
  if not exists (select 1 from pg_policy where polname = 'schedules_select') then
    raise exception 'ABORT: schedules_select 가 사라졌다 — 이 마이그레이션은 그것을 건드리지 않는다';
  end if;

  -- RLS 가 켜져 있는가(정책을 다시 만들며 꺼지지 않았는가)
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                  where n.nspname='public' and c.relname='schedules' and c.relrowsecurity) then
    raise exception 'ABORT: schedules 의 RLS 가 꺼졌다';
  end if;
end $$;

-- ROLLBACK (필요 시 수동) — 2026-09-11 적용 직전 운영 상태 그대로
--   drop policy if exists "schedules_insert" on public.schedules;
--   create policy "schedules_insert" on public.schedules for insert to public with check (
--     (owner_id = (select auth.uid()))
--     and (my_role() = any (array['venue_owner'::user_role, 'admin'::user_role]))
--     and ((my_role() = 'admin'::user_role)
--          or exists (select 1 from profiles p where p.id = (select auth.uid()) and p.approved = true)));
--   drop policy if exists "schedules_update" on public.schedules;
--   create policy "schedules_update" on public.schedules for update to public
--     using ((owner_id = (select auth.uid())) or (my_role() = 'admin'::user_role));
--   drop policy if exists "schedules_delete" on public.schedules;
--   create policy "schedules_delete" on public.schedules for delete to public
--     using ((owner_id = (select auth.uid())) or (my_role() = 'admin'::user_role));
--   drop function if exists public.can_manage_venue_schedules(uuid);
