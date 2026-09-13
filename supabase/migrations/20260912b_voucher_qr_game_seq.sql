-- 20260912b — 이용권 QR 사용의 게임(메인/사이드) 지정이 서버까지 가지 않던 것 (V06, 2026-09-12 재현)
-- APPLIED 2026-09-13: event_voucher_bundle_20260913_hardened. Activation is separate.
--
-- 근본 원인
--   손님이 사이드 게임 테이블의 바인 QR 을 찍으면 클라이언트(MyVoucherSheet.tsx)는 hit.gameSeq 를
--   plan.gameSeq 로 들고 있었지만, 실제 사용 RPC(redeem_my_voucher_by_qr/_by_phone)는 voucher_id ·
--   venue_id(또는 phone) 만 받아 게임 번호를 서버로 보낼 방법이 아예 없었다.
--   사용 처리는 store_vouchers.status → 'used' 전이에 물린 트리거 voucher_redeem_to_ledger_request
--   (20260818f:68)가 대신 만드는데, 이 트리거는 UPDATE 문 자체에서 촉발되는 것이라 RPC 인자를
--   직접 받을 수 없어 requested_game_seq 를 항상 NULL 로 남겼다.
--   운영자가 그 대기 요청을 승인할 때(planBuyinApprovals, src/lib/buyinApproval.ts) requested_game_seq
--   가 NULL 이면 '지금 보고 있는 게임'으로 대체한다 — 사이드2 QR 로 찍었는데 메인1 을 보며 승인하면
--   메인1 명단에 들어갔다(손님 자산이 엉뚱한 게임으로 새는 결함).
--
-- 고치는 방법 — 소비와 게임 지정을 같은 트랜잭션 안에서 묶는다(소비 후 되돌아가 고치는 비원자 보정 금지)
--   ① redeem_my_voucher_by_qr/_by_phone 에 p_game_seq(smallint, default null)를 더한다(하위호환:
--      기본값이 있어 구버전 클라이언트 호출도 그대로 동작한다).
--   ② UPDATE 직전에 set_config('nuri.voucher_game_seq', ..., true) 로 **트랜잭션 범위** 세션 변수에
--      싣는다(커밋/롤백과 함께 사라진다 — 다른 세션·다음 요청에 새지 않는다).
--   ③ 트리거는 같은 트랜잭션 안에서 그 변수를 읽어 INSERT 문 한 줄에 requested_game_seq 를 채운다 —
--      RPC 가 UPDATE 하나만 실행해도 트리거의 INSERT 까지 원자적으로 게임 번호를 갖는다.
--   ④ p_game_seq 가 왔는데 그 게임이 이미 마감돼 있으면 사용 자체를 거절한다(만료·마감된 게임으로
--      조용히 흘려보내지 않는다) — request_buyin 과 달리 이용권은 즉시 소비되므로 더 엄격하게 막는다.
--
-- 데이터 영향: 0. 컬럼·트리거 시그니처 전부 하위호환(신규 파라미터는 DEFAULT NULL).
--   REVOKE/GRANT 를 같이 적는다 — ⚠ 2026-09-12 실측 정정: CREATE OR REPLACE 는 ACL 을 **보존**하고, 날아가는 것은 DROP+재생성이다
--   (아래에서 옛 2-인자 시그니처를 DROP 하고 3-인자로 **새로 만드는** 경우가 정확히 그것이라 REVOKE/GRANT 가 반드시 필요하다).
--
-- ⚠⚠ 2026-09-13 정정(N04 감사, 적대 반증 생존 · high) — 아래 옛 주장은 **틀렸다**:
--   (옛 문장) "anon 도 실행 가능했다는 뜻은 아니다, 함수 내부가 auth.uid() 를 강제해 실질 피해는 없지만 규약을 맞춘다"
--   그 주장은 **NULL 경로를 놓쳤다.** 옛 가드 `if v_holder is null or v_holder <> auth.uid()` 는 비로그인(anon)에서 auth.uid() 가 NULL 이라
--   `false OR NULL = NULL` → IF 를 **건너뛴다(fail-open)**. 게다가 두 RPC 는 REVOKE 가 저장소 어디에도 없어 PUBLIC EXECUTE 가 잔존했다 —
--   즉 anon 이 voucher_id 만 알면 남의 이용권을 '사용됨' 으로 만들 수 있는 조합이었다(20260829c:131·:160).
--   이번 초안은 ① `auth.uid() is null` 명시 체크 + `is distinct from` ② REVOKE ALL FROM PUBLIC, ANON + authenticated·service_role 재부여
--   ③ search_path = public, pg_temp 로 닫는다(nuri-migration §1·§2·§3 · CLAUDE.md 보안표준 2·3).
--   ⚠ 현재 실피해 0 — 킬스위치 OFF · store_vouchers 0행(2026-09-11 실측). 과장하지 않는다. **기능을 켜는 첫날부터 유효**하다.
--   (approve_buyin_request 의 승인 경합은 별건 — 초안 20260912a 가 `for update` + status 술어 + `if not found` 로 다룬다. 여기 넣지 않는다.)
--   계약: src/api/voucherRedeemNullSafe.migration.test.ts
--
-- 검증(적용 시 라이브에서 트랜잭션 롤백으로): 사이드 게임 QR 스캔 흉내 → redeem_my_voucher_by_qr(...,
--   p_game_seq:=2) 호출 → ledger_buyin_requests.requested_game_seq = 2 확인 → ROLLBACK.
-- 롤백: 파일 하단 참고.
-- ============================================================================

-- ── ① 트리거 — 세션 변수로 넘어온 게임 번호를 requested_game_seq 에 싣는다 ──────────────────
create or replace function public.voucher_redeem_to_ledger_request()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_seq smallint;
begin
  if new.status = 'used' and (old.status is distinct from 'used') and new.used_venue_id is not null then
    -- 트랜잭션 범위 세션 변수(is_local=true) — RPC 가 같은 트랜잭션에서 set_config 로 싣는다.
    -- 값이 없거나(구버전 RPC·직접 UPDATE) 빈 문자열이면 NULL — 예전처럼 '게임 미지정' 요청이 된다.
    v_seq := nullif(current_setting('nuri.voucher_game_seq', true), '')::smallint;
    insert into public.ledger_buyin_requests(venue_id, session_date, user_id, player_name, note, status, voucher_id, requested_game_seq)
    select
      new.used_venue_id,
      public.ledger_business_date(new.used_venue_id),
      new.holder_user_id,
      coalesce(nullif(btrim(new.holder_name), ''), '이용권 사용자'),
      '🎟 이용권 사용 — ' || coalesce(nullif(btrim(new.title), ''), '매장이용권') || ' · 수량/현금 확인 후 승인',
      'pending',
      new.id,
      v_seq
    where not exists (
      select 1 from public.ledger_buyin_requests
      where voucher_id = new.id and status <> 'rejected'
    );
  end if;
  return new;
end; $function$;
revoke all on function public.voucher_redeem_to_ledger_request() from public, anon, authenticated;
-- (트리거 함수는 authenticated 실행 권한이 필요 없다 — 20260829c 가 이미 이렇게 회수해 두었다. 유지.)

-- ── ② redeem_my_voucher_by_qr — 게임 지정 + 마감된 게임 명확히 거절 ──────────────────────────
--   set_config 는 반드시 UPDATE **이전에** 부른다 — AFTER 트리거가 그 값을 읽는다.
create or replace function public.redeem_my_voucher_by_qr(p_voucher_id uuid, p_venue_id uuid, p_game_seq smallint default null)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_holder uuid; v_venue uuid; v_name text; v_exp timestamptz; v_status text; v_biz date;
begin
  select holder_user_id, venue_id, expires_at, status
    into v_holder, v_venue, v_exp, v_status
    from public.store_vouchers where id = p_voucher_id;
  if v_status is null then raise exception '이용권을 찾을 수 없습니다 — 새로고침 후 다시 확인해 주세요'; end if;
  -- NULL-safe(2026-09-13): auth.uid() 가 NULL(비로그인)이면 `<>` 는 NULL 이 되어 IF 를 건너뛰었다(fail-open). 명시 체크 + is distinct from.
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if v_holder is null or v_holder is distinct from auth.uid() then raise exception '본인이 보유한 이용권만 사용할 수 있습니다'; end if;
  if v_venue is distinct from p_venue_id then raise exception '이 매장의 이용권이 아닙니다 (발급 매장에서만 사용 가능)'; end if;
  if v_status = 'used' then raise exception '이미 사용한 이용권입니다 — 지갑의 사용 내역에서 확인할 수 있어요'; end if;
  if v_status = 'revoked' then raise exception '매장이 회수한 이용권입니다 — 발급 매장에 문의해 주세요'; end if;
  if v_status <> 'active' then raise exception '사용할 수 없는 이용권입니다 (상태: %)', v_status; end if;
  if v_exp is not null and v_exp <= now() then
    raise exception '유효기간이 지난 이용권입니다 (만료 %)', to_char(v_exp at time zone 'Asia/Seoul', 'YYYY-MM-DD');
  end if;
  if p_game_seq is not null then
    if p_game_seq < 1 then
      raise exception '게임 번호가 올바르지 않습니다 — 접수대에서 게임을 다시 선택해 주세요';
    end if;
    v_biz := public.ledger_business_date(p_venue_id);
    if not exists (
      select 1 from public.ledger_sessions ls
       where ls.venue_id = p_venue_id and ls.session_date = v_biz and ls.game_seq = p_game_seq
    ) then
      raise exception '해당 게임을 찾을 수 없습니다 — 접수대에서 게임을 다시 선택해 주세요';
    end if;
    if public.ledger_is_closed(p_venue_id, v_biz, p_game_seq) then
      raise exception '이미 마감된 게임입니다 — 접수대에서 다른 게임으로 다시 요청해 주세요';
    end if;
  end if;
  perform set_config('nuri.voucher_game_seq', coalesce(p_game_seq::text, ''), true);
  update public.store_vouchers set status='used', used_venue_id = v_venue, used_at = now()
   where id = p_voucher_id and status='active' and (expires_at is null or expires_at > now());
  if not found then raise exception '방금 다른 기기에서 사용된 것 같습니다 — 새로고침 후 다시 확인해 주세요'; end if;
  select name into v_name from public.venues where id = v_venue;
  return coalesce(v_name, '매장');
end; $function$;
revoke all on function public.redeem_my_voucher_by_qr(uuid, uuid, smallint) from public, anon;
grant execute on function public.redeem_my_voucher_by_qr(uuid, uuid, smallint) to authenticated, service_role;
-- 이전 2-인자 시그니처는 더 이상 쓰이지 않으므로 남겨두면 그림자 함수가 된다 — 정리한다.
drop function if exists public.redeem_my_voucher_by_qr(uuid, uuid);

-- ── ③ redeem_my_voucher_by_phone — 같은 원리. gameSeq 는 항상 null 이 오지만 시그니처는 맞춘다 ──
create or replace function public.redeem_my_voucher_by_phone(p_voucher_id uuid, p_phone text, p_game_seq smallint default null)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_holder uuid; v_venue uuid; v_owner uuid; v_ownerphone text; v_norm text; v_name text; v_exp timestamptz; v_status text; v_biz date;
begin
  v_norm := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
  if length(v_norm) < 9 then raise exception '전화번호를 정확히 입력하세요'; end if;
  select holder_user_id, venue_id, expires_at, status
    into v_holder, v_venue, v_exp, v_status
    from public.store_vouchers where id = p_voucher_id;
  if v_status is null then raise exception '이용권을 찾을 수 없습니다 — 새로고침 후 다시 확인해 주세요'; end if;
  -- NULL-safe(2026-09-13): auth.uid() 가 NULL(비로그인)이면 `<>` 는 NULL 이 되어 IF 를 건너뛰었다(fail-open). 명시 체크 + is distinct from.
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if v_holder is null or v_holder is distinct from auth.uid() then raise exception '본인이 보유한 이용권만 사용할 수 있습니다'; end if;
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
  if p_game_seq is not null then
    if p_game_seq < 1 then
      raise exception '게임 번호가 올바르지 않습니다 — 접수대에서 게임을 다시 선택해 주세요';
    end if;
    v_biz := public.ledger_business_date(v_venue);
    if not exists (
      select 1 from public.ledger_sessions ls
       where ls.venue_id = v_venue and ls.session_date = v_biz and ls.game_seq = p_game_seq
    ) then
      raise exception '해당 게임을 찾을 수 없습니다 — 접수대에서 게임을 다시 선택해 주세요';
    end if;
    if public.ledger_is_closed(v_venue, v_biz, p_game_seq) then
      raise exception '이미 마감된 게임입니다 — 접수대에서 다른 게임으로 다시 요청해 주세요';
    end if;
  end if;
  perform set_config('nuri.voucher_game_seq', coalesce(p_game_seq::text, ''), true);
  update public.store_vouchers set status='used', used_venue_id = v_venue, used_at = now()
   where id = p_voucher_id and status='active' and (expires_at is null or expires_at > now());
  if not found then raise exception '방금 다른 기기에서 사용된 것 같습니다 — 새로고침 후 다시 확인해 주세요'; end if;
  return coalesce(v_name, '매장');
end; $function$;
revoke all on function public.redeem_my_voucher_by_phone(uuid, text, smallint) from public, anon;
grant execute on function public.redeem_my_voucher_by_phone(uuid, text, smallint) to authenticated, service_role;
drop function if exists public.redeem_my_voucher_by_phone(uuid, text);

notify pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK
--   drop function public.redeem_my_voucher_by_qr(uuid, uuid, smallint);
--   drop function public.redeem_my_voucher_by_phone(uuid, text, smallint);
--   create or replace function public.redeem_my_voucher_by_qr(p_voucher_id uuid, p_venue_id uuid) ... (20260829c 본문 그대로)
--   create or replace function public.redeem_my_voucher_by_phone(p_voucher_id uuid, p_phone text) ... (20260829c 본문 그대로)
--   create or replace function public.voucher_redeem_to_ledger_request() ... (20260818f:68 본문 그대로, requested_game_seq 없이)
--   grant execute on function public.redeem_my_voucher_by_qr(uuid, uuid) to public;   -- 되돌리려면(권장하지 않음)
--   grant execute on function public.redeem_my_voucher_by_phone(uuid, text) to public;
-- ============================================================================
