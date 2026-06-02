-- ============================================================================
-- 알림 자동 생성 트리거 (notifications 테이블에 SECURITY DEFINER로 insert)
--  1) 댓글 등록 → 대상(포스터/매장) 소유자에게 알림
--  2) 포스터 승인 → 작성 업주에게 알림
--  3) 업주 가입 승인 → 해당 업주에게 알림
--  (제재 알림은 이메일(notify-sanction)로 대체)
--  모두 멱등 재실행 안전.
-- ============================================================================

-- 1) 댓글 → 소유자 알림
create or replace function public.notify_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_title text;
begin
  if new.schedule_id is not null then
    select owner_id into v_owner from public.schedules where id = new.schedule_id;
    v_title := '내 포스터에 새 문의가 등록되었습니다';
  elsif new.venue_id is not null then
    select owner_id into v_owner from public.venues where id = new.venue_id;
    v_title := '내 매장 커뮤니티에 새 댓글이 등록되었습니다';
  else
    return new;
  end if;
  if v_owner is null or v_owner = new.user_id then return new; end if;
  insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, read)
  values (v_owner, 'comment', v_title, left(coalesce(new.content, ''), 80),
          left(coalesce(new.user_name, '?'), 1), '#5A6175', false);
  return new;
end; $$;

drop trigger if exists trg_notify_on_comment on public.comments;
create trigger trg_notify_on_comment after insert on public.comments
  for each row execute function public.notify_on_comment();

-- 2) 포스터 승인 → 업주 알림
create or replace function public.notify_on_schedule_approved()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.approved = true and (old.approved is distinct from true) and new.owner_id is not null then
    insert into public.notifications (user_id, type, title, message, avatar_color, read)
    values (new.owner_id, 'approval', '포스터 승인 완료',
            coalesce(new.title, '') || ' 포스터가 승인되어 메인에 게시되었습니다.', '#FFD100', false);
  end if;
  return new;
end; $$;

drop trigger if exists trg_notify_schedule_approved on public.schedules;
create trigger trg_notify_schedule_approved after update on public.schedules
  for each row execute function public.notify_on_schedule_approved();

-- 3) 업주 가입 승인 → 업주 알림
create or replace function public.notify_on_owner_approved()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.approved = true and (old.approved is distinct from true) and new.role = 'venue_owner' then
    insert into public.notifications (user_id, type, title, message, avatar_color, read)
    values (new.id, 'approval', '매장 업주 승인 완료',
            '승인이 완료되었습니다. 이제 포스터를 등록할 수 있습니다.', '#FFD100', false);
  end if;
  return new;
end; $$;

drop trigger if exists trg_notify_owner_approved on public.profiles;
create trigger trg_notify_owner_approved after update on public.profiles
  for each row execute function public.notify_on_owner_approved();
