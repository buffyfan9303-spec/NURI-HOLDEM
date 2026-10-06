-- 20261006s1 라이브 롤백 리허설 (store-team 2026-10-06) — security-1006/tech.md#P2-1
--
-- 실행: node rehearse-geo.mjs <supabase/migrations/20261006s1_sec_voucher_recipient_scope.sql> <이 파일>
--   (실행기: 누리홀덤_영상분석_0930/geo-notice-1005/rehearse-geo.mjs — 두 파일을 한 트랜잭션으로 보내고 마지막 ZZ999 로 통째 되돌린다)
--   · 값(실명·닉네임·전화)은 출력하지 않는다 — 개수·참거짓만.
--   · 음성 대조: 마이그레이션 자리에 r0(타임아웃 두 줄)만 넣으면(= 지금 라이브) N1·N2 가 FAIL 해야 한다.
--   · 롤백 확인: 리허설 뒤 select to_regclass('public._probe_20261006s1') 가 null.
--
-- 계정·매장은 조회해서 고른다(nuri-migration §5):
--   vv/o = 승인 매장(kind venue) 중 대표가 순수 업주(venue_owner·승인·활성·정지 아님)인 곳
--   tg   = 일반 회원(실명·닉네임 있음, 닉네임에 실명이 안 들어 있음, vv 고객 아님) — 남의 매장 회원
--   gm   = 매장 권한이 전혀 없는 일반 회원 — 검색 자체가 거절돼야 한다

create table public._probe_20261006s1 (x int);

do $rehearsal$
declare
  o_id uuid; vv uuid; tg uuid; t_real text; t_nick text; gm uuid;
  v_old text := 'ZZ옛닉' || substr(md5(random()::text), 1, 6);
  n int; b boolean; b2 boolean; s text; out text := ''; fails int := 0; total int := 0;
begin
  select v.id, v.owner_id into vv, o_id from public.venues v join public.profiles p on p.id = v.owner_id
   where v.approved and v.kind = 'venue' and p.role::text = 'venue_owner' and p.approved is true and p.status::text = 'active'
     and (p.suspended_until is null or p.suspended_until < now())
   order by v.id limit 1;
  select p.id, btrim(p.real_name), btrim(p.nickname) into tg, t_real, t_nick from public.profiles p
   where p.role::text = 'user' and p.status::text = 'active'
     and char_length(btrim(coalesce(p.real_name, ''))) >= 2 and char_length(btrim(coalesce(p.nickname, ''))) >= 2
     and lower(btrim(p.real_name)) <> lower(btrim(p.nickname))
     and p.nickname not ilike '%' || btrim(p.real_name) || '%'
     and p.id <> o_id
     and not exists (select 1 from public._venue_customer_ids(array[vv]) t where t.uid = p.id)
     and not exists (select 1 from public.nickname_history h where h.user_id = p.id)
   order by p.id limit 1;
  select p.id into gm from public.profiles p
   where p.role::text = 'user' and p.status::text = 'active' and p.id <> tg
     and not exists (select 1 from public.venues x where x.owner_id = p.id)
     and not exists (select 1 from public.venue_owners vo where vo.user_id = p.id)
     and not exists (select 1 from public.venue_staff vs where vs.user_id = p.id)
   order by p.id limit 1;
  if vv is null or tg is null or gm is null then
    raise exception using errcode = 'ZZ999', message = format('REHEARSAL %s %s/%s | 계정 선택 실패 vv=%s tg=%s gm=%s', 'FAIL', 0, 1, vv is not null, tg is not null, gm is not null);
  end if;
  -- 합성 옛 닉네임(되돌림) — 옛 닉네임 경로 시험용
  insert into public.nickname_history(user_id, old_nickname, new_nickname) values (tg, v_old, t_nick);

  -- S0 ACL·설정
  total := total + 1;
  if not has_function_privilege('anon', 'public.search_voucher_recipients(uuid,text)', 'execute')
     and not has_function_privilege('anon', 'public.schedule_reservations_for_owner(uuid)', 'execute')
     and has_function_privilege('authenticated', 'public.search_voucher_recipients(uuid,text)', 'execute')
     and has_function_privilege('authenticated', 'public.schedule_reservations_for_owner(uuid)', 'execute') then
    out := out || 'S0 PASS; ';
  else fails := fails + 1; out := out || 'S0 FAIL acl; '; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);

  -- N1 남의 매장 회원 실명 → 0행
  total := total + 1;
  select count(*) into n from public.search_voucher_recipients(vv, t_real) r where r.user_id = tg;
  if n = 0 then out := out || 'N1 PASS(실명 0행); '; else fails := fails + 1; out := out || format('N1 FAIL 실명 rows=%s; ', n); end if;

  -- N2 남의 매장 회원 옛 닉네임 → 0행
  total := total + 1;
  select count(*) into n from public.search_voucher_recipients(vv, v_old) r where r.user_id = tg;
  if n = 0 then out := out || 'N2 PASS(옛닉 0행); '; else fails := fails + 1; out := out || format('N2 FAIL 옛닉 rows=%s; ', n); end if;

  -- P1 닉네임은 전 회원에서 그대로 찾는다(실명·전화는 안 싣는다) — role authenticated 로(실행권 양성)
  total := total + 1;
  execute 'set local role authenticated';
  select count(*), bool_or(r.real_name is not null), bool_or(r.phone_masked is not null) into n, b, b2
    from public.search_voucher_recipients(vv, t_nick) r where r.user_id = tg;
  execute 'reset role';
  if n = 1 and b is not true and b2 is not true then out := out || 'P1 PASS(닉네임 1행·실명·전화 없음); ';
  else fails := fails + 1; out := out || format('P1 FAIL rows=%s rn=%s phone=%s; ', n, b, b2); end if;

  -- N3 매장 권한 없는 일반 회원 → 42501
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', gm, 'role', 'authenticated')::text, true);
  begin
    select count(*) into n from public.search_voucher_recipients(vv, t_nick);
    fails := fails + 1; out := out || 'N3 FAIL 일반회원 통과; ';
  exception when sqlstate '42501' then out := out || 'N3 PASS(42501); ';
            when others then fails := fails + 1; out := out || 'N3 FAIL ' || sqlstate || '; ';
  end;

  -- N4 비로그인 → 42501
  total := total + 1;
  perform set_config('request.jwt.claims', '', true);
  begin
    select count(*) into n from public.search_voucher_recipients(vv, t_nick);
    fails := fails + 1; out := out || 'N4 FAIL 비로그인 통과; ';
  exception when sqlstate '42501' then out := out || 'N4 PASS(42501); ';
            when others then fails := fails + 1; out := out || 'N4 FAIL ' || sqlstate || '; ';
  end;

  -- 고객 관계 만들기(합성 고객카드, 되돌림) → 양성
  insert into public.customer_profiles(venue_id, user_id, name, visit_count) values (vv, tg, 'ZZ리허설S1', 0);
  perform set_config('request.jwt.claims', json_build_object('sub', o_id, 'role', 'authenticated')::text, true);

  -- P2 내 고객은 실명으로 찾고 실명을 싣는다
  total := total + 1;
  select count(*), bool_and(r.real_name is not null), string_agg(r.matched, ',') into n, b, s
    from public.search_voucher_recipients(vv, t_real) r where r.user_id = tg;
  if n = 1 and b and s = 'real_name' then out := out || 'P2 PASS(내 고객 실명 1행); ';
  else fails := fails + 1; out := out || format('P2 FAIL rows=%s rn=%s how=%s; ', n, b, s); end if;

  -- P3 내 고객은 옛 닉네임으로도 찾는다
  total := total + 1;
  select count(*), string_agg(r.matched, ',') into n, s from public.search_voucher_recipients(vv, v_old) r where r.user_id = tg;
  if n = 1 and s = 'old_nickname' then out := out || 'P3 PASS(내 고객 옛닉 1행); ';
  else fails := fails + 1; out := out || format('P3 FAIL rows=%s how=%s; ', n, s); end if;

  -- P4 내 고객 닉네임 검색 — 전화 마스킹이 실린다(20260925h 유지)
  --   ⚠ s1 단독(=s1+s2) 기준이다. 20261006s3 뒤에는 닉네임으로 찾은 행의 전화가 null 이라 P4 FAIL 이 정상(s3 리허설 N1 이 정본).
  total := total + 1;
  select count(*), bool_and(r.phone_masked is not null) = bool_and(p.phone is not null) into n, b
    from public.search_voucher_recipients(vv, t_nick) r join public.profiles p on p.id = r.user_id where r.user_id = tg;
  if n = 1 and b then out := out || 'P4 PASS(내 고객 닉네임·전화마스킹); ';
  else fails := fails + 1; out := out || format('P4 FAIL rows=%s phone=%s; ', n, b); end if;

  raise exception using errcode = 'ZZ999',
    message = format('REHEARSAL %s %s/%s | %s', case when fails = 0 then 'PASS' else 'FAIL' end, total - fails, total, out);
end $rehearsal$;
