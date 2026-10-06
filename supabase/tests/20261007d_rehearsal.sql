-- 20261007d 라이브 롤백 리허설 — 마이그레이션 뒤에 이어 붙여 한 트랜잭션으로 보내고, 끝의 ZZ999 로 전부 되돌린다.
--   실행: node rehearse-geo.mjs supabase/migrations/20261007d_dealer_post_author_soft_delete.sql supabase/tests/20261007d_rehearsal.sql
--   음성 대조(수정 전 FAIL): 마이그레이션 자리에 주석 한 줄짜리 파일 → S1 이 42501 로 FAIL 이어야 한다(나머지는 수정 전후 모두 PASS).
-- 계정(2026-10-07 역할·소유 조회): A 708de904(작성자) · B 47360d8e(남) — 일반 회원 · ADM f5d305f2(운영자). 값은 출력하지 않는다.
-- 문장은 앱과 같다: deleteDealerPost = update dealer_posts set deleted = true, deleted_at = now() where id = <id> (authenticated 역할 + jwt sub).
do $rehearsal$
declare
  v_a   uuid := (select id from public.profiles where id::text like '708de904%');
  v_b   uuid := (select id from public.profiles where id::text like '47360d8e%');
  v_adm uuid := (select id from public.profiles where id::text like 'f5d305f2%');
  v_p1 uuid; v_p2 uuid; v_p3 uuid; n int; e text;
  total int := 0; fails int := 0; out text := '';
begin
  if v_a is null or v_b is null or v_adm is null then raise exception '리허설 계정을 찾지 못했다'; end if;
  if (select count(*) from public.profiles where id in (v_a, v_b) and role = 'user'::public.user_role) <> 2
     or (select role from public.profiles where id = v_adm) is distinct from 'admin'::public.user_role then
    raise exception '리허설 계정 역할이 예상과 다르다';
  end if;

  -- 준비: A 의 딜러 글 3개
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.dealer_posts(author_id, kind, region, content) values (v_a, 'hiring', '서울', 'ZZ-REH-1007d-1') returning id into v_p1;
  insert into public.dealer_posts(author_id, kind, region, content) values (v_a, 'seeking', null, 'ZZ-REH-1007d-2') returning id into v_p2;
  insert into public.dealer_posts(author_id, kind, region, content) values (v_a, 'general', null, 'ZZ-REH-1007d-3') returning id into v_p3;

  -- S1 (수정 전 FAIL) 작성자가 자기 글을 지운다 — 앱과 같은 문장
  total := total + 1;
  begin
    update public.dealer_posts set deleted = true, deleted_at = now() where id = v_p1;
    get diagnostics n = row_count; e := null;
  exception when others then n := -1; e := sqlstate;
  end;
  execute 'reset role';
  if n = 1 and (select deleted from public.dealer_posts where id = v_p1) then out := out || 'S1 PASS; ';
  else fails := fails + 1; out := out || format('S1 FAIL rows=%s sqlstate=%s; ', n, e); end if;

  -- N1 (음성) 남(B)은 A 의 글을 지우지 못한다 — 0행, 그대로
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    update public.dealer_posts set deleted = true, deleted_at = now() where id = v_p2;
    get diagnostics n = row_count; e := null;
  exception when others then n := -1; e := sqlstate;
  end;
  execute 'reset role';
  if n <= 0 and not (select deleted from public.dealer_posts where id = v_p2) then out := out || 'N1 PASS; ';
  else fails := fails + 1; out := out || format('N1 FAIL rows=%s; ', n); end if;

  -- 준비: 운영자 권한으로 p3 를 지워 둔다(수정 전에도 지운 글이 있는 상태로 N2·N3·P1 을 잰다)
  update public.dealer_posts set deleted = true, deleted_at = now() where id = v_p3;

  -- N2 (음성) 지운 글은 남(B)·비로그인에게 안 보인다
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.dealer_posts where id in (v_p1, v_p3);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  select n + count(*) into n from public.dealer_posts where id in (v_p1, v_p3);
  execute 'reset role';
  if n = 0 then out := out || 'N2 PASS; ';
  else fails := fails + 1; out := out || format('N2 FAIL visible=%s; ', n); end if;

  -- N3 (음성) 남(B)은 지운 글을 되살리지 못한다
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    update public.dealer_posts set deleted = false where id = v_p3;
    get diagnostics n = row_count;
  exception when others then n := -1;
  end;
  execute 'reset role';
  if n <= 0 and (select deleted from public.dealer_posts where id = v_p3) then out := out || 'N3 PASS; ';
  else fails := fails + 1; out := out || format('N3 FAIL rows=%s; ', n); end if;

  -- P1 (양성) 목록 조건(deleted=false)으로는 작성자에게도 지운 글이 안 나온다 · 남의 목록에는 A 의 살아 있는 글이 그대로 보인다
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.dealer_posts where deleted = false and id in (v_p1, v_p2, v_p3);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select n * 10 + count(*) into n from public.dealer_posts where deleted = false and id in (v_p1, v_p2, v_p3);
  execute 'reset role';
  if n = 11 then out := out || 'P1 PASS; ';
  else fails := fails + 1; out := out || format('P1 FAIL a*10+b=%s; ', n); end if;

  -- P2 (양성) 운영자는 여전히 남의 글을 지운다
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    update public.dealer_posts set deleted = true, deleted_at = now() where id = v_p2;
    get diagnostics n = row_count;
  exception when others then n := -1;
  end;
  execute 'reset role';
  if n = 1 then out := out || 'P2 PASS; ';
  else fails := fails + 1; out := out || format('P2 FAIL rows=%s; ', n); end if;

  raise exception using errcode = 'ZZ999',
    message = format('REHEARSAL %s %s/%s :: %s', case when fails = 0 then 'PASS' else 'FAIL' end, total - fails, total, out);
end $rehearsal$;
