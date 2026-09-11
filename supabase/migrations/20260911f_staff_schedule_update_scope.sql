-- 20260911f — 근무표 UPDATE 만 권한이 넓어 급여 근거를 장부 직원이 고칠 수 있던 것 (2026-09-11 연동 점검)
--
-- staff_schedule 네 정책 중 **UPDATE 만** 기준이 달랐다:
--   select/insert/delete : can_manage_pos(venue_id)   [+ 별도 self 조회 정책 is_my_shift_row]
--   update               : **can_access_ledger(venue_id)**  ← 여기만 넓다
-- can_access_ledger = can_manage_pos OR ledger_access 등록 직원.
-- 즉 **장부 권한만 받은 직원이 근무표를 고칠 수 있었다** — check_in/check_out 은 인건비(시간×시급)의
-- 근거라서, 급여 근거를 본인이 조작할 수 있는 자리였다.
--
-- 좁혀도 안전한 이유 — 직원 본인 출퇴근은 이미 RPC 가 맡는다
--   set_my_shift_time(uuid, date, text, text) : SECURITY DEFINER + search_path 고정 → **RLS 를 우회**
--     · p_field 는 check_in/check_out 만 · 값은 HH:MM 정규식 검증
--     · 대상 행을 is_my_shift_row 로 **본인 행 한 건**만 잡는다(동명이인이면 아무도 통과 안 함)
--   화면도 정확히 갈려 있다:
--     StaffPayroll.StaffSelfAttendance(출근 관리) → setMyShiftTime  = 위 RPC
--     StaffSchedule(직원 관리, 관리 권한 게이트)  → setShiftTimes · confirmSchedule = 직접 UPDATE
--
-- 데이터 영향 0행. 2026-09-11 실측: ledger_access 0행 — 쓰는 사람이 없는 잠복 결함이었다.
-- ROLLBACK:
--   drop policy if exists staff_sched_update on public.staff_schedule;
--   create policy staff_sched_update on public.staff_schedule for update
--     using (can_access_ledger(venue_id)) with check (can_access_ledger(venue_id));

drop policy if exists staff_sched_update on public.staff_schedule;
create policy staff_sched_update on public.staff_schedule
  for update
  using (public.can_manage_pos(venue_id))
  with check (public.can_manage_pos(venue_id));

notify pgrst, 'reload schema';

do $$
declare v_using text; v_check text; v_n int;
begin
  select regexp_replace(pg_get_expr(polqual, polrelid), '\s+',' ','g'),
         regexp_replace(pg_get_expr(polwithcheck, polrelid), '\s+',' ','g')
    into v_using, v_check from pg_policy where polname = 'staff_sched_update';
  if v_using is null then raise exception 'ABORT: staff_sched_update 정책이 사라졌다'; end if;
  if v_using like '%can_access_ledger%' or v_check like '%can_access_ledger%' then
    raise exception 'ABORT: UPDATE 가 아직 can_access_ledger 를 쓴다';
  end if;
  if v_using not like '%can_manage_pos%' or v_check not like '%can_manage_pos%' then
    raise exception 'ABORT: UPDATE 의 using/with check 가 can_manage_pos 가 아니다';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='set_my_shift_time' and p.prosecdef) then
    raise exception 'ABORT: set_my_shift_time 이 없거나 SECURITY DEFINER 가 아니다 — 좁히면 직원이 막힌다';
  end if;
  if not has_function_privilege('authenticated','public.set_my_shift_time(uuid, date, text, text)','execute') then
    raise exception 'ABORT: authenticated 가 set_my_shift_time 을 실행할 수 없다';
  end if;
  if not exists (select 1 from pg_policy where polname = 'staff_sched_self_select') then
    raise exception 'ABORT: staff_sched_self_select 가 사라졌다 — 직원이 자기 근무를 못 본다';
  end if;
  select count(*) into v_n from pg_policy
   where polname in ('staff_sched_select','staff_sched_insert','staff_sched_delete')
     and coalesce(pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)) like '%can_manage_pos%';
  if v_n <> 3 then raise exception 'ABORT: select/insert/delete 가 can_manage_pos 셋이 아니다 (%)', v_n; end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                  where n.nspname='public' and c.relname='staff_schedule' and c.relrowsecurity) then
    raise exception 'ABORT: staff_schedule 의 RLS 가 꺼졌다';
  end if;
end $$;
