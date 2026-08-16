-- 보류 3종 스키마 확장(2026-08-17): 이용권 만료일 · 대회 등급 축 · 매장 위경도.
-- 전부 nullable 추가 컬럼 — 기존 행·기존 쿼리에 무영향. (라이브 적용: columns_expiry_grade_geo)

-- ── ① 이용권 유효기간 ────────────────────────────────────────────────────────
alter table public.store_vouchers add column if not exists expires_at timestamptz;

-- ── ② 대회 등급 축 (데일리/새틀라이트/시리즈 — waholdem 탭 축) ────────────────
alter table public.schedules add column if not exists grade text;
do $$ begin
  alter table public.schedules add constraint schedules_grade_chk
    check (grade is null or grade in ('daily', 'satellite', 'series'));
exception when duplicate_object then null; end $$;

-- ── ③ 매장 위경도 (거리순 정렬 — 클라이언트 카카오 지오코딩 라이트백으로 채움) ──
alter table public.venues add column if not exists lat double precision;
alter table public.venues add column if not exists lng double precision;

-- 좌표 저장 RPC — 지도 임베드가 지오코딩에 성공했을 때 매장 관리자 기기가 조용히 저장.
create or replace function public.set_venue_coords(p_venue_id uuid, p_lat double precision, p_lng double precision)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not can_manage_venue(p_venue_id) then raise exception '권한이 없습니다'; end if;
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception '좌표 값이 올바르지 않습니다';
  end if;
  update public.venues set lat = p_lat, lng = p_lng where id = p_venue_id;
end $function$;
revoke all on function public.set_venue_coords(uuid, double precision, double precision) from public, anon;
grant execute on function public.set_venue_coords(uuid, double precision, double precision) to authenticated, service_role;

-- ── ④ 사용(차감) 경로 만료 가드 — 4개 RPC 전부. UPDATE 술어에도 넣어 원자성 유지. ──
create or replace function public.redeem_my_voucher(p_voucher_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_holder uuid; v_venue uuid; v_name text; v_exp timestamptz;
begin
  select holder_user_id, venue_id, expires_at into v_holder, v_venue, v_exp
    from public.store_vouchers where id = p_voucher_id and status='active';
  if v_holder is null or v_holder <> auth.uid() then raise exception '본인이 보유한 이용권만 사용할 수 있습니다'; end if;
  if v_exp is not null and v_exp <= now() then
    raise exception '유효기간이 지난 이용권입니다 (만료 %)', to_char(v_exp at time zone 'Asia/Seoul', 'YYYY-MM-DD');
  end if;
  update public.store_vouchers set status='used', used_venue_id = v_venue, used_at = now()
   where id = p_voucher_id and status='active' and (expires_at is null or expires_at > now());
  if not found then raise exception '사용 처리할 수 없는 이용권입니다 (이미 사용/만료/취소됨)'; end if;
  select name into v_name from public.venues where id = v_venue;
  return coalesce(v_name, '매장');
end $function$;

create or replace function public.redeem_my_voucher_by_qr(p_voucher_id uuid, p_venue_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_holder uuid; v_venue uuid; v_name text; v_exp timestamptz;
begin
  select holder_user_id, venue_id, expires_at into v_holder, v_venue, v_exp
    from public.store_vouchers where id = p_voucher_id and status='active';
  if v_holder is null or v_holder <> auth.uid() then raise exception '본인이 보유한 이용권만 사용할 수 있습니다'; end if;
  if v_venue <> p_venue_id then raise exception '이 매장의 이용권이 아닙니다 (발급 매장에서만 사용 가능)'; end if;
  if v_exp is not null and v_exp <= now() then
    raise exception '유효기간이 지난 이용권입니다 (만료 %)', to_char(v_exp at time zone 'Asia/Seoul', 'YYYY-MM-DD');
  end if;
  update public.store_vouchers set status='used', used_venue_id = v_venue, used_at = now()
   where id = p_voucher_id and status='active' and (expires_at is null or expires_at > now());
  if not found then raise exception '사용 처리할 수 없는 이용권입니다 (이미 사용/만료/취소됨)'; end if;
  select name into v_name from public.venues where id = v_venue;
  return coalesce(v_name, '매장');
end $function$;

create or replace function public.redeem_my_voucher_by_phone(p_voucher_id uuid, p_phone text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_holder uuid; v_venue uuid; v_owner uuid; v_ownerphone text; v_norm text; v_name text; v_exp timestamptz;
begin
  v_norm := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
  if length(v_norm) < 9 then raise exception '전화번호를 정확히 입력하세요'; end if;
  select holder_user_id, venue_id, expires_at into v_holder, v_venue, v_exp
    from public.store_vouchers where id = p_voucher_id and status='active';
  if v_holder is null or v_holder <> auth.uid() then raise exception '본인이 보유한 이용권만 사용할 수 있습니다'; end if;
  if v_exp is not null and v_exp <= now() then
    raise exception '유효기간이 지난 이용권입니다 (만료 %)', to_char(v_exp at time zone 'Asia/Seoul', 'YYYY-MM-DD');
  end if;
  select owner_id, name into v_owner, v_name from public.venues where id = v_venue;
  select regexp_replace(coalesce(p.phone,''), '[^0-9]', '', 'g') into v_ownerphone from public.profiles p where p.id = v_owner;
  if v_ownerphone is null or v_ownerphone = '' then
    select regexp_replace(coalesce(contact_phone,''), '[^0-9]', '', 'g') into v_ownerphone from public.venues where id = v_venue;
  end if;
  if v_ownerphone is null or v_ownerphone = '' or v_ownerphone <> v_norm then raise exception '이 매장 업주의 전화번호가 아닙니다'; end if;
  update public.store_vouchers set status='used', used_venue_id = v_venue, used_at = now()
   where id = p_voucher_id and status='active' and (expires_at is null or expires_at > now());
  if not found then raise exception '사용 처리할 수 없는 이용권입니다 (이미 사용/만료/취소됨)'; end if;
  return coalesce(v_name, '매장');
end $function$;

create or replace function public.redeem_voucher(p_voucher_id uuid, p_used_venue_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not can_manage_venue(p_used_venue_id) then raise exception '권한이 없습니다'; end if;
  update public.store_vouchers set status='used', used_venue_id=p_used_venue_id, used_at=now()
   where id=p_voucher_id and status='active'
     and venue_id = p_used_venue_id
     and (expires_at is null or expires_at > now());
  if not found then raise exception '사용 처리할 수 없는 이용권입니다 (이미 사용/만료/취소되었거나 이 매장 발급이 아님)'; end if;
end $function$;

-- ── ⑤ 발급 시 만료일 옵션 — 시그니처가 바뀌므로 DROP 후 재생성 + ACL 명시 복원 ──
drop function if exists public.issue_voucher(uuid, text, integer, text, uuid, text);
create function public.issue_voucher(
  p_venue_id uuid, p_title text, p_count integer default 1,
  p_holder_name text default null, p_holder_user_id uuid default null, p_note text default null,
  p_expires_at timestamptz default null
)
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
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception '만료일은 미래 시각이어야 합니다';
  end if;
  v_count := least(greatest(coalesce(p_count, 1), 1), 1000);
  if my_role() <> 'admin' then
    select voucher_quota into v_quota from public.venues where id = p_venue_id for update;
    if coalesce(v_quota, 0) < v_count then
      raise exception '발급 한도가 부족합니다 (잔여 %개) — 충전 요청을 남겨 주세요', coalesce(v_quota, 0);
    end if;
    update public.venues set voucher_quota = voucher_quota - v_count where id = p_venue_id;
  end if;
  v_title := coalesce(nullif(btrim(p_title), ''), '매장이용권');
  v_holder := nullif(btrim(coalesce(p_holder_name, '')), '');
  insert into public.store_vouchers(venue_id, issued_by, holder_user_id, holder_name, title, note, expires_at)
  select p_venue_id, auth.uid(), p_holder_user_id, v_holder, v_title, nullif(btrim(coalesce(p_note, '')), ''), p_expires_at
  from generate_series(1, v_count);
  return v_count;
end $function$;
revoke all on function public.issue_voucher(uuid, text, integer, text, uuid, text, timestamptz) from public, anon;
grant execute on function public.issue_voucher(uuid, text, integer, text, uuid, text, timestamptz) to authenticated, service_role;
