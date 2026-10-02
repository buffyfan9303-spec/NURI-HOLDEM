-- ✅ 적용 완료 2026-10-03 (리드, Management API). daily_purchase_count authenticated 회수 · ledger_is_closed anon 회수(authenticated 는 장부 정책이 사용). 리허설 6단언 PASS, 음성 대조(초안 없이 N1 FAIL). advisors WARN 299→297.
-- 초안(미적용) — 요구 키 PLAN-1002c-remaining.md#E4 ① · critical-reviewer 2026-10-03 · 적용은 리드
-- 무엇: 화면 호출 0곳·정책 사용 0곳인데 실행권이 열린 정보 노출 2건만 닫는다(둘 다 Low).
--   ① daily_purchase_count(uuid) — 아무 회원이 남의 오늘 구매 횟수를 센다. 호출부 = DEFINER 6개(buy_* · bump_post) 뿐(라이브 prosrc 검색), src rpc 0곳.
--   ② ledger_is_closed(uuid,date,smallint) — 비로그인이 매장·날짜·게임의 장부 마감 여부를 조회. authenticated 는 장부 RLS 4정책이 써서 유지,
--      anon 은 그 정책을 통과할 길이 없다(can_access_ledger=false) → anon 만 회수.
-- 회수하지 않는 것(근거는 E4-security-1003.md ①): purge_expired_home_banners·admin_set_shadowban(관리자 화면이 rpc 로 부르고 함수 안에서 my_role 검사) 등.
-- 리허설: node rehearse.mjs ../E4-sec-1003/00_harness.sql ../E4-sec-1003/30_revoke_low.draft.sql ../E4-sec-1003/31_revoke_check.sql
revoke execute on function public.daily_purchase_count(uuid) from public, anon, authenticated;
grant execute on function public.daily_purchase_count(uuid) to service_role;
revoke execute on function public.ledger_is_closed(uuid, date, smallint) from public, anon;
grant execute on function public.ledger_is_closed(uuid, date, smallint) to authenticated, service_role;
do $chk$ begin
  if has_function_privilege('authenticated', 'public.daily_purchase_count(uuid)', 'execute')
     or has_function_privilege('anon', 'public.ledger_is_closed(uuid, date, smallint)', 'execute')
     or not has_function_privilege('authenticated', 'public.ledger_is_closed(uuid, date, smallint)', 'execute') then
    raise exception '자가검사: 실행권 상태가 초안과 다르다';
  end if;
end $chk$;
