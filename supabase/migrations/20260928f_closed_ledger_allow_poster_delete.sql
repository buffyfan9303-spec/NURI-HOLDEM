-- ✅ 적용 완료 2026-09-28 (nuri-lead, MCP execute_sql). store-team 연동 점검 A2.
-- 마감된 장부에 연결된 포스터를 지우면 FK(ON DELETE SET NULL)가 schedule_id 를 비우려다
-- _guard_ledger_session_update 에 막혀 포스터 삭제가 실패했다(리허설 R1 = ERR '마감된 장부는 수정할 수 없습니다').
-- 수정: 마감 장부에서 schedule_id → null '만' 허용. 리허설: R1=OK(schedule_id null) · 마감 장부 제목 변경 DENY · 다른 포스터로 재연결 DENY.
create or replace function public._guard_ledger_session_update() returns trigger
language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare j_new jsonb; j_old jsonb;
begin
  if new.closed is distinct from old.closed then
    if not coalesce(public.can_manage_pos(old.venue_id), false) then
      raise exception '마감 상태 변경은 업주만 가능합니다';
    end if;
  elsif old.closed = true then
    j_new := to_jsonb(new) - 'close_memo' - 'closed_at' - 'updated_at' - 'clock_snapshot';
    j_old := to_jsonb(old) - 'close_memo' - 'closed_at' - 'updated_at' - 'clock_snapshot';
    if new.schedule_id is null and old.schedule_id is not null then
      j_new := j_new - 'schedule_id'; j_old := j_old - 'schedule_id';
    end if;
    if j_new is distinct from j_old then
      raise exception '마감된 장부는 수정할 수 없습니다 — 먼저 마감을 해제하세요';
    end if;
  end if;
  return new;
end; $function$;
revoke execute on function public._guard_ledger_session_update() from public, anon, authenticated;
