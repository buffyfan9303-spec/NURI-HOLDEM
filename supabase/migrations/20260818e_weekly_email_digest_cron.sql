-- 이메일 다이제스트 크론 — 금 10:30 KST(알림판 다이제스트 10:00 직후). (라이브 적용: weekly_email_digest_cron)
-- 엣지 함수(weekly-email-digest)를 anon Bearer 로 호출(공개 키 — push_on_notification 과 동일 관행).
-- ⚠ 도메인 인증 전(RESEND_FROM=onboarding@resend.dev)에는 Resend 계정 소유자 주소로만 도달 —
--   nuriholdem.com 인증(SPF/DKIM DNS) 후 secret_settings.RESEND_FROM 을 교체해야 실사용자 발송.
do $$ begin
  perform cron.unschedule('weekly-email-digest');
exception when others then null; end $$;
select cron.schedule('weekly-email-digest', '30 1 * * 5', $$
  select net.http_post(
    url := 'https://idsxiqspecrucvfvtgbw.supabase.co/functions/v1/weekly-email-digest',
    body := '{}'::jsonb,
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc3hpcXNwZWNydWN2ZnZ0Z2J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzA0OTUsImV4cCI6MjA5NTY0NjQ5NX0.3Ljf6EjlnBXqRfzyb7VMiRJ9-El6JsfL5UGdXAWCI0c"}'::jsonb,
    timeout_milliseconds := 30000
  );
$$);
