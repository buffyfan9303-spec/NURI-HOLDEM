-- 20261005c 라이브 롤백 리허설 (store-team 2026-10-05)
--
-- 실행: 한 번에  <supabase/migrations/20261005c_schedule_venue_move_guard.sql 전문>  <이 파일 전문>  을 보낸다(암묵 트랜잭션 하나).
--   마지막 DO 는 언제나 ZZ999 로 끝나 전체가 되돌려진다. 시나리오마다 ZZ001 로 스스로 되돌린다.
--   롤백 확인: 리허설 뒤 select to_regclass('public._probe_20261005c') 가 null.
--   음성 대조: 마이그레이션 없이 보내면 NB1·NB1b·NB2·R1 이 FAIL 해야 한다(지금 라이브의 구멍).
--
-- 대상(역할·소유·소속 조회): vv/o = 순수 업주의 승인 매장과 대표 · ww = o 와 무관한 다른 승인 매장(kind venue)
--   x = vv 와 관계 없는 일반 회원(예약자 역할) · a = 관리자
--   포스터는 기존 포스터 한 행을 복제해 만든다(정의자=postgres, 롤백).

create table public._probe_20261005c (x int);

do $rehearsal$
declare
  o_id uuid; vv_id uuid; ww_id uuid; x_id uuid; a_id uuid; s_id uuid; src_id uuid;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  MSG constant text := '예약이 있거나 운영하지 않는 매장의 포스터는 다른 매장으로 옮길 수 없습니다';
  n int; out text := ''; fails int := 0; total int := 0;
begin
  select v.id, v.owner_id into vv_id, o_id from public.venues v join public.profiles p on p.id = v.owner_id
   where v.approved and v.kind = 'venue' and p.role::text = 'venue_owner' and p.approved is true and p.status::text = 'active'
     and (p.suspended_until is null or p.suspended_until < now())
   order by v.id limit 1;
  select v.id into ww_id from public.venues v where v.approved and v.kind = 'venue' and v.id <> vv_id and v.owner_id <> o_id
     and not exists (select 1 from public.venue_owners vo where vo.venue_id = v.id and vo.user_id = o_id)
   order by v.id limit 1;
  select p.id into x_id from public.profiles p
   where p.role::text = 'user' and p.status::text = 'active'
     and not exists (select 1 from public.venues v where v.owner_id = p.id)
     and not exists (select 1 from public.venue_owners vo where vo.user_id = p.id)
     and not exists (select 1 from public._venue_customer_ids(array[vv_id]) t where t.uid = p.id)
     and not exists (select 1 from public.schedule_reservations r where r.user_id = p.id and r.created_at > now() - interval '1 day')
   order by p.id limit 1;
  select p.id into a_id from public.profiles p where p.role::text = 'admin' and p.status::text = 'active' order by p.id limit 1;
  select s.id into src_id from public.schedules s join public.venues v on v.id = s.venue_id and v.kind = 'venue'
   order by s.created_at desc limit 1;
  if o_id is null or vv_id is null or ww_id is null or x_id is null or a_id is null or src_id is null then
    raise exception using errcode = 'ZZ999', message = format('REHEARSAL FAIL 대상 없음 o=%s vv=%s ww=%s x=%s a=%s src=%s', o_id, vv_id, ww_id, x_id, a_id, src_id);
  end if;
  out := format('o=%s vv=%s ww=%s x=%s a=%s | ', left(o_id::text,8), left(vv_id::text,8), left(ww_id::text,8), left(x_id::text,8), left(a_id::text,8));

  -- NB1 o 가 운영하지 않는 ww 의 자기 작성 포스터(예약자 x)를 vv 로 옮기기 → 거부 · x 는 vv 내 고객이 아니다
  total := total + 1;
  begin
    insert into public.schedules select (jsonb_populate_record(null::public.schedules, to_jsonb(s) || jsonb_build_object(
      'id', gen_random_uuid(), 'date', v_today + 1, 'venue_id', ww_id, 'owner_id', o_id, 'approved', true))).*
      from public.schedules s where s.id = src_id returning id into s_id;
    insert into public.schedule_reservations (schedule_id, user_id, display_name) values (s_id, x_id, 'ZZ손님x');
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.schedules set venue_id = vv_id where id = s_id;
    get diagnostics n = row_count;
    execute 'reset role';
    raise exception using errcode = 'ZZ001', message = 'rows=' || n || ' x_in_vv=' ||
      exists (select 1 from public._venue_customer_ids(array[vv_id]) t where t.uid = x_id)::text;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'rows=0 x_in_vv=false' then out := out || 'NB1 PASS(0행); ';
      else fails := fails + 1; out := out || 'NB1 FAIL ' || sqlerrm || '; '; end if;
    when sqlstate '42501' then
      if sqlerrm = MSG then out := out || 'NB1 PASS; '; else fails := fails + 1; out := out || 'NB1 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'NB1 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;
  -- NB1b 같은 상황, 예약이 없어도 운영하지 않는 매장의 포스터는 옮길 수 없다
  total := total + 1;
  begin
    insert into public.schedules select (jsonb_populate_record(null::public.schedules, to_jsonb(s) || jsonb_build_object(
      'id', gen_random_uuid(), 'date', v_today + 1, 'venue_id', ww_id, 'owner_id', o_id, 'approved', true))).*
      from public.schedules s where s.id = src_id returning id into s_id;
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.schedules set venue_id = vv_id where id = s_id;
    get diagnostics n = row_count;
    raise exception using errcode = 'ZZ001', message = 'rows=' || n;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'rows=0' then out := out || 'NB1b PASS(0행); ';
      else fails := fails + 1; out := out || 'NB1b FAIL ' || sqlerrm || '; '; end if;
    when sqlstate '42501' then
      if sqlerrm = MSG then out := out || 'NB1b PASS; '; else fails := fails + 1; out := out || 'NB1b FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'NB1b FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;
  -- NB2 o 가 ww 공동 운영자(두 매장 운영)여도 예약이 달린 포스터는 vv 로 못 옮긴다
  total := total + 1;
  begin
    insert into public.venue_owners (venue_id, user_id, status) values (ww_id, o_id, 'approved');
    insert into public.schedules select (jsonb_populate_record(null::public.schedules, to_jsonb(s) || jsonb_build_object(
      'id', gen_random_uuid(), 'date', v_today + 1, 'venue_id', ww_id, 'owner_id', o_id, 'approved', true))).*
      from public.schedules s where s.id = src_id returning id into s_id;
    insert into public.schedule_reservations (schedule_id, user_id, display_name) values (s_id, x_id, 'ZZ손님x');
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.schedules set venue_id = vv_id where id = s_id;
    get diagnostics n = row_count;
    raise exception using errcode = 'ZZ001', message = 'rows=' || n;
  exception
    when sqlstate 'ZZ001' then fails := fails + 1; out := out || 'NB2 FAIL 예약 달린 포스터 이동 ' || sqlerrm || '; ';
    when sqlstate '42501' then
      if sqlerrm = MSG then out := out || 'NB2 PASS; '; else fails := fails + 1; out := out || 'NB2 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'NB2 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- PB1 두 매장 운영자가 예약 없는 포스터를 자기 매장끼리 옮기기 → 된다
  total := total + 1;
  begin
    insert into public.venue_owners (venue_id, user_id, status) values (ww_id, o_id, 'approved');
    insert into public.schedules select (jsonb_populate_record(null::public.schedules, to_jsonb(s) || jsonb_build_object(
      'id', gen_random_uuid(), 'date', v_today + 1, 'venue_id', ww_id, 'owner_id', o_id, 'approved', true))).*
      from public.schedules s where s.id = src_id returning id into s_id;
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.schedules set venue_id = vv_id where id = s_id;
    get diagnostics n = row_count;
    raise exception using errcode = 'ZZ001', message = 'rows=' || n;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'rows=1' then out := out || 'PB1 PASS; '; else fails := fails + 1; out := out || 'PB1 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'PB1 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;
  -- PB2 업주가 예약 달린 자기 매장 포스터의 설명·날짜를 수정(매장 그대로 = 포스터 수정 화면 경로) → 된다
  total := total + 1;
  begin
    insert into public.schedules select (jsonb_populate_record(null::public.schedules, to_jsonb(s) || jsonb_build_object(
      'id', gen_random_uuid(), 'date', v_today + 1, 'venue_id', vv_id, 'owner_id', o_id, 'approved', true))).*
      from public.schedules s where s.id = src_id returning id into s_id;
    insert into public.schedule_reservations (schedule_id, user_id, display_name) values (s_id, x_id, 'ZZ손님x');
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.schedules set description = 'ZZ리허설 수정', date = v_today + 2, updated_at = now() where id = s_id;
    get diagnostics n = row_count;
    raise exception using errcode = 'ZZ001', message = 'rows=' || n;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'rows=1' then out := out || 'PB2 PASS; '; else fails := fails + 1; out := out || 'PB2 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'PB2 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;
  -- PB3 관리자는 예약 달린 포스터도 매장을 바꿀 수 있다
  total := total + 1;
  begin
    insert into public.schedules select (jsonb_populate_record(null::public.schedules, to_jsonb(s) || jsonb_build_object(
      'id', gen_random_uuid(), 'date', v_today + 1, 'venue_id', ww_id, 'owner_id', o_id, 'approved', true))).*
      from public.schedules s where s.id = src_id returning id into s_id;
    insert into public.schedule_reservations (schedule_id, user_id, display_name) values (s_id, x_id, 'ZZ손님x');
    perform set_config('request.jwt.claims', json_build_object('sub', a_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.schedules set venue_id = vv_id where id = s_id;
    get diagnostics n = row_count;
    raise exception using errcode = 'ZZ001', message = 'rows=' || n;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'rows=1' then out := out || 'PB3 PASS; '; else fails := fails + 1; out := out || 'PB3 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'PB3 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;
  -- PB4 매장 없는 자기 포스터(venue_id null)에 자기 매장 지정 → 된다
  total := total + 1;
  begin
    insert into public.schedules select (jsonb_populate_record(null::public.schedules, to_jsonb(s) || jsonb_build_object(
      'id', gen_random_uuid(), 'date', v_today + 1, 'venue_id', null, 'owner_id', o_id, 'approved', false))).*
      from public.schedules s where s.id = src_id returning id into s_id;
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.schedules set venue_id = vv_id where id = s_id;
    get diagnostics n = row_count;
    raise exception using errcode = 'ZZ001', message = 'rows=' || n;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'rows=1' then out := out || 'PB4 PASS; '; else fails := fails + 1; out := out || 'PB4 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'PB4 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- R1 권한·트리거 표
  perform set_config('request.jwt.claims', '', true);
  total := total + 1;
  -- 함수가 없으면(적용 전) has_function_privilege 가 예외라 CASE 로 먼저 거른다
  if not exists (select 1 from pg_trigger where tgrelid = 'public.schedules'::regclass and tgname = 'trg_guard_schedule_venue_move')
     or (case when to_regprocedure('public._schedule_has_reservations(uuid)') is null
               or to_regprocedure('public._guard_schedule_venue_move()') is null then true
             else has_function_privilege('anon', 'public._schedule_has_reservations(uuid)', 'EXECUTE')
               or has_function_privilege('authenticated', 'public._guard_schedule_venue_move()', 'EXECUTE') end) then
    fails := fails + 1; out := out || 'R1 FAIL; ';
  else out := out || 'R1 PASS; '; end if;

  raise exception using errcode = 'ZZ999',
    message = format('REHEARSAL %s %s/%s | %s', case when fails = 0 then 'PASS' else 'FAIL' end, total - fails, total, out);
end $rehearsal$;
