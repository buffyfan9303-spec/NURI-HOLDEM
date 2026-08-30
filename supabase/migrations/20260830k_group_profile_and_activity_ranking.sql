-- 오너 #16 — 일반 커뮤니티(딜러팀·동호회·유튜버) 확장: 팀 소개/전화/카카오톡 설정 + 팀 활동 순위
--
-- 왜 새 RPC 인가:
--  · 연락처 저장의 기존 경로 update_venue_contact 는 can_manage_venue 게이트라
--    role='venue_owner' AND approved 를 요구한다. 딜러팀을 만든 일반 회원은 그 조건을
--    영원히 만족하지 못한다 → 그룹 매니저 전용 경로가 필요하다.
--  · venues UPDATE RLS 는 owner_id 본인/admin 만이라, 개설자가 아닌 '매니저'는
--    직접 update 로도 못 고친다. is_group_manager 로 열어 준다(그룹 한정).
-- DB 는 추가만 — 기존 함수/정책은 건드리지 않는다.

-- 1) 그룹 프로필(소개·전화·카카오톡) 저장 — 그룹 매니저/개설자/운영자만
create or replace function public.update_group_profile(
  p_group uuid, p_description text, p_phone text, p_kakao text
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare k text; kk text;
begin
  select kind into k from public.venues where id = p_group;
  if k is null then raise exception '커뮤니티를 찾을 수 없습니다'; end if;
  if k = 'venue' then raise exception '매장은 이 경로로 수정할 수 없습니다'; end if;
  if not public.is_group_manager(p_group) then raise exception '수정 권한이 없습니다'; end if;

  kk := nullif(trim(coalesce(p_kakao, '')), '');
  if kk is not null and kk !~* '^https?://' then
    raise exception '카카오톡 링크는 http(s):// 로 시작해야 합니다';
  end if;

  update public.venues set
    description   = left(coalesce(p_description, ''), 1000),
    contact_phone = nullif(trim(coalesce(p_phone, '')), ''),
    kakao_url     = kk,
    updated_at    = now()
  where id = p_group;
end; $$;

revoke all on function public.update_group_profile(uuid, text, text, text) from public, anon;
grant execute on function public.update_group_profile(uuid, text, text, text) to authenticated, service_role;

-- 2) 팀 활동 순위 — 승인 멤버의 게시글/채팅 기여도.
--    그룹에는 대회·정산 데이터가 없다(포스터·진행정보는 오너가 명시적으로 제외).
--    그룹이 실제로 생성하는 멤버 단위 데이터는 게시판 글과 채팅뿐이므로 그것으로 집계한다.
--    가중치: 게시글 3 · 채팅 1 (남는 기록 > 흘러가는 기록).
--    §28: 금전적 가치 없는 활동 점수다 — 상금·수익 프레이밍 금지.
--    노출 범위는 원본(group_posts/group_messages RLS)과 같게 멤버/매니저로 제한한다.
create or replace function public.group_activity_ranking(p_group uuid)
returns table (
  user_id uuid, member_name text, member_color text, member_role text,
  post_count bigint, message_count bigint, score bigint, joined_at timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select m.user_id,
         coalesce(m.member_name, '회원'),
         m.member_color,
         m.role,
         coalesce(p.cnt, 0),
         coalesce(g.cnt, 0),
         coalesce(p.cnt, 0) * 3 + coalesce(g.cnt, 0),
         m.created_at
  from public.group_members m
  left join lateral (
    select count(*) as cnt from public.group_posts x
    where x.group_id = m.group_id and x.author_id = m.user_id and x.deleted = false
  ) p on true
  left join lateral (
    select count(*) as cnt from public.group_messages y
    where y.group_id = m.group_id and y.user_id = m.user_id
  ) g on true
  where m.group_id = p_group
    and m.status = 'approved'
    and (public.is_group_member(p_group) or public.is_group_manager(p_group))
  order by (coalesce(p.cnt, 0) * 3 + coalesce(g.cnt, 0)) desc, m.created_at asc
  limit 200;
$$;

revoke all on function public.group_activity_ranking(uuid) from public, anon;
grant execute on function public.group_activity_ranking(uuid) to authenticated, service_role;
