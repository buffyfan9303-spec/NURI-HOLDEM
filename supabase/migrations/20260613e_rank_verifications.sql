-- 순위(머니인) 인증 — 외부 대회 입상 증빙(이미지 2장) → 운영자 승인 → 국내 순위 집계
create table if not exists public.rank_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null,
  event_name text not null,
  amount_won bigint not null check (amount_won >= 0),
  proof_url text not null,
  id_card_path text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.rank_verifications enable row level security;
create policy rv_insert_own on public.rank_verifications for insert with check (auth.uid() = user_id);
create policy rv_select_own on public.rank_verifications for select using (
  auth.uid() = user_id or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy rv_admin_update on public.rank_verifications for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
insert into storage.buckets (id, name, public) values ('verifications', 'verifications', false)
on conflict (id) do nothing;
create policy verif_upload_own on storage.objects for insert with check (
  bucket_id = 'verifications' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy verif_admin_read on storage.objects for select using (
  bucket_id = 'verifications' and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy verif_admin_delete on storage.objects for delete using (
  bucket_id = 'verifications' and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
create or replace function public.get_domestic_rankings(p_limit integer default 30)
returns table(nickname text, total_won bigint, wins integer)
language sql security definer set search_path to 'public'
as $$
  select rv.nickname, sum(rv.amount_won)::bigint as total_won, count(*)::integer as wins
  from rank_verifications rv
  where rv.status = 'approved'
  group by rv.nickname
  order by total_won desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;
grant execute on function public.get_domestic_rankings(integer) to anon, authenticated;
