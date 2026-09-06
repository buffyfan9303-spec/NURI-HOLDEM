-- ============================================================================
-- 출석 QR 에 현장 증명이 없어 참여권이 집에서 만들어지던 것 (오너 승인 2026-09-07 — 권장안 A+B)
--
-- 무엇이 문제였나
--   이벤트 참여권의 지급 조건이 "checkins 행이 생겼는가" 하나뿐인데, 그 행을 만드는 문이 둘이고
--   **둘 다 현장 증빙이 없었다.**
--     문① 출석 QR — 내용이 `?checkin=<매장UUID>` 인 영구 UUID 이고, 승인 매장 목록은 공개 조회된다.
--          check_in 의 중복 방지는 '매장별 4시간'이라, 매장 수만큼 연속 호출이 가능하다.
--          실측(롤백 트랜잭션): 승인매장 2곳 → 참여권 2장 · 활동점수 17 · 매장 CRM 오염 2건.
--          4시간 창이 하루 6번이므로 1인 하루 12장, 카드 100장이면 한 사람이 8일이면 전부 가져간다.
--     문② 이용권 '바로 전송(사용)' — redeem_my_voucher(uuid) 본문에 매장 검증이 한 줄도 없다
--          (형제 함수 _by_qr 은 `if v_venue <> p_venue_id then raise`, _by_phone 은 업주 전화번호를 대조).
--          사용 처리 → 트리거 _voucher_used_checkin 이 checkins 행 생성 → 참여권 1장.
--          경품이 **매장이용권**이라 1등(10장) 당첨자는 집에서 참여권 10장을 더 만들 수 있었다(자기증식).
--   앱 주석(QrScanModal.tsx)이 "버튼 즉시 체크인은 집에서도 출석 도장이 찍히는 구멍(오너 리포트 2026-08-27)"
--   이라며 한 번 닫았다고 기록한 그 구멍이, 이용권 쪽 문으로 다시 열려 있었다.
--
-- A) 문② 폐쇄 — 무증빙 사용 경로의 실행 권한 회수
--   UI 버튼은 같은 커밋에서 내렸지만, 그것만으로는 콘솔에서 그대로 부를 수 있다. 서버에서 함께 막는다.
--   남는 경로는 redeem_my_voucher_by_qr(매장 QR) · _by_phone(업주 전화번호) 둘뿐이고 둘 다 증빙이 있다.
--   ⚠ REVOKE 는 FROM PUBLIC 까지 해야 실제로 막힌다(nuri-migration §1). DB 내부 호출자는 0곳으로 확인했다.
--   postgres·service_role 은 남긴다 — 관리자·서버 경로가 쓴다.
--
-- B) 문① 완화 — 참여권을 '매장별 오늘 첫 출석'에만 지급
--   출석 자체(점수·연속출석·CRM)는 손대지 않는다. 참여권만 하루 한 번으로 묶는다.
--   실손님은 매장에 도착해 한 번 찍으므로 체감이 같고(4시간 규칙상 하루 여러 번 찍을 이유가 없다),
--   자동화는 하루 12장 → 2장(승인 매장 수)으로 떨어진다.
--   ⚠ 근본 해결(QR 회전 토큰)은 아니다 — 매장 수에 비례해 커지는 성질은 남는다. 별도 결정 대기.
--
-- 멱등: CREATE OR REPLACE + REVOKE 재실행 안전.
-- ============================================================================

-- ── A) 무증빙 사용 경로 회수 ─────────────────────────────────────────────────
revoke execute on function public.redeem_my_voucher(uuid) from public, anon, authenticated;
grant  execute on function public.redeem_my_voucher(uuid) to service_role;

comment on function public.redeem_my_voucher(uuid) is
  '⚠ 무증빙 사용 경로 — 매장을 검증하지 않는다. 2026-09-07 부터 authenticated 실행 회수(20260907d). 손님 경로는 _by_qr·_by_phone 만.';

-- ── B) 참여권은 '매장별 오늘 첫 출석'에만 ────────────────────────────────────
create or replace function public._grant_event_tickets()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- 그 매장에 **오늘 이미 출석 기록이 있으면** 참여권을 주지 않는다(KST 기준, 방금 들어온 행은 제외).
  -- 출석 자체는 그대로 기록된다 — 점수·연속출석·CRM 은 check_in 이 따로 처리한다.
  if exists (
    select 1 from public.checkins c
     where c.user_id = new.user_id
       and c.venue_id = new.venue_id
       and c.id <> new.id
       and (c.created_at at time zone 'Asia/Seoul')::date
           = (new.created_at at time zone 'Asia/Seoul')::date
  ) then
    return new;
  end if;

  insert into public.event_tickets(campaign_id, user_id, checkin_id)
  select c.id, new.user_id, new.id
    from public.event_campaigns c
   where c.status = 'live'
     and (c.ticket_venue_id is null or c.ticket_venue_id = new.venue_id)
     and (c.starts_at is null or now() >= c.starts_at)
     and (c.ends_at is null or now() <= c.ends_at)
     and exists (
       select 1 from public.event_cards ec
        where ec.campaign_id = c.id and ec.opened_at is null
     )
  on conflict do nothing;
  return new;
exception when others then
  -- 이벤트 때문에 출석이 실패하면 안 된다 — 지급 실패는 삼키고 출석은 살린다(종전 동작 유지).
  return new;
end $$;

notify pgrst, 'reload schema';

-- ROLLBACK
--   grant execute on function public.redeem_my_voucher(uuid) to authenticated;
--   (그리고 _grant_event_tickets 를 '오늘 첫 출석' 가드 없는 버전으로 되돌린다)
