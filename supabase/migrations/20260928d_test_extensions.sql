-- ✅ 적용 완료 2026-09-28 (nuri-lead, MCP execute_sql). 오너 승인: DB 검사 확장 설치.
-- pgTAP 1.3.3 · plpgsql_check 2.8 을 API 에 노출되지 않는 extensions 스키마에 설치(데이터·권한 변경 없음).
-- pg_trgm 1.6 은 이미 public 에 설치돼 있었다(초성·유사 검색 인덱스용).
-- 용도: begin…rollback 리허설 안의 표준 단언(function_privs_are·policies_are 등)과 plpgsql 함수 정적 검사.
create extension if not exists pgtap with schema extensions;
create extension if not exists plpgsql_check with schema extensions;
