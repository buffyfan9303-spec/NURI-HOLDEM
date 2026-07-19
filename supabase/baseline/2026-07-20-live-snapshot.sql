-- ⚠️ 라이브 스냅샷(2026-07-20) — 문서/재구축 참조용. supabase migrations 로 자동 적용하지 말 것.
-- 주의: CREATE OR REPLACE 재적용 시 함수 ACL 이 초기화됨(anon revoke 마이그레이션 재실행 필요)
--
-- NURI HOLDEM 라이브 Supabase (project ref: idsxiqspecrucvfvtgbw) public 스키마 전체 스냅샷.
-- 생성 방법: pg_catalog / information_schema 카탈로그 조회를 조립(읽기 전용). pg_dump 아님.
-- 구성: 1) ENUM  2) 시퀀스  3) 테이블  4) 제약(PK/UNIQUE/CHECK/FK)  5) RLS enable
--       6) 인덱스  7) 함수  8) 트리거  9) RLS 정책  10) cron 잡(주석)  11) realtime 퍼블리케이션
-- 제외: 확장(pg_trgm, pg_net 등) 소속 함수, auth/storage 등 타 스키마, 데이터(rows), GRANT/ACL.

-- ============================================================
-- 1. ENUM 타입 (11)
-- ============================================================

create type public.listing_cat as enum ('gameMoney', 'pokerGear', 'etc', 'item');
create type public.listing_cond as enum ('S', 'A', 'B', 'C');
create type public.listing_stat as enum ('on_sale', 'reserved', 'sold');
create type public.notice_type as enum ('pinned', 'event', 'caution');
create type public.notif_type as enum ('qna', 'approval', 'comment', 'system', 'mention');
create type public.post_category as enum ('free', 'question', 'info', 'review', 'study', 'hand', 'tourney');
create type public.tour_format as enum ('MTT', 'SNG', 'PKO', 'Bounty', 'Mix');
create type public.user_role as enum ('user', 'venue_owner', 'admin', 'venue_staff');
create type public.user_status as enum ('active', 'suspended', 'banned', 'pending', 'withdrawn');
create type public.venue_status as enum ('active', 'inactive', 'suspended', 'hidden');
create type public.venue_verification_status as enum ('unverified', 'pending', 'verified');

-- ============================================================
-- 2. 시퀀스 (1)
-- ============================================================

create sequence if not exists public.custom_missions_id_seq;

-- ============================================================
-- 3. 테이블 (73) — 컬럼/기본값/NOT NULL. 제약은 4장, RLS enable 은 5장.
-- ============================================================

create table public.activity_log (
  id uuid default gen_random_uuid() not null,
  actor_id uuid,
  actor_name text,
  action text default 'delete'::text not null,
  target_type text not null,
  target_id uuid,
  target_owner_id uuid,
  target_summary text,
  created_at timestamp with time zone default now() not null
);

create table public.app_settings (
  key text not null,
  value text,
  updated_at timestamp with time zone default now() not null
);

create table public.audit_log (
  id uuid default gen_random_uuid() not null,
  actor_id uuid,
  action text not null,
  target text,
  meta jsonb,
  created_at timestamp with time zone default now() not null
);

create table public.checkins (
  id uuid default gen_random_uuid() not null,
  venue_id uuid not null,
  user_id uuid not null,
  display_name text,
  created_at timestamp with time zone default now() not null
);

create table public.client_errors (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  message text not null,
  stack text,
  url text,
  user_agent text,
  created_at timestamp with time zone default now() not null
);

create table public.clock_presets (
  id uuid default gen_random_uuid() not null,
  venue_id uuid not null,
  name text not null,
  config jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table public.clock_states (
  venue_id uuid not null,
  session_date date,
  title text,
  config jsonb default '{}'::jsonb not null,
  current_index integer default 0 not null,
  running boolean default false not null,
  ends_at timestamp with time zone,
  remaining_ms bigint default 0 not null,
  adj_entries integer default 0 not null,
  adj_rebuys integer default 0 not null,
  adj_earlies integer default 0 not null,
  adj_addons integer default 0 not null,
  eliminations integer default 0 not null,
  updated_at timestamp with time zone default now(),
  live_stats jsonb,
  game_seq smallint default 1 not null
);

create table public.comments (
  id uuid default uuid_generate_v4() not null,
  schedule_id uuid,
  venue_id uuid,
  post_id uuid,
  parent_id uuid,
  user_id uuid not null,
  user_name text not null,
  user_role user_role not null,
  is_owner boolean default false not null,
  content text not null,
  edited boolean default false not null,
  created_at timestamp with time zone default now() not null,
  user_avatar text
);

create table public.community_ads (
  slot integer not null,
  title text default ''::text not null,
  link_url text default ''::text not null,
  advertiser text default ''::text not null,
  expires_at date,
  updated_at timestamp with time zone default now() not null
);

create table public.community_posts (
  id uuid default uuid_generate_v4() not null,
  user_id uuid not null,
  user_name text not null,
  user_role user_role default 'user'::user_role not null,
  user_color text,
  content text not null,
  like_count integer default 0 not null,
  comment_count integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  category post_category default 'free'::post_category not null,
  title text,
  images text[] default '{}'::text[] not null,
  badbeat_count integer default 0 not null,
  goodrun_count integer default 0 not null,
  user_avatar text,
  view_count integer default 0 not null,
  blinded boolean default false not null
);

create table public.consent_logs (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  doc_type text not null,
  agreed boolean not null,
  doc_version text,
  created_at timestamp with time zone default now() not null
);

create table public.coupons (
  id uuid default gen_random_uuid() not null,
  venue_id uuid not null,
  customer_name text not null,
  title text not null,
  status text default 'active'::text not null,
  expires_at date,
  created_at timestamp with time zone default now() not null
);

create table public.custom_missions (
  id integer default nextval('custom_missions_id_seq'::regclass) not null,
  title text not null,
  goal_type text not null,
  goal integer not null,
  reward integer not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null
);

create table public.customer_aliases (
  venue_id uuid not null,
  alias text not null,
  user_id uuid not null,
  created_at timestamp with time zone default now() not null
);

create table public.customer_profiles (
  id uuid default gen_random_uuid() not null,
  venue_id uuid not null,
  name text not null,
  birthday date,
  phone text,
  memo text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  user_id uuid,
  visit_count integer default 0 not null,
  last_visit_at timestamp with time zone,
  first_visit_at timestamp with time zone
);

create table public.dealer_applications (
  id uuid default gen_random_uuid() not null,
  post_id uuid not null,
  applicant_id uuid,
  applicant_name text not null,
  phone text not null,
  message text,
  created_at timestamp with time zone default now() not null
);

create table public.dealer_posts (
  id uuid default gen_random_uuid() not null,
  author_id uuid not null,
  author_name text,
  author_color text,
  kind text not null,
  region text,
  venue_name text,
  content text not null,
  deleted boolean default false not null,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  wage text,
  work_hours text,
  work_period text
);

create table public.dealer_shifts (
  id uuid default gen_random_uuid() not null,
  venue_id uuid not null,
  dealer_name text not null,
  shift_date date not null,
  start_time text,
  end_time text,
  table_no text,
  hourly_wage integer default 0 not null,
  memo text,
  created_at timestamp with time zone default now() not null
);

create table public.game_presets (
  id uuid default gen_random_uuid() not null,
  venue_id uuid not null,
  name text not null,
  data jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.group_members (
  id uuid default gen_random_uuid() not null,
  group_id uuid not null,
  user_id uuid not null,
  role text default 'member'::text not null,
  status text default 'pending'::text not null,
  created_at timestamp with time zone default now() not null,
  member_name text,
  member_color text
);

create table public.group_messages (
  id uuid default gen_random_uuid() not null,
  group_id uuid not null,
  user_id uuid not null,
  user_name text not null,
  user_color text,
  content text not null,
  created_at timestamp with time zone default now() not null
);

create table public.group_posts (
  id uuid default gen_random_uuid() not null,
  group_id uuid not null,
  author_id uuid not null,
  author_name text not null,
  author_color text,
  title text,
  content text not null,
  deleted boolean default false not null,
  created_at timestamp with time zone default now() not null
);

create table public.league_entries (
  id uuid default gen_random_uuid() not null,
  league_id uuid not null,
  venue_id uuid not null,
  name text not null,
  points integer not null,
  reason text,
  entry_date date default ((now() AT TIME ZONE 'Asia/Seoul'::text))::date not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

create table public.league_event_status (
  league_id uuid not null,
  venue_id uuid not null,
  live_status text default 'pending'::text not null,
  entries integer default 0 not null,
  itm jsonb,
  updated_at timestamp with time zone default now() not null
);

create table public.league_members (
  id uuid default gen_random_uuid() not null,
  league_id uuid not null,
  venue_id uuid not null,
  status text default 'pending'::text not null,
  invited_at timestamp with time zone default now() not null,
  responded_at timestamp with time zone
);

create table public.leagues (
  id uuid default gen_random_uuid() not null,
  name text not null,
  owner_venue_id uuid not null,
  season_start date default ((now() AT TIME ZONE 'Asia/Seoul'::text))::date not null,
  created_at timestamp with time zone default now() not null,
  event_date date,
  phase text default 'idle'::text not null,
  final_venue_id uuid,
  settled_at timestamp with time zone
);

create table public.ledger_access (
  venue_id uuid not null,
  user_id uuid not null
);

create table public.ledger_buyin_requests (
  id uuid default gen_random_uuid() not null,
  venue_id uuid not null,
  session_date date default CURRENT_DATE not null,
  user_id uuid,
  player_name text not null,
  note text,
  status text default 'pending'::text not null,
  game_seq smallint,
  created_at timestamp with time zone default now() not null,
  resolved_at timestamp with time zone,
  resolved_by uuid,
  requested_game_seq smallint,
  resolve_note text,
  voucher_id uuid
);

create table public.ledger_buyins (
  id uuid default uuid_generate_v4() not null,
  venue_id uuid not null,
  session_date date default CURRENT_DATE not null,
  player_name text not null,
  entry_no integer not null,
  payment_method text not null,
  is_unpaid boolean default false not null,
  buyin_at timestamp with time zone default now() not null,
  created_by uuid,
  is_split boolean default false not null,
  cash_amount integer default 0 not null,
  card_amount integer default 0 not null,
  transfer_amount integer default 0 not null,
  ticket_count integer default 0 not null,
  unpaid_amount integer default 0 not null,
  discount_level integer default 0 not null,
  discount_index integer default 0 not null,
  early_override text,
  game_seq smallint default 1 not null
);

create table public.ledger_players (
  id uuid default gen_random_uuid() not null,
  venue_id uuid not null,
  session_date date default CURRENT_DATE not null,
  name text not null,
  visitor_type text,
  note text,
  sort_order integer default 0 not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  game_seq smallint default 1 not null
);

create table public.ledger_sessions (
  venue_id uuid not null,
  session_date date default CURRENT_DATE not null,
  buyin_amount integer default 0 not null,
  target_entries integer default 0 not null,
  title text,
  updated_at timestamp with time zone default now() not null,
  card_amount integer,
  event_memo text,
  dealers text,
  opened_by uuid,
  opened_at timestamp with time zone,
  closed_at timestamp with time zone,
  close_memo text,
  closed boolean default false not null,
  reg_closed boolean default false not null,
  reg_closed_at timestamp with time zone,
  schedule_id uuid,
  discounts jsonb default '[]'::jsonb not null,
  early_double_min integer default 0 not null,
  early_single_min integer default 0 not null,
  tournament_start timestamp with time zone,
  game_type text default 'gtd'::text not null,
  max_entries integer default 0 not null,
  is_addon boolean default false not null,
  addon_stack integer default 0 not null,
  operators jsonb default '[]'::jsonb not null,
  voucher_issued integer default 0 not null,
  voucher_accrual_per_bin integer default 0 not null,
  game_seq smallint default 1 not null,
  clock_snapshot jsonb
);

create table public.listing_message_reads (
  listing_id uuid not null,
  buyer_id uuid not null,
  reader_id uuid not null,
  last_read_at timestamp with time zone default now() not null
);

create table public.listing_messages (
  id uuid default gen_random_uuid() not null,
  listing_id uuid not null,
  buyer_id uuid not null,
  sender_id uuid not null,
  content text not null,
  created_at timestamp with time zone default now() not null
);

create table public.live_wall (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  user_name text not null,
  user_role user_role default 'user'::user_role not null,
  user_color text,
  content text not null,
  created_at timestamp with time zone default now() not null,
  user_avatar text
);

create table public.marketplace_listings (
  id uuid default uuid_generate_v4() not null,
  title text not null,
  category listing_cat not null,
  description text not null,
  price integer not null,
  condition listing_cond not null,
  status listing_stat default 'on_sale'::listing_stat not null,
  images text[] default '{}'::text[] not null,
  region text not null,
  shipping_available boolean default false not null,
  pickup_only boolean default false not null,
  seller_id uuid not null,
  seller_name text not null,
  seller_avatar_color text,
  seller_trade_count integer default 0 not null,
  seller_verified boolean default false not null,
  view_count integer default 0 not null,
  like_count integer default 0 not null,
  comment_count integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.marketplace_notices (
  id uuid default uuid_generate_v4() not null,
  type notice_type default 'pinned'::notice_type not null,
  title text not null,
  body text,
  author_name text not null,
  created_at timestamp with time zone default now() not null,
  board text default 'all'::text not null
);

create table public.mission_claims (
  user_id uuid not null,
  mission_key text not null,
  week_start date not null,
  claimed_at timestamp with time zone default now() not null
);

create table public.notifications (
  id uuid default uuid_generate_v4() not null,
  user_id uuid not null,
  type notif_type not null,
  title text not null,
  message text not null,
  read boolean default false not null,
  link text,
  avatar_text text,
  avatar_color text,
  created_at timestamp with time zone default now() not null
);

create table public.owner_posts (
  id uuid default gen_random_uuid() not null,
  author_id uuid not null,
  author_name text,
  author_color text,
  content text not null,
  deleted boolean default false not null,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

create table public.post_likes (
  post_id uuid not null,
  user_id uuid not null,
  created_at timestamp with time zone default now() not null
);

create table public.post_reactions (
  post_id uuid not null,
  user_id uuid not null,
  type text not null,
  created_at timestamp with time zone default now() not null
);

create table public.profiles (
  id uuid not null,
  email text not null,
  name text not null,
  role user_role default 'user'::user_role not null,
  status user_status default 'active'::user_status not null,
  approved boolean,
  venue_id uuid,
  avatar_color text default '#6B7280'::text,
  avatar_url text,
  suspended_until timestamp with time zone,
  agreed_to_terms boolean,
  agreed_to_privacy boolean,
  agreed_to_anti_gambling boolean,
  agreed_to_marketing boolean,
  terms_agreed_at timestamp with time zone,
  joined_at timestamp with time zone default now() not null,
  nickname text,
  sanction_reason text,
  name_changed_at timestamp with time zone,
  activity_points integer default 0 not null,
  badges text[] default '{}'::text[] not null,
  last_login_point_at date,
  last_seen_at timestamp with time zone,
  staff_title text,
  ci text,
  real_name text,
  phone text,
  verified_at timestamp with time zone,
  birth_date date,
  gender text,
  carrier text,
  nickname_locked boolean default false not null,
  mute_venue_notify boolean default false not null,
  checkin_streak integer default 0 not null,
  last_checkin_date date,
  equipped_mark text
);

create table public.push_subscriptions (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamp with time zone default now() not null
);

create table public.rank_verifications (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  nickname text not null,
  event_name text not null,
  amount_won bigint not null,
  proof_url text not null,
  id_card_path text,
  status text default 'pending'::text not null,
  admin_note text,
  created_at timestamp with time zone default now() not null,
  decided_at timestamp with time zone
);

create table public.ranking_point_awards (
  venue_id uuid not null,
  ranking_date date not null,
  user_id uuid not null,
  points integer not null,
  created_at timestamp with time zone default now() not null,
  event_name text default ''::text not null
);

create table public.referrals (
  referee_id uuid not null,
  referrer_id uuid not null,
  code text not null,
  created_at timestamp with time zone default now() not null,
  rewarded_at timestamp with time zone
);

create table public.reports (
  id uuid default gen_random_uuid() not null,
  reporter_id uuid not null,
  reporter_name text,
  target_type text not null,
  target_id uuid,
  target_owner_id uuid,
  target_summary text,
  reason text not null,
  status text default 'open'::text not null,
  created_at timestamp with time zone default now() not null
);

create table public.schedule_reservations (
  id uuid default gen_random_uuid() not null,
  schedule_id uuid not null,
  user_id uuid not null,
  display_name text not null,
  created_at timestamp with time zone default now()
);

create table public.schedules (
  id uuid default uuid_generate_v4() not null,
  title text not null,
  venue_id uuid,
  pub_name text not null,
  region text not null,
  address text,
  date date not null,
  start_time time without time zone not null,
  duration text,
  format tour_format default 'MTT'::tour_format not null,
  guaranteed boolean default false not null,
  prize_pool bigint,
  reg_close_time text,
  buy_in jsonb default '{}'::jsonb not null,
  seats jsonb,
  structure jsonb,
  description text,
  side_events jsonb,
  ranking_prizes jsonb,
  partners text[],
  promotions jsonb,
  payment_methods text[],
  rules text[],
  poster_url text,
  poster_color text default '#0a0c0f'::text,
  display_order integer default 999 not null,
  is_premium boolean default false not null,
  owner_id uuid,
  unread_qna_count integer default 0 not null,
  approved boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  is_competition boolean default false not null,
  prize_percent integer,
  blinds text,
  premium_until timestamp with time zone,
  reminder_sent_at timestamp with time zone
);

create table public.staff_schedule (
  id uuid default gen_random_uuid() not null,
  venue_id uuid not null,
  work_date date not null,
  staff_name text not null,
  created_by uuid,
  created_at timestamp with time zone default now(),
  start_hm text,
  check_in text,
  check_out text,
  confirmed boolean default false not null
);

create table public.staff_wage (
  venue_id uuid not null,
  staff_name text not null,
  hourly_wage integer default 0 not null,
  payday integer default 0 not null,
  weekly_off text default ''::text not null,
  memo text,
  updated_at timestamp with time zone default now()
);

create table public.store_vouchers (
  id uuid default gen_random_uuid() not null,
  venue_id uuid not null,
  issued_by uuid not null,
  holder_user_id uuid,
  holder_name text,
  title text not null,
  status text default 'active'::text not null,
  used_venue_id uuid,
  used_at timestamp with time zone,
  note text,
  created_at timestamp with time zone default now() not null
);

create table public.support_inquiries (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  user_name text,
  category text default '기타'::text not null,
  title text not null,
  content text not null,
  status text default 'open'::text not null,
  answer text,
  answered_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

create table public.user_blocks (
  blocker_id uuid not null,
  blocked_id uuid not null,
  created_at timestamp with time zone default now() not null,
  blocked_name text
);

create table public.venue_announcements (
  id uuid default gen_random_uuid() not null,
  venue_id uuid not null,
  sent_by uuid,
  title text not null,
  message text not null,
  recipients integer default 0 not null,
  sent_at timestamp with time zone default now() not null
);

create table public.venue_follows (
  user_id uuid not null,
  venue_id uuid not null,
  created_at timestamp with time zone default now() not null
);

create table public.venue_kill_switch (
  venue_id uuid not null,
  pw_hash text not null,
  created_at timestamp with time zone default now() not null
);

create table public.venue_messages (
  id uuid default gen_random_uuid() not null,
  venue_id uuid not null,
  user_id uuid,
  user_name text not null,
  user_color text,
  content text not null,
  created_at timestamp with time zone default now() not null
);

create table public.venue_notices (
  id uuid default gen_random_uuid() not null,
  venue_id uuid not null,
  author_id uuid not null,
  author_name text,
  content text not null,
  created_at timestamp with time zone default now() not null
);

create table public.venue_owners (
  venue_id uuid not null,
  user_id uuid not null,
  added_by uuid,
  created_at timestamp with time zone default now() not null,
  status text default 'approved'::text not null
);

create table public.venue_pos_settings (
  venue_id uuid not null,
  cancel_password_hash text,
  updated_at timestamp with time zone default now() not null
);

create table public.venue_rankings (
  id uuid default gen_random_uuid() not null,
  venue_id uuid not null,
  ranking_date date default CURRENT_DATE not null,
  "position" integer not null,
  nickname text not null,
  real_name text,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  prize text,
  event_name text default ''::text not null
);

create table public.venue_reviews (
  id uuid default gen_random_uuid() not null,
  venue_id uuid not null,
  user_id uuid not null,
  nickname text default ''::text not null,
  rating integer not null,
  content text default ''::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  owner_reply text,
  owner_reply_at timestamp with time zone
);

create table public.venue_score_entries (
  id uuid default gen_random_uuid() not null,
  venue_id uuid not null,
  name text not null,
  points integer not null,
  reason text,
  entry_date date default ((now() AT TIME ZONE 'Asia/Seoul'::text))::date not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  board_key text
);

create table public.venue_season_results (
  season_id uuid not null,
  rank integer not null,
  nickname text not null,
  real_name text,
  points integer default 0 not null,
  prize_man integer default 0 not null,
  appearances integer default 0 not null,
  best_position integer
);

create table public.venue_seasons (
  id uuid default gen_random_uuid() not null,
  venue_id uuid not null,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  status text default 'active'::text not null,
  created_at timestamp with time zone default now() not null,
  ended_at timestamp with time zone
);

create table public.venue_staff (
  id uuid default uuid_generate_v4() not null,
  venue_id uuid not null,
  user_id uuid,
  staff_login text not null,
  staff_name text,
  staff_position text,
  created_at timestamp with time zone default now() not null
);

create table public.venue_staff_invites (
  id uuid default gen_random_uuid() not null,
  venue_id uuid not null,
  user_id uuid not null,
  invited_by uuid,
  status text default 'pending'::text not null,
  created_at timestamp with time zone default now() not null
);

create table public.venues (
  id uuid default uuid_generate_v4() not null,
  name text not null,
  region text not null,
  address text default ''::text not null,
  description text,
  image_url text,
  theme_color text default '#C9A961'::text,
  owner_id uuid,
  approved boolean default false not null,
  contact_phone text,
  business_number text,
  business_hours text,
  follower_count integer default 0 not null,
  is_paid_ad boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  display_order integer default 999 not null,
  status venue_status default 'active'::venue_status not null,
  verification_status venue_verification_status default 'unverified'::venue_verification_status not null,
  images text[] default '{}'::text[] not null,
  kakao_url text,
  kind text default 'venue'::text not null,
  join_approval boolean default true not null,
  voucher_issue_approved boolean default false not null,
  page_config jsonb,
  slug text,
  voucher_quota integer default 0 not null
);

create table public.voucher_access (
  venue_id uuid not null,
  user_id uuid not null,
  created_at timestamp with time zone default now() not null
);

create table public.voucher_credit_requests (
  id uuid default gen_random_uuid() not null,
  venue_id uuid not null,
  requested_by uuid,
  amount integer not null,
  note text,
  status text default 'pending'::text not null,
  admin_note text,
  created_at timestamp with time zone default now() not null,
  decided_at timestamp with time zone
);

create table public.voucher_transfers (
  id uuid default gen_random_uuid() not null,
  voucher_id uuid not null,
  from_user_id uuid,
  to_user_id uuid not null,
  created_at timestamp with time zone default now() not null
);

create table public.waitlist (
  id uuid default gen_random_uuid() not null,
  venue_id uuid not null,
  display_name text not null,
  party integer default 1 not null,
  phone text,
  status text default 'waiting'::text not null,
  memo text,
  created_at timestamp with time zone default now() not null
);

-- ============================================================
-- 4. 제약 — PK(73) / UNIQUE(11) / CHECK(25) / FK(107)
-- ============================================================

-- 4-1. PRIMARY KEY (73)

alter table public.activity_log add constraint activity_log_pkey PRIMARY KEY (id);
alter table public.app_settings add constraint app_settings_pkey PRIMARY KEY (key);
alter table public.audit_log add constraint audit_log_pkey PRIMARY KEY (id);
alter table public.checkins add constraint checkins_pkey PRIMARY KEY (id);
alter table public.client_errors add constraint client_errors_pkey PRIMARY KEY (id);
alter table public.clock_presets add constraint clock_presets_pkey PRIMARY KEY (id);
alter table public.clock_states add constraint clock_states_pkey PRIMARY KEY (venue_id, game_seq);
alter table public.comments add constraint comments_pkey PRIMARY KEY (id);
alter table public.community_ads add constraint community_ads_pkey PRIMARY KEY (slot);
alter table public.community_posts add constraint community_posts_pkey PRIMARY KEY (id);
alter table public.consent_logs add constraint consent_logs_pkey PRIMARY KEY (id);
alter table public.coupons add constraint coupons_pkey PRIMARY KEY (id);
alter table public.custom_missions add constraint custom_missions_pkey PRIMARY KEY (id);
alter table public.customer_aliases add constraint customer_aliases_pkey PRIMARY KEY (venue_id, alias);
alter table public.customer_profiles add constraint customer_profiles_pkey PRIMARY KEY (id);
alter table public.dealer_applications add constraint dealer_applications_pkey PRIMARY KEY (id);
alter table public.dealer_posts add constraint dealer_posts_pkey PRIMARY KEY (id);
alter table public.dealer_shifts add constraint dealer_shifts_pkey PRIMARY KEY (id);
alter table public.game_presets add constraint game_presets_pkey PRIMARY KEY (id);
alter table public.group_members add constraint group_members_pkey PRIMARY KEY (id);
alter table public.group_messages add constraint group_messages_pkey PRIMARY KEY (id);
alter table public.group_posts add constraint group_posts_pkey PRIMARY KEY (id);
alter table public.league_entries add constraint league_entries_pkey PRIMARY KEY (id);
alter table public.league_event_status add constraint league_event_status_pkey PRIMARY KEY (league_id, venue_id);
alter table public.league_members add constraint league_members_pkey PRIMARY KEY (id);
alter table public.leagues add constraint leagues_pkey PRIMARY KEY (id);
alter table public.ledger_access add constraint ledger_access_pkey PRIMARY KEY (venue_id, user_id);
alter table public.ledger_buyin_requests add constraint ledger_buyin_requests_pkey PRIMARY KEY (id);
alter table public.ledger_buyins add constraint ledger_buyins_pkey PRIMARY KEY (id);
alter table public.ledger_players add constraint ledger_players_pkey PRIMARY KEY (id);
alter table public.ledger_sessions add constraint ledger_sessions_pkey PRIMARY KEY (venue_id, session_date, game_seq);
alter table public.listing_message_reads add constraint listing_message_reads_pkey PRIMARY KEY (listing_id, buyer_id, reader_id);
alter table public.listing_messages add constraint listing_messages_pkey PRIMARY KEY (id);
alter table public.live_wall add constraint live_wall_pkey PRIMARY KEY (id);
alter table public.marketplace_listings add constraint marketplace_listings_pkey PRIMARY KEY (id);
alter table public.marketplace_notices add constraint marketplace_notices_pkey PRIMARY KEY (id);
alter table public.mission_claims add constraint mission_claims_pkey PRIMARY KEY (user_id, mission_key, week_start);
alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);
alter table public.owner_posts add constraint owner_posts_pkey PRIMARY KEY (id);
alter table public.post_likes add constraint post_likes_pkey PRIMARY KEY (post_id, user_id);
alter table public.post_reactions add constraint post_reactions_pkey PRIMARY KEY (post_id, user_id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.push_subscriptions add constraint push_subscriptions_pkey PRIMARY KEY (id);
alter table public.rank_verifications add constraint rank_verifications_pkey PRIMARY KEY (id);
alter table public.ranking_point_awards add constraint ranking_point_awards_pkey PRIMARY KEY (venue_id, ranking_date, event_name, user_id);
alter table public.referrals add constraint referrals_pkey PRIMARY KEY (referee_id);
alter table public.reports add constraint reports_pkey PRIMARY KEY (id);
alter table public.schedule_reservations add constraint schedule_reservations_pkey PRIMARY KEY (id);
alter table public.schedules add constraint schedules_pkey PRIMARY KEY (id);
alter table public.staff_schedule add constraint staff_schedule_pkey PRIMARY KEY (id);
alter table public.staff_wage add constraint staff_wage_pkey PRIMARY KEY (venue_id, staff_name);
alter table public.store_vouchers add constraint store_vouchers_pkey PRIMARY KEY (id);
alter table public.support_inquiries add constraint support_inquiries_pkey PRIMARY KEY (id);
alter table public.user_blocks add constraint user_blocks_pkey PRIMARY KEY (blocker_id, blocked_id);
alter table public.venue_announcements add constraint venue_announcements_pkey PRIMARY KEY (id);
alter table public.venue_follows add constraint venue_follows_pkey PRIMARY KEY (user_id, venue_id);
alter table public.venue_kill_switch add constraint venue_kill_switch_pkey PRIMARY KEY (venue_id);
alter table public.venue_messages add constraint venue_messages_pkey PRIMARY KEY (id);
alter table public.venue_notices add constraint venue_notices_pkey PRIMARY KEY (id);
alter table public.venue_owners add constraint venue_owners_pkey PRIMARY KEY (venue_id, user_id);
alter table public.venue_pos_settings add constraint venue_pos_settings_pkey PRIMARY KEY (venue_id);
alter table public.venue_rankings add constraint venue_rankings_pkey PRIMARY KEY (id);
alter table public.venue_reviews add constraint venue_reviews_pkey PRIMARY KEY (id);
alter table public.venue_score_entries add constraint venue_score_entries_pkey PRIMARY KEY (id);
alter table public.venue_season_results add constraint venue_season_results_pkey PRIMARY KEY (season_id, rank);
alter table public.venue_seasons add constraint venue_seasons_pkey PRIMARY KEY (id);
alter table public.venue_staff add constraint venue_staff_pkey PRIMARY KEY (id);
alter table public.venue_staff_invites add constraint venue_staff_invites_pkey PRIMARY KEY (id);
alter table public.venues add constraint venues_pkey PRIMARY KEY (id);
alter table public.voucher_access add constraint voucher_access_pkey PRIMARY KEY (venue_id, user_id);
alter table public.voucher_credit_requests add constraint voucher_credit_requests_pkey PRIMARY KEY (id);
alter table public.voucher_transfers add constraint voucher_transfers_pkey PRIMARY KEY (id);
alter table public.waitlist add constraint waitlist_pkey PRIMARY KEY (id);

-- 4-2. UNIQUE (11)

alter table public.customer_profiles add constraint customer_profiles_venue_id_name_key UNIQUE (venue_id, name);
alter table public.group_members add constraint group_members_group_id_user_id_key UNIQUE (group_id, user_id);
alter table public.league_members add constraint league_members_league_id_venue_id_key UNIQUE (league_id, venue_id);
alter table public.ledger_buyins add constraint ledger_buyins_venue_date_game_player_entry_key UNIQUE (venue_id, session_date, game_seq, player_name, entry_no);
alter table public.ledger_players add constraint ledger_players_venue_date_game_name_key UNIQUE (venue_id, session_date, game_seq, name);
alter table public.profiles add constraint profiles_email_key UNIQUE (email);
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_key UNIQUE (endpoint);
alter table public.schedule_reservations add constraint schedule_reservations_schedule_id_user_id_key UNIQUE (schedule_id, user_id);
alter table public.staff_schedule add constraint staff_schedule_venue_id_work_date_staff_name_key UNIQUE (venue_id, work_date, staff_name);
alter table public.venue_reviews add constraint venue_reviews_venue_id_user_id_key UNIQUE (venue_id, user_id);
alter table public.venue_staff_invites add constraint venue_staff_invites_venue_id_user_id_key UNIQUE (venue_id, user_id);

-- 4-3. CHECK (25)

alter table public.comments add constraint comment_target_check CHECK ((((((schedule_id IS NOT NULL))::integer + ((venue_id IS NOT NULL))::integer) + ((post_id IS NOT NULL))::integer) = 1));
alter table public.comments add constraint comments_content_check CHECK (((char_length(content) >= 1) AND (char_length(content) <= 1000)));
alter table public.community_ads add constraint community_ads_slot_check CHECK (((slot >= 1) AND (slot <= 5)));
alter table public.community_posts add constraint community_posts_content_len CHECK (((char_length(content) >= 1) AND (char_length(content) <= 4000)));
alter table public.custom_missions add constraint custom_missions_goal_check CHECK (((goal >= 1) AND (goal <= 50)));
alter table public.custom_missions add constraint custom_missions_goal_type_check CHECK ((goal_type = ANY (ARRAY['checkin'::text, 'post'::text, 'moneyin'::text])));
alter table public.custom_missions add constraint custom_missions_reward_check CHECK (((reward >= 1) AND (reward <= 500)));
alter table public.dealer_posts add constraint dealer_posts_kind_check CHECK ((kind = ANY (ARRAY['hiring'::text, 'seeking'::text, 'general'::text])));
alter table public.league_members add constraint league_members_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text])));
alter table public.ledger_buyin_requests add constraint ledger_buyin_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table public.listing_messages add constraint listing_messages_content_check CHECK (((char_length(TRIM(BOTH FROM content)) >= 1) AND (char_length(TRIM(BOTH FROM content)) <= 1000)));
alter table public.live_wall add constraint live_wall_content_check CHECK (((char_length(TRIM(BOTH FROM content)) >= 1) AND (char_length(TRIM(BOTH FROM content)) <= 140)));
alter table public.marketplace_listings add constraint marketplace_listings_description_check CHECK (((char_length(description) >= 1) AND (char_length(description) <= 3000)));
alter table public.marketplace_listings add constraint marketplace_listings_price_check CHECK ((price >= 0));
alter table public.marketplace_listings add constraint marketplace_listings_title_check CHECK (((char_length(title) >= 2) AND (char_length(title) <= 100)));
alter table public.owner_posts add constraint owner_posts_content_check CHECK (((char_length(TRIM(BOTH FROM content)) >= 1) AND (char_length(TRIM(BOTH FROM content)) <= 2000)));
alter table public.post_reactions add constraint post_reactions_type_check CHECK ((type = ANY (ARRAY['badbeat'::text, 'goodrun'::text])));
alter table public.rank_verifications add constraint rank_verifications_amount_won_check CHECK ((amount_won >= 0));
alter table public.rank_verifications add constraint rank_verifications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table public.referrals add constraint referrals_no_self CHECK ((referrer_id <> referee_id));
alter table public.venue_reviews add constraint venue_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
alter table public.venue_seasons add constraint venue_seasons_status_check CHECK ((status = ANY (ARRAY['active'::text, 'ended'::text])));
alter table public.venue_staff_invites add constraint venue_staff_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text])));
alter table public.voucher_credit_requests add constraint voucher_credit_requests_amount_check CHECK (((amount > 0) AND (amount <= 100000)));
alter table public.voucher_credit_requests add constraint voucher_credit_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));

-- 4-4. FOREIGN KEY (107)

alter table public.checkins add constraint checkins_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.checkins add constraint checkins_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.clock_presets add constraint clock_presets_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.clock_states add constraint clock_states_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.comments add constraint comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE;
alter table public.comments add constraint comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;
alter table public.comments add constraint comments_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE;
alter table public.comments add constraint comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.comments add constraint comments_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.community_posts add constraint community_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.consent_logs add constraint consent_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.customer_aliases add constraint customer_aliases_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.customer_aliases add constraint customer_aliases_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.customer_profiles add constraint customer_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.dealer_applications add constraint dealer_applications_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.dealer_applications add constraint dealer_applications_post_id_fkey FOREIGN KEY (post_id) REFERENCES dealer_posts(id) ON DELETE CASCADE;
alter table public.dealer_posts add constraint dealer_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.game_presets add constraint game_presets_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.group_members add constraint group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.group_members add constraint group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.group_messages add constraint group_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.group_messages add constraint group_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.group_posts add constraint group_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.group_posts add constraint group_posts_group_id_fkey FOREIGN KEY (group_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.league_entries add constraint league_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.league_entries add constraint league_entries_league_id_fkey FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE;
alter table public.league_entries add constraint league_entries_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.league_event_status add constraint league_event_status_league_id_fkey FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE;
alter table public.league_event_status add constraint league_event_status_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.league_members add constraint league_members_league_id_fkey FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE;
alter table public.league_members add constraint league_members_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.leagues add constraint leagues_final_venue_id_fkey FOREIGN KEY (final_venue_id) REFERENCES venues(id) ON DELETE SET NULL;
alter table public.leagues add constraint leagues_owner_venue_id_fkey FOREIGN KEY (owner_venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.ledger_access add constraint ledger_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.ledger_access add constraint ledger_access_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.ledger_buyin_requests add constraint ledger_buyin_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.ledger_buyin_requests add constraint ledger_buyin_requests_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.ledger_buyins add constraint ledger_buyins_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.ledger_players add constraint ledger_players_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.ledger_sessions add constraint ledger_sessions_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.ledger_sessions add constraint ledger_sessions_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE SET NULL;
alter table public.ledger_sessions add constraint ledger_sessions_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.listing_messages add constraint listing_messages_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.listing_messages add constraint listing_messages_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id) ON DELETE CASCADE;
alter table public.listing_messages add constraint listing_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.live_wall add constraint live_wall_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.marketplace_listings add constraint marketplace_listings_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.owner_posts add constraint owner_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.post_likes add constraint post_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;
alter table public.post_likes add constraint post_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.post_reactions add constraint post_reactions_post_id_fkey FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;
alter table public.post_reactions add constraint post_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_venue_fk FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL;
alter table public.push_subscriptions add constraint push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.rank_verifications add constraint rank_verifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.ranking_point_awards add constraint ranking_point_awards_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.ranking_point_awards add constraint ranking_point_awards_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.referrals add constraint referrals_referee_id_fkey FOREIGN KEY (referee_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.referrals add constraint referrals_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.reports add constraint reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.schedule_reservations add constraint schedule_reservations_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE;
alter table public.schedules add constraint schedules_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.schedules add constraint schedules_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.staff_schedule add constraint staff_schedule_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.staff_wage add constraint staff_wage_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.store_vouchers add constraint store_vouchers_holder_user_id_fkey FOREIGN KEY (holder_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.store_vouchers add constraint store_vouchers_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES profiles(id);
alter table public.store_vouchers add constraint store_vouchers_used_venue_id_fkey FOREIGN KEY (used_venue_id) REFERENCES venues(id) ON DELETE SET NULL;
alter table public.store_vouchers add constraint store_vouchers_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.support_inquiries add constraint support_inquiries_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.user_blocks add constraint user_blocks_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.user_blocks add constraint user_blocks_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.venue_announcements add constraint venue_announcements_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.venue_announcements add constraint venue_announcements_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.venue_follows add constraint venue_follows_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.venue_follows add constraint venue_follows_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.venue_kill_switch add constraint venue_kill_switch_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.venue_messages add constraint venue_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.venue_messages add constraint venue_messages_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.venue_notices add constraint venue_notices_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.venue_owners add constraint venue_owners_added_by_fkey FOREIGN KEY (added_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.venue_owners add constraint venue_owners_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.venue_owners add constraint venue_owners_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.venue_pos_settings add constraint venue_pos_settings_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.venue_rankings add constraint venue_rankings_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.venue_rankings add constraint venue_rankings_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.venue_reviews add constraint venue_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.venue_reviews add constraint venue_reviews_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.venue_score_entries add constraint venue_score_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.venue_score_entries add constraint venue_score_entries_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.venue_season_results add constraint venue_season_results_season_id_fkey FOREIGN KEY (season_id) REFERENCES venue_seasons(id) ON DELETE CASCADE;
alter table public.venue_seasons add constraint venue_seasons_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.venue_staff add constraint venue_staff_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.venue_staff add constraint venue_staff_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.venue_staff_invites add constraint venue_staff_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);
alter table public.venue_staff_invites add constraint venue_staff_invites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.venue_staff_invites add constraint venue_staff_invites_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.venues add constraint venues_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.voucher_access add constraint voucher_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.voucher_access add constraint voucher_access_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.voucher_credit_requests add constraint voucher_credit_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.voucher_credit_requests add constraint voucher_credit_requests_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;
alter table public.voucher_transfers add constraint voucher_transfers_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES profiles(id);
alter table public.voucher_transfers add constraint voucher_transfers_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES profiles(id);
alter table public.voucher_transfers add constraint voucher_transfers_voucher_id_fkey FOREIGN KEY (voucher_id) REFERENCES store_vouchers(id) ON DELETE CASCADE;

-- ============================================================
-- 5. RLS enable — 전 테이블 73개 모두 relrowsecurity=true (force 없음)
-- ============================================================

alter table public.activity_log enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_log enable row level security;
alter table public.checkins enable row level security;
alter table public.client_errors enable row level security;
alter table public.clock_presets enable row level security;
alter table public.clock_states enable row level security;
alter table public.comments enable row level security;
alter table public.community_ads enable row level security;
alter table public.community_posts enable row level security;
alter table public.consent_logs enable row level security;
alter table public.coupons enable row level security;
alter table public.custom_missions enable row level security;
alter table public.customer_aliases enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.dealer_applications enable row level security;
alter table public.dealer_posts enable row level security;
alter table public.dealer_shifts enable row level security;
alter table public.game_presets enable row level security;
alter table public.group_members enable row level security;
alter table public.group_messages enable row level security;
alter table public.group_posts enable row level security;
alter table public.league_entries enable row level security;
alter table public.league_event_status enable row level security;
alter table public.league_members enable row level security;
alter table public.leagues enable row level security;
alter table public.ledger_access enable row level security;
alter table public.ledger_buyin_requests enable row level security;
alter table public.ledger_buyins enable row level security;
alter table public.ledger_players enable row level security;
alter table public.ledger_sessions enable row level security;
alter table public.listing_message_reads enable row level security;
alter table public.listing_messages enable row level security;
alter table public.live_wall enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.marketplace_notices enable row level security;
alter table public.mission_claims enable row level security;
alter table public.notifications enable row level security;
alter table public.owner_posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_reactions enable row level security;
alter table public.profiles enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.rank_verifications enable row level security;
alter table public.ranking_point_awards enable row level security;
alter table public.referrals enable row level security;
alter table public.reports enable row level security;
alter table public.schedule_reservations enable row level security;
alter table public.schedules enable row level security;
alter table public.staff_schedule enable row level security;
alter table public.staff_wage enable row level security;
alter table public.store_vouchers enable row level security;
alter table public.support_inquiries enable row level security;
alter table public.user_blocks enable row level security;
alter table public.venue_announcements enable row level security;
alter table public.venue_follows enable row level security;
alter table public.venue_kill_switch enable row level security;
alter table public.venue_messages enable row level security;
alter table public.venue_notices enable row level security;
alter table public.venue_owners enable row level security;
alter table public.venue_pos_settings enable row level security;
alter table public.venue_rankings enable row level security;
alter table public.venue_reviews enable row level security;
alter table public.venue_score_entries enable row level security;
alter table public.venue_season_results enable row level security;
alter table public.venue_seasons enable row level security;
alter table public.venue_staff enable row level security;
alter table public.venue_staff_invites enable row level security;
alter table public.venues enable row level security;
alter table public.voucher_access enable row level security;
alter table public.voucher_credit_requests enable row level security;
alter table public.voucher_transfers enable row level security;
alter table public.waitlist enable row level security;

-- ============================================================
-- 6. 인덱스 (87) — PK/UNIQUE 제약 자동생성 인덱스 제외
-- ============================================================

CREATE INDEX idx_activity_log_actor ON public.activity_log USING btree (actor_id, created_at DESC);
CREATE INDEX idx_activity_log_owner ON public.activity_log USING btree (target_owner_id, created_at DESC);
CREATE INDEX checkins_venue_idx ON public.checkins USING btree (venue_id, created_at DESC);
CREATE INDEX idx_checkins_user_id ON public.checkins USING btree (user_id);
CREATE INDEX client_errors_created_idx ON public.client_errors USING btree (created_at);
CREATE INDEX clock_presets_venue_idx ON public.clock_presets USING btree (venue_id);
CREATE INDEX idx_comments_parent ON public.comments USING btree (parent_id);
CREATE INDEX idx_comments_post ON public.comments USING btree (post_id);
CREATE INDEX idx_comments_schedule ON public.comments USING btree (schedule_id);
CREATE INDEX idx_comments_user_id ON public.comments USING btree (user_id);
CREATE INDEX idx_comments_venue ON public.comments USING btree (venue_id);
CREATE INDEX idx_posts_created ON public.community_posts USING btree (created_at DESC);
CREATE INDEX idx_posts_user_id ON public.community_posts USING btree (user_id);
CREATE INDEX consent_logs_user_idx ON public.consent_logs USING btree (user_id, created_at);
CREATE UNIQUE INDEX customer_profiles_venue_user_idx ON public.customer_profiles USING btree (venue_id, user_id) WHERE (user_id IS NOT NULL);
CREATE INDEX idx_dealer_app_post ON public.dealer_applications USING btree (post_id);
CREATE INDEX dealer_posts_created_idx ON public.dealer_posts USING btree (created_at DESC);
CREATE INDEX game_presets_venue_idx ON public.game_presets USING btree (venue_id, updated_at DESC);
CREATE INDEX idx_gm_group ON public.group_members USING btree (group_id);
CREATE INDEX idx_gm_user ON public.group_members USING btree (user_id);
CREATE INDEX idx_gmsg_group ON public.group_messages USING btree (group_id, created_at);
CREATE INDEX idx_group_messages_user_id ON public.group_messages USING btree (user_id);
CREATE INDEX idx_gpost_group ON public.group_posts USING btree (group_id, created_at);
CREATE INDEX idx_league_entries ON public.league_entries USING btree (league_id, entry_date DESC);
CREATE INDEX idx_ledger_access_user_venue ON public.ledger_access USING btree (user_id, venue_id);
CREATE INDEX idx_lbr_user_id ON public.ledger_buyin_requests USING btree (user_id);
CREATE UNIQUE INDEX ledger_buyin_req_uniq_pending ON public.ledger_buyin_requests USING btree (venue_id, session_date, user_id) WHERE (status = 'pending'::text);
CREATE INDEX ledger_buyin_req_venue_date ON public.ledger_buyin_requests USING btree (venue_id, session_date, status);
CREATE UNIQUE INDEX uniq_ledger_req_voucher ON public.ledger_buyin_requests USING btree (voucher_id) WHERE (voucher_id IS NOT NULL);
CREATE INDEX idx_ledger_buyins_v_d ON public.ledger_buyins USING btree (venue_id, session_date);
CREATE INDEX idx_ledger_sessions_schedule_id ON public.ledger_sessions USING btree (schedule_id);
CREATE INDEX idx_ledger_sessions_v_d ON public.ledger_sessions USING btree (venue_id, session_date);
CREATE INDEX idx_listing_messages_buyer_id ON public.listing_messages USING btree (buyer_id);
CREATE INDEX idx_listing_messages_sender_id ON public.listing_messages USING btree (sender_id);
CREATE INDEX idx_lm_thread ON public.listing_messages USING btree (listing_id, buyer_id, created_at);
CREATE INDEX idx_live_wall_created ON public.live_wall USING btree (created_at DESC);
CREATE INDEX idx_live_wall_user_id ON public.live_wall USING btree (user_id);
CREATE INDEX idx_listings_category ON public.marketplace_listings USING btree (category);
CREATE INDEX idx_listings_created ON public.marketplace_listings USING btree (created_at DESC);
CREATE INDEX idx_listings_seller ON public.marketplace_listings USING btree (seller_id);
CREATE INDEX idx_listings_status ON public.marketplace_listings USING btree (status);
CREATE INDEX idx_listings_title_trgm ON public.marketplace_listings USING gin (title gin_trgm_ops);
CREATE INDEX idx_notif_user ON public.notifications USING btree (user_id, created_at DESC);
CREATE INDEX idx_owner_posts_created ON public.owner_posts USING btree (created_at DESC);
CREATE INDEX post_likes_user_idx ON public.post_likes USING btree (user_id);
CREATE UNIQUE INDEX profiles_ci_unique ON public.profiles USING btree (ci);
CREATE INDEX profiles_name_trgm ON public.profiles USING gin (name gin_trgm_ops);
CREATE UNIQUE INDEX profiles_nickname_lower_uidx ON public.profiles USING btree (lower(nickname)) WHERE ((nickname IS NOT NULL) AND (btrim(nickname) <> ''::text));
CREATE INDEX profiles_nickname_trgm ON public.profiles USING gin (nickname gin_trgm_ops);
CREATE INDEX profiles_real_name_trgm ON public.profiles USING gin (real_name gin_trgm_ops);
CREATE UNIQUE INDEX uniq_profiles_ci ON public.profiles USING btree (ci) WHERE (ci IS NOT NULL);
CREATE UNIQUE INDEX uniq_profiles_nickname_ci ON public.profiles USING btree (lower(TRIM(BOTH FROM nickname))) WHERE (nickname IS NOT NULL);
CREATE INDEX idx_push_user ON public.push_subscriptions USING btree (user_id);
CREATE INDEX idx_rank_verifications_user_id ON public.rank_verifications USING btree (user_id);
CREATE INDEX idx_rpa_user_id ON public.ranking_point_awards USING btree (user_id);
CREATE INDEX referrals_referrer_idx ON public.referrals USING btree (referrer_id);
CREATE INDEX idx_reports_status ON public.reports USING btree (status, created_at DESC);
CREATE INDEX sr_schedule_idx ON public.schedule_reservations USING btree (schedule_id);
CREATE INDEX idx_schedules_date ON public.schedules USING btree (date);
CREATE INDEX idx_schedules_display_ord ON public.schedules USING btree (display_order);
CREATE INDEX idx_schedules_owner_id ON public.schedules USING btree (owner_id);
CREATE INDEX idx_schedules_title_trgm ON public.schedules USING gin (title gin_trgm_ops);
CREATE INDEX idx_schedules_venue_id ON public.schedules USING btree (venue_id);
CREATE INDEX staff_sched_venue_date_idx ON public.staff_schedule USING btree (venue_id, work_date);
CREATE INDEX store_vouchers_holder_idx ON public.store_vouchers USING btree (holder_user_id);
CREATE INDEX store_vouchers_used_venue_idx ON public.store_vouchers USING btree (used_venue_id);
CREATE INDEX store_vouchers_venue_idx ON public.store_vouchers USING btree (venue_id);
CREATE INDEX support_inquiries_status_idx ON public.support_inquiries USING btree (status, created_at DESC);
CREATE INDEX support_inquiries_user_idx ON public.support_inquiries USING btree (user_id, created_at DESC);
CREATE INDEX venue_announcements_venue_idx ON public.venue_announcements USING btree (venue_id, sent_at DESC);
CREATE INDEX idx_venue_follows_venue ON public.venue_follows USING btree (venue_id);
CREATE INDEX idx_venue_messages_user_id ON public.venue_messages USING btree (user_id);
CREATE INDEX idx_vmsg_venue ON public.venue_messages USING btree (venue_id, created_at DESC);
CREATE INDEX venue_notices_venue_idx ON public.venue_notices USING btree (venue_id, created_at DESC);
CREATE INDEX idx_vr_venue_date ON public.venue_rankings USING btree (venue_id, ranking_date, "position");
CREATE INDEX idx_venue_reviews_user_id ON public.venue_reviews USING btree (user_id);
CREATE INDEX idx_venue_reviews_venue ON public.venue_reviews USING btree (venue_id, created_at DESC);
CREATE INDEX idx_vse_venue ON public.venue_score_entries USING btree (venue_id, entry_date DESC);
CREATE UNIQUE INDEX venue_seasons_one_active ON public.venue_seasons USING btree (venue_id) WHERE (status = 'active'::text);
CREATE INDEX venue_seasons_venue_idx ON public.venue_seasons USING btree (venue_id, created_at DESC);
CREATE INDEX idx_venue_staff_venue ON public.venue_staff USING btree (venue_id);
CREATE INDEX idx_venues_display_order ON public.venues USING btree (display_order);
CREATE INDEX idx_venues_owner_id ON public.venues USING btree (owner_id);
CREATE INDEX idx_venues_region ON public.venues USING btree (region);
CREATE INDEX idx_venues_status ON public.venues USING btree (status);
CREATE UNIQUE INDEX venues_slug_unique ON public.venues USING btree (lower(slug)) WHERE (slug IS NOT NULL);
CREATE INDEX idx_voucher_access_user_id ON public.voucher_access USING btree (user_id);

-- ============================================================
-- 7. 함수 (182, 확장 소속 제외) — SECURITY DEFINER 다수.
--    ⚠️ create or replace 재실행 시 기존 ACL(anon revoke 등) 이 보존되지 않을 수 있음.
-- ============================================================

CREATE OR REPLACE FUNCTION public._audit(p_action text, p_target text, p_meta jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  insert into public.audit_log(actor_id, action, target, meta) values (auth.uid(), p_action, p_target, p_meta);
$function$
;

CREATE OR REPLACE FUNCTION public._end_season_internal(p_season_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_venue uuid; r record; n int := 0; pts int;
begin
  select venue_id into v_venue from public.venue_seasons where id=p_season_id and status='active';
  if v_venue is null then return 0; end if;
  insert into public.venue_season_results (season_id, rank, nickname, real_name, points, prize_man, appearances, best_position)
    select p_season_id, rank, nickname, real_name, points, prize_man, appearances, best_position
    from public.current_season_standings(v_venue);
  get diagnostics n = row_count;
  for r in select rank, nickname from public.venue_season_results where season_id=p_season_id and rank<=3 loop
    pts := case r.rank when 1 then 1000 when 2 then 500 else 300 end;
    update public.profiles set activity_points = coalesce(activity_points,0) + pts where lower(nickname)=lower(r.nickname);
    insert into public.notifications (user_id, type, title, message, link)
      select id, 'system', '🏆 시즌 보상', '시즌 '||r.rank||'위 달성! 활동점수 +'||pts||'점', '/'
      from public.profiles where lower(nickname)=lower(r.nickname);
  end loop;
  update public.venue_seasons set status='ended', ended_at=now() where id=p_season_id;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public._grant_referral_reward(p_referee uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.referrals;
begin
  select * into r from public.referrals where referee_id = p_referee and rewarded_at is null;
  if not found then return; end if;
  if not exists (select 1 from public.profiles where id = p_referee and verified_at is not null) then return; end if;
  update public.profiles set activity_points = coalesce(activity_points,0) + 300 where id = r.referee_id;
  update public.profiles set activity_points = coalesce(activity_points,0) + 500 where id = r.referrer_id;
  update public.referrals set rewarded_at = now() where referee_id = p_referee;
  insert into public.notifications (user_id, type, title, message, link) values
    (r.referrer_id, 'system', '🎉 친구 초대 보상', '초대한 친구가 본인인증을 완료해 활동점수 +500점!', '/'),
    (r.referee_id,  'system', '🎉 추천 가입 보상', '추천 가입 + 본인인증 완료로 활동점수 +300점!', '/');
end $function$
;

CREATE OR REPLACE FUNCTION public._notify_buyin_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cnt int; v_msg text;
begin
  select count(*) into v_cnt from ledger_buyin_requests where venue_id = NEW.venue_id and session_date = NEW.session_date and status = 'pending';
  v_msg := '🙋 손님 참가(바인) 요청 ' || v_cnt || '건 대기';
  update notifications set message = v_msg, created_at = now()
   where link = '/my-store/ledger' and title = '🙋 손님 바인 요청' and read = false and created_at > now() - interval '30 minutes'
     and user_id in (
       select pr.id from profiles pr where coalesce(pr.mute_venue_notify, false) = false and (
         exists (select 1 from venues v where v.id = NEW.venue_id and v.owner_id = pr.id)
         or exists (select 1 from venue_owners vo where vo.venue_id = NEW.venue_id and vo.user_id = pr.id and vo.status = 'approved')
         or exists (select 1 from ledger_access la where la.venue_id = NEW.venue_id and la.user_id = pr.id)));
  insert into notifications (user_id, type, title, message, link, read)
  select pr.id, 'system', '🙋 손님 바인 요청', v_msg, '/my-store/ledger', false
  from profiles pr where coalesce(pr.mute_venue_notify, false) = false and (
    exists (select 1 from venues v where v.id = NEW.venue_id and v.owner_id = pr.id)
    or exists (select 1 from venue_owners vo where vo.venue_id = NEW.venue_id and vo.user_id = pr.id and vo.status = 'approved')
    or exists (select 1 from ledger_access la where la.venue_id = NEW.venue_id and la.user_id = pr.id))
   and not exists (select 1 from notifications n where n.user_id = pr.id and n.link = '/my-store/ledger' and n.title = '🙋 손님 바인 요청' and n.read = false and n.created_at > now() - interval '30 minutes');
  return NEW;
end; $function$
;

CREATE OR REPLACE FUNCTION public._notify_level_up()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ol int; nl int;
begin
  ol := public._tier_level(coalesce(old.activity_points,0));
  nl := public._tier_level(coalesce(new.activity_points,0));
  if nl > ol then
    insert into public.notifications (user_id, type, title, message, link)
      values (new.id, 'system', '🎉 레벨 업!', 'Lv '||nl||' · '||public._tier_title(nl)||' 달성! 활동점수 '||new.activity_points||'점', '/');
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._referral_reward_on_verify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.ci is not null and (OLD.ci is null or OLD.ci is distinct from NEW.ci) then
    perform public._grant_referral_reward(NEW.id);
  end if;
  return NEW;
end $function$
;

CREATE OR REPLACE FUNCTION public._tier_level(p integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when p >= 14000 then 12 when p >= 10000 then 11 when p >= 7000 then 10
    when p >= 4000 then 9 when p >= 2500 then 8 when p >= 1200 then 7
    when p >= 600 then 6 when p >= 300 then 5 when p >= 150 then 4
    when p >= 60 then 3 when p >= 20 then 2 else 1 end;
$function$
;

CREATE OR REPLACE FUNCTION public._tier_title(lvl integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select (array['홀덤 입문','뉴비','루키','레귤러','그라인더','세미프로','프로','하이롤러','샤크','레전드','챔피언','홀덤 마스터'])[greatest(1,least(12,lvl))];
$function$
;

CREATE OR REPLACE FUNCTION public._voucher_used_checkin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'used' and (old.status is distinct from 'used') and new.holder_user_id is not null then
    if not exists (
      select 1 from public.checkins
      where venue_id = coalesce(new.used_venue_id, new.venue_id) and user_id = new.holder_user_id
        and created_at > now() - interval '4 hours'
    ) then
      insert into public.checkins(venue_id, user_id, display_name)
      values (coalesce(new.used_venue_id, new.venue_id), new.holder_user_id,
              (select coalesce(nickname, name) from public.profiles where id = new.holder_user_id));
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.accrue_voucher(p_venue_id uuid, p_player_name text, p_count integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_count int; v_uid uuid; v_name text;
begin
  if not can_access_ledger(p_venue_id) then raise exception '권한이 없습니다'; end if;
  if not coalesce((select voucher_issue_approved from public.venues where id = p_venue_id), false) then
    raise exception '운영자 승인 후 적립할 수 있습니다';
  end if;
  v_name := btrim(coalesce(p_player_name, ''));
  if v_name = '' then return 0; end if;
  v_count := least(greatest(coalesce(p_count, 1), 1), 1000);
  select p.id into v_uid from public.profiles p
   where coalesce(p.status::text, 'active') = 'active'
     and (lower(btrim(p.nickname)) = lower(v_name) or btrim(p.real_name) = v_name or btrim(p.name) = v_name)
   order by (lower(btrim(p.nickname)) = lower(v_name)) desc
   limit 1;
  insert into public.store_vouchers(venue_id, issued_by, holder_user_id, holder_name, title)
  select p_venue_id, auth.uid(), v_uid, v_name, '적립 이용권'
  from generate_series(1, v_count);
  return v_count;
end $function$
;

CREATE OR REPLACE FUNCTION public.add_venue_owner(p_venue_id uuid, p_nickname text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid;
begin
  if not can_manage_pos(p_venue_id) then raise exception '이 매장의 업주만 공동 사장을 초대할 수 있습니다'; end if;
  select id into v_uid from public.profiles where lower(trim(nickname)) = lower(trim(p_nickname)) limit 1;
  if v_uid is null then raise exception '해당 아이디(닉네임)의 회원이 없습니다'; end if;
  if exists (select 1 from public.venue_owners where venue_id = p_venue_id and user_id = v_uid and status = 'approved') then
    raise exception '이미 이 매장의 공동 사장입니다';
  end if;
  insert into public.venue_owners(venue_id, user_id, added_by, status)
    values (p_venue_id, v_uid, auth.uid(), 'pending')
    on conflict (venue_id, user_id) do update set status = 'pending', added_by = excluded.added_by;
end $function$
;

CREATE OR REPLACE FUNCTION public.add_venue_staff(p_venue_id uuid, p_login text, p_name text DEFAULT ''::text, p_position text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid; v_name text; v_id uuid;
begin
  if not can_manage_venue_staff(p_venue_id) then raise exception '권한이 없습니다'; end if;
  if coalesce(btrim(p_login),'') = '' then raise exception '직원 아이디를 입력해 주세요'; end if;

  select id, coalesce(nickname, name)
    into v_uid, v_name
  from public.profiles
  where lower(nickname) = lower(btrim(p_login)) or lower(email) = lower(btrim(p_login))
  limit 1;

  v_name := coalesce(nullif(btrim(p_name), ''), v_name, btrim(p_login));

  insert into public.venue_staff (venue_id, user_id, staff_login, staff_name, staff_position)
  values (p_venue_id, v_uid, btrim(p_login), v_name, nullif(btrim(p_position), ''))
  returning id into v_id;
  return v_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.admin_create_venue(p_name text, p_region text, p_address text DEFAULT ''::text, p_owner_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if my_role() <> 'admin'::user_role then
    raise exception '관리자만 매장을 생성할 수 있습니다';
  end if;
  if coalesce(btrim(p_name),'') = '' or coalesce(btrim(p_region),'') = '' then
    raise exception '매장명과 지역은 필수입니다';
  end if;

  insert into public.venues (name, region, address, owner_id, approved, verification_status)
  values (btrim(p_name), btrim(p_region), coalesce(p_address,''), p_owner_id, true,
          case when p_owner_id is not null then 'verified'::venue_verification_status else 'unverified'::venue_verification_status end)
  returning id into v_id;

  -- 관리 업주 임명: 해당 회원을 업주로 전환 + 매장 연결 + 승인
  if p_owner_id is not null then
    update public.profiles
       set role = 'venue_owner'::user_role, venue_id = v_id, approved = true
     where id = p_owner_id;
  end if;

  return v_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.admin_decide_venue_owner(p_venue_id uuid, p_user_id uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if my_role() <> 'admin' then raise exception '운영자만 가능합니다'; end if;
  if p_approve then
    update public.venue_owners set status = 'approved' where venue_id = p_venue_id and user_id = p_user_id;
    update public.profiles set role = 'venue_owner', approved = true, venue_id = coalesce(venue_id, p_venue_id) where id = p_user_id;
  else
    delete from public.venue_owners where venue_id = p_venue_id and user_id = p_user_id and status = 'pending';
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_decide_voucher_credit(p_request_id uuid, p_approve boolean, p_admin_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record;
begin
  if my_role() <> 'admin' then raise exception '운영자만 가능합니다'; end if;
  select * into r from public.voucher_credit_requests where id = p_request_id and status = 'pending' for update;
  if not found then raise exception '대기 중인 요청이 아닙니다'; end if;
  update public.voucher_credit_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        admin_note = nullif(btrim(coalesce(p_admin_note,'')), ''), decided_at = now()
    where id = p_request_id;
  if p_approve then
    update public.venues set voucher_quota = coalesce(voucher_quota,0) + r.amount, voucher_issue_approved = true where id = r.venue_id;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_grant_voucher_quota(p_venue_id uuid, p_amount integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare q int;
begin
  if my_role() <> 'admin' then raise exception '운영자만 가능합니다'; end if;
  update public.venues set voucher_quota = greatest(0, coalesce(voucher_quota,0) + coalesce(p_amount,0)), voucher_issue_approved = true
    where id = p_venue_id returning voucher_quota into q;
  return coalesce(q, 0);
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_list_venue_owner_requests()
 RETURNS TABLE(venue_id uuid, venue_name text, user_id uuid, nickname text, name text, invited_by text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select vo.venue_id, v.name, vo.user_id, p.nickname, p.name,
         coalesce(ib.nickname, ib.name, ''), vo.created_at
  from public.venue_owners vo
  join public.venues v on v.id = vo.venue_id
  join public.profiles p on p.id = vo.user_id
  left join public.profiles ib on ib.id = vo.added_by
  where vo.status = 'pending' and my_role() = 'admin'
  order by vo.created_at asc;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_list_voucher_credit_requests()
 RETURNS TABLE(id uuid, venue_id uuid, venue_name text, amount integer, note text, requester text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.id, r.venue_id, v.name, r.amount, r.note,
         coalesce(p.nickname, p.name, ''), r.created_at
  from public.voucher_credit_requests r
  join public.venues v on v.id = r.venue_id
  left join public.profiles p on p.id = r.requested_by
  where r.status = 'pending' and my_role() = 'admin'
  order by r.created_at asc;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_platform_stats()
 RETURNS TABLE(users integer, new_users_7d integer, new_users_30d integer, venues integer, active_venues integer, schedules integer, upcoming_schedules integer, checkins_today integer, checkins_7d integer, referrals integer, referrals_rewarded integer, push_subs integer, announcements integer, posts_7d integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(public.my_role()::text,'') <> 'admin' then raise exception '권한이 없습니다'; end if;
  return query select
    (select count(*) from public.profiles)::int,
    (select count(*) from auth.users where created_at > now() - interval '7 days')::int,
    (select count(*) from auth.users where created_at > now() - interval '30 days')::int,
    (select count(*) from public.venues)::int,
    (select count(*) from public.venues where approved and status::text = 'active')::int,
    (select count(*) from public.schedules)::int,
    (select count(*) from public.schedules where approved and date >= (now() at time zone 'Asia/Seoul')::date)::int,
    (select count(*) from public.checkins where created_at >= (now() at time zone 'Asia/Seoul')::date)::int,
    (select count(*) from public.checkins where created_at > now() - interval '7 days')::int,
    (select count(*) from public.referrals)::int,
    (select count(*) from public.referrals where rewarded_at is not null)::int,
    (select count(*) from public.push_subscriptions)::int,
    (select count(*) from public.venue_announcements)::int,
    (select count(*) from public.community_posts where created_at > now() - interval '7 days')::int;
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_set_nickname(p_user_id uuid, p_nickname text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v text := nullif(btrim(p_nickname), '');
begin
  if my_role() <> 'admin'::user_role then raise exception '권한이 없습니다'; end if;
  if v is null then raise exception '닉네임을 입력하세요'; end if;
  if exists (select 1 from public.profiles where lower(nickname) = lower(v) and id <> p_user_id) then
    raise exception '이미 사용 중인 아이디(닉네임)입니다'; end if;
  update public.profiles set nickname = v, nickname_locked = true where id = p_user_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.admin_set_post_blinded(p_post_id uuid, p_blinded boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(public.my_role()::text,'') <> 'admin' then raise exception '운영자만 가능합니다'; end if;
  update public.community_posts set blinded = p_blinded where id = p_post_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.admin_update_venue(p_venue_id uuid, p_name text, p_region text, p_address text DEFAULT ''::text, p_owner_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_old_owner uuid;
begin
  if my_role() <> 'admin'::user_role then
    raise exception '관리자만 매장을 수정할 수 있습니다';
  end if;
  if coalesce(btrim(p_name),'') = '' or coalesce(btrim(p_region),'') = '' then
    raise exception '매장명과 지역은 필수입니다';
  end if;

  select owner_id into v_old_owner from public.venues where id = p_venue_id;

  update public.venues
     set name       = btrim(p_name),
         region     = btrim(p_region),
         address    = coalesce(p_address, ''),
         owner_id   = p_owner_id,
         updated_at = now()
   where id = p_venue_id;

  -- 업주 변경 처리(이전 업주 연결 해제 + 새 업주 임명)
  if p_owner_id is distinct from v_old_owner then
    if v_old_owner is not null then
      update public.profiles set venue_id = null
       where id = v_old_owner and venue_id = p_venue_id;
    end if;
    if p_owner_id is not null then
      update public.profiles
         set role = 'venue_owner'::user_role, venue_id = p_venue_id, approved = true
       where id = p_owner_id;
    end if;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_buyin_request(p_request_id uuid, p_game_seq smallint DEFAULT 1, p_record_buyin boolean DEFAULT false, p_pay_method text DEFAULT 'cash'::text, p_split boolean DEFAULT false, p_cash integer DEFAULT 0, p_card integer DEFAULT 0, p_transfer integer DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r ledger_buyin_requests; v_sort int; v_amt int; v_entry int; v_pm text := lower(coalesce(p_pay_method, 'cash'));
begin
  select * into r from ledger_buyin_requests where id = p_request_id;
  if not found then raise exception '요청을 찾을 수 없습니다'; end if;
  if not can_access_ledger(r.venue_id) then raise exception '권한이 없습니다'; end if;
  if r.status <> 'pending' then raise exception '이미 처리된 요청입니다'; end if;
  if r.voucher_id is not null then p_record_buyin := false; end if;  -- #9 이용권은 무료입장: 유료 바인 미기록
  if not exists (select 1 from ledger_players lp where lp.venue_id = r.venue_id and lp.session_date = r.session_date and lp.game_seq = p_game_seq and lp.name = r.player_name) then
    select coalesce(max(sort_order) + 1, 0) into v_sort from ledger_players where venue_id = r.venue_id and session_date = r.session_date and game_seq = p_game_seq;
    insert into ledger_players (venue_id, session_date, game_seq, name, sort_order, created_by) values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_sort, auth.uid());
  end if;
  if p_record_buyin then
    select coalesce(buyin_amount, 0) into v_amt from ledger_sessions where venue_id = r.venue_id and session_date = r.session_date and game_seq = p_game_seq;
    select coalesce(max(entry_no), 0) + 1 into v_entry from ledger_buyins where venue_id = r.venue_id and session_date = r.session_date and game_seq = p_game_seq and player_name = r.player_name;
    if p_split then
      v_pm := case when coalesce(p_card,0) >= coalesce(p_cash,0) and coalesce(p_card,0) >= coalesce(p_transfer,0) and coalesce(p_card,0) > 0 then 'card'
                   when coalesce(p_transfer,0) > coalesce(p_cash,0) and coalesce(p_transfer,0) > 0 then 'transfer' else 'cash' end;
      insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method, is_split, cash_amount, card_amount, transfer_amount, created_by)
      values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, v_pm, true, coalesce(p_cash,0), coalesce(p_card,0), coalesce(p_transfer,0), auth.uid());
    else
      if v_pm not in ('cash','card','transfer') then v_pm := 'cash'; end if;
      insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method, cash_amount, card_amount, transfer_amount, created_by)
      values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, v_pm,
              case when v_pm = 'cash' then coalesce(v_amt, 0) else 0 end,
              case when v_pm = 'card' then coalesce(v_amt, 0) else 0 end,
              case when v_pm = 'transfer' then coalesce(v_amt, 0) else 0 end, auth.uid());
    end if;
  end if;
  update ledger_buyin_requests set status = 'approved', game_seq = p_game_seq, resolved_at = now(), resolved_by = auth.uid() where id = p_request_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.auto_approve_verified_poster()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.my_role() = 'admin' then return new; end if; -- 관리자 입력은 그대로(승인 가능)
  new.approved := false; -- 업주 등록은 무조건 승인 대기
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.auto_blind_reported_post()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare cnt int;
begin
  if new.target_type = 'post' and new.target_id is not null then
    select count(distinct reporter_id) into cnt
      from public.reports where target_type = 'post' and target_id = new.target_id;
    if cnt >= 3 then
      update public.community_posts set blinded = true where id = new.target_id::uuid and blinded = false;
    end if;
  end if;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.award_comment_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_own boolean := false;
begin
  if new.user_id is null then
    return new;
  end if;

  if new.venue_id is not null then
    select exists(
      select 1 from public.venues v
      where v.id = new.venue_id and v.owner_id = new.user_id
    ) into v_own;
  end if;

  if not v_own and new.schedule_id is not null then
    select exists(
      select 1 from public.schedules s
      where s.id = new.schedule_id and s.owner_id = new.user_id
    ) into v_own;
  end if;

  if not v_own then
    update public.profiles
       set activity_points = coalesce(activity_points, 0) + 1
     where id = new.user_id;
  end if;

  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.award_post_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.user_id is not null then
    update public.profiles
       set activity_points = coalesce(activity_points, 0) + 3
     where id = new.user_id;
  end if;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.block_ugc_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v text;
begin
  for v in select value from jsonb_each_text(to_jsonb(new)) where key in ('title','content','body','message') loop
    if public.contains_blocked_ugc(v) then
      raise exception '현금화·환전·대리게임·불법도박 관련 표현은 게시할 수 없습니다 (게임산업법 제32조).';
    end if;
  end loop;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.can_access_ledger(p_venue_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT can_manage_pos(p_venue_id)
      OR EXISTS (SELECT 1 FROM public.ledger_access la WHERE la.venue_id = p_venue_id AND la.user_id = auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION public.can_manage_pos(p_venue_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select my_role() = 'admin'::user_role
      or exists (select 1 from public.venues v where v.id = p_venue_id and v.owner_id = auth.uid())
      or exists (select 1 from public.venue_owners vo where vo.venue_id = p_venue_id and vo.user_id = auth.uid() and vo.status = 'approved');
$function$
;

CREATE OR REPLACE FUNCTION public.can_manage_venue(p_venue_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.status, 'active') = 'active'
      and (
        p.role = 'admin'
        or (p.role = 'venue_owner' and p.approved and (
              exists (select 1 from public.venues v where v.id = p_venue_id and v.owner_id = p.id)
              or exists (select 1 from public.venue_owners vo where vo.venue_id = p_venue_id and vo.user_id = p.id and vo.status = 'approved')
            ))
        or (p.role = 'venue_staff' and p.approved and p.venue_id = p_venue_id)
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.can_manage_venue_staff(p_venue_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT my_role() = 'admin'::user_role
      OR EXISTS (SELECT 1 FROM public.venues v WHERE v.id = p_venue_id AND v.owner_id = auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION public.can_view_vouchers(p_venue_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select can_manage_pos(p_venue_id)
      or exists (select 1 from public.voucher_access va where va.venue_id = p_venue_id and va.user_id = auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_buyin_request(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from ledger_buyin_requests where id = p_request_id and user_id = auth.uid() and status = 'pending';
  if not found then raise exception '취소할 수 없는 요청입니다(이미 처리됨)'; end if;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cancel_ledger_buyin(p_id uuid, p_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_venue uuid; v_hash text;
begin
  select venue_id into v_venue from public.ledger_buyins where id = p_id;
  if v_venue is null then return; end if;
  if not can_access_ledger(v_venue) then raise exception '권한이 없습니다'; end if;
  if my_role() <> 'admin'::user_role then
    select cancel_password_hash into v_hash from public.venue_pos_settings where venue_id = v_venue;
    if v_hash is null then raise exception '취소 비밀번호가 설정되지 않았습니다. 업주가 먼저 설정해야 합니다'; end if;
    if extensions.crypt(coalesce(p_password,''), v_hash) <> v_hash then raise exception '비밀번호가 올바르지 않습니다'; end if;
  end if;
  delete from public.ledger_buyins where id = p_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cancel_staff_invite(p_invite_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from public.venue_staff_invites i
   using public.venues v
   where i.id = p_invite_id and i.venue_id = v.id and v.owner_id = auth.uid();
end; $function$
;

CREATE OR REPLACE FUNCTION public.cap_live_wall()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from public.live_wall
   where id in (select id from public.live_wall order by created_at desc, id desc offset 200);
  return null;
end; $function$
;

CREATE OR REPLACE FUNCTION public.check_in(p_venue_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_name text; v_disp text; v_recent timestamptz; v_today_cnt int;
  v_today date; v_last date; v_streak int;
begin
  if auth.uid() is null then raise exception '로그인 후 체크인할 수 있습니다'; end if;
  select name into v_name from public.venues where id = p_venue_id;
  if v_name is null then raise exception '매장을 찾을 수 없습니다'; end if;
  select created_at into v_recent from public.checkins where venue_id = p_venue_id and user_id = auth.uid() order by created_at desc limit 1;
  if v_recent is not null and v_recent > now() - interval '4 hours' then
    raise exception '이미 체크인했습니다 (4시간 내 중복 방지)';
  end if;
  v_today := (now() at time zone 'Asia/Seoul')::date;
  select count(*) into v_today_cnt from public.checkins
   where venue_id = p_venue_id and user_id = auth.uid()
     and created_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  select coalesce(nickname, name) into v_disp from public.profiles where id = auth.uid();
  insert into public.checkins(venue_id, user_id, display_name) values (p_venue_id, auth.uid(), v_disp);
  if v_today_cnt = 0 then
    update public.profiles set activity_points = coalesce(activity_points, 0) + 3 where id = auth.uid();
  end if;
  select last_checkin_date, checkin_streak into v_last, v_streak from public.profiles where id = auth.uid();
  if v_last is distinct from v_today then
    if v_last = v_today - 1 then v_streak := coalesce(v_streak, 0) + 1; else v_streak := 1; end if;
    update public.profiles
       set checkin_streak = v_streak,
           last_checkin_date = v_today,
           activity_points = coalesce(activity_points, 0) + (case when v_streak % 7 = 0 then 10 else 0 end)
     where id = auth.uid();
  end if;
  -- ── CRM 자동 적재 ──────────────────────────────────────────
  update public.customer_profiles
     set visit_count = coalesce(visit_count,0) + 1, last_visit_at = now(),
         name = coalesce(nullif(btrim(name),''), v_disp), updated_at = now()
   where venue_id = p_venue_id and user_id = auth.uid();
  if not found then
    update public.customer_profiles
       set user_id = auth.uid(), visit_count = coalesce(visit_count,0) + 1, last_visit_at = now(), updated_at = now()
     where venue_id = p_venue_id and user_id is null and lower(btrim(name)) = lower(btrim(v_disp));
    if not found then
      insert into public.customer_profiles(venue_id, user_id, name, visit_count, first_visit_at, last_visit_at)
      values (p_venue_id, auth.uid(), v_disp, 1, now(), now())
      on conflict (venue_id, name) do update
        set user_id = coalesce(public.customer_profiles.user_id, excluded.user_id),
            visit_count = coalesce(public.customer_profiles.visit_count,0) + 1,
            last_visit_at = now(), updated_at = now();
    end if;
  end if;
  return v_name;
end $function$
;

CREATE OR REPLACE FUNCTION public.claim_daily_login_point()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_points integer;
begin
  if v_uid is null then
    return null;
  end if;

  -- 접속 시각은 매번 갱신
  update public.profiles set last_seen_at = now() where id = v_uid;

  -- 활동 점수는 KST 기준 하루 1회만 +1
  update public.profiles
     set activity_points = coalesce(activity_points, 0) + 1,
         last_login_point_at = v_today
   where id = v_uid
     and (last_login_point_at is null or last_login_point_at < v_today)
  returning activity_points into v_points;

  if v_points is null then
    select activity_points into v_points from public.profiles where id = v_uid;
  end if;
  return v_points;
end; $function$
;

CREATE OR REPLACE FUNCTION public.claim_mission(p_key text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_week date; v_ok boolean := false; v_reward int := 0; v_nick text;
  v_cm record; v_goal int; v_type text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  v_week := (date_trunc('week', (now() at time zone 'Asia/Seoul')::timestamp))::date;
  if exists (select 1 from mission_claims where user_id = auth.uid() and mission_key = p_key and week_start = v_week) then
    raise exception '이미 받은 보상입니다';
  end if;
  select coalesce(nickname, name) into v_nick from profiles where id = auth.uid();

  if p_key like 'c%' and p_key ~ '^c[0-9]+$' then
    select * into v_cm from custom_missions where id = substring(p_key from 2)::int and active = true;
    if v_cm is null then raise exception '종료된 미션입니다'; end if;
    v_reward := v_cm.reward; v_goal := v_cm.goal; v_type := v_cm.goal_type;
  elsif p_key = 'checkin2' then v_reward := 20; v_goal := 2; v_type := 'checkin';
  elsif p_key = 'post1' then v_reward := 10; v_goal := 1; v_type := 'post';
  elsif p_key = 'moneyin1' then v_reward := 30; v_goal := 1; v_type := 'moneyin';
  else raise exception '알 수 없는 미션입니다';
  end if;

  if v_type = 'checkin' then
    select count(*) >= v_goal into v_ok from checkins
     where user_id = auth.uid() and created_at >= (v_week::timestamp at time zone 'Asia/Seoul');
  elsif v_type = 'post' then
    select count(*) >= v_goal into v_ok from community_posts
     where user_id = auth.uid() and created_at >= (v_week::timestamp at time zone 'Asia/Seoul');
  else
    select count(*) >= v_goal into v_ok from venue_rankings
     where lower(nickname) = lower(v_nick) and ranking_date >= v_week;
  end if;
  if not v_ok then raise exception '아직 미션을 달성하지 못했습니다'; end if;
  insert into mission_claims(user_id, mission_key, week_start) values (auth.uid(), p_key, v_week);
  update profiles set activity_points = coalesce(activity_points, 0) + v_reward where id = auth.uid();
  return format('+%s점 지급 완료!', v_reward);
end $function$
;

CREATE OR REPLACE FUNCTION public.client_error_rate_ok()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select auth.uid() is null
      or (select count(*) from public.client_errors c where c.user_id = (select auth.uid()) and c.created_at > now() - interval '1 minute') < 15;
$function$
;

CREATE OR REPLACE FUNCTION public.contains_blocked_ugc(p_text text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(p_text,'') ~* '현금화|현금\s*교환|칩\s*환전|환전\s*칩|gp\s*환전|환전\s*gp|시드\s*현금|현금\s*시드|칩\s*(직|판)매|칩\s*구매|칩\s*삽니다|칩\s*팝니다|칩\s*거래|게임\s*머니\s*거래|불법\s*카지노|사설\s*도박|토토\s*환전|배팅\s*사이트|먹튀|총판\s*모집|도박\s*사이트|대리\s*게임|대리\s*참가|대리\s*플레이|대리\s*바이인|대신\s*플레이|게임\s*대행'
     or coalesce(p_text,'') ~ '[0-9]{3,6}-[0-9]{2,6}-[0-9]{4,8}';
$function$
;

CREATE OR REPLACE FUNCTION public.create_group(p_name text, p_kind text, p_region text, p_description text, p_join_approval boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE gid uuid; pname text; pcolor text; cnt int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  IF p_kind NOT IN ('dealer_team','club','youtuber','other') THEN RAISE EXCEPTION '허용되지 않은 그룹 종류'; END IF;
  IF length(coalesce(p_name,'')) < 1 THEN RAISE EXCEPTION '그룹 이름을 입력해 주세요'; END IF;
  SELECT count(*) INTO cnt FROM public.venues WHERE owner_id = auth.uid() AND kind <> 'venue';
  IF cnt >= 5 THEN RAISE EXCEPTION '계정당 최대 5개의 그룹만 만들 수 있습니다'; END IF;
  SELECT coalesce(nickname,'회원'), avatar_color INTO pname, pcolor FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.venues (name, region, description, kind, owner_id, approved, status, join_approval)
    VALUES (left(p_name,40), coalesce(nullif(p_region,''),'전국'), left(coalesce(p_description,''),500), p_kind, auth.uid(), false, 'active', coalesce(p_join_approval, true))
    RETURNING id INTO gid;
  INSERT INTO public.group_members (group_id, user_id, role, status, member_name, member_color)
    VALUES (gid, auth.uid(), 'manager', 'approved', coalesce(pname,'회원'), pcolor);
  RETURN gid;
END; $function$
;

CREATE OR REPLACE FUNCTION public.create_my_venue(p_name text, p_region text, p_address text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if my_role() <> 'venue_owner'::user_role then
    raise exception '업주만 매장을 생성할 수 있습니다';
  end if;
  if coalesce(btrim(p_name),'') = '' or coalesce(btrim(p_region),'') = '' then
    raise exception '매장명과 지역은 필수입니다';
  end if;
  if exists (select 1 from public.venues where owner_id = auth.uid()) then
    raise exception '이미 보유한 홀덤펍이 있습니다';
  end if;

  insert into public.venues (name, region, address, owner_id, approved, verification_status)
  values (btrim(p_name), btrim(p_region), coalesce(p_address,''), auth.uid(), true, 'unverified')
  returning id into v_id;

  update public.profiles set venue_id = v_id, approved = true where id = auth.uid();
  return v_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.create_my_venue(p_name text, p_region text DEFAULT ''::text, p_address text DEFAULT ''::text, p_phone text DEFAULT ''::text, p_image_url text DEFAULT NULL::text, p_kakao_url text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_business_hours text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_role user_role;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('venue_owner','admin') then raise exception '업주만 매장을 생성할 수 있습니다'; end if;
  if coalesce(trim(p_name),'')='' then raise exception '매장 이름은 필수입니다'; end if;
  insert into public.venues (name, region, address, contact_phone, image_url, kakao_url, description, business_hours, owner_id, approved, kind)
  values (left(trim(p_name),60), left(coalesce(trim(p_region),''),40), coalesce(trim(p_address),''), nullif(trim(coalesce(p_phone,'')),''),
          nullif(trim(coalesce(p_image_url,'')),''), nullif(trim(coalesce(p_kakao_url,'')),''),
          nullif(trim(coalesce(p_description,'')),''), nullif(trim(coalesce(p_business_hours,'')),''),
          auth.uid(), (v_role = 'admin'), 'venue')
  returning id into v_id;
  insert into public.venue_owners(venue_id, user_id, added_by) values (v_id, auth.uid(), auth.uid()) on conflict do nothing;
  update public.profiles set venue_id = v_id, role = 'venue_owner', approved = true where id = auth.uid();
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.create_venue_season(p_venue_id uuid, p_name text, p_starts_on date, p_ends_on date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if auth.uid() is null or not coalesce(public.can_manage_pos(p_venue_id),false) then raise exception '권한이 없습니다'; end if;
  if coalesce(trim(p_name),'')='' then raise exception '시즌 이름을 입력하세요'; end if;
  if p_ends_on < p_starts_on then raise exception '종료일이 시작일보다 빠릅니다'; end if;
  if exists(select 1 from public.venue_seasons where venue_id=p_venue_id and status='active') then raise exception '이미 진행 중인 시즌이 있습니다 (먼저 종료하세요)'; end if;
  insert into public.venue_seasons(venue_id,name,starts_on,ends_on) values(p_venue_id,trim(p_name),p_starts_on,p_ends_on) returning id into v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.current_season_standings(p_venue_id uuid)
 RETURNS TABLE(rank integer, nickname text, real_name text, points integer, prize_man integer, appearances integer, best_position integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with s as (select starts_on, ends_on from public.venue_seasons where venue_id=p_venue_id and status='active' limit 1),
  agg as (
    select vr.nickname,
      max(vr.real_name) as real_name,
      sum(public.placement_points(p_venue_id, vr.position))::int as points,
      sum(public.parse_prize_man(vr.prize))::int as prize_man,
      count(*)::int as appearances,
      min(vr.position)::int as best_position
    from public.venue_rankings vr, s
    where vr.venue_id=p_venue_id and vr.ranking_date >= s.starts_on and vr.ranking_date <= s.ends_on and coalesce(trim(vr.nickname),'')<>''
    group by vr.nickname
  )
  select (row_number() over (order by points desc, prize_man desc, best_position asc, appearances desc))::int as rank,
    nickname, real_name, points, prize_man, appearances, best_position
  from agg order by rank;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_ledger_session(p_venue_id uuid, p_date date, p_game_seq smallint DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.can_manage_pos(p_venue_id) then
    raise exception 'permission denied: POS 관리 권한이 필요합니다';
  end if;
  delete from public.ledger_buyins  where venue_id = p_venue_id and session_date = p_date and game_seq = p_game_seq;
  delete from public.ledger_players where venue_id = p_venue_id and session_date = p_date and game_seq = p_game_seq;
  delete from public.ledger_sessions where venue_id = p_venue_id and session_date = p_date and game_seq = p_game_seq;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_voucher(p_voucher_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_venue uuid;
begin
  select venue_id into v_venue from public.store_vouchers where id=p_voucher_id;
  if v_venue is null or not can_manage_pos(v_venue) then raise exception '권한이 없습니다 — 업주만 삭제할 수 있습니다'; end if;
  delete from public.store_vouchers where id=p_voucher_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.end_expired_seasons()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; cnt int := 0;
begin
  for r in select id from public.venue_seasons where status='active' and ends_on < (now() at time zone 'Asia/Seoul')::date loop
    perform public._end_season_internal(r.id);
    cnt := cnt + 1;
  end loop;
  return cnt;
end $function$
;

CREATE OR REPLACE FUNCTION public.end_venue_season(p_season_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_venue uuid;
begin
  select venue_id into v_venue from public.venue_seasons where id=p_season_id and status='active';
  if v_venue is null then raise exception '진행 중인 시즌이 아닙니다'; end if;
  if auth.uid() is null or not coalesce(public.can_manage_pos(v_venue),false) then raise exception '권한이 없습니다'; end if;
  return public._end_season_internal(p_season_id);
end $function$
;

CREATE OR REPLACE FUNCTION public.enforce_nickname_cooldown()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.name is distinct from old.name then
    if old.role <> 'admin'
       and old.name_changed_at is not null
       and now() - old.name_changed_at < interval '30 days' then
      raise exception '닉네임은 30일에 한 번만 변경할 수 있습니다 (다음 변경 가능일: %)',
        to_char((old.name_changed_at + interval '30 days') at time zone 'Asia/Seoul', 'YYYY-MM-DD');
    end if;
    new.name_changed_at := now();
  end if;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.expire_old_buyin_requests()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer; v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  insert into notifications (user_id, type, title, message, read)
  select user_id, 'system', '⏳ 바인 요청 마감', '보내신 참가(바인) 요청이 자동 마감되었습니다. 필요하면 매장에서 다시 요청해 주세요.', false
  from ledger_buyin_requests where status = 'pending' and session_date < v_today and user_id is not null;
  delete from ledger_buyin_requests where status = 'pending' and session_date < v_today;
  get diagnostics n = row_count;
  return n;
end; $function$
;

CREATE OR REPLACE FUNCTION public.fill_dealer_post_author()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.author_id := auth.uid();
  select name, avatar_color into new.author_name, new.author_color
  from public.profiles where id = auth.uid();
  new.deleted := false;
  new.deleted_at := null;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.fill_owner_post_author()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.author_id := auth.uid();
  select name, avatar_color into new.author_name, new.author_color
  from public.profiles where id = auth.uid();
  new.deleted := false;
  new.deleted_at := null;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.fill_user_avatar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  select avatar_url into new.user_avatar from public.profiles where id = new.user_id;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.fill_venue_notice_author()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.author_id := auth.uid();
  select name into new.author_name from public.profiles where id = auth.uid();
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.find_user_by_phone(p_phone text)
 RETURNS TABLE(id uuid, display text, verified boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, coalesce(p.nickname, p.name) as display, public.is_ci_verified(p.ci, p.verified_at) as verified
  from public.profiles p
  where (
      public.my_role() = 'admin'
      or exists (select 1 from public.venues v where v.owner_id = auth.uid())
      or exists (select 1 from public.venue_owners vo where vo.user_id = auth.uid() and vo.status = 'approved')
    )
    and coalesce(p.status::text, 'active') = 'active'
    and length(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')) >= 9
    and regexp_replace(coalesce(p.phone,''), '[^0-9]', '', 'g') <> ''
    and right(regexp_replace(coalesce(p.phone,''), '[^0-9]', '', 'g'), 10)
      = right(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g'), 10)
  limit 5;
$function$
;

CREATE OR REPLACE FUNCTION public.find_user_for_transfer(p_nickname text)
 RETURNS TABLE(id uuid, display text, verified boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id,
         coalesce(nullif(btrim(p.nickname), ''), p.name) as display,
         public.is_ci_verified(p.ci, p.verified_at) as verified
  from public.profiles p
  where coalesce(p.status::text, 'active') = 'active'
    and p.id <> auth.uid()
    and btrim(coalesce(p_nickname, '')) <> ''
    and (p.nickname ilike '%' || btrim(p_nickname) || '%' or p.name ilike '%' || btrim(p_nickname) || '%')
  order by (p.nickname = btrim(p_nickname)) desc, public.is_ci_verified(p.ci, p.verified_at) desc, p.nickname
  limit 8;
$function$
;

CREATE OR REPLACE FUNCTION public.get_activity_leaderboard(p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, nickname text, activity_points integer, avatar_color text, role user_role, equipped_mark text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.nickname, coalesce(p.activity_points, 0) as activity_points,
         p.avatar_color, p.role, p.equipped_mark
  from public.profiles p
  where coalesce(p.status, 'active') = 'active'
    and p.role <> 'admin'
  order by coalesce(p.activity_points, 0) desc, p.joined_at asc nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$function$
;

CREATE OR REPLACE FUNCTION public.get_domestic_rankings(p_limit integer DEFAULT 30)
 RETURNS TABLE(nickname text, total_won bigint, wins integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select rv.nickname, sum(rv.amount_won)::bigint as total_won, count(*)::integer as wins
  from rank_verifications rv
  where rv.status = 'approved'
  group by rv.nickname
  order by total_won desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$function$
;

CREATE OR REPLACE FUNCTION public.get_equipped_marks(p_ids uuid[])
 RETURNS TABLE(id uuid, equipped_mark text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.equipped_mark
  from public.profiles p
  where p.id = any(p_ids) and p.equipped_mark is not null;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_staff_invites()
 RETURNS TABLE(id uuid, venue_id uuid, venue_name text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select i.id, i.venue_id, v.name, i.created_at
  from public.venue_staff_invites i
  join public.venues v on v.id = i.venue_id
  where i.user_id = auth.uid() and i.status = 'pending'
  order by i.created_at desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_venue_invites(p_venue_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, user_id uuid, email text, nickname text, name text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select i.id, i.user_id, p.email, p.nickname, p.name, i.created_at
  from venue_staff_invites i
  join profiles p on p.id = i.user_id
  where i.status = 'pending'
    and i.venue_id = coalesce(p_venue_id, (select v.id from venues v where v.owner_id = auth.uid() order by v.id limit 1))
    and can_manage_pos(i.venue_id)
  order by i.created_at desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_venue_staff(p_venue_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF profiles
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.* from profiles s
  where s.role = 'venue_staff'
    and s.venue_id = coalesce(p_venue_id, (select v.id from venues v where v.owner_id = auth.uid() order by v.id limit 1))
    and can_manage_pos(coalesce(p_venue_id, (select v.id from venues v where v.owner_id = auth.uid() order by v.id limit 1)))
  order by s.approved asc, s.joined_at desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_voucher_access_user_ids(p_venue_id uuid)
 RETURNS TABLE(user_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select va.user_id from public.voucher_access va where va.venue_id = p_venue_id and can_manage_pos(p_venue_id);
$function$
;

CREATE OR REPLACE FUNCTION public.get_voucher_quota(p_venue_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select voucher_quota from public.venues where id = p_venue_id), 0);
$function$
;

CREATE OR REPLACE FUNCTION public.global_ranking_totals()
 RETURNS TABLE(nickname text, moneyin_count bigint, prize_points bigint, best_position integer, venues bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.nickname,
         count(*)::bigint as moneyin_count,
         coalesce(sum(public.parse_prize_man(r.prize)),0)::bigint as prize_points,
         min(r.position)::integer as best_position,
         count(distinct r.venue_id)::bigint as venues
  from public.venue_rankings r
  where coalesce(trim(r.nickname), '') <> ''
  group by r.nickname
$function$
;

CREATE OR REPLACE FUNCTION public.grant_ledger_access(p_venue_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not can_manage_pos(p_venue_id) then raise exception '권한이 없습니다'; end if;
  insert into public.ledger_access (venue_id, user_id) values (p_venue_id, p_user_id)
  on conflict do nothing;
end; $function$
;

CREATE OR REPLACE FUNCTION public.grant_voucher_access(p_venue_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not can_manage_pos(p_venue_id) then raise exception '권한이 없습니다'; end if;
  insert into public.voucher_access(venue_id, user_id) values (p_venue_id, p_user_id) on conflict do nothing;
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_profile_privileged_cols()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if current_user in ('authenticated','anon') and coalesce(public.my_role()::text,'') <> 'admin' then
    if new.role is distinct from old.role
       or new.verified_at is distinct from old.verified_at
       or new.ci is distinct from old.ci
       or new.approved is distinct from old.approved
       or new.activity_points is distinct from old.activity_points
       or new.badges is distinct from old.badges
       or new.status is distinct from old.status
       or new.suspended_until is distinct from old.suspended_until
       or new.sanction_reason is distinct from old.sanction_reason
       or new.nickname_locked is distinct from old.nickname_locked
       or new.real_name is distinct from old.real_name
       or new.phone is distinct from old.phone
       or new.birth_date is distinct from old.birth_date
       or new.gender is distinct from old.gender
       or new.carrier is distinct from old.carrier
    then
      raise exception '보호된 프로필 항목(권한/본인인증/포인트 등)은 직접 변경할 수 없습니다';
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_venue_verification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.verification_status is distinct from old.verification_status then
    if public.my_role() = 'admin' then
      return new;
    else
      raise exception '매장 인증 상태는 관리자만 변경할 수 있습니다';
    end if;
  end if;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_name   text        := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  v_nick   text        := nullif(trim(coalesce(new.raw_user_meta_data->>'nickname', '')), '');
  v_role   user_role   := coalesce((new.raw_user_meta_data->>'role')::user_role, 'user');
  v_status user_status := case when coalesce((new.raw_user_meta_data->>'role')::user_role, 'user') = 'venue_owner'
                               then 'pending'::user_status else 'active'::user_status end;
begin
  if v_nick is null or exists (select 1 from public.profiles where lower(trim(nickname)) = lower(v_nick)) then
    v_nick := v_name || '_' || left(new.id::text, 4);
  end if;

  insert into public.profiles (
    id, email, name, nickname, role, status,
    agreed_to_terms, agreed_to_privacy, agreed_to_anti_gambling, agreed_to_marketing, terms_agreed_at
  ) values (
    new.id, new.email, v_name, v_nick, v_role, v_status,
    coalesce((new.raw_user_meta_data->>'agreed_to_terms')::boolean, false),
    coalesce((new.raw_user_meta_data->>'agreed_to_privacy')::boolean, false),
    coalesce((new.raw_user_meta_data->>'agreed_to_anti_gambling')::boolean, false),
    coalesce((new.raw_user_meta_data->>'agreed_to_marketing')::boolean, false),
    case when (new.raw_user_meta_data->>'agreed_to_terms')::boolean then now() else null end
  ) on conflict (id) do nothing;

  -- venue_owner는 매장 자동 생성 안 함(셀프 매장 생성으로). 전화번호만 저장.
  if v_role = 'venue_owner' then
    update public.profiles set approved = false, phone = nullif(new.raw_user_meta_data->>'phone','')
     where id = new.id;
  elsif v_role = 'venue_staff' then
    update public.profiles set venue_id = nullif(new.raw_user_meta_data->>'venue_id', '')::uuid, approved = false
     where id = new.id;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_post_likes(post_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid(); v_new boolean := false;
begin
  if v_uid is null then return; end if;
  insert into public.post_likes(post_id, user_id) values (post_id, v_uid) on conflict do nothing;
  get diagnostics v_new = row_count;
  if v_new then update public.community_posts set like_count = coalesce(like_count,0) + 1 where id = post_id; end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.increment_post_view(p_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.community_posts set view_count = view_count + 1 where id = p_id;
$function$
;

CREATE OR REPLACE FUNCTION public.invite_staff_by_email(p_email text, p_venue_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_venue uuid; v_vname text; v_user uuid; v_role user_role;
begin
  v_venue := coalesce(p_venue_id, (select v.id from venues v where v.owner_id = auth.uid() order by v.id limit 1));
  if v_venue is null then raise exception '관리할 매장을 찾을 수 없습니다'; end if;
  if not can_manage_pos(v_venue) then raise exception '이 매장의 구성원을 초대할 권한이 없습니다'; end if;
  select v.name into v_vname from venues v where v.id = v_venue;

  select id, role into v_user, v_role from profiles where lower(trim(email)) = lower(trim(p_email)) limit 1;
  if v_user is null then raise exception '해당 이메일의 회원을 찾을 수 없습니다. 먼저 일반 회원으로 가입해야 합니다.'; end if;
  if v_user = auth.uid() then raise exception '본인은 초대할 수 없습니다'; end if;
  if v_role in ('venue_owner','admin') then raise exception '업주/관리자 계정은 직원으로 초대할 수 없습니다'; end if;
  if v_role = 'venue_staff' then raise exception '이미 매장 소속 직원입니다'; end if;

  insert into venue_staff_invites (venue_id, user_id, invited_by, status)
  values (v_venue, v_user, auth.uid(), 'pending')
  on conflict (venue_id, user_id) do update set status='pending', invited_by=auth.uid(), created_at=now();

  insert into notifications (user_id, type, title, message, avatar_color, read, link)
  values (v_user, 'system', '매장 구성원 초대',
          coalesce(v_vname,'한 매장') || '에서 구성원으로 초대했습니다. 수락하면 매장 운영을 도울 수 있어요.',
          '#FFD100', false, '/invites');
end; $function$
;

CREATE OR REPLACE FUNCTION public.is_ci_verified(p_ci text, p_verified_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select p_ci is not null;  -- 현재: CI 보유 = 인증(만료 없음)
$function$
;

CREATE OR REPLACE FUNCTION public.is_group_manager(gid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.my_role() = 'admin'::user_role
      OR EXISTS (SELECT 1 FROM public.venues v WHERE v.id = gid AND v.owner_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.group_members m
                 WHERE m.group_id = gid AND m.user_id = auth.uid() AND m.role = 'manager' AND m.status = 'approved');
$function$
;

CREATE OR REPLACE FUNCTION public.is_group_member(gid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.group_members m
                 WHERE m.group_id = gid AND m.user_id = auth.uid() AND m.status = 'approved');
$function$
;

CREATE OR REPLACE FUNCTION public.is_league_participant(p_league_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(select 1 from public.leagues l where l.id = p_league_id and public.can_manage_pos(l.owner_venue_id))
      or exists(select 1 from public.league_members m where m.league_id = p_league_id and m.status = 'accepted' and public.can_manage_pos(m.venue_id));
$function$
;

CREATE OR REPLACE FUNCTION public.is_nickname_available(p_nickname text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    case
      when p_nickname is null or char_length(trim(p_nickname)) < 2 then false
      else not exists (
        select 1 from public.profiles
        where lower(trim(nickname)) = lower(trim(p_nickname))
      )
    end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_slug_available(p_slug text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when p_slug !~ '^[a-z0-9][a-z0-9-]{1,19}$' then false                       -- 소문자/숫자/하이픈, 2~20자
    when p_slug in ('s','api','admin','login','signup','app','www','assets','venue','post','help') then false
    when exists (select 1 from public.venues where lower(slug) = lower(p_slug)) then false
    else true end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_verified_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles p
    join public.venues v on v.owner_id = p.id
    where p.id = auth.uid()
      and p.role = 'venue_owner'
      and coalesce(p.status, 'active') = 'active'
      and v.verification_status = 'verified'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.issue_voucher(p_venue_id uuid, p_title text, p_count integer DEFAULT 1, p_holder_name text DEFAULT NULL::text, p_holder_user_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_count int; v_title text; v_holder text; v_quota int;
begin
  if not can_manage_pos(p_venue_id) then raise exception '권한이 없습니다 — 매장이용권 발행은 업주만 가능합니다'; end if;
  if my_role() <> 'admin' and not coalesce((select voucher_issue_approved from public.venues where id = p_venue_id), false) then
    raise exception '운영자 승인 후 매장이용권을 발급할 수 있습니다';
  end if;
  if p_holder_user_id is not null and not exists (
    select 1 from public.profiles where id = p_holder_user_id and real_name is not null and btrim(real_name) <> ''
  ) then
    raise exception '본인인증을 완료한 회원에게만 매장이용권을 지급할 수 있습니다';
  end if;
  v_count := least(greatest(coalesce(p_count, 1), 1), 1000);
  if my_role() <> 'admin' then
    select voucher_quota into v_quota from public.venues where id = p_venue_id for update;
    if coalesce(v_quota, 0) < v_count then
      raise exception '발급 한도가 부족합니다 (잔여 %개) — 충전 요청을 남겨 주세요', coalesce(v_quota, 0);
    end if;
    update public.venues set voucher_quota = voucher_quota - v_count where id = p_venue_id;
  end if;
  v_title := coalesce(nullif(btrim(p_title), ''), '매장이용권');
  v_holder := nullif(btrim(coalesce(p_holder_name, '')), '');
  insert into public.store_vouchers(venue_id, issued_by, holder_user_id, holder_name, title, note)
  select p_venue_id, auth.uid(), p_holder_user_id, v_holder, v_title, nullif(btrim(coalesce(p_note, '')), '')
  from generate_series(1, v_count);
  return v_count;
end $function$
;

CREATE OR REPLACE FUNCTION public.join_group(p_group uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE need_appr boolean; st text; pname text; pcolor text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  SELECT join_approval INTO need_appr FROM public.venues WHERE id = p_group AND kind <> 'venue';
  IF need_appr IS NULL THEN RAISE EXCEPTION '그룹을 찾을 수 없습니다'; END IF;
  SELECT coalesce(nickname,'회원'), avatar_color INTO pname, pcolor FROM public.profiles WHERE id = auth.uid();
  st := CASE WHEN need_appr THEN 'pending' ELSE 'approved' END;
  INSERT INTO public.group_members (group_id, user_id, role, status, member_name, member_color)
    VALUES (p_group, auth.uid(), 'member', st, coalesce(pname,'회원'), pcolor)
    ON CONFLICT (group_id, user_id) DO NOTHING;
  RETURN st;
END; $function$
;

CREATE OR REPLACE FUNCTION public.kill_switch_is_set(p_venue_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(select 1 from public.venue_kill_switch where venue_id = p_venue_id);
$function$
;

CREATE OR REPLACE FUNCTION public.kill_venue(p_venue_id uuid, p_owner_name text, p_password text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid; v_real text; v_hash text; v_tbl text;
  v_whitelist text[] := array[
    'comments','schedules','venue_follows','venue_staff_invites','venue_rankings','venue_notices',
    'venue_pos_settings','ledger_access','venue_staff','ledger_sessions','staff_schedule','clock_presets',
    'ranking_point_awards','ledger_buyins','ledger_players','clock_states','staff_wage','waitlist',
    'customer_profiles','coupons','dealer_shifts','store_vouchers','checkins','voucher_access',
    'venue_messages','venue_score_entries','league_members','league_entries','venue_reviews',
    'voucher_credit_requests','venue_owners','ledger_buyin_requests','venue_announcements',
    'venue_seasons','game_presets','venue_kill_switch','league_event_status'
  ];
begin
  select owner_id into v_owner from public.venues where id = p_venue_id;
  if v_owner is null then raise exception '매장을 찾을 수 없습니다'; end if;
  if auth.uid() is null or auth.uid() <> v_owner then raise exception '매장 대표 업주만 실행할 수 있습니다'; end if;
  select real_name into v_real from public.profiles where id = v_owner;
  if coalesce(trim(v_real), '') = '' then raise exception '본인인증(실명)된 업주만 실행할 수 있습니다'; end if;
  if lower(trim(p_owner_name)) <> lower(trim(v_real)) then raise exception '업주 실명이 일치하지 않습니다'; end if;
  select pw_hash into v_hash from public.venue_kill_switch where venue_id = p_venue_id;
  if v_hash is null then raise exception '킬스위치 비밀번호를 먼저 설정하세요'; end if;
  if v_hash <> crypt(p_password, v_hash) then raise exception '킬스위치 비밀번호가 일치하지 않습니다'; end if;
  perform public._audit('kill_venue', p_venue_id::text, jsonb_build_object('owner_name', p_owner_name));
  update public.profiles set venue_id = null where venue_id = p_venue_id;
  foreach v_tbl in array v_whitelist loop
    execute format('delete from public.%I where venue_id = $1', v_tbl) using p_venue_id;
  end loop;
  delete from public.venues where id = p_venue_id;
  return 1;
end $function$
;

CREATE OR REPLACE FUNCTION public.league_reset_event(p_league_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid;
begin
  select owner_venue_id into v_owner from public.leagues where id = p_league_id;
  if not public.can_manage_pos(v_owner) then raise exception '리그장만 가능'; end if;
  delete from public.league_event_status where league_id = p_league_id;
  update public.leagues set phase = 'idle', settled_at = null, final_venue_id = null where id = p_league_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.league_set_status(p_league_id uuid, p_venue_id uuid, p_status text, p_entries integer, p_itm jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid; v_ok boolean;
begin
  if p_status not in ('pending','running','settled') then raise exception '잘못된 상태'; end if;
  if not public.can_manage_pos(p_venue_id) then raise exception '해당 매장 운영자만 보고할 수 있습니다'; end if;
  select owner_venue_id into v_owner from public.leagues where id = p_league_id;
  v_ok := (p_venue_id = v_owner) or exists(select 1 from public.league_members m where m.league_id = p_league_id and m.venue_id = p_venue_id and m.status = 'accepted');
  if not v_ok then raise exception '이 리그의 참가 매장이 아닙니다'; end if;
  insert into public.league_event_status(league_id, venue_id, live_status, entries, itm, updated_at)
    values (p_league_id, p_venue_id, p_status, coalesce(p_entries,0), p_itm, now())
  on conflict (league_id, venue_id) do update set
    live_status = excluded.live_status, entries = excluded.entries, itm = coalesce(excluded.itm, public.league_event_status.itm), updated_at = now();
  -- 첫 시작이면 리그 phase 를 live 로
  if p_status = 'running' then update public.leagues set phase = 'live' where id = p_league_id and phase = 'idle'; end if;
end; $function$
;

CREATE OR REPLACE FUNCTION public.league_settle_all(p_league_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid; v_final uuid;
begin
  select owner_venue_id into v_owner from public.leagues where id = p_league_id;
  if v_owner is null then raise exception '리그를 찾을 수 없습니다'; end if;
  if not public.can_manage_pos(v_owner) then raise exception '리그장 매장만 전체 정산할 수 있습니다'; end if;
  select venue_id into v_final from public.league_event_status where league_id = p_league_id order by entries desc, updated_at asc limit 1;
  update public.leagues set phase = 'settled', settled_at = now(), final_venue_id = v_final where id = p_league_id;
  return v_final;
end; $function$
;

CREATE OR REPLACE FUNCTION public.league_start_final(p_league_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid;
begin
  select owner_venue_id into v_owner from public.leagues where id = p_league_id;
  if not public.can_manage_pos(v_owner) then raise exception '리그장만 가능'; end if;
  update public.leagues set phase = 'final' where id = p_league_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.ledger_is_closed(p_venue uuid, p_date date, p_game_seq smallint DEFAULT 1)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select closed from public.ledger_sessions
    where venue_id = p_venue and session_date = p_date and game_seq = p_game_seq), false);
$function$
;

CREATE OR REPLACE FUNCTION public.link_customer_alias(p_venue_id uuid, p_alias text, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_alias text := btrim(coalesce(p_alias,'')); v_disp text;
begin
  if not public.can_manage_pos(p_venue_id) then raise exception '권한이 없습니다'; end if;
  if v_alias = '' or p_user_id is null then raise exception '연결 대상을 지정하세요'; end if;
  insert into public.customer_aliases(venue_id, alias, user_id) values (p_venue_id, v_alias, p_user_id)
    on conflict (venue_id, alias) do update set user_id = excluded.user_id, created_at = now();
  select coalesce(nullif(btrim(nickname),''), name) into v_disp from public.profiles where id = p_user_id;
  insert into public.customer_profiles(venue_id, user_id, name, visit_count)
    values (p_venue_id, p_user_id, coalesce(v_disp, v_alias), 0)
    on conflict (venue_id, user_id) where user_id is not null do nothing;
  -- 동명(대소문자·공백 무시) 미연결 row 들의 방문수를 회원 row 로 합산 후 삭제
  update public.customer_profiles t set
    visit_count = coalesce(t.visit_count,0) + coalesce((select sum(visit_count) from public.customer_profiles o where o.venue_id=p_venue_id and o.user_id is null and lower(btrim(o.name))=lower(v_alias)),0),
    first_visit_at = least(t.first_visit_at, (select min(first_visit_at) from public.customer_profiles o where o.venue_id=p_venue_id and o.user_id is null and lower(btrim(o.name))=lower(v_alias))),
    last_visit_at = greatest(t.last_visit_at, (select max(last_visit_at) from public.customer_profiles o where o.venue_id=p_venue_id and o.user_id is null and lower(btrim(o.name))=lower(v_alias))),
    updated_at = now()
   where t.venue_id = p_venue_id and t.user_id = p_user_id;
  delete from public.customer_profiles where venue_id = p_venue_id and user_id is null and lower(btrim(name)) = lower(v_alias);
end $function$
;

CREATE OR REPLACE FUNCTION public.list_venue_owners(p_venue_id uuid)
 RETURNS TABLE(user_id uuid, nickname text, name text, is_primary boolean, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select vo.user_id, p.nickname, p.name, (v.owner_id = vo.user_id) as is_primary, vo.status
  from public.venue_owners vo
  join public.profiles p on p.id = vo.user_id
  join public.venues v on v.id = vo.venue_id
  where vo.venue_id = p_venue_id and can_manage_pos(p_venue_id)
  order by is_primary desc, (vo.status = 'approved') desc, p.nickname;
$function$
;

CREATE OR REPLACE FUNCTION public.list_venue_seasons(p_venue_id uuid)
 RETURNS SETOF venue_seasons
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from public.venue_seasons where venue_id=p_venue_id order by created_at desc;
$function$
;

CREATE OR REPLACE FUNCTION public.log_consent_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_op = 'INSERT' or new.agreed_to_terms is distinct from old.agreed_to_terms then
    insert into public.consent_logs(user_id, doc_type, agreed) values (new.id, 'terms', coalesce(new.agreed_to_terms,false)); end if;
  if tg_op = 'INSERT' or new.agreed_to_privacy is distinct from old.agreed_to_privacy then
    insert into public.consent_logs(user_id, doc_type, agreed) values (new.id, 'privacy', coalesce(new.agreed_to_privacy,false)); end if;
  if tg_op = 'INSERT' or new.agreed_to_marketing is distinct from old.agreed_to_marketing then
    insert into public.consent_logs(user_id, doc_type, agreed) values (new.id, 'marketing', coalesce(new.agreed_to_marketing,false)); end if;
  if tg_op = 'INSERT' or new.agreed_to_anti_gambling is distinct from old.agreed_to_anti_gambling then
    insert into public.consent_logs(user_id, doc_type, agreed) values (new.id, 'anti_gambling', coalesce(new.agreed_to_anti_gambling,false)); end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.manage_staff(p_staff_id uuid, p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner_venue uuid; v_staff_venue uuid;
begin
  select v.id into v_owner_venue
    from public.venues v
    join public.profiles p on p.id = auth.uid() and p.role = 'venue_owner' and p.approved
   where v.owner_id = auth.uid()
   limit 1;
  if v_owner_venue is null then raise exception '직원을 관리할 권한이 없습니다'; end if;
  select venue_id into v_staff_venue from public.profiles where id = p_staff_id and role = 'venue_staff';
  if v_staff_venue is null or v_staff_venue <> v_owner_venue then
    raise exception '본인 매장 직원만 관리할 수 있습니다';
  end if;
  if p_action = 'approve' then update public.profiles set approved = true  where id = p_staff_id;
  elsif p_action = 'reject' then update public.profiles set approved = false where id = p_staff_id;
  elsif p_action = 'remove' then update public.profiles set role = 'user', venue_id = null, approved = false where id = p_staff_id;
  else raise exception '알 수 없는 작업'; end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.my_championships(p_nickname text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::int from public.venue_season_results
  where rank = 1 and coalesce(trim(p_nickname),'') <> '' and lower(nickname) = lower(trim(p_nickname));
$function$
;

CREATE OR REPLACE FUNCTION public.my_play_history()
 RETURNS TABLE(venue_id uuid, venue_name text, moneyin_count bigint, total_amount bigint, last_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (
    select coalesce(real_name,'') rn, coalesce(nickname,'') nk, coalesce(name,'') nm
    from public.profiles where id = auth.uid()
  )
  select b.venue_id, v.name,
         count(*)::bigint,
         coalesce(sum(coalesce(b.cash_amount,0)+coalesce(b.card_amount,0)+coalesce(b.transfer_amount,0)+coalesce(b.unpaid_amount,0)),0)::bigint,
         max(b.buyin_at)
  from public.ledger_buyins b
  cross join me
  left join public.venues v on v.id = b.venue_id
  where (me.rn <> '' and btrim(b.player_name) = me.rn)
     or (me.nk <> '' and btrim(b.player_name) = me.nk)
     or (me.nm <> '' and btrim(b.player_name) = me.nm)
  group by b.venue_id, v.name
  order by max(b.buyin_at) desc nulls last;
$function$
;

CREATE OR REPLACE FUNCTION public.my_referral_stats()
 RETURNS TABLE(invited integer, rewarded integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::int, count(*) filter (where rewarded_at is not null)::int
  from public.referrals where referrer_id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.my_role()
 RETURNS user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select role from public.profiles where id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.my_visited_venues()
 RETURNS TABLE(venue_id uuid, venue_name text, visits bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.venue_id, v.name, count(*)::bigint
  from public.schedule_reservations r
  join public.schedules s on s.id = r.schedule_id
  left join public.venues v on v.id = s.venue_id
  where r.user_id = auth.uid() and s.venue_id is not null
  group by s.venue_id, v.name
  order by count(*) desc;
$function$
;

CREATE OR REPLACE FUNCTION public.my_voucher_credit_requests(p_venue_id uuid)
 RETURNS TABLE(id uuid, amount integer, note text, status text, admin_note text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.id, r.amount, r.note, r.status, r.admin_note, r.created_at
  from public.voucher_credit_requests r
  where r.venue_id = p_venue_id and can_manage_pos(p_venue_id)
  order by r.created_at desc limit 10;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_followers_on_poster()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_inquiry_answered()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'answered'
     and coalesce(new.answer, '') <> ''
     and (old.status is distinct from 'answered' or new.answer is distinct from old.answer) then
    insert into public.notifications(user_id, type, title, message, link, read, avatar_text, avatar_color)
    values (new.user_id, 'qna', '문의 답변이 도착했어요',
            '「' || left(new.title, 30) || '」 문의에 운영자 답변이 등록되었습니다.',
            '/support', false, '💬', '#FCD535');
  end if;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.notify_league_invite()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare lname text; oname text;
begin
  select l.name, v.name into lname, oname from public.leagues l join public.venues v on v.id = l.owner_venue_id where l.id = new.league_id;
  insert into public.notifications (user_id, type, title, message, link, read)
  select pr.id, 'system', '연합 리그 초대',
    coalesce(oname,'매장') || ' 매장이 「' || coalesce(lname,'리그') || '」 연합 리그에 초대했습니다 — 내 매장 → 연합 리그에서 수락/거절하세요.', '/', false
  from public.profiles pr where pr.venue_id = new.venue_id and coalesce(pr.mute_venue_notify, false) = false;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_league_response()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare lname text; vname text; owner_vid uuid;
begin
  if new.status = old.status or new.status = 'pending' then return new; end if;
  select l.name, l.owner_venue_id into lname, owner_vid from public.leagues l where l.id = new.league_id;
  select name into vname from public.venues where id = new.venue_id;
  insert into public.notifications (user_id, type, title, message, link, read)
  select pr.id, 'system', '연합 리그 ' || (case when new.status = 'accepted' then '수락' else '거절' end),
    coalesce(vname,'매장') || ' 매장이 「' || coalesce(lname,'리그') || '」 초대를 ' || (case when new.status = 'accepted' then '수락했습니다 🎉' else '거절했습니다' end), '/', false
  from public.profiles pr where pr.venue_id = owner_vid and coalesce(pr.mute_venue_notify, false) = false;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_ledger_open(p_venue_id uuid, p_title text, p_operator_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cnt int := 0;
  v_venue text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if not public.can_access_ledger(p_venue_id) then raise exception '장부 권한이 없습니다'; end if;
  select name into v_venue from venues where id = p_venue_id;
  insert into notifications (user_id, type, title, message, link, avatar_text)
  select p.id, 'system', '📒 장부 시작',
         format('%s — %s 장부가 시작됐어요. 담당 직원으로 지정되었습니다.', coalesce(v_venue, '매장'), coalesce(nullif(trim(p_title), ''), '오늘')),
         '/my-store/ledger',
         '📒'
  from profiles p
  where p.id = any(p_operator_ids) and p.id <> auth.uid();
  get diagnostics v_cnt = row_count;
  return v_cnt;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid; v_title text;
begin
  if new.schedule_id is not null then
    select owner_id into v_owner from public.schedules where id = new.schedule_id;
    v_title := '내 포스터에 새 문의가 등록되었습니다';
  elsif new.venue_id is not null then
    select owner_id into v_owner from public.venues where id = new.venue_id;
    v_title := '내 매장 커뮤니티에 새 댓글이 등록되었습니다';
  else
    return new;
  end if;
  if v_owner is null or v_owner = new.user_id then return new; end if;
  insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, read)
  values (v_owner, 'comment', v_title, left(coalesce(new.content, ''), 80),
          left(coalesce(new.user_name, '?'), 1), '#5A6175', false);
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_owner_approved()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.approved = true and (old.approved is distinct from true) and new.role = 'venue_owner' then
    insert into public.notifications (user_id, type, title, message, avatar_color, read)
    values (new.id, 'approval', '매장 업주 승인 완료',
            '승인이 완료되었습니다. 이제 포스터를 등록할 수 있습니다.', '#FFD100', false);
  end if;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_post_like()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_author uuid; v_liker text;
begin
  select user_id into v_author from public.community_posts where id = new.post_id;
  if v_author is null or v_author = new.user_id then return new; end if; -- 본인 좋아요 제외
  select coalesce(nullif(btrim(nickname), ''), name) into v_liker from public.profiles where id = new.user_id;
  insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, read)
  values (v_author, 'system', '❤️ 내 글에 좋아요가 달렸어요',
          coalesce(v_liker, '회원') || '님이 회원님의 글을 좋아합니다', '❤️', '#FF4D6D', false);
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_owner uuid; v_vname text;
begin
  select owner_id, name into v_owner, v_vname from public.venues where id = new.venue_id;
  if v_owner is null or v_owner = new.user_id then return new; end if;
  insert into public.notifications(user_id, type, title, message, avatar_text, avatar_color, read)
  values (v_owner, 'system',
    case when new.rating <= 2 then '🚨 낮은 평점 후기' else '⭐ 새 매장 후기' end,
    coalesce(v_vname,'내 매장') || ' · ' || new.rating || '점' || case when btrim(coalesce(new.content,'')) <> '' then ' — ' || left(new.content, 60) else '' end,
    '⭐', case when new.rating <= 2 then '#FF4D6D' else '#FCD535' end, false);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_schedule_approved()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.approved = true and (old.approved is distinct from true) then
    if new.owner_id is not null then
      insert into public.notifications (user_id, type, title, message, avatar_color, read)
      values (new.owner_id, 'approval', '포스터 승인 완료',
              coalesce(new.title, '') || ' 포스터가 승인되어 메인에 게시되었습니다.', '#FFD100', false);
    end if;
    if new.venue_id is not null then
      insert into public.notifications (user_id, type, title, message, avatar_color, read)
      select vf.user_id, 'system', '팔로우 매장 새 포스터',
             coalesce(new.title, '') || ' 포스터가 등록되었습니다.', '#FFD100', false
      from public.venue_follows vf
      where vf.venue_id = new.venue_id and vf.user_id <> coalesce(new.owner_id, '00000000-0000-0000-0000-000000000000');
    end if;
  end if;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.notify_venue_staff(p_venue_id uuid, p_title text, p_message text, p_link text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer;
begin
  if not (public.can_manage_pos(p_venue_id) or exists (select 1 from public.venues where id = p_venue_id and owner_id = auth.uid())) then
    raise exception 'permission denied';
  end if;
  insert into public.notifications (user_id, type, title, message, link, read)
  select pr.id, 'system', p_title, p_message, p_link, false
  from public.profiles pr
  where pr.venue_id = p_venue_id
    and coalesce(pr.mute_venue_notify, false) = false; -- 수신 거부자 제외
  get diagnostics n = row_count;
  return n;
end; $function$
;

CREATE OR REPLACE FUNCTION public.on_post_reaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    update public.community_posts
       set badbeat_count = badbeat_count + (case when new.type = 'badbeat' then 1 else 0 end),
           goodrun_count = goodrun_count + (case when new.type = 'goodrun' then 1 else 0 end)
     where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.community_posts
       set badbeat_count = greatest(0, badbeat_count - (case when old.type = 'badbeat' then 1 else 0 end)),
           goodrun_count = greatest(0, goodrun_count - (case when old.type = 'goodrun' then 1 else 0 end))
     where id = old.post_id;
    return old;
  elsif tg_op = 'UPDATE' and new.type <> old.type then
    update public.community_posts
       set badbeat_count = greatest(0, badbeat_count + (case when new.type = 'badbeat' then 1 when old.type = 'badbeat' then -1 else 0 end)),
           goodrun_count = greatest(0, goodrun_count + (case when new.type = 'goodrun' then 1 when old.type = 'goodrun' then -1 else 0 end))
     where id = new.post_id;
  end if;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.parse_prize_man(p_prize text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(round(substring(replace(coalesce(p_prize,''),',','') from '[0-9]+(?:\.[0-9]+)?')::numeric)::int, 0);
$function$
;

CREATE OR REPLACE FUNCTION public.placement_points(p_venue_id uuid, p_position integer)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when pp is not null and jsonb_typeof(pp)='array' and jsonb_array_length(pp) > 0 then
      case when p_position between 1 and jsonb_array_length(pp)
           then coalesce((pp->>(p_position-1))::int, 1) else 1 end
    else case p_position when 1 then 10 when 2 then 7 when 3 then 5 when 4 then 3 when 5 then 2 else 1 end
  end
  from (select (select page_config->'placementPoints' from public.venues where id=p_venue_id) as pp) s;
$function$
;

CREATE OR REPLACE FUNCTION public.pos_has_password(p_venue_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.venue_pos_settings s WHERE s.venue_id = p_venue_id AND s.cancel_password_hash IS NOT NULL);
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_self_approve_poster()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- 관리자만 approved 변경 가능. 그 외(업주·무인증 등)는 원래 값 유지(NULL-safe).
  if coalesce(public.my_role()::text, '') <> 'admin' then
    new.approved := old.approved;
  end if;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.public_activity_points(p_ids uuid[])
 RETURNS TABLE(id uuid, points integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, coalesce(p.activity_points, 0)::int
  from public.profiles p
  where p.id = any(p_ids);
$function$
;

CREATE OR REPLACE FUNCTION public.purge_old_client_errors()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  delete from public.client_errors where created_at < now() - interval '30 days';
$function$
;

CREATE OR REPLACE FUNCTION public.push_on_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform net.http_post(
    url     := 'https://idsxiqspecrucvfvtgbw.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc3hpcXNwZWNydWN2ZnZ0Z2J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzA0OTUsImV4cCI6MjA5NTY0NjQ5NX0.3Ljf6EjlnBXqRfzyb7VMiRJ9-El6JsfL5UGdXAWCI0c'
    ),
    body    := jsonb_build_object('type', 'INSERT', 'record', to_jsonb(new))
  );
  return new;
exception when others then
  -- 푸시 호출 실패가 알림 생성 트랜잭션을 막지 않도록
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_referral(p_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_referrer uuid; v_me uuid := auth.uid(); v_created timestamptz;
begin
  if v_me is null or coalesce(trim(p_code),'') = '' then return false; end if;
  if exists (select 1 from public.referrals where referee_id = v_me) then return false; end if;
  select created_at into v_created from auth.users where id = v_me;
  if v_created is null or v_created < now() - interval '14 days' then return false; end if; -- 신규 가입만(어뷰즈 방지)
  select id into v_referrer from public.profiles where lower(nickname) = lower(trim(p_code)) limit 1;
  if v_referrer is null or v_referrer = v_me then return false; end if;
  insert into public.referrals (referee_id, referrer_id, code) values (v_me, v_referrer, trim(p_code))
    on conflict (referee_id) do nothing;
  perform public._grant_referral_reward(v_me);
  return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.redeem_my_voucher(p_voucher_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_holder uuid; v_venue uuid; v_name text;
begin
  select holder_user_id, venue_id into v_holder, v_venue from public.store_vouchers where id = p_voucher_id and status='active';
  if v_holder is null or v_holder <> auth.uid() then raise exception '본인이 보유한 이용권만 사용할 수 있습니다'; end if;
  update public.store_vouchers set status='used', used_venue_id = v_venue, used_at = now() where id = p_voucher_id and status='active';
  select name into v_name from public.venues where id = v_venue;
  return coalesce(v_name, '매장');
end $function$
;

CREATE OR REPLACE FUNCTION public.redeem_my_voucher_by_phone(p_voucher_id uuid, p_phone text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_holder uuid; v_venue uuid; v_owner uuid; v_ownerphone text; v_norm text; v_name text;
begin
  v_norm := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
  if length(v_norm) < 9 then raise exception '전화번호를 정확히 입력하세요'; end if;
  select holder_user_id, venue_id into v_holder, v_venue from public.store_vouchers where id = p_voucher_id and status='active';
  if v_holder is null or v_holder <> auth.uid() then raise exception '본인이 보유한 이용권만 사용할 수 있습니다'; end if;
  select owner_id, name into v_owner, v_name from public.venues where id = v_venue;
  select regexp_replace(coalesce(p.phone,''), '[^0-9]', '', 'g') into v_ownerphone from public.profiles p where p.id = v_owner;
  if v_ownerphone is null or v_ownerphone = '' then
    select regexp_replace(coalesce(contact_phone,''), '[^0-9]', '', 'g') into v_ownerphone from public.venues where id = v_venue;
  end if;
  if v_ownerphone is null or v_ownerphone = '' or v_ownerphone <> v_norm then raise exception '이 매장 업주의 전화번호가 아닙니다'; end if;
  update public.store_vouchers set status='used', used_venue_id = v_venue, used_at = now() where id = p_voucher_id and status='active';
  return coalesce(v_name, '매장');
end $function$
;

CREATE OR REPLACE FUNCTION public.redeem_my_voucher_by_qr(p_voucher_id uuid, p_venue_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_holder uuid; v_venue uuid; v_name text;
begin
  select holder_user_id, venue_id into v_holder, v_venue from public.store_vouchers where id = p_voucher_id and status='active';
  if v_holder is null or v_holder <> auth.uid() then raise exception '본인이 보유한 이용권만 사용할 수 있습니다'; end if;
  if v_venue <> p_venue_id then raise exception '이 매장의 이용권이 아닙니다 (발급 매장에서만 사용 가능)'; end if;
  update public.store_vouchers set status='used', used_venue_id = v_venue, used_at = now() where id = p_voucher_id and status='active';
  select name into v_name from public.venues where id = v_venue;
  return coalesce(v_name, '매장');
end $function$
;

CREATE OR REPLACE FUNCTION public.redeem_voucher(p_voucher_id uuid, p_used_venue_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not can_manage_venue(p_used_venue_id) then raise exception '권한이 없습니다'; end if;
  update public.store_vouchers set status='used', used_venue_id=p_used_venue_id, used_at=now()
   where id=p_voucher_id and status='active';
  if not found then raise exception '사용 처리할 수 없는 이용권입니다 (이미 사용/만료/취소됨)'; end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.reject_buyin_request(p_request_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r ledger_buyin_requests;
begin
  select * into r from ledger_buyin_requests where id = p_request_id;
  if not found then raise exception '요청을 찾을 수 없습니다'; end if;
  if not can_access_ledger(r.venue_id) then raise exception '권한이 없습니다'; end if;
  update ledger_buyin_requests set status = 'rejected', resolve_note = nullif(trim(p_reason), ''), resolved_at = now(), resolved_by = auth.uid() where id = p_request_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.remove_venue_owner(p_venue_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not can_manage_pos(p_venue_id) then raise exception '권한이 없습니다'; end if;
  if (select owner_id from public.venues where id = p_venue_id) = p_user_id then
    raise exception '대표 업주는 제거할 수 없습니다 — 대표 변경 후 진행하세요';
  end if;
  delete from public.venue_owners where venue_id = p_venue_id and user_id = p_user_id;
  update public.profiles set venue_id = null where id = p_user_id and venue_id = p_venue_id
    and not exists (select 1 from public.venue_owners where user_id = p_user_id);
end $function$
;

CREATE OR REPLACE FUNCTION public.remove_venue_staff(p_staff_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_venue uuid;
begin
  select venue_id into v_venue from public.venue_staff where id = p_staff_id;
  if v_venue is null then return; end if;
  if not can_manage_venue_staff(v_venue) then raise exception '권한이 없습니다'; end if;
  delete from public.venue_staff where id = p_staff_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.reopen_ledger_session(p_venue_id uuid, p_date date, p_game_seq smallint DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.can_manage_pos(p_venue_id) then raise exception '마감 해제는 매장 업주만 가능합니다'; end if;
  update public.ledger_sessions
    set closed = false, closed_at = null, updated_at = now()
    where venue_id = p_venue_id and session_date = p_date and game_seq = p_game_seq;
end; $function$
;

CREATE OR REPLACE FUNCTION public.reply_to_review(p_review_id uuid, p_reply text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_venue uuid;
begin
  select venue_id into v_venue from public.venue_reviews where id = p_review_id;
  if v_venue is null then raise exception '후기를 찾을 수 없습니다'; end if;
  if not public.can_manage_pos(v_venue) then raise exception '권한이 없습니다'; end if;
  update public.venue_reviews
     set owner_reply = nullif(btrim(p_reply), ''),
         owner_reply_at = case when btrim(coalesce(p_reply,'')) = '' then null else now() end
   where id = p_review_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.request_buyin(p_venue_id uuid, p_note text DEFAULT NULL::text, p_game_seq smallint DEFAULT NULL::smallint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_name text; v_venue text; v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  select name into v_venue from venues where id = p_venue_id;
  if v_venue is null then raise exception '매장을 찾을 수 없습니다'; end if;
  select coalesce(nullif(trim(nickname), ''), nullif(trim(name), ''), '회원') into v_name from profiles where id = auth.uid();
  if exists (select 1 from ledger_buyin_requests where venue_id = p_venue_id and session_date = v_today and user_id = auth.uid() and status = 'pending') then
    update ledger_buyin_requests set requested_game_seq = coalesce(p_game_seq, requested_game_seq), note = coalesce(nullif(trim(p_note), ''), note)
      where venue_id = p_venue_id and session_date = v_today and user_id = auth.uid() and status = 'pending';
    return v_venue;
  end if;
  insert into ledger_buyin_requests (venue_id, session_date, user_id, player_name, note, status, requested_game_seq)
  values (p_venue_id, v_today, auth.uid(), coalesce(v_name, '회원'), nullif(trim(p_note), ''), 'pending', p_game_seq);
  return v_venue;
end; $function$
;

CREATE OR REPLACE FUNCTION public.request_voucher_credit(p_venue_id uuid, p_amount integer, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not can_manage_pos(p_venue_id) then raise exception '업주만 충전 요청을 남길 수 있습니다'; end if;
  if coalesce(p_amount, 0) < 1 then raise exception '수량을 입력해 주세요'; end if;
  if exists (select 1 from public.voucher_credit_requests where venue_id = p_venue_id and status = 'pending') then
    raise exception '이미 대기 중인 충전 요청이 있습니다 — 운영자 승인을 기다려 주세요';
  end if;
  insert into public.voucher_credit_requests(venue_id, requested_by, amount, note)
  values (p_venue_id, auth.uid(), least(p_amount, 100000), nullif(btrim(coalesce(p_note,'')), ''));
end $function$
;

CREATE OR REPLACE FUNCTION public.reserve_schedule(p_schedule_id uuid, p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  if v_name = '' then v_name := '예약자'; end if;
  v_name := left(v_name, 30);
  if exists (
    select 1 from schedule_reservations
    where schedule_id = p_schedule_id
      and lower(display_name) = lower(v_name)
      and user_id <> v_uid
  ) then
    raise exception '이미 등록된 닉네임입니다';
  end if;
  insert into schedule_reservations (schedule_id, user_id, display_name)
  values (p_schedule_id, v_uid, v_name)
  on conflict (schedule_id, user_id) do update set display_name = excluded.display_name;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.respond_staff_invite(p_invite_id uuid, p_accept boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_venue uuid; v_user uuid;
begin
  select venue_id, user_id into v_venue, v_user from public.venue_staff_invites
   where id = p_invite_id and status = 'pending';
  if v_user is null or v_user <> auth.uid() then raise exception '초대를 찾을 수 없습니다'; end if;
  if p_accept then
    update public.profiles set role='venue_staff', venue_id=v_venue, approved=true where id=auth.uid();
    update public.venue_staff_invites set status='accepted' where id=p_invite_id;
  else
    update public.venue_staff_invites set status='declined' where id=p_invite_id;
  end if;
end; $function$
;

CREATE OR REPLACE FUNCTION public.revoke_ledger_access(p_venue_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not can_manage_pos(p_venue_id) then raise exception '권한이 없습니다'; end if;
  delete from public.ledger_access where venue_id = p_venue_id and user_id = p_user_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.revoke_voucher(p_voucher_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_venue uuid;
begin
  select venue_id into v_venue from public.store_vouchers where id=p_voucher_id;
  if v_venue is null or not can_manage_pos(v_venue) then raise exception '권한이 없습니다 — 업주만 취소할 수 있습니다'; end if;
  update public.store_vouchers set status='revoked' where id=p_voucher_id and status='active';
end $function$
;

CREATE OR REPLACE FUNCTION public.revoke_voucher_access(p_venue_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not can_manage_pos(p_venue_id) then raise exception '권한이 없습니다'; end if;
  delete from public.voucher_access where venue_id = p_venue_id and user_id = p_user_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.rl_comments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if exists (select 1 from public.comments where user_id = new.user_id and created_at > now() - interval '5 seconds') then
    raise exception '댓글은 5초에 한 번만 작성할 수 있습니다.';
  end if;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.rl_live()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if exists (select 1 from public.live_wall where user_id = new.user_id and created_at > now() - interval '3 seconds') then
    raise exception '실시간 댓글은 3초에 한 번만 작성할 수 있습니다.';
  end if;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.rl_posts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if exists (select 1 from public.community_posts where user_id = new.user_id and created_at > now() - interval '12 seconds') then
    raise exception '게시글은 12초에 한 번만 작성할 수 있습니다. 잠시 후 다시 시도해 주세요.';
  end if;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.save_venue_rankings(p_venue_id uuid, p_date date, p_entries jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e jsonb; i int := 0; v_uid uuid; v_pts int;
begin
  if not public.can_manage_venue(p_venue_id) then raise exception '순위를 입력할 권한이 없습니다'; end if;
  update public.profiles p set activity_points = greatest(0, coalesce(p.activity_points,0) - a.points)
    from public.ranking_point_awards a
    where a.venue_id = p_venue_id and a.ranking_date = p_date and a.user_id = p.id;
  delete from public.ranking_point_awards where venue_id = p_venue_id and ranking_date = p_date;
  delete from public.venue_rankings where venue_id = p_venue_id and ranking_date = p_date;
  for e in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    if coalesce(trim(e->>'nickname'), '') = '' then continue; end if;
    i := i + 1;
    insert into public.venue_rankings (venue_id, ranking_date, position, nickname, real_name, prize, created_by)
    values (p_venue_id, p_date, i,
            left(trim(coalesce(e->>'nickname', '')), 30),
            nullif(left(trim(coalesce(e->>'realName', '')), 20), ''),
            nullif(left(trim(coalesce(e->>'prize', '')), 40), ''),
            auth.uid());
    select id into v_uid from public.profiles where lower(trim(nickname)) = lower(trim(e->>'nickname')) limit 1;
    if v_uid is not null then
      v_pts := public.placement_points(p_venue_id, i);
      insert into public.ranking_point_awards(venue_id, ranking_date, user_id, points)
        values (p_venue_id, p_date, v_uid, v_pts)
        on conflict (venue_id, ranking_date, user_id) do update set points = ranking_point_awards.points + excluded.points;
      update public.profiles set activity_points = coalesce(activity_points,0) + v_pts where id = v_uid;
    end if;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_venue_rankings(p_venue_id uuid, p_date date, p_entries jsonb, p_event text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e jsonb; i int := 0; v_uid uuid; v_pts int; v_ev text := left(coalesce(trim(p_event), ''), 40);
begin
  if not public.can_manage_venue(p_venue_id) then raise exception '순위를 입력할 권한이 없습니다'; end if;
  update public.profiles p set activity_points = greatest(0, coalesce(p.activity_points,0) - a.points)
    from public.ranking_point_awards a
    where a.venue_id = p_venue_id and a.ranking_date = p_date and a.event_name = v_ev and a.user_id = p.id;
  delete from public.ranking_point_awards where venue_id = p_venue_id and ranking_date = p_date and event_name = v_ev;
  delete from public.venue_rankings where venue_id = p_venue_id and ranking_date = p_date and event_name = v_ev;
  for e in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    if coalesce(trim(e->>'nickname'), '') = '' then continue; end if;
    i := i + 1;
    insert into public.venue_rankings (venue_id, ranking_date, event_name, position, nickname, real_name, prize, created_by)
    values (p_venue_id, p_date, v_ev, i,
            left(trim(coalesce(e->>'nickname', '')), 30),
            nullif(left(trim(coalesce(e->>'realName', '')), 20), ''),
            nullif(left(trim(coalesce(e->>'prize', '')), 40), ''),
            auth.uid());
    select id into v_uid from public.profiles where lower(trim(nickname)) = lower(trim(e->>'nickname')) limit 1;
    if v_uid is not null then
      v_pts := public.placement_points(p_venue_id, i);
      insert into public.ranking_point_awards(venue_id, ranking_date, event_name, user_id, points)
        values (p_venue_id, p_date, v_ev, v_uid, v_pts)
        on conflict (venue_id, ranking_date, event_name, user_id) do update set points = ranking_point_awards.points + excluded.points;
      update public.profiles set activity_points = coalesce(activity_points,0) + v_pts where id = v_uid;
    end if;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.schedule_reservations_for_owner(p_schedule_id uuid)
 RETURNS TABLE(id uuid, display_name text, nickname text, real_name text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.id, r.display_name, p.nickname, p.real_name, r.created_at
  from public.schedule_reservations r
  left join public.profiles p on p.id = r.user_id
  where r.schedule_id = p_schedule_id
    and exists (
      select 1 from public.schedules s
      where s.id = p_schedule_id and s.venue_id is not null and can_manage_pos(s.venue_id)
    )
  order by r.created_at asc;
$function$
;

CREATE OR REPLACE FUNCTION public.search_members_for_ranking(p_q text)
 RETURNS TABLE(nickname text, real_name text, verified boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.nickname, p.name, public.is_ci_verified(p.ci, p.verified_at) as verified
  from public.profiles p
  where exists (select 1 from profiles me where me.id = auth.uid() and me.role in ('venue_owner','admin'))
    and coalesce(p.status::text, 'active') = 'active'
    and btrim(coalesce(p_q, '')) <> ''
    and (p.nickname ilike '%' || btrim(p_q) || '%' or p.name ilike '%' || btrim(p_q) || '%')
  order by (p.nickname = btrim(p_q)) desc, p.nickname
  limit 8;
$function$
;

CREATE OR REPLACE FUNCTION public.search_registered_players(p_venue_id uuid, p_query text)
 RETURNS TABLE(user_id uuid, real_name text, nickname text, visits integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.real_name, p.nickname,
    coalesce((select count(*)::int from public.checkins c where c.user_id = p.id and c.venue_id = p_venue_id), 0) as visits
  from public.profiles p
  where can_access_ledger(p_venue_id)
    and btrim(coalesce(p_query, '')) <> ''
    and (p.nickname ilike '%' || btrim(p_query) || '%'
         or p.real_name ilike '%' || btrim(p_query) || '%'
         or p.name ilike '%' || btrim(p_query) || '%')
  order by visits desc, p.nickname
  limit 8;
$function$
;

CREATE OR REPLACE FUNCTION public.season_results(p_season_id uuid)
 RETURNS SETOF venue_season_results
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from public.venue_season_results where season_id=p_season_id order by rank;
$function$
;

CREATE OR REPLACE FUNCTION public.send_tournament_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s record; v_now timestamp; v_start timestamp; v_sent int;
begin
  v_now := now() at time zone 'Asia/Seoul';
  for s in
    select id, title, pub_name, date, start_time
      from public.schedules
     where approved = true
       and reminder_sent_at is null
       and date = v_now::date
  loop
    v_start := (s.date + coalesce(s.start_time, '19:00'::time))::timestamp;
    -- 시작 50~70분 전 윈도우(매 10분 크론과 맞물려 정확히 1회)
    if v_start - v_now between interval '50 minutes' and interval '70 minutes' then
      insert into public.notifications(user_id, type, title, message, avatar_text, avatar_color)
      select r.user_id, 'reminder',
             '⏰ 1시간 후 시작!',
             format('%s — %s %s 시작. 좋은 자리 잡으세요!', s.title, coalesce(s.pub_name, '매장'), to_char(v_start, 'HH24:MI')),
             '⏰', '#FFD100'
        from public.schedule_reservations r
       where r.schedule_id = s.id and r.user_id is not null;
      update public.schedules set reminder_sent_at = now() where id = s.id;
      get diagnostics v_sent = row_count;
    end if;
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.send_venue_announcement(p_venue_id uuid, p_title text, p_message text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_count int; v_today int;
begin
  -- 방어적 게이트: 무인증/권한없음/NULL 전부 차단(NULL → false 로 강제)
  if auth.uid() is null or not coalesce(public.can_manage_pos(p_venue_id), false) then
    raise exception '권한이 없습니다';
  end if;
  if coalesce(trim(p_title),'') = '' or coalesce(trim(p_message),'') = '' then raise exception '제목과 내용을 입력하세요'; end if;
  select count(*) into v_today from public.venue_announcements
    where venue_id = p_venue_id and sent_at > now() - interval '24 hours';
  if v_today >= 3 then raise exception '하루 3회까지 보낼 수 있습니다 (24시간 내 %회 발송)', v_today; end if;
  insert into public.notifications (user_id, type, title, message, link, read)
    select vf.user_id, 'system', left(trim(p_title), 60), left(trim(p_message), 200), '/', false
    from public.venue_follows vf where vf.venue_id = p_venue_id;
  get diagnostics v_count = row_count;
  insert into public.venue_announcements (venue_id, sent_by, title, message, recipients)
    values (p_venue_id, auth.uid(), left(trim(p_title),60), left(trim(p_message),200), v_count);
  return v_count;
end $function$
;

CREATE OR REPLACE FUNCTION public.send_weekly_venue_reports()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v record;
  v_start date; v_end date;
  v_entries int; v_sales bigint; v_new int; v_total_players int;
  v_worst_day text; v_worst_cnt int; v_best_cnt int; v_days int;
  v_advice text;
  v_side_entries int; v_side_sales bigint; v_side_line text;
begin
  v_start := (date_trunc('week', ((now() at time zone 'Asia/Seoul')::date - 7)::timestamp))::date;
  v_end := v_start + 6;
  for v in select id, name, owner_id from public.venues where owner_id is not null loop
    select count(*),
           coalesce(sum(
             case
               when b.is_split then coalesce(b.cash_amount,0) + coalesce(b.card_amount,0) + coalesce(b.transfer_amount,0)
               when b.payment_method in ('support','ticket') then 0
               when b.is_unpaid then 0
               when b.payment_method = 'card' then coalesce(nullif(s.card_amount, 0), s.buyin_amount)
               else s.buyin_amount
             end), 0)
      into v_entries, v_sales
      from public.ledger_buyins b
      join public.ledger_sessions s on s.venue_id = b.venue_id and s.session_date = b.session_date and s.game_seq = b.game_seq
     where b.venue_id = v.id and b.session_date between v_start and v_end;
    if v_entries = 0 then continue; end if;

    select count(*),
           coalesce(sum(
             case
               when b.is_split then coalesce(b.cash_amount,0) + coalesce(b.card_amount,0) + coalesce(b.transfer_amount,0)
               when b.payment_method in ('support','ticket') then 0
               when b.is_unpaid then 0
               when b.payment_method = 'card' then coalesce(nullif(s.card_amount, 0), s.buyin_amount)
               else s.buyin_amount
             end), 0)
      into v_side_entries, v_side_sales
      from public.ledger_buyins b
      join public.ledger_sessions s on s.venue_id = b.venue_id and s.session_date = b.session_date and s.game_seq = b.game_seq
     where b.venue_id = v.id and b.session_date between v_start and v_end and b.game_seq > 1;
    if v_side_entries > 0 then
      v_side_line := format(E'\n🎲 사이드 %s건 · 매출 %s만원', v_side_entries, (v_side_sales / 10000)::bigint);
    else
      v_side_line := '';
    end if;

    select count(distinct lp.name) into v_new
      from public.ledger_players lp
     where lp.venue_id = v.id and lp.session_date between v_start and v_end
       and not exists (
         select 1 from public.ledger_players p2
          where p2.venue_id = v.id and p2.name = lp.name and p2.session_date < v_start);
    select count(distinct lp.name) into v_total_players
      from public.ledger_players lp
     where lp.venue_id = v.id and lp.session_date between v_start and v_end;

    select day_label, cnt, max_cnt, n_days into v_worst_day, v_worst_cnt, v_best_cnt, v_days
      from (
        select g.day_label, g.cnt,
               max(g.cnt) over () as max_cnt,
               count(*) over () as n_days
          from (
            select case extract(dow from b.session_date)
                     when 0 then '일' when 1 then '월' when 2 then '화' when 3 then '수'
                     when 4 then '목' when 5 then '금' else '토' end as day_label,
                   count(*) as cnt
              from public.ledger_buyins b
             where b.venue_id = v.id and b.session_date between v_start and v_end
             group by extract(dow from b.session_date)
          ) g
        order by g.cnt asc limit 1
      ) t;

    if v_days >= 2 and v_worst_cnt * 2 < v_best_cnt then
      v_advice := format('%s요일이 약했어요(%s건) — %s요일 프리롤·이벤트로 끌어올려 보세요.', v_worst_day, v_worst_cnt, v_worst_day);
    elsif v_total_players > 0 and v_new * 100 >= v_total_players * 30 then
      v_advice := format('신규 손님이 %s명이나 왔어요 — 첫 방문 쿠폰으로 단골 전환을 노려보세요.', v_new);
    else
      v_advice := '이번 주도 꾸준했어요 — 단골 재방문 이벤트로 한 번 더 끌어올려 보세요.';
    end if;

    insert into public.notifications(user_id, type, title, message, avatar_text, avatar_color)
    values (v.owner_id, 'report',
      '📊 ' || v.name || ' 주간 리포트',
      format('지난주(%s~%s) 엔트리 %s건 · 매출 %s만원 · 신규 손님 %s명%s' || E'\n' || '💡 %s',
             to_char(v_start, 'MM/DD'), to_char(v_end, 'MM/DD'), v_entries, (v_sales / 10000)::bigint, v_new, v_side_line, v_advice),
      '📊', '#FFD100');
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_app_setting(p_key text, p_value text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if my_role() <> 'admin'::user_role then raise exception '권한이 없습니다 — 운영자 전용'; end if;
  insert into public.app_settings(key, value, updated_at) values (p_key, nullif(btrim(p_value), ''), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end; $function$
;

CREATE OR REPLACE FUNCTION public.set_kill_password(p_venue_id uuid, p_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.venues where id = p_venue_id;
  if v_owner is null then raise exception '매장을 찾을 수 없습니다'; end if;
  if auth.uid() is null or auth.uid() <> v_owner then raise exception '매장 대표 업주만 설정할 수 있습니다'; end if;
  if length(coalesce(p_password, '')) < 4 then raise exception '비밀번호는 4자 이상이어야 합니다'; end if;
  if exists(select 1 from public.venue_kill_switch where venue_id = p_venue_id) then
    raise exception '킬스위치 비밀번호는 이미 설정되어 변경할 수 없습니다';
  end if;
  insert into public.venue_kill_switch(venue_id, pw_hash) values(p_venue_id, crypt(p_password, gen_salt('bf')));
end $function$
;

CREATE OR REPLACE FUNCTION public.set_my_nickname(p_nickname text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v text := nullif(btrim(p_nickname), '');
begin
  if v is null then raise exception '닉네임(아이디)을 입력하세요'; end if;
  if char_length(v) > 20 then raise exception '닉네임은 20자 이하로 입력하세요'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and nickname_locked) then
    raise exception '아이디(닉네임)는 초기 설정 후 변경할 수 없습니다. 변경은 운영자에게 문의하세요.';
  end if;
  if exists (select 1 from public.profiles where lower(nickname) = lower(v) and id <> auth.uid()) then
    raise exception '이미 사용 중인 아이디(닉네임)입니다';
  end if;
  update public.profiles set nickname = v, nickname_locked = true where id = auth.uid();
end; $function$
;

CREATE OR REPLACE FUNCTION public.set_my_venue_notify(p_mute boolean)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.profiles set mute_venue_notify = p_mute where id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.set_pos_cancel_password(p_venue_id uuid, p_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not can_manage_pos(p_venue_id) then raise exception '권한이 없습니다'; end if;
  if coalesce(length(btrim(p_password)),0) < 4 then raise exception '비밀번호는 4자리 이상이어야 합니다'; end if;
  insert into public.venue_pos_settings (venue_id, cancel_password_hash, updated_at)
  values (p_venue_id, extensions.crypt(p_password, extensions.gen_salt('bf')), now())
  on conflict (venue_id) do update
    set cancel_password_hash = excluded.cancel_password_hash, updated_at = now();
end; $function$
;

CREATE OR REPLACE FUNCTION public.set_staff_title(p_staff_id uuid, p_title text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner_venue uuid; v_staff_venue uuid;
begin
  select v.id into v_owner_venue
    from public.venues v
    join public.profiles p on p.id = auth.uid() and p.role = 'venue_owner' and p.approved
   where v.owner_id = auth.uid()
   limit 1;
  if v_owner_venue is null then raise exception '직원을 관리할 권한이 없습니다'; end if;
  select venue_id into v_staff_venue from public.profiles where id = p_staff_id and role = 'venue_staff';
  if v_staff_venue is null or v_staff_venue <> v_owner_venue then
    raise exception '본인 매장 직원만 관리할 수 있습니다';
  end if;
  update public.profiles set staff_title = nullif(left(trim(coalesce(p_title,'')), 20), '') where id = p_staff_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_venue_page_config(p_venue_id uuid, p_config jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.can_manage_pos(p_venue_id) then
    raise exception '권한이 없습니다';
  end if;
  update public.venues set page_config = p_config, updated_at = now() where id = p_venue_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_venue_slug(p_venue_id uuid, p_slug text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s text := lower(trim(p_slug));
begin
  if not public.can_manage_pos(p_venue_id) then raise exception '권한이 없습니다'; end if;
  if s = '' then update public.venues set slug = null where id = p_venue_id; return; end if;
  if s !~ '^[a-z0-9][a-z0-9-]{1,19}$' then
    raise exception '링크는 영문 소문자·숫자·하이픈(-)으로 2~20자여야 합니다';
  end if;
  if s in ('s','api','admin','login','signup','app','www','assets','venue','post','help') then
    raise exception '사용할 수 없는 예약어입니다';
  end if;
  if exists (select 1 from public.venues where lower(slug) = s and id <> p_venue_id) then
    raise exception '이미 사용 중인 링크입니다 — 다른 이름을 선택하세요';
  end if;
  update public.venues set slug = s, updated_at = now() where id = p_venue_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_voucher_issue_approval(p_venue_id uuid, p_approved boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if my_role() <> 'admin' then raise exception '운영자만 가능합니다'; end if;
  update public.venues set voucher_issue_approved = p_approved where id = p_venue_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.sync_venue_followers()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    update public.venues set follower_count = coalesce(follower_count, 0) + 1 where id = new.venue_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.venues set follower_count = greatest(0, coalesce(follower_count, 0) - 1) where id = old.venue_id;
    return old;
  end if;
  return null;
end; $function$
;

CREATE OR REPLACE FUNCTION public.toggle_post_like(p_post_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid(); v_liked boolean; v_count int;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  if exists (select 1 from public.post_likes where post_id = p_post_id and user_id = v_uid) then
    delete from public.post_likes where post_id = p_post_id and user_id = v_uid;
    update public.community_posts set like_count = greatest(0, coalesce(like_count,0) - 1) where id = p_post_id;
    v_liked := false;
  else
    insert into public.post_likes(post_id, user_id) values (p_post_id, v_uid) on conflict do nothing;
    update public.community_posts set like_count = coalesce(like_count,0) + 1 where id = p_post_id;
    v_liked := true;
  end if;
  select coalesce(like_count,0) into v_count from public.community_posts where id = p_post_id;
  return jsonb_build_object('liked', v_liked, 'count', v_count);
end $function$
;

CREATE OR REPLACE FUNCTION public.transfer_venue_primary(p_venue_id uuid, p_new_owner_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (my_role() = 'admin' or (select owner_id from public.venues where id = p_venue_id) = auth.uid()) then
    raise exception '대표 교체는 현재 대표 또는 운영자만 가능합니다';
  end if;
  if not exists (select 1 from public.venue_owners where venue_id = p_venue_id and user_id = p_new_owner_id and status = 'approved') then
    raise exception '새 대표는 먼저 승인된 공동 사장이어야 합니다';
  end if;
  update public.venues set owner_id = p_new_owner_id, updated_at = now() where id = p_venue_id;
  update public.profiles set venue_id = coalesce(venue_id, p_venue_id), role = 'venue_owner', approved = true where id = p_new_owner_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.unlink_customer_alias(p_venue_id uuid, p_alias text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.can_manage_pos(p_venue_id) then raise exception '권한이 없습니다'; end if;
  delete from public.customer_aliases where venue_id = p_venue_id and alias = btrim(coalesce(p_alias,''));
end $function$
;

CREATE OR REPLACE FUNCTION public.update_qna_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if TG_OP = 'INSERT' and NEW.schedule_id is not null then
    update public.schedules set unread_qna_count = unread_qna_count + 1 where id = NEW.schedule_id;
  elsif TG_OP = 'DELETE' and OLD.schedule_id is not null then
    update public.schedules set unread_qna_count = greatest(0, unread_qna_count - 1) where id = OLD.schedule_id;
  end if;
  return coalesce(NEW, OLD);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_venue_address(p_venue_id uuid, p_address text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.can_manage_venue(p_venue_id) then raise exception '주소를 수정할 권한이 없습니다'; end if;
  update public.venues set address = coalesce(trim(p_address), '') where id = p_venue_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.update_venue_contact(p_venue_id uuid, p_address text, p_phone text, p_hours text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.can_manage_venue(p_venue_id) then raise exception '매장 정보를 수정할 권한이 없습니다'; end if;
  update public.venues set
    address       = coalesce(trim(p_address), ''),
    contact_phone = nullif(trim(p_phone), ''),
    business_hours = nullif(trim(p_hours), ''),
    updated_at    = now()
  where id = p_venue_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.update_venue_staff(p_staff_id uuid, p_name text DEFAULT NULL::text, p_position text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_venue uuid;
begin
  select venue_id into v_venue from public.venue_staff where id = p_staff_id;
  if v_venue is null then raise exception '직원을 찾을 수 없습니다'; end if;
  if not can_manage_venue_staff(v_venue) then raise exception '권한이 없습니다'; end if;
  update public.venue_staff
     set staff_name     = coalesce(nullif(btrim(p_name), ''), staff_name),
         staff_position = case when p_position is null then staff_position else nullif(btrim(p_position), '') end
   where id = p_staff_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.venue_announce_status(p_venue_id uuid)
 RETURNS TABLE(followers integer, sent_today integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.can_manage_pos(p_venue_id) then return; end if;
  return query select
    (select count(*)::int from public.venue_follows where venue_id = p_venue_id),
    (select count(*)::int from public.venue_announcements where venue_id = p_venue_id and sent_at > now() - interval '24 hours');
end $function$
;

CREATE OR REPLACE FUNCTION public.venue_buyin_counts(p_venue_id uuid)
 RETURNS TABLE(name text, buyin_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select b.player_name as name, count(*)::bigint as buyin_count
  from public.ledger_buyins b
  where b.venue_id = p_venue_id
  group by b.player_name
$function$
;

CREATE OR REPLACE FUNCTION public.venue_hall_of_fame(p_venue_id uuid)
 RETURNS TABLE(season_id uuid, season_name text, ends_on date, nickname text, real_name text, points integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.id, s.name, s.ends_on, r.nickname, r.real_name, r.points
  from public.venue_seasons s
  join public.venue_season_results r on r.season_id = s.id and r.rank = 1
  where s.venue_id = p_venue_id and s.status = 'ended'
  order by s.ends_on desc;
$function$
;

CREATE OR REPLACE FUNCTION public.venue_player_counts(p_venue_id uuid)
 RETURNS TABLE(name text, buyin_count bigint, visit_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select b.player_name as name,
         count(*)::bigint as buyin_count,
         count(distinct b.session_date)::bigint as visit_count
  from public.ledger_buyins b
  where b.venue_id = p_venue_id
  group by b.player_name
$function$
;

CREATE OR REPLACE FUNCTION public.venue_today_games(p_venue_id uuid)
 RETURNS TABLE(game_seq smallint, title text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.game_seq, coalesce(nullif(trim(s.title), ''), case when s.game_seq = 1 then '메인' else '사이드' || (s.game_seq - 1) end) as title
  from ledger_sessions s where s.venue_id = p_venue_id and s.session_date = current_date
  order by s.game_seq;
$function$
;

CREATE OR REPLACE FUNCTION public.venues_season_leaders(p_venue_ids uuid[])
 RETURNS TABLE(venue_id uuid, season_name text, nickname text, real_name text, points integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with s as (
    select venue_id, name, starts_on, ends_on
    from public.venue_seasons where status = 'active' and venue_id = any(p_venue_ids)
  ),
  agg as (
    select s.venue_id, s.name as season_name, vr.nickname, max(vr.real_name) as real_name,
      sum(public.placement_points(s.venue_id, vr.position))::int as points
    from s
    join public.venue_rankings vr
      on vr.venue_id = s.venue_id and vr.ranking_date >= s.starts_on and vr.ranking_date <= s.ends_on
     and coalesce(trim(vr.nickname), '') <> ''
    group by s.venue_id, s.name, vr.nickname
  )
  select distinct on (venue_id) venue_id, season_name, nickname, real_name, points
  from agg order by venue_id, points desc, nickname;
$function$
;

CREATE OR REPLACE FUNCTION public.voucher_history(p_venue_id uuid)
 RETURNS TABLE(id uuid, title text, holder_name text, real_name text, nickname text, used_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select sv.id, sv.title, sv.holder_name, p.real_name, p.nickname, sv.used_at
  from public.store_vouchers sv
  left join public.profiles p on p.id = sv.holder_user_id
  where sv.venue_id = p_venue_id and sv.status='used' and can_view_vouchers(p_venue_id)
  order by sv.used_at desc nulls last
  limit 100;
$function$
;

CREATE OR REPLACE FUNCTION public.voucher_holder_profiles(p_venue_id uuid)
 RETURNS TABLE(user_id uuid, real_name text, nickname text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.real_name, p.nickname
  from public.profiles p
  where can_view_vouchers(p_venue_id)
    and p.id in (select distinct holder_user_id from public.store_vouchers
                 where venue_id = p_venue_id and holder_user_id is not null);
$function$
;

CREATE OR REPLACE FUNCTION public.voucher_holder_stats(p_venue_id uuid)
 RETURNS TABLE(holder_count bigint, active_count bigint, used_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    count(distinct holder_user_id) filter (where status='active' and holder_user_id is not null)::bigint,
    count(*) filter (where status='active')::bigint,
    count(*) filter (where status='used')::bigint
  from public.store_vouchers
  where venue_id = p_venue_id and can_view_vouchers(p_venue_id);
$function$
;

CREATE OR REPLACE FUNCTION public.voucher_issue_approved(p_venue_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select voucher_issue_approved from public.venues where id = p_venue_id), false);
$function$
;

CREATE OR REPLACE FUNCTION public.voucher_redeem_to_ledger_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'used' and (old.status is distinct from 'used') and new.used_venue_id is not null then
    insert into public.ledger_buyin_requests(venue_id, session_date, user_id, player_name, note, status, voucher_id)
    select
      new.used_venue_id,
      (now() at time zone 'Asia/Seoul')::date,
      new.holder_user_id,
      coalesce(nullif(btrim(new.holder_name), ''), '이용권 사용자'),
      '🎟 이용권 사용 — ' || coalesce(nullif(btrim(new.title), ''), '매장이용권') || ' · 수량/현금 확인 후 승인',
      'pending',
      new.id
    where not exists (select 1 from public.ledger_buyin_requests where voucher_id = new.id);
  end if;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.voucher_usage_by_venue(p_venue_id uuid)
 RETURNS TABLE(used_venue_id uuid, venue_name text, used_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select sv.used_venue_id, v.name, count(*)::bigint
  from public.store_vouchers sv
  left join public.venues v on v.id = sv.used_venue_id
  where sv.venue_id = p_venue_id and sv.status='used' and can_manage_pos(p_venue_id)
  group by sv.used_venue_id, v.name
  order by count(*) desc;
$function$
;

CREATE OR REPLACE FUNCTION public.weekly_league(p_limit integer DEFAULT 20)
 RETURNS TABLE(user_id uuid, nickname text, score bigint, checkins bigint, placements bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH wk AS (SELECT (date_trunc('week', (now() at time zone 'Asia/Seoul')::timestamp))::date AS s),
  ck AS (
    SELECT c.user_id, count(*) AS n
    FROM checkins c, wk
    WHERE c.created_at >= (wk.s::timestamp at time zone 'Asia/Seoul')
    GROUP BY c.user_id
  ),
  pl AS (
    SELECT p.id AS user_id, count(*) AS n,
           sum(CASE vr.position WHEN 1 THEN 10 WHEN 2 THEN 7 WHEN 3 THEN 5 ELSE 3 END) AS pts
    FROM venue_rankings vr
    JOIN profiles p ON lower(p.nickname) = lower(vr.nickname), wk
    WHERE vr.ranking_date >= wk.s
    GROUP BY p.id
  )
  SELECT pr.id, coalesce(pr.nickname, pr.name),
         (coalesce(ck.n,0) * 3 + coalesce(pl.pts,0))::bigint,
         coalesce(ck.n,0)::bigint, coalesce(pl.n,0)::bigint
  FROM profiles pr
  LEFT JOIN ck ON ck.user_id = pr.id
  LEFT JOIN pl ON pl.user_id = pr.id
  WHERE pr.role <> 'admin' AND (coalesce(ck.n,0) > 0 OR coalesce(pl.n,0) > 0)
  ORDER BY 3 DESC, 4 DESC
  LIMIT p_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.withdraw_my_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_suffix text;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  if exists (select 1 from public.venues where owner_id = v_uid) then
    raise exception '매장 대표는 매장을 먼저 정리(삭제 또는 대표 양도)한 뒤 탈퇴할 수 있습니다';
  end if;
  v_suffix := substr(replace(v_uid::text, '-', ''), 1, 12);
  update public.profiles set
    status        = 'withdrawn',
    nickname      = '탈퇴회원_' || v_suffix,
    email         = 'withdrawn_' || v_suffix || '@deleted.invalid',
    real_name     = null,
    phone         = null,
    ci            = null,
    verified_at   = null,
    birth_date    = null,
    gender        = null,
    carrier       = null,
    venue_id      = null,
    sanction_reason = '본인 탈퇴'
  where id = v_uid;
  -- 매장 직원/공동업주 연결 해제(대표가 아닌 경우)
  delete from public.venue_staff  where user_id = v_uid;
  delete from public.venue_owners where user_id = v_uid;
end; $function$
;

-- ============================================================
-- 8. 트리거 (public 40)
--    ※ public.handle_new_user() 를 쓰는 auth.users 트리거는 auth 스키마 소속이라 본 목록 밖(아래 주석 참조)
-- ============================================================

CREATE TRIGGER trg_award_comment_points AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION award_comment_points();
CREATE TRIGGER trg_block_ugc BEFORE INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION block_ugc_trigger();
CREATE TRIGGER trg_fill_comment_avatar BEFORE INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION fill_user_avatar();
CREATE TRIGGER trg_notify_on_comment AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION notify_on_comment();
CREATE TRIGGER trg_qna_count AFTER INSERT OR DELETE ON public.comments FOR EACH ROW EXECUTE FUNCTION update_qna_count();
CREATE TRIGGER trg_rl_comments BEFORE INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION rl_comments();
CREATE TRIGGER trg_award_post_points AFTER INSERT ON public.community_posts FOR EACH ROW EXECUTE FUNCTION award_post_points();
CREATE TRIGGER trg_block_ugc BEFORE INSERT ON public.community_posts FOR EACH ROW EXECUTE FUNCTION block_ugc_trigger();
CREATE TRIGGER trg_fill_post_avatar BEFORE INSERT ON public.community_posts FOR EACH ROW EXECUTE FUNCTION fill_user_avatar();
CREATE TRIGGER trg_rl_posts BEFORE INSERT ON public.community_posts FOR EACH ROW EXECUTE FUNCTION rl_posts();
CREATE TRIGGER trg_fill_dealer_post_author BEFORE INSERT ON public.dealer_posts FOR EACH ROW EXECUTE FUNCTION fill_dealer_post_author();
CREATE TRIGGER trg_league_invite AFTER INSERT ON public.league_members FOR EACH ROW EXECUTE FUNCTION notify_league_invite();
CREATE TRIGGER trg_league_response AFTER UPDATE OF status ON public.league_members FOR EACH ROW EXECUTE FUNCTION notify_league_response();
CREATE TRIGGER trg_buyin_request_notify AFTER INSERT ON public.ledger_buyin_requests FOR EACH ROW EXECUTE FUNCTION _notify_buyin_request();
CREATE TRIGGER trg_block_ugc BEFORE INSERT ON public.live_wall FOR EACH ROW EXECUTE FUNCTION block_ugc_trigger();
CREATE TRIGGER trg_cap_live_wall AFTER INSERT ON public.live_wall FOR EACH STATEMENT EXECUTE FUNCTION cap_live_wall();
CREATE TRIGGER trg_fill_live_avatar BEFORE INSERT ON public.live_wall FOR EACH ROW EXECUTE FUNCTION fill_user_avatar();
CREATE TRIGGER trg_rl_live BEFORE INSERT ON public.live_wall FOR EACH ROW EXECUTE FUNCTION rl_live();
CREATE TRIGGER trg_push_on_notification AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION push_on_notification();
CREATE TRIGGER trg_fill_owner_post_author BEFORE INSERT ON public.owner_posts FOR EACH ROW EXECUTE FUNCTION fill_owner_post_author();
CREATE TRIGGER trg_notify_post_like AFTER INSERT ON public.post_likes FOR EACH ROW EXECUTE FUNCTION notify_on_post_like();
CREATE TRIGGER trg_post_reaction AFTER INSERT OR DELETE OR UPDATE ON public.post_reactions FOR EACH ROW EXECUTE FUNCTION on_post_reaction();
CREATE TRIGGER trg_enforce_nickname_cooldown BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION enforce_nickname_cooldown();
CREATE TRIGGER trg_guard_profile_privileged BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_privileged_cols();
CREATE TRIGGER trg_log_consent AFTER INSERT OR UPDATE OF agreed_to_terms, agreed_to_privacy, agreed_to_marketing, agreed_to_anti_gambling ON public.profiles FOR EACH ROW EXECUTE FUNCTION log_consent_changes();
CREATE TRIGGER trg_notify_level_up AFTER UPDATE OF activity_points ON public.profiles FOR EACH ROW EXECUTE FUNCTION _notify_level_up();
CREATE TRIGGER trg_notify_owner_approved AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION notify_on_owner_approved();
CREATE TRIGGER trg_referral_reward_on_verify AFTER UPDATE OF ci ON public.profiles FOR EACH ROW EXECUTE FUNCTION _referral_reward_on_verify();
CREATE TRIGGER trg_auto_blind_reported_post AFTER INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION auto_blind_reported_post();
CREATE TRIGGER trg_auto_approve_poster BEFORE INSERT ON public.schedules FOR EACH ROW EXECUTE FUNCTION auto_approve_verified_poster();
CREATE TRIGGER trg_notify_followers_poster AFTER INSERT OR UPDATE OF approved ON public.schedules FOR EACH ROW EXECUTE FUNCTION notify_followers_on_poster();
CREATE TRIGGER trg_notify_schedule_approved AFTER UPDATE ON public.schedules FOR EACH ROW EXECUTE FUNCTION notify_on_schedule_approved();
CREATE TRIGGER trg_prevent_self_approve BEFORE UPDATE ON public.schedules FOR EACH ROW EXECUTE FUNCTION prevent_self_approve_poster();
CREATE TRIGGER trg_voucher_redeem_to_ledger AFTER UPDATE ON public.store_vouchers FOR EACH ROW EXECUTE FUNCTION voucher_redeem_to_ledger_request();
CREATE TRIGGER trg_voucher_used_checkin AFTER UPDATE ON public.store_vouchers FOR EACH ROW EXECUTE FUNCTION _voucher_used_checkin();
CREATE TRIGGER trg_notify_inquiry_answered AFTER UPDATE ON public.support_inquiries FOR EACH ROW EXECUTE FUNCTION notify_inquiry_answered();
CREATE TRIGGER trg_sync_venue_followers AFTER INSERT OR DELETE ON public.venue_follows FOR EACH ROW EXECUTE FUNCTION sync_venue_followers();
CREATE TRIGGER trg_fill_venue_notice_author BEFORE INSERT ON public.venue_notices FOR EACH ROW EXECUTE FUNCTION fill_venue_notice_author();
CREATE TRIGGER trg_notify_review AFTER INSERT ON public.venue_reviews FOR EACH ROW EXECUTE FUNCTION notify_on_review();
CREATE TRIGGER trg_guard_venue_verification BEFORE UPDATE ON public.venues FOR EACH ROW EXECUTE FUNCTION guard_venue_verification();

-- (auth 스키마 소속이지만 앱 핵심 로직 — 신규 가입 시 public.profiles 자동 생성)
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 9. RLS 정책 (168) — pg_policies 기반 조립
-- ============================================================

create policy activity_log_admin_select on public.activity_log for select to public
  using ((my_role() = 'admin'::user_role));

create policy activity_log_insert on public.activity_log for insert to public
  with check (((( SELECT auth.uid() AS uid) = actor_id) OR (my_role() = 'admin'::user_role)));

create policy app_settings_admin_del on public.app_settings for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role)))));

create policy app_settings_admin_ins on public.app_settings for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role)))));

create policy app_settings_admin_upd on public.app_settings for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role)))))
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role)))));

create policy app_settings_read on public.app_settings for select to anon, authenticated
  using (true);

create policy audit_log_admin_select on public.audit_log for select to public
  using ((COALESCE((( SELECT my_role() AS my_role))::text, ''::text) = 'admin'::text));

create policy checkins_select on public.checkins for select to public
  using (((user_id = ( SELECT auth.uid() AS uid)) OR can_manage_venue(venue_id)));

create policy client_errors_admin_delete on public.client_errors for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role)))));

create policy client_errors_admin_select on public.client_errors for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role)))));

create policy client_errors_insert on public.client_errors for insert to anon, authenticated
  with check (((char_length(COALESCE(message, ''::text)) <= 2000) AND (char_length(COALESCE(stack, ''::text)) <= 6000) AND client_error_rate_ok()));

create policy clock_presets_rw on public.clock_presets for all to public
  using (can_access_ledger(venue_id))
  with check (can_access_ledger(venue_id));

create policy clock_states_del on public.clock_states for delete to public
  using (can_access_ledger(venue_id));

create policy clock_states_ins on public.clock_states for insert to public
  with check (can_access_ledger(venue_id));

create policy clock_states_public_read on public.clock_states for select to public
  using (true);

create policy clock_states_upd on public.clock_states for update to public
  using (can_access_ledger(venue_id))
  with check (can_access_ledger(venue_id));

create policy comments_delete on public.comments for delete to public
  using (((user_id = ( SELECT auth.uid() AS uid)) OR (my_role() = 'admin'::user_role) OR ((venue_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM venues v
  WHERE ((v.id = comments.venue_id) AND (v.owner_id = ( SELECT auth.uid() AS uid)))))) OR ((schedule_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM schedules s
  WHERE ((s.id = comments.schedule_id) AND (s.owner_id = ( SELECT auth.uid() AS uid))))))));

create policy comments_insert on public.comments for insert to public
  with check (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (user_id = ( SELECT auth.uid() AS uid))));

create policy comments_select on public.comments for select to public
  using (true);

create policy comments_update_self on public.comments for update to public
  using ((user_id = ( SELECT auth.uid() AS uid)));

create policy community_ads_admin_del on public.community_ads for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role)))));

create policy community_ads_admin_ins on public.community_ads for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role)))));

create policy community_ads_admin_upd on public.community_ads for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role)))))
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role)))));

create policy community_ads_read on public.community_ads for select to anon, authenticated
  using (true);

create policy posts_delete on public.community_posts for delete to public
  using (((user_id = ( SELECT auth.uid() AS uid)) OR (my_role() = 'admin'::user_role)));

create policy posts_insert on public.community_posts for insert to public
  with check (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (user_id = ( SELECT auth.uid() AS uid))));

create policy posts_select on public.community_posts for select to public
  using (true);

create policy consent_logs_select_own on public.consent_logs for select to public
  using (((user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) OR (COALESCE((( SELECT my_role() AS my_role))::text, ''::text) = 'admin'::text)));

create policy coupons_pos_all on public.coupons for all to public
  using (can_manage_pos(venue_id))
  with check (can_manage_pos(venue_id));

create policy custom_missions_admin_del on public.custom_missions for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role)))));

create policy custom_missions_admin_ins on public.custom_missions for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role)))));

create policy custom_missions_admin_upd on public.custom_missions for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role)))))
  with check ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role)))));

create policy custom_missions_read on public.custom_missions for select to anon, authenticated
  using (true);

create policy customer_aliases_pos on public.customer_aliases for all to public
  using (can_manage_pos(venue_id))
  with check (can_manage_pos(venue_id));

create policy customer_profiles_pos_all on public.customer_profiles for all to public
  using (can_manage_pos(venue_id))
  with check (can_manage_pos(venue_id));

create policy dealer_app_delete on public.dealer_applications for delete to authenticated
  using (((my_role() = 'admin'::user_role) OR (applicant_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM dealer_posts dp
  WHERE ((dp.id = dealer_applications.post_id) AND (dp.author_id = ( SELECT auth.uid() AS uid)))))));

create policy dealer_app_insert on public.dealer_applications for insert to authenticated
  with check ((applicant_id = ( SELECT auth.uid() AS uid)));

create policy dealer_app_read on public.dealer_applications for select to authenticated
  using (((my_role() = 'admin'::user_role) OR (EXISTS ( SELECT 1
   FROM dealer_posts dp
  WHERE ((dp.id = dealer_applications.post_id) AND (dp.author_id = ( SELECT auth.uid() AS uid))))) OR (applicant_id = ( SELECT auth.uid() AS uid))));

create policy dealer_posts_insert on public.dealer_posts for insert to public
  with check ((author_id = ( SELECT auth.uid() AS uid)));

create policy dealer_posts_read on public.dealer_posts for select to public
  using (((deleted = false) OR (my_role() = 'admin'::user_role)));

create policy dealer_posts_update on public.dealer_posts for update to public
  using (((my_role() = 'admin'::user_role) OR (author_id = ( SELECT auth.uid() AS uid))))
  with check (((my_role() = 'admin'::user_role) OR (author_id = ( SELECT auth.uid() AS uid))));

create policy dealer_shifts_pos_all on public.dealer_shifts for all to public
  using (can_manage_pos(venue_id))
  with check (can_manage_pos(venue_id));

create policy game_presets_all on public.game_presets for all to public
  using (can_manage_pos(venue_id))
  with check (can_manage_pos(venue_id));

create policy gm_delete on public.group_members for delete to authenticated
  using (((user_id = ( SELECT auth.uid() AS uid)) OR is_group_manager(group_id)));

create policy gm_read on public.group_members for select to authenticated
  using (((user_id = ( SELECT auth.uid() AS uid)) OR is_group_member(group_id) OR is_group_manager(group_id)));

create policy gm_update on public.group_members for update to authenticated
  using (is_group_manager(group_id))
  with check (is_group_manager(group_id));

create policy gmsg_delete on public.group_messages for delete to authenticated
  using (((user_id = ( SELECT auth.uid() AS uid)) OR is_group_manager(group_id)));

create policy gmsg_insert on public.group_messages for insert to authenticated
  with check (((user_id = ( SELECT auth.uid() AS uid)) AND (is_group_member(group_id) OR is_group_manager(group_id))));

create policy gmsg_read on public.group_messages for select to authenticated
  using ((is_group_member(group_id) OR is_group_manager(group_id)));

create policy gpost_delete on public.group_posts for delete to authenticated
  using (((author_id = ( SELECT auth.uid() AS uid)) OR is_group_manager(group_id)));

create policy gpost_insert on public.group_posts for insert to authenticated
  with check (((author_id = ( SELECT auth.uid() AS uid)) AND (is_group_member(group_id) OR is_group_manager(group_id))));

create policy gpost_read on public.group_posts for select to authenticated
  using (((deleted = false) AND (is_group_member(group_id) OR is_group_manager(group_id))));

create policy le_delete on public.league_entries for delete to public
  using ((can_access_ledger(venue_id) OR (EXISTS ( SELECT 1
   FROM leagues l
  WHERE ((l.id = league_entries.league_id) AND can_manage_pos(l.owner_venue_id))))));

create policy le_insert on public.league_entries for insert to public
  with check (((can_access_ledger(venue_id) AND (EXISTS ( SELECT 1
   FROM league_members m
  WHERE ((m.league_id = league_entries.league_id) AND (m.venue_id = league_entries.venue_id) AND (m.status = 'accepted'::text))))) OR (EXISTS ( SELECT 1
   FROM leagues l
  WHERE ((l.id = league_entries.league_id) AND (l.owner_venue_id = league_entries.venue_id) AND can_access_ledger(league_entries.venue_id))))));

create policy le_select on public.league_entries for select to public
  using (true);

create policy les_select on public.league_event_status for select to public
  using (is_league_participant(league_id));

create policy lm_delete on public.league_members for delete to public
  using ((can_manage_pos(venue_id) OR (EXISTS ( SELECT 1
   FROM leagues l
  WHERE ((l.id = league_members.league_id) AND can_manage_pos(l.owner_venue_id))))));

create policy lm_insert on public.league_members for insert to public
  with check ((EXISTS ( SELECT 1
   FROM leagues l
  WHERE ((l.id = league_members.league_id) AND can_manage_pos(l.owner_venue_id)))));

create policy lm_select on public.league_members for select to public
  using (true);

create policy lm_update on public.league_members for update to public
  using (can_manage_pos(venue_id));

create policy lg_delete on public.leagues for delete to public
  using (can_manage_pos(owner_venue_id));

create policy lg_insert on public.leagues for insert to public
  with check (can_manage_pos(owner_venue_id));

create policy lg_select on public.leagues for select to public
  using (true);

create policy lg_update on public.leagues for update to public
  using (can_manage_pos(owner_venue_id));

create policy la_select on public.ledger_access for select to public
  using ((can_manage_pos(venue_id) OR (user_id = ( SELECT auth.uid() AS uid))));

create policy lbr_insert_self on public.ledger_buyin_requests for insert to authenticated
  with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy lbr_select on public.ledger_buyin_requests for select to authenticated
  using (((user_id = ( SELECT auth.uid() AS uid)) OR can_access_ledger(venue_id)));

create policy lbr_update_op on public.ledger_buyin_requests for update to authenticated
  using (can_access_ledger(venue_id));

create policy lb_select on public.ledger_buyins for select to public
  using (can_access_ledger(venue_id));

create policy lb_update on public.ledger_buyins for update to public
  using ((can_access_ledger(venue_id) AND (NOT ledger_is_closed(venue_id, session_date, game_seq))));

create policy lb_write on public.ledger_buyins for insert to public
  with check ((can_access_ledger(venue_id) AND (NOT ledger_is_closed(venue_id, session_date, game_seq))));

create policy lp_delete on public.ledger_players for delete to public
  using (can_access_ledger(venue_id));

create policy lp_insert on public.ledger_players for insert to public
  with check (can_access_ledger(venue_id));

create policy lp_select on public.ledger_players for select to public
  using (can_access_ledger(venue_id));

create policy lp_update on public.ledger_players for update to public
  using (can_access_ledger(venue_id));

create policy ls_select on public.ledger_sessions for select to public
  using (can_access_ledger(venue_id));

create policy ls_update on public.ledger_sessions for update to public
  using (can_access_ledger(venue_id));

create policy ls_write on public.ledger_sessions for insert to public
  with check (can_access_ledger(venue_id));

create policy lmr_insert on public.listing_message_reads for insert to public
  with check (((reader_id = ( SELECT auth.uid() AS uid)) AND ((( SELECT auth.uid() AS uid) = buyer_id) OR (EXISTS ( SELECT 1
   FROM marketplace_listings l
  WHERE ((l.id = listing_message_reads.listing_id) AND (l.seller_id = ( SELECT auth.uid() AS uid))))))));

create policy lmr_select on public.listing_message_reads for select to public
  using (((( SELECT auth.uid() AS uid) = buyer_id) OR (EXISTS ( SELECT 1
   FROM marketplace_listings l
  WHERE ((l.id = listing_message_reads.listing_id) AND (l.seller_id = ( SELECT auth.uid() AS uid)))))));

create policy lmr_update on public.listing_message_reads for update to public
  using ((reader_id = ( SELECT auth.uid() AS uid)))
  with check ((reader_id = ( SELECT auth.uid() AS uid)));

create policy lm_insert on public.listing_messages for insert to public
  with check (((( SELECT auth.uid() AS uid) = sender_id) AND ((( SELECT auth.uid() AS uid) = buyer_id) OR (EXISTS ( SELECT 1
   FROM marketplace_listings l
  WHERE ((l.id = listing_messages.listing_id) AND (l.seller_id = ( SELECT auth.uid() AS uid))))))));

create policy lm_select on public.listing_messages for select to public
  using (((( SELECT auth.uid() AS uid) = buyer_id) OR (EXISTS ( SELECT 1
   FROM marketplace_listings l
  WHERE ((l.id = listing_messages.listing_id) AND (l.seller_id = ( SELECT auth.uid() AS uid)))))));

create policy live_wall_delete on public.live_wall for delete to public
  using (((( SELECT auth.uid() AS uid) = user_id) OR (my_role() = 'admin'::user_role)));

create policy live_wall_insert on public.live_wall for insert to public
  with check ((( SELECT auth.uid() AS uid) = user_id));

create policy live_wall_read on public.live_wall for select to public
  using (true);

create policy listings_delete on public.marketplace_listings for delete to public
  using (((seller_id = ( SELECT auth.uid() AS uid)) OR (my_role() = 'admin'::user_role)));

create policy listings_insert on public.marketplace_listings for insert to public
  with check (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (seller_id = ( SELECT auth.uid() AS uid))));

create policy listings_select on public.marketplace_listings for select to public
  using (true);

create policy listings_update on public.marketplace_listings for update to public
  using (((seller_id = ( SELECT auth.uid() AS uid)) OR (my_role() = 'admin'::user_role)));

create policy notices_admin_del on public.marketplace_notices for delete to public
  using ((my_role() = 'admin'::user_role));

create policy notices_admin_ins on public.marketplace_notices for insert to public
  with check ((my_role() = 'admin'::user_role));

create policy notices_admin_upd on public.marketplace_notices for update to public
  using ((my_role() = 'admin'::user_role))
  with check ((my_role() = 'admin'::user_role));

create policy notices_select on public.marketplace_notices for select to public
  using (true);

create policy mission_claims_own on public.mission_claims for select to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

create policy notif_select_self on public.notifications for select to public
  using ((user_id = ( SELECT auth.uid() AS uid)));

create policy notif_update_self on public.notifications for update to public
  using ((user_id = ( SELECT auth.uid() AS uid)));

create policy owner_posts_insert on public.owner_posts for insert to authenticated
  with check (((author_id = ( SELECT auth.uid() AS uid)) AND ((my_role() = 'admin'::user_role) OR is_verified_owner())));

create policy owner_posts_read on public.owner_posts for select to authenticated
  using (((my_role() = 'admin'::user_role) OR (is_verified_owner() AND (deleted = false) AND (created_at > (now() - '24:00:00'::interval)))));

create policy owner_posts_update on public.owner_posts for update to authenticated
  using (((my_role() = 'admin'::user_role) OR (author_id = ( SELECT auth.uid() AS uid))))
  with check (((my_role() = 'admin'::user_role) OR (author_id = ( SELECT auth.uid() AS uid))));

create policy post_likes_select_own on public.post_likes for select to public
  using ((user_id = ( SELECT auth.uid() AS uid)));

create policy pr_self on public.post_reactions for all to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy profiles_select on public.profiles for select to public
  using (((id = ( SELECT auth.uid() AS uid)) OR (my_role() = 'admin'::user_role)));

create policy profiles_update_self on public.profiles for update to public
  using (((id = ( SELECT auth.uid() AS uid)) OR (my_role() = 'admin'::user_role)));

create policy push_self on public.push_subscriptions for all to public
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));

create policy rv_admin_update on public.rank_verifications for update to public
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role)))));

create policy rv_insert_own on public.rank_verifications for insert to public
  with check ((( SELECT auth.uid() AS uid) = user_id));

create policy rv_select_own on public.rank_verifications for select to public
  using (((( SELECT auth.uid() AS uid) = user_id) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role))))));

create policy rpa_select on public.ranking_point_awards for select to public
  using ((can_manage_venue(venue_id) OR (user_id = ( SELECT auth.uid() AS uid))));

create policy referrals_select_own on public.referrals for select to public
  using (((( SELECT auth.uid() AS uid) = referrer_id) OR (( SELECT auth.uid() AS uid) = referee_id)));

create policy reports_admin_select on public.reports for select to public
  using ((my_role() = 'admin'::user_role));

create policy reports_admin_update on public.reports for update to public
  using ((my_role() = 'admin'::user_role));

create policy reports_insert on public.reports for insert to public
  with check ((( SELECT auth.uid() AS uid) = reporter_id));

create policy sr_delete on public.schedule_reservations for delete to public
  using (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (schedules s
     JOIN venues v ON ((v.id = s.venue_id)))
  WHERE ((s.id = schedule_reservations.schedule_id) AND (v.owner_id = ( SELECT auth.uid() AS uid))))) OR (my_role() = 'admin'::user_role)));

create policy sr_insert on public.schedule_reservations for insert to public
  with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy sr_select on public.schedule_reservations for select to public
  using (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (schedules s
     JOIN venues v ON ((v.id = s.venue_id)))
  WHERE ((s.id = schedule_reservations.schedule_id) AND (v.owner_id = ( SELECT auth.uid() AS uid))))) OR (my_role() = 'admin'::user_role)));

create policy sr_update on public.schedule_reservations for update to public
  using (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (schedules s
     JOIN venues v ON ((v.id = s.venue_id)))
  WHERE ((s.id = schedule_reservations.schedule_id) AND (v.owner_id = ( SELECT auth.uid() AS uid)))))));

create policy schedules_delete on public.schedules for delete to public
  using (((owner_id = ( SELECT auth.uid() AS uid)) OR (my_role() = 'admin'::user_role)));

create policy schedules_insert on public.schedules for insert to public
  with check (((owner_id = ( SELECT auth.uid() AS uid)) AND (my_role() = ANY (ARRAY['venue_owner'::user_role, 'admin'::user_role])) AND ((my_role() = 'admin'::user_role) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.approved = true)))))));

create policy schedules_select on public.schedules for select to public
  using (((approved = true) OR (owner_id = ( SELECT auth.uid() AS uid)) OR (my_role() = 'admin'::user_role)));

create policy schedules_update on public.schedules for update to public
  using (((owner_id = ( SELECT auth.uid() AS uid)) OR (my_role() = 'admin'::user_role)));

create policy staff_sched_delete on public.staff_schedule for delete to public
  using (can_manage_pos(venue_id));

create policy staff_sched_insert on public.staff_schedule for insert to public
  with check (can_manage_pos(venue_id));

create policy staff_sched_select on public.staff_schedule for select to public
  using (can_manage_pos(venue_id));

create policy staff_sched_update on public.staff_schedule for update to public
  using (can_access_ledger(venue_id))
  with check (can_access_ledger(venue_id));

create policy staff_wage_del on public.staff_wage for delete to public
  using (can_manage_pos(venue_id));

create policy staff_wage_ins on public.staff_wage for insert to public
  with check (can_manage_pos(venue_id));

create policy staff_wage_select on public.staff_wage for select to public
  using (can_manage_pos(venue_id));

create policy staff_wage_upd on public.staff_wage for update to public
  using (can_manage_pos(venue_id))
  with check (can_manage_pos(venue_id));

create policy store_vouchers_select on public.store_vouchers for select to public
  using (((holder_user_id = ( SELECT auth.uid() AS uid)) OR can_view_vouchers(venue_id) OR ((used_venue_id IS NOT NULL) AND can_view_vouchers(used_venue_id))));

create policy support_delete on public.support_inquiries for delete to public
  using (((user_id = ( SELECT auth.uid() AS uid)) OR (COALESCE((my_role())::text, ''::text) = 'admin'::text)));

create policy support_insert on public.support_inquiries for insert to public
  with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy support_select on public.support_inquiries for select to public
  using (((user_id = ( SELECT auth.uid() AS uid)) OR (COALESCE((my_role())::text, ''::text) = 'admin'::text)));

create policy support_update on public.support_inquiries for update to public
  using ((COALESCE((my_role())::text, ''::text) = 'admin'::text))
  with check ((COALESCE((my_role())::text, ''::text) = 'admin'::text));

create policy user_blocks_delete on public.user_blocks for delete to public
  using ((blocker_id = ( SELECT auth.uid() AS uid)));

create policy user_blocks_insert on public.user_blocks for insert to public
  with check (((blocker_id = ( SELECT auth.uid() AS uid)) AND (blocked_id <> ( SELECT auth.uid() AS uid))));

create policy user_blocks_select on public.user_blocks for select to public
  using ((blocker_id = ( SELECT auth.uid() AS uid)));

create policy venue_announcements_select on public.venue_announcements for select to public
  using (can_manage_pos(venue_id));

create policy venue_follows_self on public.venue_follows for all to public
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));

create policy vmsg_delete on public.venue_messages for delete to public
  using (((user_id = ( SELECT auth.uid() AS uid)) OR can_manage_venue(venue_id)));

create policy vmsg_insert on public.venue_messages for insert to public
  with check (((( SELECT auth.uid() AS uid) IS NOT NULL) AND (user_id = ( SELECT auth.uid() AS uid))));

create policy vmsg_select on public.venue_messages for select to public
  using (true);

create policy venue_notices_delete on public.venue_notices for delete to public
  using (((my_role() = 'admin'::user_role) OR (author_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM venues v
  WHERE ((v.id = venue_notices.venue_id) AND (v.owner_id = ( SELECT auth.uid() AS uid)))))));

create policy venue_notices_insert on public.venue_notices for insert to public
  with check (((author_id = ( SELECT auth.uid() AS uid)) AND ((my_role() = 'admin'::user_role) OR (EXISTS ( SELECT 1
   FROM venues v
  WHERE ((v.id = venue_notices.venue_id) AND (v.owner_id = ( SELECT auth.uid() AS uid))))))));

create policy venue_notices_read on public.venue_notices for select to public
  using (true);

create policy vps_select on public.venue_pos_settings for select to public
  using (can_access_ledger(venue_id));

create policy vr_del on public.venue_rankings for delete to authenticated
  using (can_manage_venue(venue_id));

create policy vr_ins on public.venue_rankings for insert to authenticated
  with check (can_manage_venue(venue_id));

create policy vr_read on public.venue_rankings for select to public
  using (true);

create policy vr_upd on public.venue_rankings for update to authenticated
  using (can_manage_venue(venue_id))
  with check (can_manage_venue(venue_id));

create policy venue_reviews_delete on public.venue_reviews for delete to authenticated
  using (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::user_role))))));

create policy venue_reviews_insert on public.venue_reviews for insert to authenticated
  with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM checkins c
  WHERE ((c.user_id = ( SELECT auth.uid() AS uid)) AND (c.venue_id = venue_reviews.venue_id))))));

create policy venue_reviews_read on public.venue_reviews for select to anon, authenticated
  using (true);

create policy venue_reviews_update on public.venue_reviews for update to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy vse_delete on public.venue_score_entries for delete to public
  using (can_access_ledger(venue_id));

create policy vse_insert on public.venue_score_entries for insert to public
  with check (can_access_ledger(venue_id));

create policy vse_select on public.venue_score_entries for select to public
  using (true);

create policy venue_season_results_read on public.venue_season_results for select to public
  using (true);

create policy venue_seasons_read on public.venue_seasons for select to public
  using (true);

create policy venue_staff_select on public.venue_staff for select to public
  using (((my_role() = 'admin'::user_role) OR (EXISTS ( SELECT 1
   FROM venues v
  WHERE ((v.id = venue_staff.venue_id) AND (v.owner_id = ( SELECT auth.uid() AS uid))))) OR (user_id = ( SELECT auth.uid() AS uid))));

create policy vsi_read on public.venue_staff_invites for select to authenticated
  using (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM venues v
  WHERE ((v.id = venue_staff_invites.venue_id) AND (v.owner_id = ( SELECT auth.uid() AS uid)))))));

create policy venues_delete on public.venues for delete to public
  using ((my_role() = 'admin'::user_role));

create policy venues_insert on public.venues for insert to public
  with check ((my_role() = ANY (ARRAY['admin'::user_role, 'venue_owner'::user_role])));

create policy venues_select on public.venues for select to public
  using (((approved = true) OR (owner_id = ( SELECT auth.uid() AS uid)) OR (my_role() = 'admin'::user_role)));

create policy venues_update on public.venues for update to public
  using (((owner_id = ( SELECT auth.uid() AS uid)) OR (my_role() = 'admin'::user_role)));

create policy voucher_access_select on public.voucher_access for select to public
  using ((can_manage_pos(venue_id) OR (user_id = ( SELECT auth.uid() AS uid))));

create policy voucher_transfers_select on public.voucher_transfers for select to public
  using (((from_user_id = ( SELECT auth.uid() AS uid)) OR (to_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM store_vouchers v
  WHERE ((v.id = voucher_transfers.voucher_id) AND can_view_vouchers(v.venue_id))))));

create policy waitlist_pos_all on public.waitlist for all to public
  using (can_manage_pos(venue_id))
  with check (can_manage_pos(venue_id));

-- ============================================================
-- 10. pg_cron 잡 (6) — 참조용 주석. 재구축 시 cron.schedule(...) 로 등록.
-- ============================================================

-- jobid 1 | owner_posts_expire     | */15 * * * *  (active)
--   update public.owner_posts set deleted = true, deleted_at = now()
--     where deleted = false and created_at < now() - interval '24 hours'
-- jobid 2 | weekly-venue-reports   | 5 0 * * 1     (active)
--   select public.send_weekly_venue_reports()
-- jobid 3 | tournament-reminders   | */10 * * * *  (active)
--   select public.send_tournament_reminders()
-- jobid 4 | expire-buyin-requests  | 30 15 * * *   (active)
--   select public.expire_old_buyin_requests();
-- jobid 5 | end-expired-seasons    | 40 15 * * *   (active)
--   select public.end_expired_seasons();
-- jobid 6 | purge-client-errors    | 30 3 * * *    (active)
--   select public.purge_old_client_errors()

-- 재구축 예시:
-- select cron.schedule('owner_posts_expire',    '*/15 * * * *', $$update public.owner_posts set deleted = true, deleted_at = now() where deleted = false and created_at < now() - interval '24 hours'$$);
-- select cron.schedule('weekly-venue-reports',  '5 0 * * 1',    $$select public.send_weekly_venue_reports()$$);
-- select cron.schedule('tournament-reminders',  '*/10 * * * *', $$select public.send_tournament_reminders()$$);
-- select cron.schedule('expire-buyin-requests', '30 15 * * *',  $$select public.expire_old_buyin_requests()$$);
-- select cron.schedule('end-expired-seasons',   '40 15 * * *',  $$select public.end_expired_seasons()$$);
-- select cron.schedule('purge-client-errors',   '30 3 * * *',   $$select public.purge_old_client_errors()$$);

-- ============================================================
-- 11. Realtime 퍼블리케이션 — supabase_realtime 에 포함된 public 테이블 (24)
-- ============================================================

alter publication supabase_realtime add table public.checkins;
alter publication supabase_realtime add table public.clock_states;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.community_posts;
alter publication supabase_realtime add table public.group_members;
alter publication supabase_realtime add table public.group_messages;
alter publication supabase_realtime add table public.league_event_status;
alter publication supabase_realtime add table public.leagues;
alter publication supabase_realtime add table public.ledger_buyin_requests;
alter publication supabase_realtime add table public.ledger_buyins;
alter publication supabase_realtime add table public.ledger_players;
alter publication supabase_realtime add table public.ledger_sessions;
alter publication supabase_realtime add table public.listing_messages;
alter publication supabase_realtime add table public.live_wall;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.schedule_reservations;
alter publication supabase_realtime add table public.schedules;
alter publication supabase_realtime add table public.staff_schedule;
alter publication supabase_realtime add table public.store_vouchers;
alter publication supabase_realtime add table public.support_inquiries;
alter publication supabase_realtime add table public.venue_messages;
alter publication supabase_realtime add table public.venue_rankings;
alter publication supabase_realtime add table public.venue_season_results;
alter publication supabase_realtime add table public.venue_seasons;

-- (supabase_realtime_messages_publication 의 realtime.messages_* 파티션은 Supabase 관리 영역 — 제외)

-- ============================================================
-- 끝. 스냅샷 대상 요약:
--   ENUM 11 · 시퀀스 1 · 테이블 73 · PK 73 · UNIQUE 11 · CHECK 25 · FK 107
--   인덱스 87(제약 인덱스 제외) · 함수 182(확장 제외) · 트리거 40(public)+1(auth.users)
--   RLS 정책 168 · cron 잡 6(주석) · realtime 테이블 24
-- ============================================================
