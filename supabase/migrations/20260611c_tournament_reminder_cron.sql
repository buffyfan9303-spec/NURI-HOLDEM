-- 대회 1시간 전 리마인더: 매 10분 점검, 시작 50~70분 전 예약자에게 알림(1회만)
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.send_tournament_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  s record; v_now timestamp; v_start timestamp; v_sent int;
begin
  v_now := now() at time zone 'Asia/Seoul';
  for s in
    select id, title, pub_name, date, start_time
      from public.schedules
     where approved = true
       and reminder_sent_at is null
       and date = v_now::date
  loop
    v_start := (s.date + coalesce(s.start_time, '19:00'::time))::timestamp;
    -- 시작 50~70분 전 윈도우(매 10분 크론과 맞물려 정확히 1회)
    if v_start - v_now between interval '50 minutes' and interval '70 minutes' then
      insert into public.notifications(user_id, type, title, message, avatar_text, avatar_color)
      select r.user_id, 'reminder',
             '⏰ 1시간 후 시작!',
             format('%s — %s %s 시작. 좋은 자리 잡으세요!', s.title, coalesce(s.pub_name, '매장'), to_char(v_start, 'HH24:MI')),
             '⏰', '#FFD100'
        from public.schedule_reservations r
       where r.schedule_id = s.id and r.user_id is not null;
      update public.schedules set reminder_sent_at = now() where id = s.id;
      get diagnostics v_sent = row_count;
    end if;
  end loop;
end $function$;
REVOKE EXECUTE ON FUNCTION public.send_tournament_reminders() FROM PUBLIC;

DO $$
BEGIN
  PERFORM cron.unschedule('tournament-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule('tournament-reminders', '*/10 * * * *', $$select public.send_tournament_reminders()$$);
