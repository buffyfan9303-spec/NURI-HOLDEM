-- ============================================================================
-- 웹 푸시 자동 발송: notifications INSERT → send-push Edge Function 비동기 호출
--  (Supabase Database Webhook을 SQL 트리거로 대체. pg_net 사용)
--  Authorization 헤더의 키는 공개(anon) 키이므로 노출되어도 안전합니다.
--  실제 발송은 Edge Function secret(VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY) 등록 후 동작.
-- ============================================================================
create extension if not exists pg_net;

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
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc3hpcXNwZWNydWN2ZnZ0Z2J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzA0OTUsImV4cCI6MjA5NTY0NjQ5NX0.3Ljf6EjlnBXqRfzyb7VMiRJ9-El6JsfL5UGdXAWCI0c'
    ),
    body    := jsonb_build_object('type', 'INSERT', 'record', to_jsonb(new))
  );
  return new;
exception when others then
  return new; -- 푸시 호출 실패가 알림 생성 트랜잭션을 막지 않도록
end;
$$;

revoke execute on function public.push_on_notification() from anon, authenticated, public;

drop trigger if exists trg_push_on_notification on public.notifications;
create trigger trg_push_on_notification
  after insert on public.notifications
  for each row execute function public.push_on_notification();
