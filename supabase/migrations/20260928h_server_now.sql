-- ✅ 적용 완료 2026-09-28 (nuri-lead, MCP execute_sql). 실측: anon REST POST /rpc/server_now → HTTP 200 "2026-09-28T15:08:51.077191+00:00".
--
-- 결함(모바일 점검 D9): 5433491d 의 클락 서버 시각 보정(src/lib/serverTime.ts)이 부르는 server_now() 가
--   저장소에도 라이브에도 없어 모든 페이지에서 404 콘솔 오류가 나고, 보정값이 0 으로 떨어져 운영에서 꺼져 있었다.
-- 읽기 전용(now() 반환)·민감 정보 없음 → 비로그인 클락 TV 도 쓰도록 anon 허용(보안 표준 3: 읽기 RPC 는 anon 허용).

create or replace function public.server_now() returns timestamptz
language sql stable security invoker set search_path = public, pg_temp as $$ select now() $$;
revoke execute on function public.server_now() from public;
grant execute on function public.server_now() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
