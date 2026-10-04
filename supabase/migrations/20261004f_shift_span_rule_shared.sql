-- 20261004f — 근무 1회 길이 규칙(60초 하한 · 24시간 상한)을 한 함수로 모아 출근 버튼·출근 관리 두 RPC 가 같이 쓴다 ·
--             18시간 퇴근 알림 수신자를 '본인 근무 행' 판정과 같은 이름 매칭으로 해석한다
-- ⏳ 미적용 — 작성·로컬(PGlite) 검증만. 적용은 리드가 critical 반증 뒤(운영 리허설: shift-guard-1004/README.txt).
--
-- 요구 키: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\audit4-regress-connect-1004.md#R4-01 · #R4-02
--   오너 10-04: "퇴근 시간 제한 대신 24시간을 초과하지 못하며 18시간이 넘어도 퇴근 체크가 안 되어 있으면 알림".
--
-- R4-01 근본 원인: 20261004c 가 규칙을 punch_my_shift 에만 달았다. 같은 행을 쓰는 형제 RPC set_my_shift_time
--   ('내 출근 관리' 의 지금 출근·지금 퇴근·시각 칸)은 같은 분 출퇴근(HH:MM 같음 → staffPay 가 24시간으로 계산,
--   정상 85,255원 근무가 240,720원)을 그대로 받았고, 24시간 넘게 열린 근무의 '지금 퇴근' 을 HH:MM 으로 받아
--   25시간을 1시간으로 접어 기록했다. 20261004c F5 주석("손입력은 구조상 24시간을 넘지 못한다")이 F6 의 입력(같은 분)을 빠뜨렸다.
--   → ① _shift_span_check(시작, 끝) 하나가 규칙과 사유 문장을 갖는다 — punch 와 set_my_shift_time 이 같이 부른다.
--     ② set_my_shift_time 은 p_value = 'now' 를 받는다: 서버가 자기 시각으로 적고(출근이면 check_in_at 표지도 남긴다),
--        '지금 퇴근' 의 끝을 지금으로 본다 — 그래야 24시간 초과를 알 수 있다. HH:MM 직접 입력의 끝은
--        시작 + (퇴근 − 출근 을 24시간 안으로 접은 값)이다(staffPay.shiftFromHm 과 같은 해석). 같은 분이면 0 → 거절.
--   업주 근무표(staff_schedule 직접 UPDATE, 정책 can_manage_schedule)는 **바꾸지 않는다** — 업주가 실제 시각을 고치는 길이고,
--   정확히 24시간(같은 HH:MM) 근무도 업주는 적을 수 있어야 한다. 리허설 P 줄이 이를 확인한다.
--   클라이언트 대응: src/lib/staffPay.ts selfShiftWriteError(같은 식) · StaffPayroll.tsx 내 출근 관리(버튼 막힘·안내·'now').
--   🔴 배포 순서: 이 마이그레이션을 **먼저** 적용한 뒤 클라이언트를 병합한다 — 옛 서버는 'now' 를 형식 오류로 거절한다.
--
-- R4-02 근본 원인: _remind_open_shifts 는 수신자를 user_id 하나로만 정했다. 같은 행의 '본인' 판정 is_my_shift_row 는
--   user_id 가 없으면 이름(이름·닉네임·옛 닉네임)이 매장 구성원 안에서 하나로 정해질 때 본인으로 인정한다 —
--   장부 딜러 명단 동기화(NuriPosLedger syncDealersToSchedule)처럼 계정 있는 직원 행을 이름만으로 만드는 경로가 있어
--   출근은 되는데 알림은 안 갔다. → _shift_row_owner 가 is_my_shift_row 와 같은 매칭으로 주인을 정하고 알림이 그것을 쓴다.
--   (생산자마다 user_id 를 채우게 하면 생산자 하나를 빠뜨릴 때마다 같은 결함이 다시 난다 — 정의를 한 곳에 맞춘다.)
--
-- 라이브 정의가 정본이다(2026-10-04 pg_get_functiondef):
--   punch_my_shift b757368a… · set_my_shift_time 66aeb2dd… · _remind_open_shifts 6bc1a879… · is_my_shift_row b260fc66…(불변) · _shift_start_at f6abf173…(불변)
--   반환 형식·인자는 셋 다 그대로다(CREATE OR REPLACE → ACL 보존, 아래 REVOKE/GRANT 도 다시 적는다).
--
-- critical 반증(2026-10-04, 검토 기억 critical-reviewer/shift_guard_r401_review_1004.md · 반례 crsg/30_review.sql X1~X3) 반영 — 리드 결정 ①~④:
--   '반대쪽 칸을 나중에 쓰는 경로' 가 남아 있었다 — 출근 전 '지금 퇴근' 이 출근 없이 받아지고, 그 뒤 출근 버튼이 이미 퇴근이 있는 행에
--   규칙 없이 출근을 써서 18:31|18:31(1440분)·18:31|18:30(1439분) 급여가 됐다(라이브에도 같은 결과 — 회귀 아님, 미해결 형제 경로).
--   ① set_my_shift_time 'now' 퇴근은 출근이 없으면 거절(punch 'out' 의 P0002 와 같은 문장)
--   ② 출근 버튼(punch 'in')과 '지금 출근'(set_my_shift_time 'now' 출근)은 같은 행에 퇴근이 이미 있으면 거절(hint SHIFT_OUT_BEFORE_IN)
--      — 퇴근을 먼저 비우거나 업주가 고친다. 직접 입력한 출근 시각(HH:MM)은 바로잡기 경로라 막지 않는다(같은 분만 규칙이 거절).
--   ③ 화면 punchView.canIn · selfShiftWriteError 가 같은 조건에서 버튼을 막는다  ④ 아래 적용 직전 운영 정의 확인 가드.

-- ── ⓪ 적용 직전 가드 — 이 파일이 바꾸는 세 함수가 작성 때 본 운영 정의 그대로인지(또는 이미 이 파일이 적용됐는지) ─────
do $guard$
declare f record;
begin
  for f in select * from (values
      ('public.set_my_shift_time(uuid,date,text,text)', '66aeb2dd0edb82c47037d3c92a3123d7'),
      ('public.punch_my_shift(uuid,text)', 'b757368a9de9d53c7b727bd68a236a05'),
      ('public._remind_open_shifts()', '6bc1a87962553bc35e5d36f892299c30')
    ) as t(sig, md5)
  loop
    if (select md5(prosrc) from pg_proc where oid = f.sig::regprocedure) is distinct from f.md5
       and position('_shift_span_check' in (select prosrc from pg_proc where oid = f.sig::regprocedure)) = 0
       and position('_shift_row_owner' in (select prosrc from pg_proc where oid = f.sig::regprocedure)) = 0 then
      raise exception '20261004f 가드: % 가 작성 때(2026-10-04) 본 운영 정의와 다르다 — 바뀐 본문을 먼저 반영하라', f.sig;
    end if;
  end loop;
end
$guard$;

-- ── ① 규칙 한 벌 ────────────────────────────────────────────────────────────
-- 시작~끝이 24시간을 넘으면(정확히 24시간은 허용) · 60초 미만이면 사용자 문장으로 거절한다(P0001 · hint 로 구분).
-- 둘 중 하나라도 null 이면 판정하지 않는다(출근 없는 퇴근 · 비우기 — 기존 동작).
create or replace function public._shift_span_check(p_start timestamptz, p_end timestamptz)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $fn$
begin
  if p_start is null or p_end is null then return; end if;
  if p_end - p_start > interval '24 hours' then
    raise exception '근무 1회는 24시간을 넘을 수 없습니다 — % 출근 뒤 24시간이 지나 지금 시각으로는 퇴근을 기록하지 않습니다. 출근 관리(시각 고치기)의 퇴근 칸에 실제 퇴근 시각을 직접 넣거나 업주에게 수정을 요청해 주세요',
      to_char(p_start at time zone 'Asia/Seoul', 'MM-DD HH24:MI')
      using hint = 'SHIFT_OVER_24H';
  end if;
  if p_end - p_start < interval '60 seconds' then
    raise exception '출근과 퇴근이 1분도 떨어져 있지 않습니다 — 같은 분 출퇴근은 하루(24시간) 근무로 계산돼 기록하지 않습니다. 1분 뒤 다시 누르거나 실제 시각을 넣어 주세요'
      using hint = 'SHIFT_TOO_SHORT';
  end if;
end
$fn$;
revoke all on function public._shift_span_check(timestamptz, timestamptz) from public, anon, authenticated;

-- ── ② 근무 행의 주인 — is_my_shift_row 와 같은 매칭 ───────────────────────────
-- user_id 가 있으면 그것. 없으면 이름이 그 매장 구성원(profiles.venue_id) 이름·닉네임·옛 닉네임 중 **정확히 한 명**과 맞을 때 그 사람.
--   is_my_shift_row 의 이름 갈래와 같은 비교(lower·btrim)·같은 범위(매장 구성원, 동명이인이면 아무도 아님)다.
-- ponytail: is_my_shift_row 는 매장 구성원이 아닌 관리자(can_manage_pos)도 이름이 맞으면 본인으로 본다 — 그 경우는
--   여기서 주인으로 정하지 않는다(알림 0건). 관리자 본인 근무는 근무표에서 계정 연결(user_id)로 배정된다(StaffSchedule staffIdByName).
create or replace function public._shift_row_owner(p_venue_id uuid, p_staff_name text, p_user_id uuid)
returns uuid
language sql
stable
-- invoker: 크론(_remind_open_shifts, definer)만 부른다. 직접 실행은 아래 REVOKE 로 막는다.
set search_path = public, pg_temp
as $fn$
  select coalesce(p_user_id, (
    select case when count(*) = 1 then min(q.id::text)::uuid end
      from public.profiles q
     where btrim(coalesce(p_staff_name, '')) <> ''
       and q.venue_id = p_venue_id
       and (lower(btrim(p_staff_name)) = lower(btrim(q.name))
         or lower(btrim(p_staff_name)) = lower(btrim(q.nickname))
         or exists (select 1 from public.nickname_history h
                     where h.user_id = q.id and lower(btrim(h.old_nickname)) = lower(btrim(p_staff_name))))
  ));
$fn$;
revoke all on function public._shift_row_owner(uuid, text, uuid) from public, anon, authenticated;

-- ── ③ punch_my_shift — 라이브 본문에서 두 검사만 공용 함수 호출로 바꿨다 ─────────────
create or replace function public.punch_my_shift(p_venue_id uuid, p_kind text)
 returns table(work_date date, check_in text, check_out text, applied boolean)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
#variable_conflict use_column
declare
  v_now   timestamptz := now();
  v_today date := (v_now at time zone 'Asia/Seoul')::date;
  v_hm    text := to_char(v_now at time zone 'Asia/Seoul', 'HH24:MI');
  v_id    uuid;
  v_start timestamptz;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다' using errcode = '42501'; end if;
  if p_kind is distinct from 'in' and p_kind is distinct from 'out' then
    raise exception '알 수 없는 항목입니다' using errcode = '22023';
  end if;
  if p_kind = 'in' then
    if (v_now at time zone 'Asia/Seoul')::time < time '02:00' then
      select s.id into v_id from public.staff_schedule s
       where s.venue_id = p_venue_id and s.work_date = v_today - 1
         and s.check_in is null and s.check_out is null
         and public.is_my_shift_row(s.venue_id, s.staff_name, s.user_id)
       order by s.id limit 1;
      if v_id is null then
        -- 후속(F3, 이번 범위 밖): 이 '어제 열린 행' 이 24시간 상한에 막힌 행이어도 00:00~01:59 동안 오늘 출근을 막는다
        --   (클라이언트 punchView 도 같은 규칙). 창이 좁아 그대로 두고, 고칠 때는 punchView 와 함께 바꾼다.
        select s.id into v_id from public.staff_schedule s
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
      select s.id into v_id from public.staff_schedule s
       where s.venue_id = p_venue_id and s.work_date = v_today
         and public.is_my_shift_row(s.venue_id, s.staff_name, s.user_id)
       order by s.id limit 1;
    end if;
    if v_id is null then
      raise exception '오늘 배정된 본인 근무가 없습니다 — 업주에게 스케줄 배정을 요청해 주세요' using errcode = 'P0002';
    end if;
    -- 20261004f ②(critical X1~X3): 퇴근이 먼저 적힌 행에는 출근을 쓰지 않는다 — 같은 분이면 24시간, 1분 뒤면 23시간 59분으로 계산된다.
    if exists (select 1 from public.staff_schedule s where s.id = v_id and s.check_in is null and s.check_out is not null) then
      raise exception '퇴근 시각이 먼저 적혀 있어 출근을 기록하지 않습니다 — 출근 관리(시각 고치기)에서 퇴근 칸을 비우고 다시 누르거나 업주에게 수정을 요청해 주세요'
        using hint = 'SHIFT_OUT_BEFORE_IN';
    end if;
    return query
      with u as (
        update public.staff_schedule s set check_in = v_hm, check_in_at = v_now, checkout_reminded_at = null
         where s.id = v_id and s.check_in is null
        returning s.work_date, s.check_in, s.check_out
      ) select u.work_date, u.check_in, u.check_out, true from u;
    if not found then
      return query select s.work_date, s.check_in, s.check_out, false from public.staff_schedule s where s.id = v_id;
    end if;
    return;
  end if;
  select s.id into v_id from public.staff_schedule s
   where s.venue_id = p_venue_id and s.work_date in (v_today, v_today - 1)
     and s.check_in is not null and s.check_out is null
     and public.is_my_shift_row(s.venue_id, s.staff_name, s.user_id)
   order by s.work_date desc, s.id limit 1;
  if v_id is not null then
    -- 20261004c/f: 근무 1회는 24시간을 넘지 못하고(오너 10-04) · 출근 뒤 60초 안의 퇴근은 받지 않는다(같은 분 = 24시간 계산).
    --   규칙과 사유 문장은 _shift_span_check 한 곳 — '내 출근 관리'(set_my_shift_time)도 같은 함수를 부른다(20261004f, R4-01).
    select public._shift_start_at(s.check_in, s.check_in_at) into v_start
      from public.staff_schedule s where s.id = v_id;
    perform public._shift_span_check(v_start, v_now);
    return query
      with u as (
        update public.staff_schedule s set check_out = v_hm
         where s.id = v_id and s.check_out is null
        returning s.work_date, s.check_in, s.check_out
      ) select u.work_date, u.check_in, u.check_out, true from u;
    if found then return; end if;
  end if;
  select s.id into v_id from public.staff_schedule s
   where s.venue_id = p_venue_id and s.work_date in (v_today, v_today - 1)
     and s.check_in is not null and s.check_out is not null
     and public.is_my_shift_row(s.venue_id, s.staff_name, s.user_id)
   order by s.work_date desc, s.id limit 1;
  if v_id is not null then
    return query select s.work_date, s.check_in, s.check_out, false from public.staff_schedule s where s.id = v_id;
    return;
  end if;
  raise exception '출근 기록이 없어 퇴근을 찍을 수 없습니다' using errcode = 'P0002';
end; $function$;
revoke all on function public.punch_my_shift(uuid, text) from public, anon;
grant execute on function public.punch_my_shift(uuid, text) to authenticated, service_role;

-- ── ④ set_my_shift_time — 라이브 본문 + 'now' + 쓰기 뒤 규칙 검사 ────────────────────
-- 검사는 UPDATE **뒤** 행(트리거가 표지를 정리한 값)으로 한다. 거절하면 예외가 그 UPDATE 까지 되돌린다.
create or replace function public.set_my_shift_time(p_venue_id uuid, p_work_date date, p_field text, p_value text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_id uuid; v_val text; v_n int; v_kst date := (now() at time zone 'Asia/Seoul')::date;
  v_now timestamptz := now();
  v_is_now boolean := lower(btrim(coalesce(p_value, ''))) = 'now';
  v_row record; v_start timestamptz; v_gap interval;
begin
  if p_field not in ('check_in', 'check_out') then raise exception '알 수 없는 항목입니다'; end if;
  -- 20261004f: 'now' = 지금(서버 시각). '내 출근 관리' 의 지금 출근·지금 퇴근이 보낸다.
  v_val := case when v_is_now then to_char(v_now at time zone 'Asia/Seoul', 'HH24:MI')
                else nullif(btrim(coalesce(p_value, '')), '') end;
  if v_val is not null and v_val !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception '시각 형식이 올바르지 않습니다 (HH:MM)';
  end if;
  if p_work_date is null or p_work_date < v_kst - 1 or p_work_date > v_kst then
    raise exception '출퇴근은 오늘과 어제 근무만 직접 기록할 수 있습니다 — 지난 근무는 업주에게 수정을 요청해 주세요' using errcode = '42501';
  end if;
  select s.id into v_id
    from public.staff_schedule s
   where s.venue_id = p_venue_id and s.work_date = p_work_date
     and public.is_my_shift_row(s.venue_id, s.staff_name, s.user_id)
   limit 1;
  if v_id is null then raise exception '그 날짜에 배정된 본인 일정이 없습니다'; end if;
  -- 20261004f ①②(critical X1~X3): '지금' 은 출근·퇴근 버튼과 같은 순서 규칙을 따른다.
  if v_is_now then
    select s.check_in, s.check_out into v_row from public.staff_schedule s where s.id = v_id;
    if p_field = 'check_out' and v_row.check_in is null then
      raise exception '출근 기록이 없어 퇴근을 찍을 수 없습니다' using errcode = 'P0002';
    end if;
    if p_field = 'check_in' and v_row.check_out is not null then
      raise exception '퇴근 시각이 먼저 적혀 있어 출근을 기록하지 않습니다 — 출근 관리(시각 고치기)에서 퇴근 칸을 비우고 다시 누르거나 업주에게 수정을 요청해 주세요'
        using hint = 'SHIFT_OUT_BEFORE_IN';
    end if;
  end if;
  if p_field = 'check_in' then
    if v_is_now then
      -- 지금 출근은 출근 버튼과 같이 서버 출근 표지를 남기고 알림 표지를 비운다(재출근).
      update public.staff_schedule set check_in = v_val, check_in_at = v_now, checkout_reminded_at = null where id = v_id;
    else
      update public.staff_schedule set check_in  = v_val where id = v_id;
    end if;
  else
    update public.staff_schedule set check_out = v_val where id = v_id;
  end if;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception '출퇴근을 기록하지 못했습니다'; end if;
  -- 20261004f(R4-01): 출근·퇴근이 다 있으면 punch_my_shift 와 같은 규칙으로 근무 길이를 본다.
  --   시작 = _shift_start_at(출근, 서버 표지) · 끝 = '지금 퇴근' 이면 지금, 아니면 시작 + (퇴근 − 출근 을 [0, 24h) 로 접은 값).
  --   ponytail: 직접 입력한 HH:MM 은 끝이 늘 시작 뒤 24시간 안으로 읽혀 상한에 걸리지 않는다 — 25시간 넘긴 근무의 '지금' 을
  --     사람이 숫자로 쳐 넣으면 못 가른다. 그 길은 화면 안내가 '실제 퇴근 시각' 을 넣으라고 말한다.
  select s.check_in, s.check_out, s.check_in_at into v_row from public.staff_schedule s where s.id = v_id;
  if v_row.check_in is not null and v_row.check_out is not null then
    v_start := public._shift_start_at(v_row.check_in, v_row.check_in_at);
    if p_field = 'check_out' and v_is_now then
      perform public._shift_span_check(v_start, v_now);
    else
      v_gap := v_row.check_out::time - v_row.check_in::time;
      if v_gap < interval '0' then v_gap := v_gap + interval '24 hours'; end if;
      perform public._shift_span_check(v_start, v_start + v_gap);
    end if;
  end if;
end; $function$;
revoke all on function public.set_my_shift_time(uuid, date, text, text) from public, anon;
grant execute on function public.set_my_shift_time(uuid, date, text, text) to authenticated, service_role;

-- ── ⑤ 18시간 미퇴근 본인 알림 — 수신자 = _shift_row_owner ────────────────────────
-- 대상: 출근 O · 퇴근 X · 아직 안 보냄 · 주인이 정해지는 행(user_id 또는 매장 안 유일 이름) · 시작 뒤 18시간 경과.
--   work_date 하한(KST 오늘-2)은 20261004c 그대로다.
create or replace function public._remind_open_shifts()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_n integer;
begin
  with due as (
    update public.staff_schedule s
       set checkout_reminded_at = now()
     where s.check_in is not null and s.check_out is null
       and s.checkout_reminded_at is null
       and public._shift_row_owner(s.venue_id, s.staff_name, s.user_id) is not null
       and s.work_date >= (now() at time zone 'Asia/Seoul')::date - 2
       and public._shift_start_at(s.check_in, s.check_in_at) <= now() - interval '18 hours'
    returning public._shift_row_owner(s.venue_id, s.staff_name, s.user_id) as user_id, s.venue_id,
              public._shift_start_at(s.check_in, s.check_in_at) as started
  )
  insert into public.notifications(user_id, type, title, message, avatar_text, avatar_color, link)
  select d.user_id, 'reminder', '퇴근 체크',
         format('%s 출근 뒤 18시간이 지났습니다. 아직 퇴근을 안 찍었다면 지금 퇴근을 기록해 주세요 — 근무 1회는 24시간까지만 기록됩니다.',
                to_char(d.started at time zone 'Asia/Seoul', 'MM-DD HH24:MI')),
         '⏰', '#FFD100', '/my-store/attendance?venue=' || d.venue_id
    from due d;
  get diagnostics v_n = row_count;
  return v_n;
end
$fn$;
revoke all on function public._remind_open_shifts() from public, anon, authenticated;
grant execute on function public._remind_open_shifts() to service_role;

-- ── 자가검사 ───────────────────────────────────────────────────────────────
do $chk$
declare f record; bad text := '';
begin
  for f in select * from (values
      ('public.punch_my_shift(uuid,text)', true, true, false),
      ('public.set_my_shift_time(uuid,date,text,text)', true, true, false),
      ('public._remind_open_shifts()', true, false, false),
      ('public._shift_span_check(timestamptz,timestamptz)', false, false, false),
      ('public._shift_row_owner(uuid,text,uuid)', false, false, false)
    ) as t(sig, definer, auth_ok, anon_ok)
  loop
    if has_function_privilege('anon', f.sig, 'EXECUTE') is distinct from f.anon_ok then bad := bad || ' anon:' || f.sig; end if;
    if has_function_privilege('authenticated', f.sig, 'EXECUTE') is distinct from f.auth_ok then bad := bad || ' auth:' || f.sig; end if;
    if exists (select 1 from pg_proc p, unnest(p.proacl) a where p.oid = f.sig::regprocedure and a::text like '=%') then
      bad := bad || ' public:' || f.sig;
    end if;
    if (select p.prosecdef from pg_proc p where p.oid = f.sig::regprocedure) is distinct from f.definer then
      bad := bad || ' definer:' || f.sig;
    end if;
    if not exists (select 1 from pg_proc p where p.oid = f.sig::regprocedure
                    and p.proconfig @> array['search_path=public, pg_temp']) then
      bad := bad || ' search_path:' || f.sig;
    end if;
  end loop;
  if position('_shift_span_check(v_start, v_now)' in (select prosrc from pg_proc where oid = 'public.punch_my_shift(uuid,text)'::regprocedure)) = 0 then
    bad := bad || ' punch_body';
  end if;
  if position('SHIFT_OUT_BEFORE_IN' in (select prosrc from pg_proc where oid = 'public.punch_my_shift(uuid,text)'::regprocedure)) = 0
     or position('SHIFT_OUT_BEFORE_IN' in (select prosrc from pg_proc where oid = 'public.set_my_shift_time(uuid,date,text,text)'::regprocedure)) = 0 then
    bad := bad || ' order_rule';
  end if;
  if position('_shift_span_check(v_start, v_start + v_gap)' in (select prosrc from pg_proc where oid = 'public.set_my_shift_time(uuid,date,text,text)'::regprocedure)) = 0
     or position('check_in_at = v_now' in (select prosrc from pg_proc where oid = 'public.set_my_shift_time(uuid,date,text,text)'::regprocedure)) = 0 then
    bad := bad || ' set_body';
  end if;
  if position('_shift_row_owner(s.venue_id, s.staff_name, s.user_id) is not null' in (select prosrc from pg_proc where oid = 'public._remind_open_shifts()'::regprocedure)) = 0
     or position('s.user_id is not null' in (select prosrc from pg_proc where oid = 'public._remind_open_shifts()'::regprocedure)) > 0 then
    bad := bad || ' remind_body';
  end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.is_my_shift_row(uuid,text,uuid)'::regprocedure) is distinct from 'b260fc6645142de168215d969895601a' then
    bad := bad || ' is_my_shift_row_changed';
  end if;
  if bad <> '' then raise exception '20261004f 자가검사 실패:%', bad; end if;
end
$chk$;
