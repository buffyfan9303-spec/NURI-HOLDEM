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
  v_d    uuid := (select id from public.profiles where id::text like '7f985240%');   -- 일반 회원(두 번째 신청인)
  v_adm2 uuid := (select id from public.profiles where id::text like 'c8e3734d%');   -- 운영자(글 작성자 역할로만 쓴다)
  v_post uuid; v_post2 uuid; v_rep uuid; v_td uuid; v_td2 uuid;
  v_post3 uuid; v_post4 uuid; v_rep4 uuid; v_rep4b uuid; v_rep4d uuid; v_rep5 uuid; v_td3 uuid; v_td4 uuid;
  j jsonb; j2 jsonb; n int; m int; k int;
  total int := 0; fails int := 0; out text := '';
  procedure_ok boolean;
begin
  if v_a is null or v_b is null or v_c is null or v_adm is null or v_d is null or v_adm2 is null then raise exception '리허설 계정을 찾지 못했다'; end if;
  if (select count(*) from public.profiles where id in (v_adm, v_adm2) and role = 'admin'::public.user_role) <> 2
     or (select count(*) from public.profiles where id in (v_a, v_b, v_c, v_d) and role = 'user'::public.user_role) <> 4 then
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

  -- X5 제3자(C)는 가린 글에 댓글을 못 단다 / 양성: 운영자(ADM2)는 단다
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin insert into public.comments(user_id, user_name, user_role, post_id, content) values (v_c, 'zz', 'user', v_post, 'ZZ 숨김 글 댓글'); n := 1;
  exception when others then n := 0; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin insert into public.comments(user_id, user_name, user_role, post_id, content) values (v_adm2, 'zz', 'admin', v_post, 'ZZ 운영자 댓글'); m := 1;
  exception when others then m := 0; end;
  execute 'reset role';
  if n = 0 and m = 1 then out := out || 'X5 PASS; '; else fails := fails + 1; out := out || format('X5 FAIL third=%s admin=%s; ', n, m); end if;

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
  if n = 2 and m = 1 and k = 2 and (select status from public.post_takedowns where id = v_td) = 'restored'
     and (select not blinded and blinded_source is null from public.community_posts where id = v_post)
     and public.post_takedown_notice(v_post) is null then out := out || 'P5 PASS; ';
  else fails := fails + 1; out := out || format('P5 FAIL notif=%s post=%s cmt=%s; ', n, m, k); end if;

  -- P6 직권(신청인 없음) — 통지 1건(작성자) · 삭제는 사유 필수 · 삭제하면 기록은 남고 글 칸은 비워진다
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  j := public.admin_takedown_post(v_post2, 'ZZ 명백한 사생활 침해', null);
  v_td2 := (j->>'id')::uuid;
  begin perform public.admin_decide_takedown(v_td2, 'remove', null); n := 1; exception when others then n := 0; end;
  j2 := public.admin_decide_takedown(v_td2, 'remove', 'ZZ 삭제 사유');
  -- 라이브엔 삭제 큐(20261006s2)가 아직 없다 → 건너뛰고 purge_queued = null 로 알린다(게이트로 멈추지 않는다)
  if (j->>'notified')::int = 1 and n = 0 and j2 ? 'purge_queued' and j2->'purge_queued' = 'null'::jsonb
     and to_regclass('public.storage_purge_queue') is null
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

  -- ── PR #196 반증 반영분 ───────────────────────────────────────────────────────────────────
  -- 준비: C 의 글3(관리자 숨김용) · ADM2 의 글4(권리침해 신고 경로용) — 둘 다 이 트랜잭션에서 첫 글이라 12초 제한에 안 걸린다
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  insert into public.community_posts(user_id, user_name, title, content, category)
    values (v_c, 'zz', 'ZZ-REH-1006t-3', 'ZZ 리허설 본문3', 'free') returning id into v_post3;
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm2, 'role', 'authenticated')::text, true);
  insert into public.community_posts(user_id, user_name, title, content, category)
    values (v_adm2, 'zz', 'ZZ-REH-1006t-4', 'ZZ 리허설 본문4', 'free') returning id into v_post4;
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  insert into public.reports(reporter_id, reporter_name, target_type, target_id, reason)
    values (v_c, 'zz', 'post', v_post4, '권리침해(명예훼손·사생활 침해 등) — ZZ 소명 4') returning id into v_rep4;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  insert into public.reports(reporter_id, reporter_name, target_type, target_id, reason)
    values (v_a, 'zz', 'post', v_post4, '욕설/비방 — ZZ') returning id into v_rep4b;
  perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
  insert into public.reports(reporter_id, reporter_name, target_type, target_id, reason)
    values (v_d, 'zz', 'post', v_post4, '권리침해(명예훼손·사생활 침해 등) — ZZ 소명 4d') returning id into v_rep4d;

  -- X3 (P1-1) 관리자 숨김 → 임시조치 → 다시 게시 → 관리자 숨김(출처 admin)이 그대로 + 통지에 '계속 가려집니다'
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  perform public.admin_set_post_blinded(v_post3, true);
  v_td3 := (public.admin_takedown_post(v_post3, 'ZZ 관리자 숨김 위 임시조치', null)->>'id')::uuid;
  perform public.admin_decide_takedown(v_td3, 'restore', null);
  if (select blinded and blinded_source = 'admin' from public.community_posts where id = v_post3)
     and (select prev_blinded and prev_blinded_source = 'admin' and status = 'restored' from public.post_takedowns where id = v_td3)
     and exists (select 1 from public.notifications where created_at = now() and user_id = v_c and title = '임시조치 검토 결과'
                    and message like '%임시조치를 해제하기로 했습니다%계속 가려집니다%') then
    out := out || 'X3 PASS; ';
  else fails := fails + 1; out := out || format('X3 FAIL post=%s; ', (select blinded::text || '/' || coalesce(blinded_source, 'null') from public.community_posts where id = v_post3)); end if;

  -- X4 (P3) 작성자(C)가 임시조치 중 글을 스스로 지우면 기록은 'author_deleted' 로 종결
  total := total + 1;
  v_td3 := (public.admin_takedown_post(v_post3, 'ZZ 두 번째 임시조치', null)->>'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  delete from public.community_posts where id = v_post3;
  get diagnostics n = row_count;
  execute 'reset role';
  if n = 1 and (select status = 'author_deleted' and post_id is null and decision_note = '작성자 삭제' from public.post_takedowns where id = v_td3) then
    out := out || 'X4 PASS; ';
  else fails := fails + 1; out := out || format('X4 FAIL deleted=%s status=%s; ', n, (select status from public.post_takedowns where id = v_td3)); end if;

  -- X6a (P2-1) 권리침해 신고는 옛 경로(결정 RPC 삭제·처리 완료·기각, 옛 기각 RPC, 블라인드 토글)를 서버가 거절
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  n := 0;
  begin perform public.admin_decide_report(v_rep4, 'delete', true, false, null, null); n := n + 1; exception when others then null; end;
  begin perform public.admin_decide_report(v_rep4, 'resolve', true, false, null, null); n := n + 1; exception when others then null; end;
  begin perform public.admin_decide_report(v_rep4, 'dismiss', true, false, null, null); n := n + 1; exception when others then null; end;
  begin perform public.admin_dismiss_report(v_rep4); n := n + 1; exception when others then null; end;
  begin perform public.admin_set_post_blinded(v_post4, true); n := n + 1; exception when others then null; end;
  if n = 0 and (select status from public.reports where id = v_rep4) = 'open'
     and exists (select 1 from public.community_posts where id = v_post4 and not blinded) then out := out || 'X6a PASS; ';
  else fails := fails + 1; out := out || format('X6a FAIL passed=%s; ', n); end if;

  -- X6b 일반 신고(욕설)를 '같은 대상 함께'로 처리해도 권리침해 신고 2건은 열린 채 남는다
  total := total + 1;
  perform public.admin_decide_report(v_rep4b, 'resolve', true, false, null, null);
  if (select status from public.reports where id = v_rep4b) = 'resolved'
     and (select count(*) from public.reports where id in (v_rep4, v_rep4d) and status = 'open') = 2 then out := out || 'X6b PASS; ';
  else fails := fails + 1; out := out || 'X6b FAIL; '; end if;

  -- X6c 임시조치는 같은 글의 권리침해 신고를 모두 닫고 신청인 전원(C·D) + 작성자(ADM2)에게 알린다
  total := total + 1;
  j := public.admin_takedown_post(v_post4, 'ZZ 신청인 둘', v_rep4);
  v_td4 := (j->>'id')::uuid;
  select count(*) into n from public.notifications where created_at = now()
     and ((user_id = v_adm2 and title = '게시물 임시조치 안내' and message like '%권리침해 신고로%')
          or (user_id in (v_c, v_d) and title = '권리침해 신고 처리 안내'));
  if (j->>'notified')::int = 3 and n = 3
     and (select count(*) from public.reports where id in (v_rep4, v_rep4d) and status = 'resolved') = 2
     and (select other_requesters = array[v_d] and requester_id = v_c from public.post_takedowns where id = v_td4) then out := out || 'X6c PASS; ';
  else fails := fails + 1; out := out || format('X6c FAIL notified=%s n=%s; ', j->>'notified', n); end if;

  -- X6d 요청 기각: 운영자만 · 권리침해 신고만 · 사유 필수 · 신청인에게 알림 · 글은 그대로
  total := total + 1;
  insert into public.reports(reporter_id, reporter_name, target_type, target_id, reason)
    values (v_adm, 'zz', 'post', v_post, '권리침해(명예훼손·사생활 침해 등) — ZZ 기각용') returning id into v_rep5;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  begin perform public.admin_reject_rights_request(v_rep5, 'ZZ'); n := 1; exception when others then n := 0; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  begin perform public.admin_reject_rights_request(v_rep5, ''); m := 1; exception when others then m := 0; end;
  begin perform public.admin_reject_rights_request(v_rep4b, 'ZZ 일반 신고'); k := 1; exception when others then k := 0; end;
  perform public.admin_reject_rights_request(v_rep5, 'ZZ 침해로 보기 어려움');
  if n = 0 and m = 0 and k = 0 and (select status from public.reports where id = v_rep5) = 'dismissed'
     and exists (select 1 from public.notifications where created_at = now() and user_id = v_adm and title = '권리침해 신고 처리 결과'
                    and message like '%그대로 둡니다%')
     and (select not blinded from public.community_posts where id = v_post) then out := out || 'X6d PASS; ';
  else fails := fails + 1; out := out || format('X6d FAIL nonadmin=%s nonote=%s nonrights=%s; ', n, m, k); end if;

  -- X8 (P2-2) 기간 만료 통지 — 자동 공개·삭제 없음 · 작성자·신청인 전원 + 관리자 전원 · 두 번째 실행은 0건
  total := total + 1;
  update public.post_takedowns set created_at = now() - interval '31 days', ends_at = now() - interval '1 day' where id = v_td4;
  n := public.cron_takedown_expiry();
  select count(*) into m from public.notifications where created_at = now() and title = '임시조치 기간 만료 안내' and user_id in (v_c, v_d, v_adm2);
  select count(*) into k from public.notifications where created_at = now() and title = '임시조치 기간 만료 — 판단 필요';
  if n = 1 and m = 3 and k = (select count(*) from public.profiles where role = 'admin'::public.user_role)
     and public.cron_takedown_expiry() = 0
     and (select blinded and blinded_source = 'takedown' from public.community_posts where id = v_post4)
     and (select status = 'active' and expiry_notified_at is not null from public.post_takedowns where id = v_td4)
     and exists (select 1 from cron.job where jobname = 'takedown-expiry' and schedule = '0 1 * * *') then out := out || 'X8 PASS; ';
  else fails := fails + 1; out := out || format('X8 FAIL first=%s parties=%s admins=%s; ', n, m, k); end if;

  -- X10 (P2-3) '삭제' 종결이면 그 글의 community_images 객체가 삭제 큐로 간다(큐는 20261006s2 와 같은 모양으로 여기서만 만든다)
  total := total + 1;
  create table if not exists public.storage_purge_queue (
    id bigserial primary key, bucket_id text not null, name text not null, reason text not null,
    created_at timestamptz not null default now(), attempts int not null default 0, last_error text, done_at timestamptz,
    unique (bucket_id, name));
  insert into storage.objects(bucket_id, name, owner, metadata) values ('community_images', 'zz-reh-1006t/a.webp', v_adm2, '{"size":1}');
  update public.community_posts set images = array[
      'https://idsxiqspecrucvfvtgbw.supabase.co/storage/v1/object/public/community_images/zz-reh-1006t/a.webp?width=400',
      'https://example.com/not-ours.webp'] where id = v_post4;
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  j := public.admin_decide_takedown(v_td4, 'remove', 'ZZ 사생활 사진');
  if (j->>'purge_queued')::int = 1
     and exists (select 1 from public.storage_purge_queue where bucket_id = 'community_images' and name = 'zz-reh-1006t/a.webp' and reason = 'takedown_remove')
     and not exists (select 1 from public.community_posts where id = v_post4)
     and (select status from public.post_takedowns where id = v_td4) = 'removed' then out := out || 'X10 PASS; ';
  else fails := fails + 1; out := out || format('X10 FAIL %s; ', j); end if;

  -- X9 (P3) 비로그인 숨김 판정 함수가 없다(존재 노출 제거) — 판정은 정책 안의 EXISTS 뿐
  total := total + 1;
  if to_regprocedure('public.post_hidden_from_me(uuid)') is null then out := out || 'X9 PASS; ';
  else fails := fails + 1; out := out || 'X9 FAIL; '; end if;

  raise exception using errcode = 'ZZ999',
    message = format('REHEARSAL %s %s/%s :: %s', case when fails = 0 then 'PASS' else 'FAIL' end, total - fails, total, out);
end $rehearsal$;
