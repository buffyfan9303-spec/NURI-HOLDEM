-- 보안 감사 S3 조치(마스터 지시서 Phase 15-4): redeem_voucher 교차매장 소진 차단.
-- 기존 가드는 caller 가 '사용처 매장' 관리자인지만 검사했다 — 이용권이 어느 매장
-- 발급인지 검사하지 않아, 타 매장 이용권 UUID 를 알게 된 관리자가 남의 이용권을
-- 소진 표시할 수 있었다(UI 미사용 RPC 라 실악용 난이도는 높음 — 심층방어 결함).
-- CREATE OR REPLACE 는 기존 ACL 을 보존한다(기존 grant 구조 유지).
create or replace function public.redeem_voucher(p_voucher_id uuid, p_used_venue_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not can_manage_venue(p_used_venue_id) then raise exception '권한이 없습니다'; end if;
  update public.store_vouchers set status='used', used_venue_id=p_used_venue_id, used_at=now()
   where id=p_voucher_id and status='active'
     -- 발급매장 = 사용매장 일치 검증(추가): 다른 매장이 발급한 이용권은 소진 불가.
     and venue_id = p_used_venue_id;
  if not found then raise exception '사용 처리할 수 없는 이용권입니다 (이미 사용/만료/취소되었거나 이 매장 발급이 아님)'; end if;
end $function$;
