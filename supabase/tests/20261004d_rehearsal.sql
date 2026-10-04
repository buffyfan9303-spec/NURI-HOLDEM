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
-- u_id 의 vv_id·ww_id 최근 4시간 출석과 위치 동의 행, c_id 의 공동 운영자 행은 바깥 트랜잭션 안에서만 만든다/지운다(롤백).

create table public._probe_20261004d (x int);

do $rehearsal$
declare
  u_id uuid; o_id uuid; vv_id uuid; ww_id uuid; c_id uuid;
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
  if u_id is null or vv_id is null or ww_id is null or o_id is null or c_id is null then
    raise exception using errcode = 'ZZ999', message = format('REHEARSAL FAIL 대상 없음 u_id=%s vv_id=%s ww_id=%s o_id=%s c_id=%s', u_id, vv_id, ww_id, o_id, c_id);
  end if;
  out := format('u=%s vv=%s ww=%s o=%s c=%s | ', left(u_id::text, 8), left(vv_id::text, 8), left(ww_id::text, 8), left(o_id::text, 8), left(c_id::text, 8));
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
              when f[7] like 'code:%' then r->'r'->>'code' = substr(f[7], 6) and coalesce(r->'r'->>'error', '') like '%매장 직원에게 출석 처리를 요청%'
              when f[7] like 'err:%' then r->'r'->>'error' = substr(f[7], 5) and not ((r->'r') ? 'code')
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
  -- S1 대표(o_id) → u_id 출석 처리: 이름 · checkins +1 · audit +1 · 위치 확인자료 0 · 같은 손님 다시 → 4시간 중복
  total := total + 1;
  begin
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
  -- S2 공동 운영자(c_id) 양성 — can_manage_pos 선(매장이용권 발급과 같은 선)
  total := total + 1;
  begin
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

  -- R5 ACL — anon 은 네 함수 모두 실행 불가, authenticated 는 check_in·스위치·직원 처리 실행 가능, 내부 함수는 불가
  total := total + 1;
  if has_function_privilege('anon', 'public.set_venue_checkin_geo_required(uuid,boolean)', 'execute')
     or has_function_privilege('anon', 'public.check_in(uuid,double precision,double precision,double precision)', 'execute')
     or has_function_privilege('anon', 'public.staff_check_in(uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._checkin_geo_required_from()', 'execute')
     or not has_function_privilege('authenticated', 'public.set_venue_checkin_geo_required(uuid,boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.staff_check_in(uuid,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.check_in(uuid,double precision,double precision,double precision)', 'execute') then
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
