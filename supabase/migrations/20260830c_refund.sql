-- ============================================================================
-- 20260830c — 활동포인트 상품 환불 경로 (RPC + 원장)
--
-- ── 0. 왜 '환불 RPC 하나'로 끝나지 않는가 ───────────────────────────────────
--   환불 경로가 없는 게 아니라 **환불의 전제인 구매 원장이 없었다.**
--     · mark_rentals 는 (user_id, mark_key, expires_at, updated_at) 4컬럼뿐 —
--       "어떤 SKU 를 언제 몇 점에 샀는지"가 어디에도 없다. 금액·기간을 역산할 근거가 0이다.
--     · community_shouts.cost 는 기록은 있으나 **소유자가 PostgREST 로 직접 UPDATE 할 수 있었다**
--       (shouts_hide 정책이 컬럼 제한 없이 UPDATE 를 열어 둠 + authenticated 에 UPDATE 권한 +
--        가드 트리거 0건). 위조된 cost 를 환불하면 그게 곧 발권이다.
--   ⇒ 정책을 먼저 죄고(§1), 원장을 넣고(§2), 그 위에 환불을 얹는다(§4).
--
--   적용 시점 실측: mark_rentals 0행 · community_shouts 0행 · sum(spent_points)=0 · profiles 7행.
--   **백필이 필요 없는 유일한 시점이다.** 실유저가 사기 시작한 뒤에는 SKU·지불액·구매시각을
--   복원할 방법이 DB 에 없다 — 그 사이 구매는 영원히 환불 불가가 된다.
--
-- ── 1. 환불은 spent_points 를 낮춘다. activity_points 는 절대 올리지 않는다 ──
--   activity_points 는 등급·활동순위·도달마크 해금의 기준이다. 환불로 올리면
--     · crown(14,000) 같은 마크가 **환불 때문에 해금**되고 리더보드 순위가 흔들린다
--     · trg_notify_level_up(AFTER UPDATE OF activity_points)이 허위 '레벨 업!' 알림을 쏜다
--   spent_points -= x 는 구매 직전 상태로의 정확한 원복이다(available = ap − sp 복원).
--   이중 방어로 profiles.spent_points >= 0 체크 제약도 함께 넣는다(§2).
--
-- ── 2. 환불이 복원하지 않는 것 ──────────────────────────────────────────────
--   **쿨다운(10분)과 하루 3회 상한은 복원하지 않는다.** 상한은 지불의 대가가 아니라
--   도배 방지 장치다. 복원하면 "사고 → 환불받고 → 다시 사기"로 상한이 무력화된다.
--   외침 행을 지우지 않고 hidden 으로만 내리므로 상한 계산(created_at 기준 count)은
--   자동으로 그대로 유지된다 — 이 성질을 깨는 변경(행 DELETE 등)을 넣지 말 것.
--
-- ── 3. 악용 차단 ────────────────────────────────────────────────────────────
--   셀프 환불 없음(admin 전용) · 구매 후 24시간 창 · 사유 4자 이상 필수 ·
--   원장 1행당 1회 · 최근 30일 환불 3건 이상이면 거절 · 제재 상태는 검사하지 않는다
--   (회수는 제재 계정에도 되어야 한다).
--   렌탈 부분 환불 공식에서 least(잔여시간, 이번 구매분 duration_hours) 가 핵심이다 —
--   빠뜨리면 기간이 이어 붙은 이전 구매분까지 환불되어 실질 발권이 된다.
--   외침은 부분 환불하지 않는다(이미 나간 노출은 회수 불가 — 부분 환급이 곧 '노출을 싸게 사는 법').
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- §1. 선결 — community_shouts 소유자 UPDATE 폐쇄
--   기존 shouts_hide 는 소유자에게 **전 컬럼** UPDATE 를 열어 뒀다. 환불 회수가 hidden 한
--   컬럼에 의존하는데 유저가 hidden=false 로 되돌릴 수 있으면 점수와 노출을 동시에 갖는다.
--   환불과 무관하게도 결함이다(cost·expires_at·tier_rank 위조 → 200점짜리를 전광판 자리로).
--   본인 내리기는 이미 hide_shout() RPC 가 담당하고 클라이언트(community.ts:1404)도 RPC 만
--   쓰므로 **화면 동작은 바뀌지 않는다.** 정책을 지우지 않고 같은 이름으로 교체한다.
-- ────────────────────────────────────────────────────────────────────────────
drop policy if exists shouts_hide on public.community_shouts;
create policy shouts_hide on public.community_shouts
  for update to authenticated
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');

comment on policy shouts_hide on public.community_shouts is
  '외침 UPDATE 는 운영자만. 본인 내리기는 hide_shout() RPC(SECURITY DEFINER)가 담당한다 — 종전에는 소유자가 cost·expires_at·tier_rank·hidden 을 직접 고칠 수 있어 환불 금액의 근거가 될 수 없었다.';

-- ────────────────────────────────────────────────────────────────────────────
-- §2. 구매 원장 — 환불의 유일한 진실
--   point_grants(activity_points 변동)와 역할이 다르다. 이쪽은 spent_points 변동 전용이다.
--   쓰기 정책을 두지 않는다 → RPC(SECURITY DEFINER)만이 통로(point_grants 와 같은 규약).
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.point_purchases (
  id             bigserial primary key,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  kind           text not null check (kind in ('shout','mark_rent')),
  sku_key        text not null references public.shop_skus(key),
  mark_key       text references public.shop_marks(key),            -- mark_rent 전용
  shout_id       uuid references public.community_shouts(id) on delete set null,
  cost           int  not null check (cost > 0),
  duration_hours int  not null check (duration_hours > 0),
  period_from    timestamptz,   -- 렌탈: 이 구매가 늘린 구간의 시작(이어붙이기 기준점)
  period_to      timestamptz,   -- 렌탈: 늘린 구간의 끝(= 구매 직후 expires_at)
  created_at     timestamptz not null default now(),
  refunded_at    timestamptz,
  refunded_by    uuid,
  refund_points  int not null default 0 check (refund_points >= 0),
  refund_reason  text,
  constraint point_purchases_refund_shape
    check ((refunded_at is null) = (refunded_by is null) and refund_points <= cost)
);

comment on table public.point_purchases is
  '활동점수 소비 원장(append-only). buy_shout()/buy_mark_rental() 이 구매마다 1행을 남기고, admin_refund_purchase() 가 그 행을 근거로 spent_points 를 되돌린다. 원장 1행당 환불 1회.';

create index if not exists point_purchases_user_idx
  on public.point_purchases (user_id, created_at desc);

alter table public.point_purchases enable row level security;
drop policy if exists point_purchases_read on public.point_purchases;
create policy point_purchases_read on public.point_purchases
  for select to authenticated
  using (user_id = (select auth.uid()) or public.my_role() = 'admin');

-- 산술 버그가 발권으로 번지지 않게 DB 층에서 바닥을 친다.
-- 적용 시점 전 행이 0 이라 무손실이다(sum(spent_points)=0 실측).
alter table public.profiles drop constraint if exists profiles_spent_points_nonneg;
alter table public.profiles add constraint profiles_spent_points_nonneg
  check (spent_points is null or spent_points >= 0);

-- ────────────────────────────────────────────────────────────────────────────
-- §3. 구매 함수에 원장 insert 한 줄씩 추가 — 판정 순서·트랜잭션 경계는 무변경
-- ────────────────────────────────────────────────────────────────────────────
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
  --    ⚠ 환불은 이 상한을 복원하지 않는다. 환불된 외침도 행이 남아 여기서 그대로 세어진다.
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

  -- 5) 잔액 확인 → 차감 → 게시 → **원장 기록** (같은 트랜잭션: 하나라도 실패하면 전부 없던 일)
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

  insert into public.point_purchases
    (user_id, kind, sku_key, shout_id, cost, duration_hours, period_from, period_to)
  values (v_uid, 'shout', 'shout_' || v_t.tier, v_row.id, v_t.cost, v_t.ttl_hours,
          v_row.created_at, v_row.expires_at);

  return v_row;
end $fn$;

comment on function public.buy_shout(text, text) is
  '외치기 구매 — 등급별 가격/노출시간(shop_skus)을 적용해 길이·금칙어·쿨다운·하루 상한·잔액을 모두 통과해야 차감+게시+원장 기록이 함께 일어난다.';

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
  v_from   timestamptz;   -- 이번 구매가 늘린 구간의 시작(원장 근거)
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
  v_from := v_until;   -- 부분 환불은 이 지점부터 duration_hours 만큼만 되돌린다

  -- 무한 적립 방지 — 최대 1년치까지만 쌓인다. 상한은 깎지 말고 **거절**한다
  -- (least() 로 자르면 정가는 걷고 기간만 줄어드는 = 돈만 받는 경로가 된다).
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

  insert into public.point_purchases
    (user_id, kind, sku_key, mark_key, cost, duration_hours, period_from, period_to)
  values (v_uid, 'mark_rent', v_sku.key, p_mark_key, v_sku.price, v_sku.duration_hours,
          v_from, v_until);

  return v_row;
end $fn$;

comment on function public.buy_mark_rental(text, text) is
  '기간 마크 구매 — 잔액/제재/상품 유효성을 서버가 최종 판정하고 차감·지급·장착·원장 기록이 한 트랜잭션에서 일어난다. 같은 마크 재구매는 기간이 이어 붙는다(최대 1년).';

-- ────────────────────────────────────────────────────────────────────────────
-- §4. 환불 견적 — 목록과 실행이 **같은 함수**를 본다
--   화면이 자체 계산하면 서버와 어긋난다("1,100점 환불"이라 말하고 380점만 돌아오는 사고).
--   그래서 '지금 누르면 몇 점인가'와 '왜 못 하나'를 이 함수 하나가 결정하고,
--   admin_list_purchases(표시)와 admin_refund_purchase(실행)가 둘 다 이것을 호출한다.
--   내부 헬퍼라 클라이언트에는 열지 않는다(SECURITY DEFINER 안에서는 소유자 권한으로 호출된다).
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.refund_quote(p_purchase_id bigint)
returns table(points int, block text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
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

  -- 외침: 부분 환불 없음. 아직 노출 중인 건만 전액.
  if v_pp.kind = 'shout' then
    select * into v_sh from public.community_shouts where id = v_pp.shout_id;
    if not found then
      return query select 0, '외침 기록을 찾을 수 없습니다'::text; return;
    end if;
    if v_sh.hidden then
      return query select 0, '이미 내려간 외침은 환불할 수 없습니다'::text; return;
    end if;
    if v_sh.expires_at <= now() then
      return query select 0, '노출이 끝난 외침은 환불할 수 없습니다'::text; return;
    end if;
    return query select v_pp.cost, null::text; return;
  end if;

  -- 기간 마크: 일할 계산(약관 REFUND §2·§3 과 같은 규약).
  select * into v_rt from public.mark_rentals where user_id = v_pp.user_id;
  if not found or v_rt.mark_key is distinct from v_pp.mark_key then
    return query select 0, '다른 기간 마크로 교체되어 이 구매는 환불할 수 없습니다'::text; return;
  end if;

  v_remaining_h := greatest(0, extract(epoch from (v_rt.expires_at - now())) / 3600.0);
  -- ★ least() 가 핵심. 기간이 이어 붙는 구조라 잔여 시간이 이번 구매분보다 클 수 있다.
  --   빠뜨리면 30일권 두 장 산 사람의 두 번째 장 환불에서 60일치가 돌아간다(실질 발권).
  v_this_h := least(v_remaining_h, v_pp.duration_hours::numeric);
  -- floor: 반올림 이득으로 점수가 늘어나는 경로를 차단한다(오차는 항상 ≤1점, 유저 손해 방향).
  v_pts := floor(v_pp.cost * v_this_h / v_pp.duration_hours)::int;
  if v_pts <= 0 then
    return query select 0, '이미 기간이 끝나 환불할 점수가 없습니다'::text; return;
  end if;
  return query select v_pts, null::text;
end $fn$;

comment on function public.refund_quote(bigint) is
  '환불 견적 단일 출처 — 목록 표시(admin_list_purchases)와 실행(admin_refund_purchase)이 같은 값을 본다. 화면이 자체 계산하면 서버와 어긋난다.';

-- ────────────────────────────────────────────────────────────────────────────
-- §5. 환불 실행 — 회수와 점수 복원이 한 트랜잭션
--   잠금 순서는 buy_* 와 동일하게 profiles 먼저 → 상품 행 나중(데드락 회피).
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_refund_purchase(p_purchase_id bigint, p_reason text)
returns table(refunded int, available int)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
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
  if public.my_role() <> 'admin' then raise exception '권한이 없습니다'; end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 4 then raise exception '환불 사유를 4자 이상 남겨 주세요'; end if;

  select user_id into v_user from public.point_purchases where id = p_purchase_id;
  if v_user is null then raise exception '환불할 구매 내역이 없습니다'; end if;

  -- 잔액 잠금 먼저(구매와 같은 순서)
  perform 1 from public.profiles where id = v_user for update;
  if not found then raise exception '프로필을 찾을 수 없습니다'; end if;

  -- 원장 잠금 — 같은 건에 대한 동시 환불 두 번을 직렬화한다.
  select * into v_pp from public.point_purchases where id = p_purchase_id for update;

  -- 잠금 뒤에 견적을 다시 낸다(재환불·24시간 창·30일 상한·회수 가능 여부 전부 여기서 판정)
  select q.points, q.block into v_refund, v_block from public.refund_quote(p_purchase_id) q;
  if v_block is not null then raise exception '%', v_block; end if;

  if v_pp.kind = 'shout' then
    -- expires_at 은 건드리지 않는다 — 진열 쿼리와 RLS 가 hidden 을 보므로 이것만으로 사라지고,
    -- 원래 노출 기간이 기록으로 남는다.
    update public.community_shouts
       set hidden = true, hidden_by = v_admin, hidden_at = now()
     where id = v_pp.shout_id and hidden = false;
  else
    select * into v_rt from public.mark_rentals where user_id = v_user for update;
    v_remaining_h := greatest(0, extract(epoch from (v_rt.expires_at - now())) / 3600.0);
    v_this_h := least(v_remaining_h, v_pp.duration_hours::numeric);
    -- 행을 지우지 않는다(DB 는 추가만). 기간을 이번 구매분만큼 되감아 회수하고 흔적을 남긴다.
    --
    -- ⚠ 여기에 least(..., now()) 를 씌우면 안 된다(설계 초안의 함정 — 실측으로 잡았다).
    --    v_this_h <= v_remaining_h 이므로 expires_at - v_this_h 는 **정의상 항상 now() 이상**이고
    --    (now() 는 트랜잭션 고정값이라 두 계산이 같은 시각을 본다), 딱 같아지는 경우가 전액 환불이다.
    --    거기에 least(now()) 를 걸면 1일권 두 장(48h)을 산 사람의 둘째 장을 환불할 때
    --    50점만 돌려주고 **48시간을 통째로 회수**한다 — 첫 장 24시간이 보상 없이 증발한다.
    update public.mark_rentals
       set expires_at = v_rt.expires_at - (v_this_h || ' hours')::interval,
           updated_at = now()
     where user_id = v_user;
    -- 표시 경로(get_equipped_marks·get_activity_leaderboard)는 만료 즉시 자동으로 낫지만
    -- profiles.equipped_mark 에는 죽은 키가 남는다 → 유저가 그 마크를 다시 누르면
    -- set_equipped_mark 가 '기간이 남아 있는 마크만…' 으로 거절해 원인 모를 UX 사고가 된다.
    if not exists (select 1 from public.mark_rentals
                    where user_id = v_user and expires_at > now()) then
      update public.profiles set equipped_mark = null
       where id = v_user and equipped_mark = v_pp.mark_key;
    end if;
  end if;

  -- 점수 복원은 spent_points 감소로만. activity_points 는 건드리지 않는다(§1 헤더).
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
end $fn$;

comment on function public.admin_refund_purchase(bigint, text) is
  '운영자 환불 — 원장 1행당 1회, 구매 후 24시간 이내, 사유 4자 이상 필수. spent_points 를 낮춰 되돌리고(activity_points 는 불변) 구매물을 회수한다. 렌탈은 이번 구매분(duration_hours)만 되감는다 — least(now()) 를 씌우면 이어 붙은 이전 구매분까지 증발한다. 쿨다운·하루 3회 상한은 복원하지 않는다(도배 방지 장치라 복원하면 상한이 무력화된다).';

-- ────────────────────────────────────────────────────────────────────────────
-- §6. 운영 조회 — 구매 내역 + 서버가 계산한 환불 견적/불가 사유
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_list_purchases(p_user uuid, p_limit int default 30)
returns table(id bigint, kind text, sku_key text, label text, mark_key text, shout_id uuid,
              cost int, created_at timestamptz, refunded_at timestamptz,
              refund_points int, refund_reason text,
              refundable boolean, refund_estimate int, refund_block text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if (select auth.uid()) is null then raise exception '로그인이 필요합니다'; end if;
  if public.my_role() <> 'admin' then raise exception '권한이 없습니다'; end if;

  return query
    select pp.id, pp.kind, pp.sku_key, coalesce(sk.label, pp.sku_key), pp.mark_key, pp.shout_id,
           pp.cost, pp.created_at, pp.refunded_at, pp.refund_points, pp.refund_reason,
           (q.block is null), coalesce(q.points, 0), q.block
    from public.point_purchases pp
    left join public.shop_skus sk on sk.key = pp.sku_key
    cross join lateral public.refund_quote(pp.id) q
    where pp.user_id = p_user
    order by pp.created_at desc
    limit greatest(1, least(coalesce(p_limit, 30), 100));
end $fn$;

comment on function public.admin_list_purchases(uuid, int) is
  '운영자 — 회원의 활동점수 구매 내역. refund_estimate(지금 누르면 몇 점)와 refund_block(왜 못 하나)을 서버가 계산해 준다. 화면은 이 값을 그대로 표시만 한다.';

-- 회원 잔액(운영자용) — my_point_balance 의 타인 조회판
create or replace function public.admin_point_summary(p_user uuid)
returns table(total int, spent int, available int)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if (select auth.uid()) is null then raise exception '로그인이 필요합니다'; end if;
  if public.my_role() <> 'admin' then raise exception '권한이 없습니다'; end if;
  return query
    select coalesce(p.activity_points, 0), coalesce(p.spent_points, 0),
           greatest(0, coalesce(p.activity_points, 0) - coalesce(p.spent_points, 0))
    from public.profiles p where p.id = p_user;
end $fn$;

comment on function public.admin_point_summary(uuid) is
  '운영자 — 회원 활동점수 잔액(누적/사용/사용 가능). 사용 가능 = activity_points − spent_points.';

-- ────────────────────────────────────────────────────────────────────────────
-- §7. ACL — anon·PUBLIC 회수 후 필요한 롤에만(20260830a §8 규약 그대로).
--   authenticated 에 열되 함수 안에서 my_role()='admin' 으로 최종 판정한다.
--   refund_quote 는 내부 헬퍼라 authenticated 에 열지 않는다.
-- ────────────────────────────────────────────────────────────────────────────
revoke all on function public.refund_quote(bigint)                    from public, anon, authenticated;
revoke all on function public.admin_refund_purchase(bigint, text)     from public, anon, authenticated;
revoke all on function public.admin_list_purchases(uuid, int)         from public, anon, authenticated;
revoke all on function public.admin_point_summary(uuid)               from public, anon, authenticated;

grant execute on function public.refund_quote(bigint)                 to service_role;
grant execute on function public.admin_refund_purchase(bigint, text)  to authenticated, service_role;
grant execute on function public.admin_list_purchases(uuid, int)      to authenticated, service_role;
grant execute on function public.admin_point_summary(uuid)            to authenticated, service_role;

-- 읽기만 연다(RLS 가 본인+운영자로 좁힌다). 쓰기 정책이 없으므로 INSERT/UPDATE 통로는
-- SECURITY DEFINER RPC 뿐이다 — 시퀀스 권한도 열지 않는다(직접 INSERT 여지 제거).
grant select on public.point_purchases to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- §8. 외치기 관리 카드용 — shout_id → 원장 id + 견적
--   ShoutsAdminCard(AdminTab.tsx)는 회원이 아니라 '외침'을 기준으로 보고 있어서
--   원장 id 를 모른다. 화면이 스스로 견적을 계산하면 서버와 어긋나므로(§4 와 같은 이유)
--   여기서도 refund_quote() 를 통과시킨 값만 내려 준다.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_shout_refunds(p_limit int default 50)
returns table(shout_id uuid, purchase_id bigint, refund_estimate int, refund_block text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if (select auth.uid()) is null then raise exception '로그인이 필요합니다'; end if;
  if public.my_role() <> 'admin' then raise exception '권한이 없습니다'; end if;

  return query
    select pp.shout_id, pp.id, coalesce(q.points, 0), q.block
    from public.point_purchases pp
    cross join lateral public.refund_quote(pp.id) q
    where pp.kind = 'shout' and pp.shout_id is not null
    order by pp.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end $fn$;

comment on function public.admin_shout_refunds(int) is
  '외치기 관리 카드용 — 외침 id 로 원장 id·환불 견적·불가 사유를 찾는다. 견적은 refund_quote() 단일 출처를 그대로 쓴다.';

revoke all on function public.admin_shout_refunds(int) from public, anon, authenticated;
grant execute on function public.admin_shout_refunds(int) to authenticated, service_role;
