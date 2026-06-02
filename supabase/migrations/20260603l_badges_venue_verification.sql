-- ============================================================================
-- Phase 1: 활동 점수/뱃지 + 매장 인증 등급제 + 포스터 자동 승인
-- ============================================================================

-- 1) profiles: 활동 점수 + 뱃지 배열
alter table public.profiles
  add column if not exists activity_points int  not null default 0,
  add column if not exists badges         text[] not null default '{}';

-- 2) venues: 인증 상태 enum + 컬럼
do $$ begin
  if not exists (select 1 from pg_type where typname = 'venue_verification_status') then
    create type public.venue_verification_status as enum ('unverified', 'pending', 'verified');
  end if;
end $$;
alter table public.venues
  add column if not exists verification_status public.venue_verification_status not null default 'unverified';

-- 3) 포스터(schedules) 자동 승인: 인증(verified) 매장 업주 업로드 -> approved=true, 아니면 false(대기)
create or replace function public.auto_approve_verified_poster()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status public.venue_verification_status;
begin
  if public.my_role() = 'admin' then
    return new;
  end if;
  if new.owner_id is not null then
    select v.verification_status into v_status
    from public.venues v
    where v.owner_id = new.owner_id
    limit 1;
    if v_status = 'verified' then
      new.approved := true;
    else
      new.approved := false; -- 비인증/대기 업주는 무조건 대기(자기승인 방지)
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_auto_approve_poster on public.schedules;
create trigger trg_auto_approve_poster
  before insert on public.schedules
  for each row execute function public.auto_approve_verified_poster();

-- 4) 인증 상태 변경 보호: verified 승급은 관리자만, 업주는 본인 매장 pending 신청만
create or replace function public.guard_venue_verification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.verification_status is distinct from old.verification_status then
    if public.my_role() = 'admin' then
      return new;
    elsif new.verification_status = 'pending'
          and old.verification_status = 'unverified'
          and old.owner_id = auth.uid() then
      return new;
    else
      raise exception '매장 인증 상태는 관리자만 변경할 수 있습니다';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_guard_venue_verification on public.venues;
create trigger trg_guard_venue_verification
  before update on public.venues
  for each row execute function public.guard_venue_verification();

revoke execute on function public.auto_approve_verified_poster() from anon, authenticated, public;
revoke execute on function public.guard_venue_verification()   from anon, authenticated, public;
