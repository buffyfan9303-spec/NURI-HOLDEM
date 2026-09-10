-- ============================================================================
-- 20260911a — 커뮤니티 광고를 '별도 한 줄 문구'에서 **게시글 승격**으로 (오너 지시 2026-09-11)
--
-- 무엇이 문제였나
--   community_ads 는 (title, link_url, advertiser) 로 된 **독립 광고 행**이었다. 그래서
--     · 피드에서 게시글과 생김새가 달라 이질적이었고(AdRow 는 PostRow/PostCard 와 완전히 별개 컴포넌트),
--     · link_url 이 없으면 `<div>` 로 렌더돼 **아예 클릭이 안 됐다**(오너 리포트: "AD 가 클릭되지 않는다"),
--     · 눌러도 게시글 상세로 가지 않았다(외부 새 탭이 유일한 목적지였다).
--   또 읽기 정책이 `using (true)` 라 꺼짐·만료·예약 상태의 광고 문구까지 anon 에게 전량 내려갔다
--   (같은 문제를 20260904g 가 home_banners 에서 이미 고쳤는데 광고에는 안 들어왔다).
--
-- 새 모델
--   광고 = **게시판에 이미 있는 글을 슬롯에 연결한 것**. 광고 전용 제목·본문을 따로 만들지 않는다.
--   community_ads 는 (slot ↔ post_id) 관계 + 게재 창(active, starts_at, expires_at)만 든다.
--   화면은 그 글을 기존 PostRow/PostCard 그대로 그리고, 누르면 기존 게시글 상세가 열린다.
--
-- 하위호환
--   title·link_url·advertiser 컬럼은 **지우지 않는다**(deprecated). 이전 데이터와 롤백을 위해 남긴다.
--   새 앱은 post_id 기반 광고만 노출한다. post_id 가 없는 기존 행은 아래 §3 이 active 를 끄되
--   내용은 보존한다 — 관리자 화면에 '게시글 연결 필요' 로 뜨고, 연결하면 바로 다시 산다.
--
-- 적용 순서 (⚠ §5 는 앱 배포 뒤에)
--   §1 컬럼 → §2 인덱스·제약 → §3 미연결 광고 안전 정지 → §4 공개 읽기 RPC
--   → **앱 배포**(클라이언트가 RPC 를 쓰기 시작) → §5 원본 테이블 공개 읽기 축소
--   §5 를 먼저 하면 옛 번들의 `select *` 가 빈 배열을 받아 광고가 조용히 사라진다.
--
-- 롤백
--   drop function if exists public.community_ads_public();
--   alter table public.community_ads drop column if exists post_id, drop column if exists starts_at;
--   (§5 를 적용했다면) drop policy if exists community_ads_read_admin on public.community_ads;
--                     create policy community_ads_read on public.community_ads
--                       for select to anon, authenticated using (true);
-- ============================================================================

-- ── §1 슬롯 ↔ 게시글 관계 ────────────────────────────────────────────────────
-- on delete set null: 글이 지워지면 슬롯은 남고 연결만 끊긴다. cascade 로 슬롯을 지우면
--   PK(slot 1~5)가 사라져 관리 화면의 '빈 칸'이라는 개념 자체가 무너진다.
alter table public.community_ads
  add column if not exists post_id uuid references public.community_posts(id) on delete set null;

-- 게재 시작일 — 종전엔 만료일만 있어 '예약 게재'가 불가능했다(home_banners 는 이미 있다).
alter table public.community_ads
  add column if not exists starts_at date;

comment on column public.community_ads.post_id is
  '광고로 승격한 게시글(community_posts.id). NULL = 게시글 연결 필요(노출되지 않는다). 글 삭제 시 자동 NULL.';
comment on column public.community_ads.starts_at is '게재 시작일(KST). NULL = 즉시.';
comment on column public.community_ads.title is
  'DEPRECATED(20260911a) — 게시글 승격 방식으로 바뀌기 전의 광고 문구. 새 앱은 읽지 않는다. 롤백·이력용으로 보존.';
comment on column public.community_ads.link_url is
  'DEPRECATED(20260911a) — 옛 외부 링크. 새 광고는 게시글 상세로 간다. 롤백·이력용으로 보존.';
comment on column public.community_ads.advertiser is
  'DEPRECATED(20260911a) — 옛 광고주 표기. 새 광고는 게시글 작성자를 그대로 보여준다. 롤백·이력용으로 보존.';
comment on table public.community_ads is
  '커뮤니티 광고 슬롯 5칸. 각 칸은 community_posts 의 글 하나를 가리킨다(게시글 승격). 공개 읽기는 community_ads_public() RPC.';

-- ── §2 같은 글이 여러 활성 슬롯에 중복 지정되지 않게 ─────────────────────────
-- 부분 유니크 인덱스 — 꺼진 슬롯끼리는 겹쳐도 상관없다(내용 보존이 목적이라 제약을 걸면 되레 막힌다).
create unique index if not exists community_ads_active_post_uidx
  on public.community_ads (post_id) where (post_id is not null and active);

-- 게재 창이 뒤집힌 입력(종료 < 시작)은 데이터로 남기지 않는다.
alter table public.community_ads drop constraint if exists community_ads_window_ok;
alter table public.community_ads
  add constraint community_ads_window_ok
  check (starts_at is null or expires_at is null or expires_at >= starts_at);

-- ── §3 미연결 광고 안전 정지 ─────────────────────────────────────────────────
-- 옛 문구형 광고는 새 앱에서 노출 경로가 없다. 켜진 채로 두면 관리 화면에서 '게재중'으로 보이는데
-- 화면에는 안 나오는 유령 상태가 된다. 내용(title/link_url/advertiser)은 **그대로 둔다**.
update public.community_ads
   set active = false, updated_at = now()
 where post_id is null and active and btrim(coalesce(title, '')) <> '';

-- ── §4 공개 읽기 RPC — 광고와 게시글을 한 번에 ───────────────────────────────
-- 왜 RPC 인가
--   ① 광고마다 게시글을 따로 조회하는 N+1 을 만들지 않는다(한 번의 조인).
--   ② 노출 조건(active·게재 창·글 존재·블라인드 아님)을 **서버가** 판정한다. 종전엔 전부 클라이언트였다.
--   ③ 날짜는 서버의 KST 로 판정한다 — 기기 시계를 되돌려 만료 광고를 계속 보는 길을 막는다.
-- 반환 컬럼은 클라이언트 rowToPost 가 읽는 것과 같은 이름을 쓴다(매핑을 두 벌로 만들지 않는다).
create or replace function public.community_ads_public()
returns table(
  slot int,
  id uuid, user_id uuid, user_name text, user_role text, user_color text, user_avatar text,
  content text, created_at timestamptz,
  like_count int, comment_count int, view_count int,
  category text, title text, images text[],
  cheer_count int, bumped_until timestamptz, bump_count int, pinned_at timestamptz
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select
    a.slot,
    p.id, p.user_id, p.user_name, p.user_role::text, p.user_color, p.user_avatar,
    p.content, p.created_at,
    p.like_count, p.comment_count, coalesce(p.view_count, 0),
    p.category::text, p.title, p.images,
    coalesce(p.cheer_count, 0), p.bumped_until, coalesce(p.bump_count, 0), p.pinned_at
  from public.community_ads a
  join public.community_posts p on p.id = a.post_id
  where a.active
    and a.post_id is not null
    and coalesce(p.blinded, false) = false
    and (a.starts_at  is null or a.starts_at  <= (now() at time zone 'Asia/Seoul')::date)
    and (a.expires_at is null or a.expires_at >= (now() at time zone 'Asia/Seoul')::date)
  order by a.slot;
$$;

comment on function public.community_ads_public() is
  '게재 중인 커뮤니티 광고 = 승격된 게시글. 노출 조건(활성·게재 창 KST·글 존재·블라인드 아님)을 서버가 판정한다.';

-- 읽기 RPC 라 anon 도 허용한다(보안 표준 §3: 읽기 RPC 만 anon).
revoke execute on function public.community_ads_public() from public;
grant execute on function public.community_ads_public() to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- ============================================================================
-- §5 원본 테이블 공개 읽기 축소 — **앱 배포가 프로덕션에 오른 뒤에** 별도로 실행한다.
--    (지금 실행하면 옛 번들이 광고를 못 읽어 조용히 사라진다)
--
--   drop policy if exists community_ads_read on public.community_ads;
--   create policy community_ads_read_admin on public.community_ads
--     for select to authenticated
--     using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
--
--   -- 검증(적용 후):
--   --   set role anon;  select count(*) from public.community_ads;   -- 0 (정책에 막힘)
--   --   select count(*) from public.community_ads_public();          -- 게재 중인 광고 수
--   --   reset role;
--   -- 어드바이저 보안 ERROR 0 유지.
-- ============================================================================
