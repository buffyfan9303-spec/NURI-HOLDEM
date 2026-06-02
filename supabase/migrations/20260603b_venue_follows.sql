-- ============================================================================
-- Phase 4: 매장 팔로우(즐겨찾기) + 팔로워 수 유지 + 팔로우 매장 새 포스터 알림
-- ============================================================================
create table if not exists public.venue_follows (
  user_id    uuid not null references auth.users(id) on delete cascade,
  venue_id   uuid not null references public.venues(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, venue_id)
);
alter table public.venue_follows enable row level security;

drop policy if exists "venue_follows_self" on public.venue_follows;
create policy "venue_follows_self" on public.venue_follows
  for all to public using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_venue_follows_venue on public.venue_follows (venue_id);

-- 팔로우/언팔로우 시 venues.follower_count 동기화
create or replace function public.sync_venue_followers()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.venues set follower_count = coalesce(follower_count, 0) + 1 where id = new.venue_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.venues set follower_count = greatest(0, coalesce(follower_count, 0) - 1) where id = old.venue_id;
    return old;
  end if;
  return null;
end; $$;
drop trigger if exists trg_sync_venue_followers on public.venue_follows;
create trigger trg_sync_venue_followers after insert or delete on public.venue_follows
  for each row execute function public.sync_venue_followers();

-- 포스터 승인 트리거 확장: 작성 업주 + 팔로워에게 알림
create or replace function public.notify_on_schedule_approved()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.approved = true and (old.approved is distinct from true) then
    -- 작성 업주
    if new.owner_id is not null then
      insert into public.notifications (user_id, type, title, message, avatar_color, read)
      values (new.owner_id, 'approval', '포스터 승인 완료',
              coalesce(new.title, '') || ' 포스터가 승인되어 메인에 게시되었습니다.', '#FFD100', false);
    end if;
    -- 팔로워 (해당 매장을 팔로우한 사람들, 작성자 제외)
    if new.venue_id is not null then
      insert into public.notifications (user_id, type, title, message, avatar_color, read)
      select vf.user_id, 'system', '팔로우 매장 새 포스터',
             coalesce(new.title, '') || ' 포스터가 등록되었습니다.', '#FFD100', false
      from public.venue_follows vf
      where vf.venue_id = new.venue_id and vf.user_id <> coalesce(new.owner_id, '00000000-0000-0000-0000-000000000000');
    end if;
  end if;
  return new;
end; $$;
