-- ⏳ 미적용 초안 (store-team 작성, 2026-09-30 · 요구 owner-2026-09-30#staff-punch). 적용은 리드가 아래 §4 리허설 후 MCP execute_sql 로.
-- 파일명: 20260930a 는 이메일 작업이 이미 운영에 쓴 이름이라 20260930b 로 바꿨다.
-- 20260930b — 직원 출근·퇴근 버튼(한 번 누름 = 기록 1건, 연타·동시 요청에도 첫 기록 유지)
--
-- 오너 원문(2026-09-30): "직원들이 보는쪽 보면 출근 퇴근 버튼이 있어야해 이건 최상단에 넣어줘 2개 잘못누를 경우도 대비하고"
--
-- 왜 새 RPC 인가 — 기존 set_my_shift_time(20260925g)은 **클라이언트가 보낸 시각**으로 칸을 덮어쓴다.
--   ① 연타·동시 요청: 두 번째 요청이 첫 출근 시각을 더 늦은 시각으로 덮는다(09:00 출근 → 실수로 11:00 에 또 누르면 11:00).
--   ② 시각의 출처가 기기 시계다(기기 시계가 틀리면 급여가 틀린다).
--   punch_my_shift 는 **서버 시각(KST)** 으로, **빈 칸일 때만** 쓴다(`where check_in is null`). 두 요청이 겹쳐도
--   PostgreSQL 행 잠금이 두 번째 UPDATE 의 WHERE 를 첫 커밋 뒤 다시 평가하므로 0행 → applied=false 로 기존 값을 돌려준다.
--   set_my_shift_time 은 그대로 둔다 — 직원의 '시각 고치기'(오늘·어제)와 버튼의 '되돌리기'가 그 경로를 쓴다(기능 보존).
--
-- 권한: 본인 행 판정은 기존 is_my_shift_row(= 소속 매장 + user_id 일치, 계정 없는 줄은 이름 유일 일치)를 그대로 쓴다.
--   다른 매장·다른 직원 명의 행은 v_id 가 null → 예외. 비로그인은 첫 줄에서 42501.
-- 행 수: 이 함수는 INSERT 를 하지 않는다. 기록 = staff_schedule 한 행(venue_id, work_date, staff_name UNIQUE)의 두 칸이다.
--
-- ── 적용 전 라이브 정본(2026-09-30 SELECT 실측) ──
--   staff_schedule: UNIQUE(venue_id, work_date, staff_name) · check_in/check_out text(HH:MM) · user_id uuid null
--   정책: staff_sched_self_select SELECT using is_my_shift_row(venue_id, staff_name, user_id) · UPDATE 는 can_manage_schedule 만
--   is_my_shift_row(uuid,text,uuid) SECURITY DEFINER, ACL {postgres, authenticated, service_role}
--   이 파일이 만드는 두 함수는 라이브에 **없다**(새로 만들어진다 → PUBLIC 기본 GRANT → 아래 REVOKE 필수).

-- ═══ 1. 읽기: 오늘·어제(KST) 내 근무 ═══════════════════════════════════════════════
create or replace function public.my_punch_state(p_venue_id uuid)
returns table(work_date date, check_in text, check_out text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다' using errcode = '42501'; end if;
  return query
    select s.work_date, s.check_in, s.check_out
      from public.staff_schedule s
     where s.venue_id = p_venue_id
       and s.work_date in (v_today, v_today - 1)
       and public.is_my_shift_row(s.venue_id, s.staff_name, s.user_id)
     order by s.work_date desc;
end; $$;
revoke all on function public.my_punch_state(uuid) from public, anon;
grant execute on function public.my_punch_state(uuid) to authenticated, service_role;

-- ═══ 2. 쓰기: 출근(in) / 퇴근(out) ═════════════════════════════════════════════════
-- 자정 넘어 오는 야간 근무자(오너 2026-09-30): 서버 시각 KST 00:00~01:59 에 출근을 누르면 **어제** 내 근무 행 중
--   check_in·check_out 이 모두 빈 행이 있을 때 그 행에 찍는다(오늘 행보다 우선). 없으면 기존대로 오늘 행. 02:00 이후는 기존 동작.
--   같은 창에서 어제 행이 이미 '출근·퇴근 전'(방금 찍은 뒤의 재탭)이면 오늘 행으로 넘어가지 않고 그 어제 행을 applied=false 로 돌려준다.
--   시각 판정은 v_now 한 곳이다(리허설에서 이 한 줄만 바꿔 01:30 을 만든다 — §4).
--   ⚠ 결과: 어제 근무가 퇴근 없이 열린 채로 00:00~01:59 에 새 근무를 시작하려는 사람은 출근을 못 찍는다(재탭 방어의 대가) —
--     직원 '시각 고치기'(set_my_shift_time)나 업주 근무표로 고친다.
create or replace function public.punch_my_shift(p_venue_id uuid, p_kind text)
returns table(work_date date, check_in text, check_out text, applied boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_now   timestamptz := now();
  v_today date := (v_now at time zone 'Asia/Seoul')::date;
  v_hm    text := to_char(v_now at time zone 'Asia/Seoul', 'HH24:MI');
  v_id    uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다' using errcode = '42501'; end if;
  if p_kind is distinct from 'in' and p_kind is distinct from 'out' then
    raise exception '알 수 없는 항목입니다' using errcode = '22023';
  end if;

  if p_kind = 'in' then
    if (v_now at time zone 'Asia/Seoul')::time < time '02:00' then
      select s.id into v_id
        from public.staff_schedule s
       where s.venue_id = p_venue_id and s.work_date = v_today - 1
         and s.check_in is null and s.check_out is null
         and public.is_my_shift_row(s.venue_id, s.staff_name, s.user_id)
       order by s.id limit 1;
      if v_id is null then
        -- 어제 근무가 이미 열려 있으면(출근 O·퇴근 X) 그 행을 그대로 돌려준다 — 오늘 행에 또 찍지 않는다.
        select s.id into v_id
          from public.staff_schedule s
         where s.venue_id = p_venue_id and s.work_date = v_today - 1
           and s.check_in is not null and s.check_out is null
           and public.is_my_shift_row(s.venue_id, s.staff_name, s.user_id)
         order by s.id limit 1;
        if v_id is not null then
          return query select s.work_date, s.check_in, s.check_out, false from public.staff_schedule s where s.id = v_id;
          return;
        end if;
      end if;
    end if;
    if v_id is null then
      select s.id into v_id
        from public.staff_schedule s
       where s.venue_id = p_venue_id and s.work_date = v_today
         and public.is_my_shift_row(s.venue_id, s.staff_name, s.user_id)
       order by s.id limit 1;
    end if;
    if v_id is null then
      raise exception '오늘 배정된 본인 근무가 없습니다 — 업주에게 스케줄 배정을 요청해 주세요' using errcode = 'P0002';
    end if;
    -- 빈 칸일 때만 쓴다: 연타·동시 요청의 두 번째는 0행 → 기존 값을 applied=false 로 돌려준다.
    return query
      with u as (
        update public.staff_schedule s set check_in = v_hm
         where s.id = v_id and s.check_in is null
        returning s.work_date, s.check_in, s.check_out
      ) select u.work_date, u.check_in, u.check_out, true from u;
    if not found then
      return query select s.work_date, s.check_in, s.check_out, false from public.staff_schedule s where s.id = v_id;
    end if;
    return;
  end if;

  -- 퇴근: 출근이 찍혀 있고 퇴근이 빈 내 근무 — 오늘 것 먼저, 없으면 어제(자정을 넘긴 야간 근무).
  select s.id into v_id
    from public.staff_schedule s
   where s.venue_id = p_venue_id and s.work_date in (v_today, v_today - 1)
     and s.check_in is not null and s.check_out is null
     and public.is_my_shift_row(s.venue_id, s.staff_name, s.user_id)
   order by s.work_date desc, s.id limit 1;
  if v_id is not null then
    return query
      with u as (
        update public.staff_schedule s set check_out = v_hm
         where s.id = v_id and s.check_out is null
        returning s.work_date, s.check_in, s.check_out
      ) select u.work_date, u.check_in, u.check_out, true from u;
    if found then return; end if;
  end if;
  -- 연타·동시 요청의 두 번째: 이미 퇴근이 찍힌 내 근무를 그대로 돌려준다(덮어쓰지 않는다).
  select s.id into v_id
    from public.staff_schedule s
   where s.venue_id = p_venue_id and s.work_date in (v_today, v_today - 1)
     and s.check_in is not null and s.check_out is not null
     and public.is_my_shift_row(s.venue_id, s.staff_name, s.user_id)
   order by s.work_date desc, s.id limit 1;
  if v_id is not null then
    return query select s.work_date, s.check_in, s.check_out, false from public.staff_schedule s where s.id = v_id;
    return;
  end if;
  raise exception '출근 기록이 없어 퇴근을 찍을 수 없습니다' using errcode = 'P0002';
end; $$;
revoke all on function public.punch_my_shift(uuid, text) from public, anon;
grant execute on function public.punch_my_shift(uuid, text) to authenticated, service_role;

-- ═══ 3. 자가검사 ═══════════════════════════════════════════════════════════════════
do $check$
declare f text;
begin
  foreach f in array array['public.my_punch_state(uuid)', 'public.punch_my_shift(uuid, text)'] loop
    if not (select p.prosecdef from pg_proc p where p.oid = f::regprocedure) then
      raise exception 'ABORT: % 가 SECURITY DEFINER 가 아니다', f;
    end if;
    if not exists (select 1 from pg_proc p where p.oid = f::regprocedure
                    and array_to_string(p.proconfig, ',') like '%search_path=public, pg_temp%') then
      raise exception 'ABORT: % search_path 고정 누락', f;
    end if;
    if has_function_privilege('anon', f, 'execute') then raise exception 'ABORT: anon 이 % 를 실행할 수 있다', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'ABORT: authenticated 가 % 를 실행할 수 없다', f; end if;
  end loop;
end $check$;

-- ═══ 4. 리허설(적용 전·후 라이브에서 begin; … rollback; — 이 블록은 주석이라 파일 적용 때 실행되지 않는다) ═══
-- 0) 계정 고르기(역할·소속을 먼저 조회한다):
--    select s.venue_id, s.staff_name, s.user_id, s.work_date, s.check_in, s.check_out
--      from staff_schedule s join venue_staff vs on vs.venue_id = s.venue_id and vs.user_id = s.user_id
--     where s.user_id is not null order by s.work_date desc limit 5;
--    → :V(매장) · :U(그 줄의 직원 user_id) · :OTHER_V(U 가 소속이 아닌 매장) 를 채운다.
-- 1) 본 파일 §1~§3 을 같은 트랜잭션 안에서 먼저 실행한 뒤(적용 전 리허설) 아래를 이어 붙인다.
--
-- begin;
--   -- (준비) 오늘(KST) 본인 근무 행을 빈 칸으로 하나 만든다 — rollback 으로 사라진다.
--   insert into staff_schedule(venue_id, work_date, staff_name, user_id)
--     values (:'V', (now() at time zone 'Asia/Seoul')::date, '리허설직원', :'U')
--     on conflict (venue_id, work_date, staff_name) do update set check_in = null, check_out = null;
--   set local role authenticated;
--   select set_config('request.jwt.claims', json_build_object('sub', :'U', 'role', 'authenticated')::text, true);
--   -- 양성: 본인 직원 출근 1건 → applied = true, check_in = 지금 HH:MM
--   select * from punch_my_shift(:'V', 'in');
--   -- 음성①: 중복 출근 → applied = false, check_in 은 첫 값 그대로(덮어쓰지 않음)
--   select * from punch_my_shift(:'V', 'in');
--   select count(*) filter (where check_in is not null) as punched_rows from staff_schedule
--    where venue_id = :'V' and work_date = (now() at time zone 'Asia/Seoul')::date and user_id = :'U';   -- 기대 1
--   -- 양성: 퇴근 1건 → applied = true / 음성: 두 번째 퇴근 → applied = false
--   select * from punch_my_shift(:'V', 'out');
--   select * from punch_my_shift(:'V', 'out');
--   -- 음성②: 남의 매장 → P0002 예외(본인 근무 없음). savepoint 로 감싸 트랜잭션을 살린다.
--   savepoint a; select * from punch_my_shift(:'OTHER_V', 'in'); rollback to savepoint a;          -- 기대: ERROR P0002
--   -- 음성③: 이상한 항목 → 22023
--   savepoint b; select * from punch_my_shift(:'V', 'x'); rollback to savepoint b;                 -- 기대: ERROR 22023
--   -- 음성④: 비로그인(anon) → 실행 권한 없음(42501)
--   reset role; set local role anon;
--   select set_config('request.jwt.claims', '{"role":"anon"}', true);
--   savepoint c; select * from punch_my_shift(:'V', 'in'); rollback to savepoint c;                -- 기대: ERROR 42501 permission denied
--   savepoint d; select * from my_punch_state(:'V'); rollback to savepoint d;                      -- 기대: ERROR 42501
-- rollback;
--
-- 1b) 01:30 시나리오(어제 야간 근무 출근) — now() 는 트랜잭션 시각이라 리허설에서 못 바꾼다. 그래서 판정을 v_now 한 줄로 모았다:
--    begin; 안에서 §2 의 punch_my_shift 본문을 **`v_now timestamptz := now();` 한 줄만 `timestamptz '2026-09-30 01:30+09'` 로 바꾼 사본**
--    (함수명 pg_temp.punch_my_shift_t, 나머지 동일)으로 만들고, 위 준비 블록에서 work_date 를 오늘 대신 (그 v_now 의 KST 날짜 - 1)
--    빈 행 + 같은 날짜 빈 행 두 개로 넣은 뒤(rollback 으로 사라짐) 아래를 실행한다. 리허설 날짜는 v_now 와 맞춘다.
--    · select * from pg_temp.punch_my_shift_t(:'V','in');  → work_date = 어제, check_in = 01:30, applied = true   (어제 행 우선)
--    · 같은 호출 한 번 더                                     → work_date = 어제, applied = false, 오늘 행은 여전히 check_in null
--    · 어제 행을 '18:00~23:30' 으로 채우고 다시 호출          → work_date = 오늘, applied = true                 (어제 끝남 → 오늘 행)
--    · v_now 를 '02:00+09' 로 바꾼 사본                        → 어제 빈 행이 있어도 오늘 행에 찍힌다               (02:00 경계)
--    필요하면 한 번에: 실제 00:00~01:59 KST 에 §4-0 의 절차로 돌려도 같다.
-- 2) 동시 요청 1건(선택, 두 세션): 세션 A `begin; … punch_my_shift(V,'in');`(커밋 전) → 세션 B 같은 호출은 행 잠금에서 대기 →
--    A commit 뒤 B 는 WHERE check_in is null 을 다시 평가해 0행 → applied=false. 운영에서는 A 도 rollback 으로 끝낸다.
-- 3) 적용 뒤: 파일 머리를 "✅ 적용 완료 + 실측값" 으로 바꾸고, e2e/_fixtures.ts READ_ONLY_RPCS 에 my_punch_state 가 있는지 확인.
