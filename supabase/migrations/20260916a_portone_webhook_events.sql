-- 20260916a — PortOne 웹훅 수신 기록 (멱등성 + 감사 로그)
--
-- 왜 필요한가
--   오너가 PortOne 콘솔에 웹훅 URL 을 등록한다(엣지 함수 `portone-webhook`).
--   웹훅은 **재전송이 정상 동작**이다(PortOne 이 2xx 를 못 받으면 다시 보낸다).
--   그래서 같은 이벤트가 여러 번 온다는 전제로 만들어야 하고, 멱등성을 **DB 가 보장**해야 한다
--   (엣지 함수의 메모리는 인스턴스마다 다르고 동시 요청을 못 막는다).
--   `webhook-id` 를 기본키로 두면 두 번째 수신은 on conflict 로 조용히 접힌다.
--
-- 지금은 **기록만 한다.** 결제 업무 로직(이용권 지급 등)은 아직 없으므로 지어내지 않는다.
--   나중에 그 로직이 생기면 이 표가 '무엇이 실제로 도착했는가' 의 정본이 된다.
--
-- 보안(CLAUDE.md 보안 표준)
--   · RLS 전면 잠금 + 정책 0개 → anon·authenticated 는 한 줄도 못 읽는다(결제 식별자가 들어온다).
--   · 쓰기는 service_role(엣지 함수)만. 호출자 증명은 함수가 **Standard Webhooks 서명**으로 한다
--     — `verify_jwt` 는 anon 키 JWT 도 통과시키므로 게이트가 아니다(보안 표준 4).
--
-- ✅ 2026-09-16 라이브 적용 완료(claude-A). 자가검사 통과 · 어드바이저 보안 ERROR 0 유지.
--    실측: 적용 후 anon SELECT 불가 · authenticated SELECT 불가 · service_role INSERT 가능(양성 대조).

create table if not exists public.portone_webhook_events (
  webhook_id    text primary key,                    -- Standard Webhooks 의 `webhook-id`. 멱등 키.
  event_type    text,                                -- 본문 type (예: Transaction.Paid). 없을 수 있어 null 허용.
  payment_id    text,                                -- 본문에서 뽑은 결제/인증 식별자(있으면).
  received_at   timestamptz not null default now(),
  signed_at     timestamptz,                         -- `webhook-timestamp` 를 시각으로
  payload       jsonb not null                       -- 원문 그대로. 나중에 업무 로직이 생기면 여기서 읽는다.
);

comment on table public.portone_webhook_events is
  'PortOne 웹훅 수신 기록. webhook_id 가 멱등 키다(재전송이 정상 동작이라 반드시 필요). 읽기는 service_role 만.';

-- 조회 편의(최근 순). 운영 조사용이며 업무 경로는 아직 없다.
create index if not exists portone_webhook_events_received_idx
  on public.portone_webhook_events (received_at desc);

alter table public.portone_webhook_events enable row level security;
-- 정책을 **하나도 만들지 않는다** = RLS 가 켜진 표는 정책이 없으면 전부 거부다.
-- service_role 은 RLS 를 우회하므로 엣지 함수만 쓰고 읽을 수 있다.

revoke all on table public.portone_webhook_events from public, anon, authenticated;
grant all on table public.portone_webhook_events to service_role;

-- ── 자가검사 (음성 + 양성 대조) ──────────────────────────────────────────────
do $$
declare v_anon boolean; v_auth boolean; v_svc boolean; v_rls boolean; v_pol int;
begin
  select relrowsecurity into v_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname='portone_webhook_events';
  select count(*) into v_pol from pg_policies where schemaname='public' and tablename='portone_webhook_events';
  v_anon := has_table_privilege('anon','public.portone_webhook_events','SELECT');
  v_auth := has_table_privilege('authenticated','public.portone_webhook_events','SELECT');
  v_svc  := has_table_privilege('service_role','public.portone_webhook_events','INSERT');

  -- 음성: 손님·로그인 유저는 못 읽는다
  if v_anon then raise exception '자가검사 실패: anon 이 SELECT 가능하다'; end if;
  if v_auth then raise exception '자가검사 실패: authenticated 가 SELECT 가능하다'; end if;
  if not v_rls then raise exception '자가검사 실패: RLS 가 꺼져 있다'; end if;
  if v_pol <> 0 then raise exception '자가검사 실패: 정책이 % 개 있다(0 이어야 한다)', v_pol; end if;
  -- 🔴 양성 대조: 엣지 함수는 **쓸 수 있어야** 한다. 이게 없으면 '아무도 못 쓰는 고장'도 통과한다.
  if not v_svc then raise exception '자가검사 실패: service_role 이 INSERT 불가 — 웹훅이 아무것도 기록 못 한다'; end if;

  raise notice '✅ 20260916a 자가검사 통과 — RLS on · 정책 0 · anon/auth 차단 · service_role 쓰기 가능';
end $$;
