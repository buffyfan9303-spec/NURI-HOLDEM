-- 20260923a — 팔로워 알림 하루 3회 한도를 "최근 24시간" 에서 **KST 자정 기준 오늘** 로 바꾼다.
--
-- ✅ **2026-09-23 라이브 적용 완료** (project idsxiqspecrucvfvtgbw · MCP execute_sql · begin…commit, 자가검사 통과)
--   적용 후 실측:
--     _venue_announce_sent_today  md5 bedb1a6b517e8302a784bf4b3be718e5 · ACL {postgres, service_role}
--     send_venue_announcement     md5 e5fe1447738f24331f1b109b20b32ccf · ACL {postgres, authenticated, service_role}  ← 적용 전 df10c665…
--     venue_announce_status       md5 ec1aaac3e006c43e949840ba189432fc · ACL {postgres, anon, authenticated, service_role}(변화 없음)
--     보안 advisor ERROR 0
--   적용 전 롤백 리허설(업주 1a8c… 의 팔로워 0 매장 615376fa… 로 — 알림 행이 생기지 않는 매장을 골랐다):
--     T1 어제 23:30 KST 1건 + 오늘 2건 → sent_today=2  (24시간 규칙이었다면 3 — 이 값이 규칙 변경의 증거)
--     T2 3번째 발송 성공 · T3 sent_today=3 · T4 4번째 차단('오늘은 3회까지…')
--     T5 남의 매장(f35b…) 발송 차단('권한이 없습니다') · T6 남의 매장 상태 0행 · T6b authenticated 가 헬퍼 직접 호출 42501
--     T7 비로그인 상태 0행 · T8 비로그인 발송 42501
--     롤백 후 send md5 df10c665… 그대로 · 헬퍼 없음 · venue_announcements 0행 확인.
--
-- 오너 결정(2026-09-23): "자정 기준". 화면은 '오늘 N/3' 인데 서버는 최근 24시간을 세서,
-- 21시에 3회 보내면 다음 날 09시에도 막혔다(store-team 점검 FOLLOWER-PUSH-VERIFY).
--
-- 바꾸는 것
--   send_venue_announcement : 오늘(KST) 발송 수로 한도 판정 + 매장별 advisory lock 으로 동시 발송 4번째 통과 차단
--   venue_announce_status   : sent_today 를 같은 KST 오늘 기준으로 — 화면 카운터와 서버 판정이 같은 식을 쓴다
--                             + 권한 가드를 NULL-safe(coalesce) 로. 현재 can_manage_pos(비로그인)=false 라 열려 있진 않다(실측).
-- 바꾸지 않는 것: 권한 판정·수신자 집합·알림 문구·링크·반환 타입(→ CREATE OR REPLACE, ACL 보존. 그래도 아래에 다시 적는다).
--
-- 적용 전 라이브 실측(2026-09-23 read-only): PG 17.6 · 두 함수 ACL
--   send_venue_announcement {postgres, authenticated, service_role}
--   venue_announce_status   {postgres, anon, authenticated, service_role}  (읽기 RPC — anon 허용 유지)
--   venue_announcements 0행.

-- 오늘(KST) 판정은 한 곳에서만 — 두 함수가 같은 식을 부른다(복제 금지, HANDOVER §3-G).
create or replace function public._venue_announce_sent_today(p_venue_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int from public.venue_announcements
   where venue_id = p_venue_id
     and (sent_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date;
$$;
revoke all on function public._venue_announce_sent_today(uuid) from public, anon, authenticated;
grant execute on function public._venue_announce_sent_today(uuid) to service_role;

create or replace function public.send_venue_announcement(p_venue_id uuid, p_title text, p_message text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_count int; v_today int;
begin
  -- 방어적 게이트: 무인증/권한없음/NULL 전부 차단(NULL → false 로 강제)
  if auth.uid() is null or not coalesce(public.can_manage_pos(p_venue_id), false) then
    raise exception '권한이 없습니다';
  end if;
  if coalesce(trim(p_title),'') = '' or coalesce(trim(p_message),'') = '' then raise exception '제목과 내용을 입력하세요'; end if;
  -- 같은 매장의 동시 발송을 직렬화 — 세고 넣는 사이에 다른 트랜잭션이 끼어 4번째가 통과하던 틈을 막는다.
  perform pg_advisory_xact_lock(hashtext('venue_announce:' || p_venue_id::text));
  v_today := public._venue_announce_sent_today(p_venue_id);
  if v_today >= 3 then raise exception '오늘은 3회까지 보낼 수 있어요 (자정에 초기화)'; end if;
  insert into public.notifications (user_id, type, title, message, link, read)
    select vf.user_id, 'system', left(trim(p_title), 60), left(trim(p_message), 200), '/', false
    from public.venue_follows vf where vf.venue_id = p_venue_id;
  get diagnostics v_count = row_count;
  insert into public.venue_announcements (venue_id, sent_by, title, message, recipients)
    values (p_venue_id, auth.uid(), left(trim(p_title),60), left(trim(p_message),200), v_count);
  return v_count;
end $function$;
revoke all on function public.send_venue_announcement(uuid, text, text) from public, anon;
grant execute on function public.send_venue_announcement(uuid, text, text) to authenticated, service_role;

create or replace function public.venue_announce_status(p_venue_id uuid)
returns table(followers integer, sent_today integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if not coalesce(public.can_manage_pos(p_venue_id), false) then return; end if;
  return query select
    (select count(*)::int from public.venue_follows where venue_id = p_venue_id),
    public._venue_announce_sent_today(p_venue_id);
end $function$;
revoke all on function public.venue_announce_status(uuid) from public;
grant execute on function public.venue_announce_status(uuid) to anon, authenticated, service_role;

-- 자가검사 — 통과 못 하면 적용 트랜잭션이 commit 에 닿지 못한다.
do $$
declare d text;
begin
  select pg_get_functiondef('public.send_venue_announcement(uuid,text,text)'::regprocedure) into d;
  if d not like '%_venue_announce_sent_today%' or d like '%24 hours%' or d not like '%pg_advisory_xact_lock%' then
    raise exception 'self-check: send_venue_announcement 가 KST 판정/락을 쓰지 않는다';
  end if;
  select pg_get_functiondef('public.venue_announce_status(uuid)'::regprocedure) into d;
  if d not like '%_venue_announce_sent_today%' or d like '%24 hours%' or d not like '%coalesce(public.can_manage_pos%' then
    raise exception 'self-check: venue_announce_status 가 같은 판정/NULL-safe 가드를 쓰지 않는다';
  end if;
  if has_function_privilege('anon', 'public.send_venue_announcement(uuid,text,text)', 'execute')
     or has_function_privilege('anon', 'public._venue_announce_sent_today(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._venue_announce_sent_today(uuid)', 'execute') then
    raise exception 'self-check: ACL 이 열려 있다';
  end if;
end $$;
