-- 20261006t 라이브 롤백 리허설 — 마이그레이션 뒤에 이어 붙여 한 트랜잭션으로 보내고, 끝의 ZZ999 로 전부 되돌린다.
--   실행: node rehearse-geo.mjs <r0_timeouts.sql + 20261006t_post_takedown.sql> supabase/tests/20261006t_rehearsal.sql
-- 계정(2026-10-06 역할·소유 조회로 고름 — 매장 0개 일반 회원 3명 · 매장 0개 운영자 1명):
--   A 708de904(작성자) · B 47360d8e(신청인) · C fd14c2dc(제3자) · ADM f5d305f2(운영자). 값(이름·연락처)은 출력하지 않는다.
-- 음성: 일반 회원·비로그인이 임시조치/판단 불가 · 가린 글 본문·댓글 비공개(제3자·비로그인 0행) · 기록 표 비공개 · 남의 이의제기 불가 · 블라인드 토글 우회 불가
-- 양성: 관리자 임시조치 · 통지 2건(작성자·신청인) · 작성자는 글·댓글·사유를 본다 · 이의제기 → 운영자 알림 · 다시 게시 → 다시 보임 + 결과 통지 2건
--       · 직권(신청인 없음) 통지 1건 · 삭제 판단은 사유 필수 · 숨김 아닌 글의 댓글은 제3자에게 그대로 보인다
do $rehearsal$
declare
  v_a   uuid := (select id from public.profiles where id::text like '708de904%');
  v_b   uuid := (select id from public.profiles where id::text like '47360d8e%');
  v_c   uuid := (select id from public.profiles where id::text like 'fd14c2dc%');
  v_adm uuid := (select id from public.profiles where id::text like 'f5d305f2%');
  v_post uuid; v_post2 uuid; v_rep uuid; v_td uuid; v_td2 uuid;
  j jsonb; n int; m int; k int;
  total int := 0; fails int := 0; out text := '';
  procedure_ok boolean;
begin
  if v_a is null or v_b is null or v_c is null or v_adm is null then raise exception '리허설 계정을 찾지 못했다'; end if;
  if (select role from public.profiles where id = v_adm) is distinct from 'admin'::public.user_role
     or (select count(*) from public.profiles where id in (v_a, v_b, v_c) and role = 'user'::public.user_role) <> 3 then
    raise exception '리허설 계정 역할이 예상과 다르다';
  end if;

  -- ── 준비: A 의 글 + A 의 댓글 / B 의 권리침해 신고 / B 의 다른 글 + B 의 댓글(양성 대조) ──
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  insert into public.community_posts(user_id, user_name, title, content, category)
    values (v_a, 'zz', 'ZZ-REH-1006t', 'ZZ 리허설 본문', 'free') returning id into v_post;
  insert into public.comments(user_id, user_name, user_role, post_id, content) values (v_a, 'zz', 'user', v_post, 'ZZ 작성자 댓글');
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  insert into public.reports(reporter_id, reporter_name, target_type, target_id, reason)
    values (v_b, 'zz', 'post', v_post, '권리침해(명예훼손·사생활 침해 등) — ZZ 소명') returning id into v_rep;
  insert into public.community_posts(user_id, user_name, title, content, category)
    values (v_b, 'zz', 'ZZ-REH-1006t-2', 'ZZ 리허설 본문2', 'free') returning id into v_post2;
  insert into public.comments(user_id, user_name, user_role, post_id, content) values (v_b, 'zz', 'user', v_post2, 'ZZ 댓글2');

  -- N1 일반 회원(B)·비로그인은 임시조치 불가
  total := total + 1;
  begin
    perform public.admin_takedown_post(v_post, 'ZZ 사유', v_rep);
    fails := fails + 1; out := out || 'N1 FAIL(회원 통과); ';
  exception when others then
    begin
      perform set_config('request.jwt.claims', '', true);
      perform public.admin_takedown_post(v_post, 'ZZ 사유', v_rep);
      fails := fails + 1; out := out || 'N1 FAIL(비로그인 통과); ';
    exception when others then out := out || 'N1 PASS; ';
    end;
  end;

  -- P1 관리자 임시조치 + 통지 2건 + 신고 처리 완료 + 30일
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  j := public.admin_takedown_post(v_post, 'ZZ 명예훼손 주장 — 소명 검토', v_rep);
  v_td := (j->>'id')::uuid;
  select count(*) into n from public.notifications
   where created_at = now() and ((user_id = v_a and title = '게시물 임시조치 안내') or (user_id = v_b and title = '권리침해 신고 처리 안내'));
  if (j->>'notified')::int = 2 and n = 2
     and (select blinded and blinded_source = 'takedown' from public.community_posts where id = v_post)
     and (select status from public.reports where id = v_rep) = 'resolved'
     and (select ends_at = created_at + interval '30 days' from public.post_takedowns where id = v_td)
     and (select message like '%고객센터(ace@nuriholdem.com)%' from public.notifications where created_at = now() and user_id = v_a and title = '게시물 임시조치 안내') then
    out := out || 'P1 PASS; ';
  else fails := fails + 1; out := out || format('P1 FAIL notified=%s n=%s; ', j->>'notified', n); end if;

  -- P1b 같은 글 두 번째 임시조치는 거절
  total := total + 1;
  begin perform public.admin_takedown_post(v_post, 'ZZ 두 번째', null); fails := fails + 1; out := out || 'P1b FAIL; ';
  exception when others then out := out || 'P1b PASS; '; end;

  -- N2 제3자(C)·비로그인: 글 0 · 댓글 0 · 기록 0(비로그인은 표 권한 자체가 없다)
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.community_posts where id = v_post;
  select count(*) into m from public.comments where post_id = v_post;
  select count(*) into k from public.post_takedowns;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  declare an int; am int; v_at text := 'denied';
  begin
    select count(*) into an from public.community_posts where id = v_post;
    select count(*) into am from public.comments where post_id = v_post;
    begin perform 1 from public.post_takedowns limit 1; v_at := 'open'; exception when insufficient_privilege then v_at := 'denied'; end;
    execute 'reset role';
    if n = 0 and m = 0 and k = 0 and an = 0 and am = 0 and v_at = 'denied' then out := out || 'N2 PASS; ';
    else fails := fails + 1; out := out || format('N2 FAIL c_post=%s c_cmt=%s c_td=%s anon_post=%s anon_cmt=%s anon_td=%s; ', n, m, k, an, am, v_at); end if;
  end;

  -- P2 작성자(A)는 글·댓글을 보고, 안내에 사유가 있다 / 제3자 안내엔 사유가 없다 / 비로그인도 안내를 받는다
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.community_posts where id = v_post;
  select count(*) into m from public.comments where post_id = v_post;
  execute 'reset role';
  j := public.post_takedown_notice(v_post);
  procedure_ok := n = 1 and m = 1 and (j->>'mine')::boolean and j ? 'reason' and j->>'status' = 'active';
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  j := public.post_takedown_notice(v_post);
  procedure_ok := procedure_ok and not (j->>'mine')::boolean and not (j ? 'reason') and not (j ? 'objection_at') and j->>'status' = 'active';
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  j := public.post_takedown_notice(v_post);
  execute 'reset role';
  procedure_ok := procedure_ok and j is not null and not (j ? 'reason');
  if procedure_ok then out := out || 'P2 PASS; '; else fails := fails + 1; out := out || format('P2 FAIL a_post=%s a_cmt=%s; ', n, m); end if;

  -- P3 양성 대조: 숨김 아닌 글(B 의 글2)의 댓글은 제3자에게 그대로 보인다
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.community_posts where id = v_post2;
  select count(*) into m from public.comments where post_id = v_post2;
  execute 'reset role';
  if n = 1 and m = 1 then out := out || 'P3 PASS; '; else fails := fails + 1; out := out || format('P3 FAIL post=%s cmt=%s; ', n, m); end if;

  -- N3 남(C)·비로그인은 다시 게시 요청 불가
  total := total + 1;
  begin
    perform public.request_post_takedown_review(v_post, 'ZZ 남의 요청입니다');
    fails := fails + 1; out := out || 'N3 FAIL(제3자 통과); ';
  exception when others then
    begin
      perform set_config('request.jwt.claims', '', true);
      perform public.request_post_takedown_review(v_post, 'ZZ 비로그인 요청');
      fails := fails + 1; out := out || 'N3 FAIL(비로그인 통과); ';
    exception when others then out := out || 'N3 PASS; ';
    end;
  end;

  -- P4 작성자 이의제기 → 운영자 전원 알림 · 두 번째는 거절
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  perform public.request_post_takedown_review(v_post, 'ZZ 사실에 근거한 후기입니다');
  select count(*) into n from public.notifications where created_at = now() and title = '임시조치 다시 게시 요청';
  begin perform public.request_post_takedown_review(v_post, 'ZZ 두 번째 요청'); m := 1;
  exception when others then m := 0; end;
  if n = (select count(*) from public.profiles where role = 'admin'::public.user_role) and n > 0 and m = 0
     and (select objection_at is not null from public.post_takedowns where id = v_td) then out := out || 'P4 PASS; ';
  else fails := fails + 1; out := out || format('P4 FAIL admin_notif=%s second=%s; ', n, m); end if;

  -- N4 관리자 블라인드 토글로 임시조치를 풀 수 없다
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  begin perform public.admin_set_post_blinded(v_post, false); n := 1; exception when others then n := 0; end;
  if n = 0 and (select blinded and blinded_source = 'takedown' from public.community_posts where id = v_post) then out := out || 'N4 PASS; ';
  else fails := fails + 1; out := out || 'N4 FAIL; '; end if;

  -- N5 일반 회원(B)은 판단 불가
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  begin perform public.admin_decide_takedown(v_td, 'restore', null); fails := fails + 1; out := out || 'N5 FAIL; ';
  exception when others then out := out || 'N5 PASS; '; end;

  -- P5 관리자 다시 게시 → 글이 다시 보이고 결과 통지 2건
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  perform public.admin_decide_takedown(v_td, 'restore', null);
  select count(*) into n from public.notifications
   where created_at = now() and ((user_id = v_a and title = '임시조치 검토 결과') or (user_id = v_b and title = '권리침해 신고 처리 결과'));
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into m from public.community_posts where id = v_post;
  select count(*) into k from public.comments where post_id = v_post;
  execute 'reset role';
  if n = 2 and m = 1 and k = 1 and (select status from public.post_takedowns where id = v_td) = 'restored'
     and public.post_takedown_notice(v_post) is null then out := out || 'P5 PASS; ';
  else fails := fails + 1; out := out || format('P5 FAIL notif=%s post=%s cmt=%s; ', n, m, k); end if;

  -- P6 직권(신청인 없음) — 통지 1건(작성자) · 삭제는 사유 필수 · 삭제하면 기록은 남고 글 칸은 비워진다
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  j := public.admin_takedown_post(v_post2, 'ZZ 명백한 사생활 침해', null);
  v_td2 := (j->>'id')::uuid;
  begin perform public.admin_decide_takedown(v_td2, 'remove', null); n := 1; exception when others then n := 0; end;
  perform public.admin_decide_takedown(v_td2, 'remove', 'ZZ 삭제 사유');
  if (j->>'notified')::int = 1 and n = 0
     and not exists (select 1 from public.community_posts where id = v_post2)
     and (select status = 'removed' and post_id is null and requester_id is null and post_title = 'ZZ-REH-1006t-2' from public.post_takedowns where id = v_td2) then
    out := out || 'P6 PASS; ';
  else fails := fails + 1; out := out || format('P6 FAIL notified=%s nonote=%s; ', j->>'notified', n); end if;

  -- P7 관리자는 기록 표를 읽는다(정책 양성 대조) / N6 30일 넘는 기간은 표가 거절
  total := total + 1;
  execute 'set local role authenticated';
  select count(*) into n from public.post_takedowns where id in (v_td, v_td2);
  execute 'reset role';
  begin
    insert into public.post_takedowns(post_id, author_id, reason, ends_at, created_at) values (null, v_a, 'ZZ', now() + interval '31 days', now());
    m := 1;
  exception when check_violation then m := 0; end;
  if n = 2 and m = 0 then out := out || 'P7 PASS; '; else fails := fails + 1; out := out || format('P7 FAIL admin_rows=%s over30=%s; ', n, m); end if;

  raise exception using errcode = 'ZZ999',
    message = format('REHEARSAL %s %s/%s :: %s', case when fails = 0 then 'PASS' else 'FAIL' end, total - fails, total, out);
end $rehearsal$;
