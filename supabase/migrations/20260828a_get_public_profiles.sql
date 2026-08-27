-- 쪽지·채팅 상대 표시명 조회(2026-08-28 오너 지시 "상대는 회원이 아니라 아이디로").
-- profiles RLS 가 본인·admin 한정이라 클라 직접 select 가 빈 결과 → 전원 '회원' 폴백이었다.
-- 공개 표시용 최소 4필드만 여는 SECURITY DEFINER RPC — nickname·name·avatar_color 는
-- 게시글(user_name)·랭킹에 이미 공개 표시되는 수준이라 신규 노출이 아니다.
create or replace function public.get_public_profiles(p_ids uuid[])
returns table (id uuid, nickname text, name text, avatar_color text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nickname, p.name, p.avatar_color
  from public.profiles p
  where p.id = any(p_ids)
  limit 200; -- 스레드 목록 상한(오남용 대비)
$$;

revoke all on function public.get_public_profiles(uuid[]) from public, anon;
grant execute on function public.get_public_profiles(uuid[]) to authenticated;
