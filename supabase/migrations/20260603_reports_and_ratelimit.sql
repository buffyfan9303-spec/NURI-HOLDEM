-- ============================================================================
-- Phase 2: 신고(reports) + 도배 방지(rate limit)
--  reports: 사용자가 글/댓글/매물/유저를 신고 → 관리자 큐에서 처리
--  rate limit: 최근 N초 내 동일 사용자 연속 작성 차단(트리거가 예외 발생)
--  모두 멱등 재실행 안전.
-- ============================================================================

create table if not exists public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null references auth.users(id) on delete cascade,
  reporter_name   text,
  target_type     text not null,                 -- post | comment | listing | live | user
  target_id       uuid,
  target_owner_id uuid,
  target_summary  text,
  reason          text not null,
  status          text not null default 'open',  -- open | resolved | dismissed
  created_at      timestamptz not null default now()
);
alter table public.reports enable row level security;

drop policy if exists "reports_insert" on public.reports;
create policy "reports_insert" on public.reports
  for insert to public with check (auth.uid() = reporter_id);

drop policy if exists "reports_admin_select" on public.reports;
create policy "reports_admin_select" on public.reports
  for select to public using (my_role() = 'admin');

drop policy if exists "reports_admin_update" on public.reports;
create policy "reports_admin_update" on public.reports
  for update to public using (my_role() = 'admin');

create index if not exists idx_reports_status on public.reports (status, created_at desc);

-- ── 도배 방지 트리거 (최근 N초 내 본인 작성 존재 시 차단) ──────────────────────
create or replace function public.rl_posts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.community_posts where user_id = new.user_id and created_at > now() - interval '12 seconds') then
    raise exception '게시글은 12초에 한 번만 작성할 수 있습니다. 잠시 후 다시 시도해 주세요.';
  end if;
  return new;
end; $$;
drop trigger if exists trg_rl_posts on public.community_posts;
create trigger trg_rl_posts before insert on public.community_posts for each row execute function public.rl_posts();

create or replace function public.rl_comments()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.comments where user_id = new.user_id and created_at > now() - interval '5 seconds') then
    raise exception '댓글은 5초에 한 번만 작성할 수 있습니다.';
  end if;
  return new;
end; $$;
drop trigger if exists trg_rl_comments on public.comments;
create trigger trg_rl_comments before insert on public.comments for each row execute function public.rl_comments();

create or replace function public.rl_live()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.live_wall where user_id = new.user_id and created_at > now() - interval '3 seconds') then
    raise exception '실시간 댓글은 3초에 한 번만 작성할 수 있습니다.';
  end if;
  return new;
end; $$;
drop trigger if exists trg_rl_live on public.live_wall;
create trigger trg_rl_live before insert on public.live_wall for each row execute function public.rl_live();
