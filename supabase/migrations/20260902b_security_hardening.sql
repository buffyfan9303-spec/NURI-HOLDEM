-- ============================================================================
-- 20260902b — 보안 강화 패스(오너 지시 2026-09-02 "보안 스스로 발전시켜라")
--  ① AI 프록시 쿼터: gemini / gto-explain 엣지 함수가 로그인 유저별 일일 상한을 DB 에 기록한다.
--     (문제: 두 함수는 공개 anon 키만 있으면 누구나 호출 가능 → Gemini 과금 남용 통로였다.
--      함수 쪽에서 getUser() 로 로그인 강제 + 이 RPC 로 상한을 건다.)
--  ② 크론→엣지 함수 호출에 공유 시크릿 동봉: weekly-email-digest 는 anon Bearer 만으로 열려 있어
--     인터넷 어디서든 전 회원 이메일 발송을 트리거할 수 있었다. send-push 와 같은 Vault 시크릿을
--     x-nuri-cron-secret 헤더로 보내고 함수가 대조한다(fail-closed).
--  ③ SECURITY DEFINER 함수 EXECUTE 정리(어드바이저 WARN 102건):
--     - 변이(mutation) RPC 는 anon 실행 회수 — 비로그인은 auth.uid() 가 NULL 이라 원래 성공할 수 없다.
--       회수는 '가드가 하나 빠져도 anon 이 못 들어오는' 2중 방어다.
--     - 트리거·크론·내부 함수는 anon·authenticated 모두 회수(직접 호출 차단, 20260827d 관행).
--     - 읽기 RPC(get_/list_/my_/is_/can_/집계) 는 비로그인 화면(매장 페이지·홈·라이브·가입 닉네임 검사)이
--       쓰므로 그대로 둔다.
--  멱등: 전부 IF EXISTS / DO 블록. 롤백은 파일 끝.
-- ============================================================================

-- ── ① AI 쿼터 ────────────────────────────────────────────────────────────────
create table if not exists public.ai_usage (
  user_id uuid not null,
  day     date not null,
  kind    text not null,
  count   integer not null default 0,
  primary key (user_id, day, kind)
);
alter table public.ai_usage enable row level security;   -- 정책 없음 = service_role 전용
revoke all on table public.ai_usage from anon, authenticated, public;

create or replace function public.consume_ai_quota(p_user_id uuid, p_kind text, p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  if p_user_id is null or p_kind is null or p_limit is null or p_limit <= 0 then
    return jsonb_build_object('ok', false, 'used', 0, 'limit', coalesce(p_limit, 0));
  end if;
  -- KST 기준 하루
  insert into public.ai_usage (user_id, day, kind, count)
  values (p_user_id, (now() at time zone 'Asia/Seoul')::date, p_kind, 1)
  on conflict (user_id, day, kind) do update set count = public.ai_usage.count + 1
  returning count into v_count;
  return jsonb_build_object('ok', v_count <= p_limit, 'used', v_count, 'limit', p_limit);
end $$;
revoke execute on function public.consume_ai_quota(uuid, text, integer) from public, anon, authenticated;
grant  execute on function public.consume_ai_quota(uuid, text, integer) to service_role;

-- ── ② 크론 → weekly-email-digest 호출에 공유 시크릿 동봉 ─────────────────────
-- push_shared_secret(20260826a)을 재사용한다 — '우리 DB 가 부른 호출' 을 증명하는 용도는 같다.
create or replace function public.cron_weekly_email_digest()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform net.http_post(
    url     := 'https://idsxiqspecrucvfvtgbw.supabase.co/functions/v1/weekly-email-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- anon 키는 verify_jwt=true 관문 통과용(원래부터 공개 키 — 20260826a 와 동일 관행). 인증은 아래 시크릿 헤더가 한다.
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc3hpcXNwZWNydWN2ZnZ0Z2J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzA0OTUsImV4cCI6MjA5NTY0NjQ5NX0.3Ljf6EjlnBXqRfzyb7VMiRJ9-El6JsfL5UGdXAWCI0c',
      'x-nuri-cron-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'push_shared_secret'), '')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end $$;
revoke execute on function public.cron_weekly_email_digest() from public, anon, authenticated;

-- ── ③ EXECUTE 정리 ───────────────────────────────────────────────────────────
do $$
declare
  r record;
  -- 변이 RPC — anon 회수(authenticated 유지)
  mut text[] := array[
    'add_venue_owner','add_venue_staff','approve_buyin_request','cancel_buyin_request','cancel_ledger_buyin',
    'cancel_staff_invite','cast_poll_vote','claim_daily_login_point','create_group','create_my_venue',
    'create_venue_season','delete_ledger_session','end_venue_season','join_group','kill_venue',
    'link_customer_alias','unlink_customer_alias','notify_ledger_open','record_referral','reject_buyin_request',
    'remove_venue_owner','remove_venue_staff','reopen_ledger_session','reply_to_review','reserve_schedule',
    'respond_staff_invite','revoke_ledger_access','send_venue_announcement','set_kill_password','set_my_nickname',
    'set_my_venue_notify','set_pos_cancel_password','set_venue_page_config','set_venue_slug','toggle_post_like',
    'update_venue_address','update_venue_staff'
  ];
  -- 트리거·크론·내부 — anon·authenticated·public 회수(직접 호출 차단)
  internal text[] := array[
    '_guard_ledger_session_update','auto_blind_reported_post','cap_live_wall','end_expired_seasons',
    'expire_old_buyin_requests','handle_new_user','increment_post_likes','log_consent_changes',
    'notify_followers_on_poster','notify_inquiry_answered','notify_league_invite','notify_league_response',
    'notify_on_post_like','notify_on_review','prevent_self_approve_poster','purge_old_client_errors',
    'require_active_author','send_tournament_reminders','send_weekly_venue_reports','cron_weekly_email_digest'
  ];
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(mut)
  loop
    execute format('revoke execute on function public.%I(%s) from anon', r.proname, r.args);
  end loop;
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(internal)
  loop
    execute format('revoke execute on function public.%I(%s) from public, anon, authenticated', r.proname, r.args);
  end loop;
end $$;

-- ── ② 크론 재등록(함수 경유) ──────────────────────────────────────────────────
do $$ begin
  perform cron.unschedule('weekly-email-digest');
exception when others then null; end $$;
select cron.schedule('weekly-email-digest', '30 1 * * 5', $$select public.cron_weekly_email_digest()$$);

notify pgrst, 'reload schema';

-- ROLLBACK
-- select cron.unschedule('weekly-email-digest');  -- 그 뒤 20260818e 의 원래 schedule 을 다시 실행
-- drop function if exists public.cron_weekly_email_digest();
-- drop function if exists public.consume_ai_quota(uuid, text, integer);
-- drop table if exists public.ai_usage;
-- EXECUTE 회수는 되돌릴 이유가 없다(anon 은 변이 RPC 를 원래 성공시킬 수 없다). 필요하면 grant execute ... to anon.
