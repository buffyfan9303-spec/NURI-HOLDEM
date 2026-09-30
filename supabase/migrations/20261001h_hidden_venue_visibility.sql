-- ⏳ 미적용 초안(2026-10-01 · 서버 초안 담당). 적용은 리드가 MCP execute_sql 로 한다. 적용 뒤 이 줄을 "✅ 적용 완료 + 실측값" 으로 바꿔라.
--    롤백 리허설: 이 파일 본문 + 맨 아래 REHEARSAL 블록을 한 트랜잭션으로 돌려 REHEARSAL_OK(raise 로 되돌림) 확인 — admin-srv-report.md 참고.
--    20261001d(보관 = status 'hidden') 와 짝이다. 순서는 d 뒤가 자연스럽지만 서로 의존하지 않는다(hidden 은 이미 있는 enum 값).
-- 20261001h — 오너 결정(2026-10-01, 리드 전달): 숨긴(hidden) 매장은 "매장 자체는 숨기고 순위 기록은 유지".
--
-- 라이브 실측(바꾸기 전):
--   · venues_select = approved OR 대표 OR 관리자 → 숨긴 매장도 비로그인이 id 로 직접 읽는다(상세 링크·지도 좌표·getVenueContactInfo 등).
--     손님 목록 getVenues 만 클라이언트가 status='active' 로 거른다(src/api/community.ts:233).
--   · venue_reviews_read = true → 숨긴 매장 리뷰가 공개.
--   · schedules_select 는 이미 venue_is_hidden() 으로 거른다(비활성 전체) — 이 파일은 손대지 않는다.
--   · 순위: venue_rankings 읽기 true · global_ranking_totals·ranking_top_venues·my_ranking_history 는 SECURITY DEFINER →
--     venues RLS 와 무관하게 계속 집계·표시된다. 이 파일은 순위 쪽을 바꾸지 않는다(오너: 순위 기록 유지).
-- 무엇을 바꾸나:
--   ① venue_hidden_for_viewer(venue_id): 매장이 'hidden' 이고 보는 사람이 대표·관리자·장부 권한자(can_access_ledger = 공동 사장·
--      권한 받은 직원)가 아니면 true. SECURITY DEFINER(정책 안에서 venues RLS 에 다시 걸리지 않게).
--   ② venues_select: 공개 조건 `approved` 에 `and not venue_hidden_for_viewer(id)` 를 더한다. 대표·관리자 절은 그대로.
--   ③ venue_reviews_read: `true` → `not venue_hidden_for_viewer(venue_id)`.
--   'hidden' 만 대상이다(정지·비활성 매장의 노출은 이번 결정 범위 밖 — 그대로 둔다).
-- 알려진 영향(화면 쪽, 보고서 참고): 내 입상 기록 getMyRankingHistory(src/api/rankings.ts:507-520)는 venue_rankings 에
--   venues(name) 을 붙여 읽으므로 숨긴 매장 이름이 '(매장)' 으로 바뀐다(기록 행은 그대로). 이름까지 유지하려면
--   이미 있는 my_ranking_history RPC(SECURITY DEFINER, venue_name 반환)로 바꾸면 된다.

-- 적용 전 게이트: 두 정책이 초안 작성 때 읽은 것과 같을 때만(정책 식 md5).
do $$
begin
  if (select md5(qual) from pg_policies where schemaname = 'public' and tablename = 'venues' and policyname = 'venues_select')
       is distinct from 'ad1b269bdde03dfa959c1f9fd05c15f4' then
    raise exception '20261001h 게이트: venues_select 가 초안 작성 때와 다르다';
  end if;
  if (select md5(qual) from pg_policies where schemaname = 'public' and tablename = 'venue_reviews' and policyname = 'venue_reviews_read')
       is distinct from 'b326b5062b2f0e69046810717534cb09' then
    raise exception '20261001h 게이트: venue_reviews_read 가 초안 작성 때와 다르다';
  end if;
  if (select relforcerowsecurity from pg_class where oid = 'public.venues'::regclass) then
    raise exception '20261001h 게이트: venues 에 FORCE RLS 가 켜졌다 — 판정 함수가 자기 자신 RLS 에 걸린다';
  end if;
end $$;

create or replace function public.venue_hidden_for_viewer(p_venue_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.venues v
     where v.id = p_venue_id
       and v.status = 'hidden'::public.venue_status
       and v.owner_id is distinct from auth.uid()
       and coalesce(public.my_role() = 'admin'::user_role, false) is false
       and coalesce(public.can_access_ledger(p_venue_id), false) is false
  );
$function$;

-- 읽기 판정 함수 — 정책이 anon 세션에서도 부르므로 venue_is_hidden 과 같은 ACL.
revoke all on function public.venue_hidden_for_viewer(uuid) from public;
grant execute on function public.venue_hidden_for_viewer(uuid) to anon, authenticated, service_role;

alter policy venues_select on public.venues
  using (((approved = true) and not public.venue_hidden_for_viewer(id))
         or (owner_id = (select auth.uid()))
         or (my_role() = 'admin'::user_role));

alter policy venue_reviews_read on public.venue_reviews
  using (not public.venue_hidden_for_viewer(venue_id));

-- 자가검사
do $$
begin
  if (select qual from pg_policies where tablename = 'venues' and policyname = 'venues_select') !~ 'venue_hidden_for_viewer' then
    raise exception '20261001h: venues_select 에 숨김 판정이 없다';
  end if;
  if (select qual from pg_policies where tablename = 'venue_reviews' and policyname = 'venue_reviews_read') !~ 'venue_hidden_for_viewer' then
    raise exception '20261001h: venue_reviews_read 에 숨김 판정이 없다';
  end if;
  if not has_function_privilege('anon', 'public.venue_hidden_for_viewer(uuid)', 'execute') then
    raise exception '20261001h: 판정 함수를 anon 이 못 불러 비로그인 목록이 깨진다';
  end if;
  if pg_get_functiondef('public.venue_hidden_for_viewer(uuid)'::regprocedure) !~ 'search_path TO ''public'', ''pg_temp''' then
    raise exception '20261001h: search_path 고정 누락';
  end if;
end $$;

/* REHEARSAL — 운영 DB 에서 `begin; <이 파일 본문>; <아래 블록>` 을 한 번에 돌린다. 끝의 raise 가 전부 되돌린다.
   계정·대상(2026-10-01 조회):
     ADMIN c8e3734d(admin · 매장 dddd…0001 대표) · OWNER 7e435684(venue_owner · 매장 f35b42d1 대표) · USER fd14c2dc(user, 소유 0)
     매장 R = f35b42d1-2d54-4905-95c1-1fda24e0f178 (승인 포스터 4) · 매장 K = dddd0000-0000-4000-8000-000000000001 (venue_rankings 8행 — 순위 유지 대조)
     매장 A = d0e20929-5eed-4000-8000-00000000a001 (숨기지 않음 — 공개 유지 대조)
-- ▼REHEARSAL
do $$
declare
  c_admin uuid := 'c8e3734d-028d-4b69-86c9-a6d75c36601c';
  c_owner uuid := '7e435684-2c8c-458d-985c-31b784a44893';
  c_user  uuid := 'fd14c2dc-d994-46e4-8f12-b6cf38104983';
  c_r uuid := 'f35b42d1-2d54-4905-95c1-1fda24e0f178';
  c_k uuid := 'dddd0000-0000-4000-8000-000000000001';
  c_a uuid := 'd0e20929-5eed-4000-8000-00000000a001';
  v_rk0 int; v_grt0 int; v_top0 int; n int;
begin
  -- 준비(postgres): R 에 리뷰 1건
  insert into public.venue_reviews(venue_id, user_id, nickname, rating, content) values (c_r, c_user, 'x', 5, '리허설');

  -- 숨기기 전 비로그인 기준값(대조가 의미 있는지 확인)
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  select count(*) into n from public.venues where id in (c_r, c_k);
  if n <> 2 then raise exception 'FAIL: 준비 — 숨기기 전 비로그인이 두 매장을 못 본다(%)', n; end if;
  select count(*) into v_rk0 from public.venue_rankings where venue_id = c_k;
  select count(*) into v_grt0 from public.global_ranking_totals(null);
  execute 'reset role';
  if v_rk0 = 0 or v_grt0 = 0 then raise exception 'FAIL: 준비 — 순위 기준값이 0(%, %)', v_rk0, v_grt0; end if;

  update public.venues set status = 'hidden' where id in (c_r, c_k);

  -- 음성 1: 비로그인 — 매장 행·리뷰·일정 0, 숨기지 않은 매장 A 는 보임
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  if (select count(*) from public.venues where id in (c_r, c_k)) <> 0 then raise exception 'FAIL: 비로그인이 숨긴 매장을 본다'; end if;
  if (select count(*) from public.venue_reviews where venue_id = c_r) <> 0 then raise exception 'FAIL: 비로그인이 숨긴 매장 리뷰를 본다'; end if;
  if (select count(*) from public.schedules where venue_id = c_r) <> 0 then raise exception 'FAIL: 비로그인이 숨긴 매장 일정을 본다'; end if;
  if (select count(*) from public.venues where id = c_a) <> 1 then raise exception 'FAIL: 숨기지 않은 매장까지 사라졌다'; end if;
  -- 양성 1: 순위 기록 유지(비로그인)
  if (select count(*) from public.venue_rankings where venue_id = c_k) <> v_rk0 then raise exception 'FAIL: 숨김이 매장 순위 행을 가렸다'; end if;
  if (select count(*) from public.global_ranking_totals(null)) <> v_grt0 then raise exception 'FAIL: 숨김이 전국 순위 집계를 바꿨다'; end if;
  execute 'reset role';

  -- 음성 2: 다른 회원(USER) — 매장 행·리뷰·일정 0, 순위 유지
  perform set_config('request.jwt.claims', json_build_object('sub', c_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if (select count(*) from public.venues where id in (c_r, c_k)) <> 0 then raise exception 'FAIL: 다른 회원이 숨긴 매장을 본다'; end if;
  if (select count(*) from public.venue_reviews where venue_id = c_r) <> 0 then raise exception 'FAIL: 다른 회원이 숨긴 매장 리뷰를 본다(자기 리뷰 포함)'; end if;
  if (select count(*) from public.schedules where venue_id = c_r) <> 0 then raise exception 'FAIL: 다른 회원이 숨긴 매장 일정을 본다'; end if;
  if (select count(*) from public.venue_rankings where venue_id = c_k) <> v_rk0 then raise exception 'FAIL: 회원 순위 행이 가려졌다'; end if;
  execute 'reset role';

  -- 양성 2: 대표(OWNER) — 자기 숨긴 매장 R 의 행·리뷰·일정이 보이고, 남의 숨긴 매장 K 는 안 보인다
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if (select count(*) from public.venues where id = c_r) <> 1 then raise exception 'FAIL: 대표가 자기 숨긴 매장을 못 본다'; end if;
  if (select count(*) from public.venue_reviews where venue_id = c_r) <> 1 then raise exception 'FAIL: 대표가 자기 매장 리뷰를 못 본다'; end if;
  if (select count(*) from public.schedules where venue_id = c_r) = 0 then raise exception 'FAIL: 대표가 자기 매장 일정을 못 본다'; end if;
  if (select count(*) from public.venues where id = c_k) <> 0 then raise exception 'FAIL: 대표가 남의 숨긴 매장을 본다'; end if;
  execute 'reset role';

  -- 양성 3: 관리자 — 둘 다 보인다
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if (select count(*) from public.venues where id in (c_r, c_k)) <> 2 then raise exception 'FAIL: 관리자가 숨긴 매장을 못 본다'; end if;
  if (select count(*) from public.venue_reviews where venue_id = c_r) <> 1 then raise exception 'FAIL: 관리자가 숨긴 매장 리뷰를 못 본다'; end if;
  execute 'reset role';

  -- 되돌리기(보관 해제에 해당) 뒤 비로그인에게 다시 보인다
  update public.venues set status = 'active' where id in (c_r, c_k);
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  if (select count(*) from public.venues where id in (c_r, c_k)) <> 2 then raise exception 'FAIL: 해제 뒤에도 안 보인다'; end if;
  if (select count(*) from public.venue_reviews where venue_id = c_r) <> 1 then raise exception 'FAIL: 해제 뒤 리뷰가 안 보인다'; end if;
  execute 'reset role';

  raise exception 'REHEARSAL_OK 20261001h';
end $$;
-- ▲REHEARSAL
*/
