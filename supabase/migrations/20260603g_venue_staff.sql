-- ============================================================================
-- 가게 직원(venue_staff) 역할 + 업주 하위 승인/관리
--  ※ enum 값 추가는 트랜잭션 이슈로 별도 실행 필요할 수 있음(idempotent).
-- ============================================================================
alter type public.user_role add value if not exists 'venue_staff';

-- handle_new_user: venue_staff 가입 시 venue_id 연결 + 승인 대기(approved=false)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_name   text        := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  v_nick   text        := nullif(trim(coalesce(new.raw_user_meta_data->>'nickname', '')), '');
  v_role   user_role   := coalesce((new.raw_user_meta_data->>'role')::user_role, 'user');
  v_status user_status := case when coalesce((new.raw_user_meta_data->>'role')::user_role, 'user') = 'venue_owner'
                               then 'pending'::user_status else 'active'::user_status end;
  v_venue  uuid;
begin
  if v_nick is null or exists (select 1 from public.profiles where lower(trim(nickname)) = lower(v_nick)) then
    v_nick := v_name || '_' || left(new.id::text, 4);
  end if;

  insert into public.profiles (
    id, email, name, nickname, role, status,
    agreed_to_terms, agreed_to_privacy, agreed_to_anti_gambling, agreed_to_marketing, terms_agreed_at
  ) values (
    new.id, new.email, v_name, v_nick, v_role, v_status,
    coalesce((new.raw_user_meta_data->>'agreed_to_terms')::boolean, false),
    coalesce((new.raw_user_meta_data->>'agreed_to_privacy')::boolean, false),
    coalesce((new.raw_user_meta_data->>'agreed_to_anti_gambling')::boolean, false),
    coalesce((new.raw_user_meta_data->>'agreed_to_marketing')::boolean, false),
    case when (new.raw_user_meta_data->>'agreed_to_terms')::boolean then now() else null end
  ) on conflict (id) do nothing;

  if v_role = 'venue_owner' then
    insert into public.venues (name, region, address, contact_phone, owner_id, approved)
    values (
      coalesce(new.raw_user_meta_data->>'venue_name', v_name || ' 매장'),
      coalesce(new.raw_user_meta_data->>'region', ''),
      coalesce(new.raw_user_meta_data->>'address', ''),
      new.raw_user_meta_data->>'phone', new.id, false
    ) returning id into v_venue;
    update public.profiles set venue_id = v_venue, approved = false where id = new.id;
  elsif v_role = 'venue_staff' then
    update public.profiles
       set venue_id = nullif(new.raw_user_meta_data->>'venue_id', '')::uuid, approved = false
     where id = new.id;
  end if;

  return new;
end;
$function$;

create or replace function public.can_manage_venue(p_venue_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.status, 'active') = 'active'
      and ( p.role = 'admin'
            or (p.role in ('venue_owner','venue_staff') and p.venue_id = p_venue_id and p.approved) )
  );
$$;

create or replace function public.get_my_venue_staff()
returns setof public.profiles language sql security definer set search_path = public stable as $$
  select s.*
  from public.profiles me
  join public.profiles s on s.venue_id = me.venue_id and s.role = 'venue_staff'
  where me.id = auth.uid() and me.role = 'venue_owner' and me.venue_id is not null
  order by s.approved asc, s.joined_at desc;
$$;

create or replace function public.manage_staff(p_staff_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner_venue uuid; v_staff_venue uuid;
begin
  select venue_id into v_owner_venue from public.profiles
   where id = auth.uid() and role = 'venue_owner' and approved and venue_id is not null;
  if v_owner_venue is null then raise exception '직원을 관리할 권한이 없습니다'; end if;
  select venue_id into v_staff_venue from public.profiles where id = p_staff_id and role = 'venue_staff';
  if v_staff_venue is null or v_staff_venue <> v_owner_venue then
    raise exception '본인 매장 직원만 관리할 수 있습니다';
  end if;
  if p_action = 'approve' then
    update public.profiles set approved = true  where id = p_staff_id;
  elsif p_action = 'reject' then
    update public.profiles set approved = false where id = p_staff_id;
  elsif p_action = 'remove' then
    update public.profiles set role = 'user', venue_id = null, approved = false where id = p_staff_id;
  else raise exception '알 수 없는 작업'; end if;
end;
$$;

revoke execute on function public.manage_staff(uuid, text) from anon;
revoke execute on function public.get_my_venue_staff() from anon;
