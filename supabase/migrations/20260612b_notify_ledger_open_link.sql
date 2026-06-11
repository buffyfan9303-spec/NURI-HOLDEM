-- 장부 시작 알림에 딥링크 추가 — 클릭 시 내 매장 탭 장부 섹션으로 바로 이동.
-- 적용일: 2026-06-12 (apply_migration 'notify_ledger_open_link')
CREATE OR REPLACE FUNCTION public.notify_ledger_open(p_venue_id uuid, p_title text, p_operator_ids uuid[])
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_cnt int := 0;
  v_venue text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if not public.can_access_ledger(p_venue_id) then raise exception '장부 권한이 없습니다'; end if;
  select name into v_venue from venues where id = p_venue_id;
  insert into notifications (user_id, type, title, message, link, avatar_text)
  select p.id, 'system', '📒 장부 시작',
         format('%s — %s 장부가 시작됐어요. 담당 직원으로 지정되었습니다.', coalesce(v_venue, '매장'), coalesce(nullif(trim(p_title), ''), '오늘')),
         '/my-store/ledger',
         '📒'
  from profiles p
  where p.id = any(p_operator_ids) and p.id <> auth.uid();
  get diagnostics v_cnt = row_count;
  return v_cnt;
end $function$;
