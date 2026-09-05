-- 티켓 단위 재정의: 1T = 1만원 (오너 결정 2026-09-05, 20260905e 의 1T=10만을 대체)
--   "1T 가 10만원이면 장부 분납에서 티켓을 나눌 수 없다(5만 자리에 10만 티켓). 1T 당 1만원의 가치로 표기."
--   10만 바인 = 10T. 순위 상금 "10T" = 10만원. 머니인 포인트(100만원당 1점)는 100T 부터 1점.
--
-- 이 파서 하나를 weekly_moneyin_kings · weekly_league · global_ranking_totals · current_season_standings 가 공유.
-- 운영 DB: 순위 상금 2건("400","1000") 전부 숫자 — 'nT' 저장 행 0건이라 소급 변화 0.
-- 클라 TICKET_MAN(api/rankings.ts) = 1, lib/units TICKET_WON = 10_000 과 같은 값이어야 한다(테스트로 결속).
--
-- 롤백: ×10 으로 되돌리려면 20260905e_prize_ticket_notation.sql 본문 재실행.

create or replace function public.parse_prize_man(p_prize text)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    -- "10T" · "5 t" → T 앞의 숫자 = 만원 (1T = 1만원)
    when replace(coalesce(p_prize,''),',','') ~* '^\s*[0-9]+(?:\.[0-9]+)?\s*T\s*$'
      then coalesce(round(substring(replace(coalesce(p_prize,''),',','') from '[0-9]+(?:\.[0-9]+)?')::numeric)::int, 0)
    else coalesce(round(substring(replace(coalesce(p_prize,''),',','') from '[0-9]+(?:\.[0-9]+)?')::numeric)::int, 0)
  end;
$$;
