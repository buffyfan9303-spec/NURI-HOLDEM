-- 2026-06-24 #3 보강: 운영자 전용 회원 검색 RPC 3종에서 anon 실행권한 회수.
-- create-or-replace 가 기존 ACL(anon grant)을 보존해 익명도 호출은 가능했음(함수 내부 게이트가
-- auth.uid() null → 0행이라 실데이터 누출은 없었으나) — 익명이 아예 호출 못 하도록 방어선 강화.
-- 세 함수 모두 로그인한 운영자 화면에서만 호출됨(익명 플로우 없음).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('find_user_by_phone','find_user_for_transfer','search_members_for_ranking')
  loop
    execute format('revoke execute on function %s from anon', r.sig);
  end loop;
end $$;
