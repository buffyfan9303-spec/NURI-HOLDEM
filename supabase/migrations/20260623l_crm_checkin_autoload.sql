-- 2026-06-23 CRM 토대: customer_profiles 에 user_id(신원 연결) + 방문 집계 컬럼.
alter table public.customer_profiles add column if not exists user_id uuid references public.profiles(id) on delete set null;
alter table public.customer_profiles add column if not exists visit_count int not null default 0;
alter table public.customer_profiles add column if not exists last_visit_at timestamptz;
alter table public.customer_profiles add column if not exists first_visit_at timestamptz;
create unique index if not exists customer_profiles_venue_user_idx on public.customer_profiles(venue_id, user_id) where user_id is not null;

-- check_in: 기존 로직 보존 + CRM 자동 적재. (1)user_id row 갱신 →없으면 (2)동명 미연결 row 에 user_id 연결(claim)
--   →없으면 (3)신규 생성. 같은 손님의 장부명/체크인 회원을 점진 통합(완전 alias 병합은 후속 작업).
create or replace function public.check_in(p_venue_id uuid)
returns text language plpgsql security definer set search_path to 'public' as $function$
declare
  v_name text; v_disp text; v_recent timestamptz; v_today_cnt int;
  v_today date; v_last date; v_streak int;
begin
  if auth.uid() is null then raise exception '로그인 후 체크인할 수 있습니다'; end if;
  select name into v_name from public.venues where id = p_venue_id;
  if v_name is null then raise exception '매장을 찾을 수 없습니다'; end if;
  select created_at into v_recent from public.checkins where venue_id = p_venue_id and user_id = auth.uid() order by created_at desc limit 1;
  if v_recent is not null and v_recent > now() - interval '4 hours' then
    raise exception '이미 체크인했습니다 (4시간 내 중복 방지)';
  end if;
  v_today := (now() at time zone 'Asia/Seoul')::date;
  select count(*) into v_today_cnt from public.checkins
   where venue_id = p_venue_id and user_id = auth.uid()
     and created_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  select coalesce(nickname, name) into v_disp from public.profiles where id = auth.uid();
  insert into public.checkins(venue_id, user_id, display_name) values (p_venue_id, auth.uid(), v_disp);
  if v_today_cnt = 0 then
    update public.profiles set activity_points = coalesce(activity_points, 0) + 3 where id = auth.uid();
  end if;
  select last_checkin_date, checkin_streak into v_last, v_streak from public.profiles where id = auth.uid();
  if v_last is distinct from v_today then
    if v_last = v_today - 1 then v_streak := coalesce(v_streak, 0) + 1; else v_streak := 1; end if;
    update public.profiles
       set checkin_streak = v_streak,
           last_checkin_date = v_today,
           activity_points = coalesce(activity_points, 0) + (case when v_streak % 7 = 0 then 10 else 0 end)
     where id = auth.uid();
  end if;
  -- ── CRM 자동 적재 ──────────────────────────────────────────
  update public.customer_profiles
     set visit_count = coalesce(visit_count,0) + 1, last_visit_at = now(),
         name = coalesce(nullif(btrim(name),''), v_disp), updated_at = now()
   where venue_id = p_venue_id and user_id = auth.uid();
  if not found then
    update public.customer_profiles
       set user_id = auth.uid(), visit_count = coalesce(visit_count,0) + 1, last_visit_at = now(), updated_at = now()
     where venue_id = p_venue_id and user_id is null and lower(btrim(name)) = lower(btrim(v_disp));
    if not found then
      insert into public.customer_profiles(venue_id, user_id, name, visit_count, first_visit_at, last_visit_at)
      values (p_venue_id, auth.uid(), v_disp, 1, now(), now())
      on conflict (venue_id, name) do update
        set user_id = coalesce(public.customer_profiles.user_id, excluded.user_id),
            visit_count = coalesce(public.customer_profiles.visit_count,0) + 1,
            last_visit_at = now(), updated_at = now();
    end if;
  end if;
  return v_name;
end $function$;
