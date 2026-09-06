-- ============================================================================
-- 장터 매물 조회수 — 올리는 코드가 아예 없어 영구히 0이던 것 (2026-09-07 전체 디버깅)
--
-- 무엇이 빠져 있었나
--   커뮤니티 글에는 increment_post_view, 일정에는 bump_schedule_view 가 있는데 **장터만 없었다**.
--   marketplace_listings.view_count 를 증가시키는 경로가 코드에도 DB(트리거·RPC)에도 0곳이다.
--   그래서 모든 매물이 '조회 0' 이고, 정렬 칩 '조회수순'(MarketplaceTab)은 비교값이 전부 0이라
--   정렬이 안정 정렬로 무너져 **최신순과 똑같은 결과**를 냈다 — 있는데 아무 일도 안 하는 기능이었다.
--
-- 왜 이 모양인가 — 20260905n(increment_post_view) 을 그대로 본뜬다
--   · 원장(listing_views)에 (매물, 열람자, KST 날짜) 로 넣고 **새로 들어갔을 때만** +1.
--     원장이 없으면 새로고침 반복만으로 조회수·정렬을 부풀릴 수 있다(글 쪽에서 이미 겪은 실패).
--   · 열람자 키 = 로그인 uid → 없으면 cf-connecting-ip. **x-forwarded-for 는 쓰지 않는다** —
--     클라이언트가 값을 고를 수 있어 헤더만 바꾸면 PK 가 매번 새 행이 된다.
--     (이 프로젝트에 cf-connecting-ip 가 실제로 오는 것은 2026-09-07 PostgREST 경유로 실측 확인했다.)
--   · 신뢰 가능한 키가 없으면 집계를 건너뛴다 — 'ip:unknown' 한 칸에 뭉치면 비로그인 조회가
--     매물당 하루 1건으로 사라진다.
--   · 자기 매물은 세지 않는다(판매자가 자기 글을 새로고침해 순위를 올리는 것을 막는다).
--   · 원장 청소는 호출의 1% 에서 7일 초과분 삭제 — 크론을 늘리지 않는다(글 쪽과 같은 조리법).
--
-- 소급: 기존 view_count 는 그대로 둔다(전부 0). 데이터 변경 0.
-- 롤백: drop function public.increment_listing_view(uuid); drop table public.listing_views;
-- ============================================================================

create table if not exists public.listing_views (
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  viewer     text not null,
  day        date not null,
  primary key (listing_id, viewer, day)
);
alter table public.listing_views enable row level security;
-- 정책 없음 = 클라이언트 직접 접근 불가. definer 함수만 읽고 쓴다.
revoke all on table public.listing_views from public, anon, authenticated;

create or replace function public.increment_listing_view(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_owner  uuid;
  v_hdr    json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  v_day    date := (now() at time zone 'Asia/Seoul')::date;
  v_viewer text;
begin
  select seller_id into v_owner from public.marketplace_listings where id = p_id;
  if not found then return; end if;          -- 없는 매물: 조용히 무시(FK 예외 방지)
  if v_owner = v_uid then return; end if;     -- 자기 매물은 집계하지 않는다

  v_viewer := coalesce(v_uid::text, 'ip:' || nullif(v_hdr->>'cf-connecting-ip', ''));
  if v_viewer is null then return; end if;    -- 신뢰 가능한 키가 없으면 집계하지 않는다

  insert into public.listing_views(listing_id, viewer, day) values (p_id, v_viewer, v_day)
  on conflict do nothing;
  if found then
    update public.marketplace_listings set view_count = coalesce(view_count, 0) + 1 where id = p_id;
  end if;

  if random() < 0.01 then
    delete from public.listing_views where day < v_day - 7;
  end if;
end;
$$;

-- CREATE OR REPLACE 는 ACL 을 초기화한다(nuri-migration §1). anon 유지 — 비로그인 열람도 집계하는
-- 의도된 공개 RPC 다(increment_post_view·bump_schedule_view 와 같은 성격).
revoke all on function public.increment_listing_view(uuid) from public;
grant execute on function public.increment_listing_view(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
