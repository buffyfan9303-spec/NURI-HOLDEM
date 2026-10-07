-- 20261007ka 라이브 롤백 리허설 — 마이그레이션 뒤에 이어 붙여 한 트랜잭션으로 보내고, 끝의 ZZ999 로 전부 되돌린다.
--   실행: node rehearse-geo.mjs supabase/migrations/20261007ka_kakao_login_profiles_email_nullable.sql supabase/tests/20261007ka_rehearsal.sql
--   결과(2026-10-07 실측, 모두 롤백 — 뒤이은 읽기 전용 조회로 is_nullable=NO · 리허설 계정 0 확인):
--     · 이 마이그레이션 → REHEARSAL PASS 11/11
--     · 음성 대조(마이그레이션 자리에 set_config 한 줄뿐인 파일) → FAIL 0/2 — K1·K2 가 23502
--       'null value in column "email" of relation "profiles" violates not-null constraint'. 지금 라이브에서 카카오 가입이 막히는 바로 그 오류다.
--   계정은 전부 이 리허설이 만든다(고정 UUID, 운영 회원을 쓰지 않는다). auth.users 에 넣으면 on_auth_user_created → handle_new_user 가 돈다 —
--   GoTrue 가 signInWithIdToken 으로 카카오 회원을 만들 때와 같은 경로다(raw_app_meta_data.provider='kakao', email NULL,
--   raw_user_meta_data 는 GoTrue parseKakaoIDToken 이 싣는 키 name·preferred_username·picture·sub·iss·provider_id).
-- 검사
--   K1 이메일 없는 카카오 가입이 프로필을 만든다(email NULL)                      ← 마이그레이션 없으면 23502 로 FAIL(음성 대조)
--   K2 두 번째 이메일 없는 카카오 가입도 된다(UNIQUE 는 NULL 끼리 충돌하지 않는다)
--   P1 카카오(K1)와 구글(G) 첫 프로필의 게이트 값이 같다 — 동의 3종 false · 동의 판 NULL · role user · status active · ci_hash NULL
--   P2 카카오 회원도 같은 동의 RPC(record_my_legal_consent)로 동의를 마친다
--   N1 카카오 이름이 사칭어('관리자')면 닉네임으로 쓰지 않는다(이메일 가입과 같은 트리거 규칙)
--   N2 카카오 회원도 set_my_nickname 의 같은 규칙을 받는다 — 사칭어 거절 · 정상 이름 통과
--   U1 이메일 있는 회원 사이의 중복은 여전히 막힌다(23505)
--   I1 한 명의 한 계정 — 이메일 회원(E)이 인증한 CI 로 카카오 회원(K1)이 인증하면 'dup'
--   I2 양성 대조 — 새 CI 로는 카카오 회원(K2)도 인증된다
--   W1 카카오 회원 탈퇴가 이메일 회원과 같은 RPC(withdraw_my_account)로 끝난다(status withdrawn · 개인정보 비움)
--   R1 회귀 — 이메일 가입(동의 메타 포함)은 종전처럼 email·동의 true 로 만들어진다
do $rehearsal$
declare
  c_k1 uuid := '00000000-0000-4000-8000-00000020107a';
  c_k2 uuid := '00000000-0000-4000-8000-00000020107b';
  c_k3 uuid := '00000000-0000-4000-8000-00000020107c';
  c_g  uuid := '00000000-0000-4000-8000-00000020107d';
  c_e  uuid := '00000000-0000-4000-8000-00000020107e';
  kmeta jsonb := jsonb_build_object('iss', 'https://kauth.kakao.com', 'sub', '9990001', 'provider_id', '9990001',
                                    'name', '리허설카카오', 'preferred_username', '리허설카카오', 'picture', 'https://k.kakaocdn.net/x.jpg');
  pk record; pg record; r record;
  e text; m text; v jsonb;
  total int := 0; fails int := 0; out text := '';
begin
  -- K1 · K2 · K3: 이메일 없는 카카오 가입
  total := total + 1;
  begin
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
    values (c_k1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, kmeta,
            '{"provider":"kakao","providers":["kakao"]}'::jsonb, now(), now());
    e := null;
  exception when others then e := sqlstate; m := sqlerrm; end;
  if e is null and exists (select 1 from public.profiles where id = c_k1 and email is null) then out := out || 'K1 PASS; ';
  else fails := fails + 1; out := out || format('K1 FAIL sqlstate=%s %s; ', e, left(coalesce(m, ''), 80)); end if;

  total := total + 1;
  begin
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
    values (c_k2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null,
            kmeta || jsonb_build_object('sub', '9990002', 'provider_id', '9990002'),
            '{"provider":"kakao","providers":["kakao"]}'::jsonb, now(), now());
    e := null;
  exception when others then e := sqlstate; end;
  if e is null and (select count(*) from public.profiles where id in (c_k1, c_k2) and email is null) = 2 then out := out || 'K2 PASS; ';
  else fails := fails + 1; out := out || format('K2 FAIL sqlstate=%s; ', e); end if;

  -- 이후 검사는 K1·K2 가 있어야 의미가 있다 — 없으면(음성 대조) 여기서 끝낸다
  if fails > 0 then
    raise exception using errcode = 'ZZ999',
      message = format('REHEARSAL %s %s/%s :: %s', 'FAIL', total - fails, total, out || '(이하 생략: 카카오 회원 생성 실패)');
  end if;

  -- 구글 회원(같은 소셜 경로, 이메일 있음) — 게이트 비교의 기준
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (c_g, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rehearsal-g-20261007ka@example.invalid',
          jsonb_build_object('name', '리허설구글', 'full_name', '리허설구글'), '{"provider":"google","providers":["google"]}'::jsonb, now(), now());

  -- P1: 게이트 값 비교
  total := total + 1;
  select agreed_to_terms, agreed_to_privacy, agreed_to_anti_gambling, consented_legal_version, role::text r, status::text s, ci_hash
    into pk from public.profiles where id = c_k1;
  select agreed_to_terms, agreed_to_privacy, agreed_to_anti_gambling, consented_legal_version, role::text r, status::text s, ci_hash
    into pg from public.profiles where id = c_g;
  if pk.agreed_to_terms is false and pk.agreed_to_privacy is false and pk.agreed_to_anti_gambling is false
     and pk.consented_legal_version is null and pk.r = 'user' and pk.s = 'active' and pk.ci_hash is null
     and row(pk.agreed_to_terms, pk.agreed_to_privacy, pk.agreed_to_anti_gambling, pk.consented_legal_version, pk.r, pk.s, pk.ci_hash)
         is not distinct from row(pg.agreed_to_terms, pg.agreed_to_privacy, pg.agreed_to_anti_gambling, pg.consented_legal_version, pg.r, pg.s, pg.ci_hash) then
    out := out || 'P1 PASS; ';
  else fails := fails + 1; out := out || format('P1 FAIL kakao=%s google=%s; ', pk, pg); end if;

  -- N1: 사칭어 이름은 닉네임 후보에서 빠진다
  total := total + 1;
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (c_k3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null,
          kmeta || jsonb_build_object('sub', '9990003', 'provider_id', '9990003', 'name', '관리자', 'preferred_username', '관리자'),
          '{"provider":"kakao","providers":["kakao"]}'::jsonb, now(), now());
  select nickname into m from public.profiles where id = c_k3;
  if m is not null and m !~ '관리자' and char_length(m) between 2 and 20 then out := out || 'N1 PASS; ';
  else fails := fails + 1; out := out || format('N1 FAIL nickname=%s; ', m); end if;

  -- P2: 같은 동의 RPC
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', c_k1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.record_my_legal_consent(public.current_legal_version(), true, true, true, false, 'gate'); e := null;
  exception when others then e := sqlstate; m := sqlerrm; end;
  execute 'reset role';
  if e is null and (select agreed_to_terms and consented_legal_version is not null from public.profiles where id = c_k1) then out := out || 'P2 PASS; ';
  else fails := fails + 1; out := out || format('P2 FAIL sqlstate=%s %s; ', e, left(coalesce(m, ''), 80)); end if;

  -- N2: 같은 닉네임 규칙
  total := total + 1;
  execute 'set local role authenticated';
  begin perform public.set_my_nickname('누리홀덤운영자'); e := null; exception when others then e := sqlerrm; end;
  begin perform public.set_my_nickname('리허설닉1007ka'); m := null; exception when others then m := sqlerrm; end;
  execute 'reset role';
  if e like '%사용할 수 없는 닉네임%' and m is null and (select nickname from public.profiles where id = c_k1) = '리허설닉1007ka' then out := out || 'N2 PASS; ';
  else fails := fails + 1; out := out || format('N2 FAIL reserved=%s normal=%s; ', e, m); end if;

  -- R1: 이메일 가입 회귀
  total := total + 1;
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (c_e, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rehearsal-e-20261007ka@example.invalid',
          jsonb_build_object('nickname', '리허설이메일', 'agreed_to_terms', true, 'agreed_to_privacy', true, 'agreed_to_anti_gambling', true),
          '{"provider":"email","providers":["email"]}'::jsonb, now(), now());
  select email, agreed_to_terms, ci_hash into r from public.profiles where id = c_e;
  if r.email = 'rehearsal-e-20261007ka@example.invalid' and r.agreed_to_terms and r.ci_hash is null then out := out || 'R1 PASS; ';
  else fails := fails + 1; out := out || format('R1 FAIL %s; ', r); end if;

  -- U1: 이메일 중복은 여전히 막힌다
  total := total + 1;
  begin update public.profiles set email = 'rehearsal-e-20261007ka@example.invalid' where id = c_g; e := null;
  exception when others then e := sqlstate; end;
  if e = '23505' then out := out || 'U1 PASS; ';
  else fails := fails + 1; out := out || format('U1 FAIL sqlstate=%s; ', e); end if;

  -- I1: 한 명의 한 계정 — 이메일 회원이 먼저 인증한 CI 를 카카오 회원이 쓰면 dup
  total := total + 1;
  v := public.verify_identity_commit(c_e, 'ZZ-REH-CI-20261007ka', 'ZZ', null, null, null, null, 'zz-idv-20261007ka-e');
  if (v->>'ok')::boolean is true then
    v := public.verify_identity_commit(c_k1, 'ZZ-REH-CI-20261007ka', 'ZZ', null, null, null, null, 'zz-idv-20261007ka-k1');
    if v->>'code' = 'dup' and (select ci_hash is null from public.profiles where id = c_k1) then out := out || 'I1 PASS; ';
    else fails := fails + 1; out := out || format('I1 FAIL kakao=%s; ', v); end if;
  else fails := fails + 1; out := out || format('I1 FAIL 준비(이메일 인증)=%s; ', v); end if;

  -- I2: 양성 대조 — 새 CI 로는 카카오 회원도 인증된다
  total := total + 1;
  v := public.verify_identity_commit(c_k2, 'ZZ-REH-CI2-20261007ka', 'ZZ', null, null, null, null, 'zz-idv-20261007ka-k2');
  if (v->>'ok')::boolean is true and (select ci_hash is not null from public.profiles where id = c_k2) then out := out || 'I2 PASS; ';
  else fails := fails + 1; out := out || format('I2 FAIL %s; ', v); end if;

  -- W1: 같은 탈퇴 RPC
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', c_k2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.withdraw_my_account(); e := null; exception when others then e := sqlstate; m := sqlerrm; end;
  execute 'reset role';
  select status::text s, email, ci_hash, real_name into r from public.profiles where id = c_k2;
  if e is null and r.s = 'withdrawn' and r.email like 'withdrawn\_%@deleted.invalid' and r.ci_hash is null and r.real_name is null then
    out := out || 'W1 PASS; ';
  else fails := fails + 1; out := out || format('W1 FAIL sqlstate=%s %s row=%s; ', e, left(coalesce(m, ''), 80), r); end if;

  perform set_config('request.jwt.claims', '', true);
  raise exception using errcode = 'ZZ999',
    message = format('REHEARSAL %s %s/%s :: %s', case when fails = 0 then 'PASS' else 'FAIL' end, total - fails, total, out);
end $rehearsal$;
