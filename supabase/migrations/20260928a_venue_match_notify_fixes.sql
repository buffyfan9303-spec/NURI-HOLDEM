-- ✅ 적용 완료 2026-09-28 (nuri-lead, MCP execute_sql). critical-reviewer 권한 대조 F1·F2·F7·F8·F10.
-- F1 vmr_insert 가 pg_policies 에서 `p.venue_id IS DISTINCT FROM p.venue_id`(항상 거짓) — 파트너 신청 전원 RLS 거절·연합 알림 0회.
--    리허설: 적용 전 N1(다른 매장 업주 신청)=42501 → 적용 후 N1=ok · N2(자기 게시 매장 신청)=42501 · 게시 매장 주인 알림 1. 적용 후 라이브 재확인 N1=ok notif=1.
-- F2 알림 수신자 = 대표 업주 ∪ 승인 공동운영자(+notify_venue_staff 만 활성 직원). profiles.venue_id 기준은 미승인 직원에게 업주 링크를 보내고 관리자 소유 매장은 0명이었다.
-- F7 장부 시작 알림 대상을 _ledger_can_operate 로 거름(리허설: 무관 회원 제외·관리자 1) · 제목 40자.
-- F8 _ledger_can_operate 업주 분기 = 매장(kind=venue)+승인 업주(_venue_owner_ok 와 같게).
-- F10 대기 중 바인 요청이 걸린 이용권 삭제 거부.

drop policy if exists vmr_insert on public.venue_match_responses;
create policy vmr_insert on public.venue_match_responses for insert to authenticated
  with check (
    public.can_manage_pos(venue_match_responses.venue_id)
    and not (venue_match_responses.created_by is distinct from auth.uid())
    and exists (select 1 from public.venue_match_posts p
                 where p.id = venue_match_responses.post_id and p.status = 'open'
                   and p.venue_id is distinct from venue_match_responses.venue_id)
  );

create or replace function public._venue_notify_recipients(p_venue uuid, p_include_staff boolean default false)
returns setof uuid language sql stable security definer set search_path = public, pg_temp as $f$
  select u from (
    select v.owner_id as u from public.venues v where v.id = p_venue
    union select vo.user_id from public.venue_owners vo where vo.venue_id = p_venue and vo.status = 'approved'
    union select pr.id from public.profiles pr where p_include_staff and public._is_active_venue_staff(pr.id, p_venue)
  ) s
  where u is not null
    and not exists (select 1 from public.profiles m where m.id = s.u and coalesce(m.mute_venue_notify, false));
$f$;
revoke execute on function public._venue_notify_recipients(uuid, boolean) from public, anon, authenticated;

create or replace function public.notify_venue_match_response() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_post_venue uuid; v_applicant text; v_date date;
begin
  select p.venue_id, p.event_date into v_post_venue, v_date from public.venue_match_posts p where p.id = new.post_id;
  select name into v_applicant from public.venues where id = new.venue_id;
  insert into public.notifications (user_id, type, title, message, link, read)
  select r, 'system', '연합 대회 파트너 신청',
    coalesce(v_applicant, '매장') || ' 매장이 ' || coalesce(to_char(v_date, 'MM/DD'), '날짜 미정') || ' 연합 대회에 함께하자고 신청했습니다.',
    '/my-store/partners', false
  from public._venue_notify_recipients(v_post_venue) r;
  return new;
end $f$;

create or replace function public.notify_venue_match_decision() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_host text;
begin
  if new.status = old.status or new.status = 'pending' then return new; end if;
  select v.name into v_host from public.venue_match_posts p join public.venues v on v.id = p.venue_id where p.id = new.post_id;
  insert into public.notifications (user_id, type, title, message, link, read)
  select r, 'system', '연합 대회 파트너 ' || (case when new.status = 'accepted' then '수락' else '거절' end),
    coalesce(v_host, '매장') || ' 매장이 신청을 ' ||
    (case when new.status = 'accepted' then '수락했습니다 — 내 매장 › 파트너 매장에서 연락처를 확인하세요.' else '거절했습니다.' end),
    '/my-store/partners', false
  from public._venue_notify_recipients(new.venue_id) r;
  return new;
end $f$;

create or replace function public.notify_league_invite() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $f$
declare lname text; oname text;
begin
  select l.name, v.name into lname, oname from public.leagues l join public.venues v on v.id = l.owner_venue_id where l.id = new.league_id;
  insert into public.notifications (user_id, type, title, message, link, read)
  select r, 'system', '연합 리그 초대',
    coalesce(oname,'매장') || ' 매장이 「' || coalesce(lname,'리그') || '」 연합 리그에 초대했습니다 — 내 매장 → 연합 리그에서 수락/거절하세요.', '/', false
  from public._venue_notify_recipients(new.venue_id) r;
  return new;
end $f$;

create or replace function public.notify_league_response() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $f$
declare lname text; vname text; owner_vid uuid;
begin
  if new.status = old.status or new.status = 'pending' then return new; end if;
  select l.name, l.owner_venue_id into lname, owner_vid from public.leagues l where l.id = new.league_id;
  select name into vname from public.venues where id = new.venue_id;
  insert into public.notifications (user_id, type, title, message, link, read)
  select r, 'system', '연합 리그 ' || (case when new.status = 'accepted' then '수락' else '거절' end),
    coalesce(vname,'매장') || ' 매장이 「' || coalesce(lname,'리그') || '」 초대를 ' || (case when new.status = 'accepted' then '수락했습니다 🎉' else '거절했습니다' end), '/', false
  from public._venue_notify_recipients(owner_vid) r;
  return new;
end $f$;

create or replace function public.notify_venue_staff(p_venue_id uuid, p_title text, p_message text, p_link text default null)
returns integer language plpgsql security definer set search_path = public, pg_temp as $f$
declare n integer;
begin
  if public.can_manage_pos(p_venue_id) is distinct from true then
    raise exception '이 매장에 알림을 보낼 권한이 없습니다';
  end if;
  insert into public.notifications (user_id, type, title, message, link, read)
  select r, 'system', p_title, p_message, p_link, false
  from public._venue_notify_recipients(p_venue_id, true) r
  where r is distinct from auth.uid();
  get diagnostics n = row_count;
  return n;
end $f$;
revoke execute on function public.notify_venue_staff(uuid, text, text, text) from public, anon;
grant execute on function public.notify_venue_staff(uuid, text, text, text) to authenticated, service_role;

create or replace function public.notify_ledger_open(p_venue_id uuid, p_title text, p_operator_ids uuid[])
returns integer language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_cnt int := 0; v_venue text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if public.can_access_ledger(p_venue_id) is distinct from true then raise exception '장부 권한이 없습니다'; end if;
  select name into v_venue from venues where id = p_venue_id;
  insert into notifications (user_id, type, title, message, link, avatar_text)
  select p.id, 'system', '📒 장부 시작',
         format('%s — %s 장부가 시작됐어요. 담당 직원으로 지정되었습니다.', coalesce(v_venue, '매장'), coalesce(nullif(left(trim(p_title), 40), ''), '오늘')),
         '/my-store/ledger', '📒'
  from profiles p
  where p.id = any(p_operator_ids) and p.id <> auth.uid()
    and public._ledger_can_operate(p.id, p_venue_id);
  get diagnostics v_cnt = row_count;
  return v_cnt;
end $f$;
revoke execute on function public.notify_ledger_open(uuid, text, uuid[]) from public, anon;
grant execute on function public.notify_ledger_open(uuid, text, uuid[]) to authenticated, service_role;

create or replace function public._ledger_can_operate(p_user uuid, p_venue uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $f$
  select p_user is not null and p_venue is not null and (
       exists (select 1 from public.profiles p where p.id = p_user and p.role = 'admin'::user_role)
    or exists (select 1 from public.venues v join public.profiles p on p.id = v.owner_id
                where v.id = p_venue and v.owner_id = p_user and v.kind = 'venue' and p.approved is true)
    or exists (select 1 from public.venue_owners vo where vo.venue_id = p_venue and vo.user_id = p_user and vo.status = 'approved')
    or ( exists (select 1 from public.ledger_access la where la.venue_id = p_venue and la.user_id = p_user)
         and public._is_active_venue_staff(p_user, p_venue) )
  );
$f$;

create or replace function public.delete_voucher(p_voucher_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $f$
declare v_venue uuid; v_status text;
begin
  select venue_id, status into v_venue, v_status from public.store_vouchers where id = p_voucher_id;
  if v_venue is null then raise exception '이용권을 찾을 수 없습니다 — 이미 삭제되었습니다'; end if;
  if public.can_manage_pos(v_venue) is distinct from true then raise exception '권한이 없습니다 — 업주만 삭제할 수 있습니다'; end if;
  if v_status = 'used' and my_role() IS DISTINCT FROM 'admin' then
    raise exception '사용 완료된 이용권은 삭제할 수 없습니다 — 손님의 사용 내역과 장부 연동이 함께 사라집니다. 미사용분만 삭제하거나 회수해 주세요';
  end if;
  if exists (select 1 from public.ledger_buyin_requests r where r.voucher_id = p_voucher_id and r.status = 'pending') then
    raise exception '장부 승인을 기다리는 요청이 있는 이용권입니다 — 요청을 먼저 처리(승인·거절)해 주세요';
  end if;
  delete from public.store_vouchers where id = p_voucher_id;
end $f$;
