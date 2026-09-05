-- ============================================================================
-- 손님 '내 바인 요청' 조회를 매장 영업일 기준으로 (모바일 점검 2026-09-05 확정 결함 #1)
--
-- 증상: 자정을 넘긴 미마감 장부에서 낸 바인 요청은 서버(request_buyin·이용권 트리거, 20260818f)가
--   ledger_business_date(venue_id) = **어제** 날짜로 저장하는데, 클라이언트(getMyBuyinRequestsToday)는
--   로컬 '오늘' 하나만 .eq 로 읽어 홈 '바인 요청' 배너·라이브 '내 토너'·대기 취소 버튼이 0건이 됐다.
--   (운영자 보드는 두 날짜를 읽어 보였다 — 손님 화면만 거짓말.)
--
-- 수정: 날짜 규칙을 서버(영업일 헬퍼가 있는 곳)로 옮긴다. get_my_buyin_requests_current() 는
--   본인 행 중 session_date = ledger_business_date(venue_id) 인 것만 돌려준다 — 어제 장부가 아직
--   열려 있으면 어제 행이 보이고, 운영자가 마감하는 순간 자연 소멸한다(다음날 종일 남는 stale 배너 없음).
--   ⚠ 클라이언트에서 [오늘, 어제] 두 날짜를 무조건 .in 으로 읽는 방식은 금지 — 어제 approved/rejected
--   행이 다음날 종일 '참가 승인·내 토너' 로 오노출된다.
--
-- 권한: SECURITY INVOKER — 본인 행은 lbr_select RLS(user_id = auth.uid()) 로 이미 읽힌다.
--   ledger_business_date 는 authenticated 에 execute 가 있다(20260818f). venues 는 left join —
--   승인 취소된 매장이라도 요청 행은 남기고 이름만 비운다(클라가 '매장' 폴백).
-- 소급 영향: 데이터 변경 0(읽기 함수 추가만). 롤백: drop function public.get_my_buyin_requests_current();
-- ============================================================================

create or replace function public.get_my_buyin_requests_current()
returns table(
  id uuid, venue_id uuid, status text,
  requested_game_seq smallint, game_seq smallint, resolve_note text, venue_name text
)
language sql
stable
set search_path = public, pg_temp
as $function$
  select r.id, r.venue_id, r.status, r.requested_game_seq, r.game_seq, r.resolve_note, v.name
  from public.ledger_buyin_requests r
  left join public.venues v on v.id = r.venue_id
  where r.user_id = auth.uid()
    and r.session_date = public.ledger_business_date(r.venue_id)  -- 매장별 '지금 진행 중인 장부 날짜'(어제 미마감이면 어제, 아니면 KST 오늘)
  order by r.created_at desc;
$function$;

revoke all on function public.get_my_buyin_requests_current() from public, anon;
grant execute on function public.get_my_buyin_requests_current() to authenticated, service_role;
