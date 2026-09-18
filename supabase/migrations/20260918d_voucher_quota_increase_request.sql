-- 20260918d — 매장이용권 **발행 한도 증액 요청**(무상). 오너 지시 2026-09-18.
--
-- 오너 요청: "매장이용권 발행 한도 늘리는 요청(관리자에게)부터 시작해서 더 편하게 만들어"
--            "이용권 한도는 한도 증액 문구를 사용해서 전혀 금전적인게 없게"
--
-- ══ 왜 새 함수인가 — 기존 경로를 되살리지 않는 이유 ════════════════════════════
-- 2026-08-26(20260826b, W2 법적 하드가드 §12-A-2)에 아래 둘이 **의도적으로 봉쇄**됐다:
--     request_voucher_credit(...)        → 무조건 raise exception
--     admin_decide_voucher_credit(approve=true) → raise exception (반려만 가능)
--   봉쇄 사유(그 파일 주석 원문): "유상 발급쿼터 경로 폐쇄 — 이용권이 '상금 재원' 성격을
--   갖지 않게(§12-A-2). 업주 **충전 요청**(request) + 운영자 승인(approve) 파이프를 서버에서 봉쇄."
--   같은 파일이 **존치**시킨 것: admin_grant_voucher_quota — "운영자 수동 레버 … **금전 수수와
--   무관한 운영 도구**이며 전면 제거 시 쿼터 소진 매장의 발급이 영구 불능이 된다."
--
-- 즉 그 심사가 그은 선은 **금전 수수 여부**다. 여기서 만드는 것은 그 선의 '무관' 쪽이다:
--   · 결제·충전·구매·환불 개념이 **하나도 없다.** 금액 컬럼도, 가격도, 결제 연동도 없다.
--   · 오가는 값은 '장수'(발행 가능 매수)뿐이고, 승인은 운영자가 무상으로 해 주는 행위다.
--   · **실제 한도 증액은 기존 admin_grant_voucher_quota 가 한다** — 이 마이그레이션은 그 레버에
--     '요청 대기열'을 붙일 뿐, 새로운 권한을 만들지 않는다. 운영자가 원래 할 수 있던 일이다.
-- ⚠ 그래서 봉쇄된 두 함수는 **손대지 않는다.** 되살리지도, 이름을 바꾸지도 않는다.
--   이 파일을 되돌리려면 아래 ROLLBACK 블록의 drop 두 줄이면 된다(기존 봉쇄는 그대로 남는다).
--
-- ══ 표는 새로 만들지 않는다 ════════════════════════════════════════════════════
-- voucher_credit_requests(20260614b)를 그대로 쓴다. RLS 활성·정책 0 = RPC 전용이고,
-- 읽기 함수 두 개가 **이미 살아 있다**(봉쇄 대상이 아니었다):
--     my_voucher_credit_requests(p_venue_id)      — 업주가 자기 요청 10건
--     admin_list_voucher_credit_requests()        — 운영자 대기 목록
-- 표 이름에 'credit' 이 남지만 그건 내부 식별자다. **화면 문구는 전부 '한도 증액'** 이고
-- 금전 낱말(충전·구매·결제)은 쓰지 않는다 — 이름 변경은 인덱스·함수 4개를 동시에 건드려야 해서
-- 얻는 것(내부 가독성) 대비 라이브 위험이 크다. 이 결정을 여기 남긴다.
--
-- ══ 적용 상태 ═════════════════════════════════════════════════════════════════
-- ⏳ **아직 라이브에 적용하지 않았다.** 리허설은 전부 통과했다(아래 "리허설 기록" 8/8).
--    라이브 DB 변경은 오너 승인 사항이라 여기서 멈춘다 — 승인 뒤 MCP execute_sql 로 적용하고
--    이 머리말을 "✅ 적용 완료 + 실측값" 으로 고쳐 커밋한다.

-- ── ① 업주: 한도 증액 요청 ────────────────────────────────────────────────────
create or replace function public.request_voucher_quota(
  p_venue_id uuid,
  p_amount   integer,
  p_reason   text default null
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- 권한: 소유자 · 승인 공동운영자 · 운영자(issue_voucher 와 **같은 게이트**를 쓴다).
  --   ⚠ 화면 분기가 아니라 여기가 유일한 판정이다.
  if not can_manage_pos(p_venue_id) then
    raise exception '매장 업주만 한도 증액을 요청할 수 있습니다';
  end if;
  -- 매장이 실재해야 한다 — 없는 매장에 대기 행을 만들면 운영자 목록이 join 에서 사라져 조용히 묻힌다.
  if not exists (select 1 from public.venues v where v.id = p_venue_id) then
    raise exception '매장을 찾을 수 없습니다';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then
    raise exception '요청 장수는 1~100,000 사이여야 합니다';
  end if;
  -- 대기 중 요청이 있으면 새로 만들지 않는다 — 같은 매장이 목록을 도배하면 운영자가 못 읽는다.
  if exists (
    select 1 from public.voucher_credit_requests r
    where r.venue_id = p_venue_id and r.status = 'pending'
  ) then
    raise exception '이미 검토 중인 요청이 있습니다 — 결과가 나온 뒤에 다시 요청해 주세요';
  end if;

  insert into public.voucher_credit_requests (venue_id, requested_by, amount, note)
  values (p_venue_id, auth.uid(), p_amount, nullif(btrim(coalesce(p_reason, '')), ''));
end $$;

-- ⚠ 변이 RPC 기본값(CLAUDE.md 보안 표준 3): `from anon` 만으로는 무효다(PUBLIC 기본 GRANT).
revoke execute on function public.request_voucher_quota(uuid, integer, text) from public, anon;
grant  execute on function public.request_voucher_quota(uuid, integer, text) to authenticated, service_role;

-- ── ② 운영자: 요청 승인 / 반려 ────────────────────────────────────────────────
create or replace function public.admin_decide_voucher_quota(
  p_request_id uuid,
  p_approve    boolean,
  p_admin_note text default null
) returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare r record; q int;
begin
  -- ⚠ NULL-safe 비교(`IS DISTINCT FROM`) — `<>` 는 비로그인에서 NULL 이라 가드가 열린다.
  if my_role() IS DISTINCT FROM 'admin' then
    raise exception '운영자만 가능합니다';
  end if;

  select * into r
    from public.voucher_credit_requests
   where id = p_request_id and status = 'pending'
     for update;                                  -- 동시 클릭에 두 번 승인되지 않게 잠근다
  if not found then
    raise exception '대기 중인 요청이 아닙니다';
  end if;

  if p_approve then
    -- 🔴 실제 증액은 **기존 레버**가 한다. 여기서 venues 를 직접 update 하지 않는 이유:
    --   admin_grant_voucher_quota 는 §12-A 심사가 '금전 수수와 무관' 하다고 명시적으로 존치시킨
    --   함수다. 증액 로직을 여기에 복사하면 그 심사 밖에 두 번째 경로가 생긴다 —
    --   한쪽만 고쳐지는 날이 반드시 오고, 그때 어느 쪽이 정본인지 아무도 모른다.
    q := public.admin_grant_voucher_quota(r.venue_id, r.amount);
  else
    q := coalesce((select voucher_quota from public.venues where id = r.venue_id), 0);
  end if;

  update public.voucher_credit_requests
     set status     = case when p_approve then 'approved' else 'rejected' end,
         admin_note = nullif(btrim(coalesce(p_admin_note, '')), ''),
         decided_at = now()
   where id = p_request_id;

  return q;                                       -- 증액 후 잔여 한도(화면이 되읽지 않아도 되게)
end $$;

revoke execute on function public.admin_decide_voucher_quota(uuid, boolean, text) from public, anon;
grant  execute on function public.admin_decide_voucher_quota(uuid, boolean, text) to authenticated, service_role;

-- ══ 리허설 기록 — 2026-09-18 라이브에서 `begin; … rollback;` 로 실행. 8/8 통과 ══
-- 검증 계정(역할·소유를 먼저 조회해서 골랐다):
--   업주(비운영자) 1a8c5117… = venue_owner, `[E2E] 자동테스트 전용 매장`(615376fa…) 소유
--   운영자          c8e3734d… = admin
--   일반 유저      fd14c2dc… = user (아무 매장도 소유하지 않음)
--
-- 음성 대조(막아야 하는 것) — 전부 거절됐다:
--   ✅ anon 실행권 request_voucher_quota        → 막혔다(has_function_privilege false)
--   ✅ anon 실행권 admin_decide_voucher_quota   → 막혔다
--   ✅ 일반 유저가 남의 매장으로 요청            → '매장 업주만 한도 증액을 요청할 수 있습니다'
--   ✅ 일반 유저가 승인 시도                     → '운영자만 가능합니다'
--   ✅ 같은 매장 pending 두 번째 요청            → '이미 검토 중인 요청이 있습니다'
--
-- 양성 대조(통과해야 하는 것 — 없으면 '아무도 못 쓰는 고장'을 음성만으로는 못 잡는다):
--   ✅ 업주가 자기 매장으로 250장 요청           → pending 1행 생성
--   ✅ 운영자 승인                               → voucher_quota 0 → 250, status='approved'
--   ✅ 운영자 반려                               → 한도 250 불변, status='rejected'
--
-- 롤백 확인(리허설이 라이브에 흔적을 남기지 않았다):
--   새 함수 2개 → 0개 · 테스트 요청 행 → 0행 · 테스트 매장 voucher_quota → 0 (원래 값)
--
-- ══ ROLLBACK ═════════════════════════════════════════════════════════════════
-- drop function if exists public.admin_decide_voucher_quota(uuid, boolean, text);
-- drop function if exists public.request_voucher_quota(uuid, integer, text);
-- (20260826b 의 봉쇄는 이 파일이 건드리지 않았으므로 그대로 남는다)
