-- withdrawn_identities 는 RLS 정책 0개로 이미 차단되지만, 신규 테이블 기본 GRANT(anon/authenticated)를
-- 명시 회수해 CI 해시가 어떤 경로로도 조회되지 않게 한다(SECURITY DEFINER 함수만 접근).
REVOKE ALL ON TABLE public.withdrawn_identities FROM anon, authenticated;
