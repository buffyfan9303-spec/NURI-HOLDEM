-- 20261004d 라이브 롤백 리허설 (store-team 2026-10-04 작성 · 실행은 리드)
--
-- 실행: MCP execute_sql **한 번**에  begin;  <supabase/migrations/20261004d_checkin_geo_required_after_notice.sql 전문>  <이 파일 전문>  rollback;
--   · 이 파일의 마지막 DO 블록은 **언제나 예외로 끝난다**(ZZ999) — 결과 표가 오류 메시지로 나오고 트랜잭션 전체(마이그레이션 포함)가 되돌려진다.
--     rollback 을 깜빡해도 아무것도 남지 않는다. 메시지 첫머리가 'REHEARSAL PASS' 인지 'REHEARSAL FAIL' 인지 본다.
--   · 시나리오마다 안쪽 블록을 ZZ001 로 스스로 되돌린다(앞 시나리오의 출석이 4시간 중복으로 다음 시나리오를 막지 않게).
--   · 롤백이 실제로 듣는지: 첫 줄에서 프로브 표를 만든다 → 리허설 뒤 `select to_regclass('public._probe_20261004d')` 가 null 이어야 한다.
--
-- 계정·매장은 이름으로 박지 않고 **역할·소유·소속을 조회해서** 고른다(nuri-migration §5):
--   u_id = 일반 회원(role user · active · 정지 아님) 중 아무 매장의 소유자·공동운영자도 아닌 사람 — 출석 주체
--   vv_id = 승인된 매장(kind='venue') 중 **대표가 순수 업주(role venue_owner · 승인 · 관리자 아님)** 인 곳 — '위치 확인 출석' 켬 · 임시 좌표 37.5/127.0
--           (critical 2026-10-04: 첫 리허설의 '업주 양성'이 관리자였다 — 관리자 분기로 통과해 업주 양성이 증명되지 않았다)
--   ww_id = 다른 승인 매장 — 꺼짐(지금 동작 유지 확인)
--   o_id = vv_id 의 대표(순수 업주) — 매장 스위치·직원 출석 처리 양성 대조
--   c_id = u_id 와 다른 일반 회원을 트랜잭션 안에서 vv_id 의 **승인 공동 운영자**로 만든 사람(F1 음성 · L1 양성)
--   x_id = u_id·c_id 와 다른 일반 회원(매장 관계 없음) — 출석 요청 RLS 음성(남의 요청을 못 본다)
-- u_id 의 vv_id·ww_id 최근 4시간 출석과 위치 동의 행, 오늘 참가 신청 행, c_id 의 공동 운영자 행은 바깥 트랜잭션 안에서만 만든다/지운다(롤백).
-- v3(오너 B 2026-10-05): S1·S2 는 손님(u_id)의 출석 요청 뒤 승인 · Q1~Q10 = 요청·승인 양성/음성 · R5 에 request_checkin·표 권한.

create table public._probe_20261004d (x int);

do $rehearsal$
declare
  u_id uuid; o_id uuid; vv_id uuid; ww_id uuid; c_id uuid; x_id uuid;
  REJ constant text := '오늘 이 매장에 출석 요청이나 참가 신청을 보낸 손님만 출석 처리할 수 있습니다';
  n_a int; n_b int; n_c int;
  -- 20261005a 가 함께 적용됐는가 — 같은 파일로 4d 단독·4d+5a 둘 다 리허설한다. 판별은 staff_check_in 의 영업일 변수(v_biz)로 한다
  --   (check_in 의 code 로 판별하면 그 code 를 지운 변조가 '5a 미적용'으로 보여 음성 대조가 거짓 통과한다).
  v5 boolean := pg_get_functiondef('public.staff_check_in(uuid,uuid)'::regprocedure) like '%v_biz := public.ledger_business_date%';
  v_biz date;
  r jsonb; n_ck0 int; n_ck1 int; n_lg0 int; n_lg1 int; n_au0 int; n_au1 int; n_rows int;
  out text := ''; fails int := 0; total int := 0;
  st text;
  -- 한 시나리오: 사용자·시각·동의를 정하고 check_in 을 부른 뒤 결과와 출석/확인자료 증감을 돌려준다(그리고 스스로 되돌린다).
begin
  -- ── 대상 고르기 ─────────────────────────────────────────────
  select p.id into u_id from public.profiles p
   where p.role::text = 'user' and p.status::text = 'active' and (p.suspended_until is null or p.suspended_until < now())
     and not exists (select 1 from public.venues v where v.owner_id = p.id)
     and not exists (select 1 from public.venue_owners vo where vo.user_id = p.id)
   order by p.id limit 1;
  select v.id, v.owner_id into vv_id, o_id from public.venues v join public.profiles p on p.id = v.owner_id
   where v.approved and v.kind = 'venue' and p.role::text = 'venue_owner' and p.approved is true and p.status::text = 'active'
     and (p.suspended_until is null or p.suspended_until < now())
   order by v.id limit 1;
  select v.id into ww_id from public.venues v where v.approved and v.id <> vv_id order by v.id limit 1;
  select p.id into c_id from public.profiles p
   where p.role::text = 'user' and p.status::text = 'active' and (p.suspended_until is null or p.suspended_until < now())
     and p.id <> u_id and not exists (select 1 from public.venues v where v.owner_id = p.id)
   order by p.id limit 1;
  select p.id into x_id from public.profiles p
   where p.role::text = 'user' and p.status::text = 'active' and p.id not in (u_id, c_id)
     and not exists (select 1 from public.venues v where v.owner_id = p.id)
     and not exists (select 1 from public.venue_owners vo where vo.user_id = p.id)
   order by p.id limit 1;
  if u_id is null or vv_id is null or ww_id is null or o_id is null or c_id is null or x_id is null then
    raise exception using errcode = 'ZZ999', message = format('REHEARSAL FAIL 대상 없음 u_id=%s vv_id=%s ww_id=%s o_id=%s c_id=%s x_id=%s', u_id, vv_id, ww_id, o_id, c_id, x_id);
  end if;
  out := format('u=%s vv=%s ww=%s o=%s c=%s x=%s | ', left(u_id::text, 8), left(vv_id::text, 8), left(ww_id::text, 8), left(o_id::text, 8), left(c_id::text, 8), left(x_id::text, 8));
  -- c_id 를 vv_id 의 승인 공동 운영자로(트랜잭션 안에서만) — _venue_coowner_ok: venue_owners.status approved + 프로필 approved + kind venue
  update public.profiles set approved = true where id = c_id;
  delete from public.venue_owners where venue_id = vv_id and user_id = c_id;
  insert into public.venue_owners (venue_id, user_id, status) values (vv_id, c_id, 'approved');

  -- ── 바깥 준비(전부 롤백) ────────────────────────────────────
  insert into public.app_settings (key, value) values ('checkin_geo_enabled', 'on')
    on conflict (key) do update set value = 'on';
  update public.venues set lat = 37.5, lng = 127.0, checkin_geo_required = true where id = vv_id;
  -- ww 도 좌표를 준다 — 좌표가 없어서 위치가 안 쓰이는 게 아니라 **매장 스위치가 꺼져서** 안 쓰이는지를 본다(P2·P3 이 noflag 변조를 잡게)
  update public.venues set lat = 37.6, lng = 127.1, checkin_geo_required = false where id = ww_id;
  delete from public.checkins where user_id = u_id and venue_id in (vv_id, ww_id) and created_at > now() - interval '4 hours';
  delete from public.location_consents where user_id = u_id;
  -- 요청 게이트 음성(Q1·Q2)이 운영 데이터의 오늘 참가 신청 때문에 거짓 통과·거짓 실패하지 않게(롤백)
  delete from public.ledger_buyin_requests where user_id = u_id and venue_id in (vv_id, ww_id) and session_date >= current_date - 2;
  delete from public.checkin_requests where user_id = u_id;

  -- ── 시나리오 표: 이름 | 시각(after/before) | 매장 | 동의(none/v2/v3) | 좌표(none/in/far) | 운영스위치(on/off) | 기대 ──
  for st in select unnest(array[
    -- 음성(막아야 할 것)
    'N1|after|vv_id|none|none|on|code:geo_consent_required|ck0|lg0',
    'N2|after|vv_id|v2|in|on|code:geo_consent_required|ck0|lg0',
    'N3|after|vv_id|v3|none|on|code:geo_position_required|ck0|lg0',
    'N4|after|vv_id|v3|far|on|err:매장 근처에서만 출석할 수 있어요|ck0|lg1',
    'N5|after|vv_id|none|in|on|code:geo_consent_required|ck0|lg0',
    -- 양성(통과해야 할 것)
    'P1|after|vv_id|v3|in|on|ok|ck1|lg1',
    'P2|after|ww_id|none|none|on|ok|ck1|lg0',
    'P3|after|ww_id|v3|far|on|ok|ck1|lg0',
    'P4|before|vv_id|none|none|on|ok|ck1|lg0',
    'P5|before|vv_id|v3|far|on|err:매장 근처에서만 출석할 수 있어요|ck0|lg1',
    'P6|after|vv_id|none|none|off|ok|ck1|lg0',
    'P7|before|vv_id|v3|in|on|ok|ck1|lg1'
  ]) loop
    declare
      f text[] := string_to_array(st, '|');
      v_id uuid := case f[3] when 'vv_id' then vv_id else ww_id end;
      lat double precision := case f[5] when 'in' then 37.5005 when 'far' then 37.55 else null end;
      lng double precision := case f[5] when 'none' then null else 127.0 end;
      ok boolean;
    begin
      total := total + 1;
      begin
        -- 시각: D 를 하루 전/후로 바꾼다(이 안쪽 블록과 함께 되돌려진다)
        if f[2] = 'after' then
          execute $f$create or replace function public._checkin_geo_required_from() returns timestamptz language sql stable set search_path = public, pg_temp as $b$ select now() - interval '1 day' $b$$f$;
        else
          execute $f$create or replace function public._checkin_geo_required_from() returns timestamptz language sql stable set search_path = public, pg_temp as $b$ select now() + interval '1 day' $b$$f$;
        end if;
        if f[6] = 'off' then update public.app_settings set value = 'off' where key = 'checkin_geo_enabled'; end if;
        if f[4] in ('v2', 'v3') then
          insert into public.location_consents (user_id, granted, terms_version, granted_at)
          values (u_id, true, case f[4] when 'v2' then 2 else 3 end, now());
        end if;
        perform set_config('request.jwt.claims', json_build_object('sub', u_id, 'role', 'authenticated')::text, true);
        select count(*) into n_ck0 from public.checkins where user_id = u_id and venue_id = v_id;
        select count(*) into n_lg0 from public.location_access_log where user_id = u_id;
        r := public.check_in(v_id, lat, lng, case when lat is null then null else 20 end);
        select count(*) into n_ck1 from public.checkins where user_id = u_id and venue_id = v_id;
        select count(*) into n_lg1 from public.location_access_log where user_id = u_id;
        raise exception using errcode = 'ZZ001',
          message = jsonb_build_object('r', r, 'ck', n_ck1 - n_ck0, 'lg', n_lg1 - n_lg0)::text;
      exception
        when sqlstate 'ZZ001' then r := sqlerrm::jsonb;
        when others then r := jsonb_build_object('r', jsonb_build_object('raised', sqlerrm), 'ck', 0, 'lg', 0);
      end;
      ok := case
              when f[7] = 'ok' then (r->'r') ? 'name' and not ((r->'r') ? 'error')
              when f[7] like 'code:%' then r->'r'->>'code' = substr(f[7], 6) and coalesce(r->'r'->>'error', '') like '%매장에서 출석 요청을 보내면 업주 승인으로 출석할 수 있습니다'
              -- 20261005a P2: 반경 밖 거부에 code 'geo_out_of_range' 가 붙는다(문구는 그대로)
              when f[7] like 'err:%' then r->'r'->>'error' = substr(f[7], 5)
                and case when v5 and f[7] like 'err:매장 근처%' then r->'r'->>'code' = 'geo_out_of_range' else not ((r->'r') ? 'code') end
            end
            and (r->>'ck')::int = substr(f[8], 3)::int
            and (r->>'lg')::int = substr(f[9], 3)::int;
      if not coalesce(ok, false) then fails := fails + 1; end if;
      out := out || format('%s %s %s; ', f[1], case when coalesce(ok, false) then 'PASS' else 'FAIL' end,
                           case when coalesce(ok, false) then '' else r::text end);
    end;
  end loop;

  -- ── 매장 스위치 RPC ──────────────────────────────────────────
  -- R1 무권한(일반 회원 u_id) → 대표 전용 거부
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u_id, 'role', 'authenticated')::text, true);
    perform public.set_venue_checkin_geo_required(ww_id, true);
    fails := fails + 1; out := out || 'R1 FAIL 무권한이 통과; ';
  exception when others then
    if sqlerrm = '위치 확인 출석은 대표 업주만 켜고 끌 수 있습니다' then out := out || 'R1 PASS; '; else fails := fails + 1; out := out || 'R1 FAIL ' || sqlerrm || '; '; end if;
  end;
  -- R2 비로그인(빈 claims = auth.uid() NULL) → '로그인이 필요합니다'(fail-open 아님)
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', '', true);
    perform public.set_venue_checkin_geo_required(vv_id, false);
    fails := fails + 1; out := out || 'R2 FAIL 비로그인이 통과; ';
  exception when others then
    if sqlerrm = '로그인이 필요합니다' then out := out || 'R2 PASS; '; else fails := fails + 1; out := out || 'R2 FAIL ' || sqlerrm || '; '; end if;
  end;
  -- F1a 공동 운영자(c_id) — 전제: can_manage_pos 는 참(공동 운영자 맞음) · RPC 는 대표 전용으로 거부
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', c_id, 'role', 'authenticated')::text, true);
    if not coalesce(public.can_manage_pos(vv_id), false) then
      fails := fails + 1; out := out || 'F1a FAIL 전제(공동 운영자 can_manage_pos=true)가 안 섰다; ';
    else
      perform public.set_venue_checkin_geo_required(vv_id, false);
      fails := fails + 1; out := out || 'F1a FAIL 공동 운영자가 RPC 로 바꿨다; ';
    end if;
  exception when others then
    if sqlerrm = '위치 확인 출석은 대표 업주만 켜고 끌 수 있습니다' then out := out || 'F1a PASS; '; else fails := fails + 1; out := out || 'F1a FAIL ' || sqlerrm || '; '; end if;
  end;
  -- F1b 공동 운영자 직접 UPDATE(authenticated 역할 + RLS + 칸 가드 트리거) → 거부 또는 0행, 값 그대로
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', c_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.venues set checkin_geo_required = false where id = vv_id;
    get diagnostics n_rows = row_count;
    raise exception using errcode = 'ZZ001', message = 'rows=' || n_rows;
  exception
    when sqlstate 'ZZ001' then
      -- 오류 없이 끝났다 — 0행(RLS 차단)이면 통과, 1행이면 공동 운영자가 바꾼 것
      if sqlerrm = 'rows=0' then out := out || 'F1b PASS(0행); '; else fails := fails + 1; out := out || 'F1b FAIL 직접 UPDATE ' || sqlerrm || '; '; end if;
    when others then
      if sqlerrm like '공동 운영자는 매장 페이지 항목%' then out := out || 'F1b PASS(칸 가드); '; else fails := fails + 1; out := out || 'F1b FAIL ' || sqlerrm || '; '; end if;
  end;
  -- R3 대표(o_id, 순수 업주) 양성: 끄기 → false, 켜기 → true (좌표 있음)
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    if coalesce(public.my_role() = 'admin'::user_role, false) then raise exception '전제: o_id 가 관리자다(업주 양성이 아니다)'; end if;
    -- 호출과 재조회를 **다른 문장**으로 — 한 식 안의 하위 조회는 같은 스냅숏이라 방금 바꾼 값을 못 본다(로컬 PGlite 에서 거짓 FAIL 로 확인).
    r := jsonb_build_object('off', public.set_venue_checkin_geo_required(vv_id, false));
    r := r || jsonb_build_object('off_read', (select checkin_geo_required from public.venues where id = vv_id));
    r := r || jsonb_build_object('on', public.set_venue_checkin_geo_required(vv_id, true));
    r := r || jsonb_build_object('on_read', (select checkin_geo_required from public.venues where id = vv_id));
    if r is distinct from '{"off": false, "off_read": false, "on": true, "on_read": true}'::jsonb then
      fails := fails + 1; out := out || 'R3 FAIL ' || r::text || '; ';
    else out := out || 'R3 PASS; '; end if;
  exception when others then fails := fails + 1; out := out || 'R3 FAIL ' || sqlerrm || '; ';
  end;
  -- R4 좌표 없는 매장 켜기(RPC) → '출석 위치를 먼저 등록해 주세요' (대표라도)
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    update public.venues set checkin_geo_required = false where id = vv_id;
    update public.venues set lat = null, lng = null where id = vv_id;
    perform public.set_venue_checkin_geo_required(vv_id, true);
    raise exception using errcode = 'ZZ001', message = 'R4-passed';
  exception
    when sqlstate 'ZZ001' then fails := fails + 1; out := out || 'R4 FAIL 좌표 없이 켜짐; ';
    when others then
      if sqlerrm = '출석 위치를 먼저 등록해 주세요' then out := out || 'R4 PASS; '; else fails := fails + 1; out := out || 'R4 FAIL ' || sqlerrm || '; '; end if;
  end;
  -- F2a 켜진 채 좌표 지우기(직접 UPDATE — 공동 운영자도 lat·lng 는 고칠 수 있다) → CHECK 위반
  total := total + 1;
  begin
    update public.venues set lat = null where id = vv_id;
    raise exception using errcode = 'ZZ001', message = 'F2a-passed';
  exception
    when sqlstate 'ZZ001' then fails := fails + 1; out := out || 'F2a FAIL 켜진 채 좌표가 지워졌다; ';
    when check_violation then out := out || 'F2a PASS; ';
    when others then fails := fails + 1; out := out || 'F2a FAIL ' || sqlerrm || '; ';
  end;
  -- F2b 좌표 없는 매장을 직접 UPDATE 로 켜기 → CHECK 위반
  total := total + 1;
  begin
    update public.venues set checkin_geo_required = false, lat = null, lng = null where id = ww_id;
    update public.venues set checkin_geo_required = true where id = ww_id;
    raise exception using errcode = 'ZZ001', message = 'F2b-passed';
  exception
    when sqlstate 'ZZ001' then fails := fails + 1; out := out || 'F2b FAIL 좌표 없이 켜졌다; ';
    when check_violation then out := out || 'F2b PASS; ';
    when others then fails := fails + 1; out := out || 'F2b FAIL ' || sqlerrm || '; ';
  end;

  -- ── 직원 출석 처리 staff_check_in(L1) ─────────────────────────
  -- S1 손님(u_id) 출석 요청 → 대표(o_id) 승인: 이름 · checkins +1 · audit +1 · 위치 확인자료 0 · 요청 approved · 같은 손님 다시 → 4시간 중복
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u_id, 'role', 'authenticated')::text, true);
    perform public.request_checkin(vv_id);
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    select count(*) into n_ck0 from public.checkins where user_id = u_id and venue_id = vv_id;
    select count(*) into n_au0 from public.audit_log where action = 'staff_check_in' and target = vv_id::text;
    select count(*) into n_lg0 from public.location_access_log where user_id = u_id;
    r := public.staff_check_in(vv_id, u_id);
    select count(*) into n_ck1 from public.checkins where user_id = u_id and venue_id = vv_id;
    select count(*) into n_au1 from public.audit_log where action = 'staff_check_in' and target = vv_id::text;
    select count(*) into n_lg1 from public.location_access_log where user_id = u_id;
    if not (r ? 'name' and r ? 'points' and r ? 'streak') or n_ck1 - n_ck0 <> 1 or n_au1 - n_au0 <> 1 or n_lg1 <> n_lg0 then
      raise exception using errcode = 'ZZ002', message = format('r=%s ck=%s au=%s lg=%s', r, n_ck1 - n_ck0, n_au1 - n_au0, n_lg1 - n_lg0);
    end if;
    if not exists (select 1 from public.checkin_requests where venue_id = vv_id and user_id = u_id and status = 'approved' and decided_by = o_id and decided_at is not null) then
      raise exception using errcode = 'ZZ002', message = '요청이 approved 로 바뀌지 않았다';
    end if;
    begin
      perform public.staff_check_in(vv_id, u_id);
      raise exception using errcode = 'ZZ002', message = '중복이 통과';
    exception when sqlstate 'P0001' then
      if sqlerrm <> '이미 체크인했습니다 (4시간 내 중복 방지)' then raise exception using errcode = 'ZZ002', message = sqlerrm; end if;
    end;
    raise exception using errcode = 'ZZ001', message = 'ok';
  exception
    when sqlstate 'ZZ001' then out := out || 'S1 PASS; ';
    when others then fails := fails + 1; out := out || 'S1 FAIL ' || sqlerrm || '; ';
  end;
  -- S2 공동 운영자(c_id) 양성 — can_manage_pos 선(매장이용권 발급과 같은 선) · 손님 요청 뒤
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u_id, 'role', 'authenticated')::text, true);
    perform public.request_checkin(vv_id);
    perform set_config('request.jwt.claims', json_build_object('sub', c_id, 'role', 'authenticated')::text, true);
    r := public.staff_check_in(vv_id, u_id);
    raise exception using errcode = 'ZZ001', message = coalesce(r ->> 'name', '');
  exception
    when sqlstate 'ZZ001' then if sqlerrm <> '' then out := out || 'S2 PASS; '; else fails := fails + 1; out := out || 'S2 FAIL 이름 없음; '; end if;
    when others then fails := fails + 1; out := out || 'S2 FAIL ' || sqlerrm || '; ';
  end;
  -- S3 무권한(일반 회원 u_id 가 c_id 를) → 거부
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u_id, 'role', 'authenticated')::text, true);
    perform public.staff_check_in(vv_id, c_id);
    fails := fails + 1; out := out || 'S3 FAIL 무권한이 통과; ';
  exception when others then
    if sqlerrm = '출석 처리 권한이 없습니다' then out := out || 'S3 PASS; '; else fails := fails + 1; out := out || 'S3 FAIL ' || sqlerrm || '; '; end if;
  end;
  -- S4 대표 본인 출석 처리 → 거부(위치 확인 우회 금지)
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    perform public.staff_check_in(vv_id, o_id);
    fails := fails + 1; out := out || 'S4 FAIL 본인 처리가 통과; ';
  exception when others then
    if sqlerrm = '본인 출석은 매장 출석 QR로 해 주세요' then out := out || 'S4 PASS; '; else fails := fails + 1; out := out || 'S4 FAIL ' || sqlerrm || '; '; end if;
  end;
  -- S5 비로그인 → '로그인이 필요합니다'
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', '', true);
    perform public.staff_check_in(vv_id, u_id);
    fails := fails + 1; out := out || 'S5 FAIL 비로그인이 통과; ';
  exception when others then
    if sqlerrm = '로그인이 필요합니다' then out := out || 'S5 PASS; '; else fails := fails + 1; out := out || 'S5 FAIL ' || sqlerrm || '; '; end if;
  end;
  -- S6 제재 중인 손님 → 거부
  total := total + 1;
  begin
    update public.profiles set suspended_until = now() + interval '1 day' where id = u_id;
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    perform public.staff_check_in(vv_id, u_id);
    raise exception using errcode = 'ZZ001', message = 'S6-passed';
  exception
    when sqlstate 'ZZ001' then fails := fails + 1; out := out || 'S6 FAIL 제재 손님이 출석됐다; ';
    when others then
      if sqlerrm = '이 회원은 출석 처리할 수 없습니다' then out := out || 'S6 PASS; '; else fails := fails + 1; out := out || 'S6 FAIL ' || sqlerrm || '; '; end if;
  end;

  -- ── 출석 요청 → 승인(v3, 오너 B) ─────────────────────────────
  -- Q1 요청·참가 신청이 없는 손님 → 대표라도 거부(v2 의 '전 회원 검색 후 출석' 구멍), checkins 0
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    select count(*) into n_ck0 from public.checkins where user_id = u_id and venue_id = vv_id;
    perform public.staff_check_in(vv_id, u_id);
    raise exception using errcode = 'ZZ001', message = 'Q1-passed';
  exception
    when sqlstate 'ZZ001' then fails := fails + 1; out := out || 'Q1 FAIL 요청 없는 손님이 출석됐다; ';
    when others then
      select count(*) into n_ck1 from public.checkins where user_id = u_id and venue_id = vv_id;
      if sqlerrm = REJ and n_ck1 = n_ck0 then out := out || 'Q1 PASS; '; else fails := fails + 1; out := out || 'Q1 FAIL ' || sqlerrm || '; '; end if;
  end;
  -- Q2 다른 매장(ww)에만 요청한 손님 → vv 대표가 처리하면 거부
  total := total + 1;
  begin
    update public.venues set checkin_geo_required = true where id = ww_id; -- ww 좌표 37.6/127.1 있음(위 준비)
    perform set_config('request.jwt.claims', json_build_object('sub', u_id, 'role', 'authenticated')::text, true);
    r := public.request_checkin(ww_id);
    if r ->> 'status' is distinct from 'pending' then raise exception using errcode = 'ZZ002', message = 'ww 요청 실패 ' || r::text; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    perform public.staff_check_in(vv_id, u_id);
    raise exception using errcode = 'ZZ001', message = 'Q2-passed';
  exception
    when sqlstate 'ZZ001' then fails := fails + 1; out := out || 'Q2 FAIL 다른 매장 요청으로 출석됐다; ';
    when others then
      if sqlerrm = REJ then out := out || 'Q2 PASS; '; else fails := fails + 1; out := out || 'Q2 FAIL ' || sqlerrm || '; '; end if;
  end;
  -- Q3 본인 요청 → 대표 승인 성공 → 손님이 다시 요청하면 4시간 중복으로 거부(요청 1행 approved 유지)
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u_id, 'role', 'authenticated')::text, true);
    r := public.request_checkin(vv_id);
    if r is distinct from jsonb_build_object('status', 'pending', 'already', false, 'name', (select name from public.venues where id = vv_id)) then
      raise exception using errcode = 'ZZ002', message = '요청 반환 ' || r::text;
    end if;
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    r := public.staff_check_in(vv_id, u_id);
    if not (r ? 'name') then raise exception using errcode = 'ZZ002', message = '승인 반환 ' || r::text; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', u_id, 'role', 'authenticated')::text, true);
    begin
      perform public.request_checkin(vv_id);
      raise exception using errcode = 'ZZ002', message = '출석 뒤 재요청이 통과';
    exception when sqlstate 'P0001' then
      if sqlerrm <> '이미 체크인했습니다 (4시간 내 중복 방지)' then raise exception using errcode = 'ZZ002', message = sqlerrm; end if;
    end;
    select count(*) into n_a from public.checkin_requests where venue_id = vv_id and user_id = u_id;
    select count(*) into n_b from public.checkin_requests where venue_id = vv_id and user_id = u_id and status = 'approved';
    if n_a <> 1 or n_b <> 1 then raise exception using errcode = 'ZZ002', message = format('요청 행 %s · approved %s', n_a, n_b); end if;
    raise exception using errcode = 'ZZ001', message = 'ok';
  exception
    when sqlstate 'ZZ001' then out := out || 'Q3 PASS; ';
    when others then fails := fails + 1; out := out || 'Q3 FAIL ' || sqlerrm || '; ';
  end;
  -- Q4 중복 요청(같은 날 같은 매장 두 번) → 두 번째는 already · 행 1개
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u_id, 'role', 'authenticated')::text, true);
    perform public.request_checkin(vv_id);
    r := public.request_checkin(vv_id);
    select count(*) into n_a from public.checkin_requests where venue_id = vv_id and user_id = u_id;
    raise exception using errcode = 'ZZ001', message = jsonb_build_object('r', r, 'n', n_a)::text;
  exception
    when sqlstate 'ZZ001' then
      if (sqlerrm::jsonb -> 'r' ->> 'already') = 'true' and (sqlerrm::jsonb -> 'r' ->> 'status') = 'pending' and (sqlerrm::jsonb ->> 'n')::int = 1
        then out := out || 'Q4 PASS; '; else fails := fails + 1; out := out || 'Q4 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'Q4 FAIL ' || sqlerrm || '; ';
  end;
  -- Q5 위치 확인 출석을 안 켠 매장(ww) 요청 → 거부
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u_id, 'role', 'authenticated')::text, true);
    perform public.request_checkin(ww_id);
    fails := fails + 1; out := out || 'Q5 FAIL 안 켠 매장 요청이 통과; ';
  exception when others then
    if sqlerrm = '이 매장은 QR로 바로 출석할 수 있습니다' then out := out || 'Q5 PASS; '; else fails := fails + 1; out := out || 'Q5 FAIL ' || sqlerrm || '; '; end if;
  end;
  -- Q6 비로그인 요청 → 거부(fail-open 아님)
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', '', true);
    perform public.request_checkin(vv_id);
    fails := fails + 1; out := out || 'Q6 FAIL 비로그인 요청이 통과; ';
  exception when others then
    if sqlerrm = '로그인 후 출석 요청을 보낼 수 있습니다' then out := out || 'Q6 PASS; '; else fails := fails + 1; out := out || 'Q6 FAIL ' || sqlerrm || '; '; end if;
  end;
  -- Q7 앱 참가 신청(request_buyin)을 보낸 손님 → 출석 요청 없이도 승인 가능(양성)
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u_id, 'role', 'authenticated')::text, true);
    perform public.request_buyin(vv_id, null, null, null);
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    r := public.staff_check_in(vv_id, u_id);
    raise exception using errcode = 'ZZ001', message = coalesce(r ->> 'name', '');
  exception
    when sqlstate 'ZZ001' then if sqlerrm <> '' then out := out || 'Q7 PASS; '; else fails := fails + 1; out := out || 'Q7 FAIL 이름 없음; '; end if;
    when others then fails := fails + 1; out := out || 'Q7 FAIL ' || sqlerrm || '; ';
  end;
  -- Q8 읽기 RLS — 손님 본인 1 · 대표 1 · 공동 운영자 1 · 관계없는 회원 0 (authenticated 역할로 정책을 태운다)
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u_id, 'role', 'authenticated')::text, true);
    perform public.request_checkin(vv_id);
    execute 'set local role authenticated';
    select count(*) into n_a from public.checkin_requests where venue_id = vv_id;
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    select count(*) into n_b from public.checkin_requests where venue_id = vv_id;
    perform set_config('request.jwt.claims', json_build_object('sub', c_id, 'role', 'authenticated')::text, true);
    select count(*) into n_c from public.checkin_requests where venue_id = vv_id;
    perform set_config('request.jwt.claims', json_build_object('sub', x_id, 'role', 'authenticated')::text, true);
    select count(*) into n_rows from public.checkin_requests where venue_id = vv_id;
    raise exception using errcode = 'ZZ001', message = format('%s/%s/%s/%s', n_a, n_b, n_c, n_rows);
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = '1/1/1/0' then out := out || 'Q8 PASS; '; else fails := fails + 1; out := out || 'Q8 FAIL u/o/c/x=' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'Q8 FAIL ' || sqlerrm || '; ';
  end;
  -- Q9 표 직접 INSERT(authenticated) → 권한 없음(쓰기는 RPC 만)
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.checkin_requests (venue_id, user_id, request_date) values (vv_id, u_id, current_date);
    raise exception using errcode = 'ZZ001', message = 'Q9-passed';
  exception
    when sqlstate 'ZZ001' then fails := fails + 1; out := out || 'Q9 FAIL 직접 INSERT 가 통과; ';
    when insufficient_privilege then out := out || 'Q9 PASS; ';
    when others then fails := fails + 1; out := out || 'Q9 FAIL ' || sqlerrm || '; ';
  end;
  -- Q10 하루 5곳 상한 — 다른 매장 5곳에 오늘 요청이 있으면 6번째(vv) 거부
  total := total + 1;
  begin
    insert into public.checkin_requests (venue_id, user_id, request_date)
    select v.id, u_id, (now() at time zone 'Asia/Seoul')::date from public.venues v where v.id <> vv_id order by v.id limit 5;
    get diagnostics n_rows = row_count;
    if n_rows <> 5 then raise exception using errcode = 'ZZ002', message = '전제: 다른 매장 5곳이 없다 ' || n_rows; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', u_id, 'role', 'authenticated')::text, true);
    perform public.request_checkin(vv_id);
    raise exception using errcode = 'ZZ001', message = 'Q10-passed';
  exception
    when sqlstate 'ZZ001' then fails := fails + 1; out := out || 'Q10 FAIL 6번째 요청이 통과; ';
    when others then
      if sqlerrm = '출석 요청은 하루 5곳까지 보낼 수 있습니다' then out := out || 'Q10 PASS; '; else fails := fails + 1; out := out || 'Q10 FAIL ' || sqlerrm || '; '; end if;
  end;

  -- X1(critical 반례 2026-10-05) 승인된 출석 요청은 재사용되지 않는다 — 4시간 지난 뒤 같은 요청으로 다시 승인하면 거부
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u_id, 'role', 'authenticated')::text, true);
    perform public.request_checkin(vv_id);
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    perform public.staff_check_in(vv_id, u_id);
    update public.checkins set created_at = created_at - interval '5 hours' where user_id = u_id and venue_id = vv_id and created_at >= now();
    perform public.staff_check_in(vv_id, u_id);
    raise exception using errcode = 'ZZ001', message = 'X1-passed';
  exception
    when sqlstate 'ZZ001' then fails := fails + 1; out := out || 'X1 FAIL 승인된 요청이 재사용됨; ';
    when others then if sqlerrm = REJ then out := out || 'X1 PASS; '; else fails := fails + 1; out := out || 'X1 FAIL ' || sqlerrm || '; '; end if;
  end;

  -- ── 20261005a 전용(v5 일 때만 센다) ───────────────────────────
  if not v5 then
    out := out || 'G1·B1·D1 SKIP(20261005a 미적용); ';
  else
    -- G1 P2: 정확도 낮음(1.5km) → code geo_low_accuracy · 확인자료 1행(좌표를 썼다) · 출석 0
    total := total + 1;
    begin
      execute $f$create or replace function public._checkin_geo_required_from() returns timestamptz language sql stable set search_path = public, pg_temp as $b$ select now() - interval '1 day' $b$$f$;
      insert into public.location_consents (user_id, granted, terms_version, granted_at) values (u_id, true, 3, now());
      perform set_config('request.jwt.claims', json_build_object('sub', u_id, 'role', 'authenticated')::text, true);
      select count(*) into n_a from public.location_access_log where user_id = u_id;
      select count(*) into n_ck0 from public.checkins where user_id = u_id and venue_id = vv_id;
      r := public.check_in(vv_id, 37.5005, 127.0, 1500);
      select count(*) into n_b from public.location_access_log where user_id = u_id;
      select count(*) into n_ck1 from public.checkins where user_id = u_id and venue_id = vv_id;
      raise exception using errcode = 'ZZ001', message = jsonb_build_object('r', r, 'lg', n_b - n_a, 'ck', n_ck1 - n_ck0)::text;
    exception
      when sqlstate 'ZZ001' then
        if (sqlerrm::jsonb -> 'r' ->> 'code') = 'geo_low_accuracy' and (sqlerrm::jsonb -> 'r' ->> 'error') = '위치 정확도가 낮아요. 매장 안에서 다시 시도해 주세요'
           and (sqlerrm::jsonb ->> 'lg')::int = 1 and (sqlerrm::jsonb ->> 'ck')::int = 0
          then out := out || 'G1 PASS; '; else fails := fails + 1; out := out || 'G1 FAIL ' || sqlerrm || '; '; end if;
      when others then fails := fails + 1; out := out || 'G1 FAIL ' || sqlerrm || '; ';
    end;
    -- B1 P3-c: 어제 영업일 장부가 열려 있으면(자정 넘긴 토너) 요청 날짜 = 어제 영업일 → 승인 성공 · 같은 날 재요청은 already
    total := total + 1;
    begin
      insert into public.ledger_sessions (venue_id, session_date, game_seq, closed)
      values (vv_id, (now() at time zone 'Asia/Seoul')::date - 1, 99, false);
      v_biz := public.ledger_business_date(vv_id);
      if v_biz is distinct from (now() at time zone 'Asia/Seoul')::date - 1 then
        raise exception using errcode = 'ZZ002', message = '전제: 영업일이 어제가 아니다(오늘 열린 장부가 있다) ' || v_biz;
      end if;
      perform set_config('request.jwt.claims', json_build_object('sub', u_id, 'role', 'authenticated')::text, true);
      perform public.request_checkin(vv_id);
      r := public.request_checkin(vv_id);
      if (r ->> 'already') is distinct from 'true' then raise exception using errcode = 'ZZ002', message = '재요청이 already 가 아니다 ' || r::text; end if;
      if not exists (select 1 from public.checkin_requests where venue_id = vv_id and user_id = u_id and request_date = v_biz and status = 'pending') then
        raise exception using errcode = 'ZZ002', message = '요청 날짜가 영업일이 아니다';
      end if;
      perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
      r := public.staff_check_in(vv_id, u_id);
      if not exists (select 1 from public.checkin_requests where venue_id = vv_id and user_id = u_id and request_date = v_biz and status = 'approved') then
        raise exception using errcode = 'ZZ002', message = '영업일 요청이 approved 로 바뀌지 않았다';
      end if;
      raise exception using errcode = 'ZZ001', message = 'ok';
    exception
      when sqlstate 'ZZ001' then out := out || 'B1 PASS; ';
      when others then fails := fails + 1; out := out || 'B1 FAIL ' || sqlerrm || '; ';
    end;
    -- D1 P3-d: 대표(o)·공동 운영자(c)는 자기 매장에 출석 요청 불가(운영자끼리 승인해 위치 확인을 건너뛰는 길)
    total := total + 1;
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
      begin
        perform public.request_checkin(vv_id);
        raise exception using errcode = 'ZZ002', message = '대표 요청이 통과';
      exception when sqlstate 'P0001' then
        if sqlerrm <> '매장 운영자는 출석 요청 대신 매장 출석 QR로 출석해 주세요' then raise exception using errcode = 'ZZ002', message = 'o: ' || sqlerrm; end if;
      end;
      perform set_config('request.jwt.claims', json_build_object('sub', c_id, 'role', 'authenticated')::text, true);
      perform public.request_checkin(vv_id);
      raise exception using errcode = 'ZZ001', message = 'D1-passed';
    exception
      when sqlstate 'ZZ001' then fails := fails + 1; out := out || 'D1 FAIL 공동 운영자 요청이 통과; ';
      when others then
        if sqlerrm = '매장 운영자는 출석 요청 대신 매장 출석 QR로 출석해 주세요' then out := out || 'D1 PASS; '; else fails := fails + 1; out := out || 'D1 FAIL ' || sqlerrm || '; '; end if;
    end;
  end if;

  -- R5 ACL — anon 은 네 함수 모두 실행 불가, authenticated 는 check_in·스위치·직원 처리 실행 가능, 내부 함수는 불가
  total := total + 1;
  if has_function_privilege('anon', 'public.set_venue_checkin_geo_required(uuid,boolean)', 'execute')
     or has_function_privilege('anon', 'public.check_in(uuid,double precision,double precision,double precision)', 'execute')
     or has_function_privilege('anon', 'public.staff_check_in(uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._checkin_geo_required_from()', 'execute')
     or not has_function_privilege('authenticated', 'public.set_venue_checkin_geo_required(uuid,boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.staff_check_in(uuid,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.check_in(uuid,double precision,double precision,double precision)', 'execute')
     or has_function_privilege('anon', 'public.request_checkin(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.request_checkin(uuid)', 'execute')
     or has_table_privilege('anon', 'public.checkin_requests', 'select')
     or has_table_privilege('authenticated', 'public.checkin_requests', 'insert') then
    fails := fails + 1; out := out || 'R5 FAIL ACL; ';
  else out := out || 'R5 PASS; '; end if;
  -- R6 기본값: 이 리허설이 건드린 vv_id·ww_id 를 빼면 켠 매장은 0곳(기존 매장 전부 false = 지금 동작)
  total := total + 1;
  if exists (select 1 from public.venues where checkin_geo_required and id not in (vv_id, ww_id)) then
    fails := fails + 1; out := out || 'R6 FAIL 기존 매장이 켜져 있음; ';
  else out := out || 'R6 PASS; '; end if;

  raise exception using errcode = 'ZZ999',
    message = format('REHEARSAL %s %s/%s | %s', case when fails = 0 then 'PASS' else 'FAIL' end, total - fails, total, out);
end $rehearsal$;
