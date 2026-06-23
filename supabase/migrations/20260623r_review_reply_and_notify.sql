-- 2026-06-23 #23 매장 후기 업주 답글 + 새 후기 알림(낮은 별점 우선) — 평판 관리 루프.
alter table public.venue_reviews add column if not exists owner_reply text;
alter table public.venue_reviews add column if not exists owner_reply_at timestamptz;

create or replace function public.reply_to_review(p_review_id uuid, p_reply text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_venue uuid;
begin
  select venue_id into v_venue from public.venue_reviews where id = p_review_id;
  if v_venue is null then raise exception '후기를 찾을 수 없습니다'; end if;
  if not public.can_manage_pos(v_venue) then raise exception '권한이 없습니다'; end if;
  update public.venue_reviews
     set owner_reply = nullif(btrim(p_reply), ''),
         owner_reply_at = case when btrim(coalesce(p_reply,'')) = '' then null else now() end
   where id = p_review_id;
end $$;
revoke all on function public.reply_to_review(uuid, text) from public;
grant execute on function public.reply_to_review(uuid, text) to authenticated;

create or replace function public.notify_on_review()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner uuid; v_vname text;
begin
  select owner_id, name into v_owner, v_vname from public.venues where id = new.venue_id;
  if v_owner is null or v_owner = new.user_id then return new; end if;
  insert into public.notifications(user_id, type, title, message, avatar_text, avatar_color, read)
  values (v_owner, 'system',
    case when new.rating <= 2 then '🚨 낮은 평점 후기' else '⭐ 새 매장 후기' end,
    coalesce(v_vname,'내 매장') || ' · ' || new.rating || '점' || case when btrim(coalesce(new.content,'')) <> '' then ' — ' || left(new.content, 60) else '' end,
    '⭐', case when new.rating <= 2 then '#FF4D6D' else '#FCD535' end, false);
  return new;
end $$;
drop trigger if exists trg_notify_review on public.venue_reviews;
create trigger trg_notify_review after insert on public.venue_reviews for each row execute function public.notify_on_review();
