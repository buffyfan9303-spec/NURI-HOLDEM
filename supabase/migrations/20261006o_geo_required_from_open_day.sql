select set_config('lock_timeout', '3s', true);
select set_config('statement_timeout', '60s', true);
-- ⏳ 미적용(home-team 2026-10-06, 브랜치 NURI/legal2-1006). 적용 판단·실행은 nuri-lead. 위 두 줄을 떼지 말 것.
--   선행: 20261004d(_checkin_geo_required_from 생성). 화면 배포(LOCATION_TERMS_EFFECTIVE = LEGAL_DEPLOY_ISO)와 **같은 날** 적용한다.
-- 리허설: supabase/tests/20261006o_rehearsal.sql (r0 + 이 파일 · 통째 롤백)
--
-- 20261006o — 오너 결정 2026-10-06 "서비스에 사람이 없으니 목요일 기준으로 — 시행은 모든 약관상 목요일부터"
--   위치기반서비스 이용약관 제3판 시행일(= 위치 확인 출석 매장에서 동의·위치 없는 손님의 직접 출석을 서버가 거부하기 시작하는 시각)을
--   2026-11-05 → 2026-10-08 00:00 KST(정식 오픈일)로 당긴다. 클라 src/lib/locationTerms.ts LOCATION_TERMS_EFFECTIVE(= legalDeploy LEGAL_DEPLOY_ISO)와
--   같은 값이다(locationTerms.contract.test ① 이 이 파일과 클라 값을 맞댄다). 배포가 늦어지면 이 파일과 LEGAL_DEPLOY_ISO 를 같은 커밋에서 옮긴다.
--   함수 본문은 20261004d 와 같고 날짜만 다르다. 권한은 CREATE OR REPLACE 로 보존되지만 새로 만들어지는 경우를 위해 다시 적는다.

do $gate$
begin
  if to_regprocedure('public._checkin_geo_required_from()') is null then
    raise exception '20261006o 게이트: _checkin_geo_required_from() 이 없다 — 20261004d 를 먼저 적용하라'; end if;
end $gate$;

create or replace function public._checkin_geo_required_from()
 returns timestamptz
 language sql
 stable
 set search_path = public, pg_temp
as $function$
  select timestamptz '2026-10-08 00:00:00+09'
$function$;
revoke all on function public._checkin_geo_required_from() from public, anon, authenticated;
grant execute on function public._checkin_geo_required_from() to service_role;

do $chk$
begin
  if (select public._checkin_geo_required_from()) is distinct from timestamptz '2026-10-08 00:00:00+09' then
    raise exception '20261006o 자가검사: 시행 시각이 2026-10-08 00:00 KST 가 아니다'; end if;
  if has_function_privilege('anon', 'public._checkin_geo_required_from()', 'execute')
     or has_function_privilege('authenticated', 'public._checkin_geo_required_from()', 'execute') then
    raise exception '20261006o 자가검사: 내부 함수가 anon/authenticated 에 열려 있다'; end if;
end $chk$;
