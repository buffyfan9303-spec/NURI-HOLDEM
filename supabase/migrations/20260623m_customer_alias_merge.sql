-- 2026-06-23 장부 이름 ↔ 회원 수동 매핑(alias) — check_in 동명 자동 claim 이 못 잡는 '다른 이름' 손님 통합.
create table if not exists public.customer_aliases (
  venue_id uuid not null references public.venues(id) on delete cascade,
  alias text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (venue_id, alias)
);
alter table public.customer_aliases enable row level security;
drop policy if exists customer_aliases_pos on public.customer_aliases;
create policy customer_aliases_pos on public.customer_aliases for all
  using (public.can_manage_pos(venue_id)) with check (public.can_manage_pos(venue_id));

-- 연결: alias→회원 매핑 기록 + 회원 customer_profiles 확보 + 동명 미연결 orphan(방문수) 병합.
create or replace function public.link_customer_alias(p_venue_id uuid, p_alias text, p_user_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_alias text := btrim(coalesce(p_alias,'')); v_disp text;
begin
  if not public.can_manage_pos(p_venue_id) then raise exception '권한이 없습니다'; end if;
  if v_alias = '' or p_user_id is null then raise exception '연결 대상을 지정하세요'; end if;
  insert into public.customer_aliases(venue_id, alias, user_id) values (p_venue_id, v_alias, p_user_id)
    on conflict (venue_id, alias) do update set user_id = excluded.user_id, created_at = now();
  select coalesce(nullif(btrim(nickname),''), name) into v_disp from public.profiles where id = p_user_id;
  insert into public.customer_profiles(venue_id, user_id, name, visit_count)
    values (p_venue_id, p_user_id, coalesce(v_disp, v_alias), 0)
    on conflict (venue_id, user_id) where user_id is not null do nothing;
  update public.customer_profiles t set
    visit_count = coalesce(t.visit_count,0) + coalesce((select sum(visit_count) from public.customer_profiles o where o.venue_id=p_venue_id and o.user_id is null and lower(btrim(o.name))=lower(v_alias)),0),
    first_visit_at = least(t.first_visit_at, (select min(first_visit_at) from public.customer_profiles o where o.venue_id=p_venue_id and o.user_id is null and lower(btrim(o.name))=lower(v_alias))),
    last_visit_at = greatest(t.last_visit_at, (select max(last_visit_at) from public.customer_profiles o where o.venue_id=p_venue_id and o.user_id is null and lower(btrim(o.name))=lower(v_alias))),
    updated_at = now()
   where t.venue_id = p_venue_id and t.user_id = p_user_id;
  delete from public.customer_profiles where venue_id = p_venue_id and user_id is null and lower(btrim(name)) = lower(v_alias);
end $$;
revoke all on function public.link_customer_alias(uuid, text, uuid) from public;
grant execute on function public.link_customer_alias(uuid, text, uuid) to authenticated;

create or replace function public.unlink_customer_alias(p_venue_id uuid, p_alias text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.can_manage_pos(p_venue_id) then raise exception '권한이 없습니다'; end if;
  delete from public.customer_aliases where venue_id = p_venue_id and alias = btrim(coalesce(p_alias,''));
end $$;
revoke all on function public.unlink_customer_alias(uuid, text) from public;
grant execute on function public.unlink_customer_alias(uuid, text) to authenticated;
