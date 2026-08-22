-- 감사 후속(블랙유저 방지): 섀도우밴 — 부정 의심 계정을 오류 없이(콘텐츠·트레이닝 정상 동작)
-- 활동 랭킹에서만 조용히 제외. 하드 제재(is_account_active=작성 차단)와 별개의 소프트 수단.
-- 대상은 '자가 파밍이 가능한' 활동점수 리더보드뿐. 도메인/글로벌 랭킹은 매장 운영자가 입력하는
-- 실제 토너먼트 결과(닉네임 키)라 계정 섀도우밴과 무관 → 건드리지 않는다.
alter table public.profiles add column if not exists shadowbanned boolean not null default false;

-- 활동 리더보드에서 섀도우밴 계정 제외(CREATE OR REPLACE = 기존 anon/authenticated ACL 보존)
create or replace function public.get_activity_leaderboard(p_limit integer default 20)
 returns table(id uuid, nickname text, activity_points integer, avatar_color text, role user_role, equipped_mark text)
 language sql security definer set search_path to 'public'
as $function$
  select p.id, p.nickname, coalesce(p.activity_points, 0) as activity_points,
         p.avatar_color, p.role, p.equipped_mark
  from public.profiles p
  where coalesce(p.status, 'active') = 'active'
    and p.role <> 'admin'
    and coalesce(p.shadowbanned, false) = false
  order by coalesce(p.activity_points, 0) desc, p.joined_at asc nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$function$;

-- 운영자 전용 토글(NULL-safe 관리자 게이트 — anon=NULL 우회 방지, P27 #6/#7 패턴)
create or replace function public.admin_set_shadowban(p_user_id uuid, p_on boolean)
 returns void language plpgsql security definer set search_path to 'public'
as $fn$
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '권한 없음: 관리자만 섀도우밴을 설정할 수 있습니다';
  end if;
  update public.profiles set shadowbanned = coalesce(p_on, false) where id = p_user_id;
end $fn$;
revoke all on function public.admin_set_shadowban(uuid, boolean) from public;
revoke all on function public.admin_set_shadowban(uuid, boolean) from anon;
grant execute on function public.admin_set_shadowban(uuid, boolean) to authenticated;
