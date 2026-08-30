-- 20260830i — 내가 보유한 이용권의 **발급 매장명**을 보유자에게 확실히 돌려준다(오너 지시 #19).
--
-- 왜 필요한가: 지갑은 지금 PostgREST 임베드(`venue:venue_id(name)`)로 매장명을 얻는데,
--   venues 의 RLS(venues_select)는 `approved = true or owner or admin` 이다.
--   → **미승인 매장이 발급한 이용권의 보유자에게는 매장명이 통째로 null 로 온다**
--     (2026-08-30 실측: venues 4곳 중 approved=false 가 2곳. 즉 잠재가 아니라 현재 조건이다).
--   손님 화면에는 '기타 매장'이라고 뜨고, 정작 "어느 매장이 준 건가"라는 질문에 앱이 답하지 못한다.
--
-- 왜 안전한가: 보유자는 이미 store_vouchers_select 로 그 이용권 행(venue_id 포함)을 읽을 수 있다.
--   여기서 새로 열어 주는 것은 **자기가 들고 있는 이용권의 발급 매장 이름 한 컬럼**뿐이다.
--   매장 목록을 훑는 용도로는 쓸 수 없다(보유 이용권이 없으면 0행).
--
-- 추가만 한다 — venues 의 RLS 도, 기존 임베드 조회도 건드리지 않는다.

create or replace function public.my_voucher_venues()
returns table (venue_id uuid, venue_name text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select distinct v.id, v.name
  from public.store_vouchers sv
  join public.venues v on v.id = sv.venue_id
  where sv.holder_user_id = (select auth.uid())
$function$;

revoke all on function public.my_voucher_venues() from public, anon;
grant execute on function public.my_voucher_venues() to authenticated, service_role;
