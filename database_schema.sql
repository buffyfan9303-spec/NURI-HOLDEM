-- ============================================================================
-- NURI HOLDEM — 실서비스 데이터베이스 스키마 (PostgreSQL / Supabase)
-- ----------------------------------------------------------------------------
-- 사용법:
--   1) Supabase 대시보드 → SQL Editor → New query
--   2) 이 파일 전체를 붙여넣고 RUN (신규 프로젝트 기준 1회 실행)
--   3) 앱에서 buffyfan9303@gmail.com 으로 회원가입 완료
--   4) 맨 아래 "관리자 지정" 주석을 해제하고 1회 더 실행
--
-- 3-Tier 권한: user(일반) / venue_owner(업주) / admin(관리자)
-- 모든 테이블 RLS 활성화. "누구나 읽기 / 작성자·관리자만 수정·삭제" 기본 원칙.
-- ============================================================================

-- ── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";     -- 한글 부분검색(title) 최적화

-- ── ENUM 타입 (재실행 안전) ──────────────────────────────────────────────────
do $$ begin create type user_role    as enum ('user','venue_owner','admin');        exception when duplicate_object then null; end $$;
do $$ begin create type user_status  as enum ('active','suspended','banned','pending'); exception when duplicate_object then null; end $$;
do $$ begin create type tour_format  as enum ('MTT','SNG','PKO','Bounty','Mix');     exception when duplicate_object then null; end $$;
do $$ begin create type listing_cat  as enum ('gameMoney','pokerGear','etc');        exception when duplicate_object then null; end $$;
do $$ begin create type listing_cond as enum ('S','A','B','C');                      exception when duplicate_object then null; end $$;
do $$ begin create type listing_stat as enum ('on_sale','reserved','sold');          exception when duplicate_object then null; end $$;
do $$ begin create type notice_type  as enum ('pinned','event','caution');           exception when duplicate_object then null; end $$;
do $$ begin create type notif_type   as enum ('qna','approval','comment','system','mention'); exception when duplicate_object then null; end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. profiles — auth.users 1:1 확장
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.profiles (
  id                       uuid primary key references auth.users(id) on delete cascade,
  email                    text unique not null,
  name                     text not null,
  role                     user_role   not null default 'user',
  status                   user_status not null default 'active',
  approved                 boolean,                 -- venue_owner 승인 여부
  venue_id                 uuid,                    -- 업주 소속 매장
  avatar_color             text default '#6B7280',
  avatar_url               text,                    -- 프로필 사진 (Storage URL)
  suspended_until          timestamptz,
  -- 법적 동의 이력 (개인정보보호법 §15 / 게임산업법 §32)
  agreed_to_terms          boolean,
  agreed_to_privacy        boolean,
  agreed_to_anti_gambling  boolean,
  agreed_to_marketing      boolean,
  terms_agreed_at          timestamptz,
  joined_at                timestamptz not null default now()
);

-- 기존(구) 스키마를 이미 실행했던 경우를 대비한 컬럼 보강 (재실행 안전)
alter table public.profiles add column if not exists avatar_url              text;
alter table public.profiles add column if not exists agreed_to_terms         boolean;
alter table public.profiles add column if not exists agreed_to_privacy       boolean;
alter table public.profiles add column if not exists agreed_to_anti_gambling boolean;
alter table public.profiles add column if not exists agreed_to_marketing     boolean;
alter table public.profiles add column if not exists terms_agreed_at         timestamptz;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. venues — 홀덤펍 매장
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.venues (
  id               uuid primary key default uuid_generate_v4(),
  name             text not null,
  region           text not null,
  address          text not null default '',
  description      text,
  image_url        text,
  theme_color      text default '#C9A961',
  owner_id         uuid references public.profiles(id) on delete set null,
  approved         boolean not null default false,
  contact_phone    text,
  business_number  text,                    -- 사업자등록번호
  business_hours   text,
  follower_count   int  not null default 0,
  is_paid_ad       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.venues add column if not exists business_number text;

create index if not exists idx_venues_region   on public.venues(region);
create index if not exists idx_venues_owner_id on public.venues(owner_id);

-- profiles.venue_id → venues.id (순환참조이므로 테이블 생성 후 FK 추가)
do $$ begin
  alter table public.profiles
    add constraint profiles_venue_fk foreign key (venue_id) references public.venues(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. schedules — 토너먼트 요강(포스터)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.schedules (
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

create index if not exists idx_schedules_date        on public.schedules(date);
create index if not exists idx_schedules_venue_id    on public.schedules(venue_id);
create index if not exists idx_schedules_owner_id    on public.schedules(owner_id);
create index if not exists idx_schedules_display_ord on public.schedules(display_order);
create index if not exists idx_schedules_title_trgm  on public.schedules using gin (title gin_trgm_ops);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. community_posts — 전역 피드
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.community_posts (
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
create index if not exists idx_posts_user_id on public.community_posts(user_id);
create index if not exists idx_posts_created on public.community_posts(created_at desc);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. comments — 요강 Q&A · 매장 댓글 · 게시글 댓글 통합
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.comments (
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
  constraint comment_target_check check (
    (schedule_id is not null)::int + (venue_id is not null)::int + (post_id is not null)::int = 1
  )
);
create index if not exists idx_comments_schedule on public.comments(schedule_id);
create index if not exists idx_comments_venue    on public.comments(venue_id);
create index if not exists idx_comments_post     on public.comments(post_id);
create index if not exists idx_comments_parent   on public.comments(parent_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 6. notifications — 앱 알림 (본인 전용)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.notifications (
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
create index if not exists idx_notif_user on public.notifications(user_id, created_at desc);

-- ════════════════════════════════════════════════════════════════════════════
-- 7. marketplace_listings — 중고장터
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.marketplace_listings (
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
create index if not exists idx_listings_seller     on public.marketplace_listings(seller_id);
create index if not exists idx_listings_status     on public.marketplace_listings(status);
create index if not exists idx_listings_category   on public.marketplace_listings(category);
create index if not exists idx_listings_created    on public.marketplace_listings(created_at desc);
create index if not exists idx_listings_title_trgm on public.marketplace_listings using gin (title gin_trgm_ops);

-- ════════════════════════════════════════════════════════════════════════════
-- 8. marketplace_notices — 장터/커뮤니티 공지
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.marketplace_notices (
  id          uuid primary key default uuid_generate_v4(),
  type        notice_type not null default 'pinned',
  title       text not null,
  body        text,
  author_name text not null,
  created_at  timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════════════
-- 함수 / 트리거
-- ════════════════════════════════════════════════════════════════════════════

-- 현재 로그인 사용자 role (RLS 헬퍼)
create or replace function public.my_role()
returns user_role language sql stable security definer as $$
  select role from public.profiles where id = auth.uid();
$$;

-- 신규 가입 시 profiles 자동 생성 (+ 업주면 매장 자동 생성, 승인대기)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_role     user_role;
  v_venue_id uuid;
  v_agreed   boolean;
begin
  v_role   := coalesce((new.raw_user_meta_data->>'role')::user_role, 'user');
  v_agreed := coalesce((new.raw_user_meta_data->>'agreed_to_terms')::boolean, false);

  insert into public.profiles (
    id, email, name, role,
    agreed_to_terms, agreed_to_privacy, agreed_to_anti_gambling, agreed_to_marketing, terms_agreed_at
  ) values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    v_role,
    v_agreed,
    coalesce((new.raw_user_meta_data->>'agreed_to_privacy')::boolean, false),
    coalesce((new.raw_user_meta_data->>'agreed_to_anti_gambling')::boolean, false),
    coalesce((new.raw_user_meta_data->>'agreed_to_marketing')::boolean, false),
    case when v_agreed then now() else null end
  );

  -- 업주 가입: 매장 자동 생성(승인 대기) + 프로필 연결
  if v_role = 'venue_owner' and coalesce(new.raw_user_meta_data->>'venue_name','') <> '' then
    insert into public.venues (name, region, address, owner_id, approved, contact_phone, business_number)
    values (
      new.raw_user_meta_data->>'venue_name',
      coalesce(new.raw_user_meta_data->>'region',  ''),
      coalesce(new.raw_user_meta_data->>'address', ''),
      new.id, false,
      new.raw_user_meta_data->>'phone',
      new.raw_user_meta_data->>'business_number'
    )
    returning id into v_venue_id;

    update public.profiles set venue_id = v_venue_id, approved = false where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Q&A 개수 자동 갱신
create or replace function public.update_qna_count()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' and NEW.schedule_id is not null then
    update public.schedules set unread_qna_count = unread_qna_count + 1 where id = NEW.schedule_id;
  elsif TG_OP = 'DELETE' and OLD.schedule_id is not null then
    update public.schedules set unread_qna_count = greatest(0, unread_qna_count - 1) where id = OLD.schedule_id;
  end if;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_qna_count on public.comments;
create trigger trg_qna_count
  after insert or delete on public.comments
  for each row execute function public.update_qna_count();

-- 게시글 좋아요 +1 (앱에서 supabase.rpc('increment_post_likes')로 호출)
create or replace function public.increment_post_likes(post_id uuid)
returns void language sql security definer as $$
  update public.community_posts set like_count = like_count + 1 where id = post_id;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════════════════
alter table public.profiles             enable row level security;
alter table public.venues               enable row level security;
alter table public.schedules            enable row level security;
alter table public.community_posts      enable row level security;
alter table public.comments             enable row level security;
alter table public.notifications        enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.marketplace_notices  enable row level security;

-- ── profiles ──
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select
  using (id = auth.uid() or public.my_role() = 'admin');
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles for update
  using (id = auth.uid() or public.my_role() = 'admin');

-- ── venues ── (누구나 승인매장 읽기 / 업주·관리자 수정)
drop policy if exists "venues_select" on public.venues;
create policy "venues_select" on public.venues for select
  using (approved = true or owner_id = auth.uid() or public.my_role() = 'admin');
drop policy if exists "venues_update" on public.venues;
create policy "venues_update" on public.venues for update
  using (owner_id = auth.uid() or public.my_role() = 'admin');
drop policy if exists "venues_insert" on public.venues;
create policy "venues_insert" on public.venues for insert
  with check (public.my_role() in ('admin','venue_owner'));
drop policy if exists "venues_delete" on public.venues;
create policy "venues_delete" on public.venues for delete
  using (public.my_role() = 'admin');

-- ── schedules ── (승인 요강 공개 / 업주 본인 등록 / 업주·관리자 수정삭제)
drop policy if exists "schedules_select" on public.schedules;
create policy "schedules_select" on public.schedules for select
  using (approved = true or owner_id = auth.uid() or public.my_role() = 'admin');
drop policy if exists "schedules_insert" on public.schedules;
create policy "schedules_insert" on public.schedules for insert
  with check (owner_id = auth.uid() and public.my_role() in ('venue_owner','admin'));
drop policy if exists "schedules_update" on public.schedules;
create policy "schedules_update" on public.schedules for update
  using (owner_id = auth.uid() or public.my_role() = 'admin');
drop policy if exists "schedules_delete" on public.schedules;
create policy "schedules_delete" on public.schedules for delete
  using (owner_id = auth.uid() or public.my_role() = 'admin');

-- ── community_posts ── (누구나 읽기 / 로그인 작성 / 본인·관리자 삭제)
drop policy if exists "posts_select" on public.community_posts;
create policy "posts_select" on public.community_posts for select using (true);
drop policy if exists "posts_insert" on public.community_posts;
create policy "posts_insert" on public.community_posts for insert
  with check (auth.uid() is not null and user_id = auth.uid());
drop policy if exists "posts_delete" on public.community_posts;
create policy "posts_delete" on public.community_posts for delete
  using (user_id = auth.uid() or public.my_role() = 'admin');

-- ── comments ── (누구나 읽기 / 로그인 작성 / 본인 수정 / 본인·관리자 삭제)
drop policy if exists "comments_select" on public.comments;
create policy "comments_select" on public.comments for select using (true);
drop policy if exists "comments_insert" on public.comments;
create policy "comments_insert" on public.comments for insert
  with check (auth.uid() is not null and user_id = auth.uid());
drop policy if exists "comments_update_self" on public.comments;
create policy "comments_update_self" on public.comments for update
  using (user_id = auth.uid());
drop policy if exists "comments_delete" on public.comments;
create policy "comments_delete" on public.comments for delete
  using (user_id = auth.uid() or public.my_role() = 'admin');

-- ── notifications ── (본인만)
drop policy if exists "notif_select_self" on public.notifications;
create policy "notif_select_self" on public.notifications for select using (user_id = auth.uid());
drop policy if exists "notif_update_self" on public.notifications;
create policy "notif_update_self" on public.notifications for update using (user_id = auth.uid());

-- ── marketplace_listings ── (누구나 읽기 / 로그인 등록 / 판매자·관리자 수정삭제)
drop policy if exists "listings_select" on public.marketplace_listings;
create policy "listings_select" on public.marketplace_listings for select using (true);
drop policy if exists "listings_insert" on public.marketplace_listings;
create policy "listings_insert" on public.marketplace_listings for insert
  with check (auth.uid() is not null and seller_id = auth.uid());
drop policy if exists "listings_update" on public.marketplace_listings;
create policy "listings_update" on public.marketplace_listings for update
  using (seller_id = auth.uid() or public.my_role() = 'admin');
drop policy if exists "listings_delete" on public.marketplace_listings;
create policy "listings_delete" on public.marketplace_listings for delete
  using (seller_id = auth.uid() or public.my_role() = 'admin');

-- ── marketplace_notices ── (누구나 읽기 / 관리자만 CUD)
drop policy if exists "notices_select" on public.marketplace_notices;
create policy "notices_select" on public.marketplace_notices for select using (true);
drop policy if exists "notices_admin_all" on public.marketplace_notices;
create policy "notices_admin_all" on public.marketplace_notices for all
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- ════════════════════════════════════════════════════════════════════════════
-- Storage 버킷 (포스터 / 장터 이미지 / 아바타)
-- ════════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('posters',  'posters',  true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('listings', 'listings', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('avatars',  'avatars',  true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "posters_read"   on storage.objects;
create policy "posters_read"   on storage.objects for select using (bucket_id = 'posters');
drop policy if exists "posters_upload" on storage.objects;
create policy "posters_upload" on storage.objects for insert
  with check (bucket_id = 'posters' and auth.uid() is not null and public.my_role() in ('venue_owner','admin'));
drop policy if exists "posters_delete" on storage.objects;
create policy "posters_delete" on storage.objects for delete
  using (bucket_id = 'posters' and owner = auth.uid());

drop policy if exists "listings_read"   on storage.objects;
create policy "listings_read"   on storage.objects for select using (bucket_id = 'listings');
drop policy if exists "listings_upload" on storage.objects;
create policy "listings_upload" on storage.objects for insert
  with check (bucket_id = 'listings' and auth.uid() is not null);
drop policy if exists "listings_delete" on storage.objects;
create policy "listings_delete" on storage.objects for delete
  using (bucket_id = 'listings' and owner = auth.uid());

drop policy if exists "avatars_read"   on storage.objects;
create policy "avatars_read"   on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "avatars_upload" on storage.objects;
create policy "avatars_upload" on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid() is not null);
drop policy if exists "avatars_update" on storage.objects;
create policy "avatars_update" on storage.objects for update
  using (bucket_id = 'avatars' and owner = auth.uid());
drop policy if exists "avatars_delete" on storage.objects;
create policy "avatars_delete" on storage.objects for delete
  using (bucket_id = 'avatars' and owner = auth.uid());

-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ 관리자 지정 — 회원가입 완료 후 아래 한 줄의 주석을 풀고 1회 실행
-- (앱에서 buffyfan9303@gmail.com 으로 먼저 가입해야 profiles 행이 존재함)
-- ════════════════════════════════════════════════════════════════════════════
-- update public.profiles set role = 'admin', approved = true where email = 'buffyfan9303@gmail.com';
