-- ============================================================================
-- 이벤트 — 카드 뽑기(오너 지시 2026-09-06, 첫 이벤트 '카드를 찢어 확인')
--
-- ⚠ 아직 **적용하지 않았다**(오너 승인 대기). 운영 DB 변경 금지 지시에 따른다.
--
-- 무엇인가
--   매장 출석 QR 을 찍을 때마다 '참여권' 1장이 쌓이고, 참여권 1장으로 100장 중 한 장을 골라 연다.
--   등급은 **캠페인을 만들 때 미리 섞어 박아 둔다**(열 때 주사위를 굴리지 않는다).
--   그래야 ① '고른다'가 의미를 갖고 ② 총 수량이 사전에 확정되며 ③ 나중에 감사가 된다.
--
-- 왜 이렇게 설계했나 — 세 가지 함정
--   ① **등급이 새면 안 된다.** event_cards 를 클라이언트가 직접 읽으면 안 열린 카드의 등급이 보인다.
--      → 이 테이블은 select 권한 자체를 주지 않고, 보드는 event_board() 가 **연 카드의 등급만** 담아 내려준다.
--   ② **같은 카드를 둘이 동시에 열면 안 된다.** → 카드 행을 for update 로 잠근 뒤 opened_at 을 확인한다.
--   ③ **참여권 1장으로 두 장을 열면 안 된다.** → 참여권도 for update skip locked 로 한 장을 집어 소모한다.
--      두 잠금이 한 트랜잭션 안에 있으므로 중간에 끼어들 자리가 없다.
--
-- 이용권 발급을 issue_voucher 로 하지 않는 이유
--   그 함수는 can_manage_pos(업주) 를 요구한다. 여기서 부르는 사람은 **손님**이다.
--   그래서 같은 불변식(발급 한도 차감 · 본인인증 게이트 · 만료 · 알림 · issue_reason)을 이 함수가 직접 지킨다.
--   ⚠ issue_voucher 를 고칠 때 이 함수도 같이 봐야 한다 — 불변식이 두 곳에 있다(의도된 중복, 근거는 위 한 줄).
--
-- 법적 성격 메모(2026-09-05 법적위험완화 v3 와의 관계)
--   그때 끊은 것은 **순위(대회 등수) → 이용권** 연결이다. 이건 대회 성적과 무관한 **출석 기반 무료 응모 경품**이라
--   성격이 다르다. 다만 안전판을 코드에 박아 둔다: 총 수량·등급별 장수가 캠페인 생성 시 고정되고(사후 추가 불가),
--   기간(starts_at·ends_at)과 발급 한도(venues.voucher_quota)를 넘어서는 발급이 물리적으로 불가능하다.
--   note 에는 '이벤트 당첨'으로 적고 대회 입상 문구(순위·시상·입상·우승)를 쓰지 않는다.
--
-- 롤백: drop function open_event_card, event_board, _grant_event_tickets;
--       drop trigger checkins_grant_event_tickets on public.checkins;
--       drop table event_tickets, event_cards, event_campaigns;
-- ============================================================================

-- ── ① 테이블 ────────────────────────────────────────────────────────────────
create table if not exists public.event_campaigns (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  venue_id           uuid not null references public.venues(id) on delete cascade,
  -- 이용권을 '누가 발급한 것으로' 기록할지. store_vouchers.issued_by 가 not null 이라 필요하다.
  issued_by          uuid not null references public.profiles(id),
  title              text not null,
  subtitle           text,
  status             text not null default 'draft' check (status in ('draft', 'live', 'ended')),
  starts_at          timestamptz,
  ends_at            timestamptz,
  -- 참여권을 어느 매장 출석에 줄지. null = **모든 매장** 출석(오너 지시 "누리홀덤 출석 QR을 찍을 때마다").
  ticket_venue_id    uuid references public.venues(id) on delete set null,
  voucher_title      text not null default '매장이용권',
  voucher_expires_at timestamptz,
  created_at         timestamptz not null default now()
);

create table if not exists public.event_cards (
  campaign_id   uuid not null references public.event_campaigns(id) on delete cascade,
  idx           int  not null,                       -- 화면의 카드 자리(1..N)
  tier          int  check (tier between 1 and 4),   -- null = 꽝
  voucher_count int  not null default 0 check (voucher_count >= 0),
  opened_by     uuid references public.profiles(id) on delete set null,
  opened_name   text,
  opened_at     timestamptz,
  primary key (campaign_id, idx)
);

create table if not exists public.event_tickets (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.event_campaigns(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  -- 어느 출석으로 받은 참여권인지. 같은 출석이 두 장을 만들지 않게 하는 멱등 키다.
  checkin_id  uuid references public.checkins(id) on delete set null,
  used_idx    int,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create unique index if not exists event_tickets_checkin_uniq
  on public.event_tickets(campaign_id, checkin_id) where checkin_id is not null;
create index if not exists event_tickets_unused_idx
  on public.event_tickets(campaign_id, user_id) where used_at is null;

-- ── ② RLS — 카드는 **아무에게도 직접 읽히지 않는다**(등급 유출 차단) ──────────────
alter table public.event_campaigns enable row level security;
alter table public.event_cards     enable row level security;
alter table public.event_tickets   enable row level security;

drop policy if exists event_campaigns_read on public.event_campaigns;
create policy event_campaigns_read on public.event_campaigns
  for select using (status <> 'draft');

drop policy if exists event_tickets_own on public.event_tickets;
create policy event_tickets_own on public.event_tickets
  for select using (user_id = auth.uid());

-- event_cards 에는 정책을 만들지 않는다 = RLS 아래에서 아무 행도 안 보인다(SECURITY DEFINER 만 통과).
revoke all on public.event_cards from public, anon, authenticated;
grant select on public.event_campaigns to anon, authenticated;
grant select on public.event_tickets to authenticated;

-- ── ③ 출석 → 참여권 1장 (트리거) ────────────────────────────────────────────
-- check_in RPC 가 아니라 **checkins 테이블**에 건다. 출석 행을 만드는 경로가 둘이기 때문이다
-- (check_in RPC · 이용권 사용 트리거 _voucher_used_checkin). 한쪽에만 걸면 다른 쪽이 조용히 빠진다.
create or replace function public._grant_event_tickets()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  insert into public.event_tickets(campaign_id, user_id, checkin_id)
  select c.id, new.user_id, new.id
    from public.event_campaigns c
   where c.status = 'live'
     and (c.ticket_venue_id is null or c.ticket_venue_id = new.venue_id)
     and (c.starts_at is null or now() >= c.starts_at)
     and (c.ends_at is null or now() <= c.ends_at)
  on conflict do nothing;   -- 같은 출석이 두 번 들어와도 참여권은 한 장
  return new;
exception when others then
  return new;               -- ⚠ 이벤트 때문에 출석이 실패하면 안 된다 — 출석이 본체다
end $function$;

revoke all on function public._grant_event_tickets() from public, anon, authenticated;

drop trigger if exists checkins_grant_event_tickets on public.checkins;
create trigger checkins_grant_event_tickets
  after insert on public.checkins
  for each row execute function public._grant_event_tickets();

-- ── ④ 보드 조회 — 안 연 카드의 등급은 **내려보내지 않는다** ─────────────────────
create or replace function public.event_board(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_c record; v_cards jsonb; v_tickets int := 0; v_left jsonb; v_total jsonb; v_vc jsonb;
begin
  select * into v_c from public.event_campaigns where slug = p_slug and status <> 'draft';
  if v_c is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'idx', idx,
           'opened', opened_at is not null,
           -- 등급·장수·연 사람은 **연 카드에 한해서만**. 안 연 카드는 키 자체가 없다.
           'tier', case when opened_at is not null then tier end,
           'count', case when opened_at is not null then voucher_count end,
           'by', case when opened_at is not null then opened_name end
         ) order by idx), '[]'::jsonb)
    into v_cards
    from public.event_cards where campaign_id = v_c.id;

  -- 등급별 장수 — **처음 몇 장이었고 몇 장 남았는가**. 둘 다 공개해도 어느 자리인지는 드러나지 않는다.
  -- 확률 공개(최하단 표)의 근거값이라 서버가 준다 — 화면이 상수로 들고 있으면 실제와 어긋날 수 있다.
  select coalesce(jsonb_object_agg(t::text, n), '{}'::jsonb) into v_left from (
    select tier as t, count(*) as n from public.event_cards
     where campaign_id = v_c.id and tier is not null and opened_at is null group by tier
  ) s;
  select coalesce(jsonb_object_agg(t, n), '{}'::jsonb) into v_total from (
    select coalesce(tier::text, 'none') as t, count(*) as n, max(voucher_count) as vc
      from public.event_cards where campaign_id = v_c.id group by tier
  ) s2;
  select coalesce(jsonb_object_agg(t, vc), '{}'::jsonb) into v_vc from (
    select coalesce(tier::text, 'none') as t, max(voucher_count) as vc
      from public.event_cards where campaign_id = v_c.id group by tier
  ) s3;

  if auth.uid() is not null then
    select count(*) into v_tickets from public.event_tickets
     where campaign_id = v_c.id and user_id = auth.uid() and used_at is null;
  end if;

  return jsonb_build_object(
    'slug', v_c.slug, 'title', v_c.title, 'subtitle', v_c.subtitle, 'status', v_c.status,
    'venueId', v_c.venue_id, 'startsAt', v_c.starts_at, 'endsAt', v_c.ends_at,
    'voucherTitle', v_c.voucher_title,
    'cards', v_cards, 'myTickets', v_tickets,
    'remainByTier', v_left, 'totalByTier', v_total, 'voucherByTier', v_vc);
end $function$;

-- select 만 하므로 STABLE. 서버가 스스로 '읽기'임을 말하게 한다 —
-- E2E 쓰기 차단 가드가 pg_proc.provolatile 로 읽기/쓰기를 가르기 때문에 이 선언이 곧 통행증이다.
alter function public.event_board(text) stable;
revoke all on function public.event_board(text) from public;
grant execute on function public.event_board(text) to anon, authenticated;

-- ── ⑤ 카드 열기 — 참여권 1장 소모 + 카드 확정 + (당첨이면) 이용권 발급 ──────────
create or replace function public.open_event_card(p_slug text, p_idx int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_c record; v_card record; v_ticket uuid; v_name text; v_quota int; v_vname text;
begin
  if auth.uid() is null then raise exception '로그인 후 참여할 수 있습니다'; end if;

  select * into v_c from public.event_campaigns where slug = p_slug;
  if v_c is null or v_c.status <> 'live' then raise exception '진행 중인 이벤트가 아닙니다'; end if;
  if (v_c.starts_at is not null and now() < v_c.starts_at)
     or (v_c.ends_at is not null and now() > v_c.ends_at) then
    raise exception '이벤트 기간이 아닙니다';
  end if;

  -- ⚠ 본인인증 게이트는 **카드를 열기 전에** 본다. 열고 나서 발급 단계에서 막으면
  --   참여권과 카드만 사라지고 손님은 아무것도 못 받는다(되돌릴 방법이 없다).
  if public.identity_gate_on() and not exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and public.is_ci_verified(p.ci_hash, p.verified_at)
  ) then
    raise exception '본인인증을 완료해야 참여할 수 있습니다 — 내 정보 > 보안에서 인증을 마쳐 주세요';
  end if;

  -- 참여권 한 장을 잠그고 집는다(skip locked: 동시에 여러 번 눌러도 각각 다른 장을 집는다)
  select id into v_ticket from public.event_tickets
   where campaign_id = v_c.id and user_id = auth.uid() and used_at is null
   order by created_at limit 1 for update skip locked;
  if v_ticket is null then
    raise exception '참여권이 없습니다 — 매장 출석 QR을 찍으면 1장 지급됩니다';
  end if;

  -- 카드를 잠근다 — 둘이 같은 자리를 동시에 열 수 없다
  select * into v_card from public.event_cards
   where campaign_id = v_c.id and idx = p_idx for update;
  if v_card is null then raise exception '없는 카드입니다'; end if;
  if v_card.opened_at is not null then
    raise exception '이미 열린 카드예요 — 다른 카드를 골라 주세요';
  end if;

  select coalesce(nickname, name) into v_name from public.profiles where id = auth.uid();

  update public.event_cards
     set opened_by = auth.uid(), opened_name = v_name, opened_at = now()
   where campaign_id = v_c.id and idx = p_idx;
  update public.event_tickets set used_idx = p_idx, used_at = now() where id = v_ticket;

  if v_card.voucher_count > 0 then
    -- 발급 한도 차감 — issue_voucher 와 같은 불변식(위 헤더 주석 참조)
    select voucher_quota into v_quota from public.venues where id = v_c.venue_id for update;
    if coalesce(v_quota, 0) < v_card.voucher_count then
      raise exception '매장 발급 한도가 부족합니다 — 매장에 문의해 주세요';
    end if;
    update public.venues set voucher_quota = voucher_quota - v_card.voucher_count
     where id = v_c.venue_id;

    insert into public.store_vouchers(venue_id, issued_by, holder_user_id, holder_name,
                                      title, note, expires_at, issue_reason)
    select v_c.venue_id, v_c.issued_by, auth.uid(), v_name,
           v_c.voucher_title,
           -- 대회 입상 문구(순위·시상·입상·우승)를 쓰지 않는다 — 성격이 다른 경품이다
           format('%s 당첨 · %s번 카드', v_c.title, p_idx),
           v_c.voucher_expires_at, 'event'
      from generate_series(1, v_card.voucher_count);

    begin
      select name into v_vname from public.venues where id = v_c.venue_id;
      insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link)
      values (auth.uid(), 'system', '🎉 이벤트 당첨!',
              format('%s에서 ''%s'' %s장을 받았어요. 지갑에서 확인하세요',
                     coalesce(v_vname, '매장'), v_c.voucher_title, v_card.voucher_count),
              '🎉', '#FFD100', '/wallet');
    exception when others then null;   -- 알림 실패가 당첨을 되돌리면 안 된다
    end;
  end if;

  return jsonb_build_object('idx', p_idx, 'tier', v_card.tier,
                            'voucherCount', v_card.voucher_count,
                            'voucherTitle', v_c.voucher_title);
end $function$;

revoke all on function public.open_event_card(text, int) from public, anon;
grant execute on function public.open_event_card(text, int) to authenticated, service_role;

-- ── ⑥ 첫 캠페인 seed — 카드 100장 · 당첨 17장(이용권 합계 37장) ────────────────
-- status='draft' 로 넣는다. **draft 인 동안은 아무에게도 안 보이고 참여권도 안 나간다** —
-- 오너가 확인한 뒤 'live' 로 바꾸는 순간부터 시작된다.
do $seed$
declare v_venue uuid; v_admin uuid; v_cid uuid;
begin
  select id into v_venue from public.venues where name = '로티아레나' limit 1;
  if v_venue is null then raise notice '로티아레나 매장을 찾지 못해 seed 를 건너뜁니다'; return; end if;
  -- ⚠ profiles 에는 created_at 이 없다(롤백 검증에서 잡음). id 순서로 고른다 — 누구든 한 명이면 된다.
  select id into v_admin from public.profiles where role = 'admin' order by id limit 1;
  if v_admin is null then raise notice '관리자 계정을 찾지 못해 seed 를 건너뜁니다'; return; end if;
  if exists (select 1 from public.event_campaigns where slug = 'card-open-2026-09') then return; end if;

  insert into public.event_campaigns(slug, venue_id, issued_by, title, subtitle, status,
                                     ticket_venue_id, voucher_title)
  values ('card-open-2026-09', v_venue, v_admin, '오픈 기념 이벤트',
          '매장 출석할 때마다 참여권 1장 · 카드를 찢어 확인하세요', 'draft',
          null,                       -- 모든 매장 출석에 참여권 지급
          '로티아레나 매장이용권')
  returning id into v_cid;

  -- 등급 배치: 1등 1장(이용권 10) · 2등 2장(5) · 3등 3장(2) · 4등 11장(1) · 나머지 83장 꽝.
  -- random() 으로 **섞어서** 자리에 박는다 — 자리 번호와 등급 사이에 규칙이 없어야 한다.
  with prizes as (
    select 1 as tier, 10 as cnt, generate_series(1, 1)  as k
    union all select 2, 5, generate_series(1, 2)
    union all select 3, 2, generate_series(1, 3)
    union all select 4, 1, generate_series(1, 11)
  ),
  padded as (
    select tier, cnt from prizes
    union all
    select null::int, 0 from generate_series(1, 100 - (select count(*) from prizes))
  ),
  shuffled as (
    select row_number() over (order by random()) as idx, tier, cnt from padded
  )
  insert into public.event_cards(campaign_id, idx, tier, voucher_count)
  select v_cid, idx, tier, cnt from shuffled;

  raise notice '이벤트 seed 완료 — 카드 %장', (select count(*) from public.event_cards where campaign_id = v_cid);
end $seed$;

-- 확인용(적용 후 손으로):
--   select tier, count(*), sum(voucher_count) from public.event_cards
--    where campaign_id = (select id from public.event_campaigns where slug='card-open-2026-09')
--    group by tier order by tier nulls last;
--   → 1|1|10, 2|2|10, 3|3|6, 4|11|11, null|83|0   (당첨 17장 · 이용권 합계 37장)
-- 시작하려면: update public.event_campaigns set status='live', starts_at=now() where slug='card-open-2026-09';
