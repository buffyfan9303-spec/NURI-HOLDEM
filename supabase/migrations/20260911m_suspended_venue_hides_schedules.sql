-- ============================================================================
-- 20260911m — 매장 '정지·숨김' 제재가 포스터·라이브 클락·신규 예약까지 닿게
--             (2026-09-11 · A-매장정지)
--
-- 무엇이 잘못됐나
--   venues.status 는 '노출 안 함'을 뜻하는데(20260602f 머리말: inactive=폐업 / suspended=제재 /
--   hidden=잠시 내림), 실제로 그 상태를 보는 곳은 매장 목록 한 곳뿐이다
--   (src/api/community.ts getVenues 의 .eq('status','active')).
--     · schedules 읽기 정책(baseline 5266행)은 매장 상태를 아예 보지 않는다
--       → 정지 매장 대회 포스터가 탐색·홈·캘린더·라이브에 그대로 남는다.
--     · clock_states 공개 읽기(baseline 4879행)는 `using (true)` → 라이브 탭의
--       '지금 N게임 진행중'과 TV 딥링크가 정지 매장 클락을 계속 송출한다.
--     · sr_insert 는 `with check (user_id = auth.uid())` 뿐이라 딥링크·낡은 화면에서
--       정지 매장 대회에 새 예약이 계속 들어간다.
--   = 운영자가 '정지'를 눌러도 손님 쪽에서는 아무 일도 일어나지 않는다.
--
-- 상태 값 집합(확인함)
--   venue_status enum = active | inactive | suspended | hidden (20260602f:13)
--   venues.status = not null, default 'active' (20260602f:18 · baseline 874행) → null 불가.
--   셋 다 20260602f 머리말이 '노출 안 함'으로 정의했고 관리자 UI 4버튼과도 1:1이라,
--   판정은 'active 가 아니면 내린다' 한 줄이면 된다.
--
-- 왜 SECURITY DEFINER 헬퍼인가 (정책 안 서브쿼리가 아니라)
--   RLS 정책식 안의 서브쿼리는 호출자 권한으로 돌아 venues 의 RLS 가 다시 걸린다.
--   정책에 exists 서브쿼리를 그대로 쓰면 venues_select(approved / owner / admin)에 걸려
--   **승인 전 매장의 포스터가 통째로 사라진다** — 이번 건과 무관한 행까지 지우는 회귀다.
--   그래서 판정을 정의자 권한 함수 한 곳으로 뺀다(my_role·can_access_ledger 와 같은 급).
--
-- ⚠ 이름에 `_` 를 붙이지 않는 이유 (사고 예방)
--   이 저장소의 보안 규약(CLAUDE.md · 20260902b:12 · 20260902c)은 '`_` 내부 함수는
--   anon·authenticated 모두 회수'다. 그런데 이 함수는 RLS 가 **호출자 권한으로** 부르므로
--   anon EXECUTE 가 없으면 포스터·클락 읽기가 전부 42501 로 죽는다. `_` 를 달아 두면 다음
--   보안 점검이 규약대로 권한을 회수하다가 앱을 내린다. 기존 RLS 헬퍼(my_role·can_access_ledger·
--   can_manage_pos)처럼 언더스코어 없는 이름을 쓴다.
--
-- 설계
--   ① public.venue_is_hidden(uuid) — venue_id 가 null(pub_name 전용 포스터)이면 false(=통과).
--   ② schedules_select — 공개 분기에만 AND 로 붙인다. 업주·운영자 분기는 원문 그대로.
--      공개 분기 안에 can_access_ledger 를 OR 로 두는 이유: 공동업주(venue_owners)·장부 권한자
--      (ledger_access)는 owner_id 가 아니라서, 이 항이 없으면 정지 매장 장부의 '오늘 대회 선택'
--      (NuriPosLedger.tsx 의 getSchedules 필터)이 빈다. `approved = true` 안쪽이라 노출은 넓어지지 않는다.
--   ③ clock_states_public_read — 같은 판정 + can_access_ledger. 이 표에는 업주 분기가 아예 없었으므로
--      이 항이 없으면 정지 매장 운영자가 자기 클락을 못 봐 진행 중인 게임을 마감조차 못 한다.
--   ④ 예약 — 새 정책을 만들지 않고 이미 있는 최후 게이트(trg_block_ended_reservation)에 조건을 더한다.
--      트리거는 RPC(reserve_schedule)와 테이블 직접 insert 양쪽에 걸리므로 문이 하나다.
--      취소(DELETE)는 막지 않는다 — sr_delete 의 user_id 분기를 그대로 두어 손님을 가두지 않는다.
--
-- 실시간(postgres_changes) 영향
--   · active 매장(=거의 전부): 정책 결과가 종전과 같아 이벤트 손실 0.
--   · 정지 매장 × 손님: 이벤트가 끊긴다 — 의도한 결과.
--   · 정지 매장 × 업주/공동업주/장부권한자: can_access_ledger 분기로 계속 받는다.
--   · ⚠ venues 는 supabase_realtime 퍼블리케이션에 **없다**(baseline 5464~5487 전수 확인).
--     그래서 '정지' 를 누른 순간 push 가 가는 게 아니라, 이미 열려 있는 화면은 다음 조회
--     (새로고침·탭 전환의 reloadSchedules/getRunningClocks)까지 포스터·클락을 계속 보여 준다.
--     서버는 그 시점부터 주지 않으므로 남는 것은 클라이언트 메모리·스냅샷뿐이다.
--   · 삭제(DELETE) 이벤트는 realtime 이 RLS 없이 PK 만 보내는데, 이 변경과 무관하다.
--
-- 멱등·비파괴: 데이터 변경 0행. 정책 2개 교체 · 함수 2개 create or replace · 신규 표/컬럼/RPC 없음.
-- 자가검사는 pg_policies.qual(pg_get_expr — 주석이 들어오지 않는다)만 본다 → prosrc 주석 함정 없음.
--
-- 롤백
--   drop policy if exists schedules_select on public.schedules;
--   create policy schedules_select on public.schedules for select to public
--     using (approved = true or owner_id = (select auth.uid()) or my_role() = 'admin'::user_role);
--   drop policy if exists clock_states_public_read on public.clock_states;
--   create policy clock_states_public_read on public.clock_states for select to public using (true);
--   그리고 _block_ended_reservation 을 20260726a 판으로 되돌린다(헬퍼 함수는 남아 있어도 무해).
-- ============================================================================

-- ── ① 단일 판정 헬퍼 ────────────────────────────────────────────────────────
-- exists 형태라 결과가 절대 null 이 아니다 → 정책의 `not (...)` 이 null 로 새지 않는다.
-- p_venue_id 가 null 이면 매칭 행이 없어 false = '내리지 않는다'(pub_name 전용 포스터 보호).
create or replace function public.venue_is_hidden(p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.venues v
     where v.id = p_venue_id
       and v.status is distinct from 'active'::venue_status
  );
$$;

-- RLS 정책이 **호출자 권한으로** 이 함수를 부른다. anon·authenticated 에 EXECUTE 가 없으면
-- 포스터·클락 읽기가 전부 42501 로 죽는다(my_role() 이 PUBLIC EXECUTE 인 것과 같은 이유).
-- `from anon` 만으로는 PUBLIC 기본 GRANT 가 남으므로 public 부터 회수하고 다시 건다.
-- (20260817f 의 schedule_reservations_for_owner 와 같은 패턴)
revoke all on function public.venue_is_hidden(uuid) from public;
grant execute on function public.venue_is_hidden(uuid) to anon, authenticated, service_role;

comment on function public.venue_is_hidden(uuid) is
  '매장이 노출 대상이 아닌가(status <> active). venue_id 가 null 이면 false. RLS 가 호출자 권한으로 부르는 헬퍼라 anon EXECUTE 를 회수하면 포스터·클락 읽기가 전부 막힌다 — 보안 점검 시 예외. (20260911m)';

-- ── ② 포스터(대회) 공개 읽기 ────────────────────────────────────────────────
-- 원문(baseline 5266행)에서 approved 분기에만 매장 상태를 AND 로 더했다.
-- `approved = true` 를 맨 왼쪽에 두는 이유는 성능이다 — 정상 매장 행은 헬퍼 1회(PK 조회)에서
-- 끝나고 can_access_ledger 까지 가지 않는다(탐색 목록은 한 번에 800행까지 읽는다).
-- my_role() 은 `(select ...)` 로 감싼다: STABLE 이라 문장당 1회 InitPlan 으로 접히고,
-- 종전의 행당 profiles 조회 800회가 사라진다(의미 변화 없음).
drop policy if exists schedules_select on public.schedules;
create policy schedules_select on public.schedules for select to public
  using (
    (
      approved = true
      and (
        not public.venue_is_hidden(venue_id)
        or coalesce(public.can_access_ledger(venue_id), false)   -- 비로그인은 null → false(fail-closed)
      )
    )
    or owner_id = (select auth.uid())
    or (select public.my_role()) is not distinct from 'admin'::user_role  -- NULL-safe
  );

-- ── ③ 라이브 클락 공개 읽기 ─────────────────────────────────────────────────
-- 20260623p 가 지웠던 중복 정책(clock_states_read, qual=true)이 되살아나 있으면 permissive OR 로
-- 이 변경이 통째로 무효가 된다. 한 줄 보험으로 같이 지운다(없으면 무해).
drop policy if exists clock_states_read on public.clock_states;
drop policy if exists clock_states_public_read on public.clock_states;
create policy clock_states_public_read on public.clock_states for select to public
  using (
    not public.venue_is_hidden(venue_id)
    or coalesce(public.can_access_ledger(venue_id), false)
  );

-- ── ④ 정지 매장 신규 예약 차단 ───────────────────────────────────────────────
-- 20260726a 의 최후 게이트에 한 조건을 더한다. RPC(reserve_schedule)와 테이블 직접 insert 가
-- 같은 문을 지나므로 판정이 두 벌이 되지 않는다. reserve_schedule 은 건드리지 않는다.
create or replace function public._block_ended_reservation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_venue uuid;
begin
  -- is not false → true(종료)는 물론 null(존재하지 않는 대회)도 차단. 판정 불가면 막는 쪽이 안전하다.
  if public._schedule_ended(new.schedule_id) is not false then
    raise exception '이미 종료된 대회입니다 — 예약할 수 없습니다';
  end if;
  select s.venue_id into v_venue from public.schedules s where s.id = new.schedule_id;
  if public.venue_is_hidden(v_venue) then
    raise exception '지금은 예약을 받지 않는 매장입니다';
  end if;
  return new;
end $function$;

revoke all on function public._block_ended_reservation() from public, anon, authenticated;
grant execute on function public._block_ended_reservation() to service_role;

-- 트리거 자체는 20260726a 것을 그대로 쓴다(before insert · for each row). 혹시 사라져 있으면
-- 게이트가 통째로 없는 것이라 없을 때만 다시 건다.
do $$
begin
  if not exists (
    select 1 from pg_trigger t
     where t.tgrelid = 'public.schedule_reservations'::regclass
       and t.tgname = 'trg_block_ended_reservation'
       and not t.tgisinternal
  ) then
    create trigger trg_block_ended_reservation
      before insert on public.schedule_reservations
      for each row execute function public._block_ended_reservation();
  end if;
end $$;

notify pgrst, 'reload schema';

-- ── ⑤ 자가검사 ──────────────────────────────────────────────────────────────
do $$
declare v_n int; v_q text; v_sid uuid; v_uid uuid;
begin
  -- (1) 가장 위험한 실수 — 헬퍼 EXECUTE 누락. 이게 없으면 포스터·클락 읽기가 전부 42501 로 죽는다.
  if not has_function_privilege('anon', 'public.venue_is_hidden(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.venue_is_hidden(uuid)', 'execute') then
    raise exception 'ABORT: venue_is_hidden 에 anon/authenticated EXECUTE 가 없다 — 포스터·클락 읽기가 전부 막힌다';
  end if;

  -- (2) 매장 미연결 포스터(pub_name 전용)는 반드시 통과해야 한다
  if public.venue_is_hidden(null) is not false then
    raise exception 'ABORT: venue_id 가 null 인 포스터가 가려진다';
  end if;

  -- (3) active 매장은 절대 가리지 않는다 (정상 매출 보호)
  select count(*) into v_n from public.venues v
   where v.status = 'active' and public.venue_is_hidden(v.id);
  if v_n > 0 then raise exception 'ABORT: active 매장 %건이 비활성으로 판정됨', v_n; end if;

  -- (4) 비-active 매장은 빠짐없이 잡힌다 (inactive·suspended·hidden 셋 다)
  select count(*) into v_n from public.venues v
   where v.status <> 'active' and not public.venue_is_hidden(v.id);
  if v_n > 0 then raise exception 'ABORT: 비활성 매장 %건이 active 로 판정됨', v_n; end if;

  -- (5) 정책이 실제로 갈아 끼워졌는가 + 업주·운영자 분기가 살아 있는가
  --     (qual 은 pg_get_expr 결과라 주석이 섞여 들어오지 않는다)
  select qual into v_q from pg_policies
   where schemaname = 'public' and tablename = 'schedules' and policyname = 'schedules_select';
  if v_q is null then raise exception 'ABORT: schedules_select 정책이 없다'; end if;
  if strpos(v_q, 'venue_is_hidden') = 0 then raise exception 'ABORT: schedules_select 에 매장 상태 조건이 없다'; end if;
  if strpos(v_q, 'owner_id') = 0 then raise exception 'ABORT: schedules_select 의 업주 분기가 사라졌다'; end if;
  if strpos(v_q, 'my_role') = 0 then raise exception 'ABORT: schedules_select 의 운영자 분기가 사라졌다'; end if;
  if strpos(v_q, 'approved') = 0 then raise exception 'ABORT: schedules_select 의 승인 조건이 사라졌다'; end if;

  select qual into v_q from pg_policies
   where schemaname = 'public' and tablename = 'clock_states' and policyname = 'clock_states_public_read';
  if v_q is null then raise exception 'ABORT: clock_states_public_read 정책이 없다'; end if;
  if strpos(v_q, 'venue_is_hidden') = 0 then raise exception 'ABORT: clock_states 공개 읽기에 매장 상태 조건이 없다'; end if;
  if strpos(v_q, 'can_access_ledger') = 0 then raise exception 'ABORT: 정지 매장 운영자가 자기 클락을 못 본다'; end if;

  -- (6) permissive SELECT 정책이 각각 하나뿐인가 — using(true) 짝이 하나라도 남으면 OR 로 전부 무효
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'clock_states'
     and cmd in ('SELECT', 'ALL') and permissive = 'PERMISSIVE';
  if v_n <> 1 then raise exception 'ABORT: clock_states 의 공개 SELECT 정책이 %개다(1 이어야 한다)', v_n; end if;

  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'schedules'
     and cmd in ('SELECT', 'ALL') and permissive = 'PERMISSIVE';
  if v_n <> 1 then raise exception 'ABORT: schedules 의 SELECT 정책이 %개다(1 이어야 한다)', v_n; end if;

  -- (7) 예약 차단이 실제로 도는가 — 비-active 매장의 아직 안 끝난 대회에 직접 insert
  --     (BEFORE INSERT 라 유니크 제약보다 트리거가 먼저 raise 한다 — 20260726a 와 같은 방식)
  select s.id into v_sid
    from public.schedules s
    join public.venues v on v.id = s.venue_id
   where v.status <> 'active'
     and public._schedule_ended(s.id) is false
   limit 1;
  select u.id into v_uid from auth.users u limit 1;
  if v_sid is not null and v_uid is not null then
    begin
      insert into public.schedule_reservations (schedule_id, user_id, display_name)
      values (v_sid, v_uid, '__migration_probe__');
      raise exception 'ABORT: 정지 매장 대회에 예약이 들어갔다';
    exception when others then
      if sqlerrm not like '%예약을 받지 않는 매장%' then raise; end if;
    end;
  else
    raise notice '주의: 대상 데이터가 없어 예약 차단 실행 검증은 건너뜀';
  end if;

  -- (8) 영향 범위 고지 — 적용 로그에 남겨 오너가 숫자를 눈으로 확인한다
  select count(*) into v_n from public.schedules s
   where s.approved and public.venue_is_hidden(s.venue_id);
  raise notice 'OK: 손님 화면에서 내려가는 승인 포스터 %건', v_n;

  select count(*) into v_n from public.clock_states c
   where public.venue_is_hidden(c.venue_id);
  raise notice 'OK: 라이브 보드에서 내려가는 클락 %건(그중 running 은 운영자 화면에만 남는다)', v_n;

  raise notice 'OK: 20260911m 매장 정지 → 포스터·클락·신규예약 차단 검증 완료';
end $$;
