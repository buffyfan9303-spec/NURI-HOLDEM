-- 순위 입력 자동완성 — 닉네임/실명 부분 일치 검색(업주·운영자만: 실명 포함 반환)
create or replace function public.search_members_for_ranking(p_q text)
returns table(nickname text, real_name text)
language sql
security definer
set search_path to 'public'
as $$
  select p.nickname, p.name
  from public.profiles p
  where exists (select 1 from profiles me where me.id = auth.uid() and me.role in ('venue_owner','admin'))
    and coalesce(p.status::text, 'active') = 'active'
    and btrim(coalesce(p_q, '')) <> ''
    and (p.nickname ilike '%' || btrim(p_q) || '%' or p.name ilike '%' || btrim(p_q) || '%')
  order by (p.nickname = btrim(p_q)) desc, p.nickname
  limit 8;
$$;
grant execute on function public.search_members_for_ranking(text) to authenticated;
