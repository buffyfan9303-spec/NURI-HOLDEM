-- 직원 관리 실동 점검(2026-08-28)에서 확인된 2건을 닫는다. 둘 다 additive — 기존 권한을 넓히지 않는다.
--
-- ① 구성원 제거가 '장부·순위 / 이용권내역' 권한을 회수하지 않았다(권한 잔존).
--    재현(실측): [E2E] 매장에서 직원에게 두 권한을 켜고 UI 로 '제거' 하면 profiles 는
--      role='user', venue_id=NULL 로 바뀌지만 ledger_access·voucher_access 행은 그대로 남는다.
--      그 계정으로 can_access_ledger(venue)=true · can_view_vouchers(venue)=true 가 계속 참이고,
--      clock_states UPDATE 정책(USING can_access_ledger)이 라이브 행 2건과 여전히 매치됐다.
--      → 내보낸 직원이 장부 읽기·수정, 클락 조작, 이용권 내역 열람을 유지한다.
--    can_access_ledger 를 건드리면 업주·운영자 경로까지 영향이 가므로, 누수의 출처인
--    '제거' 경로에서 부여 행을 함께 지우는 방식으로 닫는다(정책·헬퍼는 무변경).
--
-- ② 직원 본인이 자기 출근 스케줄을 아예 못 읽는다 → '내 출근 관리'가 항상 빈 화면.
--    재현(실측): 업주가 8/05·8/28 에 배정 → 그 직원 토큰으로
--      GET /rest/v1/staff_schedule?venue_id=eq.<venue> → 200 `[]`
--      PATCH .../staff_schedule?... {check_in} → 200 `[]` (0행, 오류도 없음)
--      staff_sched_select 는 USING can_manage_pos(venue_id) 라 venue_staff 를 포함하지 않는다.
--      (장부 권한을 받은 직원도 마찬가지 — SELECT 는 can_manage_pos 기준이다.)
--    UPDATE 정책을 넓히면 직원이 confirmed·start_hm 까지 바꿀 수 있으므로,
--    읽기만 정책으로 열고 쓰기는 check_in/check_out 두 칼럼만 만지는 RPC 로 제한한다.

-- ── ① 구성원 제거 시 부여 권한 동시 회수 ────────────────────────────────────
-- 부수 수정: 대상 매장을 '내가 가진 첫 매장(limit 1)' 이 아니라 '내가 소유한 매장 중
--   그 직원이 속한 매장' 으로 찾는다. 기존 방식은 매장을 2개 이상 가진 업주가
--   두 번째 매장 직원을 관리할 수 없었고, 무엇보다 회수해야 할 venue_id 를 틀리게 짚는다.
--   가드(v.owner_id = auth.uid())는 그대로라 접근 범위는 넓어지지 않는다.
create or replace function public.manage_staff(p_staff_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_staff_venue uuid;
begin
  if not exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.role = 'venue_owner' and p.approved) then
    raise exception '직원을 관리할 권한이 없습니다';
  end if;

  select venue_id into v_staff_venue
    from public.profiles where id = p_staff_id and role = 'venue_staff';
  if v_staff_venue is null
     or not exists (select 1 from public.venues v where v.id = v_staff_venue and v.owner_id = auth.uid()) then
    raise exception '본인 매장 직원만 관리할 수 있습니다';
  end if;

  if p_action = 'approve' then
    update public.profiles set approved = true  where id = p_staff_id;
  elsif p_action = 'reject' then
    update public.profiles set approved = false where id = p_staff_id;
  elsif p_action = 'remove' then
    update public.profiles set role = 'user', venue_id = null, approved = false where id = p_staff_id;
    -- 구성원이 아니게 된 계정에 부여 권한이 남으면 장부·클락·이용권이 계속 열린다.
    delete from public.ledger_access  where venue_id = v_staff_venue and user_id = p_staff_id;
    delete from public.voucher_access where venue_id = v_staff_venue and user_id = p_staff_id;
  else
    raise exception '알 수 없는 작업';
  end if;
end;
$$;
revoke all on function public.manage_staff(uuid, text) from public, anon;
grant execute on function public.manage_staff(uuid, text) to authenticated;

-- 같은 'limit 1' 결함이 직책 저장에도 있다(매장 2개 이상이면 두 번째 매장 직원 직책 저장 불가).
create or replace function public.set_staff_title(p_staff_id uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_staff_venue uuid;
begin
  if not exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.role = 'venue_owner' and p.approved) then
    raise exception '직원을 관리할 권한이 없습니다';
  end if;
  select venue_id into v_staff_venue
    from public.profiles where id = p_staff_id and role = 'venue_staff';
  if v_staff_venue is null
     or not exists (select 1 from public.venues v where v.id = v_staff_venue and v.owner_id = auth.uid()) then
    raise exception '본인 매장 직원만 관리할 수 있습니다';
  end if;
  update public.profiles
     set staff_title = nullif(left(btrim(coalesce(p_title, '')), 20), '')
   where id = p_staff_id;
end;
$$;
revoke all on function public.set_staff_title(uuid, text) from public, anon;
grant execute on function public.set_staff_title(uuid, text) to authenticated;

-- ── ② 직원 본인 시프트 읽기/출퇴근 기록 ─────────────────────────────────────
-- 이름 매칭이 정본 키다: staff_schedule 에는 user_id 가 없고 앱도 name/nickname 으로 맞춘다.
-- 정책 안에서 profiles 를 직접 조회하면 profiles 의 RLS 가 겹쳐 결과가 흔들리므로
-- 기존 can_* 헬퍼들과 같은 모양(SECURITY DEFINER·STABLE)으로 감싼다.
create or replace function public.is_my_shift(p_venue_id uuid, p_staff_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- 이름 비교를 매장 확인보다 먼저 둔다: 남의 행(대부분)에서 can_manage_pos 를 호출하지 않게 —
  -- 이 함수는 SELECT 정책에 붙어 행마다 돈다. NULL 이름/닉네임은 비교 결과가 NULL 이라 자연히 탈락.
  select btrim(coalesce(p_staff_name, '')) <> ''
     and exists (
       select 1 from public.profiles p
        where p.id = auth.uid()
          and (lower(btrim(p_staff_name)) = lower(btrim(p.name))
            or lower(btrim(p_staff_name)) = lower(btrim(p.nickname)))
          and (p.venue_id = p_venue_id or public.can_manage_pos(p_venue_id))
     );
$$;
revoke all on function public.is_my_shift(uuid, text) from public, anon;
grant execute on function public.is_my_shift(uuid, text) to authenticated;

-- 읽기만 추가(permissive → 기존 staff_sched_select 와 OR). 남의 행은 여전히 안 보인다.
drop policy if exists staff_sched_self_select on public.staff_schedule;
create policy staff_sched_self_select on public.staff_schedule
  for select to authenticated
  using (public.is_my_shift(venue_id, staff_name));

-- 쓰기는 정책이 아니라 RPC 로 — check_in/check_out 외 칼럼(confirmed·start_hm)은 못 건드린다.
create or replace function public.set_my_shift_time(
  p_venue_id uuid, p_work_date date, p_field text, p_value text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_name text; v_val text; v_n int;
begin
  if p_field not in ('check_in', 'check_out') then raise exception '알 수 없는 항목입니다'; end if;
  v_val := nullif(btrim(coalesce(p_value, '')), '');
  if v_val is not null and v_val !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception '시각 형식이 올바르지 않습니다 (HH:MM)';
  end if;

  -- 내 배정 행 한 건을 찾는다(이름은 name/nickname 중 실제로 배정된 쪽).
  select s.staff_name into v_name
    from public.staff_schedule s
   where s.venue_id = p_venue_id and s.work_date = p_work_date
     and public.is_my_shift(s.venue_id, s.staff_name)
   limit 1;
  if v_name is null then raise exception '그 날짜에 배정된 본인 일정이 없습니다'; end if;

  if p_field = 'check_in' then
    update public.staff_schedule set check_in = v_val
     where venue_id = p_venue_id and work_date = p_work_date and staff_name = v_name;
  else
    update public.staff_schedule set check_out = v_val
     where venue_id = p_venue_id and work_date = p_work_date and staff_name = v_name;
  end if;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception '출퇴근을 기록하지 못했습니다'; end if;
end;
$$;
revoke all on function public.set_my_shift_time(uuid, date, text, text) from public, anon;
grant execute on function public.set_my_shift_time(uuid, date, text, text) to authenticated;
