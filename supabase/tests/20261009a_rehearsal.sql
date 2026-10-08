-- 20261009a 라이브 롤백 리허설(20261006p 를 판 4 로 옮김) — 실행: node <Documents>/누리홀덤_영상분석_0930/geo-notice-1005/rehearse-geo.mjs \
--   supabase/migrations/20261009a_terms_v4_legal_version.sql supabase/tests/20261009a_rehearsal.sql
-- 마이그레이션과 이어 붙여 암묵 트랜잭션 하나로 보내고, 마지막 ZZ999 예외로 전부 되돌린다(쓰기 0).
-- 음성 대조: 마이그레이션 대신 빈 파일(또는 r0 만)과 이어 붙이면 V1·V2 가 FAIL 이어야 한다(라이브는 아직 3).
do $rehearsal$
declare
  total int := 0; fails int := 0; out text := ''; t text;
  u uuid; v_mk boolean; v_ver int; v_hist int;
begin
  -- 시험 계정: 운영자가 아니고 활동 중이며 제3판에 동의한 회원 하나(역할·상태·판을 먼저 고른다).
  select p.id, coalesce(p.agreed_to_marketing, false) into u, v_mk
    from public.profiles p
   where p.role::text = 'user' and p.status::text = 'active' and p.consented_legal_version = 3
   order by p.joined_at limit 1;

  -- V0 서버 판 = 4 · ACL(anon 불가 · authenticated·service_role 가능)
  total := total + 1;
  begin
    t := 'ver=' || public.current_legal_version()::text
      || ' acl=' || has_function_privilege('anon', 'public.current_legal_version()', 'execute')::text
      || '/' || has_function_privilege('authenticated', 'public.current_legal_version()', 'execute')::text
      || '/' || has_function_privilege('service_role', 'public.current_legal_version()', 'execute')::text;
    raise exception using errcode = 'ZZ001', message = t;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'ver=4 acl=false/true/true' then out := out || 'V0 PASS; ';
      else fails := fails + 1; out := out || 'V0 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'V0 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- V1 양성: 제3판 동의 회원이 재동의(p_version 4) → profiles 4 · 이력 4 (선택 동의 값은 그대로 넘긴다)
  total := total + 1;
  begin
    if u is null then raise exception using errcode = 'ZZ001', message = 'no-subject'; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform public.record_my_legal_consent(4, true, true, true, v_mk, 'gate');
    select consented_legal_version into v_ver from public.profiles where id = u;
    select legal_version into v_hist from public.legal_consents where user_id = u order by agreed_at desc limit 1;
    raise exception using errcode = 'ZZ001', message = 'profile=' || v_ver || ' hist=' || v_hist;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'profile=4 hist=4' then out := out || 'V1 PASS; ';
      else fails := fails + 1; out := out || 'V1 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'V1 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- V2 미래 판 위조는 여전히 서버 판(4)으로 깎인다(clamp 유지)
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    perform public.record_my_legal_consent(99, true, true, true, v_mk, 'gate');
    select legal_version into v_hist from public.legal_consents where user_id = u order by agreed_at desc, legal_version desc limit 1;
    select consented_legal_version into v_ver from public.profiles where id = u;
    raise exception using errcode = 'ZZ001', message = 'profile=' || v_ver || ' hist=' || v_hist;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'profile=4 hist=4' then out := out || 'V2 PASS; ';
      else fails := fails + 1; out := out || 'V2 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'V2 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- V3 비로그인은 여전히 막힌다(NULL-safe)
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', '', true);
    perform public.record_my_legal_consent(4, true, true, true, false, 'gate');
    raise exception using errcode = 'ZZ001', message = 'anon-passed';
  exception
    when sqlstate 'ZZ001' then fails := fails + 1; out := out || 'V3 FAIL ' || sqlerrm || '; ';
    when sqlstate '42501' then out := out || 'V3 PASS; ';
    when others then fails := fails + 1; out := out || 'V3 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  raise exception using errcode = 'ZZ999',
    message = format('REHEARSAL %s %s/%s :: %s', case when fails = 0 then 'PASS' else 'FAIL' end, total - fails, total, out);
end $rehearsal$;
