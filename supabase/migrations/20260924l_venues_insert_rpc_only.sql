-- 20260924l — 매장 행은 서버 함수로만 만든다 (VOUCHER-SECURITY-DURABILITY N1, critical-reviewer 2026-09-24).
-- ✅ 2026-09-24 라이브 적용 완료.
--   대조(적용 전): 업주가 approved=true·voucher_quota=100000·voucher_issue_approved=true 인 매장을 직접 INSERT → 통과
--     (critical 리허설 R1 에서 그 매장으로 issue_voucher 1000장 발급까지 재현).
--   적용 후: 같은 직접 INSERT 42501 · create_my_venue RPC 정상(approved=f, quota=0, issue=f).
-- 원인: venues 는 UPDATE 만 guard_venue_verification 이 막고 INSERT 는 venues_insert(역할만 확인)로 열려 있었다.
-- src 의 매장 생성은 전부 create_my_venue·admin_create_venue(SECURITY DEFINER) — 직접 INSERT 0곳.
drop policy if exists venues_insert on public.venues;
revoke insert on public.venues from anon, authenticated;
do $chk$ begin
  if has_table_privilege('authenticated','public.venues','INSERT') then raise exception '[chk] insert'; end if;
  if exists (select 1 from pg_policies where tablename='venues' and cmd='INSERT') then raise exception '[chk] policy'; end if;
end $chk$;
