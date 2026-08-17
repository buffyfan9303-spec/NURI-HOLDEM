-- 주간 다이제스트(다이제스트 채널 1단계): 팔로우한 매장의 향후 7일 대회 요약을 주 1회 알림.
-- 팔로우는 명시적 옵트인이라 스팸이 아니고, notifications INSERT → push_on_notification 이
-- 푸시 구독자에겐 웹푸시까지 자동 발사. 대회 0개면 발송 자체가 없다(빈 다이제스트 금지).
-- 크론: 금 10:00 KST — 주말 대회를 계획하는 시점. (라이브 적용: weekly_follow_digest)
create or replace function public.send_weekly_follow_digest()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link)
  select f.user_id, 'system',
         format('📅 이번 주 팔로우 매장 대회 %s개', f.n),
         format('%s%s — 오늘부터 7일 안에 %s개 대회가 열려요. 일정에서 확인하고 미리 예약하세요!',
                f.vname, case when f.vn > 1 then format(' 외 %s곳', f.vn - 1) else '' end, f.n),
         '📅', '#FFD100', '/'
  from (
    select vf.user_id, count(*) as n, count(distinct s.venue_id) as vn, min(v.name) as vname
    from public.venue_follows vf
    join public.schedules s on s.venue_id = vf.venue_id
     and s.approved = true
     and s.date >= (now() at time zone 'Asia/Seoul')::date
     and s.date <  (now() at time zone 'Asia/Seoul')::date + 7
    join public.venues v on v.id = s.venue_id
    group by vf.user_id
  ) f
  join public.profiles p on p.id = f.user_id and coalesce(p.status::text, 'active') = 'active';
end $function$;
revoke all on function public.send_weekly_follow_digest() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('weekly-follow-digest');
exception when others then null; end $$;
select cron.schedule('weekly-follow-digest', '0 1 * * 5', $$select public.send_weekly_follow_digest()$$);
