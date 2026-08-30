-- ============================================================================
-- 20260830n — 소유물형·상위 티어 상품 6종 (오너 승인 ①-B, 2026-08-30)
--
-- 앞 단계(20260830m)가 만든 것은 **가격 사다리의 아랫칸**이다: 응원 30 · 끌올 100 ·
-- 외치기 50/150 · 마크 800. 이 마이그레이션은 그 위에 얹는다. 기준은 앞 단계와 같다 —
-- **하루 최대 획득 50점**(출석1 + 체크인3×3 + 글 30상한 + 댓글 10상한).
--
-- ── 왜 이 6종인가 ───────────────────────────────────────────────────────────
--  ① 외치기 예약 슬롯 200점 — 지금 외치기는 '대기열 순서대로'라 **언제 나갈지 모른다.**
--     그런데 외칠 이유는 대부분 시각이 정해져 있다('20시 바운티 시작', '지금 딥스택 자리 2개').
--     시각을 못 고르면 상품이 반쪽이다. 하루 4일치(200) — 시각 지정은 대기열 전체를 밀어내는
--     권리라 가장 비싸다.
--  ② 외치기 40초 연속 슬롯 120점 — 20초는 60자(외침 상한)를 읽히기에 짧다.
--     기본 2개(100점)보다 **비싸게** 매긴다: 두 번 사서 이어 붙이면 사이에 남의 외침이 끼므로
--     **연속성 자체가 값**이다. 이미 '두 번 사서 이어 붙이고 싶다'는 행동을 상품화한 것이라
--     유저가 새로 배울 개념이 없다.
--  ③ 프로필 카드 프레임 5종 · 각 400점 — 프로필 카드는 유저가 앱 밖으로 내보내는 산출물인데
--     디자인이 하나뿐이었다. 8일치.
--     ⚠ 캔버스(2D)는 CSS 변수를 못 읽는다 → 프레임 색은 **hex 상수**이고 카드 배경은
--       **다크 고정**이다(라이트 테마에서도 카드는 어둡게 나간다). 클라이언트 주석 참조.
--  ④ 닉네임 색 6종 · 각 600점 — 마크와 **결합 지점이 완전히 동일**하다(닉네임 앞 글리프 ↔ 닉네임 색)
--     → 유통 경로가 이미 검증돼 있다. 마크는 이모지라 기기마다 다른 그림이 뜨지만
--     **색은 앱이 100% 통제**한다. 그래서 마크(800)보다 싸지만 도달률은 더 높다.
--     ⚠ 새 팔레트를 만들지 않는다. 라이트/다크 양쪽 대비 실측을 통과한 --tier-* 6종을 재사용한다
--       (e2e/design-tokens.spec.ts 의 '불투명 등급 텍스트' 계약이 이 6색을 이미 잠그고 있고,
--        이번 커밋에서 '닉네임 색' 지점을 그 계약에 명시적으로 추가했다).
--  ⑤ 단골 시즌 뱃지 300점/시즌 — venue_follows·venue_seasons 가 이미 있다. 6일치.
--     시즌 단위라 만료가 '잃는 일'이 아니라 **'이번 시즌 것'**으로 읽혀, 기간권(1일/7일/30일)이
--     밟은 지뢰를 피한다. 지난 시즌 뱃지도 원장에 남아 '내가 그 시즌 단골이었다'는 기록이 된다.
--  ⑥ 닉네임 즉시 변경권 250점 — 변경은 이미 **무료**이고 30일 쿨다운만 있다.
--     파는 것은 기능이 아니라 **기다림 면제**라, 있던 기능을 뺏지 않는다(§규약: 기능 삭제 금지).
--     그래서 쿨다운이 실제로 걸려 있을 때만 팔린다 — 안 걸렸으면 살 것이 없다고 거절한다.
--
-- ── 절대 팔지 않는 것 (여기 남기는 이유: 다음 사람이 '왜 없지?'로 되살릴 수 있다) ─────
--   ✗ 뽑기·랜덤박스·확률형 마크   ✗ 포인트 베팅   ✗ 유저 간 포인트 선물
--   ✗ 포인트 ↔ 이용권 교환        ✗ 참가비 대납
--   전부 **점수가 값을 갖는 순간 게임산업법 §32①7(환전 알선) 위험**이고, 이 서비스의
--   '환금성 없음' 방어선(약관 제10조)을 무너뜨린다. 특히 확률형은 그 위에 사행성 조장까지 얹는다.
--   여기 있는 6종은 전부 **표현·소유·편의**뿐이고, 참가·상금·순위에 이점을 주지 않는다(§28).
--   앞 단계가 응원에 '받는 사람에게 점수를 주지 않는다'를 못 박은 것과 같은 선이다.
--
-- ── 비파괴 원칙 ────────────────────────────────────────────────────────────
--   추가만 한다. 기존 상품·행·정책·함수 시그니처는 하나도 지우지 않는다.
--   buy_shout(text,text,text) 3인자는 **그대로 살려** 4인자 본체에 위임시킨다
--   (기존 호출부·과거 클라이언트 번들이 그 시그니처로 붙어 있다).
--
-- ── 겸사: 라이브에서 발견한 결제 우회 1건을 같은 커밋에서 닫는다 ─────────────
--   guard_profile_privileged_cols 는 equipped_mark 직접 UPDATE 를 막는데
--   **name_changed_at 은 안 막는다.** 즉 누구나 PostgREST 로
--   `update profiles set name_changed_at = null` 을 해서 30일 쿨다운을 무료로 지울 수 있었다.
--   ⑥이 파는 것이 정확히 그 면제라, 닫지 않으면 처음부터 팔리지 않는 상품이 된다.
--   (닉네임을 실제로 바꿀 때 트리거가 찍는 값은 예외로 통과시킨다 — 아래 §3 참조.)
--
-- ── 라이브 적용 메모(드리프트 오해 방지) ────────────────────────────────────
--   라이브에 같은 이름(20260830n_ownership_tier_goods)으로 적용했고, **문(statement)은 이 파일과
--   동일하다.** 다만 위 서두 주석 블록과 각 §의 긴 산문 주석은 적용본에서 한 줄 포인터로 줄였다
--   (20260830m 과 같은 방식). **함수 본문 주석은 그대로**라 pg_get_functiondef 비교로 검증할 수 있다.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- §1. 상품표 — kind 화이트리스트 확장(기존 값 보존) + 신규 SKU 6종
--   가격은 shop_skus 가 단일 출처다. 화면에 숫자를 박지 않는 규약을 계속 지킬 것 —
--   그래야 가격 재조정이 이 표의 UPDATE 한 줄로 끝난다(20260830m §1 이 그 증거다).
-- ────────────────────────────────────────────────────────────────────────────
alter table public.shop_skus drop constraint if exists shop_skus_kind_check;
alter table public.shop_skus add constraint shop_skus_kind_check
  check (kind = any (array['mark_rent'::text, 'shout'::text, 'mark'::text,
                           'cheer'::text, 'bump'::text,
                           'cosmetic'::text, 'season_badge'::text, 'service'::text]));

insert into public.shop_skus
  (key, kind, label, descr, price, duration_hours, duration_seconds, tier_rank, sort, active)
values
  -- 외치기 등급 2종 — shout_tier() 가 key 의 'shout_' 뒤를 tier 값으로 읽는다(= 'long' / 'reserve').
  ('shout_long',    'shout', '길게 외치기',
   '40초 연속 1회 방송 · 끊기지 않고 이어서', 120, 0, 40, 2, 12, true),
  ('shout_reserve', 'shout', '예약 외치기',
   '원하는 시각에 20초 1회 방송 · 그 자리를 미리 잡아 둡니다', 200, 0, 20, 3, 14, true),
  -- 소유물 3종
  ('card_frame',    'cosmetic', '프로필 카드 프레임',
   '공유 카드 테두리를 골라 영구 소장 · 언제든 바꿀 수 있어요', 400, 0, 0, 1, 40, true),
  ('nick_color',    'cosmetic', '닉네임 색',
   '내 닉네임 글자색을 영구 소장 · 라이트·다크 모두에서 또렷하게', 600, 0, 0, 1, 45, true),
  ('season_badge',  'season_badge', '단골 시즌 뱃지',
   '단골 매장의 이번 시즌 뱃지 · 시즌이 끝나도 기록으로 남아요', 300, 0, 0, 1, 50, true),
  -- 편의 1종
  ('nick_change',   'service', '닉네임 즉시 변경권',
   '남은 대기 시간 없이 지금 바로 닉네임을 바꿉니다 · 변경 자체는 원래 무료예요', 250, 0, 0, 1, 55, true)
on conflict (key) do update
  set kind = excluded.kind, label = excluded.label, descr = excluded.descr,
      price = excluded.price, duration_hours = excluded.duration_hours,
      duration_seconds = excluded.duration_seconds,
      tier_rank = excluded.tier_rank, sort = excluded.sort, active = true;

-- 구매 원장 kind 화이트리스트 — 기존 5종 보존 + 신규 3종
alter table public.point_purchases drop constraint if exists point_purchases_kind_check;
alter table public.point_purchases add constraint point_purchases_kind_check
  check (kind = any (array['shout'::text, 'mark_rent'::text, 'mark_own'::text,
                           'cheer'::text, 'bump'::text,
                           'cosmetic'::text, 'season_badge'::text, 'nick_change'::text]));

-- 코스메틱·뱃지의 대상 키(프레임 키 · 색 키 · 시즌 id). 원장에서 '무엇을 샀나'를 되짚기 위한 것.
alter table public.point_purchases
  add column if not exists item_key text;
comment on column public.point_purchases.item_key is
  '코스메틱(프레임·닉네임 색) 키 또는 시즌 뱃지의 season_id. 환불 시 회수 대상을 특정한다 — 이 값이 없으면 점수만 돌려주고 물건은 남는 발권이 된다(20260830m §3 과 같은 함정).';

-- ────────────────────────────────────────────────────────────────────────────
-- §2. 스키마(추가만)
-- ────────────────────────────────────────────────────────────────────────────

-- 2-1. 코스메틱 카탈로그 — 무엇을 살 수 있는가의 단일 출처.
--   shop_marks 와 같은 규약: 클라이언트에 폴백 사본이 있지만 **정의는 여기**다.
--   token 은 --tier-<token> 의 뒷부분이다. 새 팔레트를 만들지 않겠다는 약속이 컬럼으로 박혀 있다.
create table if not exists public.shop_cosmetics (
  key     text primary key,
  kind    text not null check (kind in ('card_frame', 'nick_color')),
  label   text not null,
  descr   text not null default '',
  token   text,
  sku_key text not null references public.shop_skus(key),
  sort    int  not null default 0,
  active  boolean not null default true,
  constraint shop_cosmetics_token_rule check (
    (kind = 'nick_color' and token in ('blue', 'green', 'purple', 'orange', 'rose', 'gold'))
    or (kind = 'card_frame' and token is null)
  )
);

comment on table public.shop_cosmetics is
  '코스메틱 카탈로그(프로필 카드 프레임 · 닉네임 색). 닉네임 색의 token 은 --tier-<token> 재사용이고 화이트리스트가 제약으로 박혀 있다 — 새 색을 넣으려면 index.css 토큰과 e2e/design-tokens.spec.ts 대비 계약을 먼저 통과시켜야 한다.';

alter table public.shop_cosmetics enable row level security;
drop policy if exists shop_cosmetics_read on public.shop_cosmetics;
create policy shop_cosmetics_read on public.shop_cosmetics
  for select to anon, authenticated using (active);
grant select on public.shop_cosmetics to anon, authenticated;

insert into public.shop_cosmetics (key, kind, label, descr, token, sku_key, sort) values
  -- 프레임 5종 — 실제 그림은 캔버스 코드(src/lib/profileCard.ts)가 그린다. 여기는 '무엇이 팔리나'만.
  ('frame_gold',  'card_frame', '골드 라인',   '기본 카드의 정통 골드 테두리를 두 겹으로',       null, 'card_frame', 10),
  ('frame_neon',  'card_frame', '네온',        '보라 네온 글로우 — 어두운 배경에서 가장 밝게',   null, 'card_frame', 20),
  ('frame_felt',  'card_frame', '그린 펠트',   '테이블 천의 초록 — 홀덤 그 자체',                null, 'card_frame', 30),
  ('frame_chip',  'card_frame', '칩 트랙',     '테두리를 따라 칩이 도는 트랙',                   null, 'card_frame', 40),
  ('frame_royal', 'card_frame', '로열',        '깊은 남색 바탕에 은빛 이중선',                   null, 'card_frame', 50),
  -- 닉네임 색 6종 — token 은 --tier-<token>. 라이트/다크 양쪽 4.5:1 을 이미 통과한 값들이다.
  ('nick_blue',   'nick_color', '블루',        '차분하게 눈에 띄는 파랑',       'blue',   'nick_color', 110),
  ('nick_green',  'nick_color', '그린',        '테이블 천의 초록',              'green',  'nick_color', 120),
  ('nick_purple', 'nick_color', '퍼플',        '앱의 강조색과 같은 결',         'purple', 'nick_color', 130),
  ('nick_orange', 'nick_color', '오렌지',      '따뜻하고 선명한 주황',          'orange', 'nick_color', 140),
  ('nick_rose',   'nick_color', '로즈',        '부드러운 붉은빛',               'rose',   'nick_color', 150),
  ('nick_gold',   'nick_color', '골드',        '최고 등급과 같은 금색',         'gold',   'nick_color', 160)
on conflict (key) do update
  set kind = excluded.kind, label = excluded.label, descr = excluded.descr,
      token = excluded.token, sku_key = excluded.sku_key, sort = excluded.sort, active = true;

-- 2-2. 소유 원장 — 코스메틱·시즌 뱃지를 한 표로.
--   mark_unlocks 와 같은 규약: **쓰기 정책을 두지 않는다** → SECURITY DEFINER RPC 만이 통로다.
--   (마크가 유료가 된 순간 화면 판정만으로는 결제 우회가 됐던 사고가 shopMarks.ts 헤더에 남아 있다.)
create table if not exists public.cosmetic_unlocks (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('card_frame', 'nick_color', 'season_badge')),
  item_key    text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, kind, item_key)
);

comment on table public.cosmetic_unlocks is
  '코스메틱·시즌 뱃지 영구 소장 원장. kind=season_badge 의 item_key 는 venue_seasons.id 다(시즌이 끝나도 행은 남는다 — 만료가 아니라 "그 시즌의 것"이라는 기록이라서다).';

create index if not exists cosmetic_unlocks_kind_idx
  on public.cosmetic_unlocks (kind, item_key);

alter table public.cosmetic_unlocks enable row level security;
drop policy if exists cosmetic_unlocks_self on public.cosmetic_unlocks;
-- 남의 소장 목록까지 열 이유가 없다. 표시에 필요한 것(닉네임 색)은 아래 get_nick_colors() 가
-- **장착된 것만** 골라서 준다 — 목록 전체를 여는 것과 다르다.
create policy cosmetic_unlocks_self on public.cosmetic_unlocks
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.cosmetic_unlocks to authenticated;

-- 2-3. 장착 슬롯 — 프로필에 한 칸씩. equipped_mark 와 같은 자리·같은 규약.
alter table public.profiles
  add column if not exists equipped_card_frame text,
  add column if not exists equipped_nick_color text;

comment on column public.profiles.equipped_nick_color is
  '장착한 닉네임 색의 shop_cosmetics.key. 직접 UPDATE 는 guard_profile_privileged_cols 가 막는다 — set_equipped_cosmetic() RPC 만이 쓴다(equipped_mark 와 같은 규약).';

-- ────────────────────────────────────────────────────────────────────────────
-- §3. 결제 우회 차단 — 직접 UPDATE 로 살 수 있으면 그건 상품이 아니다
--
--   ⚠ name_changed_at 예외 규칙이 이 함수의 핵심이다.
--     트리거 순서는 이름순이라 trg_enforce_nickname_cooldown 이 **먼저** 돌고, 그 트리거가
--     닉네임을 실제로 바꿀 때 new.name_changed_at := now() 를 찍는다. 그 값을 무조건 막으면
--     닉네임 변경 자체가 통째로 막힌다(= 있던 기능이 사라진다).
--     그래서 '이름은 그대로인데 name_changed_at 만 달라진 경우'만 막는다.
--     이름을 같이 바꾸는 경우는 위 트리거가 어차피 now() 로 덮어써서 공격자가 심은 값이 버려진다.
--     ⇒ 두 경로가 모두 닫힌다.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.guard_profile_privileged_cols()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if current_user in ('authenticated','anon') then
    if new.activity_points is distinct from old.activity_points
       or new.spent_points is distinct from old.spent_points
    then
      raise exception '활동점수는 직접 변경할 수 없습니다 (운영자는 admin_grant_points 를 쓰세요)';
    end if;
    if new.equipped_mark is distinct from old.equipped_mark then
      raise exception '마크 장착은 set_equipped_mark 로만 할 수 있습니다';
    end if;
    -- 2026-08-30(20260830n): 코스메틱도 유료 소장물이다. 마크와 같은 자물쇠를 건다.
    if new.equipped_card_frame is distinct from old.equipped_card_frame
       or new.equipped_nick_color is distinct from old.equipped_nick_color then
      raise exception '코스메틱 장착은 set_equipped_cosmetic 으로만 할 수 있습니다';
    end if;
    -- 2026-08-30(20260830n): 30일 쿨다운 무료 해제 경로 차단.
    -- 닉네임을 실제로 바꿀 때 트리거가 찍는 값은 통과시킨다(위 헤더 참조).
    if new.name_changed_at is distinct from old.name_changed_at
       and new.name is not distinct from old.name then
      raise exception '닉네임 변경 시각은 직접 바꿀 수 없습니다 (즉시 변경은 상점의 즉시 변경권을 쓰세요)';
    end if;
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
end $function$;

-- ────────────────────────────────────────────────────────────────────────────
-- §4. 외치기 슬롯 배치 — 예약(고정 시각)과 대기열(순서대로)이 한 타임라인을 공유한다
--
--   예약이 들어오는 순간 대기열은 더 이상 '맨 뒤에 붙이기'로 끝나지 않는다.
--   예약된 창을 **건너뛰어야** 하고, 40초 슬롯이 섞이면 창 길이도 제각각이 된다.
--   그래서 '다음 빈 자리'를 한 함수로 뽑아 세 경로(기본·길게·예약)가 전부 이것만 본다.
--   ⚠ 이 함수 하나가 유일한 배치 규칙이다. 다른 곳에서 plays_at 을 계산하면 즉시 충돌한다.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.shout_next_free_slot(p_from timestamptz, p_len interval)
returns timestamptz
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cand timestamptz := greatest(coalesce(p_from, now()), now());
  v_end  timestamptz;
  v_i    int := 0;
begin
  loop
    -- v_cand 부터 p_len 동안의 창과 겹치는 방송들 중 **가장 늦게 끝나는 시각**으로 점프한다.
    -- 하나씩 밀면 겹침이 N겹일 때 N번 도는데, max 로 점프하면 겹침 덩어리를 한 번에 넘는다.
    select max(s.expires_at) into v_end
      from public.community_shouts s
     where s.hidden = false
       and s.plays_at  <  v_cand + p_len
       and s.expires_at >  v_cand;
    exit when v_end is null;
    v_cand := v_end;
    v_i := v_i + 1;
    -- 방어선. 하루 구매 상한 10회 × 현실 회원 수로는 도달할 수 없는 횟수지만,
    -- 데이터가 이상해도 요청이 영원히 매달리는 것보다는 '조금 뒤'로 잡히는 편이 낫다.
    exit when v_i > 500;
  end loop;
  return v_cand;
end $function$;

comment on function public.shout_next_free_slot(timestamptz, interval) is
  '예약·대기열이 공유하는 유일한 슬롯 배치 규칙. p_from 이후로 이미 잡힌 방송 창과 겹치지 않는 첫 시각을 준다. 다른 곳에서 plays_at 을 계산하면 예약과 충돌한다.';

-- 화면이 '지금 사면 언제 나가나'를 사기 전에 보여줄 수 있게 — 서버가 단일 출처.
-- (구 화면은 max(expires_at) 로 유추했는데, 예약이 생기면 그 값은 며칠 뒤가 될 수 있어
--  '내 차례 3일 뒤'라는 거짓말이 된다. 실제로는 그 앞의 빈 자리에 들어간다.)
create or replace function public.shout_queue_info(p_seconds int default 20)
returns table(next_free_at timestamptz, waiting integer)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select public.shout_next_free_slot(now(), (greatest(1, coalesce(p_seconds, 20)) || ' seconds')::interval),
         (select count(*)::int from public.community_shouts s
           where s.hidden = false and s.expires_at > now());
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- §5. 외치기 구매 — 4인자 본체(예약 시각 추가). 3인자는 아래에서 위임으로 보존한다.
--   안전장치 순서는 종전과 **한 줄도 다르지 않다**:
--     등급·색 검증 → 문구 검증 → 프로필 행 잠금 → 제재 → 쿨다운 → 하루 상한 → 잔액
--     → (대기열 직렬화) → 차감·게시·기록 한 트랜잭션.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.buy_shout(p_message text,
                                            p_tier text default 'basic',
                                            p_color text default null,
                                            p_plays_at timestamptz default null)
returns community_shouts
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  RESERVE_MIN_LEAD constant interval := interval '5 minutes';
  RESERVE_MAX_LEAD constant interval := interval '7 days';
  v_uid    uuid := (select auth.uid());
  v_r      record;
  v_t      record;
  v_sku    public.shop_skus;
  v_len    interval;
  v_msg    text;
  v_nick   text;
  v_status text;
  v_points int;
  v_spent  int;
  v_color  text;
  v_plays  timestamptz;
  v_free   timestamptz;
  v_row    public.community_shouts;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  -- 전광판(board)은 판매 중지라 목록에 없다. 새 등급 2종을 화이트리스트에 더한다.
  if p_tier not in ('basic', 'gold', 'long', 'reserve') then
    raise exception '판매 중인 외치기 등급이 아닙니다';
  end if;
  select * into v_r from public.shout_rules();
  select * into v_t from public.shout_tier(p_tier);
  if v_t.cost is null then raise exception '알 수 없는 외치기 등급입니다'; end if;

  select * into v_sku from public.shop_skus where key = 'shout_' || p_tier and active;
  if not found then raise exception '판매 중인 상품이 아닙니다'; end if;
  -- 슬롯 길이는 상품표가 출처다(기본·하이라이트·예약 20초 / 길게 40초).
  v_len := (greatest(1, coalesce(v_sku.duration_seconds, 20)) || ' seconds')::interval;

  -- 색은 '하이라이트'에서만. 예약·길게에 색을 실어 보내면 조용히 무시하지 않고 분명히 거절한다
  -- (조용한 무시는 '돈 냈는데 색이 안 나왔다'는 문의를 만든다 — 20260830f 와 같은 판단).
  v_color := nullif(btrim(coalesce(p_color, '')), '');
  if v_color is not null then
    if p_tier <> 'gold' then raise exception '색은 하이라이트에서만 고를 수 있어요'; end if;
    if v_color not in ('gold', 'blue', 'green', 'purple', 'rose') then
      raise exception '고를 수 없는 색이에요';
    end if;
  elsif p_tier = 'gold' then
    v_color := 'gold';   -- 하이라이트 기본색
  end if;

  -- 예약 시각은 예약 등급에서만. 반대로 예약인데 시각이 없으면 '언제'가 상품의 전부라 거절한다.
  if p_plays_at is not null and p_tier <> 'reserve' then
    raise exception '시각 지정은 예약 외치기에서만 할 수 있어요';
  end if;
  if p_tier = 'reserve' and p_plays_at is null then
    raise exception '방송할 시각을 골라 주세요';
  end if;

  v_msg := btrim(regexp_replace(coalesce(p_message, ''), '\s+', ' ', 'g'));
  if char_length(v_msg) < v_r.min_len then
    raise exception '외침은 %자 이상 써 주세요', v_r.min_len;
  end if;
  if char_length(v_msg) > v_r.max_len then
    raise exception '외침은 %자까지 쓸 수 있어요', v_r.max_len;
  end if;
  if public.shout_blocked(v_msg) then
    raise exception '게시할 수 없는 표현이나 링크가 들어 있어요';
  end if;

  select coalesce(p.nickname, p.name, '회원'), coalesce(p.status::text, 'active'),
         coalesce(p.activity_points, 0), coalesce(p.spent_points, 0)
    into v_nick, v_status, v_points, v_spent
  from public.profiles p where p.id = v_uid for update;
  if not found then raise exception '프로필을 찾을 수 없습니다'; end if;
  if v_status <> 'active' then raise exception '제재 중인 계정은 외치기를 쓸 수 없습니다'; end if;

  -- ⚠ 환불은 이 상한을 복원하지 않는다. 환불된 외침도 행이 남아 여기서 그대로 세어진다.
  if exists (
    select 1 from public.community_shouts s
     where s.user_id = v_uid
       and s.created_at > now() - (v_r.cooldown_minutes || ' minutes')::interval
  ) then
    raise exception '외치기는 %분에 한 번만 쓸 수 있어요', v_r.cooldown_minutes;
  end if;

  -- 오너 지시(2026-08-30): 1일 구매 한도 10회 — 상품 종류 무관 합산(응원 제외).
  if public.daily_purchase_count(v_uid) >= 10 then
    raise exception '하루 10번까지만 구매할 수 있어요';
  end if;

  if v_points - v_spent < v_t.cost then
    raise exception '활동점수가 부족해요 (필요 %점 · 사용 가능 %점)', v_t.cost, v_points - v_spent;
  end if;

  -- 대기열 직렬화. 두 사람이 같은 순간에 사면 둘 다 같은 빈 자리를 계산해 창이 겹친다
  -- (프로필 행 잠금은 '같은 사람'만 줄 세울 뿐 서로 다른 사람은 막지 못한다).
  -- 트랜잭션 잠금이라 커밋·롤백 시 자동 해제된다.
  perform pg_advisory_xact_lock(hashtext('nuri:shout_queue'));

  if p_tier = 'reserve' then
    -- 분 단위로 맞춘다. 초 단위 예약은 유저가 고를 수도, 확인할 수도 없는 정밀도다.
    v_plays := date_trunc('minute', p_plays_at);
    if v_plays < now() + RESERVE_MIN_LEAD then
      raise exception '예약은 지금부터 5분 뒤 이후로 골라 주세요';
    end if;
    if v_plays > now() + RESERVE_MAX_LEAD then
      raise exception '예약은 7일 이내로 골라 주세요';
    end if;
    -- 충돌 처리: 막기만 하면 유저는 시각을 하나씩 바꿔가며 다시 누른다.
    -- 그래서 **가장 가까운 빈 시각을 같이 알려 준다**(끌올 자리 상한과 같은 규약).
    v_free := public.shout_next_free_slot(v_plays, v_len);
    if v_free <> v_plays then
      raise exception '그 시각에는 이미 잡힌 방송이 있어요 — 가장 빠른 빈 시각은 % 입니다',
        to_char(v_free at time zone 'Asia/Seoul', 'MM/DD HH24:MI');
    end if;
  else
    -- 대기열 — '앞사람 방송 끝'이 내 시작이고, 예약된 창은 건너뛴다.
    v_plays := public.shout_next_free_slot(now(), v_len);
  end if;

  update public.profiles
     set spent_points = coalesce(spent_points, 0) + v_t.cost
   where id = v_uid;

  insert into public.community_shouts(user_id, nickname, message, cost, tier, tier_rank, color, plays_at, expires_at)
  values (v_uid, v_nick, v_msg, v_t.cost, v_t.tier, v_t.tier_rank, v_color, v_plays, v_plays + v_len)
  returning * into v_row;

  insert into public.point_purchases
    (user_id, kind, sku_key, shout_id, cost, duration_hours, period_from, period_to)
  values (v_uid, 'shout', 'shout_' || v_t.tier, v_row.id, v_t.cost, 0, v_row.plays_at, v_row.expires_at);

  return v_row;
end $function$;

comment on function public.buy_shout(text, text, text, timestamptz) is
  '외치기 구매 본체. 등급 4종(기본 20초 / 하이라이트 20초+색 / 길게 40초 / 예약 20초+시각지정). 슬롯 배치는 shout_next_free_slot() 하나가 결정하고, 대기열은 예약된 창을 건너뛴다. 동시 구매는 pg_advisory_xact_lock 으로 직렬화한다.';

-- ⚠ 3인자 시그니처는 **오버로드로 남기면 안 된다.**
--   PostgREST 는 이름 있는 인자(p_message/p_tier/p_color)로 부르는데, 같은 타입의 3인자 함수와
--   '4번째가 기본값'인 함수가 동시에 있으면 후보가 둘이라 `function is not unique` 로 터진다.
--   즉 오버로드를 남기는 쪽이 오히려 기존 호출부를 **전부 죽인다.**
--   위 4인자 함수의 p_plays_at 이 default null 이라, 3인자 호출 모양은 그대로 통한다
--   (이미 배포된 클라이언트 번들도 인자를 3개만 실어 보내므로 동작이 바뀌지 않는다).
drop function if exists public.buy_shout(text, text, text);

-- ────────────────────────────────────────────────────────────────────────────
-- §6. 코스메틱 — 구매(영구 소장) · 장착 · 조회
--   buy_mark 과 같은 규약: 사면 **바로 장착**한다(사고 나서 또 눌러야 하는 단계를 만들지 않는다).
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.buy_cosmetic(p_kind text, p_key text)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_c      public.shop_cosmetics;
  v_price  int;
  v_status text;
  v_points int;
  v_spent  int;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  if p_kind not in ('card_frame', 'nick_color') then raise exception '살 수 없는 상품이에요'; end if;

  select * into v_c from public.shop_cosmetics where key = p_key and kind = p_kind and active;
  if not found then raise exception '살 수 없는 상품이에요'; end if;

  select price into v_price from public.shop_skus where key = v_c.sku_key and active;
  if v_price is null then raise exception '판매 중인 상품이 아닙니다'; end if;

  if exists (select 1 from public.cosmetic_unlocks
              where user_id = v_uid and kind = p_kind and item_key = p_key) then
    raise exception '이미 소장한 상품이에요';
  end if;

  select coalesce(p.status::text, 'active'), coalesce(p.activity_points, 0), coalesce(p.spent_points, 0)
    into v_status, v_points, v_spent
  from public.profiles p where p.id = v_uid for update;
  if not found then raise exception '프로필을 찾을 수 없습니다'; end if;
  if v_status <> 'active' then raise exception '제재 중인 계정은 구매할 수 없습니다'; end if;

  if public.daily_purchase_count(v_uid) >= 10 then
    raise exception '하루 10번까지만 구매할 수 있어요';
  end if;
  if v_points - v_spent < v_price then
    raise exception '활동점수가 부족해요 (필요 %점 · 사용 가능 %점)', v_price, v_points - v_spent;
  end if;

  update public.profiles set spent_points = coalesce(spent_points, 0) + v_price where id = v_uid;
  insert into public.cosmetic_unlocks (user_id, kind, item_key) values (v_uid, p_kind, p_key);
  insert into public.point_purchases (user_id, kind, sku_key, item_key, cost, duration_hours)
  values (v_uid, 'cosmetic', v_c.sku_key, p_key, v_price, 0);

  -- 산 즉시 장착.
  if p_kind = 'card_frame' then
    update public.profiles set equipped_card_frame = p_key where id = v_uid;
  else
    update public.profiles set equipped_nick_color = p_key where id = v_uid;
  end if;

  return p_key;
end $function$;

comment on function public.buy_cosmetic(text, text) is
  '프로필 카드 프레임(400점) · 닉네임 색(600점) 영구 소장 구매. 가격은 shop_skus 가 단일 출처이고 사면 즉시 장착된다(buy_mark 과 같은 규약).';

create or replace function public.set_equipped_cosmetic(p_kind text, p_key text)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_key text := nullif(btrim(coalesce(p_key, '')), '');
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  if p_kind not in ('card_frame', 'nick_color') then raise exception '없는 항목입니다'; end if;

  if v_key is null then
    -- 해제 — 소장은 그대로 남는다(뺏는 것이 아니라 내려놓는 것이다).
    if p_kind = 'card_frame' then
      update public.profiles set equipped_card_frame = null where id = v_uid;
    else
      update public.profiles set equipped_nick_color = null where id = v_uid;
    end if;
    return null;
  end if;

  if not exists (select 1 from public.shop_cosmetics where key = v_key and kind = p_kind and active) then
    raise exception '없는 항목입니다';
  end if;
  -- 최종 판정은 서버가 한다. 화면 판정만 믿으면 API 직접 호출로 공짜 장착이 된다
  -- (마크에서 이미 겪은 사고 — src/lib/shopMarks.ts 헤더 참조).
  if not exists (select 1 from public.cosmetic_unlocks
                  where user_id = v_uid and kind = p_kind and item_key = v_key) then
    raise exception '아직 소장하지 않은 항목이에요';
  end if;

  if p_kind = 'card_frame' then
    update public.profiles set equipped_card_frame = v_key where id = v_uid;
  else
    update public.profiles set equipped_nick_color = v_key where id = v_uid;
  end if;
  return v_key;
end $function$;

-- 내 소장 목록 + 지금 장착 중인지. 화면이 소유 판정을 다시 하지 않게 서버가 한 번에 준다.
create or replace function public.my_cosmetics()
returns table(kind text, item_key text, equipped boolean, unlocked_at timestamptz)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  -- coalesce 필수: 장착 칸이 null 이면 `null = 'x'` 가 null 이라 equipped 가 NULL 로 나가고,
  -- 화면에서 '장착 중도 아니고 아닌 것도 아닌' 3상태가 된다.
  select u.kind, u.item_key,
         coalesce((u.kind = 'card_frame' and p.equipped_card_frame  = u.item_key)
               or (u.kind = 'nick_color' and p.equipped_nick_color = u.item_key), false),
         u.unlocked_at
    from public.cosmetic_unlocks u
    join public.profiles p on p.id = u.user_id
   where u.user_id = (select auth.uid())
     -- 시즌 뱃지는 장착 대상이 아니다 → my_season_badges() 가 담당한다.
     -- (실측에서 여기 섞여 나왔다: equipped=false 가 '장착 안 함'이 아니라 **의미 없는 값**이라,
     --  다음 소비자가 진짜 상태로 읽으면 '해제된 뱃지'라는 없는 상태를 화면에 만든다.)
     and u.kind in ('card_frame', 'nick_color')
   order by u.kind, u.unlocked_at;
$function$;

-- 남의 닉네임 색 — get_equipped_marks 와 **같은 결합 지점**이다(닉네임 앞 글리프 ↔ 닉네임 글자색).
-- 소장하지 않았거나 판매 중지된 색은 여기서 걸러 나간다 → 화면은 받은 것만 칠하면 된다.
create or replace function public.get_nick_colors(p_ids uuid[])
returns table(id uuid, token text)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select p.id, c.token
    from public.profiles p
    join public.shop_cosmetics c
      on c.key = p.equipped_nick_color and c.kind = 'nick_color' and c.active
   where p.id = any(p_ids)
     and exists (select 1 from public.cosmetic_unlocks u
                  where u.user_id = p.id and u.kind = 'nick_color'
                    and u.item_key = p.equipped_nick_color);
$function$;

comment on function public.get_nick_colors(uuid[]) is
  '표시용 닉네임 색(--tier-<token>). 소장·판매 상태를 서버가 최종 판정해 걸러 준다 — get_equipped_marks 와 같은 규약.';

-- ────────────────────────────────────────────────────────────────────────────
-- §7. 단골 시즌 뱃지 — '단골'과 '이번 시즌'이 둘 다 참일 때만 팔린다
--   단골(venue_follows)이 아니면 살 수 없게 한 이유: 뱃지가 '내가 이 매장 사람'이라는 표시라
--   아무 매장이나 살 수 있으면 의미가 증발한다. 팔로우는 무료라 문턱이 아니라 정의다.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.buy_season_badge(p_venue_id uuid)
returns table(season_id uuid, season_name text, venue_name text, available integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_price  int;
  v_status text;
  v_points int;
  v_spent  int;
  v_sid    uuid;
  v_sname  text;
  v_vname  text;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;

  select price into v_price from public.shop_skus where key = 'season_badge' and active;
  if v_price is null then raise exception '판매 중인 상품이 아닙니다'; end if;

  if not exists (select 1 from public.venue_follows
                  where user_id = v_uid and venue_id = p_venue_id) then
    raise exception '단골(팔로우)한 매장의 뱃지만 살 수 있어요';
  end if;

  -- 진행 중인 시즌 하나. 기간이 겹쳐 여러 개면 먼저 끝나는 것을 '이번 시즌'으로 본다.
  select s.id, s.name, v.name into v_sid, v_sname, v_vname
    from public.venue_seasons s
    join public.venues v on v.id = s.venue_id
   where s.venue_id = p_venue_id and s.status = 'active'
     and current_date between s.starts_on and s.ends_on
   order by s.ends_on
   limit 1;
  if v_sid is null then raise exception '이 매장은 지금 진행 중인 시즌이 없어요'; end if;

  if exists (select 1 from public.cosmetic_unlocks
              where user_id = v_uid and kind = 'season_badge' and item_key = v_sid::text) then
    raise exception '이번 시즌 뱃지는 이미 갖고 있어요';
  end if;

  select coalesce(p.status::text, 'active'), coalesce(p.activity_points, 0), coalesce(p.spent_points, 0)
    into v_status, v_points, v_spent
  from public.profiles p where p.id = v_uid for update;
  if not found then raise exception '프로필을 찾을 수 없습니다'; end if;
  if v_status <> 'active' then raise exception '제재 중인 계정은 구매할 수 없습니다'; end if;

  if public.daily_purchase_count(v_uid) >= 10 then
    raise exception '하루 10번까지만 구매할 수 있어요';
  end if;
  if v_points - v_spent < v_price then
    raise exception '활동점수가 부족해요 (필요 %점 · 사용 가능 %점)', v_price, v_points - v_spent;
  end if;

  update public.profiles set spent_points = coalesce(spent_points, 0) + v_price where id = v_uid;
  insert into public.cosmetic_unlocks (user_id, kind, item_key)
  values (v_uid, 'season_badge', v_sid::text);
  insert into public.point_purchases (user_id, kind, sku_key, item_key, cost, duration_hours)
  values (v_uid, 'season_badge', 'season_badge', v_sid::text, v_price, 0);

  return query select v_sid, v_sname, v_vname, greatest(0, v_points - v_spent - v_price);
end $function$;

comment on function public.buy_season_badge(uuid) is
  '단골 시즌 뱃지(300점/시즌). 팔로우한 매장의 진행 중 시즌에만. 시즌이 끝나도 소장 행은 남는다 — 만료가 아니라 "그 시즌의 것"이라는 기록이라서다(기간권이 밟은 지뢰를 피하는 지점).';

-- 내 시즌 뱃지 — 이름을 붙여서. 시즌이 끝난 것도 함께 준다(지난 시즌 기록이 곧 단골의 증거다).
create or replace function public.my_season_badges()
returns table(season_id uuid, season_name text, venue_id uuid, venue_name text,
              ends_on date, ongoing boolean)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  -- ⚠ 조인을 `s.id = u.item_key::uuid` 로 쓰면 안 된다. 플래너가 kind 필터보다 캐스트를 먼저
  --   평가할 수 있어, 같은 표에 있는 프레임·색 키('frame_gold' 등)를 uuid 로 캐스트하다 터진다.
  --   방향을 뒤집어 s.id 를 text 로 만들면 캐스트가 항상 안전하다.
  select s.id, s.name, s.venue_id, v.name, s.ends_on,
         (s.status = 'active' and current_date between s.starts_on and s.ends_on)
    from public.cosmetic_unlocks u
    join public.venue_seasons s on s.id::text = u.item_key
    join public.venues v on v.id = s.venue_id
   where u.user_id = (select auth.uid()) and u.kind = 'season_badge'
   order by s.ends_on desc;
$function$;

-- 살 수 있는 시즌 목록 — 내가 팔로우했고, 진행 중이고, 아직 안 산 것.
-- '살 수 있는 게 뭔지'를 화면이 유추하지 않게 서버가 골라 준다.
create or replace function public.my_buyable_season_badges()
returns table(venue_id uuid, venue_name text, season_id uuid, season_name text, ends_on date)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select v.id, v.name, s.id, s.name, s.ends_on
    from public.venue_follows f
    join public.venues v on v.id = f.venue_id
    join public.venue_seasons s on s.venue_id = f.venue_id and s.status = 'active'
   where f.user_id = (select auth.uid())
     and current_date between s.starts_on and s.ends_on
     and not exists (select 1 from public.cosmetic_unlocks u
                      where u.user_id = f.user_id and u.kind = 'season_badge'
                        and u.item_key = s.id::text)
   order by s.ends_on;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- §8. 닉네임 즉시 변경권 — 파는 것은 기능이 아니라 '기다림 면제'다
--   변경 자체는 계속 무료다. 쿨다운이 걸려 있지 않으면 **팔 것이 없다고 거절한다** —
--   아무것도 주지 않으면서 점수만 받는 순간 그건 상품이 아니라 사고다.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.buy_nickname_reset()
returns table(available integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_price  int;
  v_status text;
  v_role   text;
  v_points int;
  v_spent  int;
  v_last   timestamptz;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;

  select price into v_price from public.shop_skus where key = 'nick_change' and active;
  if v_price is null then raise exception '판매 중인 상품이 아닙니다'; end if;

  select coalesce(p.status::text, 'active'), coalesce(p.role::text, 'user'),
         coalesce(p.activity_points, 0), coalesce(p.spent_points, 0), p.name_changed_at
    into v_status, v_role, v_points, v_spent, v_last
  from public.profiles p where p.id = v_uid for update;
  if not found then raise exception '프로필을 찾을 수 없습니다'; end if;
  if v_status <> 'active' then raise exception '제재 중인 계정은 구매할 수 없습니다'; end if;

  -- 쿨다운 판정은 enforce_nickname_cooldown 트리거와 **같은 식**이어야 한다.
  -- 갈리면 '샀는데 여전히 못 바꾸는' 또는 '안 사도 되는데 팔리는' 둘 중 하나가 된다.
  if v_role = 'admin' or v_last is null or now() - v_last >= interval '30 days' then
    raise exception '지금 바로 닉네임을 바꿀 수 있어요 — 이 권한은 필요하지 않습니다';
  end if;

  if public.daily_purchase_count(v_uid) >= 10 then
    raise exception '하루 10번까지만 구매할 수 있어요';
  end if;
  if v_points - v_spent < v_price then
    raise exception '활동점수가 부족해요 (필요 %점 · 사용 가능 %점)', v_price, v_points - v_spent;
  end if;

  update public.profiles
     set spent_points = coalesce(spent_points, 0) + v_price,
         name_changed_at = null            -- = 대기 시간 면제(트리거가 보는 유일한 값)
   where id = v_uid;

  insert into public.point_purchases (user_id, kind, sku_key, cost, duration_hours)
  values (v_uid, 'nick_change', 'nick_change', v_price, 0);

  return query select greatest(0, v_points - v_spent - v_price);
end $function$;

comment on function public.buy_nickname_reset() is
  '닉네임 즉시 변경권(250점) — 30일 쿨다운 면제. 변경 기능 자체는 계속 무료다. 쿨다운이 안 걸려 있으면 살 것이 없다고 거절한다.';

-- ────────────────────────────────────────────────────────────────────────────
-- §9. 환불 — 새 kind 3종을 **명시적으로** 다룬다
--   기존 else 경로(기간권 회수)로 흘려보내면 사유가 '다른 기간 마크로 교체되어…'라는 거짓말이 되고,
--   더 나쁘게는 점수만 돌려주고 물건은 남는 발권이 된다(20260830m §3 이 그 사고였다).
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
  -- 닉네임 즉시 변경권 — 산 순간 대기 시간이 사라진다(=상품을 이미 받았다).
  -- 이미 닉네임을 바꿨는지 여부와 무관하다: 되돌리려면 쿨다운을 '다시 걸어야' 하는데
  -- 그 시작 시각을 만들어 낼 근거가 없다(원래 시각은 지워졌다).
  if v_pp.kind = 'nick_change' then
    return query select 0, '즉시 변경권은 구매 즉시 대기 시간이 사라져 환불할 수 없습니다 — 보상은 활동점수 지급을 쓰세요'::text; return;
  end if;

  -- 코스메틱(프레임·닉네임 색) — 영구 소장이라 일할이 없다. 마크와 같은 판정이다.
  if v_pp.kind = 'cosmetic' then
    if v_pp.item_key is null then
      return query select 0, '환불에 필요한 상품 정보가 없습니다'::text; return;
    end if;
    if exists (select 1 from public.profiles
                where id = v_pp.user_id
                  and (equipped_card_frame = v_pp.item_key or equipped_nick_color = v_pp.item_key)) then
      return query select 0, '장착 중인 항목은 환불할 수 없습니다 — 먼저 해제해 주세요'::text; return;
    end if;
    if not exists (select 1 from public.cosmetic_unlocks
                    where user_id = v_pp.user_id and item_key = v_pp.item_key
                      and kind in ('card_frame', 'nick_color')) then
      return query select 0, '이미 회수된 항목입니다'::text; return;
    end if;
    return query select v_pp.cost, null::text; return;
  end if;

  -- 시즌 뱃지 — 소장을 회수하면 그대로 되돌아간다(장착 개념이 없다).
  if v_pp.kind = 'season_badge' then
    if v_pp.item_key is null then
      return query select 0, '환불에 필요한 시즌 정보가 없습니다'::text; return;
    end if;
    if not exists (select 1 from public.cosmetic_unlocks
                    where user_id = v_pp.user_id and kind = 'season_badge'
                      and item_key = v_pp.item_key) then
      return query select 0, '이미 회수된 뱃지입니다'::text; return;
    end if;
    return query select v_pp.cost, null::text; return;
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
    -- (예약분은 방송이 아직 멀었을 수 있어 여기서 전액 환불로 살아난다 — 의도한 동작이다.)
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

  -- 판정은 refund_quote 가 단일 출처다(응원·끌올·즉시변경권의 차단도 여기서 걸린다).
  select q.points, q.block into v_refund, v_block from public.refund_quote(p_purchase_id) q;
  if v_block is not null then raise exception '%', v_block; end if;

  if v_pp.kind = 'shout' then
    -- expires_at 은 건드리지 않는다 — 진열 쿼리와 RLS 가 hidden 을 보므로 이것만으로 사라지고,
    -- 원래 노출 기간이 기록으로 남는다. 예약분을 내리면 그 창은 다시 빈 자리가 된다
    -- (shout_next_free_slot 이 hidden = false 만 보기 때문 — 자동으로 맞아떨어진다).
    update public.community_shouts
       set hidden = true, hidden_by = v_admin, hidden_at = now()
     where id = v_pp.shout_id and hidden = false;

  elsif v_pp.kind = 'mark_own' then
    -- 산 것을 되돌린다 = 소장을 회수한다. 이걸 빼면 점수만 돌려주고 마크는 남아 발권이 된다.
    delete from public.mark_unlocks
     where user_id = v_user and mark_key = v_pp.mark_key;
    update public.profiles set equipped_mark = null
     where id = v_user and equipped_mark = v_pp.mark_key;

  elsif v_pp.kind = 'cosmetic' then
    -- 같은 규약. 회수하지 않으면 프레임·색을 공짜로 갖는다.
    delete from public.cosmetic_unlocks
     where user_id = v_user and kind in ('card_frame', 'nick_color') and item_key = v_pp.item_key;
    -- 경합(견적 직후 장착)까지 감안해 한 번 더 내린다.
    update public.profiles
       set equipped_card_frame = case when equipped_card_frame = v_pp.item_key then null else equipped_card_frame end,
           equipped_nick_color = case when equipped_nick_color = v_pp.item_key then null else equipped_nick_color end
     where id = v_user;

  elsif v_pp.kind = 'season_badge' then
    delete from public.cosmetic_unlocks
     where user_id = v_user and kind = 'season_badge' and item_key = v_pp.item_key;

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
-- §10. ACL — CREATE OR REPLACE 는 ACL 을 초기화한다. 재정의·신규 함수를 전부 다시 명시한다.
--   ⚠ `revoke from anon` 만으로는 무효다(PUBLIC 기본 GRANT). 반드시 FROM PUBLIC.
-- ────────────────────────────────────────────────────────────────────────────
revoke all on function public.shout_next_free_slot(timestamptz, interval) from public, anon;
grant execute on function public.shout_next_free_slot(timestamptz, interval) to authenticated, service_role;

-- 대기열 안내는 비로그인에게도 보인다(구매 문턱을 낮추는 정보이고 개인정보가 없다).
revoke all on function public.shout_queue_info(int) from public;
grant execute on function public.shout_queue_info(int) to anon, authenticated, service_role;

revoke all on function public.buy_shout(text, text, text) from public, anon;
grant execute on function public.buy_shout(text, text, text) to authenticated, service_role;
revoke all on function public.buy_shout(text, text, text, timestamptz) from public, anon;
grant execute on function public.buy_shout(text, text, text, timestamptz) to authenticated, service_role;

revoke all on function public.buy_cosmetic(text, text) from public, anon;
grant execute on function public.buy_cosmetic(text, text) to authenticated, service_role;
revoke all on function public.set_equipped_cosmetic(text, text) from public, anon;
grant execute on function public.set_equipped_cosmetic(text, text) to authenticated, service_role;
revoke all on function public.my_cosmetics() from public, anon;
grant execute on function public.my_cosmetics() to authenticated, service_role;
revoke all on function public.get_nick_colors(uuid[]) from public, anon;
grant execute on function public.get_nick_colors(uuid[]) to authenticated, service_role;

revoke all on function public.buy_season_badge(uuid) from public, anon;
grant execute on function public.buy_season_badge(uuid) to authenticated, service_role;
revoke all on function public.my_season_badges() from public, anon;
grant execute on function public.my_season_badges() to authenticated, service_role;
revoke all on function public.my_buyable_season_badges() from public, anon;
grant execute on function public.my_buyable_season_badges() to authenticated, service_role;

revoke all on function public.buy_nickname_reset() from public, anon;
grant execute on function public.buy_nickname_reset() to authenticated, service_role;

revoke all on function public.refund_quote(bigint) from public, anon;
grant execute on function public.refund_quote(bigint) to authenticated, service_role;
revoke all on function public.admin_refund_purchase(bigint, text) from public, anon;
grant execute on function public.admin_refund_purchase(bigint, text) to authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- §11. 운영자 구매 목록 — item_key 노출 + fail-open 가드 폐쇄
--   ① 코스메틱·시즌 뱃지는 mark_key/shout_id 어디에도 안 걸린다. item_key 가 없으면 운영자 화면이
--      '프로필 카드 프레임'까지만 알고 **어느 프레임인지 모른다**(환불 판단을 눈으로 못 한다).
--   ② `my_role() <> 'admin'` 은 프로필 행이 없을 때 NULL 이 되어 가드를 통째로 건너뛴다
--      (20260828d · 20260830m 과 같은 함정). `is distinct from` 으로 닫는다.
--   RETURNS TABLE 에 컬럼을 더하려면 CREATE OR REPLACE 로는 안 되므로 drop 후 재생성한다.
--   기존 클라이언트는 늘어난 컬럼을 무시할 뿐이라 호환이 깨지지 않는다.
-- ────────────────────────────────────────────────────────────────────────────
drop function if exists public.admin_list_purchases(uuid, integer);

create or replace function public.admin_list_purchases(p_user uuid, p_limit integer default 30)
returns table(id bigint, kind text, sku_key text, label text, mark_key text, item_key text,
              shout_id uuid, cost integer, created_at timestamptz, refunded_at timestamptz,
              refund_points integer, refund_reason text, refundable boolean,
              refund_estimate integer, refund_block text)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if (select auth.uid()) is null then raise exception '로그인이 필요합니다'; end if;
  -- ⚠ `<> 'admin'` 금지: 프로필 행이 없으면 NULL <> 'admin' = NULL 이라 가드를 건너뛴다.
  if public.my_role() is distinct from 'admin' then raise exception '권한이 없습니다'; end if;

  return query
    select pp.id, pp.kind, pp.sku_key, coalesce(sk.label, pp.sku_key), pp.mark_key, pp.item_key,
           pp.shout_id, pp.cost, pp.created_at, pp.refunded_at, pp.refund_points, pp.refund_reason,
           (q.block is null), coalesce(q.points, 0), q.block
    from public.point_purchases pp
    left join public.shop_skus sk on sk.key = pp.sku_key
    cross join lateral public.refund_quote(pp.id) q
    where pp.user_id = p_user
    order by pp.created_at desc
    limit greatest(1, least(coalesce(p_limit, 30), 100));
end $function$;

revoke all on function public.admin_list_purchases(uuid, integer) from public, anon;
grant execute on function public.admin_list_purchases(uuid, integer) to authenticated, service_role;
