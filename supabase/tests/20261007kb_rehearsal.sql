-- 20261007kb 라이브 롤백 리허설 — 마이그레이션 뒤에 이어 붙여 한 트랜잭션으로 보내고, 끝의 ZZ999 로 전부 되돌린다.
--   실행: node rehearse-geo.mjs supabase/migrations/20261007kb_kakao_unlink_queue.sql supabase/tests/20261007kb_rehearsal.sql
--   음성 대조: 마이그레이션 자리에 set_config 한 줄뿐인 파일 → U1 FAIL(탈퇴해도 카카오 회원번호가 어디에도 남지 않는다 — critical-211 P2-1 그대로).
--   계정은 전부 이 리허설이 만든다(고정 UUID — 탈퇴가 이메일을 'withdrawn_<uuid 앞 12자>@deleted.invalid' 로 바꾸므로 앞 12자를 서로 다르게). 크론의 net.http_post 는 큐에 재시도 행이 없을 때만 부른다 — C1 은 그 전에 돈다(외부 호출 0).
-- 검사
--   C1 크론: 1시간 지난 done 행은 지우고, 재시도 행이 없으면 엣지를 부르지 않는다
--   U1 본인 탈퇴(withdraw_my_account) — 앱이 엣지를 못 불렀어도 identity 삭제 트리거가 회원번호를 큐에 남긴다(재시도 대상)   ← 음성 대조로 FAIL
--   U2 엣지가 직전에 끊은 회원(done) — 관리자 탈퇴(admin_withdraw_user) 뒤에도 done 그대로(두 번 끊지 않는다)
--   U3 엣지가 직전에 실패한 회원 — 탈퇴 뒤에도 재시도 행 그대로(attempts 1 유지, 트리거가 0 으로 덮지 않는다)
--   U4 오래된 done(10분 넘음) — 다시 연결됐다 지워지면 재시도 행으로 되살린다
--   U5 카카오가 아닌 회원 탈퇴 — 큐에 아무것도 안 남는다(no-op)
--   U6 클라이언트(authenticated)는 큐를 읽지도, 기록 함수를 부르지도 못한다(42501)
--   U7 GoTrue 역할(supabase_auth_admin)로 identity 를 지워도 트리거가 큐에 남긴다(역할 전환이 막히면 SKIP 으로 적는다)
do $rehearsal$
declare
  c_k1 uuid := 'b1070001-0000-4000-8000-0000002107b1';
  c_k2 uuid := 'b1070002-0000-4000-8000-0000002107b2';
  c_k3 uuid := 'b1070003-0000-4000-8000-0000002107b3';
  c_k4 uuid := 'b1070004-0000-4000-8000-0000002107b4';
  c_k5 uuid := 'b1070005-0000-4000-8000-0000002107b5';
  c_e  uuid := 'b107000e-0000-4000-8000-0000002107be';
  c_ad uuid := 'b107000f-0000-4000-8000-0000002107bf';
  q record; e text; n int;
  total int := 0; fails int := 0; out text := '';
  u uuid; pid text;
begin
  -- 회원 만들기: 카카오 5명(identity 포함) · 이메일 1명 · 관리자 1명
  foreach u in array array[c_k1, c_k2, c_k3, c_k4, c_k5] loop
    pid := '999080' || substr(u::text, 8, 1);   -- 9990801 … 9990805 (b107000N 의 N)
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null,
            jsonb_build_object('iss', 'https://kauth.kakao.com', 'sub', pid, 'provider_id', pid, 'name', '리허설kb' || right(u::text, 2)),
            '{"provider":"kakao","providers":["kakao"]}'::jsonb, now(), now());
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (pid, u, jsonb_build_object('sub', pid, 'iss', 'https://kauth.kakao.com'), 'kakao', now(), now(), now());
  end loop;
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (c_e, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rehearsal-e-20261007kb@example.invalid',
          jsonb_build_object('nickname', '리허설이메일kb', 'agreed_to_terms', true), '{"provider":"email","providers":["email"]}'::jsonb, now(), now());
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (c_e::text, c_e, jsonb_build_object('sub', c_e::text, 'email', 'rehearsal-e-20261007kb@example.invalid'), 'email', now(), now(), now());
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (c_ad, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rehearsal-ad-20261007kb@example.invalid',
          jsonb_build_object('nickname', '리허설관리kb'), '{"provider":"email","providers":["email"]}'::jsonb, now(), now());
  update public.profiles set role = 'admin' where id = c_ad;

  -- C1: 크론 정리(재시도 행이 없는 상태)
  total := total + 1;
  insert into public.kakao_unlink_queue (provider_id, source, done_at) values ('9990899', 'edge', now() - interval '2 hours');
  perform public.cron_kakao_unlink();
  if not exists (select 1 from public.kakao_unlink_queue where provider_id = '9990899') then out := out || 'C1 PASS; ';
  else fails := fails + 1; out := out || 'C1 FAIL old done row kept; '; end if;

  -- U1: 본인 탈퇴 — 엣지 호출 없음
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', c_k1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.withdraw_my_account(); e := null; exception when others then e := sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  select * into q from public.kakao_unlink_queue where provider_id = '9990801';
  if e is null and q.provider_id is not null and q.done_at is null and q.attempts = 0 and q.source = 'identity_deleted'
     and not exists (select 1 from auth.identities where user_id = c_k1) then out := out || 'U1 PASS; ';
  else fails := fails + 1; out := out || format('U1 FAIL err=%s row=%s; ', e, q); end if;

  -- U2: 엣지 성공(done) → 관리자 탈퇴
  total := total + 1;
  perform public.kakao_unlink_record('9990802', c_k2, true, 200);
  perform set_config('request.jwt.claims', json_build_object('sub', c_ad, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.admin_withdraw_user(c_k2, '리허설 강제 탈퇴'); e := null; exception when others then e := sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  select * into q from public.kakao_unlink_queue where provider_id = '9990802';
  if e is null and q.done_at is not null and q.source = 'edge' and not exists (select 1 from auth.identities where user_id = c_k2) then out := out || 'U2 PASS; ';
  else fails := fails + 1; out := out || format('U2 FAIL err=%s row=%s; ', e, q); end if;

  -- U3: 엣지 실패 → 본인 탈퇴
  total := total + 1;
  perform public.kakao_unlink_record('9990803', c_k3, false, 500);
  perform set_config('request.jwt.claims', json_build_object('sub', c_k3, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.withdraw_my_account(); e := null; exception when others then e := sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  select * into q from public.kakao_unlink_queue where provider_id = '9990803';
  if e is null and q.done_at is null and q.attempts = 1 and q.last_status = 500 then out := out || 'U3 PASS; ';
  else fails := fails + 1; out := out || format('U3 FAIL err=%s row=%s; ', e, q); end if;

  -- U4: 오래된 done → identity 삭제 시 재시도 행으로
  total := total + 1;
  insert into public.kakao_unlink_queue (provider_id, user_id, source, done_at) values ('9990804', c_k4, 'edge', now() - interval '30 minutes');
  delete from auth.identities where user_id = c_k4 and provider = 'kakao';
  select * into q from public.kakao_unlink_queue where provider_id = '9990804';
  if q.done_at is null and q.attempts = 0 and q.source = 'identity_deleted' then out := out || 'U4 PASS; ';
  else fails := fails + 1; out := out || format('U4 FAIL row=%s; ', q); end if;

  -- U5: 이메일 회원 탈퇴 — no-op
  total := total + 1;
  select count(*) into n from public.kakao_unlink_queue;
  perform set_config('request.jwt.claims', json_build_object('sub', c_e, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.withdraw_my_account(); e := null; exception when others then e := sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  if e is null and (select count(*) from public.kakao_unlink_queue) = n
     and not exists (select 1 from auth.identities where user_id = c_e) then out := out || 'U5 PASS; ';
  else fails := fails + 1; out := out || format('U5 FAIL err=%s; ', e); end if;

  -- U6: 클라이언트 차단
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', c_k5, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform count(*) from public.kakao_unlink_queue; e := null; exception when others then e := sqlstate; end;
  begin perform public.kakao_unlink_record('9990805', c_k5, true, 200); pid := null; exception when others then pid := sqlstate; end;
  execute 'reset role';
  if e = '42501' and pid = '42501' and not exists (select 1 from public.kakao_unlink_queue where provider_id = '9990805') then out := out || 'U6 PASS; ';
  else fails := fails + 1; out := out || format('U6 FAIL select=%s record=%s; ', e, pid); end if;

  -- U7: GoTrue 역할로 삭제
  total := total + 1;
  begin
    execute 'set local role supabase_auth_admin';
    delete from auth.identities where user_id = c_k5 and provider = 'kakao';
    execute 'reset role';
    e := null;
  exception when others then e := sqlstate || ' ' || sqlerrm; end;
  if e is not null and e like '42501%' and position('supabase_auth_admin' in e) > 0 then
    out := out || 'U7 SKIP(역할 전환 불가); ';
  elsif e is null and exists (select 1 from public.kakao_unlink_queue where provider_id = '9990805' and done_at is null) then out := out || 'U7 PASS; ';
  else fails := fails + 1; out := out || format('U7 FAIL err=%s; ', e); end if;

  perform set_config('request.jwt.claims', '', true);
  raise exception using errcode = 'ZZ999',
    message = format('REHEARSAL %s %s/%s :: %s', case when fails = 0 then 'PASS' else 'FAIL' end, total - fails, total, out);
end $rehearsal$;
