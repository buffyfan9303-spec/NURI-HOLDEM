-- 20260924q — 20260924i 의 B-2: 비로그인(anon)이 순위 수기 포인트의 사유(reason)·작성자(created_by)를 읽지 못하게.
-- ✅ 2026-09-24 운영 적용 완료(nuri-lead).
-- 선행 조건 확인: 라이브 번들 rankings-DF1-zTjp.js 가 공개 매장 페이지에서 reason 없는 select
--   ('id, name, points, entry_date, board_key')를 쓴다(08c8ed7d 배포분) — 이 회수 뒤에도 공개 순위가 권한 오류로 사라지지 않는다.
-- 리허설(begin…rollback, role anon): 공개 순위 조회 OK · reason BLOCKED · point_grants BLOCKED · league_entries.reason BLOCKED.
-- 적용 후: e2e/venue-points-anon.spec.ts PASS(로컬 빌드 → 운영 DB).
-- authenticated 는 건드리지 않는다(업주 화면 VenueCustomizePanel 이 reason 을 읽고, mustAffect(.select()) 삭제가 있다).
-- 같이 정리: point_grants·league_entries 에 anon 의 INSERT/UPDATE/DELETE 표 권한이 남아 있었다(RLS 가 막던 것) → 회수.
-- 되돌리기: grant select on public.venue_score_entries, public.league_entries to anon; (point_grants 는 anon 에 줄 이유가 없다)

revoke select on public.venue_score_entries from anon;
grant select (id, venue_id, board_key, name, points, entry_date, created_at) on public.venue_score_entries to anon;
revoke all on public.point_grants from anon;
revoke insert, update, delete on public.league_entries from anon;
revoke select on public.league_entries from anon;
grant select (id, league_id, venue_id, name, points, entry_date, created_at) on public.league_entries to anon;
