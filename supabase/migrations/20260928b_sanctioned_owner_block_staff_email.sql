-- ✅ 적용 완료 2026-09-28 (nuri-lead, MCP execute_sql). 오너 결정 2026-09-28: 정지 업주는 매장 운영 전체 차단 · 직원 이메일은 관리자만.
-- 리허설(롤백): can_manage_venue_staff/schedules 활성 업주 true → 정지 false → 정지 만료 true · 관리자 true.
--   일정 insert 활성 업주 ok · 정지 업주 42501. 손님 이용권 사용은 기존 결정대로 영향 없음(can_manage_pos 는 원래 제재 확인).

create or replace function public._actor_not_sanctioned() returns boolean
language sql stable security definer set search_path = public, pg_temp as $f$
  select not exists (
    select 1 from public.profiles p where p.id = auth.uid()
      and ( p.status::text in ('banned','withdrawn')
         or ( p.status::text = 'suspended' and (p.suspended_until is null or p.suspended_until > now()) ) ) );
$f$;
revoke execute on function public._actor_not_sanctioned() from public, anon;
grant execute on function public._actor_not_sanctioned() to authenticated, service_role;

create or replace function public.can_manage_venue_staff(p_venue_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $f$
  select ( coalesce(my_role() = 'admin'::user_role, false)
      or public._venue_owner_ok(p_venue_id)
      or exists (select 1 from public.venue_owners vo where vo.venue_id = p_venue_id and vo.user_id = auth.uid() and vo.status = 'approved') )
     and public._actor_not_sanctioned();
$f$;

create or replace function public.can_manage_venue_schedules(p_venue_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $f$
  select ( coalesce(my_role() = 'admin'::user_role, false)
      or public._venue_owner_ok(p_venue_id)
      or exists (select 1 from public.venue_owners vo where vo.venue_id = p_venue_id and vo.user_id = auth.uid() and vo.status = 'approved') )
     and public._actor_not_sanctioned();
$f$;

-- schedules_insert 의 venue_id 없는 분기도 정지 업주를 막는다 — 기존 정책은 그대로 두고 RESTRICTIVE 로 덧댄다.
drop policy if exists schedules_not_sanctioned_ins on public.schedules;
create policy schedules_not_sanctioned_ins on public.schedules as restrictive for insert to authenticated
  with check (public._actor_not_sanctioned());
drop policy if exists schedules_not_sanctioned_upd on public.schedules;
create policy schedules_not_sanctioned_upd on public.schedules as restrictive for update to authenticated
  using (public._actor_not_sanctioned()) with check (public._actor_not_sanctioned());

-- F11 직원 이메일은 관리자에게만(보안 표준 6항). 반환형 불변 → ACL 보존.
create or replace function public.get_my_venue_staff(p_venue_id uuid default null)
returns table(id uuid, name text, nickname text, email text, avatar_color text, staff_title text, is_active boolean)
language sql stable security definer set search_path = public, pg_temp as $f$
  with v as (select coalesce(p_venue_id, (select v.id from public.venues v where v.owner_id = auth.uid() order by v.id limit 1)) as id)
  select s.id, s.name, s.nickname,
         case when my_role() = 'admin'::user_role then s.email end,
         s.avatar_color, s.staff_title,
         public._is_active_venue_staff(s.id, v.id) as is_active
  from public.profiles s, v
  where s.role = 'venue_staff'
    and s.venue_id = v.id
    and public.can_manage_pos(v.id)
  order by s.approved asc, s.joined_at desc;
$f$;
