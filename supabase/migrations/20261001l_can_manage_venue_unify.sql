-- ✅ 2026-10-01 라이브 적용 완료(nuri-lead · Management API database/query 로 이 파일 본문 그대로 한 번에, k→l→m 순). 게이트 통과.
--    적용 후 실측: can_manage_venue md5 6c6be34b(적용 전 b09b193c 와 다름) · 보안 어드바이저 ERROR 0(WARN 290·INFO 16).
--    적용 전 독립 검토: critical-reviewer PASS(store-db-report.md 독립 검토 절).
-- (원래 머리줄) ⏳ 미적용 초안(2026-10-01, 서버 수정 초안 담당 Opus 5.5). 리드 독립 검토(critical-reviewer) 뒤 지시가 있을 때만 적용한다.
--    적용은 이 파일 전체(REHEARSAL 주석 블록 제외)를 **한 번의 execute_sql** 로.
-- 20261001l — S-09(audit-store-1001): 공동 운영자 판정 두 벌(can_manage_venue ≠ can_manage_pos)을 하나로
--
-- 라이브 실측(2026-10-01, 바꾸기 전):
--   · can_manage_venue md5 b09b193c4bc88b6de37f9ae4fd70db37 · ACL {=X,postgres,anon,authenticated,service_role}
--     = profiles.status = 'active' 이고 (role admin) 또는 (role venue_owner + approved + (대표 또는 venue_owners approved)).
--   · can_manage_pos  md5 989d68ec42fbf6875d1049b457f541c6
--     = (admin 또는 _venue_owner_ok 또는 _venue_coowner_ok) 이고 정지·차단·탈퇴 아님.
--
-- 전이 폐쇄(바꾸기 전 집계 — 함수 본문 \m can_manage_venue \M 재귀, 정책·뷰·트리거 포함):
--   깊이 1 함수 7개 · 깊이 2 이상 0 · 정책 0 · 뷰 0 · 트리거 0. (can_manage_venue_schedules/_staff 는 이름만 비슷한 별개 함수)
--   | 호출자                 | 쓰임                                             | 화면 호출부                                   |
--   | update_venue_address   | 첫 줄 게이트                                     | community.ts:273 updateVenueAddress           |
--   | update_venue_contact   | 첫 줄 게이트                                     | community.ts:310 (VenueCustomizePanel 단일)   |
--   | update_venue_contacts  | 첫 줄 게이트                                     | community.ts:304 (VenueCustomizePanel 다중)   |
--   | set_venue_coords       | 첫 줄 게이트(coalesce false)                     | community.ts:283 / CheckinLocationSection     |
--   | venue_player_counts    | can_access_ledger(..) or can_manage_venue(..)    | rankings.ts:454 — can_access_ledger ⊇ can_manage_pos 라 바꾼 뒤 이 항은 무의미(동작 동일) |
--   | redeem_voucher         | 첫 줄 게이트 · ACL 이 postgres·service_role 뿐    | 화면 호출 0(service_role 은 auth.uid NULL → 옛·새 모두 false) |
--   | save_venue_rankings    | 주석에만 등장(2026-09-15 can_access_ledger 로 교체) | 영향 0                                       |
--
-- 동작이 바뀌는 곳(논리 차이 — 라이브 데이터로는 0쌍, 아래 실측):
--   넓어짐 ① 승인된 공동 운영자인데 role 이 'user' 인 사람 → 주소·연락처·좌표 저장 가능(S-09 의 목적, 20260930d 승인 게이트는 그대로)
--          ② 대표 업주인데 role 이 venue_owner 가 아닌 사람(승인 프로필) → 가능
--          ③ 정지 기한이 지난 'suspended' 계정 → 가능(can_manage_pos 와 같은 선; 옛것은 'active' 만)
--   좁아짐 ④ kind ≠ 'venue'(dealer_team 그룹) 의 대표·공동 운영자 → 불가. 그룹은 update_group_profile 전용 RPC 를 쓴다(community.ts:1111-1124).
--          ⑤ 공동 운영자 행만 있고 매장 kind ≠ 'venue' → 불가.
--   라이브 실측(2026-10-01): profiles 8 + 비로그인 × venues 7 = 63쌍에서 옛/새 결과 차이 **0쌍**.
--
-- 방식: 본문을 `select public.can_manage_pos(p_venue_id)` 한 줄로. 반환 타입 동일 → CREATE OR REPLACE(ACL 보존).
--   ACL 은 옛것 그대로 둔다(anon 은 auth.uid NULL 이라 항상 false — 회수는 호출자 영향 확인이 따로 필요해 이번 범위 밖).

do $$
begin
  if (select md5(pg_get_functiondef('public.can_manage_venue(uuid)'::regprocedure)))
       is distinct from 'b09b193c4bc88b6de37f9ae4fd70db37' then
    raise exception '20261001l 게이트: can_manage_venue 가 초안 작성 때와 다르다';
  end if;
  if (select md5(pg_get_functiondef('public.can_manage_pos(uuid)'::regprocedure)))
       is distinct from '989d68ec42fbf6875d1049b457f541c6' then
    raise exception '20261001l 게이트: can_manage_pos 가 초안 작성 때와 다르다';
  end if;
  -- 전이 폐쇄 게이트: 호출자 집합이 집계 때와 같아야 한다(새 호출자가 생겼으면 다시 센다)
  if (select string_agg(p.proname, ',' order by p.proname) from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.prosrc ~ '\mcan_manage_venue\M' and p.proname <> 'can_manage_venue')
       is distinct from 'redeem_voucher,save_venue_rankings,set_venue_coords,update_venue_address,update_venue_contact,update_venue_contacts,venue_player_counts' then
    raise exception '20261001l 게이트: can_manage_venue 호출자 집합이 바뀌었다 — 전이 폐쇄를 다시 세라';
  end if;
  if exists (select 1 from pg_policies where coalesce(qual, '') || coalesce(with_check, '') ~ '\mcan_manage_venue\M') then
    raise exception '20261001l 게이트: can_manage_venue 를 쓰는 정책이 생겼다 — 전이 폐쇄를 다시 세라';
  end if;
end $$;

create or replace function public.can_manage_venue(p_venue_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  -- 20261001l(S-09): 판정 정본은 can_manage_pos 하나 — 대표(_venue_owner_ok)·승인 공동 운영자(_venue_coowner_ok)·관리자,
  --   정지·차단·탈퇴 제외. 두 벌이면 화면 게이트(can_manage_pos)와 서버 게이트가 갈린다.
  select public.can_manage_pos(p_venue_id);
$function$;

-- 자가검사
do $$
begin
  if pg_get_functiondef('public.can_manage_venue(uuid)'::regprocedure) !~ 'select public\.can_manage_pos\(p_venue_id\);' then
    raise exception '20261001l: 본문이 can_manage_pos 위임이 아니다';
  end if;
  if pg_get_functiondef('public.can_manage_venue(uuid)'::regprocedure) ~ 'venue_owner''' then
    raise exception '20261001l: role = venue_owner 조건이 남아 있다';
  end if;
  if pg_get_functiondef('public.can_manage_venue(uuid)'::regprocedure) !~ 'search_path TO ''public'', ''pg_temp''' then
    raise exception '20261001l: search_path 고정 누락';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public.can_manage_venue(uuid)'::regprocedure) then
    raise exception '20261001l: SECURITY DEFINER 가 아니다';
  end if;
end $$;

/* ── REHEARSAL — 운영 DB 에서 `<이 파일 본문>` + 아래 블록을 한 번에 돌린다. 끝의 raise 가 전부 되돌린다.
   계정(2026-10-01 조회): OWNER 7e435684(venue_owner·승인·매장 R 대표) · ADMIN f5d305f2(소유 0) · USER 708de904(user, 소유·소속 0)
   매장 R = f35b42d1-2d54-4905-95c1-1fda24e0f178 · 그룹 G = 9cf562bd…(dealer_team) 은 id 앞자리로 찾는다.
-- ▼REHEARSAL
do $$
declare
  c_owner uuid := '7e435684-2c8c-458d-985c-31b784a44893';
  c_admin uuid := 'f5d305f2-0f30-4d61-91ce-51f3332e5193';
  c_user  uuid := '708de904-913e-4082-8803-8a2766b342f9';
  c_r uuid := 'f35b42d1-2d54-4905-95c1-1fda24e0f178';
  c_g uuid;
  r record; v record; diff int := 0;
  function_ok boolean;
begin
  select id into c_g from public.venues where kind = 'dealer_team' limit 1;

  -- ① 라이브 전 쌍 동치(옛 정의를 그대로 식으로 써서 비교)
  for r in select id from public.profiles union all select null loop
    perform set_config('request.jwt.claims', case when r.id is null then '' else json_build_object('sub', r.id, 'role', 'authenticated')::text end, true);
    for v in select id from public.venues loop
      if public.can_manage_venue(v.id) is distinct from public.can_manage_pos(v.id) then diff := diff + 1; end if;
    end loop;
  end loop;
  if diff <> 0 then raise exception 'FAIL: 위임 뒤 can_manage_venue ≠ can_manage_pos (%쌍)', diff; end if;

  -- 양성: 대표·관리자
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner, 'role', 'authenticated')::text, true);
  if not public.can_manage_venue(c_r) then raise exception 'FAIL: 대표가 거부됐다'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  if not public.can_manage_venue(c_r) then raise exception 'FAIL: 관리자가 거부됐다'; end if;

  -- 음성: 비로그인·소속 없는 회원
  perform set_config('request.jwt.claims', '', true);
  if public.can_manage_venue(c_r) then raise exception 'FAIL: 비로그인이 통과'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_user, 'role', 'authenticated')::text, true);
  if public.can_manage_venue(c_r) then raise exception 'FAIL: 소속 없는 회원이 통과'; end if;

  -- 넓어짐 ①: role 'user' 인 승인 공동 운영자 — 옛것은 거부, 새것은 통과(그리고 주소 RPC 가 실제로 저장)
  update public.profiles set approved = true where id = c_user;
  insert into public.venue_owners(venue_id, user_id, status) values (c_r, c_user, 'approved');
  if not public.can_manage_venue(c_r) then raise exception 'FAIL: 승인 공동 운영자(role user)가 거부됐다'; end if;
  execute 'set local role authenticated';
  perform public.update_venue_address(c_r, '리허설 주소');
  execute 'reset role';
  if (select address from public.venues where id = c_r) is distinct from '리허설 주소' then raise exception 'FAIL: 공동 운영자 주소 저장이 반영되지 않았다'; end if;

  -- 음성: 미승인(pending) 공동 운영자
  update public.venue_owners set status = 'pending' where venue_id = c_r and user_id = c_user;
  if public.can_manage_venue(c_r) then raise exception 'FAIL: 미승인 공동 운영자가 통과'; end if;
  execute 'set local role authenticated';
  function_ok := false;
  begin perform public.update_venue_address(c_r, '거부돼야 함'); exception when others then function_ok := true; end;
  execute 'reset role';
  if not function_ok then raise exception 'FAIL: 미승인 공동 운영자의 주소 저장이 통과'; end if;

  -- 음성: 정지 중인 대표
  update public.profiles set status = 'suspended', suspended_until = now() + interval '1 day' where id = c_owner;
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner, 'role', 'authenticated')::text, true);
  if public.can_manage_venue(c_r) then raise exception 'FAIL: 정지 중인 대표가 통과'; end if;

  -- 좁아짐 ④ 확인: 그룹(dealer_team) 은 관리자 외 거부
  if c_g is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', (select owner_id from public.venues where id = c_g), 'role', 'authenticated')::text, true);
    if (select role from public.profiles where id = (select owner_id from public.venues where id = c_g)) is distinct from 'admin'
       and public.can_manage_venue(c_g) then raise exception 'FAIL: 그룹 대표가 매장 관리로 통과'; end if;
  end if;

  raise exception 'REHEARSAL_OK 20261001l pairs_diff=0';
end $$;
*/
