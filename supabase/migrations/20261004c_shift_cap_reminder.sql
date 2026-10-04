-- 20261004c — 근무 1회 24시간 상한 · 18시간 미퇴근 본인 알림 · 서버 출근 시각 저장 · 직원용 급여 설정 읽기
-- ✅ 적용 완료 2026-10-04 (리드, 오너 승인) — 커밋 0ade248d 본문(LF, md5 712e463d…)을 commit.mjs 로 적용(201).
--    실측: punch_my_shift b757368a… · my_venue_pay_rules 2e7e0779… · _remind_open_shifts 6bc1a879… · _shift_start_at f6abf173… · _guard_staff_shift_stamps dd1debc4…
--    ACL anon 실행 전부 false, authenticated 는 punch·my_venue_pay_rules 만 · 칸 check_in_at·checkout_reminded_at · 트리거 trg_guard_staff_shift_stamps
--    cron staff-checkout-reminder */10 active · my_punch_state e4258817…·set_my_shift_time 66aeb2dd… 불변 · advisors 보안 ERROR 0
--    리허설 81/81 · critical 반증 2회(review-shift-cap-1004.md) '적용 가능'.
--   리허설 폴더: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\shift-cap-1004\ (run2.txt) · 반증: review-shift-cap-1004.md
--
-- 요구 원문: 리드 기억 project_autonomous_run_1004.md '오너 답(10-04)' ① + '근무 마이그레이션 묶음' ①~④,
--            review-r3-03-1004.md §3(01:59 귀속은 서버 출근 시각 저장 뒤) · §4(직원 설정 읽기 RPC).
--   오너 10-04: "근무 1회는 24시간을 넘지 못함" + "18시간이 지나도 퇴근이 없으면 본인에게 '퇴근 체크' 알림".
--
-- 라이브 정의가 정본이다 — punch_my_shift 는 2026-10-04 pg_get_functiondef 로 뜬 본문(prosrc md5 354189f7f22e1863e828bfa0d50f1ec5,
--   20260930b 판)에서 **세 군데만** 바꿨다: ① 출근 UPDATE 가 check_in_at 을 쓰고 checkout_reminded_at 을 비운다(F4)
--   ② 퇴근 직전 24시간 상한 검사 ③ 퇴근 직전 60초 미만 거부(F6 — 같은 분 출퇴근은 HH:MM 이 같아 급여가 24시간으로 계산된다).
--   반환 형식·인자·나머지 분기는 한 글자도 바꾸지 않았다(CREATE OR REPLACE → ACL 보존, 아래에 REVOKE/GRANT 도 다시 적는다).
--   critical 반증(review-shift-cap-1004.md) F1·F4·F5·F6 반영판. F3 은 후속(아래 punch 본문 주석).
--
-- 24시간 상한은 '거부' 안이다(퇴근을 출근+24h 로 잘라 기록하는 안은 쓰지 않는다):
--   잘라 기록하면 HH:MM 이 출근과 같아져 급여 계산(staffPay.shiftFromHm: 퇴근<=출근 → +1일)이 **24시간을 지급**한다 —
--   퇴근을 잊은 근무가 최대 금액으로 확정되는 과다 산정이다. 거부하면 행은 '근무 중' 으로 남고(미확정 = 0 지급),
--   업주가 실제 퇴근 시각을 고친다. 거부 사유는 사용자 문장(P0001)으로 돌려주므로 화면 토스트가 그대로 보여 준다.
--
-- check_in_at 은 **서버만 쓴다**: 클라이언트(anon·authenticated 직접 쓰기)는 이 칸을 못 바꾸고, 출근 글자(check_in)가
--   바뀌면 저절로 비워진다(손으로 고친 시각에는 서버 증명이 없다). 따라서 check_in_at 이 있으면 항상
--   to_char(check_in_at KST,'HH24:MI') = check_in 이다. 01:59 '어제 근무' 의 실제 날짜는 (check_in_at KST)::date 로 읽는다.
--   기존 행(2026-10-04 실측 0행)과 손입력 행은 check_in_at 이 null 이다 — 그때의 해석은 아래 _shift_start_at 주석(F1).

-- ── ③ 서버 출근 시각 · 알림 표지 칸 ─────────────────────────────────────────
alter table public.staff_schedule add column if not exists check_in_at timestamptz;
alter table public.staff_schedule add column if not exists checkout_reminded_at timestamptz;
comment on column public.staff_schedule.check_in_at is
  '20261004c: punch_my_shift 가 기록한 실제 출근 시각(서버 시각). 클라이언트는 못 쓰고, check_in 글자가 바뀌면 null 로 비워진다.';
comment on column public.staff_schedule.checkout_reminded_at is
  '20261004c: 18시간 미퇴근 알림을 보낸 시각(행당 1회 표지). 클라이언트는 못 쓴다.';

create or replace function public._guard_staff_shift_stamps()
returns trigger
language plpgsql
-- security invoker 가 맞다: current_user 로 '클라이언트 직접 쓰기' 와 'SECURITY DEFINER 함수(=postgres) 경로' 를 가른다.
set search_path = public, pg_temp
as $fn$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.check_in_at := null;
      new.checkout_reminded_at := null;
    else
      new.check_in_at := old.check_in_at;
      new.checkout_reminded_at := old.checkout_reminded_at;
    end if;
  end if;
  if new.check_in_at is not null
     and new.check_in is distinct from to_char(new.check_in_at at time zone 'Asia/Seoul', 'HH24:MI') then
    new.check_in_at := null;
  end if;
  return new;
end
$fn$;
revoke all on function public._guard_staff_shift_stamps() from public, anon, authenticated;

-- ⚠ 'drop trigger if exists' 를 쓰지 마라 — 2026-10-04 리허설 실측: 그 한 문장이 auth·storage·realtime 표 30여 개에
--   AccessExclusiveLock 을 잡아 realtime 워커와 교착(40P01)이 났다. create or replace trigger(PG14+)는 staff_schedule 만 잠근다.
create or replace trigger trg_guard_staff_shift_stamps
  before insert or update on public.staff_schedule
  for each row execute function public._guard_staff_shift_stamps();

-- 근무 시작 시각 한 벌 — 24시간 상한·60초 하한·18시간 알림이 같은 기준을 쓴다.
--   서버 표지(check_in_at)가 있으면 그것이 실제 출근 시각이다.
--   없으면(손으로 넣거나 고친 행) **지금 이전 24시간 안에서 가장 가까운 그 HH:MM** 을 시작으로 본다(F1, 리드 결정 안 A).
--     work_date + check_in 으로 읽으면 00:00~01:59 에 출근한 '어제 근무' 행이 하루 앞당겨져, 정상 야간 근무의
--     퇴근이 거부되고 18시간 알림이 잘못 나갔다(critical R1e·R1f·R2b 실측). 급여 계산(staffPay.shiftFromHm)도 날짜가 아니라
--     퇴근을 출근 뒤 24시간 안으로 접어 근무 길이를 세므로, 근무 길이 기준으로는 이 해석과 같다.
--   ponytail: 대가 — 표지 없는 행은 경과가 늘 24시간 미만으로 계산되므로 **24시간 상한이 사실상 걸리지 않는다.**
--     그 행은 사람이 직접 넣은 시각이라 업주 책임으로 둔다. 상한을 걸어야 하면 손입력에도 날짜가 있는 시각(timestamptz)을 받게 바꿔야 한다.
create or replace function public._shift_start_at(p_check_in text, p_check_in_at timestamptz)
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $fn$
  select coalesce(
    p_check_in_at,
    case when p_check_in ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      now() - (select case when x >= interval '0' then x else x + interval '24 hours' end
                 from (select (now() at time zone 'Asia/Seoul')::time - p_check_in::time as x) t)
    end
  );
$fn$;
revoke all on function public._shift_start_at(text, timestamptz) from public, anon, authenticated;

-- ── ① punch_my_shift — 라이브 본문 + (출근 표지) + (퇴근 24시간 상한 · 60초 하한) ──────────
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
    -- 20261004c: 근무 1회는 24시간을 넘지 못한다(오너 10-04). 넘으면 버튼으로는 기록하지 않고 사유를 돌려준다.
    --   손입력(set_my_shift_time · 업주 근무표)은 HH:MM 두 개라 구조상 24시간을 넘는 기록을 만들 수 없어 규칙을 따로 두지 않는다(F5).
    select public._shift_start_at(s.check_in, s.check_in_at) into v_start
      from public.staff_schedule s where s.id = v_id;
    if v_start is not null and v_now - v_start > interval '24 hours' then
      raise exception '근무 1회는 24시간을 넘을 수 없습니다 — % 출근 뒤 24시간이 지나 퇴근 버튼으로는 기록하지 않습니다. 출근 관리(시각 고치기)에서 실제 퇴근 시각을 직접 넣거나 업주에게 수정을 요청해 주세요',
        to_char(v_start at time zone 'Asia/Seoul', 'MM-DD HH24:MI')
        using hint = 'SHIFT_OVER_24H';
    end if;
    -- F6: 출근 뒤 60초 안의 퇴근은 거부한다 — 같은 분이면 퇴근 HH:MM 이 출근과 같아져 staffPay 가 24시간으로 계산한다.
    if v_start is not null and v_now - v_start < interval '60 seconds' then
      raise exception '방금 출근했습니다 — 1분 뒤 다시 눌러 주세요' using hint = 'SHIFT_TOO_SHORT';
    end if;
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

-- ── ② 18시간 미퇴근 본인 알림(크론, 행당 1회) ─────────────────────────────────
-- 대상: 출근 O · 퇴근 X · 아직 안 보냄 · 계정이 연결된 행(user_id) · 시작 뒤 18시간 경과.
--   work_date 하한(KST 오늘-2)은 이 기능 전부터 열려 있던 옛 행에 알림이 한꺼번에 가지 않게 하는 울타리다
--   (시작은 늦어도 work_date+1일 01:59 이고 18시간 뒤면 work_date+2일 안이다).
-- ponytail: 계정 없이 이름으로만 배정된 행(user_id null)은 받을 사람을 서버가 확정할 수 없어 보내지 않는다.
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
       and s.user_id is not null
       and s.work_date >= (now() at time zone 'Asia/Seoul')::date - 2
       and public._shift_start_at(s.check_in, s.check_in_at) <= now() - interval '18 hours'
    returning s.user_id, s.venue_id, public._shift_start_at(s.check_in, s.check_in_at) as started
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

select cron.schedule('staff-checkout-reminder', '*/10 * * * *', 'select public._remind_open_shifts()');

-- ── ④ 직원 본인 화면용 급여 설정 읽기(불리언 4개만) ───────────────────────────
-- venue_payroll_rules 의 SELECT 정책(can_manage_pos)은 넓히지 않는다 — is_my_shift_row 류 조건을 빌리면 승인 전 계정까지 열린다.
-- 게이트: 매장 관리자 또는 _is_active_venue_staff(직원 역할·소속 일치·승인·정지/탈퇴 아님). 아니면 42501.
-- 행이 없으면 0행(= 기본값으로 센다).
create or replace function public.my_venue_pay_rules(p_venue_id uuid)
returns table(early_credit boolean, auto_break boolean, five_plus boolean, weekly_holiday boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다' using errcode = '42501'; end if;
  if not coalesce(public.can_manage_pos(p_venue_id) or public._is_active_venue_staff(auth.uid(), p_venue_id), false) then
    raise exception '이 매장의 급여 계산 설정을 볼 권한이 없습니다' using errcode = '42501';
  end if;
  return query
    select r.early_credit, r.auto_break, r.five_plus, r.weekly_holiday
      from public.venue_payroll_rules r
     where r.venue_id = p_venue_id;
end
$fn$;
revoke all on function public.my_venue_pay_rules(uuid) from public, anon;
grant execute on function public.my_venue_pay_rules(uuid) to authenticated, service_role;

-- ── 자가검사 ───────────────────────────────────────────────────────────────
do $chk$
declare f record; bad text := '';
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'staff_schedule'
         and column_name in ('check_in_at', 'checkout_reminded_at')) <> 2 then
    bad := bad || ' columns';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.staff_schedule'::regclass
                  and tgname = 'trg_guard_staff_shift_stamps' and not tgisinternal) then
    bad := bad || ' trigger';
  end if;
  for f in select * from (values
      ('public.punch_my_shift(uuid,text)', true, true, false),
      ('public.my_venue_pay_rules(uuid)', true, true, false),
      ('public._remind_open_shifts()', true, false, false),
      ('public._shift_start_at(text,timestamptz)', false, false, false),
      ('public._guard_staff_shift_stamps()', false, false, false)
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
  if position('check_in_at = v_now' in (select prosrc from pg_proc where oid = 'public.punch_my_shift(uuid,text)'::regprocedure)) = 0
     or position('checkout_reminded_at = null' in (select prosrc from pg_proc where oid = 'public.punch_my_shift(uuid,text)'::regprocedure)) = 0
     or position('SHIFT_TOO_SHORT' in (select prosrc from pg_proc where oid = 'public.punch_my_shift(uuid,text)'::regprocedure)) = 0
     or position('SHIFT_OVER_24H' in (select prosrc from pg_proc where oid = 'public.punch_my_shift(uuid,text)'::regprocedure)) = 0 then
    bad := bad || ' punch_body';
  end if;
  if not exists (select 1 from cron.job where jobname = 'staff-checkout-reminder'
                  and schedule = '*/10 * * * *' and command = 'select public._remind_open_shifts()' and active) then
    bad := bad || ' cron';
  end if;
  if bad <> '' then raise exception '20261004c 자가검사 실패:%', bad; end if;
end
$chk$;
