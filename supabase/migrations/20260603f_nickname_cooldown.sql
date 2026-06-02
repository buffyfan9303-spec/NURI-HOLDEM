-- ============================================================================
-- 닉네임(name) 30일 변경 제한 (관리자 제외)
-- ============================================================================
alter table public.profiles add column if not exists name_changed_at timestamptz;

create or replace function public.enforce_nickname_cooldown()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    if old.role <> 'admin'
       and old.name_changed_at is not null
       and now() - old.name_changed_at < interval '30 days' then
      raise exception '닉네임은 30일에 한 번만 변경할 수 있습니다 (다음 변경 가능일: %)',
        to_char((old.name_changed_at + interval '30 days') at time zone 'Asia/Seoul', 'YYYY-MM-DD');
    end if;
    new.name_changed_at := now();
  end if;
  return new;
end; $$;

revoke execute on function public.enforce_nickname_cooldown() from anon, authenticated, public;

drop trigger if exists trg_enforce_nickname_cooldown on public.profiles;
create trigger trg_enforce_nickname_cooldown
  before update on public.profiles
  for each row execute function public.enforce_nickname_cooldown();
