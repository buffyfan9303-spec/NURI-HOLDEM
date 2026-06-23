-- 2026-06-23 (감사 #5): 게시글 좋아요 멱등성/토글 — 기존 bare +1(무제한 증가) 스팸 차단.
create table if not exists public.post_likes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_likes enable row level security;
drop policy if exists post_likes_select_own on public.post_likes;
create policy post_likes_select_own on public.post_likes for select using (user_id = auth.uid());

-- 토글: 있으면 취소(-1), 없으면 좋아요(+1). 서버 권위 카운트+liked 반환.
create or replace function public.toggle_post_like(p_post_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_liked boolean; v_count int;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  if exists (select 1 from public.post_likes where post_id = p_post_id and user_id = v_uid) then
    delete from public.post_likes where post_id = p_post_id and user_id = v_uid;
    update public.community_posts set like_count = greatest(0, coalesce(like_count,0) - 1) where id = p_post_id;
    v_liked := false;
  else
    insert into public.post_likes(post_id, user_id) values (p_post_id, v_uid) on conflict do nothing;
    update public.community_posts set like_count = coalesce(like_count,0) + 1 where id = p_post_id;
    v_liked := true;
  end if;
  select coalesce(like_count,0) into v_count from public.community_posts where id = p_post_id;
  return jsonb_build_object('liked', v_liked, 'count', v_count);
end $$;
revoke all on function public.toggle_post_like(uuid) from public;
grant execute on function public.toggle_post_like(uuid) to authenticated;

-- 구버전 클라/직접 호출 대비 increment_post_likes 도 멱등화(이미 좋아요면 무증가).
create or replace function public.increment_post_likes(post_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_new boolean := false;
begin
  if v_uid is null then return; end if;
  insert into public.post_likes(post_id, user_id) values (post_id, v_uid) on conflict do nothing;
  get diagnostics v_new = row_count;
  if v_new then update public.community_posts set like_count = coalesce(like_count,0) + 1 where id = post_id; end if;
end $$;
