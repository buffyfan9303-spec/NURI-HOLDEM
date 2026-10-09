-- 20261007d 라이브 롤백 리허설 — 마이그레이션 뒤에 이어 붙여 한 트랜잭션으로 보내고, 끝의 ZZ999 로 전부 되돌린다.
--   실행: node rehearse-geo.mjs supabase/migrations/20261007d_dealer_post_author_soft_delete.sql supabase/tests/20261007d_rehearsal.sql
--   결과(2026-10-07 실측, 모두 롤백): 이 마이그레이션 → PASS 9/9.
--   음성 대조(같은 날 실측):
--     · 마이그레이션 자리에 timeout 두 줄 + 주석뿐인 파일 → FAIL 3/9. RPC 가 없어 S1·S2·N1·N2·N3 이 42883 으로 FAIL,
--       R4 는 S1 이 지운 글이 없어 함께 FAIL. R1·R2·R3 은 PASS — 지금 라이브 정책은 이미 막고 있다(회귀 감시용).
--     · 1차 판(읽기 정책에 작성자 갈래, md5 8663b5cb) → FAIL 0/9. R1(지원서 1건 보임)·R2(되살림 1행)·R3(B·비로그인 목록에 다시 보임)이 실제로 뚫린다.
--     · 자가검사: anon 에 실행권을 주면·search_path 에서 pg_temp 를 빼면 적용 단계에서 멈춘다. 단 REVOKE/GRANT 두 줄을 빼도
--       라이브 기본 권한(20261004b — 새 함수는 PUBLIC·anon 실행 없음, authenticated 있음) 때문에 9/9 로 통과한다 — 라이브에서는 그 두 줄을 못 거른다.
-- 계정(2026-10-07 역할·소유 조회): A 708de904(작성자) · B 47360d8e(남) — 일반 회원 · ADM f5d305f2(운영자). 값은 출력하지 않는다.
-- 앱 문장: deleteDealerPost = rpc('delete_dealer_post', { p_id }) (authenticated 역할 + jwt sub). 운영자 삭제도 같은 함수다.
do $rehearsal$
declare
  v_a   uuid := (select id from public.profiles where id::text like '708de904%');
  v_b   uuid := (select id from public.profiles where id::text like '47360d8e%');
  v_adm uuid := (select id from public.profiles where id::text like 'f5d305f2%');
  v_live uuid; v_own uuid; v_mod uuid; v_adm_t uuid; v_other uuid;
  n int; n2 int; e text; m text;
  total int := 0; fails int := 0; out text := '';
begin
  if v_a is null or v_b is null or v_adm is null then raise exception '리허설 계정을 찾지 못했다'; end if;
  if (select count(*) from public.profiles where id in (v_a, v_b) and role = 'user'::public.user_role) <> 2
     or (select role from public.profiles where id = v_adm) is distinct from 'admin'::public.user_role then
    raise exception '리허설 계정 역할이 예상과 다르다';
  end if;

  -- 준비: A 의 딜러 글 5개 — live(남겨 둠) · own(A 가 RPC 로 지움) · mod(운영자 조치로 지워진 상태, B 의 지원서 있음)
  --   · adm(운영자가 RPC 로 지움) · other(B·비로그인 공격 대상)
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.dealer_posts(author_id, kind, region, content) values (v_a, 'hiring', '서울', 'ZZ-REH-1007d-live') returning id into v_live;
  insert into public.dealer_posts(author_id, kind, region, content) values (v_a, 'seeking', null, 'ZZ-REH-1007d-own') returning id into v_own;
  insert into public.dealer_posts(author_id, kind, region, content) values (v_a, 'hiring', '서울', 'ZZ-REH-1007d-mod') returning id into v_mod;
  insert into public.dealer_posts(author_id, kind, region, content) values (v_a, 'general', null, 'ZZ-REH-1007d-adm') returning id into v_adm_t;
  insert into public.dealer_posts(author_id, kind, region, content) values (v_a, 'general', null, 'ZZ-REH-1007d-other') returning id into v_other;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.dealer_applications(post_id, applicant_id, applicant_name, phone) values (v_live, v_b, 'ZZ', '010-0000-0000');
  insert into public.dealer_applications(post_id, applicant_id, applicant_name, phone) values (v_mod, v_b, 'ZZ', '010-0000-0000');
  execute 'reset role';
  -- mod 는 RPC 와 무관하게 '운영자가 지운 상태' 로 만든다 → R1~R3 은 RPC 가 없어도(음성 대조) 정책만 잰다
  update public.dealer_posts set deleted = true, deleted_at = now() where id = v_mod;

  -- S1 (양성) 작성자 본인이 자기 글을 지운다 — 앱과 같은 RPC
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.delete_dealer_post(v_own); e := null; exception when others then e := sqlstate; end;
  execute 'reset role';
  if e is null and (select deleted and deleted_at is not null from public.dealer_posts where id = v_own) then out := out || 'S1 PASS; ';
  else fails := fails + 1; out := out || format('S1 FAIL sqlstate=%s; ', e); end if;

  -- S2 (양성) 운영자가 남(A)의 글을 지운다(조치) — 같은 RPC
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.delete_dealer_post(v_adm_t); e := null; exception when others then e := sqlstate; end;
  execute 'reset role';
  if e is null and (select deleted from public.dealer_posts where id = v_adm_t) then out := out || 'S2 PASS; ';
  else fails := fails + 1; out := out || format('S2 FAIL sqlstate=%s; ', e); end if;

  -- N1 (음성) 남(B)은 A 의 글을 지우지 못한다 — 사용자 문장으로 거절, 글은 그대로
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.delete_dealer_post(v_other); e := null; m := null;
  exception when others then e := sqlstate; m := sqlerrm; end;
  execute 'reset role';
  if e = 'P0001' and m = '이 글을 삭제할 권한이 없습니다' and not (select deleted from public.dealer_posts where id = v_other) then out := out || 'N1 PASS; ';
  else fails := fails + 1; out := out || format('N1 FAIL sqlstate=%s; ', e); end if;

  -- N2 (음성) 비로그인 — anon 역할은 실행권 자체가 없고(42501), 토큰 없는 authenticated 는 '로그인이 필요합니다'
  total := total + 1;
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin perform public.delete_dealer_post(v_other); e := null; exception when others then e := sqlstate; end;
  execute 'reset role';
  execute 'set local role authenticated';
  begin perform public.delete_dealer_post(v_other); m := null; exception when others then m := sqlerrm; end;
  execute 'reset role';
  if e = '42501' and m = '로그인이 필요합니다' and not (select deleted from public.dealer_posts where id = v_other) then out := out || 'N2 PASS; ';
  else fails := fails + 1; out := out || format('N2 FAIL anon=%s nouid=%s; ', e, m); end if;

  -- N3 (음성) 이미 지운 글은 다시 지우지 못한다(작성자·운영자 모두)
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.delete_dealer_post(v_own); e := null; exception when others then e := sqlstate; m := sqlerrm; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.delete_dealer_post(v_mod); n := 0; exception when others then n := case when sqlerrm = '이미 삭제된 글입니다' then 1 else 0 end; end;
  execute 'reset role';
  if e = 'P0001' and m = '이미 삭제된 글입니다' and n = 1 then out := out || 'N3 PASS; ';
  else fails := fails + 1; out := out || format('N3 FAIL author=%s/%s admin=%s; ', e, m, n); end if;

  -- R1 (음성) 운영자가 지운 글에 온 지원서(이름·연락처)를 작성자가 읽지 못한다 · 대조: 살아 있는 글의 지원서는 읽는다
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) filter (where post_id = v_mod), count(*) filter (where post_id = v_live) into n, n2
    from (select post_id from public.dealer_applications where post_id in (v_mod, v_live)) s;
  execute 'reset role';
  if n = 0 and n2 = 1 then out := out || 'R1 PASS; ';
  else fails := fails + 1; out := out || format('R1 FAIL mod_apps=%s live_apps=%s; ', n, n2); end if;

  -- R2 (음성) 작성자가 운영자 삭제를 되돌리지 못한다(직접 UPDATE)
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin update public.dealer_posts set deleted = false, deleted_at = null where id = v_mod; get diagnostics n = row_count;
  exception when others then n := -1; end;
  execute 'reset role';
  if n = 0 and (select deleted from public.dealer_posts where id = v_mod) then out := out || 'R2 PASS; ';
  else fails := fails + 1; out := out || format('R2 FAIL rows=%s now_deleted=%s; ', n, (select deleted from public.dealer_posts where id = v_mod)); end if;

  -- R3 (음성) 운영자가 지운 글(R2 시도 뒤)은 남(B)·비로그인 목록에 없다 · 대조: 살아 있는 글은 둘 다에게 보인다
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) filter (where id = v_mod) * 10 + count(*) filter (where id = v_live) into n
    from public.dealer_posts where deleted = false and id in (v_mod, v_live);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  select n * 100 + count(*) filter (where id = v_mod) * 10 + count(*) filter (where id = v_live) into n
    from public.dealer_posts where deleted = false and id in (v_mod, v_live);
  execute 'reset role';
  if n = 101 then out := out || 'R3 PASS; ';
  else fails := fails + 1; out := out || format('R3 FAIL b_dead*10+b_live=%s anon=%s; ', n / 100, n % 100); end if;

  -- R4 (음성) 작성자가 자기가 지운 글도 되살리지 못한다(직접 UPDATE) — S1 이 지운 글이라 S1 이 실패하면 함께 실패한다
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin update public.dealer_posts set deleted = false, deleted_at = null, content = 'ZZ-REH-1007d-own2' where id = v_own; get diagnostics n = row_count;
  exception when others then n := -1; end;
  execute 'reset role';
  if n = 0 and (select deleted from public.dealer_posts where id = v_own) then out := out || 'R4 PASS; ';
  else fails := fails + 1; out := out || format('R4 FAIL rows=%s now_deleted=%s; ', n, (select deleted from public.dealer_posts where id = v_own)); end if;

  raise exception using errcode = 'ZZ999',
    message = format('REHEARSAL %s %s/%s :: %s', case when fails = 0 then 'PASS' else 'FAIL' end, total - fails, total, out);
end $rehearsal$;
