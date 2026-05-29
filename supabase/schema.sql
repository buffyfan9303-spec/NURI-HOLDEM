-- ============================================================
-- NURI HOLDEM — Supabase PostgreSQL Schema + RLS
-- supabase/schema.sql
-- Supabase SQL Editor에서 순서대로 실행
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";     -- 한글 검색 최적화

-- ── ENUM 타입 ────────────────────────────────────────────────
create type user_role    as enum ('user', 'venue_owner', 'admin');
create type user_status  as enum ('active', 'suspended', 'banned', 'pending');
create type tour_format  as enum ('MTT', 'SNG', 'PKO', 'Bounty', 'Mix');
create type listing_cat  as enum ('gameMoney', 'pokerGear', 'etc');
create type listing_cond as enum ('S', 'A', 'B', 'C');
create type listing_stat as enum ('on_sale', 'reserved', 'sold');
create type notice_type  as enum ('pinned', 'event', 'caution');
create type notif_type   as enum ('qna', 'approval', 'comment', 'system', 'mention');

-- ════════════════════════════════════════════════════════════
-- 1. profiles (auth.users 확장)
-- ════════════════════════════════════════════════════════════
create table public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text unique not null,
  name             text not null,
  role             user_role   not null default 'user',
  status           user_status not null default 'active',
  approved         boolean,                    -- venue_owner 전용
  venue_id         uuid,                       -- venue_owner 소속 매장
  avatar_color     text default '#6B7280',
  suspended_until  timestamptz,
  joined_at        timestamptz not null default now()
);

-- 신규 사용자 가입 시 profiles 자동 생성
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'user')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ════════════════════════════════════════════════════════════
-- 2. venues (홀덤펍 매장)
-- ════════════════════════════════════════════════════════════
create table public.venues (
  id               uuid primary key default uuid_generate_v4(),
  name             text not null,
  region           text not null,
  address          text not null,
  description      text,
  image_url        text,
  theme_color      text default '#C9A961',
  owner_id         uuid references public.profiles(id) on delete set null,
  approved         boolean not null default false,
  contact_phone    text,
  business_hours   text,
  follower_count   int  not null default 0,
  is_paid_ad       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_venues_region   on public.venues(region);
create index idx_venues_owner_id on public.venues(owner_id);

-- ════════════════════════════════════════════════════════════
-- 3. schedules (토너먼트 요강)
-- ════════════════════════════════════════════════════════════
create table public.schedules (
  id                uuid primary key default uuid_generate_v4(),
  title             text not null,
  venue_id          uuid not null references public.venues(id) on delete cascade,
  pub_name          text not null,
  region            text not null,
  address           text,
  date              date not null,
  start_time        time not null,
  duration          text,
  format            tour_format not null default 'MTT',
  guaranteed        boolean not null default false,
  prize_pool        bigint,
  reg_close_time    text,
  buy_in            jsonb not null default '{}',   -- BuyInInfo
  seats             jsonb,                         -- SeatVoucher[]
  structure         jsonb,                         -- BlindStructure
  description       text,
  side_events       jsonb,                         -- SideEvent[]
  ranking_prizes    jsonb,                         -- RankingPrize[]
  partners          text[],
  promotions        jsonb,                         -- Promotion[]
  payment_methods   text[],
  rules             text[],
  poster_url        text,
  poster_color      text default '#0a0c0f',
  display_order     int  not null default 999,
  is_premium        boolean not null default false,
  owner_id          uuid references public.profiles(id) on delete set null,
  unread_qna_count  int  not null default 0,
  approved          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_schedules_date        on public.schedules(date);
create index idx_schedules_venue_id    on public.schedules(venue_id);
create index idx_schedules_owner_id    on public.schedules(owner_id);
create index idx_schedules_display_ord on public.schedules(display_order);
create index idx_schedules_title_trgm  on public.schedules using gin (title gin_trgm_ops);

-- ════════════════════════════════════════════════════════════
-- 4. community_posts (전역 피드)
-- ════════════════════════════════════════════════════════════
create table public.community_posts (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  user_name     text not null,
  user_role     user_role not null default 'user',
  user_color    text,
  content       text not null check (char_length(content) between 1 and 2000),
  like_count    int  not null default 0,
  comment_count int  not null default 0,
  created_at    timestamptz not null default now()
);

create index idx_posts_user_id   on public.community_posts(user_id);
create index idx_posts_created   on public.community_posts(created_at desc);

-- ════════════════════════════════════════════════════════════
-- 5. comments (요강 Q&A + 매장 커뮤니티 통합)
-- ════════════════════════════════════════════════════════════
create table public.comments (
  id          uuid primary key default uuid_generate_v4(),
  schedule_id uuid references public.schedules(id) on delete cascade,
  venue_id    uuid references public.venues(id) on delete cascade,
  post_id     uuid references public.community_posts(id) on delete cascade,
  parent_id   uuid references public.comments(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  user_name   text not null,
  user_role   user_role not null,
  is_owner    boolean not null default false,
  content     text not null check (char_length(content) between 1 and 1000),
  edited      boolean not null default false,
  created_at  timestamptz not null default now(),
  -- 3개 중 정확히 1개에만 연결
  constraint comment_target_check check (
    (schedule_id is not null)::int +
    (venue_id    is not null)::int +
    (post_id     is not null)::int = 1
  )
);

create index idx_comments_schedule on public.comments(schedule_id);
create index idx_comments_venue    on public.comments(venue_id);
create index idx_comments_post     on public.comments(post_id);
create index idx_comments_parent   on public.comments(parent_id);

-- Q&A count 자동 갱신
create or replace function update_qna_count() returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' and NEW.schedule_id is not null then
    update public.schedules set unread_qna_count = unread_qna_count + 1 where id = NEW.schedule_id;
  elsif TG_OP = 'DELETE' and OLD.schedule_id is not null then
    update public.schedules set unread_qna_count = greatest(0, unread_qna_count - 1) where id = OLD.schedule_id;
  end if;
  return coalesce(NEW, OLD);
end;
$$;

create trigger trg_qna_count
  after insert or delete on public.comments
  for each row execute function update_qna_count();

-- ════════════════════════════════════════════════════════════
-- 6. notifications (앱 알림)
-- ════════════════════════════════════════════════════════════
create table public.notifications (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  type         notif_type not null,
  title        text not null,
  message      text not null,
  read         boolean not null default false,
  link         text,
  avatar_text  text,
  avatar_color text,
  created_at   timestamptz not null default now()
);

create index idx_notif_user on public.notifications(user_id, created_at desc);

-- ════════════════════════════════════════════════════════════
-- 7. marketplace_listings (중고장터)
-- ════════════════════════════════════════════════════════════
create table public.marketplace_listings (
  id                  uuid primary key default uuid_generate_v4(),
  title               text not null check (char_length(title) between 2 and 100),
  category            listing_cat  not null,
  description         text not null check (char_length(description) between 1 and 3000),
  price               int  not null check (price >= 0),
  condition           listing_cond not null,
  status              listing_stat not null default 'on_sale',
  images              text[] not null default '{}',
  region              text not null,
  shipping_available  boolean not null default false,
  pickup_only         boolean not null default false,
  seller_id           uuid not null references public.profiles(id) on delete cascade,
  seller_name         text not null,
  seller_avatar_color text,
  seller_trade_count  int  not null default 0,
  seller_verified     boolean not null default false,
  view_count          int  not null default 0,
  like_count          int  not null default 0,
  comment_count       int  not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_listings_seller   on public.marketplace_listings(seller_id);
create index idx_listings_status   on public.marketplace_listings(status);
create index idx_listings_category on public.marketplace_listings(category);
create index idx_listings_created  on public.marketplace_listings(created_at desc);
create index idx_listings_title_trgm on public.marketplace_listings using gin (title gin_trgm_ops);

-- ════════════════════════════════════════════════════════════
-- 8. marketplace_notices (장터 공지)
-- ════════════════════════════════════════════════════════════
create table public.marketplace_notices (
  id          uuid primary key default uuid_generate_v4(),
  type        notice_type not null default 'pinned',
  title       text not null,
  body        text,
  author_name text not null,
  created_at  timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════

alter table public.profiles             enable row level security;
alter table public.venues               enable row level security;
alter table public.schedules            enable row level security;
alter table public.community_posts      enable row level security;
alter table public.comments             enable row level security;
alter table public.notifications        enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.marketplace_notices  enable row level security;

-- 헬퍼: 현재 사용자 role 조회
create or replace function public.my_role()
returns user_role language sql stable security definer as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ── profiles ────────────────────────────────────────────────
create policy "profiles: 본인+관리자 조회"
  on public.profiles for select
  using (id = auth.uid() or public.my_role() = 'admin');

create policy "profiles: 본인 수정"
  on public.profiles for update
  using (id = auth.uid());

-- ── venues ──────────────────────────────────────────────────
create policy "venues: 승인된 매장 공개"
  on public.venues for select
  using (approved = true or owner_id = auth.uid() or public.my_role() = 'admin');

create policy "venues: 업주 본인 수정"
  on public.venues for update
  using (owner_id = auth.uid() or public.my_role() = 'admin');

create policy "venues: 관리자 삽입"
  on public.venues for insert
  with check (public.my_role() in ('admin', 'venue_owner'));

create policy "venues: 관리자 삭제"
  on public.venues for delete
  using (public.my_role() = 'admin');

-- ── schedules ───────────────────────────────────────────────
create policy "schedules: 승인된 요강 공개"
  on public.schedules for select
  using (approved = true or owner_id = auth.uid() or public.my_role() = 'admin');

create policy "schedules: 업주 본인 삽입"
  on public.schedules for insert
  with check (
    owner_id = auth.uid() and
    public.my_role() = 'venue_owner' and
    (select approved from public.profiles where id = auth.uid()) = true
  );

create policy "schedules: 업주/관리자 수정"
  on public.schedules for update
  using (owner_id = auth.uid() or public.my_role() = 'admin');

create policy "schedules: 업주/관리자 삭제"
  on public.schedules for delete
  using (owner_id = auth.uid() or public.my_role() = 'admin');

-- ── community_posts ──────────────────────────────────────────
create policy "posts: 전체 조회"
  on public.community_posts for select using (true);

create policy "posts: 로그인 사용자 작성"
  on public.community_posts for insert
  with check (auth.uid() is not null and user_id = auth.uid());

create policy "posts: 본인/관리자 삭제"
  on public.community_posts for delete
  using (user_id = auth.uid() or public.my_role() = 'admin');

-- ── comments ────────────────────────────────────────────────
create policy "comments: 전체 조회"
  on public.comments for select using (true);

create policy "comments: 로그인 사용자 작성"
  on public.comments for insert
  with check (auth.uid() is not null and user_id = auth.uid());

create policy "comments: 본인/관리자 삭제"
  on public.comments for delete
  using (user_id = auth.uid() or public.my_role() = 'admin');

create policy "comments: 본인 수정"
  on public.comments for update
  using (user_id = auth.uid());

-- ── notifications ────────────────────────────────────────────
create policy "notifications: 본인만 조회"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "notifications: 본인 read 업데이트"
  on public.notifications for update
  using (user_id = auth.uid());

-- ── marketplace_listings ─────────────────────────────────────
create policy "listings: 전체 조회"
  on public.marketplace_listings for select using (true);

create policy "listings: 로그인 사용자 등록"
  on public.marketplace_listings for insert
  with check (auth.uid() is not null and seller_id = auth.uid());

create policy "listings: 판매자/관리자 수정·삭제"
  on public.marketplace_listings for update
  using (seller_id = auth.uid() or public.my_role() = 'admin');

create policy "listings: 판매자/관리자 삭제"
  on public.marketplace_listings for delete
  using (seller_id = auth.uid() or public.my_role() = 'admin');

-- ── marketplace_notices ──────────────────────────────────────
create policy "notices: 전체 조회"
  on public.marketplace_notices for select using (true);

create policy "notices: 관리자만 CUD"
  on public.marketplace_notices for all
  using (public.my_role() = 'admin');

-- ════════════════════════════════════════════════════════════
-- Storage 버킷
-- ════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('posters',  'posters',  true, 5242880,  array['image/jpeg','image/png','image/webp']),
  ('listings', 'listings', true, 5242880,  array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Storage RLS
create policy "posters: 공개 읽기"  on storage.objects for select using (bucket_id = 'posters');
create policy "posters: 업주 업로드" on storage.objects for insert
  with check (bucket_id = 'posters' and auth.uid() is not null and public.my_role() in ('venue_owner','admin'));
create policy "posters: 본인 삭제"  on storage.objects for delete
  using (bucket_id = 'posters' and owner = auth.uid()::text);

create policy "listings: 공개 읽기"  on storage.objects for select using (bucket_id = 'listings');
create policy "listings: 로그인 업로드" on storage.objects for insert
  with check (bucket_id = 'listings' and auth.uid() is not null);
create policy "listings: 본인 삭제"  on storage.objects for delete
  using (bucket_id = 'listings' and owner = auth.uid()::text);