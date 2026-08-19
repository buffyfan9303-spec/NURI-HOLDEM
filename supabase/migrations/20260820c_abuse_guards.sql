-- 감사 #16/#15/#12/#2: 블랙유저 악용 서버 차단.
-- 패턴은 기존 guard_venue_verification 과 동일(current_user authenticated/anon + non-admin 이면 보호 컬럼 강제).

-- #16: 포스터 유료 배치(프리미엄·노출순서) 셀프 부여 차단
create or replace function public.guard_schedule_boost() returns trigger
language plpgsql set search_path to 'public','pg_temp' as $fn$
begin
  if current_user in ('authenticated','anon') and coalesce(public.my_role()::text,'') <> 'admin' then
    if tg_op = 'INSERT' then
      new.is_premium := false; new.premium_until := null; new.display_order := 0;
    else
      if new.is_premium is distinct from old.is_premium
         or new.premium_until is distinct from old.premium_until
         or new.display_order is distinct from old.display_order then
        raise exception '유료 배치(프리미엄·노출순서)는 운영자만 설정할 수 있습니다';
      end if;
    end if;
  end if;
  return new;
end $fn$;
drop trigger if exists trg_guard_schedule_boost on public.schedules;
create trigger trg_guard_schedule_boost before insert or update on public.schedules
  for each row execute function public.guard_schedule_boost();

-- #15: 마켓 판매자 인증뱃지·이름·거래횟수 위조 차단(서버 강제)
create or replace function public.guard_listing_seller() returns trigger
language plpgsql set search_path to 'public','pg_temp' as $fn$
declare v_ci_ok boolean; v_nick text;
begin
  if current_user in ('authenticated','anon') then
    select (ci is not null), nickname into v_ci_ok, v_nick from public.profiles where id = auth.uid();
    new.seller_id := auth.uid();
    new.seller_verified := coalesce(v_ci_ok, false);
    new.seller_name := coalesce(v_nick, new.seller_name);
    new.seller_trade_count := coalesce(
      (select count(*) from public.marketplace_listings where seller_id = auth.uid() and status = 'sold'), 0);
  end if;
  return new;
end $fn$;
drop trigger if exists trg_guard_listing_seller on public.marketplace_listings;
create trigger trg_guard_listing_seller before insert or update on public.marketplace_listings
  for each row execute function public.guard_listing_seller();

-- #12: 커뮤니티 글 활동점수(+3) 무한 파밍 차단(삭제 우회 불가 일일 상한 +30)
alter table public.profiles add column if not exists post_points_date date;
alter table public.profiles add column if not exists post_points_today int not null default 0;
create or replace function public.award_post_points() returns trigger
language plpgsql security definer set search_path to 'public' as $fn$
declare v_date date; v_today int; v_kst date := (now() at time zone 'Asia/Seoul')::date;
begin
  if new.user_id is not null then
    select post_points_date, post_points_today into v_date, v_today from public.profiles where id = new.user_id;
    if v_date is distinct from v_kst then v_today := 0; end if;
    if coalesce(v_today,0) < 30 then
      update public.profiles set activity_points=coalesce(activity_points,0)+3,
        post_points_today=coalesce(v_today,0)+3, post_points_date=v_kst where id = new.user_id;
    else
      update public.profiles set post_points_date=v_kst where id = new.user_id;
    end if;
  end if;
  return new;
end $fn$;

-- #2: 탈퇴 후 재가입/재인증 밴 회피·파밍 차단(텀스톤 + 제재중 self-withdraw 금지)
create table if not exists public.withdrawn_identities (
  ci_hash text primary key, reason text not null, created_at timestamptz not null default now());
alter table public.withdrawn_identities enable row level security;
create or replace function public.withdraw_my_account() returns void
language plpgsql security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid(); v_suffix text; v_status text; v_ci text;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  select status, ci into v_status, v_ci from public.profiles where id = v_uid;
  if v_status in ('banned','suspended') then
    raise exception '제재 중인 계정은 탈퇴할 수 없습니다. 고객센터로 문의해 주세요';
  end if;
  if exists (select 1 from public.venues where owner_id = v_uid) then
    raise exception '매장 대표는 매장을 먼저 정리(삭제 또는 대표 양도)한 뒤 탈퇴할 수 있습니다';
  end if;
  if v_ci is not null then
    insert into public.withdrawn_identities(ci_hash, reason) values (md5(v_ci), 'withdrawn')
    on conflict (ci_hash) do update set reason='withdrawn', created_at=now();
  end if;
  v_suffix := substr(replace(v_uid::text, '-', ''), 1, 12);
  update public.profiles set
    status='withdrawn', nickname='탈퇴회원_'||v_suffix, email='withdrawn_'||v_suffix||'@deleted.invalid',
    real_name=null, phone=null, ci=null, verified_at=null, birth_date=null, gender=null, carrier=null,
    venue_id=null, sanction_reason='본인 탈퇴'
  where id = v_uid;
  delete from public.venue_staff where user_id = v_uid;
  delete from public.venue_owners where user_id = v_uid;
end $fn$;
