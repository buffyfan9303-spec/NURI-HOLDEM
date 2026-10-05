-- 20261005b 라이브 롤백 리허설 (store-team 2026-10-05)
--
-- 실행: 한 번에  <supabase/migrations/20261005b_customer_profiles_insert_guard.sql 전문>  <이 파일 전문>  을 보낸다(암묵 트랜잭션 하나).
--   · 마지막 DO 블록은 **언제나 ZZ999 예외로 끝난다** → 마이그레이션 포함 전체가 되돌려진다. 메시지 첫머리 'REHEARSAL PASS|FAIL' 을 본다.
--   · 시나리오마다 안쪽 블록을 ZZ001 로 스스로 되돌린다(앞 시나리오의 행이 뒤 시나리오를 가리지 않게).
--   · 롤백 확인: 리허설 뒤 select to_regclass('public._probe_20261005b') 가 null 이어야 한다.
--   · 음성 대조: 마이그레이션 없이 이 파일만 보내면 N1·N1b·N2·N4·N5·F1·C1·C2·N6·R1 이 FAIL 해야 한다(지금 라이브의 구멍).
--
-- 계정·매장은 이름으로 박지 않고 역할·소유·소속을 조회해서 고른다(nuri-migration §5):
--   vv/o = 승인 매장(kind venue) 중 대표가 **순수 업주**(role venue_owner·승인·관리자 아님)인 곳과 그 대표
--   ww   = o 가 관리하지 못하는 다른 승인 매장
--   u    = 일반 회원(매장 소유·공동 운영 없음) — 출석 요청 → 업주 승인으로 고객 행이 자동 생성되는 손님
--   c    = u 와 다른 일반 회원을 트랜잭션 안에서 vv 의 승인 공동 운영자로 만든 사람
--   x    = u·c 와 다른 일반 회원, vv 와 관계 없음(출석·예약·고객 행·출석 요청·참가 신청 0) — 공격 대상

create table public._probe_20261005b (x int);

do $rehearsal$
declare
  u_id uuid; o_id uuid; vv_id uuid; ww_id uuid; c_id uuid; x_id uuid;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  n int; out text := ''; fails int := 0; total int := 0;
  -- 한 시나리오를 업주 역할로 돌리고 결과를 문자열로 받는다(성공 = 'ok:<행수>', 실패 = 'err:<sqlstate>:<메시지>')
begin
  select v.id, v.owner_id into vv_id, o_id from public.venues v join public.profiles p on p.id = v.owner_id
   where v.approved and v.kind = 'venue' and p.role::text = 'venue_owner' and p.approved is true and p.status::text = 'active'
     and (p.suspended_until is null or p.suspended_until < now())
   order by v.id limit 1;
  -- kind='venue' — 공동 운영자 판정(_venue_coowner_ok)은 매장만 인정한다. 그룹(dealer_team)을 고르면 F1 이 0행으로 공허해진다(2026-10-05 실측)
  select v.id into ww_id from public.venues v where v.approved and v.kind = 'venue' and v.id <> vv_id and v.owner_id <> o_id
     and not exists (select 1 from public.venue_owners vo where vo.venue_id = v.id and vo.user_id = o_id)
   order by v.id limit 1;
  select p.id into u_id from public.profiles p
   where p.role::text = 'user' and p.status::text = 'active' and (p.suspended_until is null or p.suspended_until < now())
     and not exists (select 1 from public.venues v where v.owner_id = p.id)
     and not exists (select 1 from public.venue_owners vo where vo.user_id = p.id)
   order by p.id limit 1;
  select p.id into c_id from public.profiles p
   where p.role::text = 'user' and p.status::text = 'active' and p.id <> u_id
     and not exists (select 1 from public.venues v where v.owner_id = p.id)
   order by p.id limit 1;
  select p.id into x_id from public.profiles p
   where p.role::text = 'user' and p.status::text = 'active' and p.id not in (u_id, c_id)
     and not exists (select 1 from public.venues v where v.owner_id = p.id)
     and not exists (select 1 from public.venue_owners vo where vo.user_id = p.id)
     and not exists (select 1 from public._venue_customer_ids(array[vv_id]) t where t.uid = p.id)
     and not exists (select 1 from public.checkin_requests r where r.venue_id = vv_id and r.user_id = p.id)
     and not exists (select 1 from public.ledger_buyin_requests b where b.venue_id = vv_id and b.user_id = p.id)
   order by p.id limit 1;
  if u_id is null or vv_id is null or ww_id is null or o_id is null or c_id is null or x_id is null then
    raise exception using errcode = 'ZZ999', message = format('REHEARSAL FAIL 대상 없음 u=%s vv=%s ww=%s o=%s c=%s x=%s', u_id, vv_id, ww_id, o_id, c_id, x_id);
  end if;
  if exists (select 1 from public.profiles where id = o_id and role::text = 'admin') then
    raise exception using errcode = 'ZZ999', message = 'REHEARSAL FAIL 전제: o 가 관리자다(업주 양성이 아니다)';
  end if;
  out := format('o=%s vv=%s ww=%s u=%s c=%s x=%s | ', left(o_id::text,8), left(vv_id::text,8), left(ww_id::text,8), left(u_id::text,8), left(c_id::text,8), left(x_id::text,8));
  -- c 를 vv 의 승인 공동 운영자로(트랜잭션 안에서만)
  update public.profiles set approved = true where id = c_id;
  delete from public.venue_owners where venue_id = vv_id and user_id = c_id;
  insert into public.venue_owners (venue_id, user_id, status) values (vv_id, c_id, 'approved');
  -- u 의 최근 출석 흔적을 치워 4시간 중복 가드에 안 걸리게(롤백)
  delete from public.checkins where venue_id = vv_id and user_id = u_id;
  delete from public.customer_profiles where venue_id = vv_id and (user_id in (u_id, x_id) or name like 'ZZ리허설%');

  -- ── 음성 ─────────────────────────────────────────────────────
  -- N1 업주가 관계 없는 회원 user_id 로 직접 INSERT → 거부(42501)
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.customer_profiles (venue_id, name, user_id) values (vv_id, 'ZZ리허설N1', x_id);
    raise exception using errcode = 'ZZ001', message = 'inserted';
  exception
    when sqlstate 'ZZ001' then fails := fails + 1; out := out || 'N1 FAIL 관계 없는 user_id INSERT 성공; ';
    when sqlstate '42501' then out := out || 'N1 PASS; ';
    when others then fails := fails + 1; out := out || 'N1 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;
  -- N1b PostgREST upsert 모양에 user_id 를 실어도 거부
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.customer_profiles (venue_id, name, user_id, memo, updated_at) values (vv_id, 'ZZ리허설N1b', x_id, 'm', now())
      on conflict (venue_id, name) do update set venue_id = excluded.venue_id, name = excluded.name, user_id = excluded.user_id,
         memo = excluded.memo, updated_at = excluded.updated_at;
    raise exception using errcode = 'ZZ001', message = 'inserted';
  exception
    when sqlstate 'ZZ001' then fails := fails + 1; out := out || 'N1b FAIL upsert user_id 성공; ';
    when sqlstate '42501' then out := out || 'N1b PASS; ';
    when others then fails := fails + 1; out := out || 'N1b FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;
  -- N2 공동 운영자도 같은 INSERT → 거부
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', c_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.customer_profiles (venue_id, name, user_id) values (vv_id, 'ZZ리허설N2', x_id);
    raise exception using errcode = 'ZZ001', message = 'inserted';
  exception
    when sqlstate 'ZZ001' then fails := fails + 1; out := out || 'N2 FAIL 공동 운영자 user_id INSERT 성공; ';
    when sqlstate '42501' then out := out || 'N2 PASS; ';
    when others then fails := fails + 1; out := out || 'N2 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;
  -- N3 다른 매장(ww)에 이름만 있는 행 INSERT → RLS 거부
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.customer_profiles (venue_id, name, memo) values (ww_id, 'ZZ리허설N3', 'm');
    raise exception using errcode = 'ZZ001', message = 'inserted';
  exception
    when sqlstate 'ZZ001' then fails := fails + 1; out := out || 'N3 FAIL 다른 매장 INSERT 성공; ';
    when sqlstate '42501' then out := out || 'N3 PASS; ';
    when others then fails := fails + 1; out := out || 'N3 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;
  -- N3b 비로그인(anon 역할 · 빈 claims) INSERT → 거부
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', '', true);
    execute 'set local role anon';
    insert into public.customer_profiles (venue_id, name) values (vv_id, 'ZZ리허설N3b');
    raise exception using errcode = 'ZZ001', message = 'inserted';
  exception
    when sqlstate 'ZZ001' then fails := fails + 1; out := out || 'N3b FAIL 비로그인 INSERT 성공; ';
    when sqlstate '42501' then out := out || 'N3b PASS; ';
    when others then fails := fails + 1; out := out || 'N3b FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;
  -- N3c authenticated 역할인데 claims 비어 auth.uid() null → 거부(fail-open 확인)
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', '', true);
    execute 'set local role authenticated';
    insert into public.customer_profiles (venue_id, name) values (vv_id, 'ZZ리허설N3c');
    raise exception using errcode = 'ZZ001', message = 'inserted';
  exception
    when sqlstate 'ZZ001' then fails := fails + 1; out := out || 'N3c FAIL uid null INSERT 성공; ';
    when sqlstate '42501' then out := out || 'N3c PASS; ';
    when others then fails := fails + 1; out := out || 'N3c FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;
  -- N4 이름만 있는 기존 행의 user_id 를 관계 없는 회원으로 UPDATE → 거부
  total := total + 1;
  begin
    insert into public.customer_profiles (venue_id, name) values (vv_id, 'ZZ리허설N4');  -- 준비(정의자=postgres)
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.customer_profiles set user_id = x_id where venue_id = vv_id and name = 'ZZ리허설N4';
    get diagnostics n = row_count;
    raise exception using errcode = 'ZZ001', message = 'rows=' || n;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'rows=0' then out := out || 'N4 PASS(0행); ';
      else fails := fails + 1; out := out || 'N4 FAIL user_id UPDATE ' || sqlerrm || '; '; end if;
    when sqlstate '42501' then out := out || 'N4 PASS; ';
    when others then fails := fails + 1; out := out || 'N4 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;
  -- N5 link_customer_alias 로 관계 없는 회원 연결 → 거부(P0001 사용자 문장) · 고객 행·별칭 행 0
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    perform public.link_customer_alias(vv_id, 'ZZ리허설N5', x_id);
    raise exception using errcode = 'ZZ001', message = 'linked';
  exception
    when sqlstate 'ZZ001' then fails := fails + 1; out := out || 'N5 FAIL 관계 없는 회원 연결 성공; ';
    when others then
      if sqlstate = 'P0001' and sqlerrm = '이 매장에 출석·예약·참가 신청 기록이 있는 회원만 연결할 수 있습니다' then out := out || 'N5 PASS; ';
      else fails := fails + 1; out := out || 'N5 FAIL ' || sqlstate || ' ' || sqlerrm || '; '; end if;
  end;
  -- F1 (critical 반증 F) 두 매장 운영자(o 가 ww 공동 운영자)가 ww 의 실제 고객 행(user_id=x)을 venue_id=vv 로 옮기기 → 거부
  total := total + 1;
  begin
    insert into public.venue_owners (venue_id, user_id, status) values (ww_id, o_id, 'approved');      -- 준비(롤백)
    insert into public.customer_profiles (venue_id, name, user_id, visit_count) values (ww_id, 'ZZ리허설F1', x_id, 3);
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.customer_profiles set venue_id = vv_id where venue_id = ww_id and name = 'ZZ리허설F1';
    get diagnostics n = row_count;
    raise exception using errcode = 'ZZ001', message = 'rows=' || n;
  exception
    when sqlstate 'ZZ001' then fails := fails + 1; out := out || 'F1 FAIL 고객 행 매장 이동 ' || sqlerrm || '; ';
    when sqlstate '42501' then
      if sqlerrm = '고객 정보의 매장·회원 연결은 바꿀 수 없습니다' then out := out || 'F1 PASS; ';
      else fails := fails + 1; out := out || 'F1 FAIL 다른 42501 ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'F1 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;
  -- C1 (critical 반증 C) customer_aliases 직접 INSERT(관계 확인 우회) → 거부
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.customer_aliases (venue_id, alias, user_id) values (vv_id, 'ZZ리허설C1', x_id);
    raise exception using errcode = 'ZZ001', message = 'inserted';
  exception
    when sqlstate 'ZZ001' then fails := fails + 1; out := out || 'C1 FAIL 별칭 직접 INSERT 성공; ';
    when sqlstate '42501' then out := out || 'C1 PASS; ';
    when others then fails := fails + 1; out := out || 'C1 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;
  -- C2 기존 별칭 행의 user_id 를 관계 없는 회원으로 UPDATE → 거부
  total := total + 1;
  begin
    insert into public.customer_aliases (venue_id, alias, user_id) values (vv_id, 'ZZ리허설C2', u_id);  -- 준비(정의자=postgres)
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.customer_aliases set user_id = x_id where venue_id = vv_id and alias = 'ZZ리허설C2';
    get diagnostics n = row_count;
    raise exception using errcode = 'ZZ001', message = 'rows=' || n;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'rows=0' then out := out || 'C2 PASS(0행); ';
      else fails := fails + 1; out := out || 'C2 FAIL 별칭 UPDATE ' || sqlerrm || '; '; end if;
    when sqlstate '42501' then out := out || 'C2 PASS; ';
    when others then fails := fails + 1; out := out || 'C2 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;
  -- N6 결과로 재기: 한 블록 안에서 업주가 위 공격을 **모두** 시도한 뒤(각각 실패해도 다음으로) 그 자리에서 x 가 vv 의 '내 고객'
  --    (_venue_customer_ids — 전화번호 마스킹 해제 기준)인지 잰다. 블록 끝에 ZZ001 로 되돌린다.
  --    (예전 N6 은 각 공격이 이미 되돌려진 뒤에 재서 구멍이 열려 있어도 PASS — 공허했다. 적용 전이면 이제 FAIL 이어야 한다.)
  total := total + 1;
  begin
    insert into public.venue_owners (venue_id, user_id, status) values (ww_id, o_id, 'approved');
    insert into public.customer_profiles (venue_id, name, user_id, visit_count) values (ww_id, 'ZZ리허설N6f', x_id, 1);
    insert into public.customer_profiles (venue_id, name) values (vv_id, 'ZZ리허설N6u');
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin insert into public.customer_profiles (venue_id, name, user_id) values (vv_id, 'ZZ리허설N6i', x_id); exception when others then null; end;
    begin update public.customer_profiles set user_id = x_id where venue_id = vv_id and name = 'ZZ리허설N6u'; exception when others then null; end;
    begin update public.customer_profiles set venue_id = vv_id where venue_id = ww_id and name = 'ZZ리허설N6f'; exception when others then null; end;
    begin insert into public.customer_aliases (venue_id, alias, user_id) values (vv_id, 'ZZ리허설N6a', x_id); exception when others then null; end;
    begin perform public.link_customer_alias(vv_id, 'ZZ리허설N6l', x_id); exception when others then null; end;
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    select count(*) into n from public._venue_customer_ids(array[vv_id]) t where t.uid = x_id;
    n := n + (select count(*) from public.customer_aliases where venue_id = vv_id and user_id = x_id);
    raise exception using errcode = 'ZZ001', message = 'hits=' || n;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'hits=0' then out := out || 'N6 PASS; ';
      else fails := fails + 1; out := out || 'N6 FAIL x 가 내 고객이 됐다 ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'N6 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- ── 양성 ─────────────────────────────────────────────────────
  -- P1 손님 메모 저장 = 클라 saveCustomerProfile 의 PostgREST upsert 모양(첫 저장 INSERT → 다시 저장 ON CONFLICT UPDATE) · 조회 · 삭제
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.customer_profiles (venue_id, name, birthday, phone, memo, updated_at) values (vv_id, 'ZZ리허설P1', null, null, '첫 메모', now())
      on conflict (venue_id, name) do update set venue_id = excluded.venue_id, name = excluded.name, birthday = excluded.birthday,
         phone = excluded.phone, memo = excluded.memo, updated_at = excluded.updated_at;
    insert into public.customer_profiles (venue_id, name, birthday, phone, memo, updated_at) values (vv_id, 'ZZ리허설P1', '1990-05-05', null, '고친 메모', now())
      on conflict (venue_id, name) do update set venue_id = excluded.venue_id, name = excluded.name, birthday = excluded.birthday,
         phone = excluded.phone, memo = excluded.memo, updated_at = excluded.updated_at;
    update public.customer_profiles set memo = '직접 수정' where venue_id = vv_id and name = 'ZZ리허설P1';
    get diagnostics n = row_count;
    if n <> 1 then raise exception using errcode = 'ZZ002', message = 'update rows=' || n; end if;
    select count(*) into n from public.customer_profiles where venue_id = vv_id and name = 'ZZ리허설P1' and memo = '직접 수정' and birthday = '1990-05-05';
    if n <> 1 then raise exception using errcode = 'ZZ002', message = 'select rows=' || n; end if;
    delete from public.customer_profiles where venue_id = vv_id and name = 'ZZ리허설P1';
    get diagnostics n = row_count;
    raise exception using errcode = 'ZZ001', message = 'deleted=' || n;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'deleted=1' then out := out || 'P1 PASS; ';
      else fails := fails + 1; out := out || 'P1 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'P1 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;
  -- P2 공동 운영자도 메모 저장(upsert) 가능
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', c_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.customer_profiles (venue_id, name, birthday, phone, memo, updated_at) values (vv_id, 'ZZ리허설P2', null, null, 'm', now())
      on conflict (venue_id, name) do update set venue_id = excluded.venue_id, name = excluded.name, birthday = excluded.birthday,
         phone = excluded.phone, memo = excluded.memo, updated_at = excluded.updated_at;
    get diagnostics n = row_count;
    raise exception using errcode = 'ZZ001', message = 'rows=' || n;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'rows=1' then out := out || 'P2 PASS; '; else fails := fails + 1; out := out || 'P2 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'P2 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;
  -- P3 출석 자동 생성: u 의 오늘 출석 요청 → 업주 staff_check_in → _apply_checkin 이 고객 행(user_id=u, 방문 1)을 만든다
  --    → 이어서 업주가 그 실제 손님 행의 메모를 수정(UPDATE) · 그 손님을 장부명에 연결(link_customer_alias) 성공
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', '', true);
    insert into public.checkin_requests (venue_id, user_id, request_date, status) values (vv_id, u_id, v_today, 'pending');
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    perform public.staff_check_in(vv_id, u_id);
    select count(*) into n from public.customer_profiles where venue_id = vv_id and user_id = u_id and visit_count >= 1;
    if n <> 1 then raise exception using errcode = 'ZZ002', message = 'auto rows=' || n; end if;
    perform public.link_customer_alias(vv_id, 'ZZ리허설P3', u_id);
    if not exists (select 1 from public.customer_aliases where venue_id = vv_id and alias = 'ZZ리허설P3' and user_id = u_id) then
      raise exception using errcode = 'ZZ002', message = 'alias missing';
    end if;
    execute 'set local role authenticated';
    update public.customer_profiles set memo = '실제 손님 메모' where venue_id = vv_id and user_id = u_id;
    get diagnostics n = row_count;
    raise exception using errcode = 'ZZ001', message = 'memo rows=' || n;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'memo rows=1' then out := out || 'P3 PASS; '; else fails := fails + 1; out := out || 'P3 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'P3 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;
  -- P4 출석 요청만 보낸(아직 승인 전) 손님도 장부명 연결 가능 — 손님이 먼저 손을 든 관계
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', '', true);
    insert into public.checkin_requests (venue_id, user_id, request_date, status) values (vv_id, x_id, v_today, 'pending');
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    perform public.link_customer_alias(vv_id, 'ZZ리허설P4', x_id);
    raise exception using errcode = 'ZZ001', message = 'linked';
  exception
    when sqlstate 'ZZ001' then out := out || 'P4 PASS; ';
    when others then fails := fails + 1; out := out || 'P4 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- P5 정의자 경로는 트리거를 통과한다: 업주가 미리 만든 이름 행(= u 의 표시 이름)이 u 의 출석 승인 때 user_id=u 로 묶인다
  --    (_apply_checkin 의 이름 묶기 UPDATE — current_user=postgres)
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', '', true);
    insert into public.customer_profiles (venue_id, name)
      select vv_id, coalesce(p.nickname, p.name) from public.profiles p where p.id = u_id;
    insert into public.checkin_requests (venue_id, user_id, request_date, status) values (vv_id, u_id, v_today, 'pending');
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    perform public.staff_check_in(vv_id, u_id);
    select count(*) into n from public.customer_profiles cp join public.profiles p on p.id = u_id
     where cp.venue_id = vv_id and cp.user_id = u_id and cp.name = coalesce(p.nickname, p.name) and cp.visit_count = 1;
    raise exception using errcode = 'ZZ001', message = 'bound=' || n;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'bound=1' then out := out || 'P5 PASS; '; else fails := fails + 1; out := out || 'P5 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'P5 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- ── 권한 표 ──────────────────────────────────────────────────
  perform set_config('request.jwt.claims', '', true);
  total := total + 1;
  if has_column_privilege('authenticated', 'public.customer_profiles', 'user_id', 'INSERT')
     or has_column_privilege('authenticated', 'public.customer_profiles', 'user_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.customer_profiles', 'visit_count', 'UPDATE')
     or has_table_privilege('anon', 'public.customer_profiles', 'INSERT')
     or has_function_privilege('anon', 'public.link_customer_alias(uuid,text,uuid)', 'EXECUTE')
     or not has_column_privilege('authenticated', 'public.customer_profiles', 'memo', 'UPDATE')
     or not has_table_privilege('service_role', 'public.customer_profiles', 'INSERT')
     or exists (select 1 from pg_policies where tablename = 'customer_profiles' and policyname = 'customer_profiles_pos_all')
     or has_table_privilege('authenticated', 'public.customer_aliases', 'INSERT')
     or not has_table_privilege('authenticated', 'public.customer_aliases', 'SELECT')
     or not exists (select 1 from pg_trigger where tgrelid = 'public.customer_profiles'::regclass and tgname = 'trg_guard_customer_profile_link') then
    fails := fails + 1; out := out || 'R1 FAIL 권한 표; ';
  else out := out || 'R1 PASS; '; end if;

  raise exception using errcode = 'ZZ999',
    message = format('REHEARSAL %s %s/%s | %s', case when fails = 0 then 'PASS' else 'FAIL' end, total - fails, total, out);
end $rehearsal$;
