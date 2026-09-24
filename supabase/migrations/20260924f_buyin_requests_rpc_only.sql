-- 20260924f — 바인 요청은 서버 함수로만 쓴다 (STORE-CHAIN-AUDIT ② G1, critical-reviewer 2026-09-24).
-- ✅ 2026-09-24 라이브 적용 완료 · _restore_voucher_for_request md5 f70e386ef9b0319e53b93fb0132498bc
--   리허설(업주 c8e3… · 테스트 매장 dddd…): 업주 직접 UPDATE 42501 · reject_buyin_request RPC 정상(최종 rejected).
--   음성 대조: 적용 전 같은 계정의 직접 UPDATE rows=1 → 구멍이 라이브에 있었음.
-- 문제: lbr_update_op(can_access_ledger, with_check 없음) + 전체 컬럼 UPDATE 권한으로 업주·직원이 voucher_id·status 를
--   직접 바꿔 reject 트리거(_restore_voucher)가 다른 매장 이용권까지 되살렸다(이중 사용). 20260924d 의 옆 테이블 경로.
-- 이 테이블에 쓰는 곳은 전부 SECURITY DEFINER 함수다(src 직접 쓰기 0곳 — grep 확인).
drop policy if exists lbr_insert_self on public.ledger_buyin_requests;
drop policy if exists lbr_update_op   on public.ledger_buyin_requests;
revoke insert, update, delete on public.ledger_buyin_requests from anon, authenticated;
-- 이중 방어: 복원 대상 이용권이 그 요청 매장에서 쓰인 것일 때만
create or replace function public._restore_voucher_for_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_voucher uuid;
begin
  if p_request_id is null then return; end if;
  select r.voucher_id into v_voucher
    from public.ledger_buyin_requests r join public.store_vouchers s on s.id = r.voucher_id
   where r.id = p_request_id and s.used_venue_id = r.venue_id;
  if v_voucher is null then return; end if;
  update public.ledger_buyin_requests set voucher_id = null where id = p_request_id;
  perform public._restore_voucher(v_voucher);
end $fn$;
revoke all on function public._restore_voucher_for_request(uuid) from public, anon, authenticated;
do $chk$ begin
  if has_table_privilege('authenticated','public.ledger_buyin_requests','UPDATE') then raise exception '[chk] update'; end if;
  if exists (select 1 from pg_policies where tablename='ledger_buyin_requests' and cmd in ('INSERT','UPDATE')) then raise exception '[chk] policy'; end if;
end $chk$;
