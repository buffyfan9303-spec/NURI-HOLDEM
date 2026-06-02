-- ============================================================================
-- 활동/삭제 감사 로그 (회원 상세 '삭제 내역')
--  관리자 또는 작성자 본인이 글/댓글/매물/포스터/매장을 삭제할 때 기록.
--  actor      : 삭제를 수행한 사람
--  target_*   : 삭제 대상(유형/식별자/소유자/요약 스냅샷)
--  RLS: 조회는 관리자만, insert는 본인 행위(actor=self) 또는 관리자만.
-- ============================================================================
create table if not exists public.activity_log (
  id              uuid primary key default gen_random_uuid(),
  actor_id        uuid,
  actor_name      text,
  action          text not null default 'delete',   -- delete | hide | suspend | deactivate | restore | ...
  target_type     text not null,                    -- post | comment | listing | schedule | venue | live
  target_id       uuid,
  target_owner_id uuid,
  target_summary  text,
  created_at      timestamptz not null default now()
);

alter table public.activity_log enable row level security;

drop policy if exists "activity_log_admin_select" on public.activity_log;
create policy "activity_log_admin_select" on public.activity_log
  for select to public using (my_role() = 'admin');

drop policy if exists "activity_log_insert" on public.activity_log;
create policy "activity_log_insert" on public.activity_log
  for insert to public with check (auth.uid() = actor_id or my_role() = 'admin');

create index if not exists idx_activity_log_owner on public.activity_log (target_owner_id, created_at desc);
create index if not exists idx_activity_log_actor on public.activity_log (actor_id, created_at desc);
