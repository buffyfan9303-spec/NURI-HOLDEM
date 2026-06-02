-- ============================================================================
-- 매장 구성원 초대 모델 (자가 가입 → 업주 초대 + 수락)
-- ============================================================================
create table if not exists public.venue_staff_invites (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  invited_by uuid references auth.users(id),
  status     text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique (venue_id, user_id)
);
alter table public.venue_staff_invites enable row level security;

drop policy if exists "vsi_read" on public.venue_staff_invites;
create policy "vsi_read" on public.venue_staff_invites for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.venues v where v.id = venue_id and v.owner_id = auth.uid())
  );

create or replace function public.invite_staff_by_nickname(p_nickname text)
returns void language plpgsql security definer set search_path = public as $$
declare v_venue uuid; v_vname text; v_user uuid; v_role user_role;
begin
  select v.id, v.name into v_venue, v_vname
    from public.venues v
    join public.profiles p on p.id = auth.uid() and p.role='venue_owner' and p.approved
   where v.owner_id = auth.uid() limit 1;
  if v_venue is null then raise exception '매장 업주만 구성원을 초대할 수 있습니다'; end if;
  select id, role into v_user, v_role from public.profiles
   where lower(trim(nickname)) = lower(trim(p_nickname)) limit 1;
  if v_user is null then raise exception '해당 닉네임의 회원을 찾을 수 없습니다'; end if;
  if v_user = auth.uid() then raise exception '본인은 초대할 수 없습니다'; end if;
  if v_role in ('venue_owner','admin') then raise exception '업주/관리자 계정은 초대할 수 없습니다'; end if;
  if v_role = 'venue_staff' then raise exception '이미 매장 소속 직원입니다'; end if;
  insert into public.venue_staff_invites (venue_id, user_id, invited_by, status)
  values (v_venue, v_user, auth.uid(), 'pending')
  on conflict (venue_id, user_id) do update set status='pending', invited_by=auth.uid(), created_at=now();
  insert into public.notifications (user_id, type, title, message, avatar_color, read, link)
  values (v_user, 'system', '매장 구성원 초대',
          coalesce(v_vname,'한 매장') || '에서 구성원으로 초대했습니다. 수락하면 매장 순위를 관리할 수 있어요.',
          '#FFD100', false, '/invites');
end; $$;

create or replace function public.get_my_staff_invites()
returns table (id uuid, venue_id uuid, venue_name text, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select i.id, i.venue_id, v.name, i.created_at
  from public.venue_staff_invites i
  join public.venues v on v.id = i.venue_id
  where i.user_id = auth.uid() and i.status = 'pending'
  order by i.created_at desc;
$$;

create or replace function public.respond_staff_invite(p_invite_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_venue uuid; v_user uuid;
begin
  select venue_id, user_id into v_venue, v_user from public.venue_staff_invites
   where id = p_invite_id and status = 'pending';
  if v_user is null or v_user <> auth.uid() then raise exception '초대를 찾을 수 없습니다'; end if;
  if p_accept then
    update public.profiles set role='venue_staff', venue_id=v_venue, approved=true where id=auth.uid();
    update public.venue_staff_invites set status='accepted' where id=p_invite_id;
  else
    update public.venue_staff_invites set status='declined' where id=p_invite_id;
  end if;
end; $$;

create or replace function public.get_my_venue_invites()
returns table (id uuid, user_id uuid, nickname text, name text, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select i.id, i.user_id, p.nickname, p.name, i.created_at
  from public.venue_staff_invites i
  join public.venues v on v.id = i.venue_id and v.owner_id = auth.uid()
  join public.profiles p on p.id = i.user_id
  where i.status = 'pending'
  order by i.created_at desc;
$$;

create or replace function public.cancel_staff_invite(p_invite_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.venue_staff_invites i
   using public.venues v
   where i.id = p_invite_id and i.venue_id = v.id and v.owner_id = auth.uid();
end; $$;

revoke execute on function public.invite_staff_by_nickname(text)        from anon;
revoke execute on function public.get_my_staff_invites()                from anon;
revoke execute on function public.respond_staff_invite(uuid, boolean)   from anon;
revoke execute on function public.get_my_venue_invites()                from anon;
revoke execute on function public.cancel_staff_invite(uuid)             from anon;
