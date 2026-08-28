-- ============================================================================
-- 매장이용권 "쓸 수 있는 정도까지" 재점검 — 서버측 6건 (2026-08-29)
-- 전 여정(순위 시상 → 전송 → 보유 → 사용 → 내역 → 회수·삭제)을 라이브 DB 에서
-- 임퍼소네이션+ROLLBACK 으로 관통하며 실측한 결함만 고친다. 전부 비파괴(CREATE OR
-- REPLACE + REVOKE) — DROP·컬럼삭제·데이터삭제 0건. 시그니처·반환형 전부 동일.
--
-- 실측 근거(2026-08-29, [E2E] 매장 f8ecbc1a… · 트랜잭션 롤백 · 영속 변이 0):
--   ① revoke_voucher(이미 used) → 예외 없음, status=used 그대로.
--      클라이언트는 error 만 보므로 "회수했습니다"를 띄운다. 업주가 회수했다고 믿는다.
--   ② delete_voucher(used) → 삭제됨. voucher_history 0행 + ledger_buyin_requests 1건 고아.
--      손님의 사용 기록과 장부 연동이 되돌릴 수 없이 증발한다.
--   ③ redeem_my_voucher(이미 쓴 것) → "본인이 보유한 이용권만 사용할 수 있습니다".
--      원인이 '이미 사용'인데 문구는 '남의 이용권'을 가리킨다. 접수대에서 오진단.
--      (세 사용 RPC 가 전부 status='active' 로 먼저 걸러 v_holder 가 null 이 되는 탓)
--   ④ accrue_voucher → 장부 권한 '직원'으로 5장 발급 성공.
--      issue_voucher 는 can_manage_pos(업주)로 막는데 같은 결과를 내는 이 함수는
--      can_access_ledger(직원 포함)로 열려 있었다. 클라이언트 호출부는 0건
--      (§12-A-3 자동적립 중단으로 UI 제거) — UI 없는 우회 경로였다.
--   ⑤ get_voucher_quota → 비로그인(anon)이 97 을 그대로 읽는다.
--   ⑥ voucher_history·voucher_holder_profiles 등 anon EXECUTE 잔존(내부 게이트로
--      0행이라 유출은 없었으나 프로젝트 ACL 규약 위반).
--
-- ⚠ can_access_ledger 의 anon EXECUTE 는 건드리지 않는다 — ledger_*·clock_* 등
--   roles=public 정책 15곳이 이 함수를 평가한다. 회수하면 비로그인 SELECT 가
--   '0행'이 아니라 'permission denied for function' 하드 에러가 된다(실측 확인).
-- ============================================================================

-- ── ① 회수: 조용한 실패 폐쇄 + 보유자 통지 ──────────────────────────────────
-- 왜 예외인가: 이 RPC 는 void 라 클라이언트가 '몇 행이 바뀌었는지'를 알 방법이 없다.
--   무변화를 성공과 구분하려면 서버가 말해 주는 수밖에 없다.
-- 왜 통지인가: 회수는 손님 지갑에서 티켓이 소리 없이 사라지는 유일한 경로다.
--   복구 통지(_restore_voucher_on_request_void)와 대칭을 맞춘다.
create or replace function public.revoke_voucher(p_voucher_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_venue uuid; v_status text; v_holder uuid; v_title text; v_vname text;
begin
  select venue_id, status, holder_user_id, title
    into v_venue, v_status, v_holder, v_title
    from public.store_vouchers where id = p_voucher_id;
  if v_venue is null then raise exception '이용권을 찾을 수 없습니다 — 이미 삭제되었을 수 있습니다'; end if;
  if not can_manage_pos(v_venue) then raise exception '권한이 없습니다 — 업주만 회수할 수 있습니다'; end if;
  if v_status = 'used' then
    raise exception '이미 사용된 이용권은 회수할 수 없습니다 — 사용 내역은 그대로 보존됩니다';
  end if;
  if v_status = 'revoked' then raise exception '이미 회수된 이용권입니다'; end if;
  update public.store_vouchers set status = 'revoked' where id = p_voucher_id and status = 'active';
  if not found then raise exception '회수 처리에 실패했습니다 — 새로고침 후 다시 시도해 주세요'; end if;
  if v_holder is not null then
    begin
      select name into v_vname from public.venues where id = v_venue;
      insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link)
      values (v_holder, 'system', '🎟 매장이용권이 회수되었습니다',
              format('%s의 ''%s'' 1장이 매장에 의해 회수되었습니다. 문의는 매장으로 부탁드립니다.',
                     coalesce(v_vname, '매장'), coalesce(nullif(btrim(v_title), ''), '매장이용권')),
              '🎟', '#FFD100', '/wallet');
    exception when others then null;
    end;
  end if;
end $function$;

-- ── ② 삭제: 사용 완료분 보호 ────────────────────────────────────────────────
-- 사용된 이용권 행은 곧 '손님의 사용 내역'이자 장부 바인요청(ledger_buyin_requests.
-- voucher_id)의 부모다. 지우면 손님 지갑의 사용 내역, 업주의 voucher_history,
-- 장부 연동이 동시에 사라지고 고아 요청만 남는다(실측 ②). 되돌릴 경로가 없다.
-- 운영자(admin)는 데이터 정리 목적으로 남겨 둔다.
create or replace function public.delete_voucher(p_voucher_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_venue uuid; v_status text;
begin
  select venue_id, status into v_venue, v_status from public.store_vouchers where id = p_voucher_id;
  if v_venue is null then raise exception '이용권을 찾을 수 없습니다 — 이미 삭제되었습니다'; end if;
  if not can_manage_pos(v_venue) then raise exception '권한이 없습니다 — 업주만 삭제할 수 있습니다'; end if;
  if v_status = 'used' and my_role() IS DISTINCT FROM 'admin' then
    raise exception '사용 완료된 이용권은 삭제할 수 없습니다 — 손님의 사용 내역과 장부 연동이 함께 사라집니다. 미사용분만 삭제하거나 회수해 주세요';
  end if;
  delete from public.store_vouchers where id = p_voucher_id;
end $function$;

-- ── ③ 사용 3경로: 실패 원인을 정확히 말한다 ─────────────────────────────────
-- 기존 3개 함수는 전부 `where id=... and status='active'` 로 먼저 걸러서, 이미
-- 사용·회수·만료된 건이면 v_holder 가 null 이 되어 '본인이 보유한 이용권만…'
-- 으로 떨어졌다. 접수대 앞에서 사장님·손님이 계정 문제로 오해하는 문구다.
-- 순서는 그대로 유지한다: 존재 → 본인 확인 → (매장) → 상태 → 만료.
-- 본인 확인을 상태보다 먼저 두는 이유: 남의 이용권 상태를 알려 주지 않기 위해서다.
create or replace function public.redeem_my_voucher(p_voucher_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_holder uuid; v_venue uuid; v_name text; v_exp timestamptz; v_status text;
begin
  select holder_user_id, venue_id, expires_at, status
    into v_holder, v_venue, v_exp, v_status
    from public.store_vouchers where id = p_voucher_id;
  if v_status is null then raise exception '이용권을 찾을 수 없습니다 — 새로고침 후 다시 확인해 주세요'; end if;
  if v_holder is null or v_holder <> auth.uid() then raise exception '본인이 보유한 이용권만 사용할 수 있습니다'; end if;
  if v_status = 'used' then raise exception '이미 사용한 이용권입니다 — 지갑의 사용 내역에서 확인할 수 있어요'; end if;
  if v_status = 'revoked' then raise exception '매장이 회수한 이용권입니다 — 발급 매장에 문의해 주세요'; end if;
  if v_status <> 'active' then raise exception '사용할 수 없는 이용권입니다 (상태: %)', v_status; end if;
  if v_exp is not null and v_exp <= now() then
    raise exception '유효기간이 지난 이용권입니다 (만료 %)', to_char(v_exp at time zone 'Asia/Seoul', 'YYYY-MM-DD');
  end if;
  update public.store_vouchers set status='used', used_venue_id = v_venue, used_at = now()
   where id = p_voucher_id and status='active' and (expires_at is null or expires_at > now());
  if not found then raise exception '방금 다른 기기에서 사용된 것 같습니다 — 새로고침 후 다시 확인해 주세요'; end if;
  select name into v_name from public.venues where id = v_venue;
  return coalesce(v_name, '매장');
end $function$;

create or replace function public.redeem_my_voucher_by_qr(p_voucher_id uuid, p_venue_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_holder uuid; v_venue uuid; v_name text; v_exp timestamptz; v_status text;
begin
  select holder_user_id, venue_id, expires_at, status
    into v_holder, v_venue, v_exp, v_status
    from public.store_vouchers where id = p_voucher_id;
  if v_status is null then raise exception '이용권을 찾을 수 없습니다 — 새로고침 후 다시 확인해 주세요'; end if;
  if v_holder is null or v_holder <> auth.uid() then raise exception '본인이 보유한 이용권만 사용할 수 있습니다'; end if;
  if v_venue <> p_venue_id then raise exception '이 매장의 이용권이 아닙니다 (발급 매장에서만 사용 가능)'; end if;
  if v_status = 'used' then raise exception '이미 사용한 이용권입니다 — 지갑의 사용 내역에서 확인할 수 있어요'; end if;
  if v_status = 'revoked' then raise exception '매장이 회수한 이용권입니다 — 발급 매장에 문의해 주세요'; end if;
  if v_status <> 'active' then raise exception '사용할 수 없는 이용권입니다 (상태: %)', v_status; end if;
  if v_exp is not null and v_exp <= now() then
    raise exception '유효기간이 지난 이용권입니다 (만료 %)', to_char(v_exp at time zone 'Asia/Seoul', 'YYYY-MM-DD');
  end if;
  update public.store_vouchers set status='used', used_venue_id = v_venue, used_at = now()
   where id = p_voucher_id and status='active' and (expires_at is null or expires_at > now());
  if not found then raise exception '방금 다른 기기에서 사용된 것 같습니다 — 새로고침 후 다시 확인해 주세요'; end if;
  select name into v_name from public.venues where id = v_venue;
  return coalesce(v_name, '매장');
end $function$;

create or replace function public.redeem_my_voucher_by_phone(p_voucher_id uuid, p_phone text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_holder uuid; v_venue uuid; v_owner uuid; v_ownerphone text; v_norm text; v_name text; v_exp timestamptz; v_status text;
begin
  v_norm := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
  if length(v_norm) < 9 then raise exception '전화번호를 정확히 입력하세요'; end if;
  select holder_user_id, venue_id, expires_at, status
    into v_holder, v_venue, v_exp, v_status
    from public.store_vouchers where id = p_voucher_id;
  if v_status is null then raise exception '이용권을 찾을 수 없습니다 — 새로고침 후 다시 확인해 주세요'; end if;
  if v_holder is null or v_holder <> auth.uid() then raise exception '본인이 보유한 이용권만 사용할 수 있습니다'; end if;
  if v_status = 'used' then raise exception '이미 사용한 이용권입니다 — 지갑의 사용 내역에서 확인할 수 있어요'; end if;
  if v_status = 'revoked' then raise exception '매장이 회수한 이용권입니다 — 발급 매장에 문의해 주세요'; end if;
  if v_status <> 'active' then raise exception '사용할 수 없는 이용권입니다 (상태: %)', v_status; end if;
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
  if not found then raise exception '방금 다른 기기에서 사용된 것 같습니다 — 새로고침 후 다시 확인해 주세요'; end if;
  return coalesce(v_name, '매장');
end $function$;

-- ── ④ 적립: 발급과 같은 권한선으로 정렬 + 본인인증 선판정 ───────────────────
-- can_access_ledger(직원 포함) → can_manage_pos(업주). 같은 결과(store_vouchers
-- 행 생성)를 내는 두 함수가 서로 다른 권한선을 쓰면 낮은 쪽이 곧 우회로다.
-- 본인인증 선판정: 없으면 쿼터를 먼저 깎은 뒤 trg_voucher_verified 에서 되돌아오고,
-- 문구도 '적립'이 아니라 '보유·사용'을 말해 원인을 못 짚는다(issue_voucher 와 동형).
-- 함수·시그니처·자동적립 기능 자체는 그대로 둔다(§12-A-3 로 UI 만 중단된 상태).
create or replace function public.accrue_voucher(p_venue_id uuid, p_player_name text, p_count integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_count int; v_uid uuid; v_name text; v_quota int; v_vname text; v_nick text; v_real text;
begin
  if not can_manage_pos(p_venue_id) then raise exception '권한이 없습니다 — 이용권 적립은 업주만 가능합니다'; end if;
  if not coalesce((select voucher_issue_approved from public.venues where id = p_venue_id), false) then
    raise exception '운영자 승인 후 적립할 수 있습니다';
  end if;
  v_name := btrim(coalesce(p_player_name, ''));
  if v_name = '' then return 0; end if;
  v_nick := btrim(coalesce((regexp_match(v_name, '^.*\((.+)\)$'))[1], ''));
  v_real := btrim(coalesce((regexp_match(v_name, '^(.*)\(.+\)$'))[1], ''));
  v_count := least(greatest(coalesce(p_count, 1), 1), 1000);
  select p.id into v_uid from public.profiles p
   where coalesce(p.status::text, 'active') = 'active'
     and (lower(btrim(p.nickname)) = lower(v_name)
       or (v_nick <> '' and lower(btrim(p.nickname)) = lower(v_nick))
       or btrim(p.real_name) = v_name
       or (v_real <> '' and btrim(p.real_name) = v_real)
       or btrim(p.name) = v_name)
   order by (lower(btrim(p.nickname)) = lower(case when v_nick <> '' then v_nick else v_name end)) desc
   limit 1;
  -- 쿼터 차감 '전에' 본인인증을 판정한다 — 트리거에서 뒤늦게 막히면 원인 문구가 어긋난다.
  if v_uid is not null and not exists (
    select 1 from public.profiles p
    where p.id = v_uid and public.is_ci_verified(p.ci_hash, p.verified_at)
  ) then
    raise exception '''%'' 님은 본인인증 전이라 이용권을 적립할 수 없습니다 — 받는 분이 프로필 > 보안에서 본인인증을 마쳐야 합니다', v_name;
  end if;
  if my_role() IS DISTINCT FROM 'admin' then
    select voucher_quota into v_quota from public.venues where id = p_venue_id for update;
    if coalesce(v_quota, 0) < v_count then
      raise exception '발급 한도가 부족해 적립하지 못했습니다 (잔여 %개 · 필요 %개) — 운영자에게 문의해 주세요', coalesce(v_quota, 0), v_count;
    end if;
    update public.venues set voucher_quota = voucher_quota - v_count where id = p_venue_id;
  end if;
  insert into public.store_vouchers(venue_id, issued_by, holder_user_id, holder_name, title)
  select p_venue_id, auth.uid(), v_uid, v_name, '적립 이용권'
  from generate_series(1, v_count);
  if v_uid is not null then
    begin
      select name into v_vname from public.venues where id = p_venue_id;
      insert into public.notifications (user_id, type, title, message, avatar_text, avatar_color, link)
      values (v_uid, 'system', '🎟 적립 이용권 도착!',
              format('%s 방문 적립으로 이용권 %s장을 받았어요. 지갑에서 확인하세요', coalesce(v_vname, '매장'), v_count),
              '🎟', '#FFD100', '/wallet');
    exception when others then null;
    end;
  end if;
  return v_count;
end $function$;

-- ── ⑤ 잔여 한도: 열람 권한자에게만 ──────────────────────────────────────────
-- 비로그인·아무 회원이나 임의 매장의 잔여 한도를 읽을 수 있었다(실측 ⑤).
-- 권한이 없으면 null 을 돌려준다(0 이 아니다 — 0 은 '한도 소진'이라는 다른 뜻이다).
create or replace function public.get_voucher_quota(p_venue_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case when can_view_vouchers(p_venue_id)
              then coalesce((select voucher_quota from public.venues where id = p_venue_id), 0)
         end;
$function$;

-- ── ⑥ ACL 정리 — anon 회수(프로젝트 규약: authenticated/service_role 만) ────
-- 전부 정책(pg_policies)에서 참조되지 않는 함수만 고른다. 참조되는
-- can_access_ledger·can_view_vouchers 는 손대지 않는다.
revoke execute on function public.get_voucher_quota(uuid)          from public, anon;
revoke execute on function public.voucher_history(uuid)            from public, anon;
revoke execute on function public.voucher_holder_profiles(uuid)    from public, anon;
revoke execute on function public.my_voucher_credit_requests(uuid) from public, anon;
revoke execute on function public.request_voucher_credit(uuid, integer, text) from public, anon;
revoke execute on function public.voucher_redeem_to_ledger_request() from public, anon, authenticated;
grant execute on function public.get_voucher_quota(uuid)          to authenticated;
grant execute on function public.voucher_history(uuid)            to authenticated;
grant execute on function public.voucher_holder_profiles(uuid)    to authenticated;
grant execute on function public.my_voucher_credit_requests(uuid) to authenticated;
grant execute on function public.request_voucher_credit(uuid, integer, text) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK (원복이 필요하면 이 블록을 그대로 실행)
--   ① revoke_voucher / ② delete_voucher / ③ redeem_my_voucher(+_by_qr,_by_phone)
--   ④ accrue_voucher / ⑤ get_voucher_quota
--   → 각 함수의 직전 정의는 backup_20260826._functions 및
--     supabase/migrations/20260817a_accrue_voucher_quota_deduction.sql 참조.
--   ⑥ ACL 원복:
--     grant execute on function public.get_voucher_quota(uuid) to anon;
--     grant execute on function public.voucher_history(uuid) to anon;
--     grant execute on function public.voucher_holder_profiles(uuid) to anon;
--     grant execute on function public.my_voucher_credit_requests(uuid) to anon;
--     grant execute on function public.request_voucher_credit(uuid, integer, text) to anon;
--     grant execute on function public.voucher_redeem_to_ledger_request() to anon, authenticated;
-- ============================================================================
