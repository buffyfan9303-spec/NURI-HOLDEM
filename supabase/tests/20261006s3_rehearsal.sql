-- 20261006s3 라이브 롤백 리허설 (store-team 2026-10-06) — 오너 결정: 회원 전화번호 노출 범위
--
-- 실행: s1+s2+s3 를 이어 붙인 파일을 마이그레이션 자리에 — node rehearse-geo.mjs <s1+s2+s3> <이 파일>
--   (실행기: 누리홀덤_영상분석_0930/geo-notice-1005/rehearse-geo.mjs — 한 트랜잭션, 마지막 ZZ999 로 통째 되돌린다)
--   · 값(실명·닉네임·전화·uuid)은 출력하지 않는다 — 개수·참거짓·sqlstate 만.
--   · 음성 대조: 마이그레이션 자리에 s1+s2 만(= s3 직전) 넣으면 N1·N2·P1·N3·N4 가 FAIL 해야 한다.
--
-- 계정·매장은 조회해서 고른다(nuri-migration §5):
--   vv/o = 승인 매장(kind venue) 중 대표가 순수 업주(venue_owner·승인·활성·정지 아님)인 곳
--   tg   = 일반 회원: 실명·닉네임·'010'+8자리 전화가 있고, 닉네임과 실명이 서로를 포함하지 않으며, 같은 전화를 쓰는 다른 활성 회원이 없다
--   gm   = 매장 권한이 전혀 없는 일반 회원

do $rehearsal$
declare
  o_id uuid; vv uuid; v_venue uuid; tg uuid; t_real text; t_nick text; t_phone text; t_mask text; gm uuid;
  v_old text := 'ZZ옛닉' || substr(md5(random()::text), 1, 6);
  n int; n2 int; b boolean; b2 boolean; s text; s2 text; c0 int; v_id uuid;
  out text := ''; fails int := 0; total int := 0;
begin
  select v.id, v.owner_id into vv, o_id from public.venues v join public.profiles p on p.id = v.owner_id
   where v.approved and v.kind = 'venue' and p.role::text = 'venue_owner' and p.approved is true and p.status::text = 'active'
     and (p.suspended_until is null or p.suspended_until < now())
     and public._venue_owner_ok(v.id, v.owner_id)
   order by v.id limit 1;
  -- find_user_by_phone 안의 매장 계산과 같은 식(상한 셈의 열쇠)
  select v.id into v_venue from public.venues v where v.owner_id = o_id and v.kind = 'venue' order by v.id limit 1;
  select p.id, btrim(p.real_name), btrim(p.nickname), regexp_replace(p.phone, '[^0-9]', '', 'g')
    into tg, t_real, t_nick, t_phone
    from public.profiles p
   where p.role::text = 'user' and p.status::text = 'active'
     and char_length(btrim(coalesce(p.real_name, ''))) >= 2 and char_length(btrim(coalesce(p.nickname, ''))) >= 2
     and p.nickname not ilike '%' || btrim(p.real_name) || '%'
     and p.real_name not ilike '%' || btrim(p.nickname) || '%'
     and regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') ~ '^010[0-9]{8}$'
     and p.id <> o_id
     and not exists (select 1 from public.profiles q where q.id <> p.id and coalesce(q.status::text, 'active') = 'active'
                      and right(regexp_replace(coalesce(q.phone, ''), '[^0-9]', '', 'g'), 10) = right(regexp_replace(p.phone, '[^0-9]', '', 'g'), 10))
   order by p.id limit 1;
  select p.id into gm from public.profiles p
   where p.role::text = 'user' and p.status::text = 'active' and p.id <> tg
     and not exists (select 1 from public.venues x where x.owner_id = p.id)
     and not exists (select 1 from public.venue_owners vo where vo.user_id = p.id)
     and not exists (select 1 from public.venue_staff vs where vs.user_id = p.id)
   order by p.id limit 1;
  if vv is null or tg is null or gm is null or v_venue is null then
    raise exception using errcode = 'ZZ999', message = format('REHEARSAL %s %s/%s | 계정 선택 실패 vv=%s tg=%s gm=%s', 'FAIL', 0, 1, vv is not null, tg is not null, gm is not null);
  end if;

  t_mask := public._mask_name(t_real);   -- 내부 함수라 authenticated 로 바꾸기 전에 기대값을 뜬다
  -- 준비(되돌림): tg 를 vv 의 손님으로(고객카드) + 옛 닉네임
  insert into public.customer_profiles(venue_id, user_id, name, visit_count) values (vv, tg, 'ZZ리허설S3', 0);
  insert into public.nickname_history(user_id, old_nickname, new_nickname) values (tg, v_old, t_nick);

  -- S0 ACL
  total := total + 1;
  if not has_function_privilege('anon', 'public.find_user_by_phone(text)', 'execute')
     and not has_function_privilege('anon', 'public.set_my_phone_lookup(boolean)', 'execute')
     and has_function_privilege('authenticated', 'public.find_user_by_phone(text)', 'execute')
     and has_function_privilege('authenticated', 'public.set_my_phone_lookup(boolean)', 'execute')
     and not has_function_privilege('authenticated', 'public._mask_name(text)', 'execute') then
    out := out || 'S0 PASS; ';
  else fails := fails + 1; out := out || 'S0 FAIL acl; '; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- N1 닉네임 검색 4종 — 내 손님(tg)이어도 phone_masked 전부 null
  total := total + 1;
  select count(*), bool_or(r.phone_masked is not null) into n, b from public.search_voucher_recipients(vv, t_nick) r where r.user_id = tg;
  select count(*), bool_or(r.phone_masked is not null) into n2, b2 from public.search_registered_players(vv, t_nick) r where r.user_id = tg;
  s := format('svr=%s/%s srp=%s/%s', n, coalesce(b, false), n2, coalesce(b2, false));
  if n = 1 and b is not true and n2 = 1 and b2 is not true then
    select count(*), bool_or(r.phone_masked is not null) into n, b from public.find_user_for_transfer(t_nick) r where r.id = tg;
    select count(*), bool_or(r.phone_masked is not null) into n2, b2 from public.search_ranking_members(t_nick) r where r.id = tg;
    s := s || format(' fuft=%s/%s srm=%s/%s', n, coalesce(b, false), n2, coalesce(b2, false));
    if n = 1 and b is not true and b2 is not true then out := out || format('N1 PASS(%s); ', s);
    else fails := fails + 1; out := out || format('N1 FAIL %s; ', s); end if;
  else fails := fails + 1; out := out || format('N1 FAIL %s; ', s); end if;

  -- N1b 옛 닉네임으로 찾은 내 손님도 null
  total := total + 1;
  select count(*), bool_or(r.phone_masked is not null), string_agg(r.matched, ',') into n, b, s
    from public.search_voucher_recipients(vv, v_old) r where r.user_id = tg;
  if n = 1 and s = 'old_nickname' and b is not true then out := out || 'N1b PASS(옛닉 전화 null); ';
  else fails := fails + 1; out := out || format('N1b FAIL rows=%s how=%s phone=%s; ', n, s, b); end if;

  -- P0 실명으로만 맞은 내 손님은 가린 전화를 그대로 싣는다(양성 대조 — 범위를 지나치게 넓히지 않았다)
  total := total + 1;
  select count(*), bool_and(r.phone_masked = '010-****-' || right(t_phone, 4)) into n, b from public.search_voucher_recipients(vv, t_real) r where r.user_id = tg;
  select count(*), bool_and(r.phone_masked = '010-****-' || right(t_phone, 4)) into n2, b2 from public.search_registered_players(vv, t_real) r where r.user_id = tg;
  if n = 1 and b and n2 = 1 and b2 then out := out || 'P0 PASS(실명 내 손님 전화 유지); ';
  else fails := fails + 1; out := out || format('P0 FAIL svr=%s/%s srp=%s/%s; ', n, b, n2, b2); end if;

  -- N2 형식: 10자리·하이픈·011·NULL → 22023
  total := total + 1; s := '';
  foreach s2 in array array[left(t_phone, 10), '010-' || substr(t_phone, 4, 4) || '-' || right(t_phone, 4), '011' || right(t_phone, 8), ' ' || t_phone, '+82' || substr(t_phone, 2)] loop
    begin
      perform 1 from public.find_user_by_phone(s2);
      s := s || 'pass,';
    exception when sqlstate '22023' then s := s || '22023,';
              when others then s := s || sqlstate || ',';
    end;
  end loop;
  begin perform 1 from public.find_user_by_phone(null); s := s || 'pass';
  exception when sqlstate '22023' then s := s || '22023'; when others then s := s || sqlstate; end;
  if s = '22023,22023,22023,22023,22023,22023' then out := out || 'N2 PASS(형식 6종 22023); ';
  else fails := fails + 1; out := out || format('N2 FAIL %s; ', s); end if;

  -- P1 11자리 → tg 1행: 닉네임 그대로 · 가린 실명 · 가린 전화 · 실명 전체 없음
  total := total + 1;
  select count(*), bool_and(r.display = t_nick and r.phone_masked = '010-****-' || right(t_phone, 4)
                            and r.name_masked = t_mask and r.name_masked <> t_real
                            and strpos(row(r.*)::text, t_real) = 0 and strpos(row(r.*)::text, t_phone) = 0)
    into n, b from public.find_user_by_phone(t_phone) r where r.id = tg;
  if n = 1 and b then out := out || 'P1 PASS(11자리 1행·가림); ';
  else fails := fails + 1; out := out || format('P1 FAIL rows=%s ok=%s; ', n, b); end if;

  -- P2 이용권 발급 흐름 — 번호로 찾은 회원 id 로 발급(1장)
  total := total + 1;
  select r.id into v_id from public.find_user_by_phone(t_phone) r where r.id = tg;
  begin
    select public.issue_voucher(vv, 'ZZ리허설S3', 1, null, v_id, null, null, 'grant') into n;
    if n = 1 then out := out || 'P2 PASS(발급 1장); '; else fails := fails + 1; out := out || format('P2 FAIL n=%s; ', n); end if;
  exception when others then fails := fails + 1; out := out || 'P2 FAIL ' || sqlstate || '; ';
  end;

  -- P3 어제(KST) 결과 1만 건은 오늘 셈에 들어가지 않는다
  execute 'reset role';
  insert into public.phone_lookup_audit(caller, venue_id, phone_last4, result_count, created_at)
  select o_id, v_venue, '0000', 1, (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul') - interval '1 minute'
    from generate_series(1, 10000);
  execute 'set local role authenticated';
  total := total + 1;
  begin
    select count(*) into n from public.find_user_by_phone(t_phone) r where r.id = tg;
    if n = 1 then out := out || 'P3 PASS(어제 1만 무관); '; else fails := fails + 1; out := out || format('P3 FAIL rows=%s; ', n); end if;
  exception when others then fails := fails + 1; out := out || 'P3 FAIL ' || sqlstate || '; ';
  end;

  -- N3 상한: 오늘 결과 있는 조회를 9999 로 채우면 한 번 더 통과(=1만), 그다음은 PT429. 0행 조회도 상한이면 PT429
  execute 'reset role';
  select count(*) into c0 from public.phone_lookup_audit a
   where a.venue_id = v_venue and a.result_count > 0
     and a.created_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul');
  insert into public.phone_lookup_audit(caller, venue_id, phone_last4, result_count)
  select o_id, v_venue, '0000', 1 from generate_series(1, 9999 - c0);
  -- 결과 0 인 조회 50건은 세지 않는다
  insert into public.phone_lookup_audit(caller, venue_id, phone_last4, result_count)
  select o_id, v_venue, '0000', 0 from generate_series(1, 50);
  execute 'set local role authenticated';
  total := total + 1; s := '';
  begin select count(*) into n from public.find_user_by_phone(t_phone) r; s := s || 'first=' || n || ',';
  exception when others then s := s || 'first=' || sqlstate || ','; end;
  begin select count(*) into n from public.find_user_by_phone(t_phone) r; s := s || 'second=' || n || ',';
  exception when sqlstate 'PT429' then s := s || 'second=PT429,'; when others then s := s || 'second=' || sqlstate || ','; end;
  begin select count(*) into n from public.find_user_by_phone('01000000000') r; s := s || 'miss=' || n;
  exception when sqlstate 'PT429' then s := s || 'miss=PT429'; when others then s := s || 'miss=' || sqlstate; end;
  if s = 'first=1,second=PT429,miss=PT429' then out := out || 'N3 PASS(1만 경계·상한 PT429); ';
  else fails := fails + 1; out := out || format('N3 FAIL %s c0=%s; ', s, c0); end if;
  -- 상한 셈을 비운다(다음 시험이 상한에 막히지 않게 — 같은 트랜잭션 안의 합성 행만)
  execute 'reset role';
  delete from public.phone_lookup_audit where venue_id = v_venue and phone_last4 = '0000';
  delete from public.phone_lookup_audit where caller = o_id and created_at >= now() - interval '1 hour';

  -- P4 본인 select * 성공 · 새 칸 기본 true
  perform set_config('request.jwt.claims', json_build_object('sub', tg, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  total := total + 1;
  begin
    select count(*), bool_and(x.allow_venue_phone_lookup) into n, b from (select * from public.profiles where id = tg) x;
    select count(*) into n2 from (select * from public.profiles where id = o_id) x;   -- 남의 행은 RLS 로 0
    if n = 1 and b and n2 = 0 then out := out || 'P4 PASS(본인 select * · 기본 허용 · 남의 행 0); ';
    else fails := fails + 1; out := out || format('P4 FAIL self=%s allow=%s other=%s; ', n, b, n2); end if;
  exception when others then fails := fails + 1; out := out || 'P4 FAIL ' || sqlstate || '; ';
  end;

  -- N4 거부: 본인이 끄면 번호 조회에서 빠진다
  total := total + 1;
  perform public.set_my_phone_lookup(false);
  select count(*), bool_and(not x.allow_venue_phone_lookup) into n2, b2 from (select * from public.profiles where id = tg) x;
  perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);
  select count(*) into n from public.find_user_by_phone(t_phone) r where r.id = tg;
  if n = 0 and n2 = 1 and b2 then out := out || 'N4 PASS(거부 회원 제외); ';
  else fails := fails + 1; out := out || format('N4 FAIL rows=%s self_off=%s; ', n, b2); end if;

  -- N5 남의 설정은 못 바꾼다(gm 이 tg 를 켜려 해도 0행) · NULL 22023
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', gm, 'role', 'authenticated')::text, true);
  update public.profiles set allow_venue_phone_lookup = true where id = tg;
  get diagnostics n = row_count;
  begin perform public.set_my_phone_lookup(null); s := 'pass';
  exception when sqlstate '22023' then s := '22023'; when others then s := sqlstate; end;
  execute 'reset role';
  select allow_venue_phone_lookup into b from public.profiles where id = tg;
  if n = 0 and b is false and s = '22023' then out := out || 'N5 PASS(남의 설정 0행·NULL 22023); ';
  else fails := fails + 1; out := out || format('N5 FAIL upd=%s tg_allow=%s null=%s; ', n, b, s); end if;

  -- N6 권한 없는 일반 회원: 0행·오류 없음·감사 기록 없음(손님 지갑 경로 보존) — 형식이 틀려도 0행
  total := total + 1;
  select count(*) into c0 from public.phone_lookup_audit where caller = gm;
  perform set_config('request.jwt.claims', json_build_object('sub', gm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    select count(*) into n from public.find_user_by_phone(t_phone);
    select count(*) into n2 from public.find_user_by_phone('010-1234');
    execute 'reset role';
    select count(*) - c0 into c0 from public.phone_lookup_audit where caller = gm;
    if n = 0 and n2 = 0 and c0 = 0 then out := out || 'N6 PASS(일반 회원 0행·무기록); ';
    else fails := fails + 1; out := out || format('N6 FAIL rows=%s/%s audit=%s; ', n, n2, c0); end if;
  exception when others then execute 'reset role'; fails := fails + 1; out := out || 'N6 FAIL ' || sqlstate || '; ';
  end;

  -- N7 anon 거절
  total := total + 1; s := '';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin perform 1 from public.find_user_by_phone(t_phone); s := s || 'pass,';
  exception when sqlstate '42501' then s := s || '42501,'; when others then s := s || sqlstate || ','; end;
  begin perform public.set_my_phone_lookup(true); s := s || 'pass';
  exception when sqlstate '42501' then s := s || '42501'; when others then s := s || sqlstate; end;
  execute 'reset role';
  if s = '42501,42501' then out := out || 'N7 PASS(anon 42501); ';
  else fails := fails + 1; out := out || format('N7 FAIL %s; ', s); end if;

  raise exception using errcode = 'ZZ999',
    message = format('REHEARSAL %s %s/%s | %s', case when fails = 0 then 'PASS' else 'FAIL' end, total - fails, total, out);
end $rehearsal$;
