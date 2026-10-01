-- ⏳ 미적용 초안(2026-10-01, 서버 수정 초안 담당 Opus 5.5). 리드 독립 검토 뒤 지시가 있을 때만 적용한다.
--    적용은 이 파일 전체(REHEARSAL 주석 블록 제외)를 **한 번의 execute_sql** 로.
--    ⚠ 화면 짝: src/components/features/VenueManageTab.tsx 의 canEditKakao 를 넓힌 커밋은 **이 파일 적용 뒤에** 배포해야 한다
--      (먼저 나가면 공동 운영자에게 카카오 칸이 보이고 저장이 0행 오류 → 2026-09-28 F4 부분 저장 재발).
-- 20261001m — S-08 오너 결정(2026-10-01): 공동 운영자도 매장 페이지(정보·사진·소개)를 수정할 수 있다
--
-- 라이브 실측(2026-10-01, 바꾸기 전):
--   · venues_update USING md5 6375dc38eaaea7ee8527d908c350e846
--     = (owner_id = auth.uid() and _actor_not_sanctioned()) or my_role() = 'admin'. WITH CHECK 없음(USING 이 그대로 쓰인다).
--   · 컬럼 UPDATE 권한은 authenticated·anon 에 venues 전 컬럼 — 칸 단위 제한은 트리거가 한다.
--   · guard_venue_verification(md5 409578b1db9f5231d2e2003e57afdfba, BEFORE UPDATE): 관리자 아닌 클라이언트의
--     verification_status·approved·is_paid_ad·voucher_quota·voucher_issue_approved·owner_id·slug·status·display_order·
--     follower_count·kind 변경과 인증 뒤 business_number 변경을 막는다. → 소유권·승인·숨김(status)은 이미 대표도 못 바꾼다.
--   · 삭제(venues_delete)는 관리자만, 킬스위치는 kill_venue/set_kill_password RPC(대표·관리자) — 이 파일과 무관.
--   · 매장 페이지 탭의 저장 경로: description(updateVenueDescription) · image_url · images · kakao_url 은 venues 직접 UPDATE,
--     주소·연락처·좌표는 RPC(can_manage_venue — 20261001l 로 공동 운영자 포함), page_config·slug 는 RPC(can_manage_pos).
--     그래서 공동 운영자가 막히는 곳은 직접 UPDATE 4칸뿐이었다(audit-store-1001 S-08: mustAffect 0행 오류).
-- 무엇을 바꾸나:
--   ① venues_update 에 `or can_manage_pos(id)` — 승인 공동 운영자(_venue_coowner_ok: venue_owners.status='approved' +
--      프로필 approved + kind='venue', 20260930d 정본)를 정지·차단 제외와 함께 통과시킨다. 미승인·다른 매장·비로그인은 0행.
--      ⚠ _venue_coowner_ok 를 정책에 **직접** 쓰면 안 된다 — ACL 이 postgres·service_role 뿐이라 정책이 호출자 권한으로
--        부를 때 42501 로 **모든 매장 UPDATE 가 깨진다**(초안 1차 리허설에서 실제로 났다). can_manage_pos 는 authenticated·PUBLIC 실행 가능.
--      can_manage_pos 의 대표(승인)·관리자 분기는 기존 두 절에 이미 들어 있어 넓어지는 것은 공동 운영자뿐이다.
--   ② 새 트리거 trg_guard_venue_coowner_columns: 관리자도 대표(owner_id = 나)도 아닌 클라이언트 UPDATE 는
--      **허용 목록 칸만** 바뀔 수 있다 — description · image_url · images · kakao_url · theme_color · business_hours ·
--      contact_phone · contact_phones · address · lat · lng · updated_at. 나머지(이름·지역·사업자번호·가입 승인 방식·
--      개설 목적·page_config 직접 쓰기 등과 앞으로 생길 칸)는 대표·관리자 전용. 허용 목록 방식이라 새 칸은 기본 거부다.
--      대표·관리자 동작은 바뀌지 않는다(트리거가 첫 분기에서 통과).

do $$
begin
  if (select md5(qual) from pg_policies where schemaname = 'public' and tablename = 'venues' and policyname = 'venues_update')
       is distinct from '6375dc38eaaea7ee8527d908c350e846' then
    raise exception '20261001m 게이트: venues_update 가 초안 작성 때와 다르다';
  end if;
  if (select with_check from pg_policies where schemaname = 'public' and tablename = 'venues' and policyname = 'venues_update') is not null then
    raise exception '20261001m 게이트: venues_update 에 WITH CHECK 가 생겼다 — 다시 읽고 고쳐라';
  end if;
  if (select md5(pg_get_functiondef('public._venue_coowner_ok(uuid, uuid)'::regprocedure)))
       is distinct from '19054611fd0e9f105c7ca3a33f872281' then
    raise exception '20261001m 게이트: _venue_coowner_ok(20260930d 승인 게이트) 가 바뀌었다';
  end if;
  if (select md5(pg_get_functiondef('public.guard_venue_verification()'::regprocedure)))
       is distinct from '409578b1db9f5231d2e2003e57afdfba' then
    raise exception '20261001m 게이트: guard_venue_verification 이 바뀌었다 — 민감 칸 보호 범위를 다시 확인하라';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.venues'::regclass and tgname = 'trg_guard_venue_verification' and tgenabled = 'O') then
    raise exception '20261001m 게이트: trg_guard_venue_verification 이 꺼져 있다';
  end if;
end $$;

create or replace function public._guard_venue_coowner_columns()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
-- 20261001m(S-08): 대표·관리자가 아닌 클라이언트(= RLS 를 공동 운영자 분기로 통과한 사람)는 매장 페이지 칸만.
declare
  c_page text[] := array['description', 'image_url', 'images', 'kakao_url', 'theme_color', 'business_hours',
                         'contact_phone', 'contact_phones', 'address', 'lat', 'lng', 'updated_at'];
begin
  if current_user in ('authenticated', 'anon')
     and coalesce(public.my_role() = 'admin'::user_role, false) is false
     and old.owner_id is distinct from auth.uid()
  then
    if (to_jsonb(new) - c_page) is distinct from (to_jsonb(old) - c_page) then
      raise exception '공동 운영자는 매장 페이지 항목(소개·사진·연락처·영업시간·카카오 링크)만 바꿀 수 있습니다 — 그 밖의 항목은 대표 업주에게 요청해 주세요';
    end if;
  end if;
  return new;
end $function$;

revoke all on function public._guard_venue_coowner_columns() from public, anon, authenticated;

drop trigger if exists trg_guard_venue_coowner_columns on public.venues;
create trigger trg_guard_venue_coowner_columns
  before update on public.venues
  for each row execute function public._guard_venue_coowner_columns();

alter policy venues_update on public.venues
  using (((owner_id = (select auth.uid())) and public._actor_not_sanctioned())
         or (my_role() = 'admin'::user_role)
         or public.can_manage_pos(id));

-- 자가검사
do $$
begin
  if (select qual from pg_policies where schemaname = 'public' and tablename = 'venues' and policyname = 'venues_update') !~ 'can_manage_pos\(id\)' then
    raise exception '20261001m: venues_update 에 공동 운영자 분기(can_manage_pos)가 없다';
  end if;
  if (select qual from pg_policies where schemaname = 'public' and tablename = 'venues' and policyname = 'venues_update') ~ '_venue_coowner_ok' then
    raise exception '20261001m: 정책이 _venue_coowner_ok 를 직접 부른다 — 호출자 권한 42501 로 매장 UPDATE 전체가 깨진다';
  end if;
  if not has_function_privilege('authenticated', 'public.can_manage_pos(uuid)', 'execute')
     or not has_function_privilege('anon', 'public.can_manage_pos(uuid)', 'execute') then
    raise exception '20261001m: 정책이 부르는 can_manage_pos 를 호출자가 실행할 수 없다';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.venues'::regclass and tgname = 'trg_guard_venue_coowner_columns' and tgenabled = 'O') then
    raise exception '20261001m: 칸 제한 트리거가 없거나 꺼져 있다 — 정책만 넓히면 공동 운영자가 모든 칸을 바꾼다';
  end if;
  if has_function_privilege('authenticated', 'public._guard_venue_coowner_columns()', 'execute')
     or has_function_privilege('anon', 'public._guard_venue_coowner_columns()', 'execute') then
    raise exception '20261001m: 내부 트리거 함수 실행 권한이 열려 있다';
  end if;
  if pg_get_functiondef('public._guard_venue_coowner_columns()'::regprocedure) !~ 'search_path TO ''public'', ''pg_temp''' then
    raise exception '20261001m: search_path 고정 누락';
  end if;
end $$;

/* ── REHEARSAL — 운영 DB 에서 `<이 파일 본문>` + 아래 블록을 한 번에 돌린다. 끝의 raise 가 전부 되돌린다.
   계정(2026-10-01 조회): OWNER 7e435684(venue_owner·승인·매장 R 대표) · ADMIN f5d305f2(소유 0) · CO 708de904(user, 소유·소속 0 →
   트랜잭션 안에서 승인 + R 의 공동 운영자로) · 매장 R = f35b42d1… · 다른 매장 A = d0e20929-5eed-4000-8000-00000000a001(대표 c8e3734d)
-- ▼REHEARSAL
do $$
declare
  c_owner uuid := '7e435684-2c8c-458d-985c-31b784a44893';
  c_admin uuid := 'f5d305f2-0f30-4d61-91ce-51f3332e5193';
  c_co    uuid := '708de904-913e-4082-8803-8a2766b342f9';
  c_r uuid := 'f35b42d1-2d54-4905-95c1-1fda24e0f178';
  c_a uuid := 'd0e20929-5eed-4000-8000-00000000a001';
  n int; blocked boolean; col text;
begin
  update public.profiles set approved = true where id = c_co;
  insert into public.venue_owners(venue_id, user_id, status) values (c_r, c_co, 'pending');

  -- 음성 1: 미승인(pending) 공동 운영자 — 0행
  perform set_config('request.jwt.claims', json_build_object('sub', c_co, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.venues set description = 'pending' where id = c_r; get diagnostics n = row_count;
  execute 'reset role';
  if n <> 0 then raise exception 'FAIL: 미승인 공동 운영자가 저장했다'; end if;

  update public.venue_owners set status = 'approved' where venue_id = c_r and user_id = c_co;

  -- 양성 1: 승인 공동 운영자 — 매장 페이지 칸 4개(화면 직접 UPDATE 경로 전부) 저장
  perform set_config('request.jwt.claims', json_build_object('sub', c_co, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.venues set description = 'co-desc', updated_at = now() where id = c_r; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: 공동 운영자 소개 저장 %행', n; end if;
  update public.venues set kakao_url = 'https://open.kakao.com/o/rehearsal' where id = c_r; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: 공동 운영자 카카오 저장 %행', n; end if;
  update public.venues set image_url = 'https://example.invalid/a.webp', images = array['https://example.invalid/b.webp'] where id = c_r; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: 공동 운영자 사진 저장 %행', n; end if;

  -- 음성 2: 승인 공동 운영자라도 민감·비허용 칸은 거부(소유권·승인·숨김·이름·사업자번호·가입 방식)
  foreach col in array array['owner_id', 'approved', 'status', 'name', 'business_number', 'join_approval', 'page_config'] loop
    blocked := false;
    begin
      execute format('update public.venues set %I = %s where id = %L', col,
        case col when 'owner_id' then quote_literal(c_co) || '::uuid' when 'approved' then 'not approved'
                 when 'status' then '''hidden''::venue_status' when 'name' then '''바꾼 이름'''
                 when 'business_number' then '''000-00-00000''' when 'join_approval' then 'not coalesce(join_approval,false)'
                 else '''{"x":1}''::jsonb' end, c_r);
    exception when others then blocked := true; end;
    if not blocked then raise exception 'FAIL: 공동 운영자가 % 를 바꿨다', col; end if;
  end loop;

  -- 음성 3: 다른 매장 A — 0행
  update public.venues set description = 'x' where id = c_a; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: 공동 운영자가 다른 매장을 바꿨다'; end if;
  execute 'reset role';

  -- 음성 4: 비로그인 — 0행 또는 42501(기존 동작: 옛 정책의 _actor_not_sanctioned 가 anon 실행 불가라 이미 42501 이다)
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin update public.venues set description = 'anon' where id = c_r; get diagnostics n = row_count;
  exception when insufficient_privilege then n := 0; end;
  execute 'reset role';
  if n <> 0 then raise exception 'FAIL: 비로그인이 저장했다'; end if;

  -- 양성 2: 대표 — 페이지 칸과 이름(대표 전용 칸)까지 저장
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.venues set description = 'owner-desc', name = name || '' where id = c_r; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: 대표 저장 %행', n; end if;
  update public.venues set name = '리허설 이름' where id = c_r; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: 대표 이름 저장 %행', n; end if;
  execute 'reset role';

  -- 양성 3: 관리자 — 소유 0 매장 저장
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.venues set description = 'admin-desc', name = '관리자 이름' where id = c_r; get diagnostics n = row_count;
  execute 'reset role';
  if n <> 1 then raise exception 'FAIL: 관리자 저장 %행', n; end if;

  -- 음성 5: 정지 중인 공동 운영자 — 0행
  update public.profiles set status = 'suspended', suspended_until = now() + interval '1 day' where id = c_co;
  perform set_config('request.jwt.claims', json_build_object('sub', c_co, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.venues set description = 'suspended' where id = c_r; get diagnostics n = row_count;
  execute 'reset role';
  if n <> 0 then raise exception 'FAIL: 정지 중인 공동 운영자가 저장했다'; end if;

  raise exception 'REHEARSAL_OK 20261001m';
end $$;
*/
