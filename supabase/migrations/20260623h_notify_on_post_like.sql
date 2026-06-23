-- 2026-06-23 게시글 좋아요 알림(참여 유도). 본인 좋아요 제외. notify_on_comment 패턴.
-- 취소(DELETE)는 알림 없음 — INSERT 에만 발화. search_path 고정.
create or replace function public.notify_on_post_like()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_author uuid; v_liker text;
begin
  select user_id into v_author from public.community_posts where id = new.post_id;
  if v_author is null or v_author = new.user_id then return new; end if;
  select coalesce(nullif(btrim(nickname), ''), name) into v_liker from public.profiles where id = new.user_id;
  insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, read)
  values (v_author, 'system', '❤️ 내 글에 좋아요가 달렸어요',
          coalesce(v_liker, '회원') || '님이 회원님의 글을 좋아합니다', '❤️', '#FF4D6D', false);
  return new;
end; $function$;
drop trigger if exists trg_notify_post_like on public.post_likes;
create trigger trg_notify_post_like after insert on public.post_likes
  for each row execute function public.notify_on_post_like();
