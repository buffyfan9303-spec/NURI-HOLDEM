-- ⏳ 미적용 초안(2026-10-01 · 서버 초안 담당). 적용은 리드가 MCP execute_sql 로 한다. 적용 뒤 이 줄을 "✅ 적용 완료 + 실측값" 으로 바꿔라.
--    롤백 리허설: 이 파일 본문 + 맨 아래 REHEARSAL 블록을 한 트랜잭션으로 돌려 REHEARSAL_OK(raise 로 되돌림) 확인 — admin-srv-report.md 참고.
-- 20261001d — A-04: 관리자 '매장 삭제'가 venues 행 hard delete 라 ON DELETE CASCADE 44개 테이블(장부·이용권·출석·급여…)을
--             confirm 한 번으로 영구삭제하던 것.
--
-- 판단(왜 이렇게 했나):
--   · 숨김(보관)은 새 칸이 필요 없다 — venues.status 에 이미 'hidden' 이 있고(enum active·inactive·suspended·hidden),
--     손님 목록 getVenues 는 status='active' 만 읽는다(src/api/community.ts:233). 그래서 **숨김 전환 RPC + 감사 기록**만 더한다.
--   · 영구 삭제의 근본 차단은 **서버 트리거 한 곳**에 둔다: 기록 테이블에 행이 남아 있는 매장의 DELETE 는 누가 부르든 raise.
--     호출부(AdminTab 매장 삭제·VenueManagement 삭제·그룹 거절)가 전부 venues DELETE 를 지나므로 한 곳에서 막힌다.
--     기록이 없는 행(가입 대기 그룹 거절, 빈 미승인 매장)은 지금처럼 지워진다 → 기존 기능 보존.
--   · 업주 킬스위치 kill_venue(실명·비밀번호·남은 이용권 확인)는 자식 행을 먼저 지우고 마지막에 venues 를 지우므로 영향 없다.
--     보호 목록은 kill_venue 화이트리스트의 부분집합으로 골랐다(목록 밖 테이블 때문에 킬스위치가 막히지 않게).
--   · 관리자용 '강제 영구 삭제' RPC 는 **만들지 않았다**: 기록 있는 매장을 지울 운영상 이유가 확인되지 않았고(오너 결정 전),
--     필요하면 업주 kill_venue 또는 postgres 권한의 수동 절차로 충분하다. 숨김은 되돌릴 수 있고 삭제는 못 되돌린다.
--   · 삭제가 실제로 일어날 때도 audit_log 에 한 줄 남긴다(화면 AdminTab 경로는 기록이 없었다).

-- 적용 전 게이트
do $$
begin
  if md5(pg_get_functiondef('public.kill_venue(uuid,text,text)'::regprocedure)) is distinct from '014fc33d56426627d23181edd58d8813' then
    raise exception '20261001d 게이트: kill_venue 가 초안 작성 때와 다르다 — 보호 목록이 킬스위치 화이트리스트 안인지 다시 확인해라';
  end if;
  if md5(pg_get_functiondef('public._audit(text,text,jsonb)'::regprocedure)) is distinct from '0f191125e3cba9d94891c5e3493110ec' then
    raise exception '20261001d 게이트: _audit 정의가 초안 작성 때와 다르다';
  end if;
  if not ('hidden' = any(enum_range(null::public.venue_status)::text[])) then
    raise exception '20261001d 게이트: venue_status 에 hidden 이 없다';
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.venues'::regclass and tgname = 'trg_guard_venue_hard_delete') then
    raise exception '20261001d 게이트: trg_guard_venue_hard_delete 가 이미 있다(이미 적용됐나?)';
  end if;
end $$;

-- ① 기록이 있는 매장의 영구 삭제 차단 + 삭제 감사
create or replace function public._guard_venue_hard_delete()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tbl text; v_hit text[] := '{}'; v_has boolean;
  -- kill_venue 화이트리스트의 부분집합(20261001d). 목록 밖 테이블을 넣으면 업주 킬스위치가 막힌다.
  v_records text[] := array[
    'ledger_sessions','ledger_buyins','ledger_players','ledger_buyin_requests',
    'store_vouchers','checkins','staff_wage','staff_schedule','customer_aliases',
    'venue_reviews','venue_score_entries','venue_rankings','ranking_point_awards',
    'league_entries','voucher_credit_requests','schedules'];
begin
  foreach v_tbl in array v_records loop
    execute format('select exists (select 1 from public.%I where venue_id = $1)', v_tbl) into v_has using old.id;
    if v_has then v_hit := v_hit || v_tbl; end if;
  end loop;
  if cardinality(v_hit) > 0 then
    raise exception '장부·이용권·출석 등 기록이 있는 매장은 삭제할 수 없습니다 — 숨김(보관)으로 전환하세요 (%)',
      array_to_string(v_hit, ', ')
      using errcode = 'P0001';
  end if;
  perform public._audit('venue_delete', old.id::text,
    jsonb_build_object('name', old.name, 'kind', old.kind, 'owner_id', old.owner_id,
                       'approved', old.approved, 'db_user', current_user));
  return old;
end $function$;

revoke all on function public._guard_venue_hard_delete() from public, anon, authenticated;

drop trigger if exists trg_guard_venue_hard_delete on public.venues;
create trigger trg_guard_venue_hard_delete
  before delete on public.venues
  for each row execute function public._guard_venue_hard_delete();

-- ② 숨김(보관) 전환 — 관리자 전용, 감사 기록. 되돌리면 active.
create or replace function public.admin_set_venue_archived(p_venue_id uuid, p_archived boolean, p_reason text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_old public.venue_status;
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '운영자만 가능합니다';
  end if;
  if p_archived is null then raise exception '보관 여부가 필요합니다'; end if;
  select status into v_old from public.venues where id = p_venue_id for update;
  if not found then raise exception '매장을 찾을 수 없습니다'; end if;
  -- 검토 반영(review-admin-srv-1001 d:86-91): 해제는 숨김 매장만 active 로 — 정지(suspended)·비활성(inactive)이 풀리지 않게.
  if not p_archived and v_old is distinct from 'hidden'::public.venue_status then
    raise exception '숨김(보관) 상태인 매장만 해제할 수 있습니다 (현재 %)', v_old;
  end if;
  -- 보관은 활성 매장만(리드 결정 10-01): 정지·비활성 매장을 보관→해제하면 이전 상태가 active 로 바뀌어 사라진다.
  if p_archived and v_old is distinct from 'active'::public.venue_status then
    raise exception '활성(active) 매장만 보관할 수 있습니다 (현재 %)', v_old;
  end if;
  update public.venues
     set status = case when p_archived then 'hidden'::public.venue_status else 'active'::public.venue_status end,
         updated_at = now()
   where id = p_venue_id;
  perform public._audit(case when p_archived then 'venue_archive' else 'venue_unarchive' end, p_venue_id::text,
    jsonb_build_object('from', v_old, 'reason', left(nullif(btrim(p_reason), ''), 200)));
end $function$;

revoke all on function public.admin_set_venue_archived(uuid,boolean,text) from public, anon;
grant execute on function public.admin_set_venue_archived(uuid,boolean,text) to authenticated, service_role;

-- 자가검사
do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.venues'::regclass
                  and tgname = 'trg_guard_venue_hard_delete' and tgenabled <> 'D') then
    raise exception '20261001d: 삭제 가드 트리거가 없다';
  end if;
  if has_function_privilege('anon', 'public.admin_set_venue_archived(uuid,boolean,text)', 'execute') then
    raise exception '20261001d: 보관 RPC 가 anon 에 열려 있다';
  end if;
  if not has_function_privilege('authenticated', 'public.admin_set_venue_archived(uuid,boolean,text)', 'execute') then
    raise exception '20261001d: 보관 RPC 가 authenticated 에 닫혔다';
  end if;
  if position('숨김(보관) 상태인 매장만 해제할 수 있습니다' in pg_get_functiondef('public.admin_set_venue_archived(uuid,boolean,text)'::regprocedure)) = 0 then
    raise exception '20261001d: 보관 해제가 이전 상태를 보지 않는다';
  end if;
  if position('활성(active) 매장만 보관할 수 있습니다' in pg_get_functiondef('public.admin_set_venue_archived(uuid,boolean,text)'::regprocedure)) = 0 then
    raise exception '20261001d: 보관이 이전 상태를 보지 않는다';
  end if;
  if has_function_privilege('authenticated', 'public._guard_venue_hard_delete()', 'execute')
     or has_function_privilege('anon', 'public._guard_venue_hard_delete()', 'execute') then
    raise exception '20261001d: 트리거 함수가 클라이언트에 열려 있다';
  end if;
  -- 보호 목록 ⊆ kill_venue 화이트리스트
  if exists (
      select 1 from unnest(array['ledger_sessions','ledger_buyins','ledger_players','ledger_buyin_requests',
        'store_vouchers','checkins','staff_wage','staff_schedule','customer_aliases','venue_reviews',
        'venue_score_entries','venue_rankings','ranking_point_awards','league_entries','voucher_credit_requests','schedules']) t
       where position('''' || t || '''' in pg_get_functiondef('public.kill_venue(uuid,text,text)'::regprocedure)) = 0) then
    raise exception '20261001d: 보호 테이블 중 kill_venue 가 먼저 지우지 않는 것이 있다';
  end if;
end $$;

/* REHEARSAL — 운영 DB 에서 `begin; <이 파일 본문>; <아래 블록>` 을 한 번에 돌린다. 끝의 raise 가 전부 되돌린다.
   계정·대상(2026-10-01 조회):
     ADMIN  c8e3734d-028d-4b69-86c9-a6d75c36601c  admin
     OWNER  7e435684-2c8c-458d-985c-31b784a44893  venue_owner · 매장 f35b42d1 대표
     매장 R = f35b42d1-2d54-4905-95c1-1fda24e0f178 (장부 세션 1·바인 27·포스터 4 — 기록 있음)
     매장 E = 615376fa-ffc4-420b-85a0-b9847520c12f (미승인·기록 0 — 삭제 양성 대조)
     그룹 G = 9cf562bd-26ab-4567-93c8-23ea4e7d567f (dealer_team · 멤버 1 — 그룹 삭제 경로 양성 대조)
-- ▼REHEARSAL
do $$
declare
  c_admin uuid := 'c8e3734d-028d-4b69-86c9-a6d75c36601c';
  c_owner uuid := '7e435684-2c8c-458d-985c-31b784a44893';
  c_r uuid := 'f35b42d1-2d54-4905-95c1-1fda24e0f178';
  c_e uuid := '615376fa-ffc4-420b-85a0-b9847520c12f';
  c_g uuid := '9cf562bd-26ab-4567-93c8-23ea4e7d567f';
  v_n int; v_st text; v_lb0 int; v_lb1 int;
begin
  select count(*) into v_lb0 from public.ledger_buyins where venue_id = c_r;

  -- 음성 1: 관리자(authenticated + RLS)가 기록 있는 매장 직접 DELETE → raise, 행·장부 그대로
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    delete from public.venues where id = c_r;
    raise exception 'FAIL: 기록 있는 매장 삭제 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%기록이 있는 매장은 삭제할 수 없습니다%' then raise exception 'FAIL: 엉뚱한 오류로 막힘: %', sqlerrm; end if;
  end;
  execute 'reset role';
  -- 음성 2: postgres(서비스 경로)로도 막힌다
  begin delete from public.venues where id = c_r; raise exception 'FAIL: postgres 삭제 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%기록이 있는 매장은 삭제할 수 없습니다%' then raise exception 'FAIL: 엉뚱한 오류(기대: 기록이 있는 매장은 삭제할 수 없습니다): %', sqlerrm; end if; end;
  select count(*) into v_lb1 from public.ledger_buyins where venue_id = c_r;
  if v_lb1 <> v_lb0 or not exists (select 1 from public.venues where id = c_r) then raise exception 'FAIL: 기록 소실'; end if;

  -- 양성 1: 기록 없는 미승인 매장은 관리자가 지울 수 있고 감사가 남는다
  execute 'set local role authenticated';
  delete from public.venues where id = c_e;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_n <> 1 then raise exception 'FAIL: 빈 매장 삭제 실패(%)', v_n; end if;
  if not exists (select 1 from public.audit_log where action = 'venue_delete' and target = c_e::text and actor_id = c_admin) then
    raise exception 'FAIL: 삭제 감사 없음';
  end if;
  -- 양성 2: 그룹(멤버만 있는 행) 삭제 경로 유지 — 그룹 거절 기능 보존
  execute 'set local role authenticated';
  delete from public.venues where id = c_g;
  get diagnostics v_n = row_count;
  execute 'reset role';
  if v_n <> 1 then raise exception 'FAIL: 그룹 삭제 경로 막힘'; end if;

  -- 숨김(보관): 비로그인·업주 거절, 관리자 통과 + 감사, 장부 보존, 되돌리기
  perform set_config('request.jwt.claims', '', true);
  begin perform public.admin_set_venue_archived(c_r, true, 'x'); raise exception 'FAIL: 비로그인 보관 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%운영자만 가능합니다%' then raise exception 'FAIL: 엉뚱한 오류(기대: 운영자만 가능합니다): %', sqlerrm; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner, 'role', 'authenticated')::text, true);
  begin perform public.admin_set_venue_archived(c_r, true, 'x'); raise exception 'FAIL: 업주 보관 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%운영자만 가능합니다%' then raise exception 'FAIL: 엉뚱한 오류(기대: 운영자만 가능합니다): %', sqlerrm; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform public.admin_set_venue_archived(c_r, true, '리허설');
  select status::text into v_st from public.venues where id = c_r;
  if v_st <> 'hidden' then raise exception 'FAIL: 보관 상태 %', v_st; end if;
  if not exists (select 1 from public.audit_log where action = 'venue_archive' and target = c_r::text and actor_id = c_admin) then
    raise exception 'FAIL: 보관 감사 없음';
  end if;
  if (select count(*) from public.ledger_buyins where venue_id = c_r) <> v_lb0 then raise exception 'FAIL: 보관이 장부를 건드림'; end if;
  perform public.admin_set_venue_archived(c_r, false, null);
  select status::text into v_st from public.venues where id = c_r;
  if v_st <> 'active' then raise exception 'FAIL: 보관 해제 실패'; end if;
  -- 음성(검토 반례): 정지 매장 '해제' → raise, 상태 suspended 그대로 / 정지 매장 보관 → raise
  update public.venues set status = 'suspended' where id = c_r;
  begin perform public.admin_set_venue_archived(c_r, false, null); raise exception 'FAIL: 정지 매장 해제 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%숨김(보관) 상태인 매장만 해제할 수 있습니다%' then raise exception 'FAIL: 엉뚱한 오류: %', sqlerrm; end if; end;
  begin perform public.admin_set_venue_archived(c_r, true, null); raise exception 'FAIL: 정지 매장 보관 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%활성(active) 매장만 보관할 수 있습니다%' then raise exception 'FAIL: 엉뚱한 오류: %', sqlerrm; end if; end;
  select status::text into v_st from public.venues where id = c_r;
  if v_st <> 'suspended' then raise exception 'FAIL: 정지 상태가 바뀜 %', v_st; end if;
  -- 음성(리드 보강): 비활성 매장 보관 → raise, 상태 inactive 유지
  update public.venues set status = 'inactive' where id = c_r;
  begin perform public.admin_set_venue_archived(c_r, true, null); raise exception 'FAIL: 비활성 매장 보관 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%활성(active) 매장만 보관할 수 있습니다%' then raise exception 'FAIL: 엉뚱한 오류: %', sqlerrm; end if; end;
  select status::text into v_st from public.venues where id = c_r;
  if v_st <> 'inactive' then raise exception 'FAIL: 비활성 상태가 바뀜 %', v_st; end if;

  raise exception 'REHEARSAL_OK 20261001d';
end $$;
-- ▲REHEARSAL
*/
