-- 20261007kc 라이브 롤백 리허설 — 마이그레이션 뒤에 이어 붙여 한 트랜잭션으로 보내고, 끝의 ZZ999 로 전부 되돌린다.
--   실행: node rehearse-geo.mjs supabase/migrations/20261007kc_nickname_first_set_not_a_change.sql supabase/tests/20261007kc_rehearsal.sql
--   음성 대조: 마이그레이션 자리에 set_config 한 줄뿐인 파일 → F1 FAIL(첫 설정이 30일 시계를 켠다 — critical-211 P3-3 그대로).
--   계정은 전부 이 리허설이 만든다(고정 UUID). auth.users 에 넣으면 handle_new_user 가 프로필을 만든다(GoTrue 가입과 같은 경로).
-- 검사
--   F1 카카오 가입자(동의 전)의 첫 동의 화면 닉네임 설정 — 바뀌지만 30일 시계(nickname_changed_at)를 켜지 않는다   ← 음성 대조로 FAIL
--   F2 그다음 변경은 바로 되고(이메일 가입자의 '첫 변경은 바로' 와 같은 한 번) 이번엔 시계를 켠다
--   F3 세 번째 변경은 30일 규칙으로 거절된다 — 동의 전이라도 무료는 딱 한 번
--   F4 양성 대조/회귀 — 이메일 가입자(가입 때 동의 true)의 첫 변경은 종전처럼 시계를 켠다
--   F5 동의 전 상태를 우겨도(agreed_to_terms=false 로 되돌림) 두 번째 무료는 없다 — 판정은 서버의 본인 변경 이력
do $rehearsal$
declare
  c_k uuid := '00000000-0000-4000-8000-0000002107c1';
  c_e uuid := '00000000-0000-4000-8000-0000002107c2';
  e text; r record;
  total int := 0; fails int := 0; out text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (c_k, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null,
          jsonb_build_object('iss', 'https://kauth.kakao.com', 'sub', '9990701', 'provider_id', '9990701', 'name', '리허설카카오kc'),
          '{"provider":"kakao","providers":["kakao"]}'::jsonb, now(), now());
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (c_e, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rehearsal-e-20261007kc@example.invalid',
          jsonb_build_object('nickname', '리허설이메일kc', 'agreed_to_terms', true, 'agreed_to_privacy', true, 'agreed_to_anti_gambling', true),
          '{"provider":"email","providers":["email"]}'::jsonb, now(), now());

  -- F1
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', c_k, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.set_my_nickname('리허설첫설정kc'); e := null; exception when others then e := sqlerrm; end;
  execute 'reset role';
  select nickname, nickname_changed_at, agreed_to_terms into r from public.profiles where id = c_k;
  if e is null and r.nickname = '리허설첫설정kc' and r.nickname_changed_at is null and r.agreed_to_terms is not true then out := out || 'F1 PASS; ';
  else fails := fails + 1; out := out || format('F1 FAIL err=%s row=%s; ', e, r); end if;

  -- F2
  total := total + 1;
  execute 'set local role authenticated';
  begin perform public.set_my_nickname('리허설둘째kc'); e := null; exception when others then e := sqlerrm; end;
  execute 'reset role';
  select nickname, nickname_changed_at into r from public.profiles where id = c_k;
  if e is null and r.nickname = '리허설둘째kc' and r.nickname_changed_at is not null then out := out || 'F2 PASS; ';
  else fails := fails + 1; out := out || format('F2 FAIL err=%s row=%s; ', e, r); end if;

  -- F3
  total := total + 1;
  execute 'set local role authenticated';
  begin perform public.set_my_nickname('리허설셋째kc'); e := null; exception when others then e := sqlerrm; end;
  execute 'reset role';
  if e like '%30일에 한 번%' and (select nickname from public.profiles where id = c_k) = '리허설둘째kc' then out := out || 'F3 PASS; ';
  else fails := fails + 1; out := out || format('F3 FAIL err=%s; ', e); end if;

  -- F4
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', c_e, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.set_my_nickname('리허설이메일변경kc'); e := null; exception when others then e := sqlerrm; end;
  execute 'reset role';
  select nickname, nickname_changed_at into r from public.profiles where id = c_e;
  if e is null and r.nickname = '리허설이메일변경kc' and r.nickname_changed_at is not null then out := out || 'F4 PASS; ';
  else fails := fails + 1; out := out || format('F4 FAIL err=%s row=%s; ', e, r); end if;

  -- F5: 시계를 관리자 권한(=postgres, 트리거 가드 밖)으로 지우고 동의도 false 로 되돌려도, 본인 이력이 있어 무료가 아니다
  total := total + 1;
  update public.profiles set nickname_changed_at = null, agreed_to_terms = false where id = c_k;
  perform set_config('request.jwt.claims', json_build_object('sub', c_k, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.set_my_nickname('리허설넷째kc'); e := null; exception when others then e := sqlerrm; end;
  execute 'reset role';
  select nickname, nickname_changed_at into r from public.profiles where id = c_k;
  if e is null and r.nickname = '리허설넷째kc' and r.nickname_changed_at is not null then out := out || 'F5 PASS; ';
  else fails := fails + 1; out := out || format('F5 FAIL err=%s row=%s; ', e, r); end if;

  perform set_config('request.jwt.claims', '', true);
  raise exception using errcode = 'ZZ999',
    message = format('REHEARSAL %s %s/%s :: %s', case when fails = 0 then 'PASS' else 'FAIL' end, total - fails, total, out);
end $rehearsal$;
