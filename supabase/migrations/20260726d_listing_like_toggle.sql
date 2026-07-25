-- 2026-07-26 (감사: 장터 찜 미저장): 찜을 컴포넌트 useState 에서 서버 영속으로 옮긴다.
-- 왜 post_likes/toggle_post_like 구조를 그대로 복제하는가:
--   테이블엔 '내 것 SELECT' 정책만 두고 쓰기는 SECURITY DEFINER RPC 한 곳으로만 통과시켜야,
--   찜 행과 listings.like_count 가 항상 같은 트랜잭션에서 움직인다. 쓰기 정책을 열면
--   클라이언트가 찜 행만 만들고 카운트를 따로 올리는(또는 안 올리는) 경로가 생긴다.
create table if not exists public.listing_likes (
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (listing_id, user_id)
);
alter table public.listing_likes enable row level security;

-- 왜 '내 것만' SELECT 인가: 누가 무엇을 찜했는지는 사생활이다. 총 개수는 marketplace_listings.like_count
-- 로만 공개한다. auth.uid() 는 (select ...) 로 감싼다 — 20260624a 의 initplan 규약(행마다 재평가 방지).
drop policy if exists listing_likes_select_own on public.listing_likes;
create policy listing_likes_select_own on public.listing_likes
  for select using (user_id = (select auth.uid()));

-- 찜 목록 화면이 user_id 로 조회하는데 PK 선두가 listing_id 라 PK 인덱스를 못 쓴다(20260623i 와 같은 이유).
-- created_at desc 를 붙여 '최근 찜한 순' 정렬까지 인덱스로 처리한다.
create index if not exists listing_likes_user_idx on public.listing_likes(user_id, created_at desc);

-- 토글: 있으면 취소(-1), 없으면 찜(+1). 서버 권위 카운트+liked 를 돌려줘 클라 낙관값을 확정시킨다.
create or replace function public.toggle_listing_like(p_listing_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_liked boolean; v_count int;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  if exists (select 1 from public.listing_likes where listing_id = p_listing_id and user_id = v_uid) then
    delete from public.listing_likes where listing_id = p_listing_id and user_id = v_uid;
    update public.marketplace_listings set like_count = greatest(0, coalesce(like_count,0) - 1) where id = p_listing_id;
    v_liked := false;
  else
    insert into public.listing_likes(listing_id, user_id) values (p_listing_id, v_uid) on conflict do nothing;
    update public.marketplace_listings set like_count = coalesce(like_count,0) + 1 where id = p_listing_id;
    v_liked := true;
  end if;
  select coalesce(like_count,0) into v_count from public.marketplace_listings where id = p_listing_id;
  return jsonb_build_object('liked', v_liked, 'count', v_count);
end $$;

-- 🔴 anon 을 '명시' revoke 해야 한다. Supabase 의 alter default privileges 가 함수 생성 시점에
-- anon 에게 EXECUTE 를 직접 부여하므로, revoke from public 만으로는 안 지워진다.
-- (실측: toggle_post_like 의 proacl 에 20260623f 의 revoke 후에도 anon=X 가 남아 있다 → 20260624b 와 같은 처리)
revoke all     on function public.toggle_listing_like(uuid) from public;
revoke execute on function public.toggle_listing_like(uuid) from anon;
grant  execute on function public.toggle_listing_like(uuid) to authenticated;

-- ── 자기검증 ────────────────────────────────────────────────────────────────
-- 구조가 의도대로 서지 않으면 예외로 전체를 롤백시킨다(DDL 트랜잭셔널).
-- (2)(5)가 핵심: 쓰기 정책이 하나라도 생기면 like_count 우회 경로가 열리고,
-- anon 실행권한이 남으면 20260624b 에서 막은 구멍이 그대로 다시 생긴다.
do $$
declare v_pol int; v_write int; v_unwrapped int; v_drift bigint;
begin
  -- (1) 테이블 + RLS 활성
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'listing_likes' and c.relrowsecurity
  ) then raise exception 'LISTING_LIKE ABORT: listing_likes 없음 또는 RLS 비활성'; end if;

  -- (2) 정책은 SELECT 하나뿐 — 쓰기는 오직 toggle_listing_like RPC 로만
  select count(*) into v_pol   from pg_policies where schemaname='public' and tablename='listing_likes';
  select count(*) into v_write from pg_policies where schemaname='public' and tablename='listing_likes' and cmd <> 'SELECT';
  if v_pol <> 1 or v_write <> 0 then
    raise exception 'LISTING_LIKE ABORT: 정책 %개(쓰기 %개) — SELECT 1개여야 함', v_pol, v_write;
  end if;

  -- (3) initplan 규약(20260624a): 정책에 미래핑 auth.fn() 이 남으면 안 된다
  select count(*) into v_unwrapped from pg_policies
  where schemaname='public' and tablename='listing_likes'
    and regexp_replace(coalesce(qual,'') || ' ' || coalesce(with_check,''),
          '\( SELECT auth\.(uid|role|jwt|email)\(\) AS (uid|role|jwt|email)\)', '', 'g')
        ~ 'auth\.(uid|role|jwt|email)\(\)';
  if v_unwrapped <> 0 then raise exception 'LISTING_LIKE ABORT: 정책에 미래핑 auth.uid() 잔존'; end if;

  -- (4) 함수: 존재 + SECURITY DEFINER + search_path 고정
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='toggle_listing_like'
      and p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%'
  ) then raise exception 'LISTING_LIKE ABORT: toggle_listing_like 없음 / SECURITY DEFINER 아님 / search_path 미고정'; end if;

  -- (5) 실행권한: authenticated 만. anon·PUBLIC 은 0
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='toggle_listing_like'
      and (has_function_privilege('anon', p.oid, 'execute')
           or coalesce(array_to_string(p.proacl, ','), '') ~ '(^|,)=[a-zA-Z]*/')
  ) then raise exception 'LISTING_LIKE ABORT: anon 또는 PUBLIC 에 execute 권한 잔존'; end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='toggle_listing_like'
      and has_function_privilege('authenticated', p.oid, 'execute')
  ) then raise exception 'LISTING_LIKE ABORT: authenticated 에 execute 권한 없음'; end if;

  -- (6) user_id 선두 인덱스(FK 미인덱스 advisor + 찜 목록 조회)
  if not exists (select 1 from pg_indexes where schemaname='public' and indexname='listing_likes_user_idx')
  then raise exception 'LISTING_LIKE ABORT: listing_likes_user_idx 없음'; end if;

  -- (7) 데이터 정합은 예외가 아니라 알림. 회원/매물 삭제 cascade 로 찜 행만 사라지면
  --     like_count 가 남아 드리프트가 생길 수 있고(post_likes 도 동일 특성), 그때 재실행이 막히면 곤란하다.
  select coalesce(sum(like_count), 0) - (select count(*) from public.listing_likes)
    into v_drift from public.marketplace_listings;
  if v_drift <> 0 then
    raise notice 'LISTING_LIKE WARN: like_count 합계와 찜 행 수가 % 만큼 다름 (삭제 cascade 흔적일 수 있음)', v_drift;
  end if;

  raise notice 'LISTING_LIKE OK: 테이블/RLS/정책1(SELECT)/RPC(secdef·authenticated only)/인덱스 검증 통과';
end $$;


적용 방법: Supabase SQL Editor 에 위 전문을 붙여넣고 1회 실행. 성공 시 `LISTING_LIKE OK: ...` notice 가 뜬다. (MCP `apply_migration` 도 가능하나 이 리포 관행대로 SQL Editor 권장.)
