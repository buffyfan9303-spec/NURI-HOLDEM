-- ⏳ 미적용 — 초안(home-team, 2026-10-07). 적용 판단·실행은 리드. 리허설: supabase/tests/20261007kb_rehearsal.sql
--    적용하면 이 줄을 "✅ 적용 완료 + 실측값" 으로 바꾼다. 짝 엣지 함수 kakao-unlink 와 KAKAO_ADMIN_KEY 등록은 콘솔설정.md.
select set_config('lock_timeout', '3s', true);
select set_config('statement_timeout', '60s', true);
-- 20261007kb — 탈퇴 회원의 카카오 연결 끊기(unlink)를 놓치지 않게 하는 큐(critical-211 P2-1).
--
-- 왜: 카카오 정책 — "서비스는 반드시 탈퇴 과정에 연결 해제 요청을 포함해 앱과 사용자의 연결을 끊어야 합니다"
--   (https://developers.kakao.com/docs/latest/ko/kakaologin/common). 탈퇴 RPC(withdraw_my_account · admin_withdraw_user)는
--   auth.identities 를 지운다 — 그 뒤에는 카카오 회원번호(provider_id)를 더 읽을 수 없다.
--
-- 흐름
--   ① 앱이 탈퇴 RPC **직전에** 엣지 kakao-unlink 를 부른다 → 즉시 끊고 kakao_unlink_record 로 결과를 남긴다
--      (성공 = done_at 표시, 실패 = 재시도 대상). 실패해도 탈퇴는 진행한다(사용자의 탈퇴 권리가 우선).
--   ② auth.identities 에서 카카오 identity 가 지워지면(어느 경로든) 트리거가 회원번호를 큐에 넣는다 — 앱이 ①을 못 불렀을 때의 백업.
--      ①이 방금(10분 안) 성공한 행은 건드리지 않는다(같은 회원을 두 번 끊지 않는다).
--   ③ 크론이 10분마다 done 이 아닌 행을 kakao-unlink(공유 시크릿)로 다시 끊는다. 10회 실패하면 멈추고 로그 'exhausted' 를 남긴다.
--   ④ 끊은 행(done)은 1시간 뒤 크론이 지운다 — 회원번호를 필요 이상 보관하지 않는다.
--
-- 기록 위치를 새 표로 둔 이유: audit_log 는 오래 보관하는 감사 기록이라 파기 대상인 회원번호를 넣으면 안 되고,
--   storage_purge_queue 는 (bucket_id, name) 키의 파일 큐라 의미가 다르다. 이 표는 끊는 순간까지만 회원번호를 쥔다.
-- 권한: 표·함수 전부 service_role 전용(클라이언트 0). 트리거 함수는 GoTrue(supabase_auth_admin)가 지울 때도 돌아야 하므로 SECURITY DEFINER.

do $gate$
begin
  if to_regprocedure('public.get_push_shared_secret()') is null
     or not exists (select 1 from vault.secrets where name = 'push_shared_secret') then
    raise exception '20261007kb 게이트: 크론 공유 시크릿(push_shared_secret · get_push_shared_secret)이 없다'; end if;
  if to_regclass('cron.job') is null or to_regnamespace('net') is null then
    raise exception '20261007kb 게이트: pg_cron · pg_net 이 없다'; end if;
end $gate$;

create table if not exists public.kakao_unlink_queue (
  provider_id text primary key check (provider_id ~ '^[0-9]{1,20}$'),   -- 카카오 회원번호
  user_id     uuid,                                                        -- 추적용(탈퇴 뒤엔 익명화된 계정 id)
  source      text not null,                                               -- identity_deleted | edge
  attempts    int  not null default 0,
  last_status int,                                                         -- 카카오 HTTP 상태(0 = 네트워크 실패·키 미설정)
  created_at  timestamptz not null default now(),
  done_at     timestamptz                                                  -- 끊김 확인 시각. null = 재시도 대상
);
alter table public.kakao_unlink_queue enable row level security;
revoke all on table public.kakao_unlink_queue from public, anon, authenticated;
grant select, insert, update, delete on table public.kakao_unlink_queue to service_role;

-- ② 삭제 트리거 — 어느 경로로 카카오 identity 가 지워져도 회원번호를 큐에 남긴다
create or replace function public._kakao_unlink_on_identity_delete()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $fn$
begin
  if old.provider = 'kakao' and old.provider_id ~ '^[0-9]{1,20}$' then
    insert into public.kakao_unlink_queue as q (provider_id, user_id, source)
    values (old.provider_id, old.user_id, 'identity_deleted')
    on conflict (provider_id) do update
      set done_at = null, attempts = 0, last_status = null, source = excluded.source, user_id = excluded.user_id, created_at = now()
      where q.done_at is not null and q.done_at < now() - interval '10 minutes';   -- 방금 끊은 행·이미 재시도 중인 행은 그대로
  end if;
  return old;
end $fn$;
revoke all on function public._kakao_unlink_on_identity_delete() from public, anon, authenticated;

drop trigger if exists trg_kakao_unlink_on_identity_delete on auth.identities;
create trigger trg_kakao_unlink_on_identity_delete
  after delete on auth.identities
  for each row when (old.provider = 'kakao')
  execute function public._kakao_unlink_on_identity_delete();

-- ① 엣지 결과 기록 — 성공은 done, 실패는 attempts+1(재시도 대상)
create or replace function public.kakao_unlink_record(p_provider_id text, p_user_id uuid, p_ok boolean, p_status int)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $fn$
begin
  if p_provider_id is null or p_provider_id !~ '^[0-9]{1,20}$' or p_ok is null then
    raise exception using errcode = '22023', message = 'kakao_unlink_record: 잘못된 입력';
  end if;
  insert into public.kakao_unlink_queue as q (provider_id, user_id, source, attempts, last_status, done_at)
  values (p_provider_id, p_user_id, 'edge', case when p_ok then 0 else 1 end, p_status, case when p_ok then now() end)
  on conflict (provider_id) do update
    set attempts    = q.attempts + case when p_ok then 0 else 1 end,
        last_status = excluded.last_status,
        done_at     = excluded.done_at,
        user_id     = coalesce(q.user_id, excluded.user_id);
end $fn$;
revoke all on function public.kakao_unlink_record(text, uuid, boolean, int) from public, anon, authenticated;
grant execute on function public.kakao_unlink_record(text, uuid, boolean, int) to service_role;

-- ③④ 크론 → 엣지 kakao-unlink (호출 방식은 cron_storage_purge(20261006s2)와 같다)
create or replace function public.cron_kakao_unlink()
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $fn$
begin
  delete from public.kakao_unlink_queue where done_at is not null and done_at < now() - interval '1 hour';
  if not exists (select 1 from public.kakao_unlink_queue where done_at is null and attempts < 10) then return; end if;
  perform net.http_post(
    url     := 'https://idsxiqspecrucvfvtgbw.supabase.co/functions/v1/kakao-unlink',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- anon 키는 verify_jwt=true 관문 통과용(원래부터 공개 키 — 20261006s2 와 같은 관행). 인증은 아래 시크릿 헤더가 한다.
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc3hpcXNwZWNydWN2ZnZ0Z2J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzA0OTUsImV4cCI6MjA5NTY0NjQ5NX0.3Ljf6EjlnBXqRfzyb7VMiRJ9-El6JsfL5UGdXAWCI0c',
      'x-nuri-cron-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'push_shared_secret'), '')
    ),
    body    := '{"action":"drain"}'::jsonb,
    timeout_milliseconds := 30000
  );
end $fn$;
revoke all on function public.cron_kakao_unlink() from public, anon, authenticated;
grant execute on function public.cron_kakao_unlink() to service_role;
select cron.schedule('kakao-unlink', '*/10 * * * *', $$select public.cron_kakao_unlink()$$);  -- 같은 이름이면 덮어쓴다(멱등)

-- 자가검사
do $self$
begin
  if (select count(*) from pg_trigger where tgname = 'trg_kakao_unlink_on_identity_delete'
        and tgrelid = 'auth.identities'::regclass and not tgisinternal and tgenabled <> 'D') <> 1 then
    raise exception '20261007kb 자가검사: auth.identities 삭제 트리거가 없다'; end if;
  if has_table_privilege('authenticated', 'public.kakao_unlink_queue', 'select')
     or has_table_privilege('anon', 'public.kakao_unlink_queue', 'select')
     or has_table_privilege('authenticated', 'public.kakao_unlink_queue', 'insert')
     or has_function_privilege('authenticated', 'public.kakao_unlink_record(text,uuid,boolean,int)', 'execute')
     or has_function_privilege('anon', 'public.kakao_unlink_record(text,uuid,boolean,int)', 'execute')
     or has_function_privilege('authenticated', 'public._kakao_unlink_on_identity_delete()', 'execute')
     or has_function_privilege('anon', 'public._kakao_unlink_on_identity_delete()', 'execute')
     or has_function_privilege('authenticated', 'public.cron_kakao_unlink()', 'execute')
     or has_function_privilege('anon', 'public.cron_kakao_unlink()', 'execute') then
    raise exception '20261007kb 자가검사: 내부 객체가 클라이언트에 열려 있다'; end if;
  if not has_function_privilege('service_role', 'public.kakao_unlink_record(text,uuid,boolean,int)', 'execute')
     or not has_table_privilege('service_role', 'public.kakao_unlink_queue', 'select') then
    raise exception '20261007kb 자가검사: 엣지 함수(service_role)가 큐를 못 쓴다'; end if;
  if (select count(*) from cron.job where jobname = 'kakao-unlink') <> 1 then
    raise exception '20261007kb 자가검사: 크론 kakao-unlink 가 1개가 아니다'; end if;
end $self$;

notify pgrst, 'reload schema';

-- ROLLBACK(엣지 함수는 그대로 둬도 무해 — 큐가 비면 크론이 부르지 않는다. 단 남은 행은 카카오 연결이 안 끊긴 탈퇴자다 — 먼저 처리할 것)
-- select cron.unschedule('kakao-unlink');
-- drop trigger if exists trg_kakao_unlink_on_identity_delete on auth.identities;
-- drop function if exists public.cron_kakao_unlink(); drop function if exists public.kakao_unlink_record(text, uuid, boolean, int);
-- drop function if exists public._kakao_unlink_on_identity_delete(); drop table if exists public.kakao_unlink_queue;
