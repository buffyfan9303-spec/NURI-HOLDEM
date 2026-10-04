-- 20261004h — 근무 시작 시각을 근무 날짜(work_date)로 읽는다: 손으로 넣은 출근도 24시간 상한이 실제 경과 시간을 본다
-- ⏳ 미적용(작성 2026-10-04 store-team) — 리드 적용 대기. 적용은 LF 본문 그대로(아래 ⓪ 가드가 새 본문 md5 를 알아본다).
--
-- 요구 키: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\audit5-regress-connect-1004.md#R5-01
--   오너 10-04: "근무 1회는 24시간을 넘지 못함"(20261004c) — 20261004f 가 규칙을 한 함수(_shift_span_check)로 모았다.
--
-- R5-01 근본 원인: 시작을 정하는 _shift_start_at(check_in, check_in_at) 이 서버 출근 표지(check_in_at)가 비면
--   근무 날짜를 보지 않고 "지금 이전 24시간 안의 가장 가까운 그 HH:MM" 을 시작으로 썼다(20261004c F1 안 A).
--   그래서 표지가 없는 근무(직원이 출근 칸에 손으로 넣은 출근 · 업주 근무표의 출근 · 20261004c 이전 행 —
--   트리거 _guard_staff_shift_stamps 가 손입력 출근의 표지를 비운다)는 경과가 늘 24시간 미만으로 읽혀,
--   25시간 뒤 '지금 퇴근'(set_my_shift_time 'now')·퇴근 버튼(punch_my_shift 'out')이 1시간 근무로 기록됐다.
--   20261004f 는 '끝(지금)' 쪽만 고쳤고 시작 함수는 그대로였다 — 재발 모양.
--   → ① _shift_start_at(work_date, check_in, check_in_at): 표지가 없으면 **work_date + check_in**(KST).
--        00:00~01:59 출근은 다음 날로 본다 — 출근 버튼 punch_my_shift 의 '어제 근무' 창(time '02:00')·
--        화면 PUNCH_YESTERDAY_UNTIL_MIN(120)과 같은 경계다. 20261004c 가 안 A 를 고른 이유(work_date+check_in 은
--        00~02시 '어제 근무' 를 하루 앞당긴다 — critical R1e·R1f·R2b)가 이 경계로 해소된다.
--        그 값이 지금보다 늦으면(날짜를 잘못 고른 행 — 예: 오늘 행에 어젯밤 출근을 적음) 24시간 앞으로 본다.
--        시작은 미래일 수 없고, 이 갈래는 경과가 24시간 미만이 되므로 거절을 새로 만들지 않는다(옛 해석과 같은 쪽).
--     ② 부르는 곳 셋(punch_my_shift 퇴근 · set_my_shift_time · _remind_open_shifts)이 근무 날짜를 넘긴다.
--     ③ 옛 2인자 함수는 지운다 — 남겨 두면 빠뜨린 호출부가 옛 해석으로 조용히 돈다. ⓪ 가드가 적용 직전에
--        옛 함수를 부르는 곳이 이 셋뿐인지(함수 본문·정책·뷰·크론·의존성) 운영에서 직접 센다.
--   화면 쌍둥이: src/lib/staffPay.ts shiftStartMs(workDate, …) · selfShiftWriteError(row.date) — 같은 식.
--   직접 입력(HH:MM) 판정은 끝 = 시작 + (퇴근 − 출근 을 24시간 안으로 접은 값)이라 시작 해석과 무관하다(바뀌지 않는다).
--   급여 계산(staffPay.shiftFromHm)·휴일 귀속은 이 파일이 바꾸지 않는다.
-- ponytail: 오늘 행에 00:00~01:59 를 손으로 적고(그날 새벽 출근) 24시간 넘게 열어 두면, 다음 날 같은 시각부터는
--   '다음 날 새벽' 으로 읽혀 경과가 다시 짧아진다. HH:MM 만으로는 그 둘을 가를 수 없다(출근 버튼은 표지로 가른다).
--
-- 라이브 정의가 정본이다 — 20261004f 적용 뒤 운영 md5(파일 머리 실측과 본문 재계산이 일치):
--   punch_my_shift 6e45d060… · set_my_shift_time e90d49b2… · _remind_open_shifts e0aa4366… · _shift_start_at(text,timestamptz) f6abf173…
--   세 함수는 그 본문에서 _shift_start_at 호출 인자만 바꿨다(반환 형식·인자 그대로 → CREATE OR REPLACE, ACL 보존 · REVOKE/GRANT 다시 적음).
-- 리허설: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\shift-workdate-1004\README.txt

-- ── ⓪ 적용 직전 가드 ─────────────────────────────────────────────────────────
-- 세 함수가 20261004f 판 그대로이거나 이미 이 파일 판이어야 한다(그 밖이면 바뀐 본문을 먼저 반영하라).
-- 옛 _shift_start_at 은 20261004c 판이거나 이미 없어야 하고, 그것을 부르는 곳은 이 셋뿐이어야 한다.
do $guard$
declare f record; v_old regprocedure := to_regprocedure('public._shift_start_at(text,timestamptz)'); v_hits text; v_cron text;
begin
  for f in select * from (values
      ('public.set_my_shift_time(uuid,date,text,text)', 'e90d49b250f52586704dcbea5d59036e', '969cebbb0c9105e335711c775b5d64b6'),
      ('public.punch_my_shift(uuid,text)', '6e45d06014e5c1d8e610d09fc34127a5', 'e4447d1de87df43b2079a72a8c7d2326'),
      ('public._remind_open_shifts()', 'e0aa43669e6184adcaaedbee28c352b4', '33269754889aeca9a893b596e9f34ecc')
    ) as t(sig, live_md5, new_md5)
  loop
    if (select md5(prosrc) from pg_proc where oid = to_regprocedure(f.sig)) is distinct from f.live_md5
       and (select md5(prosrc) from pg_proc where oid = to_regprocedure(f.sig)) is distinct from f.new_md5 then
      raise exception '20261004h 가드: % 가 작성 때(2026-10-04, 20261004f 판) 본 운영 정의와 다르다 — 바뀐 본문을 먼저 반영하라', f.sig;
    end if;
  end loop;
  if v_old is not null then
    if (select md5(prosrc) from pg_proc where oid = v_old) is distinct from 'f6abf173cdcdb92cda89636f60cbcdfb' then
      raise exception '20261004h 가드: _shift_start_at(text,timestamptz) 가 20261004c 판과 다르다';
    end if;
    select string_agg(x, ', ') into v_hits from (
      select p.oid::regprocedure::text as x from pg_proc p
       where p.prosrc like '%\_shift\_start\_at%'
         and p.oid not in ('public.set_my_shift_time(uuid,date,text,text)'::regprocedure,
                           'public.punch_my_shift(uuid,text)'::regprocedure, 'public._remind_open_shifts()'::regprocedure)
      union all
      select 'policy ' || pol.polname from pg_policy pol
       where coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') like '%\_shift\_start\_at%'
      union all
      select 'view ' || c.oid::regclass::text from pg_class c
       where c.relkind in ('v', 'm') and pg_get_viewdef(c.oid) like '%\_shift\_start\_at%'
      union all
      select 'depend ' || d.classid::regclass::text || ':' || d.objid from pg_depend d
       where d.refclassid = 'pg_proc'::regclass and d.refobjid = v_old and d.deptype = 'n'
    ) t;
    if to_regclass('cron.job') is not null then
      execute $q$select string_agg('cron ' || jobname, ', ') from cron.job where command like '%\_shift\_start\_at%'$q$ into v_cron;
      v_hits := nullif(concat_ws(', ', v_hits, v_cron), '');
    end if;
    if v_hits is not null then
      raise exception '20261004h 가드: 옛 _shift_start_at 을 부르는 곳이 셋 말고 더 있다 — %', v_hits;
    end if;
  end if;
end
$guard$;

-- ── ① 근무 시작 시각 한 벌(근무 날짜 기준) ─────────────────────────────────────
create or replace function public._shift_start_at(p_work_date date, p_check_in text, p_check_in_at timestamptz)
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $fn$
  select coalesce(
    p_check_in_at,
    case when p_work_date is not null and p_check_in ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      (select case when x.t > now() then x.t - interval '24 hours' else x.t end
         from (select ((p_work_date + (p_check_in::time < time '02:00')::int) + p_check_in::time) at time zone 'Asia/Seoul' as t) x)
    end
  );
$fn$;
revoke all on function public._shift_start_at(date, text, timestamptz) from public, anon, authenticated;

-- ── ② punch_my_shift — 20261004f 본문에서 퇴근의 시작 계산에 근무 날짜만 넘긴다 ──────────────
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
    --   20261004h(R5-01): 시작은 근무 날짜 기준 — 손으로 넣은 출근도 실제 경과 시간을 본다.
    select public._shift_start_at(s.work_date, s.check_in, s.check_in_at) into v_start
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

-- ── ③ set_my_shift_time — 20261004f 본문에서 시작 계산에 근무 날짜만 넘긴다 ──────────────────
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
  --   시작 = _shift_start_at(근무 날짜, 출근, 서버 표지) · 끝 = '지금 퇴근' 이면 지금, 아니면 시작 + (퇴근 − 출근 을 [0, 24h) 로 접은 값).
  --   20261004h(R5-01): 시작은 근무 날짜 기준 — 손으로 넣은 출근 + '지금 퇴근' 도 24시간 초과를 안다.
  --   ponytail: 직접 입력한 HH:MM 퇴근은 끝이 늘 시작 뒤 24시간 안으로 읽혀 상한에 걸리지 않는다 — 25시간 넘긴 근무의 '지금' 을
  --     사람이 숫자로 쳐 넣으면 못 가른다. 그 길은 화면 안내가 '실제 퇴근 시각' 을 넣으라고 말한다.
  select s.check_in, s.check_out, s.check_in_at into v_row from public.staff_schedule s where s.id = v_id;
  if v_row.check_in is not null and v_row.check_out is not null then
    v_start := public._shift_start_at(p_work_date, v_row.check_in, v_row.check_in_at);
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

-- ── ④ 18시간 미퇴근 본인 알림 — 시작을 근무 날짜 기준으로 ────────────────────────────
-- 손으로 넣은 출근도 실제로 18시간이 지나면 알린다(옛 해석은 24시간 넘은 근무를 짧게 읽어 놓쳤다).
--   work_date 하한(KST 오늘-2)·행당 1회 표지·수신자(_shift_row_owner)는 20261004f 그대로다.
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
       and public._shift_start_at(s.work_date, s.check_in, s.check_in_at) <= now() - interval '18 hours'
    returning public._shift_row_owner(s.venue_id, s.staff_name, s.user_id) as user_id, s.venue_id,
              public._shift_start_at(s.work_date, s.check_in, s.check_in_at) as started
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

-- ── ⑤ 옛 2인자 함수 제거(부르는 곳은 ⓪ 가드가 셋뿐임을 확인했고, 셋은 위에서 3인자로 바꿨다) ──────────
drop function if exists public._shift_start_at(text, timestamptz);

-- ── 자가검사 ───────────────────────────────────────────────────────────────
do $chk$
declare f record; bad text := '';
begin
  for f in select * from (values
      ('public.punch_my_shift(uuid,text)', true, true, false),
      ('public.set_my_shift_time(uuid,date,text,text)', true, true, false),
      ('public._remind_open_shifts()', true, false, false),
      ('public._shift_start_at(date,text,timestamptz)', false, false, false)
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
  if to_regprocedure('public._shift_start_at(text,timestamptz)') is not null then bad := bad || ' old_fn'; end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.punch_my_shift(uuid,text)'::regprocedure) is distinct from 'e4447d1de87df43b2079a72a8c7d2326' then bad := bad || ' punch_body'; end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.set_my_shift_time(uuid,date,text,text)'::regprocedure) is distinct from '969cebbb0c9105e335711c775b5d64b6' then bad := bad || ' set_body'; end if;
  if (select md5(prosrc) from pg_proc where oid = 'public._remind_open_shifts()'::regprocedure) is distinct from '33269754889aeca9a893b596e9f34ecc' then bad := bad || ' remind_body'; end if;
  if (select md5(prosrc) from pg_proc where oid = 'public._shift_span_check(timestamptz,timestamptz)'::regprocedure) is distinct from '43a61a061db7f65c72de060b6189e2e9' then
    bad := bad || ' span_check_changed';
  end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.is_my_shift_row(uuid,text,uuid)'::regprocedure) is distinct from 'b260fc6645142de168215d969895601a' then
    bad := bad || ' is_my_shift_row_changed';
  end if;
  if bad <> '' then raise exception '20261004h 자가검사 실패:%', bad; end if;
end
$chk$;
