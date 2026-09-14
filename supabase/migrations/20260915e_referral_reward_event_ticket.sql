-- ============================================================================
-- ✅ **2026-09-15 라이브 적용 완료(nuri-lead).** 자가검사 9종 전부 통과 · 어드바이저 보안 ERROR 0 유지.
--    적용 직후 실측: event_tickets 0행 · non-checkin 0 · referral_ticket_grants 0행 · rewarded_at is null 인 초대 0건.
--    (아직 인증 대기 초대가 없어 지급 경로는 **실데이터로는 미검증**이다 — 첫 초대가 들어오는 순간 처음 시험받는다.)
-- ⚠ `supabase db push` 로는 못 올린다: CLI 가 이 저장소 파일명 규칙을 건너뛰고, CLI 이름으로 바꾸면
--    원격 이력 350여 건이 로컬에 없다며 `migration repair` 를 요구한다. **MCP execute_sql 로 3부에 나눠 적용했다.**
-- 20260915a — 친구 초대 보상: 활동점수 → 이벤트 참여권(뽑기권)
--
-- 오너 지시 #9 (2026-09-15)
--   "본인인증까지 추천한 사람이 가입 완료하면 활동점수 말고 이벤트 뽑기권 1개씩 줘"
-- 오너 결정 (2026-09-15, nuri-lead 경유)
--   (A) **추천인·가입자 둘 다 1장**
--   (B) 진행 중인 이벤트가 없으면 **보류했다가 다음 이벤트에 지급**
--
-- ── 지금 무엇이 있나 (저장소 기준 — 라이브 정의와 다를 수 있다. 적용 전 미리보기 필수) ──
--   · 보상 트리거  trg_referral_reward_on_verify ON profiles (AFTER UPDATE OF ci_hash)
--                  → _referral_reward_on_verify() → _grant_referral_reward(referee)
--   · 현재 지급    referee +300 · referrer +500 활동점수 (20260827b 판)
--   · referrals    PK = referee_id (supabase/baseline:974) · rewarded_at 로 1회성 보장
--   · QR출석 뽑기권 checkins AFTER INSERT → _grant_event_tickets()
--                  → event_tickets insert (live · hidden_at is null · 기간 안 · 안 연 카드 잔여)
--
-- ============================================================================
-- 🔴 멱등성 설계 — 오너 지시의 핵심. **두 겹 모두 DB 가 보장한다.**
--
--   ci_hash 는 재인증·기기변경으로 여러 번 갱신되고 트리거는 그때마다 돈다. 게다가 (B) 때문에
--   "대기 → 지급" 이라는 **두 번째 단계**가 생겼다. 그래서 막아야 할 사고가 둘이다.
--
--   (1) 같은 초대로 **대기 행이 두 번 생기지 않는다**
--       → referral_ticket_grants 의 **PK (referee_id, user_id)** + `on conflict do nothing`.
--         한 초대당 행은 정확히 2개(추천인 1 · 가입자 1)이고, 몇 번 다시 불러도 3개가 될 수 없다.
--         클라이언트 체크가 아니라 **기본키 제약**이다.
--
--   (2) 대기 행이 **두 번 지급되지 않는다**
--       → 지급은 `update ... set granted_at = now() where granted_at is null` **상태 전이**로만 한다.
--         행을 집는 순간 `for update skip locked` 로 잠그므로 동시 호출 둘이 같은 행을 못 집는다.
--         전이에 성공한 트랜잭션만 표를 넣는다.
--       → 게다가 event_tickets 에 **유니크 인덱스 (campaign_id, source_referee_id, user_id)** 를 둬서,
--         (2) 가 어떤 이유로 뚫려도 **DB 가 두 번째 표 자체를 거부**한다. 그물이 두 장이다.
--
--   ⚠ rewarded_at 의 뜻이 바뀐다: 종전 "보상을 줬다" → 이제 **"보상이 확정됐다(=대기 행을 만들었다)"**.
--     실제 전달 여부는 referral_ticket_grants.granted_at 이 가진다. 둘을 한 컬럼으로 합치면
--     "확정됐지만 아직 못 준" 상태를 표현할 수 없어 (B) 가 성립하지 않는다.
--
-- ============================================================================
-- 🔵 언제 지급하나 — **"그 사람이 다음에 들어올 때"(당겨 가기)를 고른다.**
--
--   후보 ① 새 이벤트가 live 가 되는 순간 트리거로 일괄 지급
--   후보 ② 그 사람이 다음에 들어올 때 본인 것만 당겨 간다  ← 채택
--
--   근거:
--   · **① 은 순서에 취약하다.** 지급 조건에는 "안 연 카드가 남아 있을 것" 이 들어 있는데(QR출석과 같은
--     조건을 공유한다), 운영자는 보통 **캠페인을 live 로 만든 뒤 카드를 채운다.** 그 순간 트리거가 돌면
--     카드가 0장이라 아무도 못 받고, 트리거는 두 번 돌지 않으므로 **그대로 영영 대기**다.
--     ②는 들어올 때마다 다시 시도하므로 이 순서 문제가 아예 없다(self-healing).
--   · **② 는 크론이 없다.** ① 을 안전하게 만들려면 결국 "주기적으로 밀린 것을 훑는" 크론이 붙는데,
--     크론은 이 저장소에서 실패가 조용한 부류다(무료 한도·pg_cron 로그 7일).
--   · **받는 사람이 화면에 있을 때 지급된다.** 참여권은 그 자리에서 쓰는 물건이라,
--     "들어왔더니 표가 있다" 가 "없는 동안 쌓였다" 보다 알아채기 쉽다.
--   · 손해가 없다: 안 들어온 사람은 표를 **쓸 수도 없다.** 대기 행은 남아 있어 언제 들어와도 받는다.
--
--   ⇒ 통로: `claim_my_pending_referral_tickets()` (authenticated 전용, 본인 것만).
--     보상이 확정되는 순간에도 같은 함수를 한 번 부르므로, **이벤트가 열려 있으면 즉시 지급**되고
--     닫혀 있을 때만 대기로 남는다.
--
-- 🟡 대기가 영원히 안 풀릴 수 있다(이벤트가 다시 안 열리면) → **조용히 사라지지 않게 화면이 말한다.**
--   같은 RPC 가 남은 대기 장수를 돌려주고, 내 정보 > 친구 초대에 그 수가 상시 노출된다.
--   (클라이언트 변경은 이 파일과 **같이** 나가야 한다 — 맨 아래 참조.)
-- ============================================================================
begin;

-- ── 0. 전제 확인 — 하나라도 어긋나면 여기서 멈춘다 ─────────────────────────
do $preflight$
declare v_src text;
begin
  if to_regprocedure('public._grant_referral_reward(uuid)') is null then
    raise exception 'ABORT: _grant_referral_reward(uuid) 가 없다 — 20260827b 가 적용돼 있지 않다';
  end if;
  if to_regprocedure('public._grant_event_tickets()') is null then
    raise exception 'ABORT: _grant_event_tickets() 가 없다 — 20260906b 계열이 적용돼 있지 않다';
  end if;
  if to_regclass('public.event_tickets') is null then
    raise exception 'ABORT: event_tickets 테이블이 없다';
  end if;
  if to_regclass('public.referrals') is null then
    raise exception 'ABORT: referrals 테이블이 없다';
  end if;
  -- referrals 의 PK 가 referee_id 여야 아래 FK 가 성립한다.
  if not exists (
    select 1 from pg_index i
     where i.indrelid = 'public.referrals'::regclass and i.indisprimary
       and (select array_agg(a.attname::text order by a.attname)
              from pg_attribute a
             where a.attrelid = i.indrelid and a.attnum = any(i.indkey)) = array['referee_id']
  ) then
    raise exception 'ABORT: referrals 의 기본키가 (referee_id) 가 아니다 — 멱등 설계의 전제다';
  end if;
  -- 라이브 본문이 우리가 아는 판인지. 제3의 판이면 덮어쓰기 전에 사람이 본다.
  select prosrc into v_src from pg_proc where oid = 'public._grant_referral_reward(uuid)'::regprocedure;
  if position('activity_points' in v_src) = 0 then
    raise exception 'ABORT: _grant_referral_reward 라이브 본문에 활동점수 지급이 없다 — 이미 바뀐 판이다';
  end if;
  select prosrc into v_src from pg_proc where oid = 'public._grant_event_tickets()'::regprocedure;
  if position('hidden_at is null' in v_src) = 0 then
    raise exception 'ABORT: _grant_event_tickets 가 20260913 하드닝 판이 아니다 — 조건을 옮기기 전에 확인하라';
  end if;
end $preflight$;

-- ── 1. event_tickets 에 출처 열 추가 (추가만 · 기존 행 0 변경) ─────────────
alter table public.event_tickets
  add column if not exists source            text not null default 'checkin',
  add column if not exists source_referee_id uuid;

comment on column public.event_tickets.source is
  '참여권 출처: checkin(QR출석) · referral(친구 초대 보상). 기존 행은 전부 checkin 이다.';
comment on column public.event_tickets.source_referee_id is
  '초대 보상일 때 referrals.referee_id. 멱등성 두 번째 그물(아래 유니크 인덱스)의 키다.';

-- 🔴 멱등 (2) 의 두 번째 그물. source_referee_id 가 있을 때만 — checkin 행은 영향 없다.
create unique index if not exists event_tickets_referral_uniq
  on public.event_tickets(campaign_id, source_referee_id, user_id)
  where source_referee_id is not null;

-- ── 2. 대기 원장 — "보상은 확정됐는데 아직 못 준" 상태를 담는다 ────────────
create table if not exists public.referral_ticket_grants (
  referee_id uuid not null references public.referrals(referee_id) on delete cascade,
  user_id    uuid not null references public.profiles(id)          on delete cascade,
  -- 'referrer'(초대한 사람) · 'referee'(가입한 사람). 표시·집계용이고 멱등 키는 아니다.
  role       text not null,
  created_at timestamptz not null default now(),
  granted_at timestamptz,
  -- 🔴 멱등 (1): 한 초대당 한 사람 한 행. 몇 번 다시 불러도 늘어날 수 없다.
  primary key (referee_id, user_id),
  constraint referral_ticket_grants_role_chk check (role in ('referrer', 'referee'))
);

comment on table public.referral_ticket_grants is
  '친구 초대 보상(이벤트 참여권)의 대기·지급 원장. 진행 중인 이벤트가 없을 때 보상이 사라지지 않게 '
  '"확정"(행 생성)과 "전달"(granted_at)을 분리한다. 오너 결정 2026-09-15.';

create index if not exists referral_ticket_grants_pending_idx
  on public.referral_ticket_grants(user_id) where granted_at is null;

alter table public.referral_ticket_grants enable row level security;
-- 본인 것만 읽는다. 쓰기 정책은 두지 않는다 → SECURITY DEFINER 함수만이 통로다.
drop policy if exists referral_ticket_grants_own on public.referral_ticket_grants;
create policy referral_ticket_grants_own on public.referral_ticket_grants
  for select using (user_id = (select auth.uid()));
revoke all on public.referral_ticket_grants from public, anon;
grant select on public.referral_ticket_grants to authenticated;

-- ── 3. 지급 로직을 한 곳으로 — QR출석과 초대가 **같은 함수**를 쓴다 ────────
-- 캠페인 선별 조건(live · hidden_at is null · 기간 · 안 연 카드 잔여)은 여기 한 벌만 존재한다.
-- 두 벌로 나뉘면 한쪽만 고쳐져 "출석은 주는데 초대는 안 주는" 상태가 조용히 생긴다.
create or replace function public._grant_event_ticket_for(
  p_user     uuid,
  p_venue    uuid,          -- 캠페인이 매장 한정일 때 대조할 매장. null = 매장 무관(초대 경로)
  p_checkin  uuid,          -- 출석 경로의 멱등 키. 초대 경로는 null
  p_referee  uuid,          -- 초대 경로의 멱등 키. 출석 경로는 null
  p_source   text
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_n integer;
begin
  if p_user is null then return 0; end if;
  -- NULL-safe: p_source 가 null 이면 `<>` 비교가 NULL 이라 가드가 열린다.
  if p_source is distinct from 'checkin' and p_source is distinct from 'referral' then
    raise exception '알 수 없는 참여권 출처입니다';
  end if;

  insert into public.event_tickets(campaign_id, user_id, checkin_id, source, source_referee_id)
  select c.id, p_user, p_checkin, p_source, p_referee
    from public.event_campaigns c
   where c.status = 'live'
     -- 숨김 = 새 참여 일시중지. 쓸 수 없는 표를 쥐여 주지 않는다.
     and c.hidden_at is null
     -- 매장 한정 캠페인: 출석은 그 매장일 때만. 초대(p_venue is null)는 매장 한정 판을 건너뛴다
     -- (초대에는 "어느 매장" 이 없다 — 임의의 매장을 고르면 그건 새 규칙을 만드는 것이다).
     and (c.ticket_venue_id is null or c.ticket_venue_id = p_venue)
     and (c.starts_at is null or now() >= c.starts_at)
     -- 종료 시각 미포함 — 앱(src/lib/eventState.ts)과 같은 경계다.
     and (c.ends_at is null or now() < c.ends_at)
     and exists (
       select 1 from public.event_cards ec
        where ec.campaign_id = c.id and ec.opened_at is null
     )
  on conflict do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

revoke all on function public._grant_event_ticket_for(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public._grant_event_ticket_for(uuid, uuid, uuid, uuid, text) to service_role;

-- 출석 트리거는 이제 위 함수만 부른다(조건 복제 제거). 나머지 동작은 종전 그대로:
-- 하루 첫 출석 판정 · advisory lock · 예외 삼킴(출석이 본체다).
create or replace function public._grant_event_tickets()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    new.user_id::text || ':' || new.venue_id::text || ':' ||
    ((new.created_at at time zone 'Asia/Seoul')::date)::text,
    0
  ));

  -- 그 매장에 오늘 이미 출석 기록이 있으면 참여권을 주지 않는다(KST 기준, 방금 들어온 행은 제외).
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

  perform public._grant_event_ticket_for(new.user_id, new.venue_id, new.id, null, 'checkin');
  return new;
exception when others then
  -- 이벤트 때문에 출석이 실패하면 안 된다 — 지급 실패는 삼키고 출석은 살린다(종전 동작 유지).
  return new;
end $fn$;

revoke all on function public._grant_event_tickets() from public, anon, authenticated;

-- ── 4. 대기 → 지급 (상태 전이). 이 함수만이 granted_at 을 채운다. ──────────
create or replace function public._fulfill_referral_tickets(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare r record; v_given integer := 0;
begin
  if p_user is null then return 0; end if;

  -- 🔴 멱등 (2): granted_at is null 인 행만, skip locked 로 하나씩 잠가 집는다.
  --   동시 호출 둘이 같은 행을 집을 수 없고, 전이에 성공한 쪽만 표를 넣는다.
  for r in
    select g.referee_id, g.user_id
      from public.referral_ticket_grants g
     where g.user_id = p_user and g.granted_at is null
     for update skip locked
  loop
    -- p_venue = null: 초대에는 "어느 매장" 이 없다 → 매장 한정 캠페인은 건너뛴다.
    if public._grant_event_ticket_for(r.user_id, null, null, r.referee_id, 'referral') > 0 then
      update public.referral_ticket_grants
         set granted_at = now()
       where referee_id = r.referee_id and user_id = r.user_id
         and granted_at is null;          -- ← 상태 전이. 이미 지급됐으면 0행이고 아무 일도 안 난다.
      v_given := v_given + 1;
    end if;
    -- 표가 0장이면(진행 중인 이벤트 없음) 행은 그대로 대기로 남는다 — 다음에 다시 시도한다.
  end loop;

  return v_given;
end $fn$;

revoke all on function public._fulfill_referral_tickets(uuid) from public, anon, authenticated;
grant execute on function public._fulfill_referral_tickets(uuid) to service_role;

-- ── 5. 손님이 부르는 통로 — 본인 것만 당겨 가고, 남은 대기 수를 돌려준다 ──
-- 한 번 호출로 ①지급 시도 ②화면에 보여 줄 대기 수를 함께 해결한다(RPC 를 둘로 나누지 않는다).
create or replace function public.claim_my_pending_referral_tickets()
returns table(granted integer, pending integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_uid uuid := (select auth.uid()); v_given integer;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  v_given := public._fulfill_referral_tickets(v_uid);
  return query
    select v_given,
           (select count(*)::integer from public.referral_ticket_grants
             where user_id = v_uid and granted_at is null);
end $fn$;

revoke all on function public.claim_my_pending_referral_tickets() from public, anon;
grant execute on function public.claim_my_pending_referral_tickets() to authenticated, service_role;

comment on function public.claim_my_pending_referral_tickets() is
  '밀린 친구 초대 참여권을 본인 것만 당겨 간다. 진행 중인 이벤트가 없으면 대기로 남고 pending 으로 알려 준다.';

-- ── 6. 초대 보상 — 활동점수 대신 참여권(대기 원장 경유) ───────────────────
-- 바뀌지 않는 것: 지급 시점 판정(피추천인의 본인인증 완료) · 탈퇴/제재 명의 재가입 차단 · 알림.
-- 바뀌는 것: activity_points +300/+500 → 대기 행 2개 생성 + 즉시 지급 시도.
create or replace function public._grant_referral_reward(p_referee uuid) returns void
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  r public.referrals;
  v_hash text; v_tomb boolean;
begin
  select * into r from public.referrals where referee_id = p_referee and rewarded_at is null;
  if not found then return; end if;

  select ci_hash, identity_tombstoned into v_hash, v_tomb
    from public.profiles where id = p_referee and verified_at is not null;
  if v_hash is null then return; end if;

  -- 과거 탈퇴/제재 명의의 재가입이면 보상 파밍으로 보고 지급 없이 마감(재시도 루프 방지) — 종전 그대로
  if coalesce(v_tomb, false) or exists (select 1 from public.withdrawn_identities where ci_hash = v_hash) then
    update public.referrals set rewarded_at = now() where referee_id = p_referee;
    return;
  end if;

  -- 오너 결정 (A): 추천인·가입자 **둘 다 1장**.
  -- 🔴 멱등 (1): PK (referee_id, user_id) 가 두 번째 행을 거부한다. 트리거가 몇 번 돌아도 2행이다.
  insert into public.referral_ticket_grants (referee_id, user_id, role)
  values (p_referee, r.referrer_id, 'referrer'),
         (p_referee, r.referee_id,  'referee')
  on conflict (referee_id, user_id) do nothing;

  -- rewarded_at = "보상이 확정됐다". 실제 전달은 referral_ticket_grants.granted_at 이 가진다.
  update public.referrals set rewarded_at = now() where referee_id = p_referee;

  -- 이벤트가 열려 있으면 여기서 바로 들어간다. 없으면 대기로 남고 다음에 들어올 때 당겨 간다.
  perform public._fulfill_referral_tickets(r.referrer_id);
  perform public._fulfill_referral_tickets(r.referee_id);

  insert into public.notifications (user_id, type, title, message, link) values
    (r.referrer_id, 'system', '🎉 친구 초대 보상',
     '초대한 친구가 본인인증을 완료했어요. 이벤트 참여권 1장이 지급됩니다(진행 중인 이벤트가 없으면 다음 이벤트에 지급).', '/'),
    (r.referee_id,  'system', '🎉 추천 가입 보상',
     '추천 가입 + 본인인증 완료! 이벤트 참여권 1장이 지급됩니다(진행 중인 이벤트가 없으면 다음 이벤트에 지급).', '/');
end $fn$;

revoke execute on function public._grant_referral_reward(uuid) from public, anon, authenticated;

-- ── 8. rewarded_at 의 뜻이 바뀌니 그것을 읽는 화면도 고친다 ────────────────
-- 🔴 nuri-lead 지적(2026-09-15): `my_referral_stats().rewarded` 가 `rewarded_at is not null` 을 세는데,
--   이제 그건 "줬다" 가 아니라 **"확정됐다"** 다. 그대로 두면 내 정보 > 친구 초대의 `보상 N` 이
--   **아직 대기 중인 건까지 '보상 완료' 로 세어** 거짓말이 된다(화면 문구: `초대 N · 보상 N`).
--   → '실제로 전달된' 기준으로 고친다. **반환 타입은 건드리지 않는다**(바꾸면 DROP+재생성이 강요되고
--     그 순간 ACL 이 초기화된다 — CLAUDE.md 보안 §3 · 2026-09-12 실측). CREATE OR REPLACE 로 의미만 바꾼다.
create or replace function public.my_referral_stats()
returns table(invited integer, rewarded integer)
language sql
security definer
set search_path = public, pg_temp
as $fn$
  select count(*)::int,
         -- 내가 **추천인** 인 초대 중, 내 몫의 참여권이 실제로 전달된 건수.
         count(*) filter (
           where exists (
             select 1 from public.referral_ticket_grants g
              where g.referee_id = r.referee_id
                and g.user_id = (select auth.uid())
                and g.granted_at is not null
           )
         )::int
    from public.referrals r
   where r.referrer_id = (select auth.uid());
$fn$;

comment on function public.my_referral_stats() is
  '내 초대 현황. rewarded 는 **실제로 참여권이 전달된** 건수다(확정만 된 대기 건은 세지 않는다 — '
  '오너 결정 2026-09-15 로 확정과 전달이 분리됐다). 대기 장수는 claim_my_pending_referral_tickets() 가 준다.';

revoke execute on function public.my_referral_stats() from public, anon;
grant execute on function public.my_referral_stats() to authenticated, service_role;

-- ── 9. 자가검사 — 통과하지 못하면 통째로 롤백된다 ─────────────────────────
do $verify$
declare v_src text; v_n integer;
begin
  -- (1) 멱등 (1) — 대기 원장의 기본키가 (referee_id, user_id) 인가
  if not exists (
    select 1 from pg_index i
     where i.indrelid = 'public.referral_ticket_grants'::regclass and i.indisprimary
       and (select array_agg(a.attname::text order by a.attname)
              from pg_attribute a
             where a.attrelid = i.indrelid and a.attnum = any(i.indkey))
           = array['referee_id','user_id']
  ) then
    raise exception 'ABORT: referral_ticket_grants 의 기본키가 (referee_id, user_id) 가 아니다 — 멱등 (1) 이 무너진다';
  end if;

  -- (2) 멱등 (2) 의 두 번째 그물 — event_tickets 유니크 인덱스
  if to_regclass('public.event_tickets_referral_uniq') is null then
    raise exception 'ABORT: event_tickets_referral_uniq 가 만들어지지 않았다';
  end if;
  -- 기존 checkin 멱등 인덱스는 건드리면 안 되는 것
  if to_regclass('public.event_tickets_checkin_uniq') is null then
    raise exception 'ABORT: event_tickets_checkin_uniq 가 사라졌다';
  end if;

  -- (3) 멱등 (2) 의 첫 번째 그물 — 상태 전이가 granted_at is null 로 잠겨 있는가
  select prosrc into v_src from pg_proc where oid = 'public._fulfill_referral_tickets(uuid)'::regprocedure;
  if position('for update skip locked' in v_src) = 0 then
    raise exception 'ABORT: _fulfill_referral_tickets 에 for update skip locked 가 없다 — 동시 호출이 같은 행을 집는다';
  end if;
  if position('and granted_at is null' in v_src) = 0 then
    raise exception 'ABORT: _fulfill_referral_tickets 의 UPDATE 에 granted_at is null 가드가 없다';
  end if;

  -- (4) 초대 보상에 활동점수 지급이 남아 있지 않고, 대기 원장을 쓰는가
  select prosrc into v_src from pg_proc where oid = 'public._grant_referral_reward(uuid)'::regprocedure;
  if position('activity_points' in v_src) > 0 then
    raise exception 'ABORT: _grant_referral_reward 에 활동점수 지급이 남아 있다';
  end if;
  if position('referral_ticket_grants' in v_src) = 0 then
    raise exception 'ABORT: _grant_referral_reward 가 대기 원장을 쓰지 않는다';
  end if;
  if position('on conflict (referee_id, user_id) do nothing' in v_src) = 0 then
    raise exception 'ABORT: 대기 행 생성에 on conflict 가드가 없다 — 멱등 (1) 이 예외로 터진다';
  end if;
  -- 오너 결정 (A): 두 사람 모두
  if position('''referrer''' in v_src) = 0 or position('''referee''' in v_src) = 0 then
    raise exception 'ABORT: 추천인·가입자 둘 다에게 주는 구조가 아니다 (오너 결정 A)';
  end if;

  -- (5) 출석 경로도 같은 함수를 쓰는가(조건이 두 벌로 갈라지지 않았는가)
  select prosrc into v_src from pg_proc where oid = 'public._grant_event_tickets()'::regprocedure;
  if position('_grant_event_ticket_for' in v_src) = 0 then
    raise exception 'ABORT: 출석 트리거가 공용 지급 함수를 쓰지 않는다 — 조건이 두 벌이 된다';
  end if;
  if position('insert into public.event_tickets' in v_src) > 0 then
    raise exception 'ABORT: 출석 트리거에 옛 직접 INSERT 가 남아 있다';
  end if;
  -- 하루 첫 출석 가드는 옮기면서 떨어뜨리기 쉬운 자리다
  if position('Asia/Seoul' in v_src) = 0 then
    raise exception 'ABORT: 출석 트리거의 KST 하루 첫 출석 가드가 사라졌다';
  end if;

  -- (6) ACL — 내부 함수는 anon·authenticated 에서 실행 불가, 손님 통로만 authenticated 허용
  select count(*) into v_n
    from pg_proc p
   where p.oid in ('public._grant_event_ticket_for(uuid,uuid,uuid,uuid,text)'::regprocedure,
                   'public._fulfill_referral_tickets(uuid)'::regprocedure,
                   'public._grant_referral_reward(uuid)'::regprocedure,
                   'public._grant_event_tickets()'::regprocedure)
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'));
  if v_n > 0 then
    raise exception 'ABORT: 내부 함수 %개가 anon/authenticated 에서 실행 가능하다', v_n;
  end if;
  if has_function_privilege('anon', 'public.claim_my_pending_referral_tickets()'::regprocedure, 'execute') then
    raise exception 'ABORT: 손님 통로를 anon 이 부를 수 있다';
  end if;
  if not has_function_privilege('authenticated', 'public.claim_my_pending_referral_tickets()'::regprocedure, 'execute') then
    raise exception 'ABORT: 손님 통로를 authenticated 가 부를 수 없다(양성 대조)';
  end if;

  -- (7) 대기 원장 RLS — 남의 대기가 보이면 안 된다
  if not (select relrowsecurity from pg_class where oid = 'public.referral_ticket_grants'::regclass) then
    raise exception 'ABORT: referral_ticket_grants 에 RLS 가 꺼져 있다';
  end if;
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'referral_ticket_grants' and cmd <> 'SELECT';
  if v_n > 0 then
    raise exception 'ABORT: 대기 원장에 쓰기 정책이 %개 있다 — SECURITY DEFINER 만이 통로여야 한다', v_n;
  end if;

  -- (8) 기존 행은 전부 checkin 으로 남아야 한다(데이터 변경 0)
  select count(*) into v_n from public.event_tickets where source is distinct from 'checkin';
  if v_n > 0 then
    raise exception 'ABORT: 기존 참여권 %개의 source 가 checkin 이 아니다', v_n;
  end if;

  -- (9) rewarded_at 을 읽던 화면이 '확정' 을 '전달' 로 오독하지 않는가
  select prosrc into v_src from pg_proc where oid = 'public.my_referral_stats()'::regprocedure;
  if position('rewarded_at is not null' in v_src) > 0 then
    raise exception 'ABORT: my_referral_stats 가 아직 rewarded_at 으로 센다 — 대기 건이 보상 완료로 보인다';
  end if;
  if position('granted_at is not null' in v_src) = 0 then
    raise exception 'ABORT: my_referral_stats 가 실제 전달(granted_at) 기준이 아니다';
  end if;
  -- 반환 타입이 그대로여야 클라이언트(getMyReferralStats)가 깨지지 않는다
  if (select pg_get_function_result('public.my_referral_stats()'::regprocedure))
     not like '%invited integer%rewarded integer%' then
    raise exception 'ABORT: my_referral_stats 의 반환 타입이 바뀌었다 — 클라이언트와 ACL 이 함께 깨진다';
  end if;
end $verify$;

commit;

-- ============================================================================
-- 적용 뒤 확인 (쓰기 없음)
--   select source, count(*) from public.event_tickets group by 1;
--   select role, granted_at is null as pending, count(*) from public.referral_ticket_grants group by 1,2;
--   select count(*) from public.referrals where rewarded_at is null;   -- 아직 인증 안 한 초대
--   -- 어드바이저 보안 ERROR 0 확인
--
-- 밀린 초대의 소급 처리 (선택 — 오너 판단)
--   이 파일은 **과거에 이미 활동점수로 보상받은 초대**를 건드리지 않는다(이중 보상이 된다).
--   적용 시점에 rewarded_at is null 인 초대만 앞으로 참여권을 받는다.
--
-- 함께 나가야 하는 클라이언트 변경 (이것 없이 적용하면 대기가 화면에서 조용히 사라진다)
--   src/components/features/CustomerDashboardPage.tsx
--     · 973행  '· 친구 초대(본인인증) +500 · 추천 가입 +300'
--              → '· 친구 초대(본인인증) 이벤트 참여권 1장 · 추천 가입 1장'
--     · 427~429 주석 · 1022 주석의 '양쪽 활동점수(+500/+300)' 설명
--     · 친구 초대 섹션에서 claim_my_pending_referral_tickets() 를 1회 호출하고,
--       pending > 0 이면 **"이벤트 참여권 N장 대기 중 · 다음 이벤트가 열리면 지급됩니다"** 를 상시 노출.
--       (오너 지시: 조용히 사라지면 안 된다.)
--   community-team 이 대기 중 — nuri-lead 신호와 같은 커밋으로 낸다.
-- ============================================================================
