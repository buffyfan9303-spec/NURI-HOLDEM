-- 20260903a — 관리자 '노출 관리'(오너 지시 2026-09-03): 광고·외치기·게시물·공지의 노출/순서를
-- 관리자 페이지 한 곳에서 다룬다. 멱등(if not exists / create or replace + ACL 재명시).
--
-- 적용 순서(의존 없음 — 위에서 아래로):
--   §1 community_ads.active            — 내용은 두고 노출만 끄는 스위치(종전엔 제목을 지워야 내려갔다)
--   §2 app_settings community_ads_every — 게시판 '글 N개마다 광고 1줄'(기본 4). read 공개 테이블이라 비밀 금지
--   §3 admin_shout_bump(uuid)           — 대기 중 외침을 맨 앞으로(plays_at = now(), 방송 길이는 보존)
--   §4 community_posts.pinned_at + admin_set_post_pinned(uuid, boolean) — 게시판 상단 고정
--   §5 marketplace_notices.sort_order   — 공지 순서. 쓰기는 기존 RLS notices_admin_upd(my_role()='admin')로
--                                         충분해 RPC 를 두지 않는다(삭제도 notices_admin_del 이 이미 관리자 전용).
--
-- 롤백 힌트:
--   drop function if exists public.admin_shout_bump(uuid);
--   drop function if exists public.admin_set_post_pinned(uuid, boolean);
--   alter table public.community_ads drop column if exists active;
--   alter table public.community_posts drop column if exists pinned_at;
--   alter table public.marketplace_notices drop column if exists sort_order;
--   delete from public.app_settings where key = 'community_ads_every';
--   (클라이언트는 컬럼이 없어도 ?? 폴백으로 동작하지만, 배포 순서는 DB → 앱이 안전하다.)

-- ── §1 광고 노출 스위치 ───────────────────────────────────────────────────────
alter table public.community_ads
  add column if not exists active boolean not null default true;
comment on column public.community_ads.active is
  '관리자 노출 토글. 노출 조건 = active AND 제목 있음 AND 미만료(getActiveCommunityAds). 쓰기는 community_ads_admin_write RLS.';

-- ── §2 게시판 광고 빈도 ───────────────────────────────────────────────────────
insert into public.app_settings(key, value) values ('community_ads_every', '4')
on conflict (key) do nothing;

-- ── §3 외치기 맨 앞으로 ───────────────────────────────────────────────────────
--   대기(plays_at > now) 중인 외침만. 방송 길이(expires_at - plays_at)는 등급마다 달라 그대로 보존한다.
--   ponytail: 지금 방송 중인 외침과 20초 겹친다(맨 앞 = 즉시). 겹침이 싫으면 shout_next_free_slot(now())
--   로 바꾸면 되지만 그건 '맨 앞'이 아니라 '다음 빈 칸'이다 — 오너가 원하면 그때 바꾼다.
create or replace function public.admin_shout_bump(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_len interval;
begin
  if my_role() IS DISTINCT FROM 'admin' then raise exception '운영자만 가능합니다'; end if;
  select expires_at - coalesce(plays_at, created_at) into v_len
    from public.community_shouts
   where id = p_id and hidden = false and expires_at > now() and coalesce(plays_at, created_at) > now();
  if v_len is null then raise exception '대기 중인 외침만 앞으로 보낼 수 있습니다'; end if;
  update public.community_shouts
     set plays_at = now(), expires_at = now() + v_len
   where id = p_id;
end;
$fn$;
comment on function public.admin_shout_bump(uuid) is
  '관리자: 대기 중 외침을 맨 앞(plays_at = now())으로. 방송 길이 보존. 방송 중·종료·숨김은 거부.';
revoke execute on function public.admin_shout_bump(uuid) from public, anon;
grant execute on function public.admin_shout_bump(uuid) to authenticated, service_role;

-- ── §4 게시물 고정 ─────────────────────────────────────────────────────────────
alter table public.community_posts
  add column if not exists pinned_at timestamptz;
comment on column public.community_posts.pinned_at is
  '관리자 상단 고정 시각. null = 미고정. 게시판은 pinned_at desc 를 맨 위에, 나머지는 기존 순서(src/lib/pinnedFirst.ts).';
create index if not exists community_posts_pinned_idx
  on public.community_posts (pinned_at desc) where pinned_at is not null;

-- community_posts 에는 UPDATE 정책이 없다(posts_select/insert/delete 뿐) → admin_set_post_blinded 와 같은 RPC 꼴.
create or replace function public.admin_set_post_pinned(p_post_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if my_role() IS DISTINCT FROM 'admin' then raise exception '운영자만 가능합니다'; end if;
  update public.community_posts
     set pinned_at = case when p_pinned then now() else null end
   where id = p_post_id;
end;
$fn$;
comment on function public.admin_set_post_pinned(uuid, boolean) is
  '관리자: 게시글 상단 고정/해제(pinned_at). admin_set_post_blinded 와 같은 가드·ACL.';
revoke execute on function public.admin_set_post_pinned(uuid, boolean) from public, anon;
grant execute on function public.admin_set_post_pinned(uuid, boolean) to authenticated, service_role;

-- ── §5 공지 순서 ───────────────────────────────────────────────────────────────
--   정렬 = sort_order desc, created_at desc(getNotices). 관리자 ▲▼는 목록을 n-1..0 으로 재번호해 저장한다.
--   쓰기 경로: 기존 RLS notices_admin_upd(update, my_role()='admin') — baseline 2026-07-20 스냅샷. RPC 불필요.
alter table public.marketplace_notices
  add column if not exists sort_order int not null default 0;
comment on column public.marketplace_notices.sort_order is
  '관리자 노출 순서(클수록 위). 같은 값은 created_at desc. 쓰기는 notices_admin_upd RLS(관리자).';
