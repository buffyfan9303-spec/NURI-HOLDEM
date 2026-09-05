-- ============================================================================
-- 테이블 권한 위생 — anon·authenticated 의 TRUNCATE / REFERENCES / TRIGGER 전수 회수 (2026-09-05)
--
-- 왜: Supabase 기본 GRANT(ALL ON TABLES TO anon, authenticated) 가 93~94개 public 테이블 전부에
--     TRUNCATE·REFERENCES·TRIGGER 를 남겨 두고 있었다(venue_rankings 점검 중 발견). 셋 다 RLS 가 막지
--     못하는 권한이다 — TRUNCATE 는 정책을 타지 않고 표를 비우며, REFERENCES/TRIGGER 는 DDL 시점 권한이라
--     클라이언트 롤이 가질 이유가 없다. PostgREST 가 직접 노출하진 않지만 방어 심층(§보안 표준 3).
-- 범위: SELECT/INSERT/UPDATE/DELETE 는 손대지 않는다(RLS 가 관장). service_role 무변경.
-- 앞으로: 같은 스키마에 새로 만드는 표에도 셋을 주지 않도록 postgres 롤의 기본 권한을 고친다.
-- 소급: 데이터 변경 0. 롤백: grant truncate, references, trigger on all tables in schema public to anon, authenticated;
-- ============================================================================

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
