-- 알림 배선 일제 수정(2026-08-17 UX 재감사 확정분). (라이브 적용: notification_wiring)
-- ① 리마인더: enum 수정 후 재배선 + 탭하면 포스터로(link) ② 팔로워 새 포스터 2중 발송 제거
-- ③ 댓글: 커뮤니티 게시글 댓글도 글쓴이에게 + 전 분기 link ④ 좋아요 link
-- ⑤ 시즌 보상 link → 해당 매장 페이지 ⑥ 이용권 발급·적립 시 수령자 알림(+푸시 자동)
-- 전부 CREATE OR REPLACE(동일 시그니처) = 기존 ACL 보존.

-- ── ① 리마인더 — link 추가(클라이언트 /schedules/:id 처리 기존재) ────────────
create or replace function public.send_tournament_reminders()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s record; v_now timestamp; v_start timestamp; v_sent int;
begin
  v_now := now() at time zone 'Asia/Seoul';
  for s in
    select id, title, pub_name, date, start_time
      from public.schedules
     where approved = true
       and reminder_sent_at is null
       and date = v_now::date
  loop
    v_start := (s.date + coalesce(s.start_time, '19:00'::time))::timestamp;
    -- 시작 50~70분 전 윈도우(매 10분 크론과 맞물려 정확히 1회)
    if v_start - v_now between interval '50 minutes' and interval '70 minutes' then
      insert into public.notifications(user_id, type, title, message, avatar_text, avatar_color, link)
      select r.user_id, 'reminder',
             '⏰ 1시간 후 시작!',
             format('%s — %s %s 시작. 좋은 자리 잡으세요!', s.title, coalesce(s.pub_name, '매장'), to_char(v_start, 'HH24:MI')),
             '⏰', '#FFD100', '/schedules/' || s.id
        from public.schedule_reservations r
       where r.schedule_id = s.id and r.user_id is not null;
      update public.schedules set reminder_sent_at = now() where id = s.id;
      get diagnostics v_sent = row_count;
    end if;
  end loop;
end $function$;

-- ── ② 승인 트리거에서 팔로워 블록 제거 — notify_followers_on_poster 와 2중 발송이었다 ──
create or replace function public.notify_on_schedule_approved()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.approved = true and (old.approved is distinct from true) then
    if new.owner_id is not null then
      insert into public.notifications (user_id, type, title, message, avatar_color, read)
      values (new.owner_id, 'approval', '포스터 승인 완료',
              coalesce(new.title, '') || ' 포스터가 승인되어 메인에 게시되었습니다.', '#FFD100', false);
    end if;
    -- 팔로워 알림은 notify_followers_on_poster(INSERT 자동승인 경로까지 커버, 매장명·날짜 포함)로 단일화
  end if;
  return new;
end; $function$;

-- ── 팔로워 알림 단일본 — 막다른 link '/' → 해당 포스터로 ─────────────────────
create or replace function public.notify_followers_on_poster()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.venue_id is not null
     and ((tg_op = 'INSERT' and new.approved) or (tg_op = 'UPDATE' and new.approved and coalesce(old.approved, false) = false)) then
    insert into public.notifications (user_id, type, title, message, link, read)
    select vf.user_id, 'system', '팔로우 매장 새 포스터',
      coalesce((select name from public.venues where id = new.venue_id), '매장') || ' — ' || new.title || ' (' || new.date || ')',
      '/schedules/' || new.id, false
    from public.venue_follows vf
    where vf.venue_id = new.venue_id
      and vf.user_id <> coalesce(new.owner_id, '00000000-0000-0000-0000-000000000000');
  end if;
  return new;
end $function$;

-- ── ③ 댓글 알림 — 커뮤니티 게시글 분기 신설 + 전 분기 link ───────────────────
create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_owner uuid; v_title text; v_link text;
begin
  if new.schedule_id is not null then
    select owner_id into v_owner from public.schedules where id = new.schedule_id;
    v_title := '내 포스터에 새 문의가 등록되었습니다';
    v_link := '/schedules/' || new.schedule_id;
  elsif new.venue_id is not null then
    select owner_id into v_owner from public.venues where id = new.venue_id;
    v_title := '내 매장 커뮤니티에 새 댓글이 등록되었습니다';
    v_link := '/community/' || new.venue_id;
  elsif new.post_id is not null then
    -- 게시판 글 댓글 → 글쓴이에게. 참여 루프의 반환 구간(그동안 미배선이었다)
    select user_id into v_owner from public.community_posts where id = new.post_id;
    v_title := '💬 내 글에 댓글이 달렸어요';
    v_link := '/posts/' || new.post_id;
  else
    return new;
  end if;
  if v_owner is null or v_owner = new.user_id then return new; end if;
  insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link, read)
  values (v_owner, 'comment', v_title, left(coalesce(new.content, ''), 80),
          left(coalesce(new.user_name, '?'), 1), '#5A6175', v_link, false);
  return new;
end; $function$;

-- ── ④ 좋아요 알림 — 탭하면 그 글로 ──────────────────────────────────────────
create or replace function public.notify_on_post_like()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_author uuid; v_liker text;
begin
  select user_id into v_author from public.community_posts where id = new.post_id;
  if v_author is null or v_author = new.user_id then return new; end if; -- 본인 좋아요 제외
  select coalesce(nullif(btrim(nickname), ''), name) into v_liker from public.profiles where id = new.user_id;
  insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link, read)
  values (v_author, 'system', '❤️ 내 글에 좋아요가 달렸어요',
          coalesce(v_liker, '회원') || '님이 회원님의 글을 좋아합니다', '❤️', '#FF4D6D', '/posts/' || new.post_id, false);
  return new;
end; $function$;

-- ── ⑤ 시즌 보상 알림 — 막다른 '/' → 해당 매장 페이지(시즌 랭킹이 있는 곳) ────
create or replace function public._end_season_internal(p_season_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_venue uuid; r record; n int := 0; pts int;
begin
  select venue_id into v_venue from public.venue_seasons where id=p_season_id and status='active';
  if v_venue is null then return 0; end if;
  insert into public.venue_season_results (season_id, rank, nickname, real_name, points, prize_man, appearances, best_position)
    select p_season_id, rank, nickname, real_name, points, prize_man, appearances, best_position
    from public.current_season_standings(v_venue);
  get diagnostics n = row_count;
  for r in select rank, nickname from public.venue_season_results where season_id=p_season_id and rank<=3 loop
    pts := case r.rank when 1 then 1000 when 2 then 500 else 300 end;
    update public.profiles set activity_points = coalesce(activity_points,0) + pts where lower(nickname)=lower(r.nickname);
    insert into public.notifications (user_id, type, title, message, link)
      select id, 'system', '🏆 시즌 보상', '시즌 '||r.rank||'위 달성! 활동점수 +'||pts||'점', '/community/'||v_venue
      from public.profiles where lower(nickname)=lower(r.nickname);
  end loop;
  update public.venue_seasons set status='ended', ended_at=now() where id=p_season_id;
  return n;
end $function$;

-- ── ⑥ 이용권 발급 알림 — 보상 획득 순간이 완전 무음이었다. 수령자 지정 시 알림
--     (notifications INSERT → push_on_notification 트리거가 웹푸시까지 자동 발사).
--     알림 실패가 발급 자체를 굴리지 않도록 예외 무시.
create or replace function public.issue_voucher(
  p_venue_id uuid, p_title text, p_count integer default 1,
  p_holder_name text default null, p_holder_user_id uuid default null, p_note text default null,
  p_expires_at timestamptz default null
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_count int; v_title text; v_holder text; v_quota int; v_vname text;
begin
  if not can_manage_pos(p_venue_id) then raise exception '권한이 없습니다 — 매장이용권 발행은 업주만 가능합니다'; end if;
  if my_role() <> 'admin' and not coalesce((select voucher_issue_approved from public.venues where id = p_venue_id), false) then
    raise exception '운영자 승인 후 매장이용권을 발급할 수 있습니다';
  end if;
  if p_holder_user_id is not null and not exists (
    select 1 from public.profiles where id = p_holder_user_id and real_name is not null and btrim(real_name) <> ''
  ) then
    raise exception '본인인증을 완료한 회원에게만 매장이용권을 지급할 수 있습니다';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception '만료일은 미래 시각이어야 합니다';
  end if;
  v_count := least(greatest(coalesce(p_count, 1), 1), 1000);
  if my_role() <> 'admin' then
    select voucher_quota into v_quota from public.venues where id = p_venue_id for update;
    if coalesce(v_quota, 0) < v_count then
      raise exception '발급 한도가 부족합니다 (잔여 %개) — 충전 요청을 남겨 주세요', coalesce(v_quota, 0);
    end if;
    update public.venues set voucher_quota = voucher_quota - v_count where id = p_venue_id;
  end if;
  v_title := coalesce(nullif(btrim(p_title), ''), '매장이용권');
  v_holder := nullif(btrim(coalesce(p_holder_name, '')), '');
  insert into public.store_vouchers(venue_id, issued_by, holder_user_id, holder_name, title, note, expires_at)
  select p_venue_id, auth.uid(), p_holder_user_id, v_holder, v_title, nullif(btrim(coalesce(p_note, '')), ''), p_expires_at
  from generate_series(1, v_count);
  if p_holder_user_id is not null then
    begin
      select name into v_vname from public.venues where id = p_venue_id;
      insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link)
      values (p_holder_user_id, 'system', '🎟 매장이용권 도착!',
              format('%s에서 ''%s'' %s장을 보냈어요. 지갑에서 확인하세요%s',
                     coalesce(v_vname, '매장'), v_title, v_count,
                     case when p_expires_at is not null
                          then format(' (유효기간 ~%s)', to_char(p_expires_at at time zone 'Asia/Seoul', 'MM/DD'))
                          else '' end),
              '🎟', '#FFD100', '/wallet');
    exception when others then null;
    end;
  end if;
  return v_count;
end $function$;

-- ── ⑥b 적립 이용권도 동일 — 회원 매칭 시 알림 ────────────────────────────────
create or replace function public.accrue_voucher(p_venue_id uuid, p_player_name text, p_count integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_count int; v_uid uuid; v_name text; v_quota int; v_vname text;
begin
  if not can_access_ledger(p_venue_id) then raise exception '권한이 없습니다'; end if;
  if not coalesce((select voucher_issue_approved from public.venues where id = p_venue_id), false) then
    raise exception '운영자 승인 후 적립할 수 있습니다';
  end if;
  v_name := btrim(coalesce(p_player_name, ''));
  if v_name = '' then return 0; end if;
  v_count := least(greatest(coalesce(p_count, 1), 1), 1000);
  -- 발급 한도 차감: 적립도 발급이다. admin 은 issue_voucher 와 동일하게 예외.
  if my_role() <> 'admin' then
    select voucher_quota into v_quota from public.venues where id = p_venue_id for update;
    if coalesce(v_quota, 0) < v_count then
      raise exception '발급 한도가 부족해 적립하지 못했습니다 (잔여 %개 · 필요 %개) — 이용권 관리에서 충전을 요청해 주세요', coalesce(v_quota, 0), v_count;
    end if;
    update public.venues set voucher_quota = voucher_quota - v_count where id = p_venue_id;
  end if;
  select p.id into v_uid from public.profiles p
   where coalesce(p.status::text, 'active') = 'active'
     and (lower(btrim(p.nickname)) = lower(v_name) or btrim(p.real_name) = v_name or btrim(p.name) = v_name)
   order by (lower(btrim(p.nickname)) = lower(v_name)) desc
   limit 1;
  insert into public.store_vouchers(venue_id, issued_by, holder_user_id, holder_name, title)
  select p_venue_id, auth.uid(), v_uid, v_name, '적립 이용권'
  from generate_series(1, v_count);
  if v_uid is not null then
    begin
      select name into v_vname from public.venues where id = p_venue_id;
      insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link)
      values (v_uid, 'system', '🎟 적립 이용권 도착!',
              format('%s 방문 적립으로 이용권 %s장을 받았어요. 지갑에서 확인하세요', coalesce(v_vname, '매장'), v_count),
              '🎟', '#FFD100', '/wallet');
    exception when others then null;
    end;
  end if;
  return v_count;
end $function$;
