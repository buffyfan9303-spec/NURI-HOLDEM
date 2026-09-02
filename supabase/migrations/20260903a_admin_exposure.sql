-- 20260903a — 관리자 '노출 관리'(오너 지시 2026-09-03): 광고·외치기·게시물·공지의 노출/순서를
-- 관리자 페이지 한 곳에서 다룬다. 멱등(if not exists / create or replace + ACL 재명시).
--
-- 적용 순서(의존 없음 — 위에서 아래로):
--   §1 community_ads.active            — 내용은 두고 노출만 끄는 스위치(종전엔 제목을 지워야 내려갔다)
--   §2 app_settings community_ads_every — 게시판 '글 N개마다 광고 1줄'(기본 4). read 공개 테이블이라 비밀 금지
--   §3 admin_shout_bump(uuid)           — 대기 중 외침을 대기열 맨 앞으로(방송 중인 창 뒤, 뒤 대기열은 밀기, 방송 길이는 보존)
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
--   소비자(CommunityShoutBar)는 plays_at 오름차순에서 plays_at <= now 인 것 **하나만** 송출하므로
--   창이 겹치면 올린 외침은 화면에 못 나가고, refund_quote 는 plays_at <= now 를 '방송 시작'으로 봐 환불도 막힌다.
--   그래서 plays_at = now() 가 아니라 **지금 방송 중인 창이 끝나는 시각**에 놓고, 그 뒤 대기열은 v_len 만큼 민다
--   (동률·겹침 0). buy_shout 와 같은 advisory lock 으로 동시 구매와 직렬화한다.
--   ponytail: 밀린 대기열이 뒤의 예약(reserve) 창과 겹칠 수 있다 — 예약은 안 밀고 그대로 둔다.
--   겹치면 예약이 먼저 송출되고 밀린 외침은 남은 창만 방송된다. 문제가 되면 첫 reserve 앞까지만 밀도록 좁힌다.
create or replace function public.admin_shout_bump(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_len   interval;
  v_start timestamptz;
begin
  if my_role() IS DISTINCT FROM 'admin' then raise exception '운영자만 가능합니다'; end if;
  perform pg_advisory_xact_lock(hashtext('nuri:shout_queue'));
  select expires_at - coalesce(plays_at, created_at) into v_len
    from public.community_shouts
   where id = p_id and hidden = false and expires_at > now() and coalesce(plays_at, created_at) > now();
  if v_len is null then raise exception '대기 중인 외침만 앞으로 보낼 수 있습니다'; end if;
  -- 지금 방송 중인 창(들)이 끝나는 시각. 방송 중이 없으면 now().
  select greatest(now(), coalesce(max(expires_at), now())) into v_start
    from public.community_shouts
   where hidden = false and plays_at <= now() and expires_at > now();
  -- 뒤 대기열을 먼저 민다(대상 제외·예약 제외). 선두가 정확히 v_start 였어도 v_start + v_len 으로 밀려 동률이 없다.
  update public.community_shouts
     set plays_at = plays_at + v_len, expires_at = expires_at + v_len
   where hidden = false and id <> p_id and tier <> 'reserve'
     and plays_at >= v_start and expires_at > now();
  update public.community_shouts
     set plays_at = v_start, expires_at = v_start + v_len
   where id = p_id;
end;
$fn$;
comment on function public.admin_shout_bump(uuid) is
  '관리자: 대기 중 외침을 대기열 맨 앞(방송 중인 창 종료 시각)으로. 뒤 대기열은 방송 길이만큼 민다(예약 제외). 방송 길이 보존. 방송 중·종료·숨김은 거부.';
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
--   정렬 = sort_order desc, created_at desc(getNotices). 관리자 ▲▼는 목록을 0..-(n-1) 로 재번호해 저장한다
--   (맨 위 = 0). 새 공지는 기본값 0 이라 맨 위와 동률 → created_at desc 로 위에 선다('새 공지는 맨 위' 보존).
--   쓰기 경로: 기존 RLS notices_admin_upd(update, my_role()='admin') — baseline 2026-07-20 스냅샷. RPC 불필요.
alter table public.marketplace_notices
  add column if not exists sort_order int not null default 0;
comment on column public.marketplace_notices.sort_order is
  '관리자 노출 순서(클수록 위). 같은 값은 created_at desc. 쓰기는 notices_admin_upd RLS(관리자).';
