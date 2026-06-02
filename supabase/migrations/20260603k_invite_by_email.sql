-- ============================================================================
-- 구성원 초대를 닉네임 → 이메일 기반으로 변경
-- ============================================================================
drop function if exists public.invite_staff_by_nickname(text);
drop function if exists public.get_my_venue_invites();

create or replace function public.invite_staff_by_email(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_venue uuid; v_vname text; v_user uuid; v_role user_role;
begin
  select v.id, v.name into v_venue, v_vname
    from public.venues v
    join public.profiles p on p.id = auth.uid() and p.role='venue_owner' and p.approved
   where v.owner_id = auth.uid() limit 1;
  if v_venue is null then raise exception '매장 업주만 구성원을 초대할 수 있습니다'; end if;
  select id, role into v_user, v_role from public.profiles
   where lower(trim(email)) = lower(trim(p_email)) limit 1;
  if v_user is null then raise exception '해당 이메일의 회원을 찾을 수 없습니다'; end if;
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

create or replace function public.get_my_venue_invites()
returns table (id uuid, user_id uuid, email text, nickname text, name text, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select i.id, i.user_id, p.email, p.nickname, p.name, i.created_at
  from public.venue_staff_invites i
  join public.venues v on v.id = i.venue_id and v.owner_id = auth.uid()
  join public.profiles p on p.id = i.user_id
  where i.status = 'pending'
  order by i.created_at desc;
$$;

revoke execute on function public.invite_staff_by_email(text) from anon;
revoke execute on function public.get_my_venue_invites() from anon;
