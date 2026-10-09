-- 20261007c 라이브 롤백 리허설 — 마이그레이션 뒤에 이어 붙여 한 트랜잭션으로 보내고, 끝의 ZZ999 로 전부 되돌린다.
--   실행: node rehearse-geo.mjs supabase/migrations/20261007c_community_notify_like_dealer.sql supabase/tests/20261007c_rehearsal.sql
--   음성 대조(수정 전 FAIL): 마이그레이션 자리에 주석 한 줄짜리 파일을 넣고 같은 리허설을 돌리면 L1·D1·D2·D3 가 FAIL 이어야 한다.
-- 계정(2026-10-07 역할·소유 조회로 고름 — 매장 0개 일반 회원 3명, 전부 active · 좋아요 0 · 딜러 글 0):
--   A 708de904(글쓴이) · B 47360d8e(좋아요·지원) · C fd14c2dc(두 번째 사람). 값(이름·연락처)은 출력하지 않는다.
do $rehearsal$
declare
  v_a uuid := (select id from public.profiles where id::text like '708de904%');
  v_b uuid := (select id from public.profiles where id::text like '47360d8e%');
  v_c uuid := (select id from public.profiles where id::text like 'fd14c2dc%');
  v_post uuid; v_dp uuid; v_dp2 uuid;
  n int; j jsonb;
  total int := 0; fails int := 0; out text := '';
begin
  if v_a is null or v_b is null or v_c is null then raise exception '리허설 계정을 찾지 못했다'; end if;
  if (select count(*) from public.profiles where id in (v_a, v_b, v_c) and role = 'user'::public.user_role) <> 3 then
    raise exception '리허설 계정 역할이 예상과 다르다';
  end if;

  -- ── 준비: A 의 게시글 · A 의 딜러 구인글 2개(하나는 지운다) ──
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.community_posts(user_id, user_name, title, content, category)
    values (v_a, 'zz', 'ZZ-REH-1007c', 'ZZ 리허설 본문', 'free') returning id into v_post;
  insert into public.dealer_posts(author_id, kind, region, content)
    values (v_a, 'hiring', '서울', 'ZZ-REH-1007c 구인') returning id into v_dp;
  insert into public.dealer_posts(author_id, kind, region, content)
    values (v_a, 'hiring', '서울', 'ZZ-REH-1007c 구인2') returning id into v_dp2;
  execute 'reset role';
  -- ⚠ 작성자 권한의 소프트 삭제는 라이브에서 42501(dealer_posts_read 가 deleted 행을 못 보게 해 새 행 검사에 걸린다) — 리허설은 소유자 권한으로 지운다.
  update public.dealer_posts set deleted = true, deleted_at = now() where id = v_dp2;

  -- L1 (수정 전 FAIL) B 가 좋아요 → 취소 → 좋아요: '좋아요 두 번 = 취소' 는 그대로(좋아요 상태·수) + 알림은 1건
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.toggle_post_like(v_post);
  if (j->>'liked')::boolean is distinct from true then raise exception 'L1 준비 실패: 첫 좋아요 %', j; end if;
  j := public.toggle_post_like(v_post);
  if (j->>'liked')::boolean is distinct from false then raise exception 'L1 준비 실패: 취소 %', j; end if;
  j := public.toggle_post_like(v_post);
  execute 'reset role';
  select count(*) into n from public.notifications where user_id = v_a and link = '/posts/' || v_post;
  if n = 1 and (j->>'liked')::boolean and (j->>'count')::int = 1 then out := out || 'L1 PASS; ';
  else fails := fails + 1; out := out || format('L1 FAIL notif=%s toggle=%s; ', n, j); end if;

  -- L2 (양성) 다른 사람 C 의 좋아요는 따로 1건 — 사람이 다르면 막지 않는다
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.toggle_post_like(v_post);
  execute 'reset role';
  select count(*) into n from public.notifications where user_id = v_a and link = '/posts/' || v_post;
  if n = 2 and (j->>'count')::int = 2 then out := out || 'L2 PASS; ';
  else fails := fails + 1; out := out || format('L2 FAIL notif=%s toggle=%s; ', n, j); end if;

  -- L3 (종전 유지) 본인 좋아요는 알림 없음
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.toggle_post_like(v_post);
  execute 'reset role';
  select count(*) into n from public.notifications where user_id = v_a and link = '/posts/' || v_post;
  if n = 2 then out := out || 'L3 PASS; ';
  else fails := fails + 1; out := out || format('L3 FAIL notif=%s; ', n); end if;

  -- D1 (수정 전 FAIL) B 가 구인글에 지원 → 글쓴이 A 에게 1건(link /dealer · 거래성 · 연락처 미포함)
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.dealer_applications(post_id, applicant_id, applicant_name, phone, message)
    values (v_dp, v_b, 'ZZ지원자', '010-0000-0000', 'ZZ');
  execute 'reset role';
  select count(*) into n from public.notifications
   where user_id = v_a and link = '/dealer' and not is_ad and position('010-0000-0000' in message) = 0
     and position('ZZ지원자' in message) = 0 and position('ZZ지원자' in title) = 0;
  if n = 1 then out := out || 'D1 PASS; ';
  else fails := fails + 1; out := out || format('D1 FAIL notif=%s; ', n); end if;

  -- D2 (수정 전 FAIL) 같은 지원자가 같은 글에 또 내면 알림은 그대로 1건, 다른 지원자 C 는 2건째(양성)
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.dealer_applications(post_id, applicant_id, applicant_name, phone) values (v_dp, v_b, 'ZZ지원자', '010-0000-0000');
  execute 'reset role';
  select count(*) into n from public.notifications where user_id = v_a and link = '/dealer';
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.dealer_applications(post_id, applicant_id, applicant_name, phone) values (v_dp, v_c, 'ZZ지원자2', '010-0000-0001');
  execute 'reset role';
  if n = 1 and (select count(*) from public.notifications where user_id = v_a and link = '/dealer') = 2 then out := out || 'D2 PASS; ';
  else fails := fails + 1; out := out || format('D2 FAIL after_dup=%s; ', n); end if;

  -- D3 (음성) 지운 구인글 지원(정책상 들어가도) · 글쓴이 본인 지원은 알림 없음
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.dealer_applications(post_id, applicant_id, applicant_name, phone) values (v_dp2, v_b, 'ZZ지원자', '010-0000-0000');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.dealer_applications(post_id, applicant_id, applicant_name, phone) values (v_dp, v_a, 'ZZ본인', '010-0000-0002');
  execute 'reset role';
  select count(*) into n from public.notifications where user_id = v_a and link = '/dealer';
  if n = 2 and to_regprocedure('public.notify_on_dealer_application()') is not null then out := out || 'D3 PASS; ';
  else fails := fails + 1; out := out || format('D3 FAIL notif=%s fn=%s; ', n, to_regprocedure('public.notify_on_dealer_application()')); end if;

  -- P1 트리거 함수를 로그인 회원·비로그인이 직접 부를 수 없다
  total := total + 1;
  if to_regprocedure('public.notify_on_dealer_application()') is not null
     and not has_function_privilege('authenticated', 'public.notify_on_dealer_application()', 'execute')
     and not has_function_privilege('anon', 'public.notify_on_dealer_application()', 'execute')
     and not has_function_privilege('authenticated', 'public.notify_on_post_like()', 'execute') then out := out || 'P1 PASS; ';
  else fails := fails + 1; out := out || 'P1 FAIL; '; end if;

  raise exception using errcode = 'ZZ999',
    message = format('REHEARSAL %s %s/%s :: %s', case when fails = 0 then 'PASS' else 'FAIL' end, total - fails, total, out);
end $rehearsal$;
