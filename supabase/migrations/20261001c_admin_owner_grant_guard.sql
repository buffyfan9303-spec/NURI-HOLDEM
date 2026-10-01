-- ✅ 2026-10-01 라이브 적용 완료(nuri-lead 승인 · 실행 서버 초안 담당 Opus 5.5, MCP execute_sql). 적용 직전 게이트 md5 재조회 일치 · 자가검사 통과.
--    사후 md5: admin_decide_venue_owner a3018af827c154f317d1d8fe1846afd1 · admin_create_venue 3978986402e11f049e9f4bccf5050af3 · admin_update_venue 120f85ae43072e79063ac56d032cb29e · transfer_venue_primary 8857ccde785bae5d5633f7b6abd43a09 · ACL 4개 모두 {postgres,authenticated,service_role}.
--    롤백 리허설: 이 파일 본문 + 맨 아래 REHEARSAL 블록을 한 트랜잭션으로 돌려 REHEARSAL_OK(raise 로 되돌림) 확인 — admin-srv-report.md 참고.
-- 20261001c — A-02: 관리자 승인·임명 RPC 가 요청 존재를 확인하지 않고, 대상이 관리자여도 역할을 venue_owner 로 덮어쓰던 것.
--
-- 왜(audit-admin-1001.md A-02, 라이브 정의 pg_get_functiondef 기준):
--   · admin_decide_venue_owner 승인 분기가 venue_owners UPDATE 의 영향 행을 보지 않고 곧바로 profiles.role 을 바꿨다
--     → 업주가 초대를 취소한 뒤 관리자가 '승인'을 누르면 요청 없이 승인 업주가 생겼다. pending 조건도 없었다.
--   · admin_decide_venue_owner·admin_create_venue·admin_update_venue·transfer_venue_primary 네 곳이 대상의 현재 역할을 보지 않고
--     role='venue_owner' 로 덮었다 → 대상이 관리자면 관리자 권한이 사라졌다(create_my_venue 는 이미 case 로 막았다).
-- 무엇을 바꾸나: ① 승인은 status='pending' 행을 실제로 바꿨을 때만(0행이면 raise) ② 네 함수의 역할 갱신을
--   `case when role = 'admin' then role else 'venue_owner' end` 로. 나머지 본문·시그니처·반환형은 라이브와 같다(ACL 보존, 아래에 다시 적는다).

-- 적용 전 게이트: 라이브 정의가 이 초안이 읽은 것과 같을 때만 진행한다(2026-10-01 실측 md5).
do $$
declare r record;
begin
  for r in select * from (values
      ('public.admin_decide_venue_owner(uuid,uuid,boolean)',        'a302eef47246a6aa111ce893914c8d93'),
      ('public.admin_create_venue(text,text,text,uuid)',            'c86a90dd1124fd14e2bcb7e7bb889a63'),
      ('public.admin_update_venue(uuid,text,text,text,uuid)',       '367e19411f5761de4d590098a883647c'),
      ('public.transfer_venue_primary(uuid,uuid)',                  '799205d12d3f67d8c55f7694421670c2')) g(sig, want) loop
    if md5(pg_get_functiondef(r.sig::regprocedure)) is distinct from r.want then
      raise exception '20261001c 게이트: % 의 라이브 정의가 초안 작성 때와 다르다(md5 %) — 다시 읽고 고쳐라',
        r.sig, md5(pg_get_functiondef(r.sig::regprocedure));
    end if;
  end loop;
end $$;

create or replace function public.admin_decide_venue_owner(p_venue_id uuid, p_user_id uuid, p_approve boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_n int;
begin
  if my_role() is distinct from 'admin' then raise exception '운영자만 가능합니다'; end if;
  if p_approve then
    -- 20261001c: 대기 중인 요청 행을 실제로 바꿨을 때만 역할을 준다(취소·중복 처리된 요청으로 승인 업주가 생기지 않게).
    update public.venue_owners set status = 'approved'
     where venue_id = p_venue_id and user_id = p_user_id and status = 'pending';
    get diagnostics v_n = row_count;
    if v_n = 0 then
      raise exception '이미 처리되었거나 취소된 요청입니다';
    end if;
    -- 20261001c: 관리자는 관리자로 남긴다.
    update public.profiles
       set role = case when role = 'admin'::user_role then role else 'venue_owner'::user_role end,
           approved = true, venue_id = coalesce(venue_id, p_venue_id)
     where id = p_user_id;
  else
    delete from public.venue_owners where venue_id = p_venue_id and user_id = p_user_id and status = 'pending';
  end if;
end $function$;

create or replace function public.admin_create_venue(p_name text, p_region text, p_address text default ''::text, p_owner_id uuid default null::uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_id uuid;
begin
  if my_role() IS DISTINCT FROM 'admin'::user_role then
    raise exception '관리자만 매장을 생성할 수 있습니다';
  end if;
  if coalesce(btrim(p_name),'') = '' or coalesce(btrim(p_region),'') = '' then
    raise exception '매장명과 지역은 필수입니다';
  end if;

  insert into public.venues (name, region, address, owner_id, approved, verification_status)
  values (btrim(p_name), btrim(p_region), coalesce(p_address,''), p_owner_id, true,
          case when p_owner_id is not null then 'verified'::venue_verification_status else 'unverified'::venue_verification_status end)
  returning id into v_id;

  -- 관리 업주 임명: 해당 회원을 업주로 전환 + 매장 연결 + 승인 (20261001c: 관리자는 관리자로 남긴다)
  if p_owner_id is not null then
    update public.profiles
       set role = case when role = 'admin'::user_role then role else 'venue_owner'::user_role end,
           venue_id = v_id, approved = true
     where id = p_owner_id;
  end if;

  return v_id;
end; $function$;

create or replace function public.admin_update_venue(p_venue_id uuid, p_name text, p_region text, p_address text default ''::text, p_owner_id uuid default null::uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_old_owner uuid;
begin
  if my_role() is distinct from 'admin'::user_role then
    raise exception '관리자만 매장을 수정할 수 있습니다';
  end if;
  if coalesce(btrim(p_name),'') = '' or coalesce(btrim(p_region),'') = '' then
    raise exception '매장명과 지역은 필수입니다';
  end if;

  select owner_id into v_old_owner from public.venues where id = p_venue_id;

  update public.venues
     set name       = btrim(p_name),
         region     = btrim(p_region),
         address    = coalesce(p_address, ''),
         owner_id   = p_owner_id,
         updated_at = now()
   where id = p_venue_id;
  if not found then
    raise exception '매장을 찾을 수 없습니다';
  end if;

  if p_owner_id is distinct from v_old_owner then
    if v_old_owner is not null then
      update public.profiles set venue_id = null
       where id = v_old_owner and venue_id = p_venue_id;
      delete from public.venue_owners  where venue_id = p_venue_id and user_id = v_old_owner;
      delete from public.ledger_access  where venue_id = p_venue_id and user_id = v_old_owner;
      delete from public.voucher_access where venue_id = p_venue_id and user_id = v_old_owner;
    end if;
    if p_owner_id is not null then
      -- 20261001c: 관리자는 관리자로 남긴다.
      update public.profiles
         set role = case when role = 'admin'::user_role then role else 'venue_owner'::user_role end,
             venue_id = p_venue_id, approved = true
       where id = p_owner_id;
    end if;
  end if;

  if p_owner_id is not null then
    insert into public.venue_owners (venue_id, user_id, added_by, status)
    values (p_venue_id, p_owner_id, auth.uid(), 'approved')
    on conflict (venue_id, user_id) do update set status = 'approved';
  end if;
end;
$function$;

create or replace function public.transfer_venue_primary(p_venue_id uuid, p_new_owner_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  -- 20260930d: 종전 `not (… or owner_id = auth.uid())` 는 NULL 에서 통과했고 승인 철회 대표도 통과했다.
  if (coalesce(my_role() = 'admin'::user_role, false) or public._venue_owner_ok(p_venue_id)) is distinct from true then
    raise exception '대표 교체는 현재 대표 또는 운영자만 가능합니다';
  end if;
  -- 20260930d: 아래 update 가 approved=true 를 쓰므로, 승인 철회된 공동 운영자를 올리면 관리자 없이 재승인됐다.
  if public._venue_coowner_ok(p_venue_id, p_new_owner_id) is distinct from true then
    raise exception '새 대표는 먼저 승인된 공동 사장이어야 합니다';
  end if;
  update public.venues set owner_id = p_new_owner_id, updated_at = now() where id = p_venue_id;
  -- 20261001c: 관리자는 관리자로 남긴다.
  update public.profiles
     set venue_id = coalesce(venue_id, p_venue_id),
         role = case when role = 'admin'::user_role then role else 'venue_owner'::user_role end,
         approved = true
   where id = p_new_owner_id;
end $function$;

revoke all on function public.admin_decide_venue_owner(uuid,uuid,boolean)   from public, anon;
revoke all on function public.admin_create_venue(text,text,text,uuid)       from public, anon;
revoke all on function public.admin_update_venue(uuid,text,text,text,uuid)  from public, anon;
revoke all on function public.transfer_venue_primary(uuid,uuid)             from public, anon;
grant execute on function public.admin_decide_venue_owner(uuid,uuid,boolean)  to authenticated, service_role;
grant execute on function public.admin_create_venue(text,text,text,uuid)      to authenticated, service_role;
grant execute on function public.admin_update_venue(uuid,text,text,text,uuid) to authenticated, service_role;
grant execute on function public.transfer_venue_primary(uuid,uuid)            to authenticated, service_role;

-- 자가검사
do $$
declare s text; d text;
begin
  foreach s in array array[
      'public.admin_decide_venue_owner(uuid,uuid,boolean)',
      'public.admin_create_venue(text,text,text,uuid)',
      'public.admin_update_venue(uuid,text,text,text,uuid)',
      'public.transfer_venue_primary(uuid,uuid)'] loop
    d := pg_get_functiondef(s::regprocedure);
    if position($x$case when role = 'admin'::user_role then role else 'venue_owner'::user_role end$x$ in d) = 0 then
      raise exception '20261001c: % 에 관리자 보존식이 없다', s;
    end if;
    if d ~ $re$role\s*=\s*'venue_owner'(::user_role)?\s*,$re$ then
      raise exception '20261001c: % 에 무조건 venue_owner 덮어쓰기가 남아 있다', s;
    end if;
    if d !~ 'search_path TO ''public'', ''pg_temp''' then
      raise exception '20261001c: % search_path 고정 누락', s;
    end if;
    if has_function_privilege('anon', s, 'execute') then
      raise exception '20261001c: % 가 anon 에 열려 있다', s;
    end if;
    if not has_function_privilege('authenticated', s, 'execute') then
      raise exception '20261001c: % 가 authenticated 에 닫혔다(화면 기능 소실)', s;
    end if;
  end loop;
  d := pg_get_functiondef('public.admin_decide_venue_owner(uuid,uuid,boolean)'::regprocedure);
  if position('get diagnostics v_n = row_count' in d) = 0 or position('이미 처리되었거나 취소된 요청' in d) = 0 then
    raise exception '20261001c: 승인 분기의 요청 존재 확인이 없다';
  end if;
end $$;

/* REHEARSAL — 운영 DB 에서 `begin; <이 파일 본문>; <아래 블록>` 을 한 번에 돌린다. 끝의 raise 가 전부 되돌린다.
   계정(2026-10-01 조회: profiles 역할·소유·소속):
     ADMIN  c8e3734d-028d-4b69-86c9-a6d75c36601c  admin · approved=true · 매장 5 소유
     OWNER  7e435684-2c8c-458d-985c-31b784a44893  venue_owner · 매장 f35b42d1 대표 · venue_owners 1행
     USER   fd14c2dc-d994-46e4-8f12-b6cf38104983  user · 소유 0 · venue_owners 0
   매장 V = f35b42d1-2d54-4905-95c1-1fda24e0f178 (OWNER 대표, kind=venue)
-- ▼REHEARSAL
do $$
declare
  c_admin uuid := 'c8e3734d-028d-4b69-86c9-a6d75c36601c';
  c_owner uuid := '7e435684-2c8c-458d-985c-31b784a44893';
  c_user  uuid := 'fd14c2dc-d994-46e4-8f12-b6cf38104983';
  c_v     uuid := 'f35b42d1-2d54-4905-95c1-1fda24e0f178';
  v_role text; v_st text; v_new uuid; r record;
begin
  -- 비로그인(jwt 빈 값): 거절
  perform set_config('request.jwt.claims', '', true);
  begin perform public.admin_decide_venue_owner(c_v, c_user, true); raise exception 'FAIL: 비로그인 승인 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%운영자만 가능합니다%' then raise exception 'FAIL: 엉뚱한 오류(기대: 운영자만 가능합니다): %', sqlerrm; end if; end;
  -- 일반 업주: 거절
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner, 'role', 'authenticated')::text, true);
  begin perform public.admin_decide_venue_owner(c_v, c_user, true); raise exception 'FAIL: 업주가 승인 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%운영자만 가능합니다%' then raise exception 'FAIL: 엉뚱한 오류(기대: 운영자만 가능합니다): %', sqlerrm; end if; end;

  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  -- 음성 1: 요청 행 없이 승인 → raise, USER 역할 불변
  begin perform public.admin_decide_venue_owner(c_v, c_user, true); raise exception 'FAIL: 요청 없는 승인 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%이미 처리되었거나 취소된 요청%' then raise exception 'FAIL: 엉뚱한 오류(기대: 이미 처리되었거나 취소된 요청): %', sqlerrm; end if; end;
  select role::text into v_role from public.profiles where id = c_user;
  if v_role <> 'user' then raise exception 'FAIL: 요청 없는 승인 뒤 역할 %', v_role; end if;

  -- 양성 1: pending 요청 → 승인 → approved · venue_owner
  insert into public.venue_owners(venue_id, user_id, added_by, status) values (c_v, c_user, c_owner, 'pending');
  perform public.admin_decide_venue_owner(c_v, c_user, true);
  select status into v_st from public.venue_owners where venue_id = c_v and user_id = c_user;
  select role::text into v_role from public.profiles where id = c_user;
  if v_st <> 'approved' or v_role <> 'venue_owner' then raise exception 'FAIL: 정상 승인 실패 % %', v_st, v_role; end if;
  -- 음성 2: 같은 요청 두 번째 승인 → raise
  begin perform public.admin_decide_venue_owner(c_v, c_user, true); raise exception 'FAIL: 중복 승인 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%이미 처리되었거나 취소된 요청%' then raise exception 'FAIL: 엉뚱한 오류(기대: 이미 처리되었거나 취소된 요청): %', sqlerrm; end if; end;

  -- 관리자 대상 승인 → admin 유지
  insert into public.venue_owners(venue_id, user_id, added_by, status) values (c_v, c_admin, c_owner, 'pending');
  perform public.admin_decide_venue_owner(c_v, c_admin, true);
  select role::text into v_role from public.profiles where id = c_admin;
  if v_role <> 'admin' then raise exception 'FAIL: 승인으로 관리자 강등 %', v_role; end if;

  -- admin_create_venue 관리자 임명 → admin 유지
  v_new := public.admin_create_venue('리허설매장', '서울', '', c_admin);
  select role::text into v_role from public.profiles where id = c_admin;
  if v_role <> 'admin' then raise exception 'FAIL: 생성 임명으로 관리자 강등'; end if;

  -- admin_update_venue 로 관리자에게 업주 이전 → admin 유지 / 일반 회원 임명 → venue_owner
  select * into r from public.venues where id = 'd0e20929-5eed-4000-8000-00000000a001';
  perform public.admin_update_venue(r.id, r.name, r.region, r.address, 'f5d305f2-0f30-4d61-91ce-51f3332e5193');
  select role::text into v_role from public.profiles where id = 'f5d305f2-0f30-4d61-91ce-51f3332e5193';
  if v_role <> 'admin' then raise exception 'FAIL: 수정 임명으로 관리자 강등'; end if;
  perform public.admin_update_venue(v_new, '리허설매장', '서울', '', '47360d8e-fd0e-49f3-ab3f-22e1fc1e9e60');
  select role::text into v_role from public.profiles where id = '47360d8e-fd0e-49f3-ab3f-22e1fc1e9e60';
  if v_role <> 'venue_owner' then raise exception 'FAIL: 일반 회원 임명 실패 %', v_role; end if;

  -- transfer_venue_primary: 대표(OWNER)가 승인된 공동 사장인 관리자에게 넘김 → admin 유지
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner, 'role', 'authenticated')::text, true);
  perform public.transfer_venue_primary(c_v, c_admin);
  select role::text into v_role from public.profiles where id = c_admin;
  if v_role <> 'admin' then raise exception 'FAIL: 대표 교체로 관리자 강등'; end if;
  if (select owner_id from public.venues where id = c_v) <> c_admin then raise exception 'FAIL: 대표 교체 자체가 안 됐다'; end if;

  if has_function_privilege('anon', 'public.admin_decide_venue_owner(uuid,uuid,boolean)', 'execute') then
    raise exception 'FAIL: anon 실행 가능';
  end if;
  raise exception 'REHEARSAL_OK 20261001c';
end $$;
-- ▲REHEARSAL
*/
