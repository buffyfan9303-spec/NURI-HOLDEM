-- 20261004b — 새 표·함수 기본 권한을 fail-closed 로 (재점검 2회차 보안 ⑨, critical 권고 · 리드 판단 2026-10-04)
-- ✅ 적용 완료 2026-10-04(리드, HTTP 201) — 리허설 REHEARSAL_OK, 음성 대조(ALTER 없이) DEFACL_CHECK_FAIL 확인. 적용 후 pg_default_acl: public 표 anon=r(읽기만), public 함수 anon·PUBLIC 없음, 전역 함수 postgres=X 만. storage 스키마는 Supabase 관리라 그대로.
-- 왜: 20261003k 로 기존 표의 anon 쓰기 GRANT 를 회수했지만, postgres 가 public 에 새로 만드는 표는 기본값으로
--     anon 쓰기 권한을 다시 받고, 새 함수는 PUBLIC EXECUTE 기본값으로 anon 이 실행할 수 있다.
--     REVOKE 를 빠뜨린 마이그레이션 하나가 곧바로 비로그인 쓰기·실행을 연다.
-- 영향: 앞으로 anon 이 써야 하는 새 표 / anon 이 불러야 하는 새 읽기 RPC 는 마이그레이션에서 `grant … to anon` 을 명시해야 한다
--       (빠뜨리면 막히는 쪽). authenticated·service_role 기본 권한과 기존 객체 권한은 바뀌지 않는다.
alter default privileges for role postgres in schema public revoke insert, update, delete, truncate, maintain on tables from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres revoke execute on functions from public;

-- 자가검사: 새로 만든 표·함수로 확인하고 지운다(같은 트랜잭션).
do $chk$
declare a_ins boolean; a_sel boolean; f_anon boolean; f_auth boolean; f_svc boolean; ce boolean;
begin
  create table public._defacl_probe(id int);
  create function public._defacl_probe_fn() returns int language sql as 'select 1';
  a_ins := has_table_privilege('anon','public._defacl_probe','INSERT');
  a_sel := has_table_privilege('anon','public._defacl_probe','SELECT');
  f_anon := has_function_privilege('anon','public._defacl_probe_fn()','EXECUTE');
  f_auth := has_function_privilege('authenticated','public._defacl_probe_fn()','EXECUTE');
  f_svc := has_function_privilege('service_role','public._defacl_probe_fn()','EXECUTE');
  ce := has_table_privilege('anon','public.client_errors','INSERT');
  drop function public._defacl_probe_fn(); drop table public._defacl_probe;
  if a_ins or f_anon or not f_auth or not f_svc or not ce then
    raise exception 'DEFACL_CHECK_FAIL anon_ins=% anon_sel=% fn_anon=% fn_auth=% fn_svc=% client_errors_anon_ins=%', a_ins, a_sel, f_anon, f_auth, f_svc, ce;
  end if;
end $chk$;
