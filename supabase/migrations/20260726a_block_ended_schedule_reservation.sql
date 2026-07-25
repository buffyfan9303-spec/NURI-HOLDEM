-- 2026-07-26 종료된 대회 예약 차단 (감사: 돈·데이터 오염)
--
-- 문제: 끝난 대회에도 예약이 그대로 들어간다. 손님은 참가된 줄 알고, 업주 명단엔 유령 예약이 남는다.
--       실데이터: schedule_reservations 2건이 전부 대회 종료 뒤(+31시간, +14일)에 생성됐다.
-- 더 큰 구멍: sr_insert 정책이 with check (user_id = auth.uid()) 뿐이라 RPC 를 거치지 않고
--       테이블에 직접 insert 하면 닉네임 중복 검사까지 통째로 우회된다.
--       → 게이트를 RPC 가 아니라 BEFORE INSERT 트리거에 둔다(양쪽 경로 모두 차단).
-- 급한 이유: trg_event_open_first_reserve(2026-07-20~08-03 활성)가 '첫 예약'에 활동점수 +50 을 준다.
--       지금 상태면 1년 전 포스터를 눌러 점수를 긁을 수 있다.

-- ── ① 단일소스 판정 헬퍼 ─────────────────────────────────────────────────────
-- 종료 판정 = '대회일이 지났고' + '시작 + 10시간이 지났다' 두 조건을 모두 만족할 때만.
--
-- 왜 날짜만으로는 안 되나: 실데이터 대회는 19:30 시작에 레지 마감이 '16LV 01:44'(익일 새벽)다.
--   날짜만 보면 자정을 넘는 순간 현장에서 레이트 레지 중인 손님의 정상 예약을 서버가 거절한다(매출 차단).
-- 왜 '시작+10시간'만으로도 안 되나: start_time 을 오타로 넣은 포스터(예: 09:00)가 있으면
--   대회 당일 19시부터 정상 예약이 막힌다. 서버가 정상 매출을 막는 사고는 유령 예약보다 나쁘다.
--   → 대회 '당일'에는 서버가 절대 막지 않는다. 당일 종료 표시는 화면(종료 뱃지)이 담당하고,
--     서버 게이트는 '지난 대회를 나중에 눌러 예약'만 막는 최후 방어선 역할만 한다.
-- duration('25/15')·reg_close_time('16LV 01:44')은 자유 텍스트라 서버에서 파싱하지 않는다
--   (파싱 실패로 정상 예약을 막는 위험 > 정밀도 이득).
create or replace function public._schedule_ended(p_schedule_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select ((now() at time zone 'Asia/Seoul')::date > s.date)
     and ((now() at time zone 'Asia/Seoul')
          >= (s.date + coalesce(s.start_time, time '19:00')) + interval '10 hours')
  from public.schedules s where s.id = p_schedule_id;
$$;
-- 내부 전용(트리거·RPC 만 호출). 신규 CREATE 는 PUBLIC 기본 EXECUTE 가 붙으므로 명시 revoke 필요
-- (create-or-replace 와 달리 신규 CREATE 는 ACL 이 리셋된다 — 06-24 감사에서 확인된 gotcha).
revoke all on function public._schedule_ended(uuid) from public, anon, authenticated;
grant execute on function public._schedule_ended(uuid) to service_role;

-- ── ② 게이트: 종료된 대회 예약 insert 차단 ───────────────────────────────────
-- 왜 트리거인가: RPC 만 막으면 sr_insert 정책상 테이블 직접 insert 로 우회된다.
--   트리거는 SECURITY DEFINER RPC 의 insert(RLS 우회 경로)에도 걸리므로 두 문을 한 곳에서 닫는다.
create or replace function public._block_ended_reservation()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  -- is not false → true(종료)는 물론 null(존재하지 않는 대회)도 차단. 판정 불가면 막는 쪽이 안전하다.
  if public._schedule_ended(new.schedule_id) is not false then
    raise exception '이미 종료된 대회입니다 — 예약할 수 없습니다';
  end if;
  return new;
end $function$;
revoke all on function public._block_ended_reservation() from public, anon, authenticated;
grant execute on function public._block_ended_reservation() to service_role;

drop trigger if exists trg_block_ended_reservation on public.schedule_reservations;
create trigger trg_block_ended_reservation
  before insert on public.schedule_reservations
  for each row execute function public._block_ended_reservation();

-- ── ③ RPC 앞단에도 같은 판정 — 정확한 메시지 + 불필요한 트리거 진입 방지 ────────
-- create or replace 로 교체해야 ACL(anon/authenticated EXECUTE)이 보존된다.
create or replace function public.reserve_schedule(p_schedule_id uuid, p_name text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  -- 끝난 대회 차단 — 유령 예약(업주 명단 오염) + 오픈이벤트 첫예약 보너스 어뷰징 방지.
  -- 최종 게이트는 trg_block_ended_reservation 이고, 여기서도 같은 헬퍼를 써 판정이 갈리지 않게 한다.
  if public._schedule_ended(p_schedule_id) is not false then
    raise exception '이미 종료된 대회입니다 — 예약할 수 없습니다';
  end if;
  if v_name = '' then v_name := '예약자'; end if;
  v_name := left(v_name, 30);
  if exists (
    select 1 from schedule_reservations
    where schedule_id = p_schedule_id
      and lower(display_name) = lower(v_name)
      and user_id <> v_uid
  ) then
    raise exception '이미 등록된 닉네임입니다';
  end if;
  insert into schedule_reservations (schedule_id, user_id, display_name)
  values (p_schedule_id, v_uid, v_name)
  on conflict (schedule_id, user_id) do update set display_name = excluded.display_name;
end;
$function$;

-- ── ④ 자기검증 ──────────────────────────────────────────────────────────────
do $$
declare v_bad int; v_sid uuid; v_uid uuid;
begin
  -- (1) 이틀 이상 지난 대회는 전부 '종료'로 판정돼야 한다
  select count(*) into v_bad from public.schedules s
   where s.date < ((now() at time zone 'Asia/Seoul')::date - 1)
     and public._schedule_ended(s.id) is distinct from true;
  if v_bad > 0 then raise exception '검증 실패: 이틀 이상 지난 대회 %건이 종료로 판정되지 않음', v_bad; end if;

  -- (2) 예정 대회는 절대 종료가 아니어야 한다
  select count(*) into v_bad from public.schedules s
   where s.date > (now() at time zone 'Asia/Seoul')::date
     and public._schedule_ended(s.id) is distinct from false;
  if v_bad > 0 then raise exception '검증 실패: 예정 대회 %건이 종료로 판정됨', v_bad; end if;

  -- (3) 오늘 열리는 대회는 시각과 무관하게 절대 막히면 안 된다(정상 매출 보호)
  select count(*) into v_bad from public.schedules s
   where s.date = (now() at time zone 'Asia/Seoul')::date
     and public._schedule_ended(s.id) is distinct from false;
  if v_bad > 0 then raise exception '검증 실패: 오늘 대회 %건이 종료로 판정됨(당일은 막지 않는다)', v_bad; end if;

  -- (4) 존재하지 않는 대회 → null (트리거가 fail-closed 로 막는 전제)
  if public._schedule_ended('00000000-0000-0000-0000-000000000000'::uuid) is not null then
    raise exception '검증 실패: 없는 대회에 대해 null 이 아님';
  end if;

  -- (5) 트리거가 실제로 막는가 — 종료된 대회에 직접 insert 시도(반드시 예외, 행은 남지 않음)
  select s.id into v_sid from public.schedules s where public._schedule_ended(s.id) order by s.date limit 1;
  select u.id into v_uid from auth.users u limit 1;
  if v_sid is not null and v_uid is not null then
    begin
      insert into public.schedule_reservations (schedule_id, user_id, display_name)
      values (v_sid, v_uid, '__migration_probe__');
      raise exception '검증 실패: 종료된 대회에 예약이 들어갔다';
    exception when others then
      if sqlerrm not like '%이미 종료된 대회입니다%' then raise; end if;
    end;
  else
    raise notice '주의: 종료 대회 또는 사용자가 없어 트리거 실행 검증은 건너뜀';
  end if;

  -- (6) RPC 에도 같은 게이트가 박혔는가
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'reserve_schedule'
       and pg_get_functiondef(p.oid) like '%_schedule_ended%'
  ) then
    raise exception '검증 실패: reserve_schedule 에 종료 대회 차단 없음';
  end if;

  -- (7) RPC ACL 보존 — create or replace 인데도 권한이 날아갔으면 앱 전체가 죽는다
  if not has_function_privilege('authenticated', 'public.reserve_schedule(uuid,text)', 'execute') then
    raise exception '검증 실패: authenticated 의 reserve_schedule 실행 권한이 사라짐';
  end if;

  -- (8) 내부 헬퍼는 anon 에서 막혔는가
  if has_function_privilege('anon', 'public._schedule_ended(uuid)', 'execute') then
    raise exception '검증 실패: _schedule_ended 가 anon 에 노출됨';
  end if;

  raise notice 'OK: 종료 대회 예약 차단(트리거+RPC) 검증 완료';
end $$;
