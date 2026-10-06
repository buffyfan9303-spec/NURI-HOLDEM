select set_config('lock_timeout', '3s', true);
select set_config('statement_timeout', '60s', true);
-- ============================================================================
-- 20261006p — 이용약관 제3판(활동 포인트, 약관 재검토 P2-2) : 서버가 아는 현재 약관 판 2 → 3
--
-- ⏳ 미적용(작성 2026-10-06, home-team). 적용 순서: 20261006o(위치 출석 시행일, #193) 다음. 적용은 리드 — 🔴 **클라이언트 배포(LEGAL_VERSION 3) 직전**에 한다.
--    제3판 시행일 = 배포일(legalDeploy TERMS_V3_EFFECTIVE_ISO, 2026-10-06 오너 결정)이라 새 번들은 배포 즉시 제2판 동의자에게 재동의 게이트를 띄운다.
--    배포 뒤에 늦게 올리면: 재동의(record_my_legal_consent p_version=3)가 least(…, current_legal_version()) 로 2 로 깎여
--    동의해도 게이트가 닫히지 않는다(다시 뜬다) — 정식 오픈 당일 전 회원이 갇힌다.
--    배포보다 몇 분 먼저 올리면: 그 사이 옛 번들(제2판 본문)로 가입한 회원이 3 으로 기록될 뿐이다(영향 작음 — 이쪽을 택한다).
--
-- 왜 이것만 바꾸나
--   · 쓰는 곳은 셋뿐이다: record_my_legal_consent(상한 clamp) · 가입 함수들(동의 판 기록) · 20261006l 의 표시용 coalesce.
--     판을 비교해 **서버에서 막는** 곳은 없다 — 시행일 전 '제2판 동의 유효'(공지 기간)는 클라이언트 legalConsentStage 가 판정한다
--     (src/lib/legalVersion.ts CONSENT_GATES). 그래서 시행일 판정을 위한 DB 변경은 없다.
--   · 반환 타입·인자 그대로 CREATE OR REPLACE → ACL 보존. 관행대로 REVOKE/GRANT 를 다시 적는다(새로 만들어지는 경우 대비).
--   · immutable 함수지만 이를 인라인한 plpgsql 캐시 계획은 pg_proc 변경으로 무효화된다(plancache 가 함수 의존을 기록).
--
-- 리허설: supabase/tests/20261006p_rehearsal.sql (geo-notice-1005/rehearse-geo.mjs 로 이 파일과 이어 붙여 암묵 트랜잭션 → ZZ999 롤백)
-- ============================================================================

create or replace function public.current_legal_version()
returns integer
language sql
immutable
security invoker
set search_path to 'public', 'pg_temp'
as $fn$ select 3 $fn$;
revoke all on function public.current_legal_version() from public, anon;
grant execute on function public.current_legal_version() to authenticated, service_role;
