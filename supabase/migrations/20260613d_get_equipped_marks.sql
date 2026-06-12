-- 게시글·댓글 작성자 옆 장착 마크 표시용 — id 배열로 일괄 조회(비민감 컬럼만)
create or replace function public.get_equipped_marks(p_ids uuid[])
returns table(id uuid, equipped_mark text)
language sql
security definer
set search_path to 'public'
as $$
  select p.id, p.equipped_mark
  from public.profiles p
  where p.id = any(p_ids) and p.equipped_mark is not null;
$$;
grant execute on function public.get_equipped_marks(uuid[]) to anon, authenticated;
