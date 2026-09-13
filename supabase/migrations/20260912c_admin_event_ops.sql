-- ============================================================================
-- 20260912c — 관리자 이벤트 운영(§6) 서버 경로 + 당첨↔이용권 구조적 참조
--
-- ⚠ 아직 **적용하지 않았다(오너 승인 대기)**. 이 파일은 초안이다.
--    `supabase db push` 하지 않았고 운영 DB 에 어떤 쓰기도 하지 않았다.
--    적용 순서는 반드시 **DB 먼저 → 앱 나중**이다. 반대로 하면 관리자 화면이 PGRST202 로 뜬다
--    (그 창을 앱이 '0건'으로 위장하지 않게 src/api/events.ts 가 rpcMissing 으로 분리해 둔다).
--
-- ── 무엇이 없었나 (2026-09-12 실측) ─────────────────────────────────────────────
--   `event_campaigns` 에 insert/update/delete 정책이 **하나도 없다**(20260906b:84-86 은 select 뿐).
--   `event_cards` 는 `revoke all … from public, anon, authenticated`(:93).
--   즉 service_role 우회 말고는 캠페인을 만들거나 공개·중단·종료할 SQL 경로가 **존재하지 않았다.**
--   관리자는 지금까지 DB 콘솔에서 직접 SQL 을 쳐야 했고, 그건 감사도 검증도 없는 경로다.
--
-- ── 이 파일이 하는 일 ────────────────────────────────────────────────────────
--   ① store_vouchers 에 `event_campaign_id` · `event_card_idx` 를 **추가(nullable)** 하고
--      open_event_card 가 채우게 한다. 지금은 당첨↔이용권이 note 문자열
--      (`format('%s 당첨 · %s번 카드', …)`, 20260906b:249)로만 이어져 있다 — 제목에 '·' 가 들어가거나
--      캠페인명을 바꾸는 순간 끊기는 연결이다.
--      ⚠ **비파괴**: 기존 행은 NULL 로 남고 소비자는 note 폴백을 그대로 쓴다. 백필하지 않는다
--        (옛 note 를 파싱해 되채우면 파싱이 틀린 행에 **틀린 캠페인**을 박아 넣게 된다 — 없는 것보다 나쁘다).
--      `on delete set null` — 캠페인을 지워도 손님 지갑의 이용권은 절대 사라지지 않는다.
--   ② 관리자 RPC 7종. **테이블 정책은 한 줄도 새로 열지 않는다** — 변경은 전부 SECURITY DEFINER 안이고
--      RLS 표면은 20260906b 그대로다(= 이 파일을 되돌려도 권한이 넓어진 채 남지 않는다).
--
-- ── 지키는 계약 (하나라도 빠지면 파일 하단 자가검사가 전체를 롤백시킨다) ──────────
--   · 관리자 가드는 **`my_role() is distinct from 'admin'::user_role`**.
--     `<>` 는 비로그인(auth.uid()=NULL)에서 NULL 이 되어 if 를 건너뛴다 = 가드가 열린다(20260820a 실사고).
--   · `security definer` + `set search_path = public, pg_temp` 전부.
--   · `revoke all … from public, anon` + `grant … to authenticated, service_role`.
--     `from anon` 만으로는 **무효** — PUBLIC 기본 GRANT 가 남는다. `create or replace` 는 ACL 을
--     초기화하므로 재정의 뒤 REVOKE/GRANT 를 다시 쓴다(open_event_card 가 그 경우다).
--   · **발급 주체는 서버가 유도한다** — `issued_by := auth.uid()`. 클라이언트가 보낸 이름·id 를 쓰지 않는다
--     (옛 seed 는 `where name = '로티아레나'` / `role='admin' order by id limit 1` 로 **첫 매장·첫 관리자**를
--      문자열로 골랐다 — 그게 §6 이 금지한 바로 그 방식이다).
--   · **셔플은 서버에서만.** 클라이언트가 자리 배치를 정하면 당첨 자리를 고를 수 있다.
--     자리 배치는 `order by random()` 으로 서버가 만들고, 응답·감사기록 어디에도 자리별 등급을 싣지 않는다.
--   · **공개 이후 배치 변경 불가.** 구성·삭제는 `status = 'draft'` 에서만.
--   · 감사기록(`public._audit`, 20260623q append-only)을 생성·구성·공개·종료·삭제 다섯 단계 전부에 건다.
--
-- ── 일부러 만들지 않은 것 (§6 이 금지한 것) ────────────────────────────────────
--   열린 카드 닫기 · 당첨자 변경 · 특정 사용자 당첨 강제 · 판 초기화(다음 회차는 새 캠페인이다).
--   관리자용 '미개봉 자리 보기' 도 없다 — 목록·검증은 **집계만** 돌려준다.
--
-- 멱등: add column if not exists / create or replace / drop … if exists. 두 번 실행해도 같다.
-- 롤백: 파일 맨 아래 ROLLBACK 절 참조.
-- ============================================================================

-- ── ⓪ 당첨 → 이용권 구조적 참조 (비파괴) ────────────────────────────────────
alter table public.store_vouchers
  add column if not exists event_campaign_id uuid references public.event_campaigns(id) on delete set null;
alter table public.store_vouchers
  add column if not exists event_card_idx int;

comment on column public.store_vouchers.event_campaign_id is
  '이 이용권을 만든 이벤트 캠페인. NULL = 이벤트 발급이 아니거나 20260912c 이전에 발급된 행(그 행들은 note 문자열 폴백으로 읽는다 — 백필하지 않는다). (20260912c)';
comment on column public.store_vouchers.event_card_idx is
  '이 이용권을 만든 카드 자리 번호. event_campaign_id 와 짝. (20260912c)';

create index if not exists store_vouchers_event_src_idx
  on public.store_vouchers(event_campaign_id, event_card_idx)
  where event_campaign_id is not null;

-- ── ① open_event_card — 20260906b 정의 + 원천 참조 두 컬럼 ────────────────────
-- 손님 경로의 **동작은 한 글자도 바꾸지 않는다**. insert 열 목록에 두 컬럼이 붙을 뿐이다.
-- (20260906b 의 잠금 순서·본인인증 게이트·발급 한도 차감·알림 실패 무시가 전부 그대로여야 한다 —
--  자가검사가 그 다섯 가지를 prosrc 로 확인한다.)
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
    -- 발급 한도 차감 — issue_voucher 와 같은 불변식(20260906b 헤더 주석 참조)
    select voucher_quota into v_quota from public.venues where id = v_c.venue_id for update;
    if coalesce(v_quota, 0) < v_card.voucher_count then
      raise exception '매장 발급 한도가 부족합니다 — 매장에 문의해 주세요';
    end if;
    update public.venues set voucher_quota = voucher_quota - v_card.voucher_count
     where id = v_c.venue_id;

    -- ⚠ event_campaign_id · event_card_idx 가 **구조적 원천 참조**다(§7 "제목/note 파싱으로 연결하지 않는다").
    --   note 는 사람이 읽는 설명으로만 남긴다 — 지우면 기존 지갑 화면의 문구가 사라지므로 유지한다.
    insert into public.store_vouchers(venue_id, issued_by, holder_user_id, holder_name,
                                      title, note, expires_at, issue_reason,
                                      event_campaign_id, event_card_idx)
    select v_c.venue_id, v_c.issued_by, auth.uid(), v_name,
           v_c.voucher_title,
           -- 대회 입상 문구(순위·시상·입상·우승)를 쓰지 않는다 — 성격이 다른 경품이다
           format('%s 당첨 · %s번 카드', v_c.title, p_idx),
           v_c.voucher_expires_at, 'event',
           v_c.id, p_idx
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

-- create or replace 는 ACL 을 PUBLIC 기본 GRANT 로 되돌린다 → 20260906b:269-270 을 그대로 다시 쓴다.
revoke all on function public.open_event_card(text, int) from public, anon;
grant execute on function public.open_event_card(text, int) to authenticated, service_role;

-- ── ② 검증 로직 (내부 전용) ─────────────────────────────────────────────────
-- 검증 RPC 와 공개 RPC 가 **같은 코드**를 봐야 한다. 두 벌로 두면 화면은 통과라 하고 공개는 거절하거나,
-- 더 나쁘게는 그 반대가 된다. `_` 접두 = 클라이언트 롤 전면 회수(직접 호출 차단).
create or replace function public._event_campaign_problems(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_c record; v_p jsonb := '[]'::jsonb;
  v_cards int; v_prize int; v_vouchers int; v_quota int; v_approved boolean; v_mixed int; v_maxidx int;
begin
  select * into v_c from public.event_campaigns where id = p_campaign_id;
  if not found then
    return jsonb_build_object('ok', false,
      'problems', jsonb_build_array(jsonb_build_object(
        'code', 'not_found', 'field', 'campaign', 'message', '캠페인을 찾을 수 없습니다')));
  end if;

  select count(*), count(*) filter (where tier is not null),
         coalesce(sum(voucher_count), 0), coalesce(max(idx), 0)
    into v_cards, v_prize, v_vouchers, v_maxidx
    from public.event_cards where campaign_id = p_campaign_id;

  -- 같은 등급에 서로 다른 이용권 장수가 섞여 있으면 확률 표의 `max(voucher_count)` 집계가
  -- **실제와 다른 경품**을 고지한다(event_board 의 voucherByTier — 20260906b:160-163). 그건 허위 고지다.
  select count(*) into v_mixed from (
    select tier from public.event_cards
     where campaign_id = p_campaign_id and tier is not null
     group by tier having count(distinct voucher_count) > 1
  ) s;

  select coalesce(voucher_quota, 0), coalesce(voucher_issue_approved, false)
    into v_quota, v_approved from public.venues where id = v_c.venue_id;

  if v_cards = 0 then
    v_p := v_p || jsonb_build_object('code', 'no_cards', 'field', 'cards',
      'message', '카드가 아직 구성되지 않았습니다 — 카드판에서 수량을 정하고 생성하세요');
  elsif v_maxidx <> v_cards then
    v_p := v_p || jsonb_build_object('code', 'idx_gap', 'field', 'cards',
      'message', format('카드 자리 번호가 1~%s 로 이어지지 않습니다 (총 %s장, 마지막 번호 %s)', v_cards, v_cards, v_maxidx));
  end if;
  if v_cards > 0 and v_prize = 0 then
    v_p := v_p || jsonb_build_object('code', 'no_prize', 'field', 'tiers',
      'message', '당첨 카드가 0장입니다 — 전부 꽝인 판은 공개할 수 없습니다');
  end if;
  if v_mixed > 0 then
    v_p := v_p || jsonb_build_object('code', 'tier_voucher_mixed', 'field', 'tiers',
      'message', '같은 등급에 이용권 장수가 서로 다른 카드가 섞여 있습니다 — 확률 표가 실제와 달라집니다');
  end if;
  if v_c.starts_at is not null and v_c.ends_at is not null and v_c.starts_at >= v_c.ends_at then
    v_p := v_p || jsonb_build_object('code', 'period_inverted', 'field', 'endsAt',
      'message', '종료 시각이 시작 시각보다 빠르거나 같습니다');
  end if;
  if v_c.ends_at is not null and v_c.ends_at <= now() then
    v_p := v_p || jsonb_build_object('code', 'ends_in_past', 'field', 'endsAt',
      'message', '종료 시각이 이미 지났습니다');
  end if;
  if v_c.voucher_expires_at is not null and v_c.voucher_expires_at <= now() then
    v_p := v_p || jsonb_build_object('code', 'voucher_expired', 'field', 'voucherExpiresAt',
      'message', '경품 이용권 유효기간이 이미 지났습니다 — 받는 즉시 만료된 이용권이 발급됩니다');
  elsif v_c.voucher_expires_at is not null and v_c.ends_at is not null
        and v_c.voucher_expires_at < v_c.ends_at then
    v_p := v_p || jsonb_build_object('code', 'voucher_expires_before_end', 'field', 'voucherExpiresAt',
      'message', '경품 이용권이 이벤트 종료보다 먼저 만료됩니다 — 마지막에 당첨된 손님이 쓰지 못합니다');
  end if;
  if not v_approved then
    v_p := v_p || jsonb_build_object('code', 'venue_not_approved', 'field', 'venueId',
      'message', '이 매장은 이용권 발급이 승인되지 않았습니다 — 매장 관리에서 먼저 승인하세요');
  end if;
  -- 남은 당첨 카드와 매장 공용 발급 한도는 다르다(§7). 한도가 모자라면 마지막 당첨자들이
  -- '한도 부족' 으로 아무것도 못 받는다 — 공개 전에 막는다. 여기서 한도를 **올리지 않는다**.
  if v_vouchers > coalesce(v_quota, 0) then
    v_p := v_p || jsonb_build_object('code', 'quota_short', 'field', 'venueId',
      'message', format('필요한 이용권 %s장이 매장 발급 한도 %s장을 넘습니다', v_vouchers, coalesce(v_quota, 0)));
  end if;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_p) = 0,
    'problems', v_p,
    'summary', jsonb_build_object(
      'status', v_c.status, 'slug', v_c.slug, 'title', v_c.title,
      'totalCards', v_cards, 'prizeCards', v_prize, 'totalVouchers', v_vouchers,
      'venueQuota', coalesce(v_quota, 0), 'venueApproved', v_approved));
end $fn$;

revoke all on function public._event_campaign_problems(uuid) from public, anon, authenticated;
grant execute on function public._event_campaign_problems(uuid) to service_role;

-- ── ③ 목록 ──────────────────────────────────────────────────────────────────
-- ⚠ **집계만** 내려보낸다. 자리별 등급(event_cards.tier + idx)은 어떤 경로로도 나가지 않는다 —
--    관리자에게도 진행 중 미개봉 당첨 위치를 공개하지 않는다(§6 카드판).
create or replace function public.admin_list_event_campaigns()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare v_out jsonb;
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '권한 없음: 관리자만 이벤트 목록을 조회할 수 있습니다';
  end if;

  select coalesce(jsonb_agg(row_to_json(r)::jsonb order by r."createdAt" desc), '[]'::jsonb)
    into v_out
  from (
    select
      c.id, c.slug, c.title, c.subtitle, c.status,
      c.created_at as "createdAt",
      c.starts_at   as "startsAt",
      c.ends_at     as "endsAt",
      c.venue_id    as "venueId",
      v.name        as "venueName",
      c.ticket_venue_id as "ticketVenueId",
      tv.name       as "ticketVenueName",
      c.voucher_title as "voucherTitle",
      c.voucher_expires_at as "voucherExpiresAt",
      c.issued_by   as "issuedBy",
      coalesce(ip.nickname, ip.name) as "issuedByName",
      coalesce(v.voucher_quota, 0)   as "venueQuota",
      coalesce(v.voucher_issue_approved, false) as "venueApproved",
      coalesce(cc.total, 0)          as "totalCards",
      coalesce(cc.opened, 0)         as "openedCards",
      coalesce(cc.total, 0) - coalesce(cc.opened, 0) as "remainCards",
      coalesce(cc.prize, 0)          as "prizeCards",
      coalesce(cc.prize_left, 0)     as "remainPrizeCards",
      coalesce(cc.vouchers, 0)       as "totalVouchers",
      coalesce(cc.vouchers_won, 0)   as "wonVouchers",
      coalesce(tk.issued, 0)         as "ticketsIssued",
      coalesce(tk.used, 0)           as "ticketsUsed",
      coalesce(sv.issued, 0)         as "vouchersIssued",
      coalesce(sv.used, 0)           as "vouchersUsed"
    from public.event_campaigns c
    left join public.venues   v  on v.id  = c.venue_id
    left join public.venues   tv on tv.id = c.ticket_venue_id
    left join public.profiles ip on ip.id = c.issued_by
    left join lateral (
      select count(*) as total,
             count(*) filter (where opened_at is not null) as opened,
             count(*) filter (where tier is not null) as prize,
             count(*) filter (where tier is not null and opened_at is null) as prize_left,
             coalesce(sum(voucher_count), 0) as vouchers,
             coalesce(sum(voucher_count) filter (where opened_at is not null), 0) as vouchers_won
        from public.event_cards where campaign_id = c.id
    ) cc on true
    left join lateral (
      select count(*) as issued, count(*) filter (where used_at is not null) as used
        from public.event_tickets where campaign_id = c.id
    ) tk on true
    -- 구조적 참조(⓪)로 센다. note 파싱으로 세면 제목에 '·' 하나만 들어가도 숫자가 틀린다.
    left join lateral (
      select count(*) as issued, count(*) filter (where used_at is not null) as used
        from public.store_vouchers where event_campaign_id = c.id
    ) sv on true
  ) r;

  return v_out;
end $fn$;

revoke all on function public.admin_list_event_campaigns() from public, anon;
grant execute on function public.admin_list_event_campaigns() to authenticated, service_role;

-- ── ④ 초안 생성 ─────────────────────────────────────────────────────────────
create or replace function public.admin_create_event_campaign(
  p_venue_id uuid, p_slug text, p_title text, p_subtitle text default null,
  p_starts_at timestamptz default null, p_ends_at timestamptz default null,
  p_ticket_venue_id uuid default null,
  p_voucher_title text default '매장이용권', p_voucher_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_id uuid; v_slug text; v_title text; v_vt text;
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '권한 없음: 관리자만 이벤트를 만들 수 있습니다';
  end if;

  v_slug  := lower(btrim(coalesce(p_slug, '')));
  v_title := btrim(coalesce(p_title, ''));
  v_vt    := btrim(coalesce(p_voucher_title, ''));

  -- 허용 목록으로 판단한다 — `?event=<slug>` 로 밖에서 들어오는 값이라 거부 목록이면 빠뜨린 글자가 곧 구멍이다.
  -- ⚠ `src/api/events.ts` 의 `isEventSlug` 와 **같은 집합이 아니다**: 그쪽은 대문자도 통과시키고
  --   여기는 소문자만 받는다(=서버가 더 좁다). 의도한 것이다 — 주소는 대소문자로 갈리면 안 되고,
  --   위에서 `lower()` 로 내려 받으므로 서버가 만든 slug 는 언제나 앱의 집합 **안에** 들어간다
  --   (좁은 쪽이 서버라 "서버가 만든 걸 앱이 거부" 하는 방향은 발생하지 않는다).
  --   화면도 대문자를 미리 거절한다(EventOpsAdmin.tsx 의 소문자 안내).
  if v_slug !~ '^[a-z0-9][a-z0-9_-]{0,63}$' then
    raise exception '링크 주소(slug)는 영문 소문자·숫자로 시작하고 영문 소문자·숫자·-·_ 만 쓸 수 있습니다 (최대 64자)';
  end if;
  if v_title = '' then raise exception '이벤트 제목을 입력해 주세요'; end if;
  if v_vt = ''    then raise exception '경품 이용권 이름을 입력해 주세요'; end if;
  if p_venue_id is null then raise exception '매장을 선택해 주세요'; end if;
  if not exists (select 1 from public.venues where id = p_venue_id) then
    raise exception '매장을 찾을 수 없습니다';
  end if;
  if p_ticket_venue_id is not null
     and not exists (select 1 from public.venues where id = p_ticket_venue_id) then
    raise exception '참여권 지급 매장을 찾을 수 없습니다';
  end if;
  if p_starts_at is not null and p_ends_at is not null and p_starts_at >= p_ends_at then
    raise exception '종료 시각이 시작 시각보다 빠르거나 같습니다';
  end if;
  if exists (select 1 from public.event_campaigns where slug = v_slug) then
    raise exception '이미 쓰고 있는 링크 주소입니다 — 다른 주소를 입력해 주세요';
  end if;

  -- §7 — ticket_venue_id = NULL 은 '모든 매장 출석' 이다. 그런 판이 둘 이상 살아 있으면
  -- 출석 **한 번**에 판마다 참여권이 각각 생긴다. 사업 정책이 정해지기 전까지 그 모호한 중복을 막는다.
  -- (기존 로티 캠페인은 그대로 둔다 — 새로 만드는 쪽만 매장을 지정하게 한다.)
  if p_ticket_venue_id is null and exists (
    select 1 from public.event_campaigns
     where ticket_venue_id is null and status in ('draft', 'live')
  ) then
    raise exception '참여권을 모든 매장 출석에 주는 이벤트가 이미 있습니다 — 이 이벤트는 참여권 지급 매장을 지정해 주세요';
  end if;

  insert into public.event_campaigns(
    slug, venue_id, issued_by, title, subtitle, status,
    starts_at, ends_at, ticket_venue_id, voucher_title, voucher_expires_at)
  values (
    v_slug, p_venue_id,
    -- 발급 주체는 **서버가 유도한다**. 클라이언트가 보낸 이름·id 를 믿지 않는다(§6 초안).
    auth.uid(),
    v_title, nullif(btrim(coalesce(p_subtitle, '')), ''), 'draft',
    p_starts_at, p_ends_at, p_ticket_venue_id, v_vt, p_voucher_expires_at)
  returning id into v_id;

  perform public._audit('admin_create_event_campaign', v_id::text,
    jsonb_build_object('slug', v_slug, 'venue_id', p_venue_id, 'title', v_title,
                       'ticket_venue_id', p_ticket_venue_id));

  return jsonb_build_object('id', v_id, 'slug', v_slug, 'status', 'draft');
end $fn$;

revoke all on function public.admin_create_event_campaign(uuid, text, text, text, timestamptz, timestamptz, uuid, text, timestamptz) from public, anon;
grant execute on function public.admin_create_event_campaign(uuid, text, text, text, timestamptz, timestamptz, uuid, text, timestamptz) to authenticated, service_role;

-- ── ⑤ 카드판 구성 — **서버 셔플** ────────────────────────────────────────────
-- p_tiers = [{"tier":1,"cards":1,"vouchers":10}, {"tier":4,"cards":11,"vouchers":1}, …]
-- 클라이언트는 **수량만** 보낸다. 자리 배치를 보내면 당첨 자리를 고를 수 있다.
create or replace function public.admin_compose_event_cards(
  p_campaign_id uuid, p_total int, p_tiers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_c record; v_prize int; v_vouchers int; v_rows int;
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '권한 없음: 관리자만 카드판을 구성할 수 있습니다';
  end if;

  select * into v_c from public.event_campaigns where id = p_campaign_id for update;
  if not found then raise exception '캠페인을 찾을 수 없습니다'; end if;
  -- 공개 이후 위치별 등급 배치와 이미 열린 결과는 바꿀 수 없다(§6). 다음 행사는 **새 회차**다.
  if v_c.status <> 'draft' then
    raise exception '초안(준비 중) 상태에서만 카드판을 구성할 수 있습니다 — 이미 공개된 판의 배치는 바꿀 수 없습니다';
  end if;

  if p_total is null or p_total < 1 or p_total > 1000 then
    raise exception '총 카드 수는 1~1000장 사이여야 합니다';
  end if;
  if jsonb_typeof(coalesce(p_tiers, 'null'::jsonb)) is distinct from 'array'
     or jsonb_array_length(p_tiers) = 0 then
    raise exception '등급 구성을 한 줄 이상 입력해 주세요';
  end if;

  -- 타입 검사를 **먼저** 끝낸다. 캐스팅과 범위 검사를 한 OR 안에 섞으면 평가 순서 보장이 없어
  -- 문자열이 들어왔을 때 캐스팅이 먼저 터지고 우리 문장 대신 Postgres 내부 오류가 나간다.
  if exists (
    select 1 from jsonb_array_elements(p_tiers) e
     where jsonb_typeof(e->'tier') is distinct from 'number'
        or jsonb_typeof(e->'cards') is distinct from 'number'
        or jsonb_typeof(e->'vouchers') is distinct from 'number'
  ) then
    raise exception '등급·카드 수·이용권 장수는 숫자여야 합니다';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_tiers) e
     where (e->>'tier')::numeric     <> trunc((e->>'tier')::numeric)
        or (e->>'cards')::numeric    <> trunc((e->>'cards')::numeric)
        or (e->>'vouchers')::numeric <> trunc((e->>'vouchers')::numeric)
  ) then
    raise exception '등급·카드 수·이용권 장수는 정수여야 합니다 (소수 불가)';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_tiers) e
     where (e->>'tier')::int not between 1 and 4
        or (e->>'cards')::int < 0 or (e->>'cards')::int > p_total
        or (e->>'vouchers')::int < 0 or (e->>'vouchers')::int > 100
  ) then
    raise exception '등급은 1~4등, 카드 수는 0~총 카드 수, 이용권은 0~100장 범위여야 합니다';
  end if;
  if (select count(distinct (e->>'tier')::int) from jsonb_array_elements(p_tiers) e)
     <> (select count(*) from jsonb_array_elements(p_tiers) e) then
    raise exception '같은 등급이 두 번 들어 있습니다 — 등급당 한 줄로 입력해 주세요';
  end if;
  -- 당첨인데 이용권 0장이면 손님은 '당첨' 을 보고 아무것도 못 받는다.
  if exists (
    select 1 from jsonb_array_elements(p_tiers) e
     where (e->>'cards')::int > 0 and (e->>'vouchers')::int < 1
  ) then
    raise exception '당첨 등급의 이용권 장수는 1장 이상이어야 합니다';
  end if;

  select coalesce(sum((e->>'cards')::int), 0),
         coalesce(sum((e->>'cards')::int * (e->>'vouchers')::int), 0)
    into v_prize, v_vouchers
    from jsonb_array_elements(p_tiers) e;
  if v_prize > p_total then
    raise exception '등급별 카드 수의 합(%장)이 총 카드 수(%장)보다 많습니다', v_prize, p_total;
  end if;
  if v_prize = 0 then
    raise exception '당첨 카드가 0장입니다 — 전부 꽝인 판은 만들 수 없습니다';
  end if;

  -- 초안이므로 개봉 이력이 있을 수 없다. 그래도 방어적으로 확인한다 —
  -- 손으로 status 를 draft 로 되돌린 판이 있으면 여기서 이력이 지워진다.
  if exists (select 1 from public.event_cards
              where campaign_id = p_campaign_id and opened_at is not null) then
    raise exception '이미 열린 카드가 있는 판입니다 — 배치를 다시 만들 수 없습니다';
  end if;

  delete from public.event_cards where campaign_id = p_campaign_id;

  -- ⚠ 자리 배치는 **서버가** 무작위로 만든다. 자리 번호와 등급 사이에 규칙이 없어야 한다.
  --   (아래 한 줄의 문자열을 자가검사가 찾는다 — 그래서 이 주석에는 그 표현을 쓰지 않는다.
  --    prosrc 에는 주석도 들어가므로, 주석이 검사를 대신 통과시켜 주면 검사가 무의미해진다.)
  with prizes as (
    select (e->>'tier')::int as tier, (e->>'vouchers')::int as cnt
      from jsonb_array_elements(p_tiers) e,
           lateral generate_series(1, (e->>'cards')::int)
  ),
  padded as (
    select tier, cnt from prizes
    union all
    select null::int, 0 from generate_series(1, p_total - v_prize)
  ),
  shuffled as (
    select row_number() over (order by random()) as idx, tier, cnt from padded
  )
  insert into public.event_cards(campaign_id, idx, tier, voucher_count)
  select p_campaign_id, idx, tier, cnt from shuffled;
  get diagnostics v_rows = row_count;

  -- ⚠ 감사기록에 **자리별 등급을 남기지 않는다**. 남기면 audit_log 를 읽을 수 있는 관리자가
  --   미개봉 당첨 위치를 전부 알게 된다 — §6·§10 이 금지한 바로 그 유출이다.
  perform public._audit('admin_compose_event_cards', p_campaign_id::text,
    jsonb_build_object('total', v_rows, 'prize_cards', v_prize, 'total_vouchers', v_vouchers,
                       'tiers', p_tiers));

  return jsonb_build_object('campaignId', p_campaign_id, 'totalCards', v_rows,
                            'prizeCards', v_prize, 'totalVouchers', v_vouchers);
end $fn$;

revoke all on function public.admin_compose_event_cards(uuid, int, jsonb) from public, anon;
grant execute on function public.admin_compose_event_cards(uuid, int, jsonb) to authenticated, service_role;

-- ── ⑥ 검증(읽기) ────────────────────────────────────────────────────────────
create or replace function public.admin_validate_event_campaign(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '권한 없음: 관리자만 이벤트를 검증할 수 있습니다';
  end if;
  return public._event_campaign_problems(p_campaign_id);
end $fn$;

revoke all on function public.admin_validate_event_campaign(uuid) from public, anon;
grant execute on function public.admin_validate_event_campaign(uuid) to authenticated, service_role;

-- ── ⑦ 공개 (draft → live, 원자적) ───────────────────────────────────────────
create or replace function public.admin_publish_event_campaign(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_c record; v_chk jsonb; v_rows int;
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '권한 없음: 관리자만 이벤트를 공개할 수 있습니다';
  end if;

  -- 행을 먼저 잠근다 — 두 관리자가 동시에 눌러도 한 번만 공개된다.
  select * into v_c from public.event_campaigns where id = p_campaign_id for update;
  if not found then raise exception '캠페인을 찾을 수 없습니다'; end if;
  if v_c.status = 'live'  then raise exception '이미 진행 중인 이벤트입니다'; end if;
  if v_c.status = 'ended' then raise exception '이미 종료된 이벤트입니다 — 다음 회차는 새 캠페인으로 만들어 주세요'; end if;

  -- ⚠ 검증은 **잠금 안에서 다시** 돈다. 화면에서 통과했더라도 그 사이 매장 한도가 다른 발급으로
  --   빠져나갔을 수 있다(§7 "다른 발급 경로가 한도를 소진"). 화면의 통과는 약속이 아니다.
  v_chk := public._event_campaign_problems(p_campaign_id);
  if not (v_chk->>'ok')::boolean then
    raise exception '공개할 수 없습니다: %', coalesce(
      (select string_agg(p->>'message', ' / ') from jsonb_array_elements(v_chk->'problems') p),
      '검증에 실패했습니다');
  end if;

  update public.event_campaigns
     set status = 'live', starts_at = coalesce(starts_at, now())
   where id = p_campaign_id and status = 'draft';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception '공개에 실패했습니다 — 상태가 방금 바뀌었습니다. 목록을 새로고침해 주세요';
  end if;

  perform public._audit('admin_publish_event_campaign', p_campaign_id::text,
    jsonb_build_object('slug', v_c.slug, 'summary', v_chk->'summary'));

  return jsonb_build_object('id', p_campaign_id, 'slug', v_c.slug, 'status', 'live');
end $fn$;

revoke all on function public.admin_publish_event_campaign(uuid) from public, anon;
grant execute on function public.admin_publish_event_campaign(uuid) to authenticated, service_role;

-- ── ⑧ 종료 ──────────────────────────────────────────────────────────────────
-- 종료해도 카드·참여권·발급 이용권·감사 이력은 **그대로 둔다**(§6 상태·복사). 지우는 경로는 없다.
create or replace function public.admin_end_event_campaign(p_campaign_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_c record; v_rows int;
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '권한 없음: 관리자만 이벤트를 종료할 수 있습니다';
  end if;

  select * into v_c from public.event_campaigns where id = p_campaign_id for update;
  if not found then raise exception '캠페인을 찾을 수 없습니다'; end if;
  if v_c.status = 'draft' then raise exception '아직 공개되지 않은 초안입니다 — 종료 대신 삭제를 쓰세요'; end if;
  if v_c.status = 'ended' then raise exception '이미 종료된 이벤트입니다'; end if;

  update public.event_campaigns set status = 'ended' where id = p_campaign_id and status = 'live';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception '종료에 실패했습니다 — 상태가 방금 바뀌었습니다. 목록을 새로고침해 주세요';
  end if;

  perform public._audit('admin_end_event_campaign', p_campaign_id::text,
    jsonb_build_object('slug', v_c.slug, 'reason', left(btrim(coalesce(p_reason, '')), 500)));

  return jsonb_build_object('id', p_campaign_id, 'slug', v_c.slug, 'status', 'ended');
end $fn$;

revoke all on function public.admin_end_event_campaign(uuid, text) from public, anon;
grant execute on function public.admin_end_event_campaign(uuid, text) to authenticated, service_role;

-- ── ⑨ 초안 삭제 — 참조·발급·개봉 이력이 **하나도 없을 때만** ────────────────────
create or replace function public.admin_delete_event_draft(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_c record;
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '권한 없음: 관리자만 초안을 삭제할 수 있습니다';
  end if;

  select * into v_c from public.event_campaigns where id = p_campaign_id for update;
  if not found then raise exception '캠페인을 찾을 수 없습니다'; end if;
  if v_c.status <> 'draft' then
    raise exception '공개되었거나 종료된 이벤트는 삭제할 수 없습니다 — 결과·이용권·감사 이력을 보존합니다';
  end if;
  if exists (select 1 from public.event_cards
              where campaign_id = p_campaign_id and opened_at is not null) then
    raise exception '이미 열린 카드가 있어 삭제할 수 없습니다';
  end if;
  if exists (select 1 from public.event_tickets where campaign_id = p_campaign_id) then
    raise exception '이미 지급된 참여권이 있어 삭제할 수 없습니다';
  end if;
  -- 구조적 참조(⓪)로 확인한다. note 파싱으로 확인하면 못 찾은 이용권이 고아가 된다.
  if exists (select 1 from public.store_vouchers where event_campaign_id = p_campaign_id) then
    raise exception '이 이벤트로 발급된 이용권이 있어 삭제할 수 없습니다';
  end if;

  perform public._audit('admin_delete_event_draft', p_campaign_id::text,
    jsonb_build_object('slug', v_c.slug, 'title', v_c.title, 'venue_id', v_c.venue_id));

  delete from public.event_cards where campaign_id = p_campaign_id;
  delete from public.event_campaigns where id = p_campaign_id;

  return jsonb_build_object('id', p_campaign_id, 'deleted', true);
end $fn$;

revoke all on function public.admin_delete_event_draft(uuid) from public, anon;
grant execute on function public.admin_delete_event_draft(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ── 자가검사 ─────────────────────────────────────────────────────────────────
-- 존재·ACL 만 보면 핵심 동작이 빠져도 통과한다 → prosrc 를 **strpos** 로 본다.
-- (LIKE 는 '_' 가 단일문자 와일드카드라 의도보다 느슨해진다 — 20260911i·k 가 같은 함정을 기록.)
-- 여기서 찾는 문자열이 각 함수의 본문 주석에 등장하지 않는지 확인해 두었다.
do $check$
declare
  v_oid oid; v_cfg text[]; v_acl aclitem[]; v_src text; v_n int;
  v_fn text;
  -- ⚠ 이름으로만 찾는다. `pg_get_function_identity_arguments` 는 **파라미터 이름까지** 돌려주므로
  --    ('p_user_id uuid, p_reason text') 타입만 적어 비교하면 **영원히 일치하지 않아** 자가검사가
  --    '함수가 없다' 로 오탐한다(컨테이너 실행으로 확인 — 20260911k 에 같은 함정이 남아 있다).
  --    대신 오버로드가 하나뿐인지를 따로 확인해 이름 매칭의 모호함을 없앤다.
  v_mut text[] := array[
    'admin_create_event_campaign', 'admin_compose_event_cards', 'admin_validate_event_campaign',
    'admin_list_event_campaigns', 'admin_publish_event_campaign', 'admin_end_event_campaign',
    'admin_delete_event_draft', 'open_event_card'
  ];
  i int;
begin
  -- ① 공통 계약: 존재 · SECURITY DEFINER · search_path · ACL
  for i in 1 .. array_length(v_mut, 1) loop
    v_fn := v_mut[i];
    select count(*) into v_n
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;
    if v_n = 0 then
      raise exception 'ABORT: public.% 가 생성되지 않았습니다', v_fn;
    end if;
    if v_n > 1 then
      raise exception 'ABORT: public.% 오버로드가 %개입니다 — 옛 시그니처가 남아 있으면 PostgREST 가 어느 쪽을 부를지 모른다', v_fn, v_n;
    end if;
    select p.oid, p.proconfig, p.proacl, p.prosrc into v_oid, v_cfg, v_acl, v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;
    if not (select prosecdef from pg_proc where oid = v_oid) then
      raise exception 'ABORT: % 가 SECURITY DEFINER 가 아닙니다', v_fn;
    end if;
    if v_cfg is null or not exists (select 1 from unnest(v_cfg) c where c like 'search_path=%pg_temp%') then
      raise exception 'ABORT: % 의 search_path 가 public, pg_temp 로 고정되지 않았습니다', v_fn;
    end if;
    if v_acl is null then
      raise exception 'ABORT: % 의 EXECUTE 가 PUBLIC 기본 GRANT 상태입니다(REVOKE 누락 — from anon 만으로는 무효)', v_fn;
    end if;
    if has_function_privilege('anon', v_oid, 'execute') then
      raise exception 'ABORT: anon 이 % 를 실행할 수 있습니다', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_oid, 'execute') then
      raise exception 'ABORT: authenticated 가 % 를 실행할 수 없습니다(관리자 화면이 죽는다)', v_fn;
    end if;
    -- 관리자 가드는 NULL-safe 여야 한다. open_event_card 는 손님 함수라 제외.
    if v_fn <> 'open_event_card' then
      if strpos(v_src, 'my_role() is distinct from ''admin''::user_role') = 0 then
        raise exception 'ABORT: % 의 관리자 가드가 NULL-safe 가 아닙니다(비로그인에서 가드가 열린다)', v_fn;
      end if;
      if v_src ~ 'my_role\(\)\s*<>\s*''admin''' then
        raise exception 'ABORT: % 에 `my_role() <> ''admin''` 가 남아 있습니다', v_fn;
      end if;
    end if;
  end loop;

  -- ② 내부 검증 함수는 클라이언트 롤에서 **직접 호출 불가**여야 한다
  select p.oid, p.prosrc into v_oid, v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_event_campaign_problems';
  if v_oid is null then raise exception 'ABORT: _event_campaign_problems 가 없습니다'; end if;
  if has_function_privilege('anon', v_oid, 'execute')
     or has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception 'ABORT: _event_campaign_problems 가 클라이언트 롤에 열려 있습니다';
  end if;
  if strpos(v_src, 'period_inverted') = 0 or strpos(v_src, 'quota_short') = 0
     or strpos(v_src, 'voucher_expired') = 0 or strpos(v_src, 'tier_voucher_mixed') = 0
     or strpos(v_src, 'no_cards') = 0 then
    raise exception 'ABORT: 검증에서 기간 역전·한도 부족·경품 만료·등급 혼재·카드 없음 중 하나가 빠졌습니다';
  end if;

  -- ③ 발급 주체는 서버 유도 · 셔플은 서버
  --
  -- ⚠ 파라미터를 `prosrc` 로 찾으면 **절대 걸리지 않는다.** prosrc 는 `declare` 부터의 본문이라
  --   시그니처가 들어 있지 않다(컨테이너 실측: strpos(prosrc,'p_tiers')=671 인데
  --   strpos(prosrc,'p_tiers jsonb')=0 — 타입이 붙은 형태는 본문에 없다).
  --   그래서 '파라미터가 늘었는가' 는 반드시 pg_get_function_arguments 로 본다.
  --   예전 두 줄(`strpos(v_src,'p_issued_by')` · `strpos(v_src,'p_cards jsonb')`)은
  --   구조적으로 발화 불가능한 **죽은 검사**였다 — 통과가 곧 거짓 안심이었다.
  select p.oid, p.prosrc into v_oid, v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_create_event_campaign';
  if strpos(v_src, 'auth.uid()') = 0 then
    raise exception 'ABORT: 발급 주체(issued_by)가 서버에서 유도되지 않습니다';
  end if;
  if pg_get_function_arguments(v_oid) ~* '(issued|issuer|actor|admin_id)' then
    raise exception 'ABORT: 발급 주체를 클라이언트 파라미터로 받고 있습니다 — 시그니처: %',
      pg_get_function_arguments(v_oid);
  end if;
  if (select pronargs from pg_proc where oid = v_oid) <> 9 then
    raise exception 'ABORT: admin_create_event_campaign 의 파라미터가 9개가 아닙니다(%) — 시그니처: %',
      (select pronargs from pg_proc where oid = v_oid), pg_get_function_arguments(v_oid);
  end if;
  if strpos(v_src, 'ticket_venue_id is null and exists') = 0 then
    raise exception 'ABORT: ticket_venue_id=NULL 캠페인 중복 활성화 가드가 없습니다(출석 1회로 여러 판 참여권이 생긴다)';
  end if;

  select p.oid, p.prosrc into v_oid, v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_compose_event_cards';
  if strpos(v_src, 'row_number() over (order by random()) as idx') = 0 then
    raise exception 'ABORT: 카드 셔플이 서버에서 이뤄지지 않습니다(클라이언트가 당첨 자리를 고를 수 있다)';
  end if;
  -- 자리 배치를 받는 파라미터가 하나라도 늘면 만든 사람이 당첨 자리를 고를 수 있다.
  if pg_get_function_identity_arguments(v_oid) <> 'p_campaign_id uuid, p_total integer, p_tiers jsonb' then
    raise exception 'ABORT: admin_compose_event_cards 의 시그니처가 (p_campaign_id uuid, p_total integer, p_tiers jsonb) 가 아닙니다 — 현재: %',
      pg_get_function_identity_arguments(v_oid);
  end if;
  if strpos(v_src, 'v_c.status <> ''draft''') = 0 then
    raise exception 'ABORT: 공개된 판의 배치를 바꿀 수 있습니다(draft 가드 누락)';
  end if;

  -- ④ 공개는 잠금 안에서 다시 검증한다
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_publish_event_campaign';
  if strpos(v_src, 'for update') = 0 then
    raise exception 'ABORT: 공개가 캠페인 행을 잠그지 않습니다(동시 공개 경합)';
  end if;
  if strpos(v_src, '_event_campaign_problems') = 0 then
    raise exception 'ABORT: 공개가 검증을 다시 돌지 않습니다(화면 통과가 곧 공개가 된다)';
  end if;
  if strpos(v_src, 'status = ''draft''') = 0 or strpos(v_src, 'get diagnostics') = 0 then
    raise exception 'ABORT: 공개가 draft 조건부 UPDATE + 행 수 확인으로 원자적이지 않습니다';
  end if;

  -- ⑤ 초안 삭제는 세 이력 전부를 본다
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_delete_event_draft';
  if strpos(v_src, 'opened_at is not null') = 0
     or strpos(v_src, 'public.event_tickets where campaign_id') = 0
     or strpos(v_src, 'event_campaign_id = p_campaign_id') = 0 then
    raise exception 'ABORT: 초안 삭제가 개봉·참여권·발급 이용권 이력 중 하나를 보지 않습니다';
  end if;

  -- ⑥ 손님 경로가 그대로인가 + 구조적 참조를 채우는가
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'open_event_card';
  if strpos(v_src, 'event_campaign_id, event_card_idx') = 0 then
    raise exception 'ABORT: open_event_card 가 당첨↔이용권 구조적 참조를 남기지 않습니다(note 파싱으로 되돌아간다)';
  end if;
  if strpos(v_src, 'for update skip locked') = 0
     or strpos(v_src, 'identity_gate_on()') = 0
     or strpos(v_src, 'voucher_quota = voucher_quota - v_card.voucher_count') = 0
     or strpos(v_src, '이미 열린 카드예요') = 0 then
    raise exception 'ABORT: open_event_card 재정의에서 20260906b 의 불변식(참여권 잠금·본인인증·한도 차감·중복 개봉 차단)이 사라졌습니다';
  end if;

  -- ⑦ 등급 유출 표면이 넓어지지 않았는가 — event_cards 는 여전히 아무 클라이언트 롤도 못 읽는다
  if has_table_privilege('anon', 'public.event_cards', 'select')
     or has_table_privilege('authenticated', 'public.event_cards', 'select') then
    raise exception 'ABORT: event_cards 가 클라이언트 롤에 열렸습니다(미개봉 등급 위치가 샌다)';
  end if;

  -- ⑧ 구조적 참조 컬럼
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'store_vouchers'
                    and column_name = 'event_campaign_id') then
    raise exception 'ABORT: store_vouchers.event_campaign_id 가 없습니다';
  end if;
  if not exists (
    select 1 from pg_constraint c
     where c.conrelid = 'public.store_vouchers'::regclass and c.contype = 'f'
       and c.confrelid = 'public.event_campaigns'::regclass
       and c.confdeltype = 'n'   -- on delete set null
  ) then
    raise exception 'ABORT: store_vouchers → event_campaigns FK 가 ON DELETE SET NULL 이 아닙니다(캠페인 삭제가 손님 이용권을 지운다)';
  end if;
end $check$;

-- ROLLBACK
--   drop function if exists public.admin_delete_event_draft(uuid);
--   drop function if exists public.admin_end_event_campaign(uuid, text);
--   drop function if exists public.admin_publish_event_campaign(uuid);
--   drop function if exists public.admin_validate_event_campaign(uuid);
--   drop function if exists public.admin_compose_event_cards(uuid, int, jsonb);
--   drop function if exists public.admin_create_event_campaign(uuid, text, text, text, timestamptz, timestamptz, uuid, text, timestamptz);
--   drop function if exists public.admin_list_event_campaigns();
--   drop function if exists public._event_campaign_problems(uuid);
--   -- open_event_card 는 20260906b 의 정의를 그대로 다시 실행하고
--   --   revoke all on function public.open_event_card(text, int) from public, anon;
--   --   grant execute on function public.open_event_card(text, int) to authenticated, service_role;
--   -- 두 컬럼은 **지우지 않는다**(발급된 이용권의 원천 참조가 사라진다). 꼭 되돌려야 한다면:
--   --   alter table public.store_vouchers drop column if exists event_card_idx;
--   --   alter table public.store_vouchers drop column if exists event_campaign_id;
