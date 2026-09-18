-- 20260918e — 내 매장 **이벤트 개설 신청 · 이벤트 제안**. 오너 지시 2026-09-18.
--
-- 오너 원문:
--   "내 매장에 이벤트 만드는 란을 만들어줘 지금 있는 이벤트 1개 있잖아 이것을 일단 활용해서
--    매장이용권 몇장을 하고싶다 이런식으로 하면 신청해서 원하는 날자를 넣고 승인하면 내가
--    7일 이내에 적용시켜주는 방식으로 그리고 이벤트 제안도 넣어줘서 이벤트 제안하게 만들어줘"
-- 오너 결정(2026-09-18):
--   · 승인은 **'하겠다' 표시만**이다 — event_campaigns 를 자동 생성하지 않는다.
--   · 경품 이용권은 **신청한 매장의 발행 한도(voucher_quota)에서 차감**한다.
--
-- ══ 설계 — 기존 이벤트를 대체하지 않고 **그 앞에 대기열만** 단다 ═══════════════
-- `event_campaigns`(20260906b)는 지금도 운영자 전용이고 그대로 둔다. 여기서 만드는 것은
-- "이런 이벤트를 하고 싶다" 는 **신청서**일 뿐이며, 실제 개설은 운영자가 기존 화면에서 한다.
-- 한도 증액(20260918d)과 같은 모양이다: 권한을 새로 만들지 않고 소통 창구를 만든다.
--
-- ⚠ 두 종류를 한 표에 담는다(kind).
--     'campaign' = 이용권 N장을 걸고 언제 하고 싶다 — 장수·시작일 필수
--     'idea'     = 자유 제안 — 장수·날짜 없이 글만
--   표를 둘로 나누면 운영자 대기열도 둘이 되고, 그러면 한쪽을 안 보게 된다(오늘 실제로 겪은 부류).
--
-- ⚠ 🔴 요청을 **받는 화면과 처리하는 화면을 같은 작업에서** 만든다.
--   오늘(2026-09-18) 한도 증액에서 요청 화면만 만들고 승인 화면을 빠뜨려, 업주 요청이
--   '검토 중'에서 영원히 멈추는 막다른 길을 만들었다(전수 점검이 잡았다). 같은 실수를 반복하지 않는다.
--
-- ══ 적용 상태 ═════════════════════════════════════════════════════════════════
-- ⏳ **아직 라이브에 적용하지 않았다.** 리허설은 13/13 통과했다(아래 "리허설 기록").
--    라이브 DB 변경은 오너 승인 사항이라 여기서 멈춘다.

create table if not exists public.venue_event_requests (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null references public.venues(id) on delete cascade,
  requested_by  uuid references public.profiles(id) on delete set null,
  kind          text not null check (kind in ('campaign', 'idea')),
  title         text not null check (char_length(btrim(title)) between 1 and 60),
  body          text check (body is null or char_length(body) <= 500),
  -- 경품으로 걸고 싶은 매장이용권 장수(campaign 전용).
  -- ⚠ 상한 10,000 — 발행 한도(voucher_quota)와 같은 축이라 그보다 크게 신청할 이유가 없다.
  voucher_count integer check (voucher_count is null or (voucher_count > 0 and voucher_count <= 10000)),
  desired_start date,
  desired_end   date,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note    text,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  -- campaign 이면 '몇 장'과 '언제'가 없으면 신청서로서 의미가 없다.
  constraint venue_event_requests_campaign_fields check (
    kind <> 'campaign' or (voucher_count is not null and desired_start is not null)
  ),
  constraint venue_event_requests_date_order check (
    desired_end is null or desired_start is null or desired_end >= desired_start
  )
);

-- 정책을 만들지 않는다 = RPC 전용(voucher_credit_requests 와 같은 방식).
alter table public.venue_event_requests enable row level security;

create index if not exists venue_event_requests_pending_idx
  on public.venue_event_requests (created_at) where status = 'pending';
create index if not exists venue_event_requests_venue_idx
  on public.venue_event_requests (venue_id, created_at desc);

-- ── ① 업주: 신청 ──────────────────────────────────────────────────────────────
create or replace function public.request_venue_event(
  p_venue_id      uuid,
  p_kind          text,
  p_title         text,
  p_body          text    default null,
  p_voucher_count integer default null,
  p_desired_start date    default null,
  p_desired_end   date    default null
) returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_id uuid; v_pending int;
begin
  -- 권한: issue_voucher·request_voucher_quota 와 **같은 게이트**를 쓴다.
  if not can_manage_pos(p_venue_id) then
    raise exception '매장 업주만 신청할 수 있습니다';
  end if;
  if not exists (select 1 from public.venues v where v.id = p_venue_id) then
    raise exception '매장을 찾을 수 없습니다';
  end if;
  if p_kind is null or p_kind not in ('campaign', 'idea') then
    raise exception '신청 종류가 올바르지 않습니다';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception '제목을 적어 주세요';
  end if;

  if p_kind = 'campaign' then
    if p_voucher_count is null or p_voucher_count <= 0 then
      raise exception '경품으로 걸 매장이용권 장수를 적어 주세요';
    end if;
    if p_desired_start is null then
      raise exception '원하는 시작 날짜를 골라 주세요';
    end if;
    -- 지난 날짜로 신청하면 운영자가 승인해도 할 수 있는 일이 없다.
    if p_desired_start < (now() at time zone 'Asia/Seoul')::date then
      raise exception '시작 날짜는 오늘 이후여야 합니다';
    end if;
  end if;

  -- 대기 중 신청 상한 — 같은 매장이 대기열을 도배하면 운영자가 못 읽는다.
  --   campaign 은 1건(동시에 두 개를 열 수 없다), idea 는 3건.
  select count(*) into v_pending
    from public.venue_event_requests r
   where r.venue_id = p_venue_id and r.kind = p_kind and r.status = 'pending';
  if p_kind = 'campaign' and v_pending >= 1 then
    raise exception '이미 검토 중인 이벤트 신청이 있습니다 — 결과가 나온 뒤에 다시 신청해 주세요';
  end if;
  if p_kind = 'idea' and v_pending >= 3 then
    raise exception '검토 중인 제안이 3건입니다 — 결과가 나온 뒤에 더 보내 주세요';
  end if;

  insert into public.venue_event_requests
    (venue_id, requested_by, kind, title, body, voucher_count, desired_start, desired_end)
  values
    (p_venue_id, auth.uid(), p_kind, btrim(p_title), nullif(btrim(coalesce(p_body, '')), ''),
     case when p_kind = 'campaign' then p_voucher_count end,
     case when p_kind = 'campaign' then p_desired_start end,
     case when p_kind = 'campaign' then p_desired_end end)
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.request_venue_event(uuid, text, text, text, integer, date, date) from public, anon;
grant  execute on function public.request_venue_event(uuid, text, text, text, integer, date, date) to authenticated, service_role;

-- ── ② 업주: 내 신청 목록 ──────────────────────────────────────────────────────
create or replace function public.my_venue_event_requests(p_venue_id uuid)
returns table (
  id uuid, kind text, title text, body text, voucher_count integer,
  desired_start date, desired_end date, status text, admin_note text,
  created_at timestamptz, decided_at timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select r.id, r.kind, r.title, r.body, r.voucher_count,
         r.desired_start, r.desired_end, r.status, r.admin_note, r.created_at, r.decided_at
    from public.venue_event_requests r
   where r.venue_id = p_venue_id and can_manage_pos(p_venue_id)
   order by r.created_at desc
   limit 20;
$$;

revoke execute on function public.my_venue_event_requests(uuid) from public, anon;
grant  execute on function public.my_venue_event_requests(uuid) to authenticated, service_role;

-- ── ③ 운영자: 대기 목록 ───────────────────────────────────────────────────────
create or replace function public.admin_list_venue_event_requests()
returns table (
  id uuid, venue_id uuid, venue_name text, kind text, title text, body text,
  voucher_count integer, desired_start date, desired_end date,
  requester text, venue_quota integer, created_at timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select r.id, r.venue_id, v.name, r.kind, r.title, r.body,
         r.voucher_count, r.desired_start, r.desired_end,
         coalesce(p.nickname, p.name, ''),
         -- 잔여 한도를 같이 준다 — 운영자가 승인 전에 "한도가 되는가" 를 화면에서 바로 본다.
         coalesce(v.voucher_quota, 0),
         r.created_at
    from public.venue_event_requests r
    join public.venues v on v.id = r.venue_id
    left join public.profiles p on p.id = r.requested_by
   where r.status = 'pending' and my_role() = 'admin'
   order by r.created_at asc;
$$;

revoke execute on function public.admin_list_venue_event_requests() from public, anon;
grant  execute on function public.admin_list_venue_event_requests() to authenticated, service_role;

-- ── ④ 운영자: 승인 / 반려 ─────────────────────────────────────────────────────
create or replace function public.admin_decide_venue_event(
  p_id         uuid,
  p_approve    boolean,
  p_admin_note text default null
) returns integer          -- 승인 후 그 매장의 잔여 발행 한도(차감이 없었으면 현재 값)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare r record; q int;
begin
  -- ⚠ NULL-safe 비교 — `<>` 는 비로그인에서 NULL 이라 가드가 열린다.
  if my_role() IS DISTINCT FROM 'admin' then
    raise exception '운영자만 가능합니다';
  end if;

  select * into r from public.venue_event_requests
   where id = p_id and status = 'pending' for update;
  if not found then
    raise exception '대기 중인 신청이 아닙니다';
  end if;

  select coalesce(voucher_quota, 0) into q from public.venues where id = r.venue_id for update;

  if p_approve and r.kind = 'campaign' and coalesce(r.voucher_count, 0) > 0 then
    -- 🔴 오너 결정: 경품 이용권은 **신청한 매장의 발행 한도에서 차감**한다.
    -- ⚠ 먼저 확인하고 나서 뺀다. admin_grant_voucher_quota 는 `greatest(0, …)` 라
    --   음수를 넘기면 **조용히 0 으로 눌린다** — 부족한데 승인된 것처럼 보이는 최악의 경우가 된다.
    -- ⚠ 오류 문구가 다음 행동을 말해 준다: 한도가 모자라면 업주가 '한도 증액 요청'(20260918d)을 쓰면 된다.
    --   두 기능이 여기서 만난다.
    if q < r.voucher_count then
      raise exception '매장 발행 한도가 부족합니다 (잔여 %장 · 필요 %장) — 먼저 한도를 늘려 주세요', q, r.voucher_count;
    end if;
    -- 실제 차감은 심사가 존치시킨 기존 레버가 한다(§12-A: 금전 수수와 무관한 운영 도구).
    -- 증액 로직을 여기에 복사하면 심사 밖에 두 번째 경로가 생긴다.
    q := public.admin_grant_voucher_quota(r.venue_id, -r.voucher_count);
  end if;

  update public.venue_event_requests
     set status     = case when p_approve then 'approved' else 'rejected' end,
         admin_note = nullif(btrim(coalesce(p_admin_note, '')), ''),
         decided_at = now()
   where id = p_id;

  return q;
end $$;

revoke execute on function public.admin_decide_venue_event(uuid, boolean, text) from public, anon;
grant  execute on function public.admin_decide_venue_event(uuid, boolean, text) to authenticated, service_role;

-- ══ 리허설 기록 — 2026-09-18 라이브에서 `begin; … rollback;` 실행. **13/13 통과** ══
-- 검증 계정: 업주(비운영자) 1a8c5117…(venue_owner, `[E2E] 자동테스트 전용 매장` 소유) ·
--            운영자 c8e3734d…(admin) · 일반 유저 fd14c2dc…(user, 매장 없음)
--
-- 음성 대조(막아야 하는 것) — 전부 거절됐다:
--   ✅ anon 실행권 request_venue_event / admin_decide_venue_event → 둘 다 막힘
--   ✅ venue_event_requests 의 RLS 정책 수 = 0 (RPC 전용이 실제로 지켜짐)
--   ✅ 일반 유저가 남의 매장에 신청 → '매장 업주만 신청할 수 있습니다'
--   ✅ 지난 날짜로 campaign 신청 → '시작 날짜는 오늘 이후여야 합니다'
--   ✅ campaign 인데 장수 누락 → '경품으로 걸 매장이용권 장수를 적어 주세요'
--   ✅ campaign 두 번째 신청 → '이미 검토 중인 이벤트 신청이 있습니다'
--   🔴 ✅ **한도 부족인데 승인 시도 → '매장 발행 한도가 부족합니다 (잔여 0장 · 필요 100장)'**
--      이 대조가 가장 중요하다. admin_grant_voucher_quota 는 `greatest(0, …)` 라 음수를 넘기면
--      **조용히 0 으로 눌린다** — 먼저 확인하지 않았다면 '부족한데 승인된' 상태가 됐을 것이다.
--
-- 양성 대조(통과해야 하는 것):
--   ✅ 업주 campaign 신청 → 내 목록에 pending 1건
--   ✅ idea 는 campaign 과 **별개로** 접수된다 → pending 2건
--   ✅ 한도를 채운 뒤 승인 → voucher_quota **250 → 150**(정확히 100 차감), status='approved'
--   ✅ idea 반려 → 한도 150 **불변**, status='rejected'
--   ✅ 처리 후 운영자 대기열 0건
--
-- (전부 한 트랜잭션 안에서 실행하고 rollback 했다 — 라이브에 흔적 없음)
--
-- ══ ROLLBACK ═════════════════════════════════════════════════════════════════
-- drop function if exists public.admin_decide_venue_event(uuid, boolean, text);
-- drop function if exists public.admin_list_venue_event_requests();
-- drop function if exists public.my_venue_event_requests(uuid);
-- drop function if exists public.request_venue_event(uuid, text, text, text, integer, date, date);
-- drop table if exists public.venue_event_requests;
