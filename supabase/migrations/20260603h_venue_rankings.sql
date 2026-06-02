-- ============================================================================
-- 매장 일일 손님 순위 (공개 조회 / 업주·승인직원 입력)
-- ============================================================================
create table if not exists public.venue_rankings (
  id           uuid primary key default gen_random_uuid(),
  venue_id     uuid not null references public.venues(id) on delete cascade,
  ranking_date date not null default current_date,
  position     int  not null,
  nickname     text not null,
  real_name    text not null,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
alter table public.venue_rankings enable row level security;
create index if not exists idx_vr_venue_date on public.venue_rankings (venue_id, ranking_date, position);

drop policy if exists "vr_read" on public.venue_rankings;
create policy "vr_read" on public.venue_rankings for select to public using (true);

drop policy if exists "vr_write" on public.venue_rankings;
create policy "vr_write" on public.venue_rankings for all to authenticated
  using (public.can_manage_venue(venue_id)) with check (public.can_manage_venue(venue_id));

create or replace function public.save_venue_rankings(p_venue_id uuid, p_date date, p_entries jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare e jsonb; i int := 0;
begin
  if not public.can_manage_venue(p_venue_id) then raise exception '순위를 입력할 권한이 없습니다'; end if;
  delete from public.venue_rankings where venue_id = p_venue_id and ranking_date = p_date;
  for e in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    if coalesce(trim(e->>'nickname'), '') = '' and coalesce(trim(e->>'realName'), '') = '' then continue; end if;
    i := i + 1;
    insert into public.venue_rankings (venue_id, ranking_date, position, nickname, real_name, created_by)
    values (p_venue_id, p_date, i,
            left(trim(coalesce(e->>'nickname', '')), 30),
            left(trim(coalesce(e->>'realName', '')), 20),
            auth.uid());
  end loop;
end;
$$;
revoke execute on function public.save_venue_rankings(uuid, date, jsonb) from anon;
