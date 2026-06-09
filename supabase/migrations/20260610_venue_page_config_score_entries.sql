-- 매장 페이지 구성(업주 설정): 탭 순서 · 순위 탭 메트릭(최대2)/1~3등 칭호 · 등수→점수 매핑 · 알림 설정
alter table public.venues add column if not exists page_config jsonb;

-- 임의 포인트(스코어) 항목 — 업주/장부권한이 수동 지급/차감, 매장 공개 보드에 합산(금전 정보 없음)
create table if not exists public.venue_score_entries (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  points integer not null,
  reason text,
  entry_date date not null default ((now() at time zone 'Asia/Seoul'))::date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_vse_venue on public.venue_score_entries(venue_id, entry_date desc);
alter table public.venue_score_entries enable row level security;

drop policy if exists vse_select on public.venue_score_entries;
create policy vse_select on public.venue_score_entries for select using (true);
drop policy if exists vse_insert on public.venue_score_entries;
create policy vse_insert on public.venue_score_entries for insert with check (public.can_access_ledger(venue_id));
drop policy if exists vse_delete on public.venue_score_entries;
create policy vse_delete on public.venue_score_entries for delete using (public.can_access_ledger(venue_id));

-- 업주(또는 운영자)만 page_config 갱신
create or replace function public.set_venue_page_config(p_venue_id uuid, p_config jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_pos(p_venue_id) then
    raise exception '권한이 없습니다';
  end if;
  update public.venues set page_config = p_config, updated_at = now() where id = p_venue_id;
end $$;
revoke execute on function public.set_venue_page_config(uuid, jsonb) from public;
grant execute on function public.set_venue_page_config(uuid, jsonb) to authenticated;

-- 머니인 비율(공개 보드)용: 이름별 바이인 횟수만 집계(금액·개인정보 없음)
create or replace function public.venue_buyin_counts(p_venue_id uuid)
returns table(name text, buyin_count bigint)
language sql security definer set search_path = public stable as $$
  select b.player_name as name, count(*)::bigint as buyin_count
  from public.ledger_buyins b
  where b.venue_id = p_venue_id
  group by b.player_name
$$;
revoke execute on function public.venue_buyin_counts(uuid) from public;
grant execute on function public.venue_buyin_counts(uuid) to anon, authenticated;

-- ── 매장 알림 수신 거부(개인별) ─────────────────────────────────────────────
alter table public.profiles add column if not exists mute_venue_notify boolean not null default false;

create or replace function public.notify_venue_staff(p_venue_id uuid, p_title text, p_message text, p_link text default null::text)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare n integer;
begin
  if not (public.can_manage_pos(p_venue_id) or exists (select 1 from public.venues where id = p_venue_id and owner_id = auth.uid())) then
    raise exception 'permission denied';
  end if;
  insert into public.notifications (user_id, type, title, message, link, read)
  select pr.id, 'system', p_title, p_message, p_link, false
  from public.profiles pr
  where pr.venue_id = p_venue_id
    and coalesce(pr.mute_venue_notify, false) = false; -- 수신 거부자 제외
  get diagnostics n = row_count;
  return n;
end; $function$;

-- 본인 알림 수신 설정 토글(자기 프로필만)
create or replace function public.set_my_venue_notify(p_mute boolean)
returns void language sql security definer set search_path = public as $$
  update public.profiles set mute_venue_notify = p_mute where id = auth.uid();
$$;
revoke execute on function public.set_my_venue_notify(boolean) from public;
grant execute on function public.set_my_venue_notify(boolean) to authenticated;
