-- ============================================================================
-- client_errors 에 비로그인이 무제한으로 쓸 수 있던 구멍을 막는다 (2026-09-07 보안 점검)
--
-- 무엇이 열려 있었나
--   client_error_rate_ok() 본문이 `select auth.uid() is null or (내 최근 1분 건수) < 15` 였다.
--   앞의 `auth.uid() is null` 이 **비로그인에서 무조건 true** 로 단락평가돼, 뒤의 건수 검사를
--   아예 보지 않았다. 이 술어가 client_errors INSERT 정책의 WITH CHECK 이므로,
--   anon 키만 있으면(번들에 공개돼 있다) 누구나 이 테이블에 행을 무한히 넣을 수 있었다.
--   현재 10,337행 중 8,125행이 이미 비로그인 유입이다(정상 트래픽 24시간 48건).
--
-- 무엇을 바꿨나 — 함수 본문 한 곳뿐
--   비로그인도 상한을 받는다. 단 사용자를 특정할 수 없으므로 **전역** 상한으로 센다:
--   user_id is null 인 최근 1분 행이 60건 미만일 때만 통과. 정상 트래픽이 하루 48건이라
--   1분 60건은 실사용에 닿지 않는다(실측: 지금 최근 1분 0건).
--   로그인 사용자는 종전과 동일하게 **자기 행만** 세고 상한도 15로 같다 — 비로그인 폭주에
--   휩쓸리지 않는다(롤백 검증 ③에서 확인).
--
-- 무엇을 바꾸지 않았나
--   · 반환 타입(boolean) · language sql · SECURITY DEFINER · search_path=public, pg_temp 그대로.
--   · 정책·테이블·인덱스·기존 행 0건 변경.
--   · ACL 은 CREATE OR REPLACE 가 초기화하므로(nuri-migration §1) 기준값을 그대로 재발급한다.
--     기준: =X/postgres · anon=X · authenticated=X · service_role=X — 이 함수는 RLS WITH CHECK
--     안에서 평가되므로 INSERT 하는 롤이 실행할 수 있어야 한다. 좁히면 정책이 깨진다.
--
-- 검증 (적용 전 트랜잭션 롤백으로 실측)
--   ① 지금 상태에서 비로그인 통과(최근 1분 0건) ② 같은 트랜잭션에서 61건을 만들면 차단
--   ③ 그 상태에서 로그인 사용자는 여전히 통과 → ROLLBACK-OK 로 되돌림, 운영 데이터 무변화.
-- ============================================================================

create or replace function public.client_error_rate_ok()
returns boolean
language sql
volatile
security definer
set search_path = public, pg_temp
as $function$
  select case
    when (select auth.uid()) is not null then
      -- 로그인: 종전과 동일 — 본인 행만 센다.
      (select count(*) from public.client_errors c
        where c.user_id = (select auth.uid())
          and c.created_at > now() - interval '1 minute') < 15
    else
      -- 비로그인: 사용자를 특정할 수 없으니 전역 상한. 정상 트래픽(24h 48건)과 한참 떨어져 있다.
      (select count(*) from public.client_errors c
        where c.user_id is null
          and c.created_at > now() - interval '1 minute') < 60
  end;
$function$;

-- CREATE OR REPLACE 가 ACL 을 초기화한다 → 기준 ACL 을 그대로 복원한다.
grant execute on function public.client_error_rate_ok() to anon, authenticated, service_role;

comment on function public.client_error_rate_ok() is
  'client_errors INSERT 레이트 리밋. 로그인=본인 1분 15건, 비로그인=전역 1분 60건. (20260907a)';
