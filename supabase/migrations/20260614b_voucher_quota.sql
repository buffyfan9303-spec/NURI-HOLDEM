-- 매장이용권 발급 한도(쿼터) — 운영진 승인 충전 + 부족 시 충전(구매) 요청.
-- 기존 승인 매장은 1,000개 초기 충전(라이브 무중단). 모든 접근은 RPC(security definer)로만.
alter table public.venues add column if not exists voucher_quota integer not null default 0;
update public.venues set voucher_quota = 1000 where coalesce(voucher_issue_approved, false) = true and voucher_quota = 0;

create table if not exists public.voucher_credit_requests (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  amount integer not null check (amount > 0 and amount <= 100000),
  note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.voucher_credit_requests enable row level security; -- 정책 없음 = RPC 전용

-- 잔여 한도 조회(업주/장부권한 직원)
create or replace function public.get_voucher_quota(p_venue_id uuid)
returns integer
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce((select voucher_quota from public.venues where id = p_venue_id), 0);
$$;
grant execute on function public.get_voucher_quota(uuid) to authenticated;

-- 충전(구매) 요청 — 업주만
create or replace function public.request_voucher_credit(p_venue_id uuid, p_amount integer, p_note text default null)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if not can_manage_pos(p_venue_id) then raise exception '업주만 충전 요청을 남길 수 있습니다'; end if;
  if coalesce(p_amount, 0) < 1 then raise exception '수량을 입력해 주세요'; end if;
  if exists (select 1 from public.voucher_credit_requests where venue_id = p_venue_id and status = 'pending') then
    raise exception '이미 대기 중인 충전 요청이 있습니다 — 운영자 승인을 기다려 주세요';
  end if;
  insert into public.voucher_credit_requests(venue_id, requested_by, amount, note)
  values (p_venue_id, auth.uid(), least(p_amount, 100000), nullif(btrim(coalesce(p_note,'')), ''));
end $$;
grant execute on function public.request_voucher_credit(uuid, integer, text) to authenticated;

-- 내 매장 요청 내역(최근 10)
create or replace function public.my_voucher_credit_requests(p_venue_id uuid)
returns table(id uuid, amount integer, note text, status text, admin_note text, created_at timestamptz)
language sql stable security definer
set search_path to 'public'
as $$
  select r.id, r.amount, r.note, r.status, r.admin_note, r.created_at
  from public.voucher_credit_requests r
  where r.venue_id = p_venue_id and can_manage_pos(p_venue_id)
  order by r.created_at desc limit 10;
$$;
grant execute on function public.my_voucher_credit_requests(uuid) to authenticated;

-- (운영자) 대기 요청 목록
create or replace function public.admin_list_voucher_credit_requests()
returns table(id uuid, venue_id uuid, venue_name text, amount integer, note text, requester text, created_at timestamptz)
language sql stable security definer
set search_path to 'public'
as $$
  select r.id, r.venue_id, v.name, r.amount, r.note,
         coalesce(p.nickname, p.name, ''), r.created_at
  from public.voucher_credit_requests r
  join public.venues v on v.id = r.venue_id
  left join public.profiles p on p.id = r.requested_by
  where r.status = 'pending' and my_role() = 'admin'
  order by r.created_at asc;
$$;
grant execute on function public.admin_list_voucher_credit_requests() to authenticated;

-- (운영자) 승인/거절 — 승인 시 매장 한도 충전
create or replace function public.admin_decide_voucher_credit(p_request_id uuid, p_approve boolean, p_admin_note text default null)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare r record;
begin
  if my_role() <> 'admin' then raise exception '운영자만 가능합니다'; end if;
  select * into r from public.voucher_credit_requests where id = p_request_id and status = 'pending' for update;
  if not found then raise exception '대기 중인 요청이 아닙니다'; end if;
  update public.voucher_credit_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        admin_note = nullif(btrim(coalesce(p_admin_note,'')), ''), decided_at = now()
    where id = p_request_id;
  if p_approve then
    update public.venues set voucher_quota = coalesce(voucher_quota,0) + r.amount, voucher_issue_approved = true where id = r.venue_id;
  end if;
end $$;
grant execute on function public.admin_decide_voucher_credit(uuid, boolean, text) to authenticated;

-- (운영자) 수동 충전(요청 없이도)
create or replace function public.admin_grant_voucher_quota(p_venue_id uuid, p_amount integer)
returns integer
language plpgsql security definer
set search_path to 'public'
as $$
declare q int;
begin
  if my_role() <> 'admin' then raise exception '운영자만 가능합니다'; end if;
  update public.venues set voucher_quota = greatest(0, coalesce(voucher_quota,0) + coalesce(p_amount,0)), voucher_issue_approved = true
    where id = p_venue_id returning voucher_quota into q;
  return coalesce(q, 0);
end $$;
grant execute on function public.admin_grant_voucher_quota(uuid, integer) to authenticated;

-- 발급 시 한도 차감(운영자는 무제한) — 부족하면 충전 요청 안내 예외
create or replace function public.issue_voucher(p_venue_id uuid, p_title text, p_count integer default 1, p_holder_name text default null::text, p_holder_user_id uuid default null::uuid, p_note text default null::text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_count int; v_title text; v_holder text; v_quota int;
begin
  if not can_manage_pos(p_venue_id) then raise exception '권한이 없습니다 — 매장이용권 발행은 업주만 가능합니다'; end if;
  if my_role() <> 'admin' and not coalesce((select voucher_issue_approved from public.venues where id = p_venue_id), false) then
    raise exception '운영자 승인 후 매장이용권을 발급할 수 있습니다';
  end if;
  if p_holder_user_id is not null and not exists (
    select 1 from public.profiles where id = p_holder_user_id and real_name is not null and btrim(real_name) <> ''
  ) then
    raise exception '본인인증을 완료한 회원에게만 매장이용권을 지급할 수 있습니다';
  end if;
  v_count := least(greatest(coalesce(p_count, 1), 1), 1000);
  -- 발급 한도 차감(운영자 제외) — 행 잠금으로 동시 발급 경합 방지
  if my_role() <> 'admin' then
    select voucher_quota into v_quota from public.venues where id = p_venue_id for update;
    if coalesce(v_quota, 0) < v_count then
      raise exception '발급 한도가 부족합니다 (잔여 %개) — 충전 요청을 남겨 주세요', coalesce(v_quota, 0);
    end if;
    update public.venues set voucher_quota = voucher_quota - v_count where id = p_venue_id;
  end if;
  v_title := coalesce(nullif(btrim(p_title), ''), '매장이용권');
  v_holder := nullif(btrim(coalesce(p_holder_name, '')), '');
  insert into public.store_vouchers(venue_id, issued_by, holder_user_id, holder_name, title, note)
  select p_venue_id, auth.uid(), p_holder_user_id, v_holder, v_title, nullif(btrim(coalesce(p_note, '')), '')
  from generate_series(1, v_count);
  return v_count;
end $function$;
