select set_config('lock_timeout', '3s', true);
select set_config('statement_timeout', '60s', true);
-- ============================================================================
-- 20261009a — 이용약관 제4판(제11조제4항, audit12 UP-20) : 서버가 아는 현재 약관 판 3 → 4
--
-- ✅ 적용 완료 2026-10-09 09:22 KST(리드, 운영 배포 e0965338 확인 직후). 리허설 4/4 PASS · 음성 대조(파일 없이) 1/4 → 적용 후 실측:
--    prosrc ' select 4 ' · anon false · authenticated true · service_role true. 같은 날 09:23 서비스 내 공지 등록(marketplace_notices 'pinned'·'all').
-- (작성 당시 메모) 미적용(작성 2026-10-09, home-team). 적용은 리드 — 클라이언트 배포(LEGAL_VERSION 4) 직전 또는 직후, **늦어도 제4판 시행일
--    (legalDeploy TERMS_V4_EFFECTIVE_ISO = 2026-11-09) 0시 KST 전**.
--    · 제3판과 달리 시행일이 공지 30일 뒤라 배포 당일엔 아무도 차단되지 않는다(제3판 동의자 = notice). 그래서 급하지 않다.
--    · 배포 뒤 늦게 올리면: 그 사이 가입한 회원이 least(4, 3) = 3 으로 기록돼 시행일에 한 번 더 동의를 받는다(영향 작음).
--    · 시행일까지 안 올리면: 재동의(p_version 4)가 3 으로 깎여 게이트가 닫히지 않는다 — 전 회원이 갇힌다. 반드시 그 전에.
--
-- 바꾸는 것: 판 숫자 하나. 쓰는 곳은 20261006p 머리말과 같다(record_my_legal_consent clamp · 가입 함수의 판 기록 · 20261006l 표시용 coalesce).
-- 판을 비교해 서버에서 막는 곳은 없다 — 시행일 판정은 클라이언트 legalConsentStage(CONSENT_GATES [4, 시행일]).
-- 반환 타입·인자 그대로 CREATE OR REPLACE → ACL 보존. 관행대로 REVOKE/GRANT 를 다시 적는다(새로 만들어지는 경우 대비).
--
-- 리허설: supabase/tests/20261009a_rehearsal.sql (20261006p 와 같은 방식 — 이 파일과 이어 붙여 암묵 트랜잭션 → ZZ999 롤백). 미실행.
-- ============================================================================

create or replace function public.current_legal_version()
returns integer
language sql
immutable
security invoker
set search_path to 'public', 'pg_temp'
as $fn$ select 4 $fn$;
revoke all on function public.current_legal_version() from public, anon;
grant execute on function public.current_legal_version() to authenticated, service_role;
