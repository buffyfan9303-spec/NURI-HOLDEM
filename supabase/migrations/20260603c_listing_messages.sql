-- ============================================================================
-- Phase 3: 중고장터 1:1 실시간 채팅 (목업 대체)
--  thread = (listing_id, buyer_id). buyer_id = 판매자가 아닌 문의자.
--  RLS: 구매자 본인 또는 해당 매물 판매자만 조회/작성.
-- ============================================================================
create table if not exists public.listing_messages (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  buyer_id   uuid not null references auth.users(id) on delete cascade,
  sender_id  uuid not null references auth.users(id) on delete cascade,
  content    text not null check (char_length(trim(content)) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.listing_messages enable row level security;

drop policy if exists "lm_select" on public.listing_messages;
create policy "lm_select" on public.listing_messages for select to public using (
  auth.uid() = buyer_id
  or exists (select 1 from public.marketplace_listings l where l.id = listing_id and l.seller_id = auth.uid())
);

drop policy if exists "lm_insert" on public.listing_messages;
create policy "lm_insert" on public.listing_messages for insert to public with check (
  auth.uid() = sender_id and (
    auth.uid() = buyer_id
    or exists (select 1 from public.marketplace_listings l where l.id = listing_id and l.seller_id = auth.uid())
  )
);

create index if not exists idx_lm_thread on public.listing_messages (listing_id, buyer_id, created_at);

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='listing_messages') then
    alter publication supabase_realtime add table public.listing_messages;
  end if;
end $$;
