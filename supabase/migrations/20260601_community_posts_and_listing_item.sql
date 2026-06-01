-- ============================================================================
-- Stage 2 마이그레이션
--  1) listing_cat enum 에 'item'(아이템) 값 추가 (게임머니 대체 신규 카테고리).
--  2) community_posts: 글쓰기 폼 확장 — category / title / images 컬럼 추가,
--     content 길이 제한 2000 → 4000 확장.
--  모두 멱등(존재 시 무시) → 재실행 안전.
--
-- ⚠️ Postgres 제약: 'alter type ... add value'는 같은 트랜잭션에서 그 값을 즉시
--    사용할 수 없습니다. 이 파일은 add value를 먼저 두고, 이후 블록은 새 값을
--    "사용"하지 않으므로(컬럼 추가/제약만) Supabase SQL Editor에서 한 번에 실행 OK.
-- ============================================================================

-- ── 1) listing_cat enum 에 'item' 추가 ─────────────────────────────────────
alter type listing_cat add value if not exists 'item';

-- ── 2) community_posts 확장 ────────────────────────────────────────────────
-- 카테고리 enum (자유/질문/정보/후기). 이미 있으면 무시.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'post_category') then
    create type post_category as enum ('free', 'question', 'info', 'review');
  end if;
end$$;

alter table public.community_posts
  add column if not exists category post_category not null default 'free';

alter table public.community_posts
  add column if not exists title text;

alter table public.community_posts
  add column if not exists images text[] not null default '{}';

-- content 길이 제한 2000 → 4000 으로 확장 (기존 check 제약 동적 탐색 후 교체)
do $$
declare
  c_name text;
begin
  select con.conname into c_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  where ns.nspname = 'public'
    and rel.relname = 'community_posts'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%char_length(content)%';
  if c_name is not null then
    execute format('alter table public.community_posts drop constraint %I', c_name);
  end if;
end$$;

alter table public.community_posts
  add constraint community_posts_content_len
  check (char_length(content) between 1 and 4000);
