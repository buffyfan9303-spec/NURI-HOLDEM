-- ============================================================================
-- 업주 식별을 venues.owner_id 기반으로 보강(견고) + 업주 venue_id 백필
-- ============================================================================
update public.profiles p set venue_id = v.id
from public.venues v
where v.owner_id = p.id and p.role = 'venue_owner' and p.venue_id is null;

create or replace function public.can_manage_venue(p_venue_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.status, 'active') = 'active'
      and (
        p.role = 'admin'
        or (p.role = 'venue_owner' and p.approved
            and exists (select 1 from public.venues v where v.id = p_venue_id and v.owner_id = p.id))
        or (p.role = 'venue_staff' and p.approved and p.venue_id = p_venue_id)
      )
  );
$$;

create or replace function public.get_my_venue_staff()
returns setof public.profiles language sql security definer set search_path = public stable as $$
  select s.*
  from public.venues v
  join public.profiles s on s.venue_id = v.id and s.role = 'venue_staff'
  where v.owner_id = auth.uid()
  order by s.approved asc, s.joined_at desc;
$$;

create or replace function public.manage_staff(p_staff_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner_venue uuid; v_staff_venue uuid;
begin
  select v.id into v_owner_venue
    from public.venues v
    join public.profiles p on p.id = auth.uid() and p.role = 'venue_owner' and p.approved
   where v.owner_id = auth.uid() limit 1;
  if v_owner_venue is null then raise exception '직원을 관리할 권한이 없습니다'; end if;
  select venue_id into v_staff_venue from public.profiles where id = p_staff_id and role = 'venue_staff';
  if v_staff_venue is null or v_staff_venue <> v_owner_venue then
    raise exception '본인 매장 직원만 관리할 수 있습니다';
  end if;
  if p_action = 'approve' then update public.profiles set approved = true  where id = p_staff_id;
  elsif p_action = 'reject' then update public.profiles set approved = false where id = p_staff_id;
  elsif p_action = 'remove' then update public.profiles set role = 'user', venue_id = null, approved = false where id = p_staff_id;
  else raise exception '알 수 없는 작업'; end if;
end;
$$;

revoke execute on function public.manage_staff(uuid, text) from anon;
revoke execute on function public.get_my_venue_staff() from anon;
