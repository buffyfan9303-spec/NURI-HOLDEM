-- ⏳ 미적용 — 초안(store-team, 2026-10-02). 리드가 독립 검토 뒤 MCP execute_sql 로 적용한다. 적용하면 이 줄을 "✅ 적용 완료 + 실측값" 으로 바꾼다.
-- 20261002b — 결정 결과 알림 7종 + 바인 요청 알림 매장 구분(audit-link-1002 L-04) + 철회된 초대자의 초대 무효(L-01)
--
-- 오너 결정(2026-10-02)
--   1. 입점 거절은 앱 알림만 보낸다("입점 신청이 반려되었습니다(사유)"). 이메일 없음.
--   2. 거절된 신청자의 미승인 매장은 거절할 때 삭제한다. 기록이 있으면(_guard_venue_hard_delete 가 거부) 숨김 보관으로 대체한다.
--   3. 결정 결과 알림: 직원 초대 수락·거절 → 초대한 운영자 · 직원 제거 → 직원 · 입점 승인·반려 → 신청자
--      · 매장 이벤트 승인·반려 → 신청자(없으면 대표 업주) · 이용권 한도 결정 → 신청자(없으면 대표 업주)
--      · 현금 참가 요청 거절 → 손님 · 순위 인증 승인·반려 → 신청자
--   4. 바인 요청 알림에 매장 구분 — 링크에 매장 id, 병합 조건이 링크(=매장)로 갈린다. 문구에 매장 이름.
-- 리드 결정: L-01 — 초대자가 지금 그 매장을 관리하지 않으면 수락을 거부하고(raise), 대기 목록에서도 감춘다.
--   (raise 하면 상태 갱신도 되돌아가므로 'expired' 로 남길 수 없다. 표의 CHECK 에도 expired 가 없다.
--    그래서 get_my_staff_invites 가 무효 초대를 보여 주지 않게 해 '무효' 를 완성한다. 행은 남고, 초대자가
--    다시 권한을 받으면 그대로 유효해진다.)
--
-- 문구: 합니다체 · 금액 단어 없음(§28 — '바인' 대신 '참가') · 개인정보는 공개 닉네임만.
-- 알림 type 은 기존 enum(notif_type) 만 쓴다 — enum 추가는 같은 트랜잭션에서 쓸 수 없어 피했다. 종류 구분은 link 로 한다.
--   '/my-store/<섹션>?venue=<id>' · '/community/<매장 id>' · '/rank' · '/support' · null(안내형)
-- mute_venue_notify(매장 알림 끄기)는 반복 운영 알림용이라 결정 결과 알림에는 적용하지 않는다.

-- ── 적용 전 게이트: 초안을 쓸 때 읽은 라이브 본문과 같아야 한다 ─────────────────────────
do $$
declare
  g record;
begin
  for g in
    select * from (values
      ('public.admin_reject_signup(uuid,text)',                 '49dd88b8613071594bd35b3e518cd56e'),
      ('public.respond_staff_invite(uuid,boolean)',             '127355c65e4b6ab63d2e1c154c2b3de4'),
      ('public.get_my_staff_invites()',                         '66a4b8eb01886ffebabc2a0eed1eca0c'),
      ('public.manage_staff(uuid,text)',                        '59eab87e00e2a523bb44dfb9e0887382'),
      ('public.admin_decide_venue_event(uuid,boolean,text)',    '24bd9adef760eb38a28e1cce692531eb'),
      ('public.admin_decide_voucher_quota(uuid,boolean,text)',  'f601212c88555a8f83e26cd0954f3486'),
      ('public.reject_buyin_request(uuid,text)',                '59a34ae0cbcd4c7144e4ebcb675b995d'),
      ('public._notify_buyin_request()',                        'd46bf438d0e0947b950b02dccb81082f'),
      ('public._guard_venue_hard_delete()',                     null)   -- 존재만 본다(삭제 거부 = 기록 있음 판정에 기댄다)
    ) as t(sig, want)
  loop
    if to_regprocedure(g.sig) is null then
      raise exception '20261002b 게이트: % 가 없다', g.sig;
    end if;
    if g.want is not null and md5(pg_get_functiondef(to_regprocedure(g.sig))) is distinct from g.want then
      raise exception '20261002b 게이트: % 본문이 초안 작성 때와 다르다 — 다시 읽고 고쳐라', g.sig;
    end if;
  end loop;
  if to_regprocedure('public._notify_user(uuid,notif_type,text,text,text)') is not null then
    raise exception '20261002b 게이트: _notify_user 가 이미 있다';
  end if;
  if exists (select 1 from pg_trigger where tgname in ('trg_notify_venue_decision', 'trg_notify_rank_verification_decision')) then
    raise exception '20261002b 게이트: 결정 알림 트리거가 이미 있다';
  end if;
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'public.venue_staff_invites'::regclass and contype = 'c')
     is distinct from 'CHECK ((status = ANY (ARRAY[''pending''::text, ''accepted''::text, ''declined''::text])))' then
    raise exception '20261002b 게이트: venue_staff_invites 상태 CHECK 가 바뀌었다';
  end if;
end $$;

-- ── 0) 알림 한 줄 헬퍼(내부 전용) ─────────────────────────────────────────────────
create or replace function public._notify_user(p_user uuid, p_type public.notif_type, p_title text, p_message text, p_link text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.notifications (user_id, type, title, message, link, read)
  select p_user, p_type, left(p_title, 80), left(p_message, 300), p_link, false
   where p_user is not null;
$$;
revoke all on function public._notify_user(uuid, public.notif_type, text, text, text) from public, anon, authenticated;
grant execute on function public._notify_user(uuid, public.notif_type, text, text, text) to service_role;

-- ── 1) 가입 거절: 미승인 매장 삭제(기록 있으면 숨김 보관) + 앱 알림 ─────────────────────
create or replace function public.admin_reject_signup(p_user_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_role public.user_role; v_venue record; v_reason text;
        v_deleted int := 0; v_hidden int := 0;
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '운영자만 가능합니다';
  end if;
  update public.profiles
     set status = 'active'::user_status,
         role = case when role = 'admin'::user_role then role else 'user'::user_role end,
         approved = false,
         sanction_reason = null,
         suspended_until = null
   where id = p_user_id and status = 'pending'::user_status
  returning role into v_role;
  if not found then
    raise exception '가입 심사 대기 중인 회원이 아닙니다';
  end if;
  v_reason := left(nullif(btrim(p_reason), ''), 100);

  -- 20261002b: 거절된 신청자의 미승인 매장 정리(오너 결정 2). 기록이 있으면 삭제 트리거가 거부한다 → 숨김 보관.
  --   숨김으로 바꿀 때 입점 반려 트리거 알림이 따로 나가지 않게 이 트랜잭션에서만 끈다(아래 알림 한 건으로 충분).
  perform set_config('nuri.skip_venue_decision_notify', 'on', true);
  for v_venue in
    select id from public.venues
     where owner_id = p_user_id and kind = 'venue' and approved = false
       and status is distinct from 'hidden'::public.venue_status
     for update
  loop
    begin
      delete from public.venues where id = v_venue.id;
      v_deleted := v_deleted + 1;
    exception when sqlstate 'P0001' then
      update public.venues set status = 'hidden'::public.venue_status, updated_at = now() where id = v_venue.id;
      v_hidden := v_hidden + 1;
    end;
  end loop;
  perform set_config('nuri.skip_venue_decision_notify', 'off', true);

  perform public._notify_user(p_user_id, 'system'::public.notif_type, '입점 신청 반려',
    '입점 신청이 반려되었습니다' || coalesce(' (사유: ' || v_reason || ')', '') || '. 궁금한 점은 고객센터로 문의해 주세요.',
    '/support');

  perform public._audit('signup_reject', p_user_id::text,
    jsonb_build_object('reason', left(nullif(btrim(p_reason), ''), 200), 'role_after', v_role,
                       'venues_deleted', v_deleted, 'venues_hidden', v_hidden));
end $function$;
revoke all on function public.admin_reject_signup(uuid, text) from public, anon;
grant execute on function public.admin_reject_signup(uuid, text) to authenticated, service_role;

-- ── 2) 직원 초대 응답: 초대자 권한 재확인(L-01) + 초대자에게 결과 알림 ─────────────────
create or replace function public.respond_staff_invite(p_invite_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_venue uuid; v_user uuid; v_by uuid;
        v_gl boolean; v_gv boolean; v_gs boolean; v_title text; v_ok boolean;
        v_nick text; v_vname text;
begin
  select venue_id, user_id, invited_by, grant_ledger, grant_voucher, grant_schedule, staff_title
    into v_venue, v_user, v_by, v_gl, v_gv, v_gs, v_title
    from public.venue_staff_invites where id = p_invite_id and status = 'pending'
     for update;
  if v_user is null or v_user is distinct from auth.uid() then
    raise exception '초대를 찾을 수 없습니다';
  end if;
  -- 20260930d 의 판정을 소속 변경 앞으로 올렸다(20261002b · L-01): 초대자가 지금도 관리자·승인된 업주·공동 운영자여야 한다.
  select exists (select 1 from public.profiles p where p.id = v_by and p.role = 'admin')
      or public._venue_owner_ok(v_venue, v_by)
      or public._venue_coowner_ok(v_venue, v_by)
    into v_ok;
  v_ok := coalesce(v_ok, false);
  select coalesce(nullif(btrim(nickname), ''), '초대한 회원') into v_nick from public.profiles where id = auth.uid();
  select name into v_vname from public.venues where id = v_venue;

  if p_accept then
    if not v_ok then
      raise exception '초대한 운영자가 더 이상 이 매장을 관리하지 않아 초대가 무효입니다' using errcode = '42501';
    end if;
    if public.my_role() is not distinct from 'admin'::user_role
       or exists (select 1 from public.venues v where v.owner_id = auth.uid())
       or exists (select 1 from public.venue_owners vo where vo.user_id = auth.uid() and vo.status = 'approved') then
      raise exception '업주·관리자 계정은 직원 초대를 수락할 수 없습니다 — 다른 계정으로 수락하거나 매장을 먼저 정리해 주세요' using errcode = '42501';
    end if;
    update public.profiles set role='venue_staff', venue_id=v_venue, approved=true where id=auth.uid();
    if v_title is not null and btrim(v_title) <> '' then
      update public.profiles set staff_title = left(btrim(v_title), 20) where id = auth.uid();
    end if;
    delete from public.ledger_access   where user_id = auth.uid() and venue_id is distinct from v_venue;
    delete from public.voucher_access  where user_id = auth.uid() and venue_id is distinct from v_venue;
    delete from public.schedule_access where user_id = auth.uid() and venue_id is distinct from v_venue;
    if v_gl then insert into public.ledger_access(venue_id,user_id)   values (v_venue, v_user) on conflict do nothing; end if;
    if v_gv then insert into public.voucher_access(venue_id,user_id)  values (v_venue, v_user) on conflict do nothing; end if;
    if v_gs then insert into public.schedule_access(venue_id,user_id) values (v_venue, v_user) on conflict do nothing; end if;
    update public.venue_staff_invites set status='accepted' where id=p_invite_id;
    perform public._notify_user(v_by, 'system'::public.notif_type, '직원 초대 수락',
      v_nick || '님이 ' || coalesce(v_vname, '매장') || ' 구성원 초대를 수락했습니다.',
      '/my-store/staff?venue=' || v_venue);
  else
    update public.venue_staff_invites set status='declined' where id=p_invite_id;
    -- 무효 초대(초대자 권한 없음)의 거절은 그 초대자에게 알리지 않는다 — 더는 이 매장 사람이 아니다.
    if v_ok then
      perform public._notify_user(v_by, 'system'::public.notif_type, '직원 초대 거절',
        v_nick || '님이 ' || coalesce(v_vname, '매장') || ' 구성원 초대를 거절했습니다.',
        '/my-store/staff?venue=' || v_venue);
    end if;
  end if;
end $function$;
revoke all on function public.respond_staff_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_staff_invite(uuid, boolean) to authenticated, service_role;

-- ── 2-1) 대기 초대 목록: 무효 초대(초대자 권한 없음)는 보이지 않는다(L-01 '무효' 의 나머지 절반) ──
create or replace function public.get_my_staff_invites()
returns table(id uuid, venue_id uuid, venue_name text, created_at timestamp with time zone)
language sql
stable security definer
set search_path = public, pg_temp
as $function$
  select i.id, i.venue_id, v.name, i.created_at
  from public.venue_staff_invites i
  join public.venues v on v.id = i.venue_id
  where i.user_id = auth.uid() and i.status = 'pending'
    and ( exists (select 1 from public.profiles p where p.id = i.invited_by and p.role = 'admin')
       or public._venue_owner_ok(i.venue_id, i.invited_by)
       or public._venue_coowner_ok(i.venue_id, i.invited_by) )
  order by i.created_at desc;
$function$;
revoke all on function public.get_my_staff_invites() from public, anon;
grant execute on function public.get_my_staff_invites() to authenticated, service_role;

-- ── 3) 직원 제거 → 직원에게 알림 ────────────────────────────────────────────────────
create or replace function public.manage_staff(p_staff_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_staff_venue uuid;
begin
  select venue_id into v_staff_venue
    from public.profiles where id = p_staff_id and role = 'venue_staff';
  if v_staff_venue is null then
    raise exception '본인 매장 직원만 관리할 수 있습니다';
  end if;
  if not public.can_manage_venue_staff(v_staff_venue) then
    raise exception '직원을 관리할 권한이 없습니다';
  end if;
  if p_action = 'approve' then
    update public.profiles set approved = true  where id = p_staff_id;
  elsif p_action = 'reject' then
    update public.profiles set approved = false where id = p_staff_id;
  elsif p_action = 'remove' then
    update public.profiles set role = 'user', venue_id = null, approved = false where id = p_staff_id;
    delete from public.ledger_access   where venue_id = v_staff_venue and user_id = p_staff_id;
    delete from public.voucher_access  where venue_id = v_staff_venue and user_id = p_staff_id;
    delete from public.schedule_access where venue_id = v_staff_venue and user_id = p_staff_id;
    -- 20261002b: 제거된 직원에게 알린다. 이제 내 매장 탭이 없으므로 링크 없이 안내형으로 보낸다.
    perform public._notify_user(p_staff_id, 'system'::public.notif_type, '매장 구성원 해제',
      coalesce((select name from public.venues where id = v_staff_venue), '매장') || ' 구성원에서 해제되었습니다.',
      null);
  else
    raise exception '알 수 없는 작업';
  end if;
end;
$function$;
revoke all on function public.manage_staff(uuid, text) from public, anon;
grant execute on function public.manage_staff(uuid, text) to authenticated, service_role;

-- ── 4) 매장 이벤트 결정 → 신청자(없으면 대표 업주) ───────────────────────────────────
create or replace function public.admin_decide_venue_event(p_id uuid, p_approve boolean, p_admin_note text default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare r record; q int; v_note text;
begin
  if my_role() IS DISTINCT FROM 'admin' then raise exception '운영자만 가능합니다'; end if;
  select * into r from public.venue_event_requests where id=p_id and status='pending' for update;
  if not found then raise exception '대기 중인 신청이 아닙니다'; end if;
  select coalesce(voucher_quota,0) into q from public.venues where id=r.venue_id for update;
  if p_approve and r.kind='campaign' and coalesce(r.voucher_count,0)>0 then
    if q < r.voucher_count then
      raise exception '매장 발행 한도가 부족합니다 (잔여 %장 · 필요 %장) — 먼저 한도를 늘려 주세요', q, r.voucher_count;
    end if;
    q := public.admin_grant_voucher_quota(r.venue_id, -r.voucher_count);
  end if;
  v_note := nullif(btrim(coalesce(p_admin_note,'')),'');
  update public.venue_event_requests
     set status=case when p_approve then 'approved' else 'rejected' end,
         admin_note=v_note, decided_at=now()
   where id=p_id;
  -- 20261002b: 결정 결과 알림
  perform public._notify_user(
    coalesce(r.requested_by, (select owner_id from public.venues where id = r.venue_id)),
    case when p_approve then 'approval' else 'system' end::public.notif_type,
    case when p_approve then '매장 이벤트 승인' else '매장 이벤트 반려' end,
    '신청한 이벤트 「' || left(coalesce(nullif(btrim(r.title), ''), '이벤트'), 30) || '」가 '
      || case when p_approve then '승인되었습니다.' else '반려되었습니다' || coalesce(' (사유: ' || left(v_note, 100) || ')', '') || '.' end,
    '/my-store/event?venue=' || r.venue_id);
  return q;
end $function$;
revoke all on function public.admin_decide_venue_event(uuid, boolean, text) from public, anon;
grant execute on function public.admin_decide_venue_event(uuid, boolean, text) to authenticated, service_role;

-- ── 5) 이용권 발행 한도 결정 → 신청자(없으면 대표 업주) ───────────────────────────────
create or replace function public.admin_decide_voucher_quota(p_request_id uuid, p_approve boolean, p_admin_note text default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare r record; q int; v_note text;
begin
  if my_role() IS DISTINCT FROM 'admin' then
    raise exception '운영자만 가능합니다';
  end if;

  select * into r
    from public.voucher_credit_requests
   where id = p_request_id and status = 'pending'
     for update;
  if not found then
    raise exception '대기 중인 요청이 아닙니다';
  end if;

  if p_approve then
    q := public.admin_grant_voucher_quota(r.venue_id, r.amount);
  else
    q := coalesce((select voucher_quota from public.venues where id = r.venue_id), 0);
  end if;

  v_note := nullif(btrim(coalesce(p_admin_note, '')), '');
  update public.voucher_credit_requests
     set status     = case when p_approve then 'approved' else 'rejected' end,
         admin_note = v_note,
         decided_at = now()
   where id = p_request_id;

  -- 20261002b: 결정 결과 알림(장수만 — 금액 단어 없음)
  perform public._notify_user(
    coalesce(r.requested_by, (select owner_id from public.venues where id = r.venue_id)),
    case when p_approve then 'approval' else 'system' end::public.notif_type,
    case when p_approve then '이용권 발행 한도 승인' else '이용권 발행 한도 반려' end,
    '요청한 이용권 발행 한도 ' || r.amount || '장이 '
      || case when p_approve then '승인되었습니다.' else '반려되었습니다' || coalesce(' (사유: ' || left(v_note, 100) || ')', '') || '.' end,
    '/my-store/voucher?venue=' || r.venue_id);

  return q;
end $function$;
revoke all on function public.admin_decide_voucher_quota(uuid, boolean, text) from public, anon;
grant execute on function public.admin_decide_voucher_quota(uuid, boolean, text) to authenticated, service_role;

-- ── 6) 현금 참가 요청 거절 → 손님 ─────────────────────────────────────────────────
--   이용권 요청의 거절은 _restore_voucher_on_request_void 가 이미 '이용권 복구' 알림을 보내므로 현금(voucher_id null)만.
create or replace function public.reject_buyin_request(p_request_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare r public.ledger_buyin_requests;
begin
  select * into r from public.ledger_buyin_requests where id = p_request_id;
  if not found then raise exception '요청을 찾을 수 없습니다'; end if;
  if not coalesce(public.can_access_ledger(r.venue_id), false) then raise exception '권한이 없습니다'; end if;
  -- approve 와 같은 가드 — 이미 승인된(장부에 들어간) 요청을 거절로 뒤집지 못하게 한다
  if r.status is distinct from 'pending' then raise exception '이미 처리된 요청입니다'; end if;
  -- ⚠ 전이는 한 문장으로 — 위 검사와 이 갱신 사이에 다른 화면의 승인이 커밋되면(READ COMMITTED)
  --   'approved' 를 'rejected' 로 덮고 이용권까지 되살린다. 술어에 status 를 넣어 승인된 행은 건너뛴다.
  update public.ledger_buyin_requests
     set status = 'rejected', resolve_note = nullif(trim(p_reason), ''), resolved_at = now(), resolved_by = auth.uid()
   where id = p_request_id and status = 'pending';
  if not found then raise exception '이미 처리된 요청입니다'; end if;
  perform public._restore_voucher(r.voucher_id);
  -- 20261002b: 현금 참가 요청 거절 알림(앱 배너는 당일·열람 중에만 보였다)
  if r.voucher_id is null then
    perform public._notify_user(r.user_id, 'system'::public.notif_type, '참가 요청 반려',
      coalesce((select name from public.venues where id = r.venue_id), '매장') || '에서 참가 요청이 반려되었습니다'
        || coalesce(' (사유: ' || left(nullif(trim(p_reason), ''), 100) || ')', '') || '.',
      '/community/' || r.venue_id);
  end if;
end $function$;
revoke all on function public.reject_buyin_request(uuid, text) from public, anon;
grant execute on function public.reject_buyin_request(uuid, text) to authenticated, service_role;

-- ── 7) 바인 요청 알림: 매장 구분(L-04) ─────────────────────────────────────────────
--   링크에 매장 id → 병합(30분 안 같은 제목·같은 링크)이 매장별로 갈린다. 문구 앞에 매장 이름.
create or replace function public._notify_buyin_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_cnt int; v_msg text; v_to uuid[]; v_link text;
begin
  -- 20260930d: 후보(owner_id ∪ venue_owners ∪ ledger_access) → 정본 판정. 장부 직원은 활동 중일 때만.
  select count(*) into v_cnt from ledger_buyin_requests where venue_id = NEW.venue_id and session_date = NEW.session_date and status = 'pending';
  v_link := '/my-store/ledger?venue=' || NEW.venue_id;
  v_msg := coalesce('[' || left((select name from public.venues where id = NEW.venue_id), 20) || '] ', '')
        || '🙋 손님 참가(바인) 요청 ' || v_cnt || '건 대기';
  select coalesce(array_agg(c.u), '{}'::uuid[]) into v_to
    from (
      select v.owner_id as u from public.venues v where v.id = NEW.venue_id
      union select vo.user_id from public.venue_owners vo where vo.venue_id = NEW.venue_id
      union select la.user_id from public.ledger_access la where la.venue_id = NEW.venue_id
    ) c
    join public.profiles pr on pr.id = c.u
   where coalesce(pr.mute_venue_notify, false) = false
     and ( public._venue_owner_ok(NEW.venue_id, c.u)
        or public._venue_coowner_ok(NEW.venue_id, c.u)
        or ( exists (select 1 from public.ledger_access la where la.venue_id = NEW.venue_id and la.user_id = c.u)
             and public._is_active_venue_staff(c.u, NEW.venue_id) ) );
  update notifications set message = v_msg, created_at = now()
   where link = v_link and title = '🙋 손님 바인 요청' and read = false and created_at > now() - interval '30 minutes'
     and user_id = any(v_to);
  insert into notifications (user_id, type, title, message, link, read)
  select u, 'system', '🙋 손님 바인 요청', v_msg, v_link, false
    from unnest(v_to) as u
   where not exists (select 1 from notifications n where n.user_id = u and n.link = v_link and n.title = '🙋 손님 바인 요청' and n.read = false and n.created_at > now() - interval '30 minutes');
  return NEW;
end; $function$;
revoke all on function public._notify_buyin_request() from public, anon, authenticated;
grant execute on function public._notify_buyin_request() to service_role;

-- ── 8) 입점 승인·반려 → 신청자(venues 직접 갱신 경로: approveGroup·rejectGroup·approveOwner) ──
--   관리자가 바꿀 때만 — 업주가 스스로 숨기는 것은 반려가 아니다.
create or replace function public._notify_venue_decision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.kind is distinct from 'venue' or public.my_role() is distinct from 'admin'::user_role
     or current_setting('nuri.skip_venue_decision_notify', true) is not distinct from 'on' then
    return new;
  end if;
  if new.approved is true and old.approved is distinct from true then
    -- 업주 승인(approveOwner)과 같이 오면 '매장 업주 승인 완료' 알림이 방금 나갔다 — 겹쳐 보내지 않는다.
    if not exists (select 1 from public.notifications n
                    where n.user_id = new.owner_id and n.type = 'approval' and n.link = '/guide/manual.html'
                      and n.created_at > now() - interval '10 minutes') then
      perform public._notify_user(new.owner_id, 'approval'::public.notif_type, '입점 승인 완료',
        left(new.name, 30) || ' 입점이 승인되었습니다. 이제 손님에게 매장이 보입니다.',
        '/my-store?venue=' || new.id);
    end if;
  elsif old.approved is not true and new.approved is not true
        and new.status = 'hidden'::public.venue_status and old.status is distinct from 'hidden'::public.venue_status then
    perform public._notify_user(new.owner_id, 'system'::public.notif_type, '입점 신청 반려',
      left(new.name, 30) || ' 입점 신청이 반려되었습니다. 궁금한 점은 고객센터로 문의해 주세요.',
      '/support');
  end if;
  return new;
end $function$;
revoke all on function public._notify_venue_decision() from public, anon, authenticated;
grant execute on function public._notify_venue_decision() to service_role;
drop trigger if exists trg_notify_venue_decision on public.venues;
create trigger trg_notify_venue_decision
  after update of approved, status on public.venues
  for each row execute function public._notify_venue_decision();

-- ── 9) 순위 인증 승인·반려 → 신청자(rank_verifications 직접 갱신 경로: adminDecideRankVerification) ──
create or replace function public._notify_rank_verification_decision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if old.status = 'pending' and new.status in ('approved', 'rejected') then
    perform public._notify_user(new.user_id,
      case when new.status = 'approved' then 'approval' else 'system' end::public.notif_type,
      case when new.status = 'approved' then '순위 인증 승인' else '순위 인증 반려' end,
      '신청한 「' || left(coalesce(nullif(btrim(new.event_name), ''), '대회'), 30) || '」 인증이 '
        || case when new.status = 'approved' then '승인되었습니다.'
                else '반려되었습니다' || coalesce(' (사유: ' || left(nullif(btrim(new.admin_note), ''), 100) || ')', '') || '.' end,
      '/rank');
  end if;
  return new;
end $function$;
revoke all on function public._notify_rank_verification_decision() from public, anon, authenticated;
grant execute on function public._notify_rank_verification_decision() to service_role;
drop trigger if exists trg_notify_rank_verification_decision on public.rank_verifications;
create trigger trg_notify_rank_verification_decision
  after update of status on public.rank_verifications
  for each row execute function public._notify_rank_verification_decision();

-- ── 자가검사 ─────────────────────────────────────────────────────────────────────
do $$
declare f text; v_acl text;
begin
  -- 결정 함수 본문에 알림 호출이 있다
  foreach f in array array[
    'public.admin_reject_signup(uuid,text)', 'public.respond_staff_invite(uuid,boolean)', 'public.manage_staff(uuid,text)',
    'public.admin_decide_venue_event(uuid,boolean,text)', 'public.admin_decide_voucher_quota(uuid,boolean,text)',
    'public.reject_buyin_request(uuid,text)', 'public._notify_venue_decision()', 'public._notify_rank_verification_decision()']
  loop
    if pg_get_functiondef(to_regprocedure(f)) !~ '_notify_user\(' then
      raise exception '20261002b 자가검사: % 에 알림 호출이 없다', f;
    end if;
  end loop;
  -- 변이 RPC: PUBLIC·anon 실행 불가, authenticated 가능, search_path 고정
  foreach f in array array[
    'public.admin_reject_signup(uuid,text)', 'public.respond_staff_invite(uuid,boolean)', 'public.manage_staff(uuid,text)',
    'public.admin_decide_venue_event(uuid,boolean,text)', 'public.admin_decide_voucher_quota(uuid,boolean,text)',
    'public.reject_buyin_request(uuid,text)', 'public.get_my_staff_invites()']
  loop
    if has_function_privilege('anon', to_regprocedure(f), 'execute')
       or not has_function_privilege('authenticated', to_regprocedure(f), 'execute') then
      raise exception '20261002b 자가검사: % 권한이 틀렸다', f;
    end if;
    select proacl::text into v_acl from pg_proc where oid = to_regprocedure(f);
    if v_acl ~ '(^|[{,])=X' then raise exception '20261002b 자가검사: % 에 PUBLIC 실행 권한이 남았다', f; end if;
    if not exists (select 1 from pg_proc where oid = to_regprocedure(f) and prosecdef
                     and proconfig @> array['search_path=public, pg_temp']) then
      raise exception '20261002b 자가검사: % search_path 가 고정되지 않았다', f;
    end if;
  end loop;
  -- 내부 함수: authenticated·anon 실행 불가
  foreach f in array array[
    'public._notify_user(uuid,notif_type,text,text,text)', 'public._notify_buyin_request()',
    'public._notify_venue_decision()', 'public._notify_rank_verification_decision()']
  loop
    if has_function_privilege('anon', to_regprocedure(f), 'execute')
       or has_function_privilege('authenticated', to_regprocedure(f), 'execute') then
      raise exception '20261002b 자가검사: 내부 함수 % 가 열려 있다', f;
    end if;
  end loop;
  if (select count(*) from pg_trigger where tgname in ('trg_notify_venue_decision', 'trg_notify_rank_verification_decision')) <> 2 then
    raise exception '20261002b 자가검사: 결정 알림 트리거가 2개가 아니다';
  end if;
  if pg_get_functiondef('public._notify_buyin_request()'::regprocedure) !~ 'v_link := ''/my-store/ledger\?venue=''' then
    raise exception '20261002b 자가검사: 바인 요청 알림 링크에 매장 id 가 없다';
  end if;
end $$;
