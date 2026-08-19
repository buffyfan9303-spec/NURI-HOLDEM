-- 감사 #6/#7 (critical): my_role() <> 'admin' 가드는 anon(auth.uid()=NULL)일 때
-- my_role()=NULL → (NULL <> 'admin')=NULL → plpgsql if 분기가 스킵되어 가드가 열린다(fail-open).
-- 비로그인(anon)이 admin_grant_voucher_quota / admin_decide_voucher_credit 등 관리 전용 RPC 를
-- 그대로 통과시켰다(임의 매장 발급한도 무제한 충전·충전요청 셀프 승인).
-- 조치 ① 모든 my_role() <> 'admin' 가드를 IS DISTINCT FROM 으로 NULL-safe 화(non-admin·anon 모두 차단)
--      ② 관리 전용 RPC 의 anon EXECUTE 회수. CREATE OR REPLACE 는 ACL 을 보존하므로 REVOKE 를 별도 수행.
DO $guard$
DECLARE r record; newdef text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) ~ 'my_role\(\)\s*<>\s*''admin'''
  LOOP
    newdef := regexp_replace(
      pg_get_functiondef(r.oid),
      'my_role\(\)\s*<>\s*''admin''',
      'my_role() IS DISTINCT FROM ''admin''',
      'g'
    );
    EXECUTE newdef;
  END LOOP;
END
$guard$;

DO $revoke$
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
        'set_app_setting','transfer_venue_primary'
      )
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || r.sig::text || ' FROM anon';
  END LOOP;
END
$revoke$;
