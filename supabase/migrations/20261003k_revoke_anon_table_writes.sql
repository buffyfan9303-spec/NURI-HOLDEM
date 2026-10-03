-- ⏳ 적용 전 — 리드 적용 예정. 라이브 미적용. (store-team 2026-10-03 · critical-reviewer recheck1 R3 초안 + anon 쓰기 경로 전수 확인)
-- 회수 전 확인(라이브 2026-10-03, 읽기 조회): public 의 쓰기(INSERT/UPDATE/DELETE/ALL) 정책 78개 중 anon 을 대상으로 한 것은 client_errors_insert 하나뿐.
--   `to public` 정책은 모든 분기가 auth.uid()·my_role()·can_*·is_*·*_ok() 를 거쳐 비로그인은 원래 0행이다(게이트 없는 public 쓰기 정책 0).
--   화면의 비로그인 쓰기도 src/lib/errorLog.ts 의 client_errors insert 하나뿐(returning 없음 → SELECT 권한 불필요).
--   그래서 회수 뒤에도 0행 고장으로 바뀌는 비로그인 기능은 없다. 아래 자가검사가 '정책 쪽 anon 쓰기 경로 = client_errors 하나'를 다시 단언한다.
-- 리허설: Documents/누리홀덤_영상분석_0930/recheck1-sec-fix-1003 — node rehearse.mjs 00_harness.sql <이 파일> 80_anon_write_check.sql
-- 초안(미적용) 20261003k_revoke_anon_table_writes — 요구 키 recheck1-security-1003.md#R3 · critical-reviewer 2026-10-03 · 적용 판단은 리드
-- 무엇: public 테이블 86개에 anon 의 INSERT/UPDATE/DELETE GRANT 가 남아 있다(Supabase 기본 GRANT). RLS 가 전부 막고 있어 지금 뚫린 곳은 없지만
--   RLS 를 실수로 끄거나 `to public` 정책에 auth 무관 분기를 넣는 순간 비로그인 쓰기가 열린다(심층 방어).
--   비로그인 쓰기가 필요한 곳은 client_errors INSERT(오류 수집, 정책 client_errors_insert) 하나뿐이라 그것만 남긴다.
--   조회수 증가(increment_*_view)·예약 수 등은 DEFINER RPC 라 테이블 GRANT 와 무관.
-- 범위 밖: 기본 권한(ALTER DEFAULT PRIVILEGES) — 새 테이블은 여전히 anon 쓰기 GRANT 를 받는다. 리드가 정할 것(Supabase 관리 기본값).
-- 리허설: node rehearse.mjs 00_harness.sql 20261003k_revoke_anon_table_writes.draft.sql 80_anon_write_check.sql
do $rv$
declare r record;
begin
  for r in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p') and c.relname <> 'client_errors' loop
    execute format('revoke insert, update, delete on public.%I from anon', r.relname);
  end loop;
  revoke update, delete on public.client_errors from anon;
end $rv$;
do $chk$ begin
  if exists (select 1 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p')
               and (has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete')
                    or (c.relname <> 'client_errors' and has_table_privilege('anon', c.oid, 'insert')))) then
    raise exception '자가검사: anon 쓰기 GRANT 가 남았다';
  end if;
  if not has_table_privilege('anon', 'public.client_errors', 'insert') then raise exception '자가검사: client_errors 비로그인 수집이 막혔다'; end if;
end $chk$;

do $chkb$
declare ex text;
begin
  -- 다른 비로그인 쓰기 경로가 정책에 생겨 있으면(=GRANT 회수가 그 기능을 0행으로 만든다) 멈춘다.
  select string_agg(tablename || '.' || policyname, ', ') into ex from pg_policies
   where schemaname = 'public' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and roles::text ~ '\manon\M'
     and not (tablename = 'client_errors' and policyname = 'client_errors_insert');
  if ex is not null then raise exception '20261003k: client_errors 말고도 anon 쓰기 정책이 있다 — 회수하면 그 기능이 막힌다: %', ex; end if;
end $chkb$;
