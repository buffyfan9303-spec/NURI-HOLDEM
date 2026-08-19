-- 감사 #6/#7 방어 심층화: 관리 전용 RPC 는 PUBLIC 기본 EXECUTE 때문에 REVOKE ... FROM anon 만으로는
-- anon(PUBLIC 멤버)이 여전히 실행 가능했다. PUBLIC 에서 회수하고 authenticated 에만 부여한다
-- (함수 내부 가드가 my_role() IS DISTINCT FROM 'admin' 로 non-admin authenticated 를 다시 막는다 — 이중 방어).
DO $revoke2$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.proname IN (
        'admin_create_venue','admin_decide_venue_owner','admin_decide_voucher_credit',
        'admin_grant_voucher_quota','admin_set_nickname','admin_update_venue',
        'admin_list_venue_owner_requests','admin_list_voucher_credit_requests',
        'set_app_setting','transfer_venue_primary','admin_platform_stats',
        'admin_set_post_blinded','grant_ledger_access'
      )
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || r.sig::text || ' FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || r.sig::text || ' TO authenticated';
  END LOOP;
END
$revoke2$;
