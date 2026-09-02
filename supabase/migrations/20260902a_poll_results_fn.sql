-- 20260902a — 투표 집계 뷰(post_poll_results) → SECURITY DEFINER 함수(poll_results)
--
-- 왜: Supabase 어드바이저 ERROR 0010 'security_definer_view'. 뷰는 소유자(postgres) 권한으로 RLS 를 우회해 읽힌다.
--   그런데 이 뷰는 **일부러** 그렇게 만들어졌다 — post_poll_votes 는 본인 행만 읽히므로(post_votes_read_self)
--   개별 투표자를 노출하지 않으면서 득표수를 세려면 정의자 권한이 필요하다.
--   security_invoker 로 바꾸면 각자 자기 표 1개만 세어 결과가 깨지고, 투표 표를 전체 공개하면 '누가 찍었나' 가 샌다.
--   → 같은 목적을 **함수**로 옮긴다: SECURITY DEFINER + search_path 고정 + ACL 명시(nuri-migration §1·§2).
--     함수는 poll_id 하나만 받아 집계 행만 돌려주므로 user_id 는 어디로도 나가지 않는다.
--
-- 앱: src/api/postAttachments.ts fetchPollResults → supabase.rpc('poll_results', { p_poll_id })
-- 멱등: create or replace / drop view if exists.

create or replace function public.poll_results(p_poll_id uuid)
returns table (poll_id uuid, option_id uuid, idx smallint, label text, votes int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.poll_id, o.id as option_id, o.idx, o.label, count(v.user_id)::int as votes
  from public.post_poll_options o
  left join public.post_poll_votes v on v.option_id = o.id
  where o.poll_id = p_poll_id
  group by o.poll_id, o.id, o.idx, o.label
  order by o.idx;
$$;

revoke all on function public.poll_results(uuid) from public;
grant execute on function public.poll_results(uuid) to anon, authenticated;  -- post_polls 자체가 공개 읽기라 결과도 공개

-- cast_poll_vote: 뷰 대신 함수를 쓰고, search_path 에 pg_temp 를 붙인다(하이재킹 방지 §2). 시그니처·반환 불변.
create or replace function public.cast_poll_vote(p_poll_id uuid, p_option_id uuid)
returns table (option_id uuid, idx smallint, label text, votes int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1 from post_poll_options o where o.id = p_option_id and o.poll_id = p_poll_id
  ) then
    raise exception 'OPTION_POLL_MISMATCH' using errcode = '22023';
  end if;

  if exists (
    select 1 from post_polls p
    where p.id = p_poll_id and p.closes_at is not null and p.closes_at <= now()
  ) then
    raise exception 'POLL_CLOSED' using errcode = '22023';
  end if;

  insert into post_poll_votes (poll_id, option_id, user_id)
  values (p_poll_id, p_option_id, v_user)
  on conflict (poll_id, user_id)
  do update set option_id = excluded.option_id, created_at = now();

  return query
    select r.option_id, r.idx, r.label, r.votes
    from public.poll_results(p_poll_id) r
    order by r.idx;
end;
$$;

revoke all on function public.cast_poll_vote(uuid, uuid) from public;
grant execute on function public.cast_poll_vote(uuid, uuid) to authenticated;

drop view if exists public.post_poll_results;
