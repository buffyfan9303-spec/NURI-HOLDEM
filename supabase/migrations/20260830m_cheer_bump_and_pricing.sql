-- ============================================================================
-- 20260830m — 가격 재조정 + 반복 소비형 2종(응원 보내기 · 글 끌올)
--
-- ── 0. 왜 신상품보다 가격이 먼저인가 (실측) ─────────────────────────────────
--   적용 직전 실측: point_purchases **0행** · sum(profiles.spent_points) **0** ·
--   community_shouts 0행 · mark_unlocks 0행. 50,087점을 쥔 계정조차 아무것도 안 샀다.
--   살 물건이 없어서가 아니다 — **가격이 획득률의 40배**였다.
--     하루 최대 획득 50점(출석1 + 체크인3×3 + 글 30상한 + 댓글 10상한) 기준 마크 2,000점 = 40일치.
--     보통 유저의 현실 획득(10~20점/일)으로는 **100~200일**이다.
--   ⇒ ① 마크를 800점(하루 최대치 16일 · 현실 40~80일)으로 내리고,
--      ② 그 아래에 **현실 획득으로도 2~3일에 한 번은 반드시 살 수 있는** 30점대 상품을 만든다.
--
-- ── 1. 응원 보내기(30점) — 이 마이그레이션의 핵심 ───────────────────────────
--   현 상점에는 '나를 꾸미는 것'만 있고 **'남에게 쓰는 것'이 없다.**
--   소액·고빈도·사회적 동기는 경제를 도는 유일한 엔진이고, 홀덤펍 커뮤니티(핸드 자랑·입상 인증)는
--   축하할 일이 매일 생긴다. 30점 = 하루치(50)의 0.6배 — 가격 사다리에서 유일하게
--   '오늘 번 걸로 오늘 쓸 수 있는' 칸이다.
--
--   ⚠ **받는 사람에게 포인트를 주지 않는다.** 유저 간 포인트 이전은 게임산업법 §32①7(환전 알선)
--     위험이라 설계 단계에서 명시적으로 배제됐다. 응원은 **표시**만 남고 점수는 소각된다
--     (spent_points 만 오르고 누구의 activity_points 도 오르지 않는다 = 순수 소각).
--
--   ▷ daily_purchase_count(하루 10회 합산 상한)에 넣을 것인가 — **넣지 않는다.**
--     근거: 10회 상한은 '상품 도배' 방지 장치다. 응원을 여기 합산하면 30점짜리 소액 상품이
--     그날의 외치기(50/150)·마크(800) 구매를 **잠가 버린다** — 싼 것이 비싼 것을 막는 역전이다.
--     대신 응원은 자기 한도를 따로 갖는다: 하루 10회(=300점, 하루 최대 획득의 6배라 사실상
--     잔액이 먼저 막는다) + 20초 쿨다운 + 같은 대상 1회 + 자기 글 금지.
--     ⇒ 실질 상한은 '가격'이고, 한도는 스크립트 연타를 막는 백스톱이다.
--   ▷ 끌올(100점)은 **합산 상한에 넣는다.** 외치기·마크와 같은 '아이템 구매' 가족이고
--     금액대도 같은 층이라 따로 뺄 이유가 없다.
--
-- ── 2. 글 끌올(100점 · 3시간 상단) ──────────────────────────────────────────
--   만료가 '잃는 일'이 아니라 **상품의 본질**인 형태다. 기간권(1일/7일/30일)이 실패한 이유는
--   소유물에 만료를 붙였기 때문이지 만료 자체가 아니었다 — 외치기(20초 슬롯)가 살아남은 것이 증거다.
--   자기 글만 · 동시 끌올 3자리 상한(목록이 끌올로만 채워지지 않게) · 끌올 중 재구매 금지.
--
-- ── 3. 겸사: 라이브에서 발견한 발권 버그 1건을 같은 커밋에서 닫는다 ─────────
--   admin_refund_purchase 는 kind='shout' 이 아니면 **전부 기간권(mark_rentals) 경로**로 보낸다.
--   그런데 refund_quote 는 이미 mark_own(영구 소장)에 전액 환불 견적을 내주고 있었다.
--   ⇒ 영구 마크를 환불하면 점수는 돌아가는데 mark_unlocks 행은 그대로 남아
--     **마크를 공짜로 갖는다**(=발권). 지금까지 mark_own 구매가 0건이라 터지지 않았을 뿐이고,
--     이 마이그레이션이 마크를 800점으로 내려 '실제로 사게 만드는' 순간 현실이 된다.
--   같은 함수의 fail-open 도 함께 닫는다(`my_role() <> 'admin'` → `is distinct from`:
--   프로필 행이 없으면 NULL <> 'admin' = NULL 로 가드를 건너뛴다 — 20260828d 와 같은 함정).
--
-- ── 4. 비파괴 원칙 ──────────────────────────────────────────────────────────
--   추가만 한다. 기존 상품·행·정책은 하나도 지우지 않는다.
--   가격 UPDATE 도 파일로 추적한다(shop_skus.mark_own 2,000 → 800).
--
-- ── 5. 라이브 적용 메모(드리프트 오해 방지) ─────────────────────────────────
--   라이브에는 같은 이름(20260830m_cheer_bump_and_pricing)으로 적용했고, **문(statement)은
--   이 파일과 한 글자도 다르지 않다.** 다만 위 §0~§4 서두 주석 블록은 적용본에서 한 줄로 줄였다
--   (적용본은 "전문 주석은 저장소 파일 참조"라고만 적혀 있다).
--   함수 본문 주석은 그대로라 pg_get_functiondef 비교로 드리프트를 검증할 수 있다.
--   ⚠ 같은 날 다른 웨이브도 `20260830m_` 접두사를 썼다(20260830m_legal_consent_versioning.sql).
--     파일명이 달라 충돌은 아니지만, 다음 마이그레이션은 `n` 부터 시작할 것.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- §1. 가격 재조정 — 오너 승인(2026-08-30)
--   2,000 → 800. 하루 최대 획득 50점 기준 40일치 → 16일치.
--   가격은 shop_skus 가 단일 출처라 이 한 줄이 서버 판정·상점 카드·구매 버튼 라벨을 동시에 바꾼다.
--   (화면에 숫자를 박아 두지 않았기 때문에 가능한 일이다 — 그 규약을 계속 지킬 것.)
-- ────────────────────────────────────────────────────────────────────────────
update public.shop_skus
   set price = 800,
       descr = '닉네임 앞에 영구 소장 · 언제든 바꿔 달 수 있어요'
 where key = 'mark_own';

-- ────────────────────────────────────────────────────────────────────────────
-- §2. 상품표 — kind 화이트리스트 확장(기존 값은 그대로) + 신규 SKU 2종
-- ────────────────────────────────────────────────────────────────────────────
alter table public.shop_skus drop constraint if exists shop_skus_kind_check;
alter table public.shop_skus add constraint shop_skus_kind_check
  check (kind = any (array['mark_rent'::text, 'shout'::text, 'mark'::text,
                           'cheer'::text, 'bump'::text]));

insert into public.shop_skus
  (key, kind, label, descr, price, duration_hours, duration_seconds, tier_rank, sort, active)
values
  ('cheer', 'cheer', '응원 보내기',
   '글·댓글에 응원을 보내고 상대에게 알림이 갑니다 · 하루 10번까지', 30, 0, 0, 1, 5, true),
  ('bump',  'bump',  '글 끌올',
   '내가 쓴 글을 3시간 동안 목록 맨 위로 · 동시 3자리', 100, 3, 0, 1, 15, true)
on conflict (key) do update
  set kind = excluded.kind, label = excluded.label, descr = excluded.descr,
      price = excluded.price, duration_hours = excluded.duration_hours,
      duration_seconds = excluded.duration_seconds,
      tier_rank = excluded.tier_rank, sort = excluded.sort, active = true;

-- ────────────────────────────────────────────────────────────────────────────
-- §3. 스키마(추가만)
-- ────────────────────────────────────────────────────────────────────────────

-- 3-1. 게시글 — 응원 수(비정규화) · 끌올 만료 · 끌올 누적
--   cheer_count 를 게시글에 비정규화하는 이유: 목록(최대 50건)이 응원 수를 그리는데
--   행마다 집계를 돌면 목록 한 번에 50번의 count 가 붙는다. 좋아요(like_count)와 같은 규약.
--   ⚠ community_posts 에는 **UPDATE 정책이 하나도 없다**(select/insert/delete 뿐).
--     즉 유저는 PostgREST 로 이 값을 위조할 수 없고, 오직 SECURITY DEFINER RPC 만이 쓴다.
--     (댓글은 comments_update_self 로 본인 UPDATE 가 열려 있어 같은 방식이 불가능하다 —
--      그래서 댓글 응원 수는 비정규화하지 않고 post_cheers 를 그대로 센다.)
alter table public.community_posts
  add column if not exists cheer_count  int not null default 0,
  add column if not exists bump_count   int not null default 0,
  add column if not exists bumped_until timestamptz;

comment on column public.community_posts.cheer_count is
  '받은 응원 수(비정규화). send_cheer() RPC 만이 증가시킨다 — 이 표에는 유저 UPDATE 정책이 없다.';
comment on column public.community_posts.bumped_until is
  '끌올 만료 시각. now() 보다 크면 목록 상단 고정. bump_post() RPC 만이 쓴다.';

-- 끌올 슬롯 조회(동시 3건 상한)와 목록 상단 정렬이 둘 다 이 인덱스를 탄다.
create index if not exists idx_posts_bumped_until
  on public.community_posts (bumped_until desc)
  where bumped_until is not null;

-- 3-2. 응원 원장 — 누가 무엇에 응원했는지(공개 표시용)
--   쓰기 정책을 두지 않는다 → send_cheer() RPC 만이 통로(point_grants·mark_unlocks 와 같은 규약).
create table if not exists public.post_cheers (
  id           bigserial primary key,
  sender_id    uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  post_id      uuid references public.community_posts(id) on delete cascade,
  comment_id   uuid references public.comments(id) on delete cascade,
  cost         int  not null check (cost > 0),
  created_at   timestamptz not null default now(),
  constraint post_cheers_target_check
    check ((post_id is not null)::int + (comment_id is not null)::int = 1),
  constraint post_cheers_no_self check (sender_id <> recipient_id)
);

comment on table public.post_cheers is
  '응원(칩 던지기) 원장. 받는 사람에게 점수를 주지 않는다 — 게임산업법 §32①7(환전 알선) 위험 때문에 유저 간 포인트 이전을 설계에서 배제했다. 점수는 소각되고 표시만 남는다.';

-- 같은 대상에 두 번 응원할 수 없다. 서버 RPC 가 먼저 막지만 최종 방어는 인덱스다
-- (동시 요청 두 건이 같은 순간에 exists 검사를 통과하는 경로가 이론상 존재한다).
create unique index if not exists post_cheers_sender_post_uniq
  on public.post_cheers (sender_id, post_id) where post_id is not null;
create unique index if not exists post_cheers_sender_comment_uniq
  on public.post_cheers (sender_id, comment_id) where comment_id is not null;
create index if not exists post_cheers_comment_idx
  on public.post_cheers (comment_id) where comment_id is not null;
create index if not exists post_cheers_sender_idx
  on public.post_cheers (sender_id, created_at desc);
create index if not exists post_cheers_recipient_idx
  on public.post_cheers (recipient_id, created_at desc);

alter table public.post_cheers enable row level security;
drop policy if exists post_cheers_read on public.post_cheers;
create policy post_cheers_read on public.post_cheers
  for select to anon, authenticated using (true);
-- 쓰기 정책 없음 — 응원은 send_cheer() RPC(SECURITY DEFINER)만이 남긴다.

grant select on public.post_cheers to anon, authenticated;

-- 3-3. 구매 원장 — 새 kind 2종 + 대상 글
alter table public.point_purchases drop constraint if exists point_purchases_kind_check;
alter table public.point_purchases add constraint point_purchases_kind_check
  check (kind = any (array['shout'::text, 'mark_rent'::text, 'mark_own'::text,
                           'cheer'::text, 'bump'::text]));

alter table public.point_purchases
  add column if not exists post_id uuid references public.community_posts(id) on delete set null;

comment on column public.point_purchases.post_id is
  '응원·끌올의 대상 글. 운영자 구매 내역에서 "어느 글이었나"를 되짚기 위한 것 — 글이 지워져도 원장은 남아야 하므로 on delete set null.';

-- ────────────────────────────────────────────────────────────────────────────
-- §4. 하루 구매 합산 상한 — 응원만 제외한다
--   근거는 헤더 §1 ▷ 참조. 응원은 자기 한도(하루 10회 · 20초 쿨다운)를 따로 갖는다.
--   ⚠ 이 함수는 buy_shout/buy_mark/bump_post 가 공유한다. 값을 바꾸면 세 곳이 함께 바뀐다.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.daily_purchase_count(p_user uuid)
returns integer
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select count(*)::int from public.point_purchases
   where user_id = p_user
     and refunded_at is null
     and kind <> 'cheer'   -- 응원은 별도 한도(post_cheers 기준). 소액 고빈도가 아이템 구매를 잠그지 않게.
     and created_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
$function$;

comment on function public.daily_purchase_count(uuid) is
  '오늘(KST) 환불되지 않은 아이템 구매 건수 — 외치기·마크·끌올 합산 10회 상한의 기준. 응원(cheer)은 제외한다: 30점짜리 소액 고빈도 상품이 그날의 외치기·마크 구매를 잠가 버리는 역전을 막기 위해서다.';

revoke all on function public.daily_purchase_count(uuid) from public, anon;
grant execute on function public.daily_purchase_count(uuid) to authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- §5. 응원 보내기
--   안전장치 순서는 buy_shout 과 **같다**: 프로필 행 잠금 → 제재 확인 → 중복/쿨다운/한도
--   → 잔액 → 차감·기록을 한 트랜잭션. 순서를 바꾸면 잠금 밖에서 검사한 값으로 차감하게 된다.
--   잠금 순서도 buy_shout 과 같다(프로필 → 글). 반대로 잡는 함수를 만들면 교착이 생긴다.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.send_cheer(p_post_id uuid default null,
                                             p_comment_id uuid default null)
returns table(cheers integer, available integer, remaining_today integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  CHEER_DAILY_CAP constant int      := 10;
  CHEER_COOLDOWN  constant interval := interval '20 seconds';
  v_uid    uuid := (select auth.uid());
  v_price  int;
  v_owner  uuid;
  v_post   uuid;
  v_nick   text;
  v_status text;
  v_points int;
  v_spent  int;
  v_used   int;
  v_count  int;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  -- 대상은 정확히 하나. 둘 다 주거나 둘 다 비면 '어디에 보냈는지'가 원장에 남지 않는다.
  if (p_post_id is null) = (p_comment_id is null) then
    raise exception '응원할 대상을 하나만 지정해 주세요';
  end if;

  select price into v_price from public.shop_skus where key = 'cheer' and active;
  if v_price is null then raise exception '판매 중인 상품이 아닙니다'; end if;

  -- 1) 프로필 행 잠금 — 이 아래 검사는 전부 잠금 뒤라 같은 사람의 더블탭이 줄을 선다.
  select coalesce(p.nickname, p.name, '회원'), coalesce(p.status::text, 'active'),
         coalesce(p.activity_points, 0), coalesce(p.spent_points, 0)
    into v_nick, v_status, v_points, v_spent
  from public.profiles p where p.id = v_uid for update;
  if not found then raise exception '프로필을 찾을 수 없습니다'; end if;
  if v_status <> 'active' then raise exception '제재 중인 계정은 응원을 보낼 수 없습니다'; end if;

  -- 2) 대상 확인 + 받는 사람
  if p_post_id is not null then
    select cp.user_id, cp.id into v_owner, v_post
      from public.community_posts cp where cp.id = p_post_id and cp.blinded = false;
    if not found then raise exception '응원할 글을 찾을 수 없습니다'; end if;
  else
    select c.user_id, c.post_id into v_owner, v_post
      from public.comments c where c.id = p_comment_id;
    if not found then raise exception '응원할 댓글을 찾을 수 없습니다'; end if;
    -- 요강 Q&A·매장 댓글에는 응원 UI 가 없다. 서버에서도 커뮤니티 글 댓글로 한정한다.
    if v_post is null then raise exception '커뮤니티 글의 댓글에만 응원을 보낼 수 있어요'; end if;
  end if;
  if v_owner = v_uid then raise exception '내 글에는 응원을 보낼 수 없어요'; end if;

  -- 3) 같은 대상 중복 — 최종 방어는 부분 유니크 인덱스(동시 요청)
  if exists (
    select 1 from public.post_cheers pc
     where pc.sender_id = v_uid
       and ((p_post_id    is not null and pc.post_id    = p_post_id)
         or (p_comment_id is not null and pc.comment_id = p_comment_id))
  ) then
    raise exception '이미 응원을 보냈어요';
  end if;

  -- 4) 연타 방지 — 20초 쿨다운
  if exists (
    select 1 from public.post_cheers pc
     where pc.sender_id = v_uid and pc.created_at > now() - CHEER_COOLDOWN
  ) then
    raise exception '응원은 20초에 한 번씩 보낼 수 있어요';
  end if;

  -- 5) 하루 한도(KST 기준) — 아이템 구매 10회 상한과 **별도**다(헤더 §1 ▷).
  select count(*)::int into v_used from public.post_cheers pc
   where pc.sender_id = v_uid
     and pc.created_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  if v_used >= CHEER_DAILY_CAP then
    raise exception '응원은 하루 %번까지 보낼 수 있어요', CHEER_DAILY_CAP;
  end if;

  -- 6) 잔액 — 누적(activity_points)은 건드리지 않는다. 사용액만 쌓는다.
  if v_points - v_spent < v_price then
    raise exception '활동점수가 부족해요 (필요 %점 · 사용 가능 %점)', v_price, v_points - v_spent;
  end if;

  -- 7) 차감 · 기록 · 표시 — 한 트랜잭션
  update public.profiles
     set spent_points = coalesce(spent_points, 0) + v_price
   where id = v_uid;

  insert into public.post_cheers (sender_id, recipient_id, post_id, comment_id, cost)
  values (v_uid, v_owner, p_post_id, p_comment_id, v_price);

  insert into public.point_purchases (user_id, kind, sku_key, post_id, cost, duration_hours)
  values (v_uid, 'cheer', 'cheer', v_post, v_price, 0);

  if p_post_id is not null then
    update public.community_posts
       set cheer_count = coalesce(cheer_count, 0) + 1
     where id = p_post_id
    returning cheer_count into v_count;
  else
    select count(*)::int into v_count from public.post_cheers where comment_id = p_comment_id;
  end if;

  -- 8) 받는 사람 알림 — **점수는 가지 않는다.** 표시와 알림만이 응원의 전부다.
  insert into public.notifications (user_id, type, title, message, link, avatar_color, read)
  values (v_owner, 'system', '응원을 받았어요',
          v_nick || '님이 회원님의 '
            || case when p_post_id is not null then '글' else '댓글' end
            || '에 응원을 보냈어요',
          '/posts/' || v_post::text, '#805FDA', false);

  return query select v_count,
                      greatest(0, v_points - v_spent - v_price),
                      CHEER_DAILY_CAP - v_used - 1;
end $function$;

comment on function public.send_cheer(uuid, uuid) is
  '응원 보내기(30점) — 글 또는 댓글 하나에. 자기 글 금지·같은 대상 1회·20초 쿨다운·하루 10회. 받는 사람에게 점수를 주지 않는다(게임산업법 §32①7 환전 알선 회피) — 점수는 소각되고 표시·알림만 남는다.';

-- ────────────────────────────────────────────────────────────────────────────
-- §6. 글 끌올
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.bump_post(p_post_id uuid)
returns table(until_at timestamptz, available integer, active_slots integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  BUMP_SLOTS constant int := 3;   -- 동시 끌올 상한. 목록이 끌올로만 채워지지 않게.
  v_uid     uuid := (select auth.uid());
  v_price   int;
  v_hours   int;
  v_owner   uuid;
  v_blinded boolean;
  v_until   timestamptz;
  v_status  text;
  v_points  int;
  v_spent   int;
  v_active  int;
  v_free    timestamptz;
  v_new     timestamptz;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;

  select s.price, greatest(1, s.duration_hours) into v_price, v_hours
    from public.shop_skus s where s.key = 'bump' and s.active;
  if v_price is null then raise exception '판매 중인 상품이 아닙니다'; end if;

  -- 1) 프로필 행 잠금 → 제재 (buy_shout 과 같은 순서·같은 잠금 순서)
  select coalesce(p.status::text, 'active'),
         coalesce(p.activity_points, 0), coalesce(p.spent_points, 0)
    into v_status, v_points, v_spent
  from public.profiles p where p.id = v_uid for update;
  if not found then raise exception '프로필을 찾을 수 없습니다'; end if;
  if v_status <> 'active' then raise exception '제재 중인 계정은 끌올할 수 없습니다'; end if;

  -- 2) 대상 글 — 자기 글만. 행을 잠가 같은 글에 대한 동시 끌올을 직렬화한다.
  select cp.user_id, cp.blinded, cp.bumped_until
    into v_owner, v_blinded, v_until
  from public.community_posts cp where cp.id = p_post_id for update;
  if not found then raise exception '끌올할 글을 찾을 수 없습니다'; end if;
  if v_owner <> v_uid then raise exception '내가 쓴 글만 끌올할 수 있어요'; end if;
  if v_blinded then raise exception '숨김 처리된 글은 끌올할 수 없어요'; end if;
  if v_until is not null and v_until > now() then
    raise exception '이미 끌올 중이에요 (약 %분 남음)',
      greatest(1, ceil(extract(epoch from (v_until - now())) / 60)::int);
  end if;

  -- 3) 아이템 구매 하루 합산 상한(외치기·마크와 같은 통)
  if public.daily_purchase_count(v_uid) >= 10 then
    raise exception '하루 10번까지만 구매할 수 있어요';
  end if;

  -- 4) 동시 끌올 자리 — 다 찼으면 언제 비는지까지 말해 준다(막기만 하면 다시 누르게 된다).
  select count(*)::int into v_active
    from public.community_posts cp where cp.bumped_until > now();
  if v_active >= BUMP_SLOTS then
    select min(cp.bumped_until) into v_free
      from public.community_posts cp where cp.bumped_until > now();
    raise exception '지금은 끌올 자리(%개)가 다 찼어요 — 약 %분 뒤에 비어요',
      BUMP_SLOTS, greatest(1, ceil(extract(epoch from (v_free - now())) / 60)::int);
  end if;

  -- 5) 잔액
  if v_points - v_spent < v_price then
    raise exception '활동점수가 부족해요 (필요 %점 · 사용 가능 %점)', v_price, v_points - v_spent;
  end if;

  -- 6) 차감 · 게시 · 기록 — 한 트랜잭션
  v_new := now() + (v_hours || ' hours')::interval;

  update public.profiles
     set spent_points = coalesce(spent_points, 0) + v_price
   where id = v_uid;

  update public.community_posts
     set bumped_until = v_new, bump_count = coalesce(bump_count, 0) + 1
   where id = p_post_id;

  insert into public.point_purchases (user_id, kind, sku_key, post_id, cost, duration_hours)
  values (v_uid, 'bump', 'bump', p_post_id, v_price, v_hours);

  return query select v_new, greatest(0, v_points - v_spent - v_price), v_active + 1;
end $function$;

comment on function public.bump_post(uuid) is
  '글 끌올(100점) — 내 글을 3시간 동안 목록 상단으로. 동시 3자리 상한·끌올 중 재구매 금지·하루 10회 아이템 상한에 포함. 만료가 상품의 본질이라 손해로 읽히지 않는다(외치기 슬롯과 같은 형태).';

-- ────────────────────────────────────────────────────────────────────────────
-- §7. 환불 — 새 kind 2종을 **명시적으로** 막고, 라이브 발권 버그(헤더 §3)를 닫는다
--   막는 것 자체는 기존 else 경로도 하지만 사유가 '다른 기간 마크로 교체되어…'라는 거짓말이 된다.
--   운영자가 보는 화면이 거짓을 말하면 그건 기능이 아니라 사고다.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.refund_quote(p_purchase_id bigint)
returns table(points integer, block text)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_pp public.point_purchases;
  v_sh public.community_shouts;
  v_rt public.mark_rentals;
  v_remaining_h numeric;
  v_this_h      numeric;
  v_pts         int;
begin
  select * into v_pp from public.point_purchases where id = p_purchase_id;
  if not found then
    return query select 0, '환불할 구매 내역이 없습니다'::text; return;
  end if;
  if v_pp.refunded_at is not null then
    return query select 0, format('이미 환불된 구매입니다 (%s점 반환)', v_pp.refund_points)::text; return;
  end if;
  if now() - v_pp.created_at > interval '24 hours' then
    return query select 0, '구매 후 24시간이 지나 환불할 수 없습니다 — 보상 지급은 활동점수 지급을 쓰세요'::text; return;
  end if;
  if (select count(*) from public.point_purchases q
       where q.user_id = v_pp.user_id
         and q.refunded_at > now() - interval '30 days') >= 3 then
    return query select 0, '최근 30일 환불이 이미 3건입니다 — 반복 환불은 활동점수 지급으로 처리하세요'::text; return;
  end if;

  -- 응원 — 보낸 즉시 상대에게 알림이 가고 표시가 붙는다. 되돌릴 수 없는 상품이다.
  if v_pp.kind = 'cheer' then
    return query select 0, '응원은 보내는 즉시 상대에게 전달돼 환불할 수 없습니다 — 보상은 활동점수 지급을 쓰세요'::text; return;
  end if;
  -- 끌올 — 이미 나간 상단 노출은 회수할 수 없다(외치기 방송과 같은 성질).
  if v_pp.kind = 'bump' then
    return query select 0, '끌올은 이미 노출이 시작돼 환불할 수 없습니다 — 보상은 활동점수 지급을 쓰세요'::text; return;
  end if;

  if v_pp.kind = 'shout' then
    select * into v_sh from public.community_shouts where id = v_pp.shout_id;
    if not found then
      return query select 0, '외침 기록을 찾을 수 없습니다'::text; return;
    end if;
    if v_sh.hidden then
      return query select 0, '이미 내려간 외침은 환불할 수 없습니다'::text; return;
    end if;
    -- 슬롯 방식: 방송이 시작됐으면 상품을 이미 받은 것이다.
    if coalesce(v_sh.plays_at, v_sh.created_at) <= now() then
      return query select 0, '이미 방송이 시작돼 환불할 수 없습니다'::text; return;
    end if;
    return query select v_pp.cost, null::text; return;
  end if;

  if v_pp.kind = 'mark_own' then
    -- 영구 소장은 일할이 없다. 24시간 안이고 아직 달고 있지 않으면 전액.
    if exists (select 1 from public.profiles
                where id = v_pp.user_id and equipped_mark = v_pp.mark_key) then
      return query select 0, '달고 있는 마크는 환불할 수 없습니다 — 먼저 해제해 주세요'::text; return;
    end if;
    if not exists (select 1 from public.mark_unlocks
                    where user_id = v_pp.user_id and mark_key = v_pp.mark_key) then
      return query select 0, '이미 회수된 마크입니다'::text; return;
    end if;
    return query select v_pp.cost, null::text; return;
  end if;

  -- 예전 기간 마크(mark_rent) — 판매는 중지됐지만 24시간 내 구매분은 남아 있을 수 있다.
  if coalesce(v_pp.duration_hours, 0) <= 0 then
    return query select 0, '환불 계산에 필요한 기간 정보가 없습니다'::text; return;
  end if;
  if exists (select 1 from public.point_purchases q
              where q.user_id = v_pp.user_id and q.kind = 'mark_rent'
                and q.id > v_pp.id and q.mark_key is distinct from v_pp.mark_key) then
    return query select 0, '이후 다른 기간 마크를 구매해 이 구매의 기간은 이미 소멸했습니다 — 보상은 활동점수 지급을 쓰세요'::text; return;
  end if;
  select * into v_rt from public.mark_rentals where user_id = v_pp.user_id;
  if not found or v_rt.mark_key is distinct from v_pp.mark_key then
    return query select 0, '다른 기간 마크로 교체되어 이 구매는 환불할 수 없습니다'::text; return;
  end if;
  v_remaining_h := greatest(0, extract(epoch from (v_rt.expires_at - now())) / 3600.0);
  v_this_h := least(v_remaining_h, v_pp.duration_hours::numeric);
  v_pts := floor(v_pp.cost * v_this_h / v_pp.duration_hours)::int;
  if v_pts <= 0 then
    return query select 0, '이미 기간이 끝나 환불할 점수가 없습니다'::text; return;
  end if;
  return query select v_pts, null::text;
end $function$;

-- ⚠ 발권 버그 수정: 종전 판은 kind<>'shout' 을 전부 기간권(mark_rentals) 회수 경로로 보냈다.
--   refund_quote 는 이미 mark_own 에 전액 견적을 내주므로, 영구 마크를 환불하면
--   **점수는 돌아가고 mark_unlocks 행은 남는다** = 마크를 공짜로 갖는다.
--   지금까지 mark_own 구매가 0건이라 터지지 않았을 뿐이다(가격을 800으로 내린 이 커밋이 그 전제를 깬다).
--   fail-open 도 함께 닫는다: 프로필 행이 없으면 my_role() 이 NULL 이라 `<> 'admin'` 이 NULL 이 되어
--   가드를 건너뛴다 → `is distinct from`(20260828d 와 같은 처방).
create or replace function public.admin_refund_purchase(p_purchase_id bigint, p_reason text)
returns table(refunded integer, available integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_admin  uuid := (select auth.uid());
  v_reason text;
  v_user   uuid;
  v_pp     public.point_purchases;
  v_rt     public.mark_rentals;
  v_refund int;
  v_block  text;
  v_remaining_h numeric;
  v_this_h      numeric;
  v_ap int; v_sp int;
begin
  if v_admin is null then raise exception '로그인이 필요합니다'; end if;
  if public.my_role() is distinct from 'admin' then raise exception '권한이 없습니다'; end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 4 then raise exception '환불 사유를 4자 이상 남겨 주세요'; end if;

  select user_id into v_user from public.point_purchases where id = p_purchase_id;
  if v_user is null then raise exception '환불할 구매 내역이 없습니다'; end if;

  perform 1 from public.profiles where id = v_user for update;
  if not found then raise exception '프로필을 찾을 수 없습니다'; end if;

  select * into v_pp from public.point_purchases where id = p_purchase_id for update;

  -- 판정은 refund_quote 가 단일 출처다(응원·끌올의 차단도 여기서 걸린다).
  select q.points, q.block into v_refund, v_block from public.refund_quote(p_purchase_id) q;
  if v_block is not null then raise exception '%', v_block; end if;

  if v_pp.kind = 'shout' then
    -- expires_at 은 건드리지 않는다 — 진열 쿼리와 RLS 가 hidden 을 보므로 이것만으로 사라지고,
    -- 원래 노출 기간이 기록으로 남는다.
    update public.community_shouts
       set hidden = true, hidden_by = v_admin, hidden_at = now()
     where id = v_pp.shout_id and hidden = false;

  elsif v_pp.kind = 'mark_own' then
    -- 산 것을 되돌린다 = 소장을 회수한다. 이걸 빼면 점수만 돌려주고 마크는 남아 발권이 된다.
    delete from public.mark_unlocks
     where user_id = v_user and mark_key = v_pp.mark_key;
    -- 장착 중이었다면 refund_quote 가 이미 막지만, 경합(그 사이 장착)까지 감안해 한 번 더 내린다.
    update public.profiles set equipped_mark = null
     where id = v_user and equipped_mark = v_pp.mark_key;

  else
    select * into v_rt from public.mark_rentals where user_id = v_user for update;
    v_remaining_h := greatest(0, extract(epoch from (v_rt.expires_at - now())) / 3600.0);
    v_this_h := least(v_remaining_h, v_pp.duration_hours::numeric);
    -- ⚠ least(..., now()) 금지 — 이어 붙은 이전 구매분까지 회수해 버린다.
    update public.mark_rentals
       set expires_at = v_rt.expires_at - (v_this_h || ' hours')::interval,
           updated_at = now()
     where user_id = v_user;
    if not exists (select 1 from public.mark_rentals
                    where user_id = v_user and expires_at > now()) then
      update public.profiles set equipped_mark = null
       where id = v_user and equipped_mark = v_pp.mark_key;
    end if;
  end if;

  -- 점수 복원은 spent_points 감소로만. activity_points 는 건드리지 않는다.
  update public.profiles
     set spent_points = greatest(0, coalesce(spent_points, 0) - v_refund)
   where id = v_user;

  update public.point_purchases
     set refunded_at = now(), refunded_by = v_admin,
         refund_points = v_refund, refund_reason = v_reason
   where id = p_purchase_id;

  select coalesce(p.activity_points, 0), coalesce(p.spent_points, 0)
    into v_ap, v_sp from public.profiles p where p.id = v_user;

  return query select v_refund, greatest(0, v_ap - v_sp);
end $function$;

-- ────────────────────────────────────────────────────────────────────────────
-- §8. ACL — CREATE OR REPLACE 는 ACL 을 초기화한다. 재정의한 함수는 전부 다시 명시한다.
--   ⚠ `revoke from anon` 만으로는 무효다(PUBLIC 기본 GRANT). 반드시 FROM PUBLIC.
-- ────────────────────────────────────────────────────────────────────────────
revoke all on function public.send_cheer(uuid, uuid) from public, anon;
grant execute on function public.send_cheer(uuid, uuid) to authenticated, service_role;

revoke all on function public.bump_post(uuid) from public, anon;
grant execute on function public.bump_post(uuid) to authenticated, service_role;

revoke all on function public.refund_quote(bigint) from public, anon;
grant execute on function public.refund_quote(bigint) to authenticated, service_role;

revoke all on function public.admin_refund_purchase(bigint, text) from public, anon;
grant execute on function public.admin_refund_purchase(bigint, text) to authenticated, service_role;
