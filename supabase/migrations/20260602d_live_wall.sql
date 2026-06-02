-- ============================================================================
-- Task 4: '실시간 댓글' = 한 줄 라이브 월(live_wall)
--  제목 없이 짧게(최대 140자) 빠르게 올리는 실시간 보드.
--  RLS: 공개 읽기 / 본인만 작성(auth.uid=user_id) / 본인·관리자 삭제.
--  Supabase Realtime publication 에 추가하여 실시간 수신 가능.
--  모두 멱등 → 재실행 안전.
-- ============================================================================
create table if not exists public.live_wall (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  user_name  text not null,
  user_role  user_role not null default 'user',
  user_color text,
  content    text not null check (char_length(trim(content)) between 1 and 140),
  created_at timestamptz not null default now()
);

alter table public.live_wall enable row level security;

drop policy if exists "live_wall_read" on public.live_wall;
create policy "live_wall_read" on public.live_wall
  for select to public using (true);

drop policy if exists "live_wall_insert" on public.live_wall;
create policy "live_wall_insert" on public.live_wall
  for insert to public with check (auth.uid() = user_id);

drop policy if exists "live_wall_delete" on public.live_wall;
create policy "live_wall_delete" on public.live_wall
  for delete to public using (auth.uid() = user_id or public.my_role() = 'admin');

create index if not exists idx_live_wall_created on public.live_wall (created_at desc);

-- 실시간 발행(중복 추가 방지)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_wall'
  ) then
    alter publication supabase_realtime add table public.live_wall;
  end if;
end $$;
