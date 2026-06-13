-- 순위입력 장부(이벤트)별 분리 — 같은 날 메인 1 + 사이드 4 동시 운영 대응.
-- ⚠ 적용 방법: Supabase 대시보드 → SQL Editor에 이 파일 전체를 붙여넣고 Run.
-- (적용 전까지 앱은 기존 단일 저장으로 자동 폴백 — 이벤트 선택 저장만 비활성)
alter table public.venue_rankings add column if not exists event_name text not null default '';
alter table public.ranking_point_awards add column if not exists event_name text not null default '';
alter table public.ranking_point_awards drop constraint if exists ranking_point_awards_pkey;
alter table public.ranking_point_awards add constraint ranking_point_awards_pkey primary key (venue_id, ranking_date, event_name, user_id);

drop function if exists public.save_venue_rankings(uuid, date, jsonb);
create function public.save_venue_rankings(p_venue_id uuid, p_date date, p_entries jsonb, p_event text default '')
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare e jsonb; i int := 0; v_uid uuid; v_pts int; v_ev text := left(coalesce(trim(p_event), ''), 40);
begin
  if not public.can_manage_venue(p_venue_id) then raise exception '순위를 입력할 권한이 없습니다'; end if;

  -- 0) 이전 지급 포인트 되돌리기(같은 날짜·같은 이벤트만 — 재저장 중복 방지)
  update public.profiles p set activity_points = greatest(0, coalesce(p.activity_points,0) - a.points)
    from public.ranking_point_awards a
    where a.venue_id = p_venue_id and a.ranking_date = p_date and a.event_name = v_ev and a.user_id = p.id;
  delete from public.ranking_point_awards where venue_id = p_venue_id and ranking_date = p_date and event_name = v_ev;

  -- 1) 순위 재작성(이벤트 단위)
  delete from public.venue_rankings where venue_id = p_venue_id and ranking_date = p_date and event_name = v_ev;
  for e in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    if coalesce(trim(e->>'nickname'), '') = '' then continue; end if;
    i := i + 1;
    insert into public.venue_rankings (venue_id, ranking_date, event_name, position, nickname, real_name, prize, created_by)
    values (p_venue_id, p_date, v_ev, i,
            left(trim(coalesce(e->>'nickname', '')), 30),
            nullif(left(trim(coalesce(e->>'realName', '')), 20), ''),
            nullif(left(trim(coalesce(e->>'prize', '')), 40), ''),
            auth.uid());

    -- 2) 닉네임 정확 일치 회원에게 순위별 차등 포인트
    select id into v_uid from public.profiles where lower(trim(nickname)) = lower(trim(e->>'nickname')) limit 1;
    if v_uid is not null then
      v_pts := case i when 1 then 10 when 2 then 7 when 3 then 5 when 4 then 3 when 5 then 2 else 1 end;
      insert into public.ranking_point_awards(venue_id, ranking_date, event_name, user_id, points)
        values (p_venue_id, p_date, v_ev, v_uid, v_pts)
        on conflict (venue_id, ranking_date, event_name, user_id) do update set points = ranking_point_awards.points + excluded.points;
      update public.profiles set activity_points = coalesce(activity_points,0) + v_pts where id = v_uid;
    end if;
  end loop;
end;
$function$;
