-- 순위 상금의 티켓 표기 "nT" (오너 지시 2026-09-05)
--   "티켓을 1T 가 10만원이 아니라, 머니인이나 순위 같은 데는 '1T'로 표기하되 장부에서는 '10'(만원)으로.
--    순위 등에 표기될 때 어느 쪽으로 보일지 매장이 선택할 수 있게."
--
-- 저장 형식: venue_rankings.prize(text) 에 "1T", "2T" 처럼 **정수 + T**. 숫자만이면 예전대로 만원.
-- 가치: 1T = 10만원 고정(오너 "1t는 10만원"). 머니인 포인트(100만원당 1점)는 이 가치로 계산한다.
-- 표기(1T vs 10만)는 클라 매장 설정(page_config.ticketPrizeDisplay)이 정한다 — 서버는 가치만 안다.
--
-- 이 파서 하나를 weekly_moneyin_kings · weekly_league · global_ranking_totals · current_season_standings 가
-- prize_moneyin_points 를 통해 공유하므로 여기만 고치면 전부 따라온다.
-- 숫자 문자열의 동작은 그대로다(운영 DB 상금 2건 "400","1000" 모두 숫자 — 소급 변화 0).
--
-- 롤백: 아래 본문에서 T 분기를 빼고 예전 한 줄로 되돌린다:
--   select coalesce(round(substring(replace(coalesce(p_prize,''),',','') from '[0-9]+(?:\.[0-9]+)?')::numeric)::int, 0);

create or replace function public.parse_prize_man(p_prize text)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    -- "1T" · "2 t" · "10T" → 장수 × 10만. T 앞의 숫자만 본다.
    when replace(coalesce(p_prize,''),',','') ~* '^\s*[0-9]+(?:\.[0-9]+)?\s*T\s*$'
      then coalesce(round(substring(replace(coalesce(p_prize,''),',','') from '[0-9]+(?:\.[0-9]+)?')::numeric * 10)::int, 0)
    else coalesce(round(substring(replace(coalesce(p_prize,''),',','') from '[0-9]+(?:\.[0-9]+)?')::numeric)::int, 0)
  end;
$$;

-- IMMUTABLE 순수 함수 — 기존 ACL(PUBLIC 실행 가능)은 의도된 것이라 그대로 둔다(읽기 전용 파서).
