-- 활동 랭킹에 장착 마크 포함(상점 2차) — 반환 타입 변경이라 drop 후 재생성
drop function if exists public.get_activity_leaderboard(integer);
create function public.get_activity_leaderboard(p_limit integer default 20)
returns table(id uuid, nickname text, activity_points integer, avatar_color text, role user_role, equipped_mark text)
language sql
security definer
set search_path to 'public'
as $function$
  select p.id, p.nickname, coalesce(p.activity_points, 0) as activity_points,
         p.avatar_color, p.role, p.equipped_mark
  from public.profiles p
  where coalesce(p.status, 'active') = 'active'
    and p.role <> 'admin'
  order by coalesce(p.activity_points, 0) desc, p.joined_at asc nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$function$;
grant execute on function public.get_activity_leaderboard(integer) to anon, authenticated;
