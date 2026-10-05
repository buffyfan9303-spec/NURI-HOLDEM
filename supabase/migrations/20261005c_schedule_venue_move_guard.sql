-- ✅ 적용 완료 2026-10-05 (critical 재반증 통과, 적용 후 리허설 5b 18/18·5c 8/8)
-- (원래 머리) 초안 (store-team 2026-10-05) — 미적용. 적용 판단·실행은 리드. 리허설: supabase/tests/20261005c_rehearsal.sql
-- 20261005c — 포스터(schedules)를 다른 매장으로 옮겨 그 예약자를 '내 고객'으로 만드는 길을 막는다 (critical 반증 B, 20261005b 후속)
--
-- 구멍: schedules_update 의 USING 은 작성자(owner_id = auth.uid())를 통과시키고, WITH CHECK 는 **새** 매장 운영 권한만 본다.
--   그래서 예전에 다른 매장(ww)에 포스터를 쓴 사람(공동 운영 해제 등)이 그 포스터의 venue_id 를 자기 매장(vv)으로 바꾸면
--   ww 손님들의 예약(schedule_reservations)이 vv 소속이 되고, _venue_customer_ids(vv) 에 들어가 전화번호 마스킹이 풀린다.
--   운영 권한이 있는 두 매장 사이라도 예약이 달린 포스터를 옮기면 같은 효과다(예약자는 ww 를 골랐지 vv 를 고른 게 아니다).
--
-- 규칙(관리자 제외): 옛 매장이 있고, (옛 매장 운영 권한이 없거나 그 포스터에 예약이 있으면) venue_id 변경을 거부한다.
--   · 자기 매장끼리 예약 없는 포스터 이동, 매장 없는 포스터(venue_id null)에 매장 지정은 그대로 된다.
--   · 정의자 함수 경로(current_user ≠ authenticated/anon)는 통과 — 현재 venue_id 를 바꾸는 정의자 함수는 0개(2026-10-05 prosrc 실측).
--   · FK schedules.venue_id 는 ON DELETE CASCADE(매장 삭제 시 포스터 삭제)라 이 트리거와 엇갈리지 않는다.
-- 클라 영향: src/api/schedules.ts updateSchedule 은 venue_id 를 싣지 않는다(포스터 수정 화면은 매장을 바꾸지 않는다) — 트리거 WHEN 이 안 걸린다.
--   그룹 포스터의 소속 변경은 prevent_self_approve_poster(20261002h)가 이미 막는다. 이 파일은 그 함수를 건드리지 않는다.
--
-- 되돌리기: drop trigger trg_guard_schedule_venue_move on public.schedules;
--          drop function public._guard_schedule_venue_move(); drop function public._schedule_has_reservations(uuid);

-- 예약 유무 — 트리거가 호출 역할로 돌아도 RLS(sr_select)에 가려 '없음'으로 보이지 않게 정의자로 센다(fail-open 방지).
--   트리거(호출 역할)가 부르므로 authenticated 에 실행을 준다. 돌려주는 값은 그 포스터에 예약이 있느냐 하나뿐이다.
create or replace function public._schedule_has_reservations(p_schedule_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select exists (select 1 from public.schedule_reservations r where r.schedule_id = p_schedule_id);
$function$;
revoke all on function public._schedule_has_reservations(uuid) from public, anon;
grant execute on function public._schedule_has_reservations(uuid) to authenticated, service_role;

-- 정의자 함수가 아니다 — current_user 로 클라(authenticated/anon)와 정의자 함수 경로(postgres)를 가른다(20261005b ④ 와 같은 방식).
-- 트리거 함수 실행에는 EXECUTE 권한이 필요 없다(생성 시점에만 본다) → 클라 역할에서 모두 회수.
create or replace function public._guard_schedule_venue_move()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if current_user in ('authenticated', 'anon')
     and not coalesce(public.my_role() = 'admin'::user_role, false)
     and old.venue_id is not null
     and ( not coalesce(public.can_manage_venue_schedules(old.venue_id), false)
           or public._schedule_has_reservations(old.id) ) then
    raise exception using errcode = '42501',
      message = '예약이 있거나 운영하지 않는 매장의 포스터는 다른 매장으로 옮길 수 없습니다';
  end if;
  return new;
end $function$;
revoke all on function public._guard_schedule_venue_move() from public, anon, authenticated;
-- drop trigger 는 표 잠금이 커서 create or replace trigger 로 쓴다(PG14+).
create or replace trigger trg_guard_schedule_venue_move
  before update of venue_id on public.schedules
  for each row when (old.venue_id is distinct from new.venue_id)
  execute function public._guard_schedule_venue_move();

-- §9 자가검사
do $check$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.schedules'::regclass
                  and tgname = 'trg_guard_schedule_venue_move' and tgenabled <> 'D')
     or (select prosecdef from pg_proc where oid = 'public._guard_schedule_venue_move()'::regprocedure)
     or not (select prosecdef from pg_proc where oid = 'public._schedule_has_reservations(uuid)'::regprocedure) then
    raise exception '20261005c 자가검사: 포스터 매장 이동 가드 트리거·함수가 기대와 다르다';
  end if;
  if has_function_privilege('anon', 'public._schedule_has_reservations(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public._schedule_has_reservations(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.can_manage_venue_schedules(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.my_role()', 'EXECUTE') then
    raise exception '20261005c 자가검사: 트리거가 호출하는 함수의 실행 권한이 기대와 다르다(클라 포스터 수정이 깨진다)';
  end if;
end $check$;
