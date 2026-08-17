-- 예약↔체크인 연결(노쇼 근거 1단계): 업주 예약 내역에 '당일 그 매장 체크인 여부'를 붙인다.
-- 반환 타입 변경이라 DROP 후 재생성 — 기존 ACL(anon 포함, 내부 can_manage_pos 가드) 명시 복원.
-- (라이브 적용: owner_reservations_visited)
drop function if exists public.schedule_reservations_for_owner(uuid);
create function public.schedule_reservations_for_owner(p_schedule_id uuid)
returns table(id uuid, display_name text, nickname text, real_name text, created_at timestamptz, visited boolean)
language sql
stable security definer
set search_path to 'public'
as $function$
  select r.id, r.display_name, p.nickname, p.real_name, r.created_at,
    (r.user_id is not null and exists (
      select 1 from public.checkins c
      join public.schedules s2 on s2.id = p_schedule_id
      where c.user_id = r.user_id and c.venue_id = s2.venue_id
        and (c.created_at at time zone 'Asia/Seoul')::date = s2.date
    )) as visited
  from public.schedule_reservations r
  left join public.profiles p on p.id = r.user_id
  where r.schedule_id = p_schedule_id
    and exists (
      select 1 from public.schedules s
      where s.id = p_schedule_id and s.venue_id is not null and can_manage_pos(s.venue_id)
    )
  order by r.created_at asc;
$function$;
revoke all on function public.schedule_reservations_for_owner(uuid) from public;
grant execute on function public.schedule_reservations_for_owner(uuid) to anon, authenticated, service_role;
