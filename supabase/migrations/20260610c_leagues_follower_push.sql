-- ① 팔로우 매장 새 포스터 푸시 — 승인 시 팔로워 전원에게 알림
create or replace function public.notify_followers_on_poster()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.venue_id is not null
     and ((tg_op = 'INSERT' and new.approved) or (tg_op = 'UPDATE' and new.approved and coalesce(old.approved, false) = false)) then
    insert into public.notifications (user_id, type, title, message, link, read)
    select vf.user_id, 'system', '팔로우 매장 새 포스터',
      coalesce((select name from public.venues where id = new.venue_id), '매장') || ' — ' || new.title || ' (' || new.date || ')',
      '/', false
    from public.venue_follows vf
    where vf.venue_id = new.venue_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_followers_poster on public.schedules;
create trigger trg_notify_followers_poster
after insert or update of approved on public.schedules
for each row execute function public.notify_followers_on_poster();

-- ② 연합 리그(생성→초대→수락/거절→포인트→통합 순위) + ③ 초대/응답 알림 트리거
-- (라이브 적용 SQL 전문 — apply_migration 'follower_push_and_leagues' 와 동일)
create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_venue_id uuid not null references public.venues(id) on delete cascade,
  season_start date not null default ((now() at time zone 'Asia/Seoul'))::date,
  created_at timestamptz not null default now()
);
create table if not exists public.league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (league_id, venue_id)
);
create table if not exists public.league_entries (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  points integer not null,
  reason text,
  entry_date date not null default ((now() at time zone 'Asia/Seoul'))::date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_league_entries on public.league_entries(league_id, entry_date desc);
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.league_entries enable row level security;
create policy lg_select on public.leagues for select using (true);
create policy lg_insert on public.leagues for insert with check (public.can_manage_pos(owner_venue_id));
create policy lg_update on public.leagues for update using (public.can_manage_pos(owner_venue_id));
create policy lg_delete on public.leagues for delete using (public.can_manage_pos(owner_venue_id));
create policy lm_select on public.league_members for select using (true);
create policy lm_insert on public.league_members for insert
  with check (exists (select 1 from public.leagues l where l.id = league_id and public.can_manage_pos(l.owner_venue_id)));
create policy lm_update on public.league_members for update using (public.can_manage_pos(venue_id));
create policy lm_delete on public.league_members for delete
  using (public.can_manage_pos(venue_id) or exists (select 1 from public.leagues l where l.id = league_id and public.can_manage_pos(l.owner_venue_id)));
create policy le_select on public.league_entries for select using (true);
create policy le_insert on public.league_entries for insert
  with check (public.can_access_ledger(venue_id) and exists (
    select 1 from public.league_members m where m.league_id = league_entries.league_id and m.venue_id = league_entries.venue_id and m.status = 'accepted'
  ) or exists (select 1 from public.leagues l where l.id = league_entries.league_id and l.owner_venue_id = league_entries.venue_id and public.can_access_ledger(league_entries.venue_id)));
create policy le_delete on public.league_entries for delete
  using (public.can_access_ledger(venue_id) or exists (select 1 from public.leagues l where l.id = league_id and public.can_manage_pos(l.owner_venue_id)));
