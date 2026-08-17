-- 시즌 마감 임박 알림(D-3·D-1) — 시즌리그가 '가야만 보이는' 위치라 마감 전 리텐션 트리거가 없었다.
-- 상위 10위 등재자에게 현재 순위 포함 알림(+push_on_notification 경유 웹푸시 자동), 매장 페이지 링크.
-- 시즌별 1회 멱등 가드(d3/d1_notified_at). 크론 10:00 KST(자정 정산 크론과 분리, 열람 좋은 시간대).
-- (라이브 적용: season_deadline_notify)
alter table public.venue_seasons add column if not exists d3_notified_at timestamptz;
alter table public.venue_seasons add column if not exists d1_notified_at timestamptz;

create or replace function public.notify_season_deadline()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare se record; r record; v_name text; v_days int; v_today date;
begin
  v_today := (now() at time zone 'Asia/Seoul')::date;
  for se in select * from public.venue_seasons where status = 'active' loop
    v_days := se.ends_on - v_today;
    if not ((v_days = 3 and se.d3_notified_at is null) or (v_days = 1 and se.d1_notified_at is null)) then
      continue;
    end if;
    select name into v_name from public.venues where id = se.venue_id;
    for r in select rank, nickname from public.current_season_standings(se.venue_id) where rank <= 10 loop
      insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link)
      select p.id, 'system',
             case when v_days = 1 then '⏳ 시즌 마감 내일!' else '⏳ 시즌 마감 D-3' end,
             format('%s — %s 현재 %s위 · %s 마감. 순위를 지키러 오세요!',
                    coalesce(se.name, '시즌'), coalesce(v_name, '매장'), r.rank, to_char(se.ends_on, 'MM/DD')),
             '⏳', '#FFD100', '/community/' || se.venue_id
      from public.profiles p
      where lower(btrim(p.nickname)) = lower(btrim(r.nickname))
        and coalesce(p.status::text, 'active') = 'active';
    end loop;
    if v_days = 3 then update public.venue_seasons set d3_notified_at = now() where id = se.id;
    else update public.venue_seasons set d1_notified_at = now() where id = se.id;
    end if;
  end loop;
end $function$;
revoke all on function public.notify_season_deadline() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('season-deadline-notify');
exception when others then null; end $$;
select cron.schedule('season-deadline-notify', '0 1 * * *', $$select public.notify_season_deadline()$$);
