-- 2026-06-23 (감사 #후속): checkins 테이블을 supabase_realtime 퍼블리케이션에 추가.
-- CheckinModal 오늘 방문 명단이 subscribeCheckins(postgres_changes INSERT) 로 실시간 갱신되지만,
-- checkins 가 퍼블리케이션에 없어 채널만 열리고 INSERT 이벤트가 오지 않던 문제 수정.
-- INSERT 페이로드만 필요하므로 기본 REPLICA IDENTITY(default) 로 충분 — 변경 불필요.
-- RLS checkins_select( user_id=auth.uid() OR can_manage_venue(venue_id) )가 실시간에도 그대로 적용됨.
-- 이미 등록돼 있으면 skip(멱등).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='checkins') then
    alter publication supabase_realtime add table public.checkins;
  end if;
end $$;
