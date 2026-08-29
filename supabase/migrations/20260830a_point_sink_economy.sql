-- ============================================================================
-- 활동점수 소비 경제 재설계 (2026-08-30, 오너: "활동포인트도 소모가 있잖아")
--
-- ── 0. 먼저 '5만 점'의 출처를 규명했다. 추측이 아니라 대사(對査)다 ─────────────
--   나누리(admin) 50,086 — 획득 증거를 전부 세어 보면:
--     체크인 2건(둘 다 이벤트 2배 기간 밖 → +3×2=6) · 글 1개(+3) · 미션 청구 2건(≤+60)
--     · 순위 시상 7점 · 출석 최대 92일(+92, 가입 5/30~마지막 적립 8/29)
--     ⇒ **상한이 168점**이다. 잔고는 50,086 → 차이 **정확히 50,000**.
--   양찬미(venue_owner) 14,013 — 체크인 0 · 글 0 · 댓글 0 · 미션 0 · 순위 0 · 추천 0.
--     출석만 가능하고 그마저 최대 22일(5/31~6/21) ⇒ 잔고 14,013 → 차이 **정확히 14,000**.
--     14,000 은 crown(KK 등극) 마크 해금선이자 _tier_level 12(홀덤 마스터) 진입선이다.
--   ⇒ 둘 다 **등급 표시를 확인하려고 손으로 넣은 시드값**이다. 과다 지급 경로가 아니다.
--     (경로가 샜다면 활동 흔적이 남는다 — 활동이 0인데 잔고만 있는 건 주입뿐이다.)
--
--   주입 통로: guard_profile_privileged_cols 가 activity_points 변경을
--   `my_role() = 'admin'` 이면 통과시킨다 → 운영자가 PostgREST/SQL 로 직접 UPDATE 가능,
--   **기록이 남지 않는다.** 그래서 "어디서 왔는지"를 대사로 역산해야 했다.
--   같은 일이 다시 일어나지 않게 이 마이그레이션에서 지급을 감사 대상으로 만든다(§7).
--
--   ※ 기존 잔고는 깎지 않는다(오너 지시: 유저 자산). 다만 사실관계는 위에 남긴다.
--     실사용자 최고 잔고는 33점(E2E 봇)이고 그다음이 22점이다 — **재고 문제는 없다.**
--     지금 필요한 건 재고 흡수가 아니라 **소비처 자체**다(총 소비 0점 · 외침 0건).
--
-- ── 1. 하루 획득량(실측 재확인) ─────────────────────────────────────────────
--   출석 +1 · 글 +3(하루 30 상한) · 댓글 +1(하루 10 상한) · 체크인 +3 · 주간미션 60/주(≈8.6)
--   ⇒ **상한을 다 채운 하루 ≈ 52점**. 이 문서의 가격 환산 단위는 **하루 = 50점**.
--   ⇒ 상한을 안 채우는 보통 유저 ≈ **하루 15점**(출석1 + 체크인3 + 글 1~2개 + 미션 지분).
--     가격은 50 으로 정하되 "며칠 걸리나"는 반드시 15 로도 검산한다.
--
-- ── 2. 왜 200점 하나로는 경제가 안 도는가 ───────────────────────────────────
--   (a) **첫 소비가 너무 멀다.** 보통 유저에게 200점은 14일이다. 2주 동안 '점수는 쓰는 것'이라는
--       사실을 배울 기회가 없으면 점수는 그냥 장식이 된다. → 하루치(50점) 진입 상품이 필요하다.
--   (b) **반복이 없다.** 소비처가 하나뿐이면 그 하나를 안 쓰는 사람에게 경제는 존재하지 않는다.
--   (c) **상한이 없다.** 오래 모은 사람이 살 '더 큰 것'이 없으면 잔고는 영원히 고인다.
--   ⇒ 가격 사다리를 **하루치 → 나흘 → 6일 → 12일 → 22일 → 40일** 로 깐다.
--
-- ── 3. 가격표 (전부 하루 50점 기준 환산) ────────────────────────────────────
--   기간 마크 1일권      50점 = 하루치      (보통 유저 4일)   24시간   반복
--   기간 마크 7일권     300점 = 6일치       (보통 20일)        7일     반복 · 1일권 7장(350)보다 쌈
--   기간 마크 30일권  1,100점 = 22일치      (보통 73일)       30일     반복 · 장기 보유자의 정기 소비처
--   외치기 기본         200점 = 나흘치      (기존값 유지)      6시간   하루 3회
--   외치기 하이라이트   600점 = 12일치                        12시간   반복
--   외치기 전광판     2,000점 = 40일치                        24시간   반복 · 최상위
--
--   묶음 할인(7일권·30일권)은 '혜택 구매'가 아니라 **같은 꾸미기를 더 오래**일 뿐이다(§28 준수).
--   소비처는 전부 꾸미기·표현이고 참가·상금·순위에 어떤 이점도 주지 않는다.
--
-- ── 4. 도달 마크 16종은 그대로 둔다(구매형으로 돌리지 않는다) ────────────────
--   (a) 이미 해금해 장착 중인 마크가 '사야 하는 것'이 되면 **산 걸 빼앗는** 회귀다.
--       spent_points 를 분리한 이유가 바로 그 회귀를 막기 위해서였다 — 같은 실수를 반대편에서 반복하게 된다.
--   (b) 도달 마크는 **버는 이유**고 기간 마크는 **쓰는 이유**다. 버는 이유를 소비처로 개조하면
--       소비처 하나를 얻고 획득 동기를 잃는다(순손실).
--   (c) 그래서 소비형은 **만료되는 별도 마크군**으로 신설한다. 만료가 곧 반복 소비다.
--
-- ── 5. 부수 발견: 마크 장착에 서버 검증이 없었다 ─────────────────────────────
--   setEquippedMark 는 profiles.equipped_mark 를 클라이언트가 직접 UPDATE 한다.
--   '해금 여부'는 화면(TierLeaderboard)에서만 본다 → API 를 직접 부르면 **0점으로도 크라운 장착**이 된다.
--   지금까지는 코스메틱이라 티가 안 났지만, 마크가 유료가 되는 순간 이건 곧 **결제 우회**다.
--   ⇒ 카탈로그를 서버로 옮기고(shop_marks/shop_skus) 장착도 RPC 로만 되게 막는다.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1) 카탈로그 — 마크 정의. 서버가 단일 출처, 클라이언트는 읽기만 한다.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.shop_marks (
  key    text primary key,
  emoji  text not null,
  name   text not null,
  descr  text not null,
  kind   text not null check (kind in ('earn','rent')),
  need   int,                                   -- earn 전용: 도달 점수
  sort   int  not null default 0,
  active boolean not null default true,
  constraint shop_marks_need_matches_kind check ((kind = 'earn') = (need is not null))
);

comment on table public.shop_marks is
  '상점 마크 카탈로그. kind=earn 은 activity_points 도달로 해금(차감 없음·영구), kind=rent 는 기간제 구매(만료). 클라이언트(src/lib/shopMarks.ts)는 이 표를 읽기만 한다.';

-- 기존 16종(loyalty.SHOP_MARKS 6 + shopMarks.EXTRA_MARKS 10)을 **값 그대로** 이관한다.
-- 하나라도 키·need 가 달라지면 이미 장착한 유저의 마크가 조용히 사라진다.
insert into public.shop_marks (key, emoji, name, descr, kind, need, sort) values
  ('spade_white',   '♤',  '화이트 스페이드', '첫 걸음 — 100점 도달',                 'earn',   100,  10),
  ('chip_stack',    '🪙', '첫 스택',         '판에 앉았다 — 250점',                  'earn',   250,  20),
  ('club_green',    '♧',  '그린 클로버',     '단골의 증표 — 500점',                  'earn',   500,  30),
  ('joker',         '🃏', '조커',            '변수의 카드 — 800점',                  'earn',   800,  40),
  ('hot_streak',    '🔥', '핫 스트릭',       '달아오른 흐름 — 1,200점',              'earn',  1200,  50),
  ('heart_red',     '♥',  '레드 하트',       '열정의 증표 — 1,500점',                'earn',  1500,  60),
  ('bullseye',      '🎯', '타겟',            '노린 자리는 놓치지 않는다 — 2,200점',   'earn',  2200,  70),
  ('rush',          '🚀', '러시',            '수직 상승 — 3,000점',                  'earn',  3000,  80),
  ('diamond_blue',  '♦',  '블루 다이아',     '상위권 — 4,000점',                     'earn',  4000,  90),
  ('star_player',   '🌟', '스타 플레이어',   '눈에 띄는 사람 — 5,000점',             'earn',  5000, 100),
  ('gem_hand',      '💎', '다이아 핸드',     '쥐면 놓지 않는다 — 6,500점',           'earn',  6500, 110),
  ('spade_gold',    '♠',  '골든 스페이드',   '고수의 상징 — 8,000점',                'earn',  8000, 120),
  ('turbo',         '⚡', '터보',            '레벨업이 빠르다 — 10,000점',           'earn', 10000, 130),
  ('shark',         '🦈', '샤크',            '테이블의 포식자 — 12,000점',           'earn', 12000, 140),
  ('crown',         '👑', '크라운',          'KK 등극 — 14,000점',                   'earn', 14000, 150),
  ('champion',      '🏆', '챔피언',          'KK 너머 — 20,000점',                   'earn', 20000, 160)
on conflict (key) do update
  set emoji = excluded.emoji, name = excluded.name, descr = excluded.descr,
      kind = excluded.kind, need = excluded.need, sort = excluded.sort;

-- 기간 마크 6종 — 도달 사다리와 겹치지 않는 글리프. '무엇을' 고르는 재미가 재구매의 이유다.
insert into public.shop_marks (key, emoji, name, descr, kind, need, sort) values
  ('rent_clover',    '🍀', '네잎클로버', '오늘의 행운을 걸치고 다닌다', 'rent', null, 210),
  ('rent_wave',      '🌊', '웨이브',     '흐름을 타는 중',              'rent', null, 220),
  ('rent_dragon',    '🐉', '드래곤',     '판을 삼킬 기세',              'rent', null, 230),
  ('rent_moon',      '🌙', '초승달',     '조용히 오래 남는 사람',       'rent', null, 240),
  ('rent_butterfly', '🦋', '나비',       '가볍게, 그러나 눈에 띄게',    'rent', null, 250),
  ('rent_note',      '🎵', '리듬',       '내 페이스대로',               'rent', null, 260)
on conflict (key) do update
  set emoji = excluded.emoji, name = excluded.name, descr = excluded.descr,
      kind = excluded.kind, need = excluded.need, sort = excluded.sort;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) 카탈로그 — 가격(SKU). shout_rules() 도 이제 여기를 읽는다 = 가격 출처가 하나다.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.shop_skus (
  key            text primary key,
  kind           text not null check (kind in ('mark_rent','shout')),
  label          text not null,
  descr          text not null,
  price          int  not null check (price > 0),
  duration_hours int  not null check (duration_hours > 0),
  tier_rank      int  not null default 1,       -- shout 전용: 진열 우선순위(큰 값이 위)
  sort           int  not null default 0,
  active         boolean not null default true
);

comment on table public.shop_skus is
  '소비형 상품 가격표(단일 출처). 가격 환산 단위는 하루 50점(상한을 다 채운 하루 획득량 실측치). 값을 바꾸려면 여기만 바꾼다 — 서버 판정·구매 화면·상점 카드가 동시에 따라온다.';

insert into public.shop_skus (key, kind, label, descr, price, duration_hours, tier_rank, sort) values
  ('mark_rent_1d',  'mark_rent',  '1일권',     '하루치 50점 — 오늘 하루 걸쳐 본다',         50,   24, 1, 10),
  ('mark_rent_7d',  'mark_rent',  '7일권',     '6일치 300점으로 7일 — 1일권 7장보다 싸다', 300,  168, 1, 20),
  ('mark_rent_30d', 'mark_rent',  '30일권',    '22일치 1,100점으로 한 달',                1100,  720, 1, 30),
  ('shout_basic',   'shout',      '기본',      '커뮤니티 맨 위에 6시간',                   200,    6, 1, 10),
  ('shout_gold',    'shout',      '하이라이트','12시간 · 금색 강조로 두 배 눈에 띄게',      600,   12, 2, 20),
  ('shout_board',   'shout',      '전광판',    '24시간 · 가장 크게, 맨 위 고정',          2000,   24, 3, 30)
on conflict (key) do update
  set kind = excluded.kind, label = excluded.label, descr = excluded.descr,
      price = excluded.price, duration_hours = excluded.duration_hours,
      tier_rank = excluded.tier_rank, sort = excluded.sort;

-- 읽기는 전원 공개(가격표다). 쓰기 정책은 두지 않는다 → 운영자도 SQL/서비스롤로만 바꾼다.
alter table public.shop_marks enable row level security;
alter table public.shop_skus  enable row level security;
drop policy if exists shop_marks_read on public.shop_marks;
create policy shop_marks_read on public.shop_marks for select to anon, authenticated using (true);
drop policy if exists shop_skus_read on public.shop_skus;
create policy shop_skus_read  on public.shop_skus  for select to anon, authenticated using (true);

-- ────────────────────────────────────────────────────────────────────────────
-- 3) 기간 마크 보유 — 유저당 활성 렌탈 1건
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.mark_rentals (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  mark_key   text not null references public.shop_marks(key),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

comment on table public.mark_rentals is
  '기간 마크 보유(유저당 1건). 같은 마크를 다시 사면 기간이 이어 붙고, 다른 마크를 사면 교체된다. 생성·연장은 buy_mark_rental() RPC 로만 — 직접 INSERT 정책을 두지 않는다.';

alter table public.mark_rentals enable row level security;
drop policy if exists mark_rentals_read on public.mark_rentals;
create policy mark_rentals_read on public.mark_rentals
  for select to authenticated
  using (user_id = (select auth.uid()) or public.my_role() = 'admin');

-- ────────────────────────────────────────────────────────────────────────────
-- 4) 외치기 등급
-- ────────────────────────────────────────────────────────────────────────────
alter table public.community_shouts
  add column if not exists tier      text not null default 'basic',
  add column if not exists tier_rank int  not null default 1;

comment on column public.community_shouts.tier is
  '구매 등급(basic/gold/board). tier_rank 는 진열 정렬용 사본 — 가격표가 바뀌어도 과거 게시물의 자리는 그대로다(cost 를 사본으로 남기는 것과 같은 이유).';

-- 등급별 규칙 조회. 없는 등급이면 0행 → 호출부가 예외를 던진다.
create or replace function public.shout_tier(p_tier text)
returns table(tier text, cost int, ttl_hours int, tier_rank int, label text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select substring(s.key from 7), s.price, s.duration_hours, s.tier_rank, s.label
  from public.shop_skus s
  where s.key = 'shout_' || coalesce(nullif(btrim(p_tier), ''), 'basic')
    and s.kind = 'shout' and s.active;
$fn$;

-- 기존 shout_rules() 는 그대로 살려 둔다(클라이언트가 이미 읽고 있다).
-- 다만 가격·노출시간은 이제 shop_skus 에서 읽는다 — 두 곳에 값이 흩어지지 않게.
-- ⚠ 표를 읽으므로 immutable → stable 로 낮춘다.
create or replace function public.shout_rules()
returns table(cost integer, cooldown_minutes integer, daily_cap integer,
              max_len integer, min_len integer, ttl_hours integer)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select s.price, 10, 3, 60, 2, s.duration_hours
  from public.shop_skus s where s.key = 'shout_basic';
$fn$;

comment on function public.shout_rules() is
  '외치기 공통 규칙(쿨다운 10분·하루 3회·2~60자) + 기본 등급의 가격/노출시간. 가격은 shop_skus.shout_basic 이 출처다.';

-- 등급 인자를 받는 buy_shout. 1인자 버전은 오버로드 모호성을 만들므로 **드롭 후 교체**한다
-- (PostgREST 가 {p_message} 만 보내면 두 시그니처 중 어느 것인지 결정할 수 없다).
drop function if exists public.buy_shout(text);

create or replace function public.buy_shout(p_message text, p_tier text default 'basic')
returns public.community_shouts
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid    uuid := (select auth.uid());
  v_r      record;   -- 공통 규칙(쿨다운·상한·길이)
  v_t      record;   -- 등급별 가격·노출
  v_msg    text;
  v_nick   text;
  v_status text;
  v_points int;
  v_spent  int;
  v_row    public.community_shouts;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  select * into v_r from public.shout_rules();
  select * into v_t from public.shout_tier(p_tier);
  if v_t.cost is null then raise exception '알 수 없는 외치기 등급입니다'; end if;

  -- 1) 정규화 + 길이 (연속 공백/줄바꿈을 한 칸으로 접어 '한 줄' 보장)
  v_msg := btrim(regexp_replace(coalesce(p_message, ''), '\s+', ' ', 'g'));
  if char_length(v_msg) < v_r.min_len then
    raise exception '외침은 %자 이상 써 주세요', v_r.min_len;
  end if;
  if char_length(v_msg) > v_r.max_len then
    raise exception '외침은 %자까지 쓸 수 있어요', v_r.max_len;
  end if;

  -- 2) 금칙어(서버 최종 판정)
  if public.shout_blocked(v_msg) then
    raise exception '게시할 수 없는 표현이나 링크가 들어 있어요';
  end if;

  -- 3) 계정 상태 + 잔액 조회 — **행 잠금**. 이 아래 검사는 모두 잠금 뒤라
  --    같은 사람의 동시 요청(더블탭)은 줄을 서고, 뒤 요청은 앞 요청의 결과를 보게 된다.
  select coalesce(p.nickname, p.name, '회원'), coalesce(p.status::text, 'active'),
         coalesce(p.activity_points, 0), coalesce(p.spent_points, 0)
    into v_nick, v_status, v_points, v_spent
  from public.profiles p where p.id = v_uid for update;
  if not found then raise exception '프로필을 찾을 수 없습니다'; end if;
  if v_status <> 'active' then raise exception '제재 중인 계정은 외치기를 쓸 수 없습니다'; end if;

  -- 4) 도배 방지 — 쿨다운 + 하루 상한은 **등급과 무관하게 합산**한다.
  --    등급마다 상한을 따로 주면 하루 9번 외칠 수 있게 되어 상한이 의미를 잃는다.
  if exists (
    select 1 from public.community_shouts s
     where s.user_id = v_uid
       and s.created_at > now() - (v_r.cooldown_minutes || ' minutes')::interval
  ) then
    raise exception '외치기는 %분에 한 번만 쓸 수 있어요', v_r.cooldown_minutes;
  end if;
  if (
    select count(*) from public.community_shouts s
     where s.user_id = v_uid and s.created_at > now() - interval '24 hours'
  ) >= v_r.daily_cap then
    raise exception '하루 %번까지만 외칠 수 있어요', v_r.daily_cap;
  end if;

  -- 5) 잔액 확인 → 차감 → 게시 (같은 트랜잭션: 하나라도 실패하면 전부 없던 일)
  if v_points - v_spent < v_t.cost then
    raise exception '활동점수가 부족해요 (필요 %점 · 사용 가능 %점)', v_t.cost, v_points - v_spent;
  end if;
  update public.profiles
     set spent_points = coalesce(spent_points, 0) + v_t.cost
   where id = v_uid;
  insert into public.community_shouts(user_id, nickname, message, cost, tier, tier_rank, expires_at)
  values (v_uid, v_nick, v_msg, v_t.cost, v_t.tier, v_t.tier_rank,
          now() + (v_t.ttl_hours || ' hours')::interval)
  returning * into v_row;
  return v_row;
end $fn$;

comment on function public.buy_shout(text, text) is
  '외치기 구매 — 등급별 가격/노출시간(shop_skus)을 적용해 길이·금칙어·쿨다운·하루 상한·잔액을 모두 통과해야 차감+게시가 함께 일어난다.';

-- 진열 정렬용(등급 높은 것이 위로, 같으면 최신순)
create index if not exists community_shouts_rank_idx
  on public.community_shouts (tier_rank desc, created_at desc) where hidden = false;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) 기간 마크 구매 — 차감 + 지급이 한 트랜잭션. buy_shout 의 안전장치를 그대로 옮긴다.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.buy_mark_rental(p_sku text, p_mark_key text)
returns public.mark_rentals
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid    uuid := (select auth.uid());
  v_sku    public.shop_skus;
  v_status text;
  v_points int;
  v_spent  int;
  v_cur    public.mark_rentals;
  v_found  boolean;
  v_until  timestamptz;
  v_row    public.mark_rentals;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;

  select * into v_sku from public.shop_skus
   where key = p_sku and kind = 'mark_rent' and active;
  if not found then raise exception '판매 중인 상품이 아닙니다'; end if;

  if not exists (select 1 from public.shop_marks
                  where key = p_mark_key and kind = 'rent' and active) then
    raise exception '기간 마크가 아니거나 판매 중이 아닙니다';
  end if;

  -- 프로필 행 잠금 — 이 아래 검사는 전부 잠금 뒤다(중복 클릭이 잔액 검사를 뚫지 못한다).
  select coalesce(p.status::text, 'active'),
         coalesce(p.activity_points, 0), coalesce(p.spent_points, 0)
    into v_status, v_points, v_spent
  from public.profiles p where p.id = v_uid for update;
  if not found then raise exception '프로필을 찾을 수 없습니다'; end if;
  if v_status <> 'active' then raise exception '제재 중인 계정은 상점을 이용할 수 없습니다'; end if;

  if v_points - v_spent < v_sku.price then
    raise exception '활동점수가 부족해요 (필요 %점 · 사용 가능 %점)', v_sku.price, v_points - v_spent;
  end if;

  select * into v_cur from public.mark_rentals where user_id = v_uid for update;
  v_found := found;

  -- 같은 마크를 아직 쓰는 중이면 **이어 붙이고**, 아니면 지금부터 새로 센다.
  if v_found and v_cur.mark_key = p_mark_key and v_cur.expires_at > now() then
    v_until := v_cur.expires_at;
  else
    v_until := now();
  end if;

  -- 무한 적립 방지 — 최대 1년치까지만 쌓인다(5만 점 보유자가 30일권을 45장 사서
  -- 4년치를 선점하는 상황을 막는다. 소비처는 '계속 쓰는 곳'이어야지 '한 번에 잠그는 곳'이면 안 된다).
  --
  -- ⚠ 상한은 **깎지 말고 거절한다.** least() 로 잘라내면 차감은 정가 그대로 일어나는데
  --    받는 기간만 줄어든다 — 360일 남은 사람이 30일권(1,100점)을 사면 5일만 늘고,
  --    365일에 닿은 뒤로는 **1,100점을 내고 0일을 받는다.** 돈만 받고 아무것도 안 주는 경로다.
  --    한도를 넘는 구매는 아예 막고 이유를 알려 준다(부분 청구 없음).
  if v_until + (v_sku.duration_hours || ' hours')::interval > now() + interval '365 days' then
    raise exception '기간 마크는 최대 1년치까지만 미리 살 수 있어요 (지금 %일 남음)',
      greatest(0, ceil(extract(epoch from v_until - now()) / 86400.0))::int;
  end if;
  v_until := v_until + (v_sku.duration_hours || ' hours')::interval;

  update public.profiles
     set spent_points = coalesce(spent_points, 0) + v_sku.price
   where id = v_uid;

  insert into public.mark_rentals (user_id, mark_key, expires_at, updated_at)
  values (v_uid, p_mark_key, v_until, now())
  on conflict (user_id) do update
    set mark_key = excluded.mark_key, expires_at = excluded.expires_at, updated_at = now()
  returning * into v_row;

  -- 산 즉시 장착한다(사고 나서 한 번 더 눌러야 보이면 '샀는데 아무 일도 안 났다'가 된다).
  update public.profiles set equipped_mark = p_mark_key where id = v_uid;

  return v_row;
end $fn$;

comment on function public.buy_mark_rental(text, text) is
  '기간 마크 구매 — 잔액/제재/상품 유효성을 서버가 최종 판정하고 차감·지급·장착이 한 트랜잭션에서 일어난다. 같은 마크 재구매는 기간이 이어 붙는다(최대 1년).';

-- 내 기간 마크
create or replace function public.my_mark_rental()
returns table(mark_key text, expires_at timestamptz)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select r.mark_key, r.expires_at
  from public.mark_rentals r
  where r.user_id = (select auth.uid()) and r.expires_at > now();
$fn$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6) 장착 — 서버 검증(§5 구멍 폐쇄). 이제 이 RPC 만이 equipped_mark 를 바꾼다.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.set_equipped_mark(p_key text)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid  uuid := (select auth.uid());
  v_mark public.shop_marks;
  v_pts  int;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;

  -- 해제
  if p_key is null or btrim(p_key) = '' then
    update public.profiles set equipped_mark = null where id = v_uid;
    return null;
  end if;

  select * into v_mark from public.shop_marks where key = p_key and active;
  if not found then raise exception '없는 마크입니다'; end if;

  if v_mark.kind = 'earn' then
    select coalesce(activity_points, 0) into v_pts from public.profiles where id = v_uid;
    if v_pts < v_mark.need then
      raise exception '아직 해금되지 않은 마크입니다 (필요 %점 · 현재 %점)', v_mark.need, v_pts;
    end if;
  else
    if not exists (
      select 1 from public.mark_rentals
       where user_id = v_uid and mark_key = p_key and expires_at > now()
    ) then
      raise exception '기간이 남아 있는 마크만 장착할 수 있어요';
    end if;
  end if;

  update public.profiles set equipped_mark = p_key where id = v_uid;
  return p_key;
end $fn$;

comment on function public.set_equipped_mark(text) is
  '마크 장착/해제 — 도달 마크는 activity_points 도달을, 기간 마크는 유효한 렌탈을 서버가 확인한다. 종전에는 클라이언트가 profiles 를 직접 UPDATE 해서 0점으로도 아무 마크나 장착할 수 있었다.';

-- 표시 경로에도 같은 검증을 건다 — 장착 시점에 유효했더라도 **만료되면 사라져야** 한다.
create or replace function public.get_equipped_marks(p_ids uuid[])
returns table(id uuid, equipped_mark text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select p.id, p.equipped_mark
  from public.profiles p
  left join public.shop_marks   m on m.key = p.equipped_mark
  left join public.mark_rentals r on r.user_id = p.id
  where p.id = any(p_ids)
    and p.equipped_mark is not null
    and (
      -- 카탈로그에 없는 키는 종전대로 통과시킨다(하위호환 — 여기서 조용히 지우면
      -- 유저에겐 '산 게 없어진' 것으로 보인다. loyalty.markEmojiOf 경고와 같은 함정).
      m.key is null
      or (m.kind = 'earn' and coalesce(p.activity_points, 0) >= m.need)
      or (m.kind = 'rent' and r.mark_key = p.equipped_mark and r.expires_at > now())
    );
$fn$;

-- 리더보드도 같은 규칙으로 마크를 노출한다(두 경로가 다르면 같은 사람이 화면마다 다르게 보인다).
create or replace function public.get_activity_leaderboard(p_limit integer default 20)
returns table(id uuid, nickname text, activity_points integer, avatar_color text,
              role user_role, equipped_mark text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select p.id, p.nickname, coalesce(p.activity_points, 0) as activity_points,
         p.avatar_color, p.role,
         case
           when m.key is null then p.equipped_mark
           when m.kind = 'earn' and coalesce(p.activity_points, 0) >= m.need then p.equipped_mark
           when m.kind = 'rent' and r.mark_key = p.equipped_mark and r.expires_at > now() then p.equipped_mark
           else null
         end as equipped_mark
  from public.profiles p
  left join public.shop_marks   m on m.key = p.equipped_mark
  left join public.mark_rentals r on r.user_id = p.id
  where coalesce(p.status, 'active') = 'active'
    and p.role <> 'admin'
    and coalesce(p.shadowbanned, false) = false
  order by coalesce(p.activity_points, 0) desc, p.joined_at asc nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$fn$;

-- ────────────────────────────────────────────────────────────────────────────
-- 7) 지급을 기록으로 남긴다 — '5만 점이 어디서 왔는지'를 다시는 역산하지 않도록.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.point_grants (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  delta      int  not null,
  reason     text not null,
  granted_by uuid,
  created_at timestamptz not null default now()
);

comment on table public.point_grants is
  '운영자 수기 지급/회수 기록. 2026-08-30 이전에는 운영자가 profiles.activity_points 를 직접 UPDATE 할 수 있었고 기록이 남지 않아, 나누리 50,086 / 양찬미 14,013 의 출처를 활동 흔적 대사로 역산해야 했다(각각 50,000 / 14,000 주입). 이제 admin_grant_points() 만이 통로다.';

create index if not exists point_grants_user_idx on public.point_grants (user_id, created_at desc);

alter table public.point_grants enable row level security;
drop policy if exists point_grants_read on public.point_grants;
create policy point_grants_read on public.point_grants
  for select to authenticated
  using (user_id = (select auth.uid()) or public.my_role() = 'admin');

create or replace function public.admin_grant_points(p_user uuid, p_delta int, p_reason text)
returns int
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare v_uid uuid := (select auth.uid()); v_reason text; v_after int;
begin
  if v_uid is null or public.my_role() <> 'admin' then raise exception '권한이 없습니다'; end if;
  if p_delta = 0 then raise exception '변동 없는 지급입니다'; end if;
  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 4 then raise exception '사유를 4자 이상 남겨 주세요'; end if;

  update public.profiles
     set activity_points = greatest(0, coalesce(activity_points, 0) + p_delta)
   where id = p_user
  returning activity_points into v_after;
  if v_after is null then raise exception '대상을 찾을 수 없습니다'; end if;

  insert into public.point_grants (user_id, delta, reason, granted_by)
  values (p_user, p_delta, v_reason, v_uid);
  return v_after;
end $fn$;

comment on function public.admin_grant_points(uuid, int, text) is
  '운영자 활동점수 지급/회수 — 사유 필수, point_grants 에 기록된다. 직접 UPDATE 는 guard_profile_privileged_cols 가 막는다.';

-- 운영자의 직접 UPDATE 도 막는다. 기존 가드는 admin 을 통째로 면제했는데,
-- 그 면제가 곧 '기록 없는 발권'이었다. 포인트 두 컬럼과 장착 마크만 admin 에게도 닫는다
-- (SECURITY DEFINER RPC 는 current_user 가 함수 소유자라 이 가드에 걸리지 않는다).
create or replace function public.guard_profile_privileged_cols()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if current_user in ('authenticated','anon') then
    -- ① 포인트 계열 — 운영자 포함 **누구도** 직접 못 바꾼다. 통로는 RPC 뿐이다.
    if new.activity_points is distinct from old.activity_points
       or new.spent_points is distinct from old.spent_points
    then
      raise exception '활동점수는 직접 변경할 수 없습니다 (운영자는 admin_grant_points 를 쓰세요)';
    end if;
    -- ② 장착 마크 — 해금/기간 검증을 우회한 장착을 막는다(set_equipped_mark 로만).
    if new.equipped_mark is distinct from old.equipped_mark then
      raise exception '마크 장착은 set_equipped_mark 로만 할 수 있습니다';
    end if;
    -- ③ 나머지 보호 항목 — 종전과 동일하게 admin 은 면제
    if coalesce(public.my_role()::text, '') <> 'admin' then
      if new.role is distinct from old.role
         or new.verified_at is distinct from old.verified_at
         or new.ci_hash is distinct from old.ci_hash
         or new.identity_tombstoned is distinct from old.identity_tombstoned
         or new.approved is distinct from old.approved
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
  end if;
  return new;
end $fn$;

-- ────────────────────────────────────────────────────────────────────────────
-- 8) ACL — anon·PUBLIC 회수 후 필요한 롤에만
-- ────────────────────────────────────────────────────────────────────────────
revoke all on function public.shout_tier(text)                     from public, anon, authenticated;
revoke all on function public.buy_shout(text, text)                from public, anon, authenticated;
revoke all on function public.buy_mark_rental(text, text)          from public, anon, authenticated;
revoke all on function public.my_mark_rental()                     from public, anon, authenticated;
revoke all on function public.set_equipped_mark(text)              from public, anon, authenticated;
revoke all on function public.admin_grant_points(uuid, int, text)  from public, anon, authenticated;
revoke all on function public.shout_rules()                        from public, anon, authenticated;

grant execute on function public.shout_tier(text)                    to authenticated, service_role;
grant execute on function public.buy_shout(text, text)               to authenticated, service_role;
grant execute on function public.buy_mark_rental(text, text)         to authenticated, service_role;
grant execute on function public.my_mark_rental()                    to authenticated, service_role;
grant execute on function public.set_equipped_mark(text)             to authenticated, service_role;
grant execute on function public.admin_grant_points(uuid, int, text) to authenticated, service_role;
grant execute on function public.shout_rules()                       to authenticated, service_role;

grant select on public.shop_marks   to anon, authenticated;
grant select on public.shop_skus    to anon, authenticated;
grant select on public.mark_rentals to authenticated;
grant select on public.point_grants to authenticated;
