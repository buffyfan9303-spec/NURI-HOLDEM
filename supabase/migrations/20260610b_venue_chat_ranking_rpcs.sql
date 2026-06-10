-- ① 매장 실시간 채팅(그룹 채팅과 동일 구조, 매장 스코프)
create table if not exists public.venue_messages (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id uuid references auth.users(id),
  user_name text not null,
  user_color text,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_vmsg_venue on public.venue_messages(venue_id, created_at desc);
alter table public.venue_messages enable row level security;
drop policy if exists vmsg_select on public.venue_messages;
create policy vmsg_select on public.venue_messages for select using (true);
drop policy if exists vmsg_insert on public.venue_messages;
create policy vmsg_insert on public.venue_messages for insert with check (auth.uid() is not null and user_id = auth.uid());
drop policy if exists vmsg_delete on public.venue_messages;
create policy vmsg_delete on public.venue_messages for delete using (user_id = auth.uid() or public.can_manage_venue(venue_id));

do $$ begin
  alter publication supabase_realtime add table public.venue_messages;
exception when duplicate_object then null; end $$;

-- ② 매장 플레이어 집계(바인·방문) — 참여왕/출석왕 보드용(이름·횟수만, 금액 없음)
create or replace function public.venue_player_counts(p_venue_id uuid)
returns table(name text, buyin_count bigint, visit_count bigint)
language sql security definer set search_path = public stable as $$
  select b.player_name as name,
         count(*)::bigint as buyin_count,
         count(distinct b.session_date)::bigint as visit_count
  from public.ledger_buyins b
  where b.venue_id = p_venue_id
  group by b.player_name
$$;
revoke execute on function public.venue_player_counts(uuid) from public;
grant execute on function public.venue_player_counts(uuid) to anon, authenticated;

-- ③ 전 매장 통합 랭킹(커뮤니티 랭킹 고도화) — 닉네임별 머니인 횟수·프라이즈 점수
create or replace function public.global_ranking_totals()
returns table(nickname text, moneyin_count bigint, prize_points bigint, best_position integer, venues bigint)
language sql security definer set search_path = public stable as $$
  select r.nickname,
         count(*)::bigint as moneyin_count,
         coalesce(sum(nullif(regexp_replace(coalesce(r.prize, ''), '[^0-9]', '', 'g'), '')::bigint), 0)::bigint as prize_points,
         min(r.position)::integer as best_position,
         count(distinct r.venue_id)::bigint as venues
  from public.venue_rankings r
  where coalesce(trim(r.nickname), '') <> ''
  group by r.nickname
$$;
revoke execute on function public.global_ranking_totals() from public;
grant execute on function public.global_ranking_totals() to anon, authenticated;
