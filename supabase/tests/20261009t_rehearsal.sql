-- 20261009t 라이브 롤백 리허설(초안 · store-team 2026-10-09). 실행(리드):
--   node <Documents>/누리홀덤_영상분석_0930/open-reset-1008/rehearse.mjs <저장소>/supabase/migrations/20261009t_client_errors_rate_guard.sql <저장소>/supabase/tests/20261009t_rehearsal.sql
-- 본문만 있다(begin/commit 없음) — rehearse.mjs 가 끝에 raise 를 붙여 통째로 되돌린다. 달러 태그는 글자만.
-- 실제 역할로 정책을 태운다(set local role anon / authenticated + request.jwt.claims). 하나라도 FAIL 이면 이 블록이 먼저 예외로 멈춘다.
-- 음성 대조: 마이그레이션 없이 이 파일만 돌리면 T2·T3·T4·T6·T7 이 FAIL(삽입이 통과)이어야 한다 — 라이브는 지금 그렇다.
-- 시험 계정(2026-10-09 읽기 전용 조회): 일반 회원 708de904(role user) · 관리자 c8e3734d(role admin, 누리홀덤) · 남의 id 로 업주 7e435684.
do $trehearsal$
declare
  c_user constant uuid := '708de904-913e-4082-8803-8a2766b342f9';
  c_other constant uuid := '7e435684-2c8c-458d-985c-31b784a44893';
  c_admin constant uuid := 'c8e3734d-028d-4b69-86c9-a6d75c36601c';
  c_msg constant text := '20261009t-rehearsal';
  total int := 0; fails int := 0; out text := ''; ok int; ng int; i int; n int;
begin
  if (select role::text from public.profiles where id = c_user) is distinct from 'user'
     or (select role::text from public.profiles where id = c_admin) is distinct from 'admin' then
    raise exception 'T 전제 불일치 — 시험 계정을 다시 고르세요';
  end if;

  -- T1 양성(비로그인 · 앱 모양: user_id 없음/NULL + 네 칸) → 통과
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', '', true);
    set local role anon;
    insert into public.client_errors (user_id, message, stack, url, user_agent) values (null, c_msg || '-T1', 's', 'https://nuriholdem.com/', 'ua');
    reset role;
    out := out || 'T1 PASS; ';
  exception when others then
    reset role; fails := fails + 1; out := out || 'T1 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- T2 음성(비로그인 · 임의 user_id) → 막힘(42501 RLS)
  total := total + 1;
  begin
    set local role anon;
    insert into public.client_errors (user_id, message) values (gen_random_uuid(), c_msg || '-T2');
    reset role;
    fails := fails + 1; out := out || 'T2 FAIL 통과됨; ';
  exception when others then
    reset role;
    if sqlstate = '42501' then out := out || 'T2 PASS; ';
    else fails := fails + 1; out := out || 'T2 FAIL ' || sqlstate || ' ' || sqlerrm || '; '; end if;
  end;

  -- T3 음성(비로그인 · created_at 지정) → 막힘(42501 칸 권한)
  total := total + 1;
  begin
    set local role anon;
    insert into public.client_errors (message, created_at) values (c_msg || '-T3', '2000-01-01');
    reset role;
    fails := fails + 1; out := out || 'T3 FAIL 통과됨; ';
  exception when others then
    reset role;
    if sqlstate = '42501' then out := out || 'T3 PASS; ';
    else fails := fails + 1; out := out || 'T3 FAIL ' || sqlstate || ' ' || sqlerrm || '; '; end if;
  end;

  -- T4 음성(비로그인 · id 지정) → 막힘(42501 칸 권한)
  total := total + 1;
  begin
    set local role anon;
    insert into public.client_errors (id, message) values (gen_random_uuid(), c_msg || '-T4');
    reset role;
    fails := fails + 1; out := out || 'T4 FAIL 통과됨; ';
  exception when others then
    reset role;
    if sqlstate = '42501' then out := out || 'T4 PASS; ';
    else fails := fails + 1; out := out || 'T4 FAIL ' || sqlstate || ' ' || sqlerrm || '; '; end if;
  end;

  -- T5 양성(회원 · 자기 user_id — 앱 모양) → 통과
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', c_user, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into public.client_errors (user_id, message, stack, url, user_agent) values (c_user, c_msg || '-T5', null, 'https://nuriholdem.com/', 'ua');
    reset role;
    out := out || 'T5 PASS; ';
  exception when others then
    reset role; fails := fails + 1; out := out || 'T5 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- T6 음성(회원 · 남의 user_id) → 막힘
  total := total + 1;
  begin
    set local role authenticated;
    insert into public.client_errors (user_id, message) values (c_other, c_msg || '-T6');
    reset role;
    fails := fails + 1; out := out || 'T6 FAIL 통과됨; ';
  exception when others then
    reset role;
    if sqlstate = '42501' then out := out || 'T6 PASS; ';
    else fails := fails + 1; out := out || 'T6 FAIL ' || sqlstate || ' ' || sqlerrm || '; '; end if;
  end;

  -- T7 음성(회원 · user_id NULL 로 비로그인 몫 60 에 숨기) → 막힘
  total := total + 1;
  begin
    set local role authenticated;
    insert into public.client_errors (user_id, message) values (null, c_msg || '-T7');
    reset role;
    fails := fails + 1; out := out || 'T7 FAIL 통과됨; ';
  exception when others then
    reset role;
    if sqlstate = '42501' then out := out || 'T7 PASS; ';
    else fails := fails + 1; out := out || 'T7 FAIL ' || sqlstate || ' ' || sqlerrm || '; '; end if;
  end;

  -- T8 속도 제한이 여전히 듣는다(비로그인 80건 → 최소 20건 막힘 · 통과 ≤ 60). 같은 트랜잭션이라 now() 가 같아 전부 '최근 1분'이다.
  total := total + 1;
  ok := 0; ng := 0;
  perform set_config('request.jwt.claims', '', true);
  for i in 1..80 loop
    begin
      set local role anon;
      insert into public.client_errors (message) values (c_msg || '-T8');
      reset role; ok := ok + 1;
    exception when others then reset role; ng := ng + 1;
    end;
  end loop;
  if ok <= 60 and ng >= 20 then out := out || format('T8 PASS(통과 %s 막힘 %s); ', ok, ng);
  else fails := fails + 1; out := out || format('T8 FAIL 통과 %s 막힘 %s; ', ok, ng); end if;

  -- T9 양성(관리자 읽기 경로 불변) → 방금 넣은 행이 관리자에게 보인다. 칸은 서버 기본값(created_at = now())
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.client_errors where message like c_msg || '%' and created_at = now();
    reset role;
    if n >= 2 then out := out || format('T9 PASS(%s행); ', n); else fails := fails + 1; out := out || format('T9 FAIL %s행; ', n); end if;
  exception when others then
    reset role; fails := fails + 1; out := out || 'T9 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  perform set_config('request.jwt.claims', '', true);
  out := format('[20261009t 리허설 %s %s/%s :: %s] ', case when fails = 0 then 'PASS' else 'FAIL' end, total - fails, total, out);
  perform set_config('open_reset.report', coalesce(current_setting('open_reset.report', true), '') || out, true);
  if fails > 0 then raise exception '%', out; end if;
end $trehearsal$;
