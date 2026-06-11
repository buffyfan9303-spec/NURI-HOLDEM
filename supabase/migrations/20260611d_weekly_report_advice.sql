-- 주간 리포트에 한 줄 조언 추가(요일별 엔트리 분석 — 약세 요일/신규 비중/기본 멘트)
-- 최종본: 요일 합산은 group by extract(dow). Gemini 미사용(미인증 엔드포인트 회피) — 서버 내 규칙 엔진.
CREATE OR REPLACE FUNCTION public.send_weekly_venue_reports()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v record;
  v_start date; v_end date;
  v_entries int; v_sales bigint; v_new int; v_total_players int;
  v_worst_day text; v_worst_cnt int; v_best_cnt int; v_days int;
  v_advice text;
begin
  v_start := (date_trunc('week', ((now() at time zone 'Asia/Seoul')::date - 7)::timestamp))::date;
  v_end := v_start + 6;
  for v in select id, name, owner_id from public.venues where owner_id is not null loop
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
    if v_entries = 0 then continue; end if;

    select count(distinct lp.name) into v_new
      from public.ledger_players lp
     where lp.venue_id = v.id and lp.session_date between v_start and v_end
       and not exists (
         select 1 from public.ledger_players p2
          where p2.venue_id = v.id and p2.name = lp.name and p2.session_date < v_start);
    select count(distinct lp.name) into v_total_players
      from public.ledger_players lp
     where lp.venue_id = v.id and lp.session_date between v_start and v_end;

    -- 요일별 엔트리 합산 → 가장 약한 요일 + 최고치 + 영업 요일 수
    select day_label, cnt, max_cnt, n_days into v_worst_day, v_worst_cnt, v_best_cnt, v_days
      from (
        select g.day_label, g.cnt,
               max(g.cnt) over () as max_cnt,
               count(*) over () as n_days
          from (
            select case extract(dow from b.session_date)
                     when 0 then '일' when 1 then '월' when 2 then '화' when 3 then '수'
                     when 4 then '목' when 5 then '금' else '토' end as day_label,
                   count(*) as cnt
              from public.ledger_buyins b
             where b.venue_id = v.id and b.session_date between v_start and v_end
             group by extract(dow from b.session_date)
          ) g
        order by g.cnt asc limit 1
      ) t;

    -- 한 줄 조언: ①약세 요일(최고의 절반 미만) ②신규 비중 30%+ ③기본
    if v_days >= 2 and v_worst_cnt * 2 < v_best_cnt then
      v_advice := format('%s요일이 약했어요(%s건) — %s요일 프리롤·이벤트로 끌어올려 보세요.', v_worst_day, v_worst_cnt, v_worst_day);
    elsif v_total_players > 0 and v_new * 100 >= v_total_players * 30 then
      v_advice := format('신규 손님이 %s명이나 왔어요 — 첫 방문 쿠폰으로 단골 전환을 노려보세요.', v_new);
    else
      v_advice := '이번 주도 꾸준했어요 — 단골 재방문 이벤트로 한 번 더 끌어올려 보세요.';
    end if;

    insert into public.notifications(user_id, type, title, message, avatar_text, avatar_color)
    values (v.owner_id, 'report',
      '📊 ' || v.name || ' 주간 리포트',
      format('지난주(%s~%s) 엔트리 %s건 · 매출 %s만원 · 신규 손님 %s명' || E'\n' || '💡 %s',
             to_char(v_start, 'MM/DD'), to_char(v_end, 'MM/DD'), v_entries, (v_sales / 10000)::bigint, v_new, v_advice),
      '📊', '#FFD100');
  end loop;
end $function$;
