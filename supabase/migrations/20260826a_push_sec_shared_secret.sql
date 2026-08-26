-- ============================================================================
-- PUSH-SEC (W1-0): send-push 무인증 차단 — 공유 시크릿 도입
--  문제: send-push Edge Function이 verify_jwt=false + 핸들러 인증 검사 0줄로 열려 있어
--        인터넷 어디서든(anon 키조차 불필요) 임의 유저에게 임의 제목·본문·딥링크 푸시를
--        발송할 수 있었다(PWA 피싱). 유일한 정상 호출자는 아래 DB 트리거뿐.
--  해법: DB가 스스로 생성한 시크릿(Vault 보관 — git·로그·터미널 어디에도 값 미노출)을
--        트리거가 x-nuri-push-secret 헤더로 동봉하고, Edge Function이 service_role 전용
--        RPC(get_push_shared_secret)로 같은 값을 읽어 대조한다. 불일치·부재 시 401.
--  배포 순서(무중단): ① 이 마이그레이션(트리거가 헤더 추가 — 구버전 함수는 모르는
--        헤더를 무시하므로 발송 무중단) → ② send-push 함수 검사 활성 버전 배포(verify_jwt=true).
-- ============================================================================

-- 1) 시크릿 자기 생성(멱등) — 값은 DB 밖으로 나가지 않는다
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'push_shared_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_shared_secret');
  end if;
end $$;

-- 2) Edge Function이 기대값을 읽을 통로 — service_role 전용
create or replace function public.get_push_shared_secret()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'push_shared_secret'
$$;
revoke execute on function public.get_push_shared_secret() from anon, authenticated, public;
grant execute on function public.get_push_shared_secret() to service_role;

-- 3) 트리거: 발송 호출에 시크릿 헤더 동봉
--    (Authorization의 anon 키는 verify_jwt=true 플랫폼 관문 통과용 — 원래부터 공개 키)
create or replace function public.push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url     := 'https://idsxiqspecrucvfvtgbw.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc3hpcXNwZWNydWN2ZnZ0Z2J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzA0OTUsImV4cCI6MjA5NTY0NjQ5NX0.3Ljf6EjlnBXqRfzyb7VMiRJ9-El6JsfL5UGdXAWCI0c',
      'x-nuri-push-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'push_shared_secret'), '')
    ),
    body    := jsonb_build_object('type', 'INSERT', 'record', to_jsonb(new))
  );
  return new;
exception when others then
  return new; -- 푸시 호출 실패가 알림 생성 트랜잭션을 막지 않도록
end;
$$;

notify pgrst, 'reload schema';

-- ROLLBACK: (send-push 함수를 이전 버전으로 재배포한 뒤 실행)
-- create or replace function public.push_on_notification()
-- returns trigger language plpgsql security definer set search_path = public as $rb$
-- begin
--   perform net.http_post(
--     url     := 'https://idsxiqspecrucvfvtgbw.supabase.co/functions/v1/send-push',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc3hpcXNwZWNydWN2ZnZ0Z2J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzA0OTUsImV4cCI6MjA5NTY0NjQ5NX0.3Ljf6EjlnBXqRfzyb7VMiRJ9-El6JsfL5UGdXAWCI0c'
--     ),
--     body    := jsonb_build_object('type', 'INSERT', 'record', to_jsonb(new))
--   );
--   return new;
-- exception when others then
--   return new;
-- end;
-- $rb$;
-- drop function if exists public.get_push_shared_secret();
-- delete from vault.secrets where name = 'push_shared_secret';
