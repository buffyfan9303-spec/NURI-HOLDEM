-- ✅ 적용 완료 2026-10-02 (리드, Management API) — 트리거 trg_guard_staff_schedule_member. 리허설 P1~P10 ok·N1~N5 22023 / 트리거 없으면 N1~N5 전부 ok(음성 대조). 적용 후 재실행 OK. advisors ERROR 0
-- ⏳ 미적용 초안(2026-10-02, critical-reviewer · A3 ②). 리드 리허설·음성 대조 뒤 지시가 있을 때만 적용한다.
--    적용은 이 파일 전체(REHEARSAL 주석 블록 제외)를 한 번의 execute_sql 로.
-- 20261002e — 근무표(staff_schedule) 행의 직원 계정(user_id)이 **그 매장 사람**인지 서버가 본다.
--
-- 왜(review-store-link-1002 2a · review-store-link-1002b-mig D): 근무표 쓰기 정책은 can_manage_schedule(venue_id) 만 본다.
--   user_id 는 FK(profiles) 뿐이라 A 매장 직원 id 를 B 매장 행에 넣어도 통과했다. 화면 경합(늦게 온 A 명부)은 7a502afc 에서 닫혔지만
--   서버는 여전히 소속을 모른다. 그런 행은 is_my_shift_row 가 `p_user_id = auth.uid()` 갈래로만 판정해
--   **이름이 같은 진짜 B 직원도 출근을 못 찍는다**(조용한 무결성 손실, 유출·권한 상승은 없음 — is_my_shift_row 가 소속을 먼저 본다).
--
-- 설계(지난 검토 D 의 조건과 다른 한 곳을 표시):
--   · BEFORE INSERT OR UPDATE OF user_id, venue_id — 그 밖의 칸(check_in·start_hm·confirmed)만 바꾸는 갱신은 트리거가 아예 안 돈다.
--     UPDATE OF 는 SET 목록에 칸이 있으면 값이 같아도 돌므로, 본문에서 '둘 다 그대로면 통과'를 한 번 더 본다.
--     → 직원이 정지·퇴사·다른 매장으로 옮긴 뒤에도 그 사람의 옛 행의 출퇴근·시각 수정·확정은 막히지 않는다.
--   · SECURITY DEFINER + search_path 고정 — profiles·venues·venue_owners 를 호출자 RLS 와 무관하게 읽는다.
--   · 🔶 지난 검토 D 는 `_is_active_venue_staff`(승인·비정지 직원) 를 제안했지만 **소속(role=venue_staff 이고 profiles.venue_id = 그 매장)** 으로 바꿨다.
--     근거: 화면 명부 get_my_venue_staff 는 is_active=false(대기·정지) 직원도 돌려주고, StaffSchedule.tsx 의 staffIdByName 은 그들에게도 id 를 붙인다.
--     '활성' 으로 막으면 업주가 대기·정지 직원을 근무표에 넣는 지금 동작이 22023 오류로 바뀐다(기능 소실). 막으려는 결함은 '다른 매장 id' 이고
--     활성 여부는 출퇴근 RPC(is_my_shift_row·can_manage_schedule)가 이미 따로 본다.
--   · 허용 4갈래: ① 그 매장 직원(소속) ② 그 매장(kind=venue) 대표 ③ 그 매장 승인 공동 운영자 ④ 자기 자신 + 그 매장 근무표 권한
--     (④ = 관리자·위임 직원이 자기 이름을 넣는 경우. staffIdByName 은 로그인한 사람 자신을 늘 명부에 더한다.)
--   · 위반은 raise 22023(명시적 실패) — user_id 를 NULL 로 바꿔 이름 판정으로 후퇴시키지 않는다. 클라이언트는 이미 막으므로 오류가 나면 경합 재발이다.
--   · NULL user_id(계정 없는 딜러·동명이인)는 늘 통과. profiles 삭제의 FK `ON DELETE SET NULL` 갱신도 NULL 이라 통과.
--
-- 라이브 실측(2026-10-02, 바꾸기 전): staff_schedule 3행(전부 더미 d1002…, user_id 3/3 이 그 매장 venue_staff — 적용해도 기존 행 영향 0) ·
--   트리거 0 · 쓰기 정책 staff_sched_insert/update/delete = can_manage_schedule(venue_id) · DEFINER 쓰기 RPC 는 punch_my_shift·set_my_shift_time 뿐
--   (둘 다 check_in/check_out 만 바꾼다 → 트리거 미발동).

do $$
begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.staff_schedule'::regclass and not tgisinternal) then
    raise exception '20261002e 게이트: staff_schedule 에 초안 작성 때 없던 트리거가 있다 — 순서·상호작용부터 확인';
  end if;
  if (select pg_get_constraintdef(oid) from pg_constraint where conname = 'staff_schedule_user_id_fkey')
       is distinct from 'FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL' then
    raise exception '20261002e 게이트: user_id FK 가 초안 작성 때와 다르다';
  end if;
  if exists (select 1 from public.staff_schedule s
              where s.user_id is not null
                and not exists (select 1 from public.profiles p where p.id = s.user_id and p.role = 'venue_staff' and p.venue_id = s.venue_id)
                and not exists (select 1 from public.venues v where v.id = s.venue_id and v.kind = 'venue' and v.owner_id = s.user_id)
                and not exists (select 1 from public.venue_owners vo where vo.venue_id = s.venue_id and vo.user_id = s.user_id and vo.status = 'approved')) then
    raise exception '20261002e 게이트: 이미 소속 밖 user_id 를 가진 행이 있다 — 트리거는 기존 행을 고치지 않으니 먼저 목록을 뽑아 판단';
  end if;
end $$;

create or replace function public._guard_staff_schedule_member()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.user_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.user_id is not distinct from old.user_id
     and new.venue_id is not distinct from old.venue_id then
    return new;
  end if;
  if exists (select 1 from public.profiles p
              where p.id = new.user_id and p.role = 'venue_staff' and p.venue_id = new.venue_id)
     or exists (select 1 from public.venues v
                 where v.id = new.venue_id and v.kind = 'venue' and v.owner_id = new.user_id)
     or exists (select 1 from public.venue_owners vo
                 where vo.venue_id = new.venue_id and vo.user_id = new.user_id and vo.status = 'approved')
     or (new.user_id = auth.uid() and public.can_manage_schedule(new.venue_id))
  then
    return new;
  end if;
  raise exception '근무표에 넣은 직원 계정이 이 매장 소속이 아닙니다 — 직원 목록을 새로 불러온 뒤 다시 배정해 주세요'
    using errcode = '22023';
end
$fn$;

revoke all on function public._guard_staff_schedule_member() from public, anon, authenticated;

drop trigger if exists trg_guard_staff_schedule_member on public.staff_schedule;
create trigger trg_guard_staff_schedule_member
  before insert or update of user_id, venue_id on public.staff_schedule
  for each row execute function public._guard_staff_schedule_member();

-- 자가검사
do $$
declare f oid := 'public._guard_staff_schedule_member()'::regprocedure;
begin
  if not (select prosecdef from pg_proc where oid = f) then
    raise exception '20261002e: 트리거 함수가 SECURITY DEFINER 가 아니다';
  end if;
  if (select proconfig from pg_proc where oid = f) is distinct from array['search_path=public, pg_temp'] then
    raise exception '20261002e: search_path 가 고정되지 않았다';
  end if;
  if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
    raise exception '20261002e: 트리거 함수 EXECUTE 가 anon/authenticated 에 열려 있다';
  end if;
  if (select pg_get_triggerdef(t.oid) from pg_trigger t
       where t.tgrelid = 'public.staff_schedule'::regclass and t.tgname = 'trg_guard_staff_schedule_member')
     !~ 'BEFORE INSERT OR UPDATE OF user_id, venue_id ON public\.staff_schedule FOR EACH ROW' then
    raise exception '20261002e: 트리거가 INSERT + UPDATE OF user_id, venue_id 로 걸리지 않았다 — 정지 직원 행 갱신까지 막힐 수 있다';
  end if;
end $$;

/* ── REHEARSAL — 운영 DB 에서 `begin; <이 파일 본문> <아래 블록> rollback;` 로 돌린다. 끝의 raise 가 전부 되돌린다.
   계정: 더미 dummy1002(2026-10-02 조회 — owner1·staff1·staff2 = venue_main, owner2·staff3 = venue_daily, 모두 승인·active) ·
         X 708de904(user, 소유·소속 0) · ADMIN f5d305f2. 🔴 F 단계(더미 삭제) 뒤에는 dummy1002 가 없어 맨 앞 게이트에서 멈춘다 — 그때는 합성 계정으로 바꿔야 한다.
   음성 대조: 같은 블록을 **본문 없이**(트리거 없음) 돌리면 N1~N4 가 전부 'ok' 로 바뀌어야 한다(시험이 트리거를 실제로 가르는지 확인).
-- ▼REHEARSAL
create function pg_temp.ss_as(u uuid, sql text) returns text language plpgsql as $f$
declare st text := 'ok'; n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute sql;
    get diagnostics n = row_count;
    if n = 0 then st := 'zero'; end if;     -- RLS 로 0행이면 'ok' 로 위장되지 않게
  exception when others then st := sqlstate;
  end;
  execute 'reset role';
  return st;
end $f$;

do $$
declare
  o1 uuid; o2 uuid; s1 uuid; s2 uuid; s3 uuid; vm uuid; vd uuid; sh1 uuid; sh2 uuid;
  c_x     uuid := '708de904-913e-4082-8803-8a2766b342f9';
  c_admin uuid := 'f5d305f2-0f30-4d61-91ce-51f3332e5193';
  d date := (now() at time zone 'Asia/Seoul')::date + 40;    -- 기존 행과 겹치지 않는 날
  res text := '';
begin
  if to_regnamespace('dummy1002') is null then raise exception 'REHEARSAL_BLOCKED: dummy1002 없음 — 합성 계정 판으로'; end if;
  o1 := dummy1002.id('owner1'); o2 := dummy1002.id('owner2');
  s1 := dummy1002.id('staff1'); s2 := dummy1002.id('staff2'); s3 := dummy1002.id('staff3');
  vm := dummy1002.id('venue_main'); vd := dummy1002.id('venue_daily');
  sh1 := dummy1002.id('shift_staff1'); sh2 := dummy1002.id('shift_staff2');

  -- 양성
  res := res || ' P1직원=' || pg_temp.ss_as(o1, format(
    'insert into public.staff_schedule(venue_id, work_date, staff_name, user_id, created_by) values (%L, %L, %L, %L, %L)', vm, d, 'R-직원1', s1, o1));
  res := res || ' P2업주본인=' || pg_temp.ss_as(o1, format(
    'insert into public.staff_schedule(venue_id, work_date, staff_name, user_id, created_by) values (%L, %L, %L, %L, %L)', vm, d, 'R-업주', o1, o1));
  res := res || ' P3계정없음=' || pg_temp.ss_as(o1, format(
    'insert into public.staff_schedule(venue_id, work_date, staff_name) values (%L, %L, %L)', vm, d, 'R-딜러'));
  -- 화면 경로 그대로(addStaffShift = upsert ignoreDuplicates = on conflict do nothing) — 같은 키 재삽입은 0행이 정상
  res := res || ' P4중복무시=' || pg_temp.ss_as(o1, format(
    'insert into public.staff_schedule(venue_id, work_date, staff_name, user_id) values (%L, %L, %L, %L) on conflict (venue_id, work_date, staff_name) do nothing', vm, d, 'R-직원1', s1));
  -- 대기 직원도 배정은 된다(명부에 is_active=false 로 나온다 — 활성 판정을 쓰면 여기서 깨진다)
  update public.profiles set approved = false where id = s2;
  res := res || ' P5대기직원=' || pg_temp.ss_as(o1, format(
    'insert into public.staff_schedule(venue_id, work_date, staff_name, user_id) values (%L, %L, %L, %L)', vm, d, 'R-직원2', s2));
  update public.profiles set approved = true where id = s2;
  -- 공동 운영자(그 매장 승인 행)
  insert into public.venue_owners(venue_id, user_id, status) values (vm, c_x, 'approved');
  res := res || ' P6공동운영자=' || pg_temp.ss_as(o1, format(
    'insert into public.staff_schedule(venue_id, work_date, staff_name, user_id) values (%L, %L, %L, %L)', vm, d, 'R-공동', c_x));
  delete from public.venue_owners where venue_id = vm and user_id = c_x;
  -- 관리자가 자기 이름을 남의 매장 근무표에 넣음(④ 갈래)
  res := res || ' P7관리자본인=' || pg_temp.ss_as(c_admin, format(
    'insert into public.staff_schedule(venue_id, work_date, staff_name, user_id) values (%L, %L, %L, %L)', vm, d, 'R-관리자', c_admin));
  -- 정지된 직원의 옛 행: 업주의 시각 수정·확정, 직원이 다른 매장으로 옮긴 뒤의 시각 수정 — 트리거가 막지 않아야 한다
  update public.profiles set status = 'suspended', suspended_until = null where id = s1;
  res := res || ' P8정지직원행수정=' || pg_temp.ss_as(o1, format(
    'update public.staff_schedule set check_in = %L, confirmed = true where id = %L', '17:05', sh1));
  update public.profiles set venue_id = vd where id = s2;
  res := res || ' P9이적직원행수정=' || pg_temp.ss_as(o1, format(
    'update public.staff_schedule set start_hm = %L where id = %L', '18:30', sh2));
  -- 같은 값으로 user_id 를 다시 적는 갱신(UPDATE OF 는 발동하지만 본문이 통과시켜야 한다)
  res := res || ' P10같은값재기록=' || pg_temp.ss_as(o1, format(
    'update public.staff_schedule set user_id = user_id, check_out = %L where id = %L', '23:00', sh2));
  update public.profiles set status = 'active', venue_id = vm where id in (s1, s2);

  -- 음성
  res := res || ' N1다른매장직원=' || pg_temp.ss_as(o1, format(
    'insert into public.staff_schedule(venue_id, work_date, staff_name, user_id) values (%L, %L, %L, %L)', vm, d, 'R-남의직원', s3));
  res := res || ' N2일반회원=' || pg_temp.ss_as(o1, format(
    'insert into public.staff_schedule(venue_id, work_date, staff_name, user_id) values (%L, %L, %L, %L)', vm, d, 'R-회원', c_x));
  res := res || ' N3기존행id바꿈=' || pg_temp.ss_as(o1, format(
    'update public.staff_schedule set user_id = %L where id = %L', s3, sh1));
  res := res || ' N4관리자가매장옮김=' || pg_temp.ss_as(c_admin, format(
    'update public.staff_schedule set venue_id = %L where id = %L', vd, sh1));      -- staff1 은 venue_main 소속
  res := res || ' N5다른업주=' || pg_temp.ss_as(o1, format(
    'insert into public.staff_schedule(venue_id, work_date, staff_name, user_id) values (%L, %L, %L, %L)', vm, d, 'R-남의업주', o2));

  -- 기대: P1~P3·P5~P10 = ok, P4 = zero(중복 무시), N1~N5 = 22023. 42501 은 정책 — 시험부터 의심.
  if res is distinct from
     ' P1직원=ok P2업주본인=ok P3계정없음=ok P4중복무시=zero P5대기직원=ok P6공동운영자=ok P7관리자본인=ok'
     ' P8정지직원행수정=ok P9이적직원행수정=ok P10같은값재기록=ok'
     ' N1다른매장직원=22023 N2일반회원=22023 N3기존행id바꿈=22023 N4관리자가매장옮김=22023 N5다른업주=22023' then
    raise exception 'REHEARSAL_FAIL 20261002e:%', res;
  end if;
  raise exception 'REHEARSAL_OK 20261002e:%', res;
end $$;
*/
