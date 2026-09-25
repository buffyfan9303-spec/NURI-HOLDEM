-- ✅ 적용 완료 2026-09-25 (MCP execute_sql, 47~572행 본문 · 자가검사 통과). 적용 전 md5 16개 라이브 대조 일치 후 적용.
--    리허설 56/56 PASS(critical-reviewer, rollback) · 적용 후 스모크(rollback): 공동운영자 오늘 게임 열기+현금 바인 OK(1원→50000 강제), 바인 player_name 직접 변경 거절.
-- ⏳ 미적용 초안 (critical-reviewer 작성, 2026-09-25 · 리드 결정 MYSTORE-RECHECK). 적용은 리드가 MCP execute_sql 로.
-- 20260925g — 내 매장 2차 전수(N1·N2·N3·N4·N5·N7·N8·N9·N13·N16·N18·N19) 서버 강화
-- 요구: 오너 2026-09-25 MYSTORE-RECHECK → critical-reviewer 보고 → 리드 결정(같은 날).
-- 제외(오너 결정 대기): N6 급여 식 · N10 전화 조회 범위 · N11 직원 실명 열람 · N12 초대 문구 · N14 승인 후 수정 · N15 페이징 · N17 클라 날짜.
--
-- ── 적용 전 라이브 정본(2026-09-25 실측 md5 = md5(pg_get_functiondef)) — 이 값과 다르면 적용 전에 멈추고 다시 읽어라 ──
--   set_pos_cancel_password(uuid,text)            8963433a7e4f68206bead6438ea25e52
--   _ledger_check_cancel_password(uuid,text)      05ea2c5ad6d08f2cae068ffb6691f771
--   _ledger_require_cancel_auth(uuid,text)        b46c60db6d2718d8a2b99caa0dad7de3   (변경 없음 — 참조만)
--   _ledger_buyins_client_guard()                 9e302b03742492bb89e8d543b5ec4191
--   _ledger_session_guard()                       00c1f110fc5a073aa3069195be6de088   (변경 없음 — BEFORE UPDATE 전용임을 확인)
--   ledger_business_date(uuid)                    9fd79f9c2e03b4897ab5e4529119abc1   (변경 없음)
--   set_my_shift_time(uuid,date,text,text)        bcdb2fee3e25d6e45cb84b533afbf41b
--   kill_venue(uuid,text,text)                    c009eee689e685b6aab7b705e3d928dc
--   respond_staff_invite(uuid,boolean)            4007c3969af6268b0e0bbd050a637a62
--   guard_venue_verification()                    fa068c738cea370d650093adc699b321
--   voucher_holder_stats(uuid)                    8ff0ef322d58731b41e2e2989f6cee40
--   delete_ledger_session(uuid,date,smallint)     f92e7cf3e690165aed38a9f1af8f0596   (인자 추가 → DROP 후 재생성, ACL 재부여)
--   is_any_venue_manager()                        33d5ce5589252f8fd93bf3794baffe25   (변경 없음 — N16 정책이 참조)
--   sync_venue_followers()                        774269a75fb9570b42925757911b1dc7   (변경 없음 — SECURITY DEFINER 라 follower_count 잠금을 통과)
--   트리거: ledger_buyins_client_guard BEFORE INSERT OR UPDATE ON ledger_buyins · trg_guard_venue_verification BEFORE UPDATE ON venues
--          trg_a_ledger_session_guard / trg_guard_ledger_session_update BEFORE UPDATE ON ledger_sessions (INSERT 트리거 0개)
--   정책: storage.objects posters_upload [INSERT, authenticated] WITH CHECK
--          (bucket_id='posters' AND (storage.foldername(name))[1]=auth.uid()::text AND my_role() IN ('venue_owner','admin'))
--         league_entries le_insert [INSERT, public] — 클라 호출부 0(HEAD 509572af `from('league')` 0곳, 라이브 0행)
--   컬럼 권한: venue_pos_settings.cancel_password_hash · venue_kill_switch.pw_hash SELECT 가 anon·authenticated 에 부여(표 단위 arwdm)
--   verification_status 실측값: 'unverified'(3) · 'verified'(1) — 리드 문구의 'none' 은 이 스키마에 없다 → 'unverified' 로 판정
--
-- ── 리드 지시와 다르게 설계한 점(보고서에도 적음) ──
--   N3 opened_by: 화면이 담당 직원을 **지정**하는 칸(NuriPosLedger.tsx:886 `openLedgerSession(s, s.openedBy)` · :2530 `openedBy: operIds[0]`)이라
--      auth.uid() 로 덮으면 담당 지정 기능이 깨진다 → 덮지 않고 "그 매장 장부 권한자(업주·승인 공동운영자·활성 ledger_access 직원·관리자)" 인지만 검증.
--      감사용 '실제 기록자' 칸은 없다(별도 결정).
--   N3 session_date 제한은 **업주(can_manage_pos) 제외** — 화면 날짜 선택기가 과거 날짜를 허용(NuriPosLedger.tsx:2160 max=today)하고
--      업주가 전날 장부를 뒤늦게 여는 것은 정당한 흐름. 결함의 주체는 직원이었다(리허설 B/B4).
--   N2 잠금 상태를 표에 쓰면 raise 와 함께 롤백된다(자율 트랜잭션 없음 · dblink 미설치). **시퀀스 setval 은 롤백되지 않으므로**
--      매장별 시퀀스에 (실패 시각 분×16 + 연속 실패 수) 를 저장한다 → 잠금 단위는 매장×사용자가 아니라 **매장**(관리자는 종전대로 우회).
--   N4 ledger_players.name: 화면은 RPC rename_ledger_player 만 쓴다(NuriPosLedger.tsx:1023-1029 가 name 을 떼고 updateLedgerPlayer(rest))
--      → 동기 트리거 대신 클라 직접 변경을 **거절**(이름 변경 = RPC 전용).
--   N16 storage 경로에는 매장 id 가 없어 can_manage_venue_schedules(venue) 를 못 부른다 → is_any_venue_manager()(어느 매장이든 업주·승인 공동운영자·관리자).
--
-- ── 화면이 알아야 할 새 hint/문구 ──
--   LEDGER_PW_LOCKED        취소 비밀번호 5회 실패 → 10분 잠금(정답도 거절). cancel_ledger_buyin·delete_ledger_player·update_ledger_buyin_reduce·delete_ledger_session
--   LEDGER_DATE_NOT_ALLOWED 직원이 오늘/진행 영업일 아닌 날짜의 새 장부를 열 때
--   LEDGER_OPERATOR_INVALID opened_by 가 그 매장 장부 권한자가 아닐 때
--   delete_ledger_session 은 p_password(기본 NULL) 를 받는다 — 비밀번호 설정 매장에서는 화면이 비밀번호를 물어야 한다(ledger.ts:1051 deleteLedgerSession 인자 추가 필요).

set search_path = public, pg_temp;

-- ═══ N1 · 비밀 컬럼 SELECT 회수 ═══════════════════════════════════════════════
-- ⚠ 표 단위 SELECT 가 남아 있으면 컬럼 단위 REVOKE 는 아무것도 막지 않는다(PostgreSQL: 컬럼 권한은 추가만 된다).
--    → 표 SELECT 를 회수하고 비밀이 아닌 컬럼만 다시 준다. 두 표 모두 클라 직접 조회 0곳(HEAD grep) — 화면은 pos_has_password·kill_switch_is_set RPC 만 쓴다.
revoke select on public.venue_pos_settings from anon, authenticated;
grant select (venue_id, updated_at) on public.venue_pos_settings to anon, authenticated;
revoke select on public.venue_kill_switch from anon, authenticated;
grant select (venue_id, created_at) on public.venue_kill_switch to anon, authenticated;

-- ═══ N2 · 취소 비밀번호 시도 잠금(매장 단위 시퀀스) ═════════════════════════════
create or replace function public._ledger_pw_seq_name(p_venue uuid)
returns text language sql immutable set search_path = public, pg_temp as $$
  select 'ledger_pw_seq_' || replace(p_venue::text, '-', '');
$$;
revoke all on function public._ledger_pw_seq_name(uuid) from public, anon, authenticated;

create or replace function public._ledger_pw_seq_ensure(p_venue uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare s text := public._ledger_pw_seq_name(p_venue);
begin
  execute format('create sequence if not exists public.%I minvalue 0 start 0', s);
  execute format('revoke all on sequence public.%I from public, anon, authenticated', s);
end $$;
revoke all on function public._ledger_pw_seq_ensure(uuid) from public, anon, authenticated;

-- 기존 비밀번호 매장에 시퀀스 보장(2026-09-25 실측 0행 — 멱등)
do $$ declare r record; begin
  for r in select venue_id from public.venue_pos_settings where cancel_password_hash is not null loop
    perform public._ledger_pw_seq_ensure(r.venue_id);
  end loop;
end $$;

create or replace function public.set_pos_cancel_password(p_venue_id uuid, p_password text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not can_manage_pos(p_venue_id) then raise exception '권한이 없습니다'; end if;
  if coalesce(length(btrim(p_password)),0) < 4 then raise exception '비밀번호는 4자리 이상이어야 합니다'; end if;
  insert into public.venue_pos_settings (venue_id, cancel_password_hash, updated_at)
  values (p_venue_id, extensions.crypt(p_password, extensions.gen_salt('bf')), now())
  on conflict (venue_id) do update
    set cancel_password_hash = excluded.cancel_password_hash, updated_at = now();
  perform public._ledger_pw_seq_ensure(p_venue_id);
end; $$;
revoke all on function public.set_pos_cancel_password(uuid, text) from public, anon;
grant execute on function public.set_pos_cancel_password(uuid, text) to authenticated, service_role;

-- 잠금 규칙: 연속 5회 실패 → 마지막 실패로부터 10분 잠금(정답도 거절). 성공하면 0 으로.
--   시퀀스 값 = 마지막 실패 시각(에포크 분) × 16 + 연속 실패 수(0~15). setval 은 트랜잭션 롤백에도 남는다.
create or replace function public._ledger_check_cancel_password(p_venue uuid, p_password text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_hash text; s text; v_val bigint; v_called boolean; v_fails int := 0; v_min bigint; v_now bigint;
begin
  if my_role() is distinct from 'admin'::user_role then
    select cancel_password_hash into v_hash from public.venue_pos_settings where venue_id = p_venue;
    if v_hash is null then raise exception '취소 비밀번호가 설정되지 않았습니다. 업주가 먼저 설정해야 합니다'; end if;
    s := public._ledger_pw_seq_name(p_venue);
    if to_regclass('public.' || s) is null then perform public._ledger_pw_seq_ensure(p_venue); end if;
    execute format('select last_value, is_called from public.%I', s) into v_val, v_called;
    v_now := floor(extract(epoch from now()) / 60)::bigint;
    if coalesce(v_called, false) then
      v_fails := (v_val % 16)::int; v_min := v_val / 16;
      if v_now - v_min > 10 then v_fails := 0; end if;   -- 마지막 실패 10분 경과 → 잠금·카운터 해제
    end if;
    if v_fails >= 5 then
      raise exception '취소 비밀번호를 5번 틀려 10분 동안 잠겼습니다. 잠시 후 다시 시도해 주세요'
        using errcode = '42501', hint = 'LEDGER_PW_LOCKED';
    end if;
    if extensions.crypt(coalesce(p_password,''), v_hash) <> v_hash then
      v_fails := v_fails + 1;
      perform setval('public.' || quote_ident(s), v_now * 16 + v_fails, true);
      if v_fails >= 5 then
        raise exception '취소 비밀번호를 5번 틀려 10분 동안 잠겼습니다. 잠시 후 다시 시도해 주세요'
          using errcode = '42501', hint = 'LEDGER_PW_LOCKED';
      end if;
      raise exception '비밀번호가 올바르지 않습니다 (%번 더 틀리면 10분 동안 잠깁니다)', 5 - v_fails using errcode = '42501';
    end if;
    perform setval('public.' || quote_ident(s), v_now * 16, true);
  end if;
end $$;
revoke all on function public._ledger_check_cancel_password(uuid, text) from public, anon, authenticated;

-- ═══ N3 · ledger_sessions BEFORE INSERT 클라 가드 ═══════════════════════════════
-- 그 사람이 그 매장 장부를 맡을 수 있는가(담당 지정 검증용). 읽기 전용 · authenticated 실행 허용(트리거가 호출자 권한으로 부른다).
create or replace function public._ledger_can_operate(p_user uuid, p_venue uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p_user is not null and p_venue is not null and (
       exists (select 1 from public.profiles p where p.id = p_user and p.role = 'admin'::user_role)
    or exists (select 1 from public.venues v where v.id = p_venue and v.owner_id = p_user)
    or exists (select 1 from public.venue_owners vo where vo.venue_id = p_venue and vo.user_id = p_user and vo.status = 'approved')
    or ( exists (select 1 from public.ledger_access la where la.venue_id = p_venue and la.user_id = p_user)
         and public._is_active_venue_staff(p_user, p_venue) )
  );
$$;
revoke all on function public._ledger_can_operate(uuid, uuid) from public, anon;
grant execute on function public._ledger_can_operate(uuid, uuid) to authenticated, service_role;

create or replace function public._ledger_sessions_client_insert_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_kst date := (now() at time zone 'Asia/Seoul')::date;
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  -- upsert(ON CONFLICT DO UPDATE)의 INSERT 시도: 행이 이미 있으면 UPDATE 경로가 이어지고 그쪽 트리거가 지킨다 — 여기서는 건드리지 않는다.
  if exists (select 1 from public.ledger_sessions s
              where s.venue_id = new.venue_id and s.session_date = new.session_date and s.game_seq = new.game_seq) then
    return new;
  end if;
  new.closed := false; new.closed_at := null; new.close_memo := null;
  new.reg_closed := false; new.reg_closed_at := null;
  if new.opened_by is not null and new.opened_by is distinct from auth.uid()
     and not coalesce(public._ledger_can_operate(new.opened_by, new.venue_id), false) then
    raise exception '담당자는 이 매장의 장부 권한자만 지정할 수 있습니다' using errcode = '42501', hint = 'LEDGER_OPERATOR_INVALID';
  end if;
  if not coalesce(public.can_manage_pos(new.venue_id), false)
     and new.session_date <> v_kst and new.session_date <> public.ledger_business_date(new.venue_id) then
    raise exception '직원은 오늘(또는 진행 중인 영업일) 장부만 새로 열 수 있습니다 — 지난 날짜 장부는 업주에게 요청해 주세요'
      using errcode = '42501', hint = 'LEDGER_DATE_NOT_ALLOWED';
  end if;
  return new;
end $$;
revoke all on function public._ledger_sessions_client_insert_guard() from public, anon, authenticated;
drop trigger if exists trg_a0_ledger_sessions_client_insert_guard on public.ledger_sessions;
create trigger trg_a0_ledger_sessions_client_insert_guard before insert on public.ledger_sessions
  for each row execute function public._ledger_sessions_client_insert_guard();

-- ═══ N4 · 바인 player_name/entry_no · 플레이어 name 클라 직접 변경 거절 ═══════════
create or replace function public._ledger_buyins_client_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_price numeric; v_discs jsonb; o bigint[]; n bigint[];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.request_id is not null then
      raise exception '바인 요청 연결은 서버만 설정할 수 있습니다' using errcode = '42501';
    end if;
    new.created_by := auth.uid();
    new.buyin_at := now();
    if coalesce(public.can_access_ledger(new.venue_id), false) then
      new := public._ledger_buyin_apply_amount_rule(new);
    end if;
  else
    if new.request_id is distinct from old.request_id
       or new.created_by is distinct from old.created_by
       or new.buyin_at is distinct from old.buyin_at
       or new.venue_id is distinct from old.venue_id
       or new.session_date is distinct from old.session_date then
      raise exception '기록자·기록 시각·매장·요청 연결은 바꿀 수 없습니다' using errcode = '42501';
    end if;
    if new.game_seq is distinct from old.game_seq then
      raise exception '기록의 게임 번호는 바꿀 수 없습니다' using errcode = '42501';
    end if;
    -- [20260925g N4] 손님 간 이동·순번 변경은 화면 경로가 없다(이름 변경은 rename_ledger_player RPC 가 바인까지 함께 옮긴다).
    if new.player_name is distinct from old.player_name or new.entry_no is distinct from old.entry_no then
      raise exception '바인의 손님·순번은 직접 바꿀 수 없습니다 — 이름 변경은 플레이어 이름 수정으로 하세요' using errcode = '42501';
    end if;
    if (new.payment_method, new.is_unpaid, new.is_split, new.cash_amount, new.card_amount, new.transfer_amount,
        new.ticket_count, new.unpaid_amount, new.discount_index)
       is distinct from
       (old.payment_method, old.is_unpaid, old.is_split, old.cash_amount, old.card_amount, old.transfer_amount,
        old.ticket_count, old.unpaid_amount, old.discount_index) then
      new := public._ledger_buyin_apply_amount_rule(new);
    end if;
    select s.buyin_amount, s.discounts into v_price, v_discs
      from public.ledger_sessions s
     where s.venue_id = old.venue_id and s.session_date = old.session_date and s.game_seq = old.game_seq;
    o := public._ledger_buyin_tiers(old, v_price, v_discs);
    n := public._ledger_buyin_tiers(new, v_price, v_discs);
    if n[1] < o[1] or n[2] < o[2] or n[3] < o[3] then
      raise exception '매출이 줄어드는 수정은 업주 취소 비밀번호가 필요합니다'
        using errcode = '42501', hint = 'LEDGER_REDUCE_NEEDS_PASSWORD';
    end if;
  end if;
  return new;
end $$;
revoke all on function public._ledger_buyins_client_guard() from public, anon, authenticated;

create or replace function public._ledger_players_client_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.name is distinct from old.name then
      raise exception '플레이어 이름은 이름 수정 기능으로만 바꿀 수 있습니다(바인 기록이 함께 옮겨집니다)' using errcode = '42501';
    end if;
    if new.venue_id is distinct from old.venue_id or new.session_date is distinct from old.session_date
       or new.game_seq is distinct from old.game_seq then
      raise exception '플레이어의 매장·날짜·게임 번호는 바꿀 수 없습니다' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public._ledger_players_client_guard() from public, anon, authenticated;
drop trigger if exists trg_ledger_players_client_guard on public.ledger_players;
create trigger trg_ledger_players_client_guard before update on public.ledger_players
  for each row execute function public._ledger_players_client_guard();

-- ═══ N5 · 직원 셀프 출퇴근은 KST 오늘·어제만 ═════════════════════════════════════
create or replace function public.set_my_shift_time(p_venue_id uuid, p_work_date date, p_field text, p_value text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_val text; v_n int; v_kst date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_field not in ('check_in', 'check_out') then raise exception '알 수 없는 항목입니다'; end if;
  v_val := nullif(btrim(coalesce(p_value, '')), '');
  if v_val is not null and v_val !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception '시각 형식이 올바르지 않습니다 (HH:MM)';
  end if;
  -- [20260925g N5] 소급 기록 차단 — 오늘(KST)과 어제(자정 넘긴 퇴근)만. 그 밖은 업주가 고친다.
  if p_work_date is null or p_work_date < v_kst - 1 or p_work_date > v_kst then
    raise exception '출퇴근은 오늘과 어제 근무만 직접 기록할 수 있습니다 — 지난 근무는 업주에게 수정을 요청해 주세요' using errcode = '42501';
  end if;
  select s.id into v_id
    from public.staff_schedule s
   where s.venue_id = p_venue_id and s.work_date = p_work_date
     and public.is_my_shift_row(s.venue_id, s.staff_name, s.user_id)
   limit 1;
  if v_id is null then raise exception '그 날짜에 배정된 본인 일정이 없습니다'; end if;
  if p_field = 'check_in' then
    update public.staff_schedule set check_in  = v_val where id = v_id;
  else
    update public.staff_schedule set check_out = v_val where id = v_id;
  end if;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception '출퇴근을 기록하지 못했습니다'; end if;
end; $$;
revoke all on function public.set_my_shift_time(uuid, date, text, text) from public, anon;
grant execute on function public.set_my_shift_time(uuid, date, text, text) to authenticated, service_role;

-- ═══ N7 · kill_venue: 소속 직원 계정 정리 ═════════════════════════════════════════
create or replace function public.kill_venue(p_venue_id uuid, p_owner_name text, p_password text)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner uuid; v_real text; v_hash text; v_tbl text; v_left int;
  v_whitelist text[] := array[
    'comments','schedules','venue_follows','venue_staff_invites','venue_rankings','venue_notices',
    'venue_pos_settings','ledger_access','schedule_access','venue_staff','ledger_sessions','staff_schedule','clock_presets',
    'ranking_point_awards','ledger_buyins','ledger_players','clock_states','staff_wage','waitlist',
    'customer_profiles','customer_aliases','coupons','dealer_shifts','store_vouchers','checkins','voucher_access',
    'venue_messages','venue_score_entries','league_members','league_entries','venue_reviews',
    'voucher_credit_requests','venue_event_requests','venue_owners','ledger_buyin_requests','venue_announcements',
    'venue_seasons','game_presets','venue_kill_switch','league_event_status'
  ];
begin
  select owner_id into v_owner from public.venues where id = p_venue_id;
  if v_owner is null then raise exception '매장을 찾을 수 없습니다'; end if;
  if auth.uid() is null or auth.uid() <> v_owner then raise exception '매장 대표 업주만 실행할 수 있습니다'; end if;
  select real_name into v_real from public.profiles where id = v_owner;
  if coalesce(trim(v_real), '') = '' then raise exception '본인인증(실명)된 업주만 실행할 수 있습니다'; end if;
  if lower(trim(p_owner_name)) <> lower(trim(v_real)) then raise exception '업주 실명이 일치하지 않습니다'; end if;
  select pw_hash into v_hash from public.venue_kill_switch where venue_id = p_venue_id;
  if v_hash is null then raise exception '킬스위치 비밀번호를 먼저 설정하세요'; end if;
  if v_hash <> extensions.crypt(p_password, v_hash) then raise exception '킬스위치 비밀번호가 일치하지 않습니다'; end if;
  select count(*) into v_left from public.store_vouchers
   where venue_id = p_venue_id and status = 'active' and (expires_at is null or expires_at > now());
  if v_left > 0 then
    raise exception '손님이 아직 쓰지 않은 매장이용권이 %장 남아 있어 매장을 삭제할 수 없습니다. 이용권을 모두 사용하거나 회수한 뒤 다시 시도해 주세요', v_left;
  end if;
  perform public._audit('kill_venue', p_venue_id::text, jsonb_build_object('owner_name_verified', true));
  -- [20260925g N7] 소속 직원은 일반 회원으로 되돌린다(manage_staff remove 와 같은 결과) — role 만 남기면 다른 매장 초대가 영구 거절된다.
  update public.profiles set role = 'user', approved = false, staff_title = null, venue_id = null
   where venue_id = p_venue_id and role = 'venue_staff';
  update public.profiles set venue_id = null where venue_id = p_venue_id;
  foreach v_tbl in array v_whitelist loop
    execute format('delete from public.%I where venue_id = $1', v_tbl) using p_venue_id;
  end loop;
  execute format('drop sequence if exists public.%I', public._ledger_pw_seq_name(p_venue_id));
  perform set_config('nuri.voucher_purge_venue', p_venue_id::text, true);
  delete from public.voucher_events where venue_id = p_venue_id;
  perform set_config('nuri.voucher_purge_venue', '', true);
  delete from public.venues where id = p_venue_id;
  return 1;
end $$;
revoke all on function public.kill_venue(uuid, text, text) from public, anon;
grant execute on function public.kill_venue(uuid, text, text) to authenticated, service_role;

-- ═══ N8 · 업주·관리자는 직원 초대를 수락할 수 없다 ═════════════════════════════════
create or replace function public.respond_staff_invite(p_invite_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_venue uuid; v_user uuid; v_by uuid;
        v_gl boolean; v_gv boolean; v_gs boolean; v_title text; v_ok boolean;
begin
  select venue_id, user_id, invited_by, grant_ledger, grant_voucher, grant_schedule, staff_title
    into v_venue, v_user, v_by, v_gl, v_gv, v_gs, v_title
    from public.venue_staff_invites where id = p_invite_id and status = 'pending';
  if v_user is null or v_user is distinct from auth.uid() then
    raise exception '초대를 찾을 수 없습니다';
  end if;
  if p_accept then
    -- [20260925g N8] 초대 시점이 아니라 수락 시점의 자격을 본다 — 업주 계정이 수락하면 venue_staff 로 강등돼 권한이 두 벌로 갈렸다.
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
    select exists (
      select 1 from public.profiles p where p.id = v_by and p.role = 'admin'
      union all
      select 1 from public.venues v where v.id = v_venue and v.owner_id = v_by
      union all
      select 1 from public.venue_owners vo where vo.venue_id = v_venue and vo.user_id = v_by and vo.status='approved'
    ) into v_ok;
    if coalesce(v_ok,false) then
      if v_gl then insert into public.ledger_access(venue_id,user_id)   values (v_venue, v_user) on conflict do nothing; end if;
      if v_gv then insert into public.voucher_access(venue_id,user_id)  values (v_venue, v_user) on conflict do nothing; end if;
      if v_gs then insert into public.schedule_access(venue_id,user_id) values (v_venue, v_user) on conflict do nothing; end if;
    end if;
    update public.venue_staff_invites set status='accepted' where id=p_invite_id;
  else
    update public.venue_staff_invites set status='declined' where id=p_invite_id;
  end if;
end; $$;
revoke all on function public.respond_staff_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_staff_invite(uuid, boolean) to authenticated, service_role;

-- ═══ N9 · venues 보호 컬럼 추가(follower_count · kind · 인증 후 business_number) ══════
create or replace function public.guard_venue_verification()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('authenticated', 'anon') and coalesce(public.my_role()::text, '') <> 'admin' then
    if new.verification_status is distinct from old.verification_status then
      raise exception '매장 인증 상태는 관리자만 변경할 수 있습니다';
    end if;
    if new.approved               is distinct from old.approved
       or new.is_paid_ad             is distinct from old.is_paid_ad
       or new.voucher_quota          is distinct from old.voucher_quota
       or new.voucher_issue_approved is distinct from old.voucher_issue_approved
       or new.owner_id               is distinct from old.owner_id
       or new.slug                   is distinct from old.slug
       or new.status                 is distinct from old.status
       or new.display_order          is distinct from old.display_order
    then
      raise exception '보호된 매장 항목(승인·광고·이용권 한도·소유자·주소·제재·노출순서)은 직접 변경할 수 없습니다';
    end if;
    -- [20260925g N9] follower_count 는 서버 계산(sync_venue_followers, SECURITY DEFINER 라 이 가지를 안 탄다) · kind 는 매장/그룹 구분.
    if new.follower_count is distinct from old.follower_count then
      raise exception '팔로워 수는 직접 바꿀 수 없습니다 — 팔로우 기록으로만 계산됩니다';
    end if;
    if new.kind is distinct from old.kind then
      raise exception '매장 종류는 직접 바꿀 수 없습니다';
    end if;
    if new.business_number is distinct from old.business_number
       and coalesce(old.verification_status::text, 'unverified') <> 'unverified' then
      raise exception '인증이 진행·완료된 매장의 사업자등록번호는 바꿀 수 없습니다 — 운영자에게 문의해 주세요';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_venue_verification() from public, anon, authenticated;

-- ═══ N13 · voucher_holder_stats: 만료 제외 ═══════════════════════════════════════
create or replace function public.voucher_holder_stats(p_venue_id uuid)
returns table(holder_count bigint, active_count bigint, used_count bigint)
language sql security definer set search_path = public, pg_temp as $$
  select
    count(distinct holder_user_id) filter (where status='active' and (expires_at is null or expires_at > now()) and holder_user_id is not null)::bigint,
    count(*) filter (where status='active' and (expires_at is null or expires_at > now()))::bigint,
    count(*) filter (where status='used')::bigint
  from public.store_vouchers
  where venue_id = p_venue_id and can_view_vouchers(p_venue_id);
$$;
revoke all on function public.voucher_holder_stats(uuid) from public, anon;
grant execute on function public.voucher_holder_stats(uuid) to authenticated, service_role;

-- ═══ N16 · 포스터 이미지 업로드: 승인 공동운영자(role≠venue_owner)도 허용 ══════════
drop policy if exists posters_upload on storage.objects;
create policy posters_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'posters'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (public.my_role() = any (array['venue_owner'::user_role, 'admin'::user_role]) or public.is_any_venue_manager())
  );

-- ═══ N18 · league_entries 클라 INSERT 정책 제거(호출부 0 · 0행) ═══════════════════
drop policy if exists le_insert on public.league_entries;

-- ═══ N19 · delete_ledger_session: 마감 검사 + 취소 인증 ═══════════════════════════
drop function if exists public.delete_ledger_session(uuid, date, smallint);
create function public.delete_ledger_session(p_venue_id uuid, p_date date, p_game_seq smallint default 1, p_password text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_reqs uuid[]; v_req uuid;
begin
  if not coalesce(public.can_manage_pos(p_venue_id), false) then
    raise exception 'permission denied: POS 관리 권한이 필요합니다';
  end if;
  if public.ledger_is_closed(p_venue_id, p_date, p_game_seq) then
    raise exception '마감된 장부는 삭제할 수 없습니다 — 먼저 마감을 해제하세요';
  end if;
  -- [20260925g N19] 바인이 하나라도 있으면 취소 비밀번호 규칙(cancel_ledger_buyin 과 동일)을 거친다.
  if exists (select 1 from public.ledger_buyins b
              where b.venue_id = p_venue_id and b.session_date = p_date and b.game_seq = p_game_seq) then
    perform public._ledger_require_cancel_auth(p_venue_id, p_password);
  end if;
  with del as (
    delete from public.ledger_buyins
     where venue_id = p_venue_id and session_date = p_date and game_seq = p_game_seq
    returning request_id
  )
  select array_agg(distinct d.request_id) into v_reqs from del d where d.request_id is not null;
  foreach v_req in array coalesce(v_reqs, '{}'::uuid[]) loop
    perform public._restore_voucher_for_request(v_req);
  end loop;
  delete from public.ledger_players  where venue_id = p_venue_id and session_date = p_date and game_seq = p_game_seq;
  delete from public.ledger_sessions where venue_id = p_venue_id and session_date = p_date and game_seq = p_game_seq;
end $$;
revoke all on function public.delete_ledger_session(uuid, date, smallint, text) from public, anon;
grant execute on function public.delete_ledger_session(uuid, date, smallint, text) to authenticated, service_role;

-- ═══ N10 · find_user_by_phone: 전체 회원 검색 유지 + 호출 기록(번호 원문 저장 안 함) ═══
--   라이브 정본 md5(find_user_by_phone) 는 헤더 표 밖 — 적용 전 실측: 본문은 20260925 낮에 읽은 정의와 같아야 한다(SQL, SECURITY DEFINER, limit 5).
create table if not exists public.phone_lookup_audit (
  id           bigint generated always as identity primary key,
  caller       uuid,
  venue_id     uuid,
  phone_last4  text,
  phone_hash   text,
  result_count int not null default 0,
  created_at   timestamptz not null default now()
);
comment on table public.phone_lookup_audit is '전화번호→회원 조회(find_user_by_phone) 호출 기록(2026-09-25 오너 결정). 번호 원문 없음 — 뒤 4자리·md5 만. 관리자만 읽는다.';
alter table public.phone_lookup_audit enable row level security;
revoke all on public.phone_lookup_audit from public, anon, authenticated;
drop policy if exists phone_lookup_audit_admin_read on public.phone_lookup_audit;
create policy phone_lookup_audit_admin_read on public.phone_lookup_audit for select to authenticated
  using (public.my_role() is not distinct from 'admin'::user_role);
grant select on public.phone_lookup_audit to authenticated;   -- 정책이 관리자만 통과시킨다
create index if not exists phone_lookup_audit_caller_idx on public.phone_lookup_audit (caller, created_at desc);

create or replace function public.find_user_by_phone(p_phone text)
returns table(id uuid, display text, verified boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_digits text := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
        v_allowed boolean; v_venue uuid; v_n int;
begin
  v_allowed := public.my_role() = 'admin'
            or exists (select 1 from public.venues v where v.owner_id = auth.uid())
            or exists (select 1 from public.venue_owners vo where vo.user_id = auth.uid() and vo.status = 'approved');
  if not coalesce(v_allowed, false) or length(v_digits) < 9 then
    return;   -- 종전과 같이 0행(권한 없음·짧은 입력은 기록하지 않는다)
  end if;
  return query
  select p.id, coalesce(p.nickname, p.name), public.is_ci_verified(p.ci_hash, p.verified_at)
    from public.profiles p
   where coalesce(p.status::text, 'active') = 'active'
     and regexp_replace(coalesce(p.phone,''), '[^0-9]', '', 'g') <> ''
     and right(regexp_replace(coalesce(p.phone,''), '[^0-9]', '', 'g'), 10) = right(v_digits, 10)
   limit 5;
  get diagnostics v_n = row_count;
  v_venue := coalesce(
    (select v.id from public.venues v where v.owner_id = auth.uid() order by v.id limit 1),
    (select vo.venue_id from public.venue_owners vo where vo.user_id = auth.uid() and vo.status = 'approved' order by vo.venue_id limit 1),
    (select pr.venue_id from public.profiles pr where pr.id = auth.uid()));
  insert into public.phone_lookup_audit(caller, venue_id, phone_last4, phone_hash, result_count)
  values (auth.uid(), v_venue, right(v_digits, 4), md5(v_digits), v_n);
  return;
end $$;
revoke all on function public.find_user_by_phone(text) from public, anon;
grant execute on function public.find_user_by_phone(text) to authenticated, service_role;

-- ═══ N14 · 승인된 포스터의 핵심 항목 수정 → 재심사(approved=false) ═══════════════════
--   라이브 정본 md5(prevent_self_approve_poster) = 125ed4e9fed5ab783f28063473d4748b (헤더 표 밖 — 적용 전 대조).
--   핵심 항목: title · buy_in · prize_pool · guaranteed · date · start_time. 반려 칼럼(rejected_at·reject_reason)은 종전 규칙 그대로.
--   ⚠ _notify_admin_pending_poster 는 AFTER INSERT 전용이라 재심사 대기가 관리자에게 알림으로 가지 않는다(별도 결정).
create or replace function public.prevent_self_approve_poster()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.my_role() is distinct from 'admin'::user_role then
    new.approved := old.approved;
    if old.approved
       and ( new.title      is distinct from old.title
          or new.buy_in     is distinct from old.buy_in
          or new.prize_pool is distinct from old.prize_pool
          or new.guaranteed is distinct from old.guaranteed
          or new.date       is distinct from old.date
          or new.start_time is distinct from old.start_time ) then
      new.approved := false;   -- [20260925g N14] 핵심 항목이 바뀌면 다시 심사
    end if;
    if new.updated_at is distinct from old.updated_at then
      new.rejected_at := null;
      new.reject_reason := null;
    else
      new.rejected_at := old.rejected_at;
      new.reject_reason := old.reject_reason;
    end if;
  end if;
  if new.approved then
    new.rejected_at := null;
    new.reject_reason := null;
  end if;
  return new;
end; $$;
revoke all on function public.prevent_self_approve_poster() from public, anon, authenticated;

-- ═══ 자가검사 ═══════════════════════════════════════════════════════════════════
do $$
declare n int;
begin
  if has_column_privilege('anon', 'public.venue_pos_settings', 'cancel_password_hash', 'SELECT')
     or has_column_privilege('authenticated', 'public.venue_pos_settings', 'cancel_password_hash', 'SELECT')
     or has_column_privilege('anon', 'public.venue_kill_switch', 'pw_hash', 'SELECT')
     or has_column_privilege('authenticated', 'public.venue_kill_switch', 'pw_hash', 'SELECT') then
    raise exception 'SELFCHECK: 비밀 컬럼 SELECT 가 아직 열려 있다';
  end if;
  if not has_column_privilege('authenticated', 'public.venue_pos_settings', 'venue_id', 'SELECT') then
    raise exception 'SELFCHECK: venue_pos_settings.venue_id 조회가 닫혔다';
  end if;
  if not exists (select 1 from pg_trigger where tgname='trg_a0_ledger_sessions_client_insert_guard') then raise exception 'SELFCHECK: 세션 INSERT 트리거 없음'; end if;
  if not exists (select 1 from pg_trigger where tgname='trg_ledger_players_client_guard') then raise exception 'SELFCHECK: 플레이어 트리거 없음'; end if;
  if exists (select 1 from pg_policy where polname='le_insert') then raise exception 'SELFCHECK: le_insert 남음'; end if;
  if not exists (select 1 from pg_policy where polname='posters_upload') then raise exception 'SELFCHECK: posters_upload 없음'; end if;
  select count(*) into n from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='delete_ledger_session';
  if n <> 1 then raise exception 'SELFCHECK: delete_ledger_session 오버로드 수 % (1 이어야)', n; end if;
  if exists (select 1 from pg_proc p where p.pronamespace='public'::regnamespace
              and p.proname in ('_ledger_check_cancel_password','_ledger_pw_seq_ensure','_ledger_pw_seq_name','_ledger_sessions_client_insert_guard','_ledger_players_client_guard','_ledger_buyins_client_guard','guard_venue_verification')
              and (p.proacl is null or has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))) then
    raise exception 'SELFCHECK: 내부 함수가 anon/authenticated 에 열려 있다';
  end if;
  if not exists (select 1 from pg_class c where c.relname='phone_lookup_audit' and c.relrowsecurity) then raise exception 'SELFCHECK: phone_lookup_audit RLS 꺼짐'; end if;
  if has_table_privilege('anon', 'public.phone_lookup_audit', 'select') then raise exception 'SELFCHECK: phone_lookup_audit anon 열림'; end if;
  raise notice 'SELFCHECK OK';
end $$;
