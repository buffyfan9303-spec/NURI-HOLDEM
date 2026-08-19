-- 감사 #1: 제재(banned/suspended/withdrawn)가 서버에서 강제되지 않아 밴 유저가 유효 JWT 로 콘텐츠를
-- 계속 생성할 수 있었다(클라 게이트만 존재). 콘텐츠 생성 경로에 서버 status 게이트를 추가.
create or replace function public.is_account_active()
 returns boolean language sql stable security definer set search_path to 'public'
as $fn$
  select coalesce((
    select status = 'active' and (suspended_until is null or suspended_until < now())
    from public.profiles where id = auth.uid()
  ), false);
$fn$;

create or replace function public.require_active_author()
 returns trigger language plpgsql security definer set search_path to 'public'
as $fn$
begin
  if current_user in ('authenticated','anon') and not public.is_account_active() then
    raise exception '제재 중이거나 비활성화된 계정은 작성할 수 없습니다';
  end if;
  return new;
end $fn$;

drop trigger if exists trg_require_active_post on public.community_posts;
create trigger trg_require_active_post before insert on public.community_posts
  for each row execute function public.require_active_author();
drop trigger if exists trg_require_active_review on public.venue_reviews;
create trigger trg_require_active_review before insert on public.venue_reviews
  for each row execute function public.require_active_author();
drop trigger if exists trg_require_active_listing on public.marketplace_listings;
create trigger trg_require_active_listing before insert on public.marketplace_listings
  for each row execute function public.require_active_author();
