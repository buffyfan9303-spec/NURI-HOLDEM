-- ============================================================================
-- 20260912d — 캠페인 공개/숨김을 lifecycle 과 **분리**한다 (§8-2·§8-3)
--
-- APPLIED 2026-09-13: event_voucher_bundle_20260913_hardened.
-- Activation and campaign data are separate; do not re-run this file on production.
--    선행: `20260912c_admin_event_ops.sql`(이 파일이 그 RPC 를 재정의한다). 파일명 순서대로 돌린다.
--
-- ── 왜 필요한가 ──────────────────────────────────────────────────────────────
--   관리자에게 세 가지가 있는데 저장 자리가 둘뿐이었다:
--     ① 사이트 이벤트 메뉴 표시 → `app_settings.event_menu_visible` (이 파일은 건드리지 않는다.
--        기존 set_app_setting RPC 를 그대로 쓴다 — 새 저장소를 만들지 않는다)
--     ② 개별 캠페인 공개/숨김 → **저장할 곳이 없었다** ← 이 파일이 만든다
--     ③ 행사 종료        → `status = 'ended'` (20260912c)
--   ②를 `live → draft` 로 구현하면 안 된다. draft 는 '카드 배치를 아직 바꿀 수 있는 상태'라
--   (20260912c 의 admin_compose_event_cards 가 draft 에서만 동작한다) **공개했던 판의 배치가
--   다시 편집 가능**해진다 — 이미 열린 결과가 있는 판에서 그건 결과 조작 경로다.
--   그래서 공개 여부는 lifecycle 과 **다른 축**(`hidden_at`)에 둔다.
--
-- ── 숨김의 계약 (문서가 지정한 그대로) ────────────────────────────────────────
--   · 일반 이용자에게 비공개 — event_board 가 NULL 을 준다(다른 캠페인으로 보내지 않고,
--     재고·등급·제목 어느 것도 흘리지 않는다).
--   · **새 참여 일시중지** — 카드 열기 거절 + 출석 시 참여권 미지급.
--   · 관리자 미리보기 가능.
--   · **기존 이력 보존** — 카드·참여권·발급된 이용권·감사기록을 한 줄도 지우지 않는다.
--     ⚠ store_vouchers 에는 아무 것도 하지 않는다. '내 당첨·내 이용권' 화면은 이 파일 전후가 같다
--     (자가검사 ⑨가 authenticated 의 store_vouchers select 권한이 남아 있는지 확인한다).
--   · A매장을 숨겨도 B/C/D 매장 캠페인은 그대로 — 판정이 전부 **캠페인 행 단위**다.
--
-- ── 시간 경계를 서버·앱이 같게 맞춘다 (§8-3) ──────────────────────────────────
--   **시작 시각 포함, 종료 시각 미포함.** 20260906b 는 `now() > ends_at` 이라 종료 시각 **정각에**
--   한 번 더 열 수 있었고, 참여권 지급은 `now() <= ends_at` 이었다. 앱의 판정(`src/lib/eventState.ts`)은
--   `now >= end` 를 종료로 본다 — 어긋나면 화면은 '끝났다' 는데 서버는 받아 준다(또는 그 반대).
--   이 파일에서 서버를 `>=` / `<` 로 맞춘다.
--
-- ── 호환 순서 (문서 §1-5) ────────────────────────────────────────────────────
--   전부 **추가**다. 지우는 컬럼·함수·정책이 없다. 미적용 상태의 앱은 `hiddenAt` 이 없는 응답을
--   받고 그것을 '공개' 로 읽으며(undefined ≠ 숨김), 숨기기 RPC 는 PGRST202 로 실패해
--   화면이 '서버 미적용' 이라고 말한다(src/api/adminEvents.ts 의 EventAdminRpcMissingError).
--   반대로 이 파일만 적용되고 앱이 옛 코드여도 동작이 같다 — 새 컬럼을 안 읽을 뿐이다.
--
-- 멱등: add column if not exists / create or replace / drop policy if exists. 두 번 실행해도 같다.
-- 롤백: 파일 맨 아래 ROLLBACK 절.
-- ============================================================================

-- ── 선행 확인 — 20260912c 가 먼저 적용됐는가 ────────────────────────────────
-- ⚠ 2026-09-13 격리 컨테이너(postgres:17) 실측으로 드러난 구멍을 막는다.
--   이 파일을 c 없이 단독 실행하면 **ABORT 없이 조용히 EXIT 0 으로 성공**했다.
--   아래 ⑤ open_event_card 가 `store_vouchers(…, event_campaign_id, event_card_idx)` 에
--   INSERT 하는데, plpgsql 본문은 **생성 시점에 이름 해석을 하지 않아** Postgres 가 안 잡는다.
--   맨 아래 자가검사도 못 잡는다 — `strpos(v_src, 'event_campaign_id, event_card_idx')` 는
--   **이 파일이 방금 써 넣은 함수 소스 문자열**만 보기 때문이다(항상 참).
--   결과: 마이그레이션은 성공한 것처럼 보이고, **첫 손님이 카드를 여는 순간** 런타임에 터진다.
--   그래서 문자열이 아니라 **카탈로그**를 본다.
do $order_guard$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'store_vouchers'
                    and column_name = 'event_campaign_id') then
    raise exception 'ABORT: 20260912c 를 먼저 적용해야 한다(store_vouchers.event_campaign_id 없음).';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'store_vouchers'
                    and column_name = 'event_card_idx') then
    raise exception 'ABORT: 20260912c 를 먼저 적용해야 한다(store_vouchers.event_card_idx 없음).';
  end if;
end $order_guard$;

-- ── ⓪ 공개 여부 축 (비파괴, nullable) ───────────────────────────────────────
alter table public.event_campaigns
  add column if not exists hidden_at timestamptz;
alter table public.event_campaigns
  add column if not exists hidden_reason text;
alter table public.event_campaigns
  add column if not exists hidden_by uuid references public.profiles(id) on delete set null;

comment on column public.event_campaigns.hidden_at is
  '손님에게 숨긴 시각. NULL = 공개. status 와 **별도 축**이다 — 숨겨도 status 는 live 그대로라 카드 배치가 다시 열리지 않는다. (20260912d)';
comment on column public.event_campaigns.hidden_reason is
  '숨긴 사유(관리자 입력, 감사기록과 짝). (20260912d)';

-- ── ① 테이블 읽기 정책 — 숨긴 판은 관리자만 ────────────────────────────────
-- 20260906b:84-86 은 `status <> 'draft'` 하나였다. 지금은 앱이 이 테이블을 직접 select 하지 않지만
-- (`grep -rn event_campaigns src/` 실측 0건), 정책이 곧 마지막 벽이라 여기서도 닫는다.
-- ⚠ NULL-safe: 비로그인은 my_role() 이 NULL 이라 `is not distinct from` 이 false → 닫힌다.
--    `=` 로 쓰면 NULL 이 되어 `hidden_at is null or NULL` = NULL, 행이 안 나온다(닫히긴 하지만
--    의도가 아니라 우연이다). 의도를 코드로 적는다.
drop policy if exists event_campaigns_read on public.event_campaigns;
create policy event_campaigns_read on public.event_campaigns
  for select using (
    status <> 'draft'
    and (hidden_at is null or public.my_role() is not distinct from 'admin'::user_role)
  );

-- ── ② 보드 조회 — 숨긴 판은 손님에게 NULL ──────────────────────────────────
-- 20260906b:128-176 정의 + 숨김 게이트 + 응답에 공개 여부 한 칸.
-- 나머지 한 줄도 바꾸지 않는다(등급 비공개·확률 표 근거값·참여권 집계 전부 그대로).
create or replace function public.event_board(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare v_c record; v_cards jsonb; v_tickets int := 0; v_left jsonb; v_total jsonb; v_vc jsonb;
begin
  select * into v_c from public.event_campaigns where slug = p_slug and status <> 'draft';
  if v_c is null then return null; end if;

  -- 숨긴 판은 관리자에게만. 손님에게는 **없는 것처럼** 보인다 — 제목·재고·등급 어느 것도 나가지 않고,
  -- 다른 캠페인으로 돌려보내지도 않는다(§8-4).
  if v_c.hidden_at is not null and public.my_role() is distinct from 'admin'::user_role then
    return null;
  end if;

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
    -- 여기까지 온 손님에게는 늘 false 다(숨김이면 위에서 NULL 로 끝났다). 관리자 미리보기만 true 를 본다.
    'hidden', v_c.hidden_at is not null,
    'venueId', v_c.venue_id, 'startsAt', v_c.starts_at, 'endsAt', v_c.ends_at,
    'voucherTitle', v_c.voucher_title,
    'cards', v_cards, 'myTickets', v_tickets,
    'remainByTier', v_left, 'totalByTier', v_total, 'voucherByTier', v_vc);
end $function$;

-- create or replace 는 ACL 을 PUBLIC 기본 GRANT 로 되돌린다 → 20260906b:181-182 를 그대로 다시 쓴다.
-- (읽기 함수라 anon 을 남긴다 — 비로그인도 보드를 본다.)
revoke all on function public.event_board(text) from public;
grant execute on function public.event_board(text) to anon, authenticated;

-- ── ③ 출석 → 참여권 — 숨긴 판에는 주지 않는다 ───────────────────────────────
-- 20260907d 의 최신 본문(오늘 첫 출석 가드) + 20260906c 의 재고 가드 + 숨김 가드 + 종료 경계 정정.
-- ⚠ 20260906b 본문으로 되돌아가지 않게 조심할 것 — 그 사이에 두 번 재정의됐다.
create or replace function public._grant_event_tickets()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- 같은 회원·매장·KST 날짜의 동시 출석을 한 줄로 세운다. 뒤 트랜잭션은 앞 커밋 뒤에
  -- 오늘 출석을 다시 조회하므로 EXISTS 검사와 INSERT 사이의 경합으로 참여권이 두 장 생기지 않는다.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    new.user_id::text || ':' || new.venue_id::text || ':' ||
    ((new.created_at at time zone 'Asia/Seoul')::date)::text,
    0
  ));

  -- 그 매장에 **오늘 이미 출석 기록이 있으면** 참여권을 주지 않는다(KST 기준, 방금 들어온 행은 제외).
  if exists (
    select 1 from public.checkins c
     where c.user_id = new.user_id
       and c.venue_id = new.venue_id
       and c.id <> new.id
       and (c.created_at at time zone 'Asia/Seoul')::date
           = (new.created_at at time zone 'Asia/Seoul')::date
  ) then
    return new;
  end if;

  insert into public.event_tickets(campaign_id, user_id, checkin_id)
  select c.id, new.user_id, new.id
    from public.event_campaigns c
   where c.status = 'live'
     -- 숨김 = 새 참여 일시중지. 쓸 수 없는 표를 쥐여 주지 않는다.
     and c.hidden_at is null
     and (c.ticket_venue_id is null or c.ticket_venue_id = new.venue_id)
     and (c.starts_at is null or now() >= c.starts_at)
     -- 종료 시각 **미포함** — 앱(src/lib/eventState.ts)과 같은 경계다.
     and (c.ends_at is null or now() < c.ends_at)
     and exists (
       select 1 from public.event_cards ec
        where ec.campaign_id = c.id and ec.opened_at is null
     )
  on conflict do nothing;
  return new;
exception when others then
  -- 이벤트 때문에 출석이 실패하면 안 된다 — 지급 실패는 삼키고 출석은 살린다(종전 동작 유지).
  return new;
end $$;

revoke all on function public._grant_event_tickets() from public, anon, authenticated;

-- ── ④ 카드 열기 — 숨김 거절 + 종료 경계 정정 ────────────────────────────────
-- 20260912c 의 본문(구조적 참조 두 컬럼 포함) + 숨김 가드 + `>=` 경계. 나머지 불변식은 그대로다:
-- 참여권 잠금(skip locked) · 본인인증 게이트 · 카드 행 잠금 · 발급 한도 차감 · 알림 실패 무시.
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
  -- 숨긴 판은 관리자에게도 참여를 열지 않는다 — 미리보기는 보는 것까지다.
  if v_c.hidden_at is not null then
    raise exception '지금은 참여할 수 없는 이벤트입니다';
  end if;
  if (v_c.starts_at is not null and now() < v_c.starts_at)
     or (v_c.ends_at is not null and now() >= v_c.ends_at) then
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

  select id into v_ticket from public.event_tickets
   where campaign_id = v_c.id and user_id = auth.uid() and used_at is null
   order by created_at limit 1 for update skip locked;
  if v_ticket is null then
    raise exception '참여권이 없습니다 — 매장 출석 QR을 찍으면 1장 지급됩니다';
  end if;

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
    select voucher_quota into v_quota from public.venues where id = v_c.venue_id for update;
    if coalesce(v_quota, 0) < v_card.voucher_count then
      raise exception '매장 발급 한도가 부족합니다 — 매장에 문의해 주세요';
    end if;
    update public.venues set voucher_quota = voucher_quota - v_card.voucher_count
     where id = v_c.venue_id;

    insert into public.store_vouchers(venue_id, issued_by, holder_user_id, holder_name,
                                      title, note, expires_at, issue_reason,
                                      event_campaign_id, event_card_idx)
    select v_c.venue_id, v_c.issued_by, auth.uid(), v_name,
           v_c.voucher_title,
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

revoke all on function public.open_event_card(text, int) from public, anon;
grant execute on function public.open_event_card(text, int) to authenticated, service_role;

-- ── ⑤ 숨기기 / 다시 공개 ────────────────────────────────────────────────────
-- lifecycle 을 건드리지 않는다 — status 는 'live' 그대로다. 그래서 다시 공개해도
-- 카드 배치·개봉 결과가 그대로 이어지고, draft 로 내렸을 때처럼 배치가 다시 열리지 않는다.
create or replace function public.admin_set_event_campaign_hidden(
  p_campaign_id uuid, p_hidden boolean, p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_c record; v_rows int; v_reason text; v_hidden_at timestamptz;
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '권한 없음: 관리자만 이벤트 공개 여부를 바꿀 수 있습니다';
  end if;
  if p_hidden is null then raise exception '숨김 여부를 지정해 주세요'; end if;

  select * into v_c from public.event_campaigns where id = p_campaign_id for update;
  if not found then raise exception '캠페인을 찾을 수 없습니다'; end if;
  if v_c.status = 'draft' then
    raise exception '아직 공개하지 않은 초안입니다 — 숨길 대상이 아닙니다';
  end if;
  if v_c.status = 'ended' then
    raise exception '이미 종료된 행사입니다 — 숨김 설정은 진행 중인 행사에만 씁니다';
  end if;

  v_reason := nullif(left(btrim(coalesce(p_reason, '')), 500), '');

  update public.event_campaigns
     set hidden_at     = case when p_hidden then coalesce(hidden_at, now()) end,
         hidden_reason = case when p_hidden then v_reason end,
         hidden_by     = case when p_hidden then auth.uid() end
   where id = p_campaign_id and status = 'live';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception '설정을 저장하지 못했습니다 — 상태가 방금 바뀌었습니다. 목록을 새로고침해 주세요';
  end if;

  perform public._audit('admin_set_event_campaign_hidden', p_campaign_id::text,
    jsonb_build_object('slug', v_c.slug, 'hidden', p_hidden, 'reason', v_reason));

  select hidden_at into v_hidden_at from public.event_campaigns where id = p_campaign_id;
  return jsonb_build_object('id', p_campaign_id, 'slug', v_c.slug,
                            'hidden', v_hidden_at is not null,
                            'hiddenAt', v_hidden_at);
end $fn$;

revoke all on function public.admin_set_event_campaign_hidden(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_event_campaign_hidden(uuid, boolean, text) to authenticated, service_role;

-- ── ⑥ 목록에 공개 여부를 싣는다 ─────────────────────────────────────────────
-- 20260912c 의 정의 + 두 칸. 나머지는 한 글자도 바꾸지 않는다(집계만 내려보내는 성질 포함 —
-- 자리별 등급은 여전히 어떤 경로로도 나가지 않는다).
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
      c.hidden_at     as "hiddenAt",
      c.hidden_reason as "hiddenReason",
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
    left join lateral (
      select count(*) as issued, count(*) filter (where used_at is not null) as used
        from public.store_vouchers where event_campaign_id = c.id
    ) sv on true
  ) r;

  return v_out;
end $fn$;

revoke all on function public.admin_list_event_campaigns() from public, anon;
grant execute on function public.admin_list_event_campaigns() to authenticated, service_role;

notify pgrst, 'reload schema';

-- ── 자가검사 ─────────────────────────────────────────────────────────────────
-- 존재·ACL 만 보면 핵심 동작이 빠져도 통과한다 → prosrc 를 **strpos** 로 본다.
-- (LIKE 는 '_' 가 단일문자 와일드카드라 의도보다 느슨해진다.)
-- ⚠ 여기서 찾는 문자열이 각 함수의 **본문 주석에 없는지** 확인해 두었다 — prosrc 에는 주석도 들어가서,
--    주석이 검사를 대신 통과시켜 주면 검사가 무의미해진다(20260912c 에서 실제로 2종이 그렇게 통과했다).
-- ⚠ 함수는 **이름으로만** 찾는다. pg_get_function_identity_arguments 는 파라미터 이름까지 돌려주므로
--    타입만 적어 비교하면 영원히 불일치라 '함수가 없다' 로 오탐한다(20260911k 가 그 버그로 막혀 있었다).
do $check$
declare
  v_oid oid; v_cfg text[]; v_acl aclitem[]; v_src text; v_n int; v_qual text;
begin
  -- ① 공개 여부 컬럼
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'event_campaigns'
                    and column_name = 'hidden_at') then
    raise exception 'ABORT: event_campaigns.hidden_at 이 없습니다';
  end if;
  -- lifecycle 을 건드려 숨김을 흉내내지 않았는가 — status 체크 제약이 그대로여야 한다.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.event_campaigns'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%draft%live%ended%'
  ) then
    raise exception 'ABORT: event_campaigns.status 의 3개 상태 제약이 사라졌습니다(숨김을 lifecycle 에 섞은 흔적)';
  end if;

  -- ② 숨김 RPC: 존재 · 단일 · SECURITY DEFINER · search_path · ACL · NULL-safe 가드
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_set_event_campaign_hidden';
  if v_n = 0 then raise exception 'ABORT: admin_set_event_campaign_hidden 이 생성되지 않았습니다'; end if;
  if v_n > 1 then raise exception 'ABORT: admin_set_event_campaign_hidden 오버로드가 %개입니다', v_n; end if;

  select p.oid, p.proconfig, p.proacl, p.prosrc into v_oid, v_cfg, v_acl, v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_set_event_campaign_hidden';
  if not (select prosecdef from pg_proc where oid = v_oid) then
    raise exception 'ABORT: admin_set_event_campaign_hidden 이 SECURITY DEFINER 가 아닙니다';
  end if;
  if v_cfg is null or not exists (select 1 from unnest(v_cfg) c where c like 'search_path=%pg_temp%') then
    raise exception 'ABORT: admin_set_event_campaign_hidden 의 search_path 가 고정되지 않았습니다';
  end if;
  if v_acl is null then
    raise exception 'ABORT: admin_set_event_campaign_hidden 이 PUBLIC 기본 GRANT 상태입니다(REVOKE 누락 — from anon 만으로는 무효)';
  end if;
  if has_function_privilege('anon', v_oid, 'execute') then
    raise exception 'ABORT: anon 이 admin_set_event_campaign_hidden 을 실행할 수 있습니다';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception 'ABORT: authenticated 가 admin_set_event_campaign_hidden 을 실행할 수 없습니다(관리자 화면이 죽는다)';
  end if;
  if strpos(v_src, 'my_role() is distinct from ''admin''::user_role') = 0 then
    raise exception 'ABORT: 숨김 RPC 의 관리자 가드가 NULL-safe 가 아닙니다(비로그인에서 가드가 열린다)';
  end if;
  if v_src ~ 'my_role\(\)\s*<>\s*''admin''' then
    raise exception 'ABORT: 숨김 RPC 에 `my_role() <> ''admin''` 가 남아 있습니다';
  end if;
  -- lifecycle 을 바꾸지 않는다 — status 에 쓰는 순간 '숨김 = draft' 구현으로 되돌아간 것이다.
  if v_src ~ 'set\s+status\s*=' then
    raise exception 'ABORT: 숨김 RPC 가 status 를 바꿉니다 — 공개 여부는 lifecycle 과 별도 축이어야 합니다';
  end if;
  if strpos(v_src, 'get diagnostics v_rows = row_count') = 0 then
    raise exception 'ABORT: 숨김 RPC 가 조건부 UPDATE 의 행 수를 확인하지 않습니다(동시 수정이 조용히 성공한다)';
  end if;
  if strpos(v_src, '_audit(''admin_set_event_campaign_hidden''') = 0 then
    raise exception 'ABORT: 숨김 RPC 에 감사기록이 없습니다';
  end if;
  -- 이력을 지우는 경로가 생기지 않았는가
  if v_src ~* 'delete\s+from' then
    raise exception 'ABORT: 숨김 RPC 에 삭제 구문이 있습니다 — 숨김은 이력을 보존해야 합니다';
  end if;

  -- ③ 보드: 숨긴 판이 손님에게 나가지 않는가
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'event_board';
  if strpos(v_src, 'v_c.hidden_at is not null and public.my_role() is distinct from') = 0 then
    raise exception 'ABORT: event_board 가 숨긴 캠페인을 손님에게 그대로 내려보냅니다';
  end if;
  if strpos(v_src, 'case when opened_at is not null then tier end') = 0 then
    raise exception 'ABORT: event_board 재정의에서 미개봉 등급 비공개가 사라졌습니다';
  end if;
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'event_board';
  if not has_function_privilege('anon', v_oid, 'execute') then
    raise exception 'ABORT: anon 이 event_board 를 못 읽습니다(비로그인 손님 화면이 죽는다)';
  end if;

  -- ④ 카드 열기: 숨김 거절 + 종료 경계 미포함 + 20260906b/c 불변식 유지
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'open_event_card';
  if strpos(v_src, 'v_c.hidden_at is not null then') = 0 then
    raise exception 'ABORT: open_event_card 가 숨긴 판의 참여를 막지 않습니다';
  end if;
  if strpos(v_src, 'now() >= v_c.ends_at') = 0 then
    raise exception 'ABORT: 종료 시각 경계가 미포함(>=)이 아닙니다 — 앱 판정과 어긋나 종료 정각에 한 번 더 열린다';
  end if;
  if strpos(v_src, 'for update skip locked') = 0
     or strpos(v_src, 'identity_gate_on()') = 0
     or strpos(v_src, 'voucher_quota = voucher_quota - v_card.voucher_count') = 0
     or strpos(v_src, 'event_campaign_id, event_card_idx') = 0
     or strpos(v_src, '이미 열린 카드예요') = 0 then
    raise exception 'ABORT: open_event_card 재정의에서 기존 불변식(참여권 잠금·본인인증·한도 차감·구조적 참조·중복 개봉 차단)이 사라졌습니다';
  end if;

  -- ⑤ 참여권 지급: 숨김 중단 + 오늘 첫 출석 + 재고 가드가 모두 살아 있는가
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_grant_event_tickets';
  if strpos(v_src, 'c.hidden_at is null') = 0 then
    raise exception 'ABORT: 숨긴 판에도 참여권이 나갑니다(쓸 수 없는 표가 쌓인다)';
  end if;
  if strpos(v_src, 'now() < c.ends_at') = 0 then
    raise exception 'ABORT: 참여권 지급의 종료 경계가 미포함(<)이 아닙니다';
  end if;
  if strpos(v_src, 'at time zone ''Asia/Seoul''') = 0
     or strpos(v_src, 'ec.opened_at is null') = 0 then
    raise exception 'ABORT: _grant_event_tickets 재정의에서 20260907d(오늘 첫 출석)·20260906c(재고) 가드가 사라졌습니다';
  end if;
  if strpos(v_src, 'pg_advisory_xact_lock') = 0 then
    raise exception 'ABORT: 동시 출석이 오늘 첫 출석 검사를 함께 통과해 참여권을 중복 지급할 수 있습니다';
  end if;

  -- ⑥ 목록이 공개 여부를 싣는가 (앱이 '확인 불가' 를 벗어나는 조건)
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_list_event_campaigns';
  if strpos(v_src, 'as "hiddenAt"') = 0 then
    raise exception 'ABORT: 관리자 목록이 공개 여부를 내려보내지 않습니다';
  end if;

  -- ⑦ 읽기 정책이 숨김을 반영하는가 (NULL-safe 형태까지)
  select pg_get_expr(polqual, polrelid) into v_qual from pg_policy
   where polrelid = 'public.event_campaigns'::regclass and polname = 'event_campaigns_read';
  if v_qual is null then raise exception 'ABORT: event_campaigns_read 정책이 없습니다'; end if;
  if strpos(v_qual, 'hidden_at') = 0 then
    raise exception 'ABORT: event_campaigns_read 가 숨김을 보지 않습니다 — 현재: %', v_qual;
  end if;
  -- ⚠ Postgres 는 `a is not distinct from b` 를 `NOT (a IS DISTINCT FROM b)` 로 되돌려준다
  --    (컨테이너 실측 — 처음엔 'IS NOT DISTINCT FROM' 을 찾다가 정상 정책에서 ABORT 했다).
  --    두 형태를 모두 통과시키되, NULL-safe 가 아닌 `= 'admin'` 은 걸리게 'IS DISTINCT FROM' 으로 본다.
  if strpos(upper(v_qual), 'IS DISTINCT FROM') = 0 then
    raise exception 'ABORT: event_campaigns_read 의 관리자 판정이 NULL-safe 가 아닙니다 — 현재: %', v_qual;
  end if;

  -- ⑧ 등급 유출 표면이 넓어지지 않았는가
  if has_table_privilege('anon', 'public.event_cards', 'select')
     or has_table_privilege('authenticated', 'public.event_cards', 'select') then
    raise exception 'ABORT: event_cards 가 클라이언트 롤에 열렸습니다(미개봉 등급 위치가 샌다)';
  end if;

  -- ⑨ **'내 당첨·내 이용권' 을 막지 않았는가**(문서 §8-4). 이벤트 공개를 조이다가 지갑을 닫는 것이
  --    이 배치에서 가장 있을 법한 사고다.
  if not has_table_privilege('authenticated', 'public.store_vouchers', 'select') then
    raise exception 'ABORT: authenticated 가 store_vouchers 를 못 읽습니다 — 내 이용권 화면이 죽습니다';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.store_vouchers'::regclass) then
    raise exception 'ABORT: store_vouchers 의 정책이 사라졌습니다';
  end if;
  -- 숨김이 발급된 이용권을 건드리지 않는다 — 이 파일 어디에도 store_vouchers 쓰기가 없어야 한다
  -- (open_event_card 의 당첨 insert 는 예외 — 그건 손님이 카드를 열 때의 정상 발급이다).
end $check$;

-- ROLLBACK
--   -- 함수 3종은 20260912c(open_event_card·admin_list_event_campaigns)와
--   -- 20260907d(_grant_event_tickets)·20260906b(event_board)의 본문을 다시 실행하고
--   -- 각 파일의 REVOKE/GRANT 두 줄을 다시 쓴다.
--   drop function if exists public.admin_set_event_campaign_hidden(uuid, boolean, text);
--   drop policy if exists event_campaigns_read on public.event_campaigns;
--   create policy event_campaigns_read on public.event_campaigns
--     for select using (status <> 'draft');
--   -- 컬럼은 **지우지 않는다**(숨김 이력과 감사기록의 짝이 끊긴다). 꼭 되돌려야 한다면:
--   --   alter table public.event_campaigns drop column if exists hidden_by;
--   --   alter table public.event_campaigns drop column if exists hidden_reason;
--   --   alter table public.event_campaigns drop column if exists hidden_at;
