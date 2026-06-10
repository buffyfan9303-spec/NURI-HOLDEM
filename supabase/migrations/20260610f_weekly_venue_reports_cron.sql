-- 매장 주간 리포트: 매주 월요일 아침(KST 09:05) 업주에게 지난주 엔트리·매출·신규 손님 요약 알림
CREATE OR REPLACE FUNCTION public.send_weekly_venue_reports()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v record;
  v_start date; v_end date;
  v_entries int; v_sales bigint; v_new int;
begin
  -- 지난주 월~일 (KST)
  v_start := (date_trunc('week', ((now() at time zone 'Asia/Seoul')::date - 7)::timestamp))::date;
  v_end := v_start + 6;
  for v in select id, name, owner_id from public.venues where owner_id is not null loop
    -- 매출: 분할결제=실수금 합 / 후원·티켓=0 / 미수=0 / 카드=카드단가 / 그 외=바인 단가
    select count(*),
           coalesce(sum(
             case
               when b.is_split then coalesce(b.cash_amount,0) + coalesce(b.card_amount,0) + coalesce(b.transfer_amount,0)
               when b.payment_method in ('support','ticket') then 0
               when b.is_unpaid then 0
               when b.payment_method = 'card' then coalesce(nullif(s.card_amount, 0), s.buyin_amount)
               else s.buyin_amount
             end), 0)
      into v_entries, v_sales
      from public.ledger_buyins b
      join public.ledger_sessions s on s.venue_id = b.venue_id and s.session_date = b.session_date
     where b.venue_id = v.id and b.session_date between v_start and v_end;
    if v_entries = 0 then continue; end if; -- 지난주 영업 기록 없으면 스킵
    select count(distinct lp.name) into v_new
      from public.ledger_players lp
     where lp.venue_id = v.id and lp.session_date between v_start and v_end
       and not exists (
         select 1 from public.ledger_players p2
          where p2.venue_id = v.id and p2.name = lp.name and p2.session_date < v_start);
    insert into public.notifications(user_id, type, title, message, avatar_text, avatar_color)
    values (v.owner_id, 'report',
      '📊 ' || v.name || ' 주간 리포트',
      format('지난주(%s~%s) 엔트리 %s건 · 매출 %s만원 · 신규 손님 %s명 — 이번 주도 화이팅!',
             to_char(v_start, 'MM/DD'), to_char(v_end, 'MM/DD'), v_entries, (v_sales / 10000)::bigint, v_new),
      '📊', '#FFD100');
  end loop;
end $function$;
REVOKE EXECUTE ON FUNCTION public.send_weekly_venue_reports() FROM PUBLIC;

-- 기존 동일 잡 있으면 교체
DO $$
BEGIN
  PERFORM cron.unschedule('weekly-venue-reports');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule('weekly-venue-reports', '5 0 * * 1', $$select public.send_weekly_venue_reports()$$);
