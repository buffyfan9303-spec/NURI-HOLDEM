-- 20261006a 라이브 롤백 리허설 (store-team 2026-10-06) — audit8-regress-connect.md#R8-01
--
-- 실행: <supabase/migrations/20261006a_link_customer_alias_adopt_unlinked.sql 전문> <이 파일 전문> 을 한 번에 보낸다(암묵 트랜잭션 하나).
--   node rehearse-geo.mjs <20261006a.sql> <이 파일>   (실행기: 누리홀덤_영상분석_0930/geo-notice-1005/rehearse-geo.mjs)
--   · 마지막 DO 블록은 언제나 ZZ999 로 끝난다 → 마이그레이션 포함 전체가 되돌려진다. 메시지 첫머리 'REHEARSAL PASS|FAIL' 을 본다.
--   · 시나리오마다 안쪽 블록을 ZZ001 로 스스로 되돌린다.
--   · 롤백 확인: 리허설 뒤 select to_regclass('public._probe_20261006a') 가 null.
--   · 음성 대조: 빈 마이그레이션 + 이 파일(= 지금 라이브 본문) → S5·S5d·S5e 는 23505, M1 은 메모·생일·전화 소실, X1·X8 은 다른 회원 행에 방문 합산으로 FAIL 해야 한다.
--   · 회귀: 20261005b_rehearsal.sql 18건도 이 마이그레이션 뒤에 돌려 PASS 를 본다(관계 확인·칸 GRANT·트리거 유지).
--
-- 계정·매장은 조회해서 고른다(nuri-migration §5):
--   vv/o = 승인 매장(kind venue) 중 대표가 순수 업주(venue_owner·승인·활성)인 곳
--   u3   = 일반 회원, 닉네임 있음, vv 에 그 회원·그 이름의 고객 행 없음 — 연결 대상(출석 요청은 트랜잭션 안에서 만든다)
--   u4   = u3 와 다른 같은 조건의 회원 — S5e 에서 u3 의 표시 이름을 먼저 차지한 '다른 회원 행' 주인

create table public._probe_20261006a (x int);

do $rehearsal$
declare
  o_id uuid; vv uuid; u3 uuid; n3 text; u4 uuid; n4 text;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  pre uuid; n int; n2 int; r record; out text := ''; fails int := 0; total int := 0;
begin
  select v.id, v.owner_id into vv, o_id from public.venues v join public.profiles p on p.id = v.owner_id
   where v.approved and v.kind = 'venue' and p.role::text = 'venue_owner' and p.approved is true and p.status::text = 'active'
     and (p.suspended_until is null or p.suspended_until < now())
   order by v.id limit 1;
  select p.id, btrim(p.nickname) into u3, n3 from public.profiles p
   where p.role::text = 'user' and p.status::text = 'active' and nullif(btrim(p.nickname),'') is not null
     and not exists (select 1 from public.venues x where x.owner_id = p.id)
     and not exists (select 1 from public.venue_owners vo where vo.user_id = p.id)
     and not exists (select 1 from public.customer_profiles c where c.venue_id = vv and (c.user_id = p.id or lower(btrim(c.name)) = lower(btrim(p.nickname))))
   order by p.id limit 1;
  select p.id, btrim(p.nickname) into u4, n4 from public.profiles p
   where p.role::text = 'user' and p.status::text = 'active' and nullif(btrim(p.nickname),'') is not null and p.id <> u3 and p.nickname = btrim(p.nickname)
     and not exists (select 1 from public.venues x where x.owner_id = p.id)
     and not exists (select 1 from public.venue_owners vo where vo.user_id = p.id)
     and not exists (select 1 from public.customer_profiles c where c.venue_id = vv and (c.user_id = p.id or lower(btrim(c.name)) = lower(btrim(p.nickname))))
     and not exists (select 1 from public._venue_customer_ids(array[vv]) t where t.uid = p.id)
     and not exists (select 1 from public.checkin_requests q where q.venue_id = vv and q.user_id = p.id)
     and not exists (select 1 from public.ledger_buyin_requests b where b.venue_id = vv and b.user_id = p.id)
   order by p.id limit 1;
  if o_id is null or u3 is null or u4 is null then
    raise exception using errcode = 'ZZ999', message = format('REHEARSAL FAIL 대상 없음 o=%s vv=%s u3=%s u4=%s', o_id, vv, u3, u4);
  end if;
  out := format('o=%s vv=%s u3=%s u4=%s | ', left(o_id::text,8), left(vv::text,8), left(u3::text,8), left(u4::text,8));
  -- 관계 확인(20261005b) 통과용: u3 의 오늘 출석 요청(롤백)
  insert into public.checkin_requests (venue_id, user_id, request_date, status) values (vv, u3, v_today, 'pending');

  -- S5 (R8-01 원래 입력) 장부명 = 회원 닉네임. 업주가 그 이름으로 메모·생일·전화를 먼저 저장해 둔 미연결 행이 있다 → 연결 성공 + 그 행에 묶임(보존)
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    -- 클라 saveCustomerProfile 의 PostgREST upsert 모양
    insert into public.customer_profiles (venue_id, name, birthday, phone, memo, updated_at) values (vv, n3, '1991-02-03', '010-0000-1234', '먼저 쓴 메모', now())
      on conflict (venue_id, name) do update set venue_id = excluded.venue_id, name = excluded.name, birthday = excluded.birthday,
         phone = excluded.phone, memo = excluded.memo, updated_at = excluded.updated_at;
    execute 'reset role';
    update public.customer_profiles set visit_count = 2 where venue_id = vv and name = n3 returning id into pre;  -- 과거 방문(정의자 경로로만 쓰이는 칸)
    execute 'set local role authenticated';
    perform public.link_customer_alias(vv, n3, u3);
    execute 'reset role';
    select count(*) into n from public.customer_profiles where venue_id = vv and user_id = u3;
    select * into r from public.customer_profiles where venue_id = vv and user_id = u3;
    if n = 1 and r.id = pre and r.name = n3 and r.memo = '먼저 쓴 메모' and r.birthday = '1991-02-03' and r.phone = '010-0000-1234' and r.visit_count = 2
       and not exists (select 1 from public.customer_profiles where venue_id = vv and user_id is null and lower(btrim(name)) = lower(n3))
       and exists (select 1 from public.customer_aliases where venue_id = vv and alias = n3 and user_id = u3) then
      raise exception using errcode = 'ZZ001', message = 'ok';
    end if;
    raise exception using errcode = 'ZZ001', message = format('rows=%s same_row=%s memo=%s bd=%s ph=%s vc=%s', n, r.id = pre, r.memo, r.birthday, r.phone, r.visit_count);
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'ok' then out := out || 'S5 PASS; '; else fails := fails + 1; out := out || 'S5 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'S5 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- S5b 대조: 같은 회원·같은 별칭, 미연결 동명 행 없음 → 새 회원 행(이름 = 닉네임, 방문 0)
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.link_customer_alias(vv, n3, u3);
    execute 'reset role';
    select count(*) into n from public.customer_profiles where venue_id = vv and user_id = u3 and name = n3 and visit_count = 0;
    raise exception using errcode = 'ZZ001', message = 'rows=' || n;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'rows=1' then out := out || 'S5b PASS; '; else fails := fails + 1; out := out || 'S5b FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'S5b FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- M1 (병합) 회원 행이 이미 있다(출석으로 생김: 메모 A·방문 3·생일·전화 없음) + 다른 장부 이름의 미연결 행(메모 B·생일·전화·방문 2)
  --    → 한 행: 방문 5 · 메모 'A\nB' · 생일·전화 채움 · 미연결 행 삭제
  total := total + 1;
  begin
    insert into public.customer_profiles (venue_id, user_id, name, memo, visit_count, first_visit_at, last_visit_at)
      values (vv, u3, n3, '회원 메모', 3, now() - interval '30 days', now() - interval '2 days') returning id into pre;
    insert into public.customer_profiles (venue_id, name, memo, birthday, phone, visit_count, first_visit_at, last_visit_at)
      values (vv, 'ZZ리허설 장부명M1', '장부 메모', '1988-08-08', '010-1111-2222', 2, now() - interval '60 days', now() - interval '1 day');
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.link_customer_alias(vv, 'zz리허설 장부명m1 ', u3);   -- 대소문자·공백 무시
    execute 'reset role';
    select count(*) into n from public.customer_profiles where venue_id = vv and user_id = u3;
    select * into r from public.customer_profiles where venue_id = vv and user_id = u3;
    if n = 1 and r.id = pre and r.visit_count = 5 and r.memo = E'회원 메모\n장부 메모' and r.birthday = '1988-08-08' and r.phone = '010-1111-2222'
       and r.first_visit_at < now() - interval '59 days' and r.last_visit_at > now() - interval '2 days'
       and not exists (select 1 from public.customer_profiles where venue_id = vv and name = 'ZZ리허설 장부명M1') then
      raise exception using errcode = 'ZZ001', message = 'ok';
    end if;
    raise exception using errcode = 'ZZ001', message = format('rows=%s vc=%s memo=%s bd=%s ph=%s', n, r.visit_count, r.memo, r.birthday, r.phone);
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'ok' then out := out || 'M1 PASS; '; else fails := fails + 1; out := out || 'M1 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'M1 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- M2 (병합 · 회원 값 우선) 회원 행에 생일·전화·같은 메모가 이미 있으면 덮지 않고 메모도 중복하지 않는다
  total := total + 1;
  begin
    insert into public.customer_profiles (venue_id, user_id, name, memo, birthday, phone, visit_count)
      values (vv, u3, n3, '같은 메모', '1970-01-01', '010-9999-9999', 1);
    insert into public.customer_profiles (venue_id, name, memo, birthday, phone, visit_count)
      values (vv, 'ZZ리허설M2', '같은 메모', '1988-08-08', '010-1111-2222', 1);
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    perform public.link_customer_alias(vv, 'ZZ리허설M2', u3);
    select * into r from public.customer_profiles where venue_id = vv and user_id = u3;
    if r.visit_count = 2 and r.memo = '같은 메모' and r.birthday = '1970-01-01' and r.phone = '010-9999-9999' then
      raise exception using errcode = 'ZZ001', message = 'ok';
    end if;
    raise exception using errcode = 'ZZ001', message = format('vc=%s memo=%s bd=%s ph=%s', r.visit_count, r.memo, r.birthday, r.phone);
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'ok' then out := out || 'M2 PASS; '; else fails := fails + 1; out := out || 'M2 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'M2 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- S5d 장부명 ≠ 닉네임. 닉네임 이름의 미연결 행(메모 N)과 장부명 미연결 행(메모 L·방문 4)이 둘 다 있다
  --     → 닉네임 행에 묶이고 장부명 행이 합쳐진다(23505 없음)
  total := total + 1;
  begin
    insert into public.customer_profiles (venue_id, name, memo, visit_count) values (vv, n3, '닉네임 메모', 1) returning id into pre;
    insert into public.customer_profiles (venue_id, name, memo, visit_count) values (vv, 'ZZ리허설S5d', '장부 메모', 4);
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    perform public.link_customer_alias(vv, 'ZZ리허설S5d', u3);
    select count(*) into n from public.customer_profiles where venue_id = vv and user_id = u3;
    select * into r from public.customer_profiles where venue_id = vv and user_id = u3;
    if n = 1 and r.id = pre and r.visit_count = 5 and r.memo = E'닉네임 메모\n장부 메모'
       and not exists (select 1 from public.customer_profiles where venue_id = vv and name = 'ZZ리허설S5d') then
      raise exception using errcode = 'ZZ001', message = 'ok';
    end if;
    raise exception using errcode = 'ZZ001', message = format('rows=%s same_row=%s vc=%s memo=%s', n, r.id = pre, r.visit_count, r.memo);
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'ok' then out := out || 'S5d PASS; '; else fails := fails + 1; out := out || 'S5d FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'S5d FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- S5e u3 의 닉네임 이름을 다른 회원(u4) 행이 이미 쓰고 있다(장부 이름이 u4 에 묶인 경우) → u3 행은 장부 이름으로 새로 생기고 u4 행은 그대로
  total := total + 1;
  begin
    insert into public.customer_profiles (venue_id, user_id, name, memo, visit_count) values (vv, u4, n3, 'u4 메모', 7) returning id into pre;
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    perform public.link_customer_alias(vv, 'ZZ리허설S5e', u3);
    select count(*) into n from public.customer_profiles where venue_id = vv and user_id = u3 and name = 'ZZ리허설S5e' and visit_count = 0;
    if n = 1 and exists (select 1 from public.customer_profiles where id = pre and user_id = u4 and name = n3 and memo = 'u4 메모' and visit_count = 7) then
      raise exception using errcode = 'ZZ001', message = 'ok';
    end if;
    raise exception using errcode = 'ZZ001', message = 'rows=' || n;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'ok' then out := out || 'S5e PASS; '; else fails := fails + 1; out := out || 'S5e FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'S5e FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- X1 (critical 반증) 장부 이름 = 다른 회원 u4 의 닉네임. 그 장부 이름을 u3 에 연결한 뒤 u4 가 방문·출석
  --    → u4 는 자기 행이 생기고(이름 '닉네임 #id8') u3 행 방문수는 그대로
  total := total + 1;
  begin
    insert into public.customer_profiles (venue_id, name, memo, visit_count) values (vv, n4, 'X1 장부 메모', 1);
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.link_customer_alias(vv, n4, u3);
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    perform public._apply_venue_visit(vv, u4);
    perform public._apply_checkin(vv, u4);
    select visit_count into n from public.customer_profiles where venue_id = vv and user_id = u3;
    select * into r from public.customer_profiles where venue_id = vv and user_id = u4;
    raise exception using errcode = 'ZZ001', message = format('u3vc=%s u4vc=%s u4name=%s', n, r.visit_count, r.name = n4 || ' #' || left(u4::text, 8));
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'u3vc=1 u4vc=2 u4name=t' then out := out || 'X1 PASS; '; else fails := fails + 1; out := out || 'X1 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'X1 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- X8 (critical 반증 · 6a 와 무관한 옛 경로) u4 닉네임 이름의 행이 이미 u3 에 묶여 있다 → u4 방문이 u3 행에 더해지지 않는다
  total := total + 1;
  begin
    insert into public.customer_profiles (venue_id, user_id, name, visit_count) values (vv, u3, n4, 5);
    perform public._apply_venue_visit(vv, u4);
    select visit_count into n from public.customer_profiles where venue_id = vv and user_id = u3;
    select count(*) into n2 from public.customer_profiles where venue_id = vv and user_id = u4;
    raise exception using errcode = 'ZZ001', message = format('u3vc=%s u4rows=%s', n, n2);
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'u3vc=5 u4rows=1' then out := out || 'X8 PASS; '; else fails := fails + 1; out := out || 'X8 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'X8 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- G1 (20261005b 유지) 관계 없는 회원 u4 연결 → P0001 사용자 문장 · 별칭·고객 행 0
  total := total + 1;
  begin
    insert into public.customer_profiles (venue_id, name, memo) values (vv, n4, 'u4 이름 메모');
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform public.link_customer_alias(vv, n4, u4);
    raise exception using errcode = 'ZZ001', message = 'linked';
  exception
    when sqlstate 'ZZ001' then fails := fails + 1; out := out || 'G1 FAIL 관계 없는 회원 연결 성공; ';
    when others then
      if sqlstate = 'P0001' and sqlerrm = '이 매장에 출석·예약·참가 신청 기록이 있는 회원만 연결할 수 있습니다' then out := out || 'G1 PASS; ';
      else fails := fails + 1; out := out || 'G1 FAIL ' || sqlstate || ' ' || sqlerrm || '; '; end if;
  end;

  -- G2 (20261005b 유지) 업주는 같은 '묶기'를 직접 UPDATE 로는 못 한다(칸 GRANT)
  total := total + 1;
  begin
    insert into public.customer_profiles (venue_id, name) values (vv, 'ZZ리허설G2');
    perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.customer_profiles set user_id = u3 where venue_id = vv and name = 'ZZ리허설G2';
    get diagnostics n = row_count;
    raise exception using errcode = 'ZZ001', message = 'rows=' || n;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'rows=0' then out := out || 'G2 PASS(0행); '; else fails := fails + 1; out := out || 'G2 FAIL ' || sqlerrm || '; '; end if;
    when sqlstate '42501' then out := out || 'G2 PASS; ';
    when others then fails := fails + 1; out := out || 'G2 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- G3 비로그인(claims 비움) 호출 → 권한 거부
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', '', true);
    perform public.link_customer_alias(vv, n3, u3);
    raise exception using errcode = 'ZZ001', message = 'linked';
  exception
    when sqlstate 'ZZ001' then fails := fails + 1; out := out || 'G3 FAIL 비로그인 연결 성공; ';
    when others then
      if sqlerrm = '권한이 없습니다' then out := out || 'G3 PASS; '; else fails := fails + 1; out := out || 'G3 FAIL ' || sqlstate || ' ' || sqlerrm || '; '; end if;
  end;

  raise exception using errcode = 'ZZ999',
    message = format('REHEARSAL %s %s/%s | %s', case when fails = 0 then 'PASS' else 'FAIL' end, total - fails, total, out);
end $rehearsal$;
