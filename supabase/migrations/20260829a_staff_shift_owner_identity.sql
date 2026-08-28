-- 직원 메뉴 재점검(2026-08-29) — 여정 관통에서 남은 2건. 둘 다 additive, 파괴적 DDL 0.
--
-- ① 출퇴근의 주인이 '이름' 이라 동명이인이 서로의 기록을 읽고 쓴다.
--    재현(실측, 롤백 트랜잭션): 같은 매장에 name='프로브직원' 인 계정 2개를 합류시키고
--    한쪽에게만 8/29 를 배정 → 다른 계정으로
--      SELECT staff_schedule → 1행(남의 행이 보인다)
--      set_my_shift_time(check_in) → 성공(남의 출근 시각을 덮어썼다)
--    is_my_shift 가 lower(name)=lower(staff_name) 만 보고 행의 주인을 판정하기 때문이다.
--    staff_schedule 에 user_id 가 없어 '누구의 시프트인지' 를 저장할 자리 자체가 없었다.
--    → user_id 를 additive 로 붙이고(기존 행은 backfill), 판정을 다음 순서로 바꾼다:
--        1순위 user_id (있으면 이름은 아예 보지 않는다)
--        2순위 이름 — 단 그 이름이 매장 안에서 **유일할 때만**(동명이인이면 아무도 통과 못 함)
--    2순위를 남기는 이유: 계정 없는 딜러를 이름만으로 배정하는 기존 운영(staff_wage 명부)이
--    그대로 살아 있어야 하고, 구 번들이 캐시된 클라이언트가 user_id 없이 insert 해도 동작해야 한다.
--
-- ② 확정 알림 인원수에 업주 본인이 포함돼 "직원 2명에게 발송"(실제 1명) 으로 센다.
--    재현(실측): 구성원 0명인 [E2E] 매장에서 확정 → 토스트 "직원 1명에게 알림 발송".
--    업주 profiles.venue_id 가 자기 매장이라 대상 집합에 들어간다. 스스로 누른 확정을
--    자기 알림함으로 되돌려 받는 것도 무의미하므로 **호출자를 제외**한다(소유자 특정이 아니라
--    '누른 사람' 기준 — POS 관리자가 확정해도 같은 규칙이 성립한다).

-- ── ① staff_schedule.user_id ────────────────────────────────────────────────
alter table public.staff_schedule
  add column if not exists user_id uuid references public.profiles(id) on delete set null;

create index if not exists staff_sched_user_idx on public.staff_schedule (venue_id, user_id);

-- 기존 행 backfill — '그 매장 안에서 이름이 유일하게 매치되는 회원' 만 채운다.
-- 동명이인 행은 일부러 NULL 로 남긴다(잘못된 주인을 못박는 것보다 미지정이 안전하다).
update public.staff_schedule s
   set user_id = m.id
  from (
    select p.id, p.venue_id, lower(btrim(p.name)) as lname, lower(btrim(p.nickname)) as lnick
      from public.profiles p
     where p.venue_id is not null
  ) m
 where s.user_id is null
   and m.venue_id = s.venue_id
   and (lower(btrim(s.staff_name)) = m.lname or lower(btrim(s.staff_name)) = m.lnick)
   and (select count(*) from public.profiles q
         where q.venue_id = s.venue_id
           and (lower(btrim(s.staff_name)) = lower(btrim(q.name))
             or lower(btrim(s.staff_name)) = lower(btrim(q.nickname)))) = 1;

-- 행 단위 소유 판정 — user_id 우선, 이름은 유일할 때만.
create or replace function public.is_my_shift_row(p_venue_id uuid, p_staff_name text, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    -- 1순위: 행에 주인이 적혀 있으면 그것이 정본이다(이름 매칭 완전 배제).
    when p_user_id is not null then p_user_id = auth.uid()
    when btrim(coalesce(p_staff_name, '')) = '' then false
    -- 2순위: 이름 매칭. 단 같은 이름의 구성원이 2명 이상이면 아무도 통과시키지 않는다.
    else exists (
           select 1 from public.profiles p
            where p.id = auth.uid()
              and (lower(btrim(p_staff_name)) = lower(btrim(p.name))
                or lower(btrim(p_staff_name)) = lower(btrim(p.nickname)))
              and (p.venue_id = p_venue_id or public.can_manage_pos(p_venue_id))
         )
         and (select count(*) from public.profiles q
               where q.venue_id = p_venue_id
                 and (lower(btrim(p_staff_name)) = lower(btrim(q.name))
                   or lower(btrim(p_staff_name)) = lower(btrim(q.nickname)))) <= 1
  end;
$$;
revoke all on function public.is_my_shift_row(uuid, text, uuid) from public, anon;
grant execute on function public.is_my_shift_row(uuid, text, uuid) to authenticated;

-- 구 함수는 남겨 두되(외부 참조 대비) 새 판정으로 위임한다 — 로직이 두 벌이 되지 않게.
create or replace function public.is_my_shift(p_venue_id uuid, p_staff_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_my_shift_row(p_venue_id, p_staff_name, null);
$$;
revoke all on function public.is_my_shift(uuid, text) from public, anon;
grant execute on function public.is_my_shift(uuid, text) to authenticated;

-- 읽기 정책을 행 단위 판정으로 교체(permissive 추가분 — 남의 행은 여전히 안 보인다).
drop policy if exists staff_sched_self_select on public.staff_schedule;
create policy staff_sched_self_select on public.staff_schedule
  for select to authenticated
  using (public.is_my_shift_row(venue_id, staff_name, user_id));

-- 쓰기(RPC)도 같은 판정으로. check_in/check_out 두 칼럼만 만지는 것은 그대로.
create or replace function public.set_my_shift_time(
  p_venue_id uuid, p_work_date date, p_field text, p_value text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_val text; v_n int;
begin
  if p_field not in ('check_in', 'check_out') then raise exception '알 수 없는 항목입니다'; end if;
  v_val := nullif(btrim(coalesce(p_value, '')), '');
  if v_val is not null and v_val !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception '시각 형식이 올바르지 않습니다 (HH:MM)';
  end if;

  -- 내 배정 행 한 건(이름이 아니라 행 id 로 고정 — 동명이인 행을 잡지 않게).
  select s.id into v_id
    from public.staff_schedule s
   where s.venue_id = p_venue_id and s.work_date = p_work_date
     and public.is_my_shift_row(s.venue_id, s.staff_name, s.user_id)
   limit 1;
  if v_id is null then raise exception '그 날짜에 배정된 본인 일정이 없습니다'; end if;

  if p_field = 'check_in' then
    update public.staff_schedule set check_in  = v_val where id = v_id;
  else
    update public.staff_schedule set check_out = v_val where id = v_id;
  end if;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception '출퇴근을 기록하지 못했습니다'; end if;
end;
$$;
revoke all on function public.set_my_shift_time(uuid, date, text, text) from public, anon;
grant execute on function public.set_my_shift_time(uuid, date, text, text) to authenticated;

-- ── ② 확정 알림 인원수에서 호출자 제외 ──────────────────────────────────────
-- 유일 호출부는 StaffSchedule 의 '스케줄 확정' 하나다(전수 확인). 반환값이 곧 토스트의 숫자다.
create or replace function public.notify_venue_staff(
  p_venue_id uuid, p_title text, p_message text, p_link text default null::text
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n integer;
begin
  -- NULL-safe: not can_manage_pos(...) 는 비로그인에서 fail-open 이다(§3).
  if (public.can_manage_pos(p_venue_id)
      or exists (select 1 from public.venues where id = p_venue_id and owner_id = auth.uid()))
     is distinct from true then
    raise exception '이 매장에 알림을 보낼 권한이 없습니다';
  end if;
  insert into public.notifications (user_id, type, title, message, link, read)
  select pr.id, 'system', p_title, p_message, p_link, false
  from public.profiles pr
  where pr.venue_id = p_venue_id
    and pr.id is distinct from auth.uid()               -- 누른 사람은 세지도, 보내지도 않는다
    and coalesce(pr.mute_venue_notify, false) = false;  -- 수신 거부자 제외
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.notify_venue_staff(uuid, text, text, text) from public, anon;
grant execute on function public.notify_venue_staff(uuid, text, text, text) to authenticated;
