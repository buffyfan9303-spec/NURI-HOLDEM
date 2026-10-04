-- 20261004e — 장부 '완납 → 미수' 는 비밀번호 없이(오너 2026-10-04 F4-02)
-- ⏳ 미적용 초안(store-team 2026-10-04, 브랜치 NURI/ledger-ticket-check-1004). 적용 판단은 리드 — critical-reviewer 반증 뒤.
-- 요구 원천: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\dummy-1004\RUN-REPORT.md#F4-02 · 오너 답 2026-10-04(리드 전달):
--   "기존에도 매장이용권 확인이 늦게 된 경우 미수로 되어 있다가 완납으로 바뀌는 경우도 있기 때문에 미수로 했다가 완납으로 바꾸는 것은
--    안되지만 완납에서 미수로 바꾸는 것은 비밀번호 없이 가능하게."
--   리드 해석: 완납 → 미수 = 비밀번호 없이 · 미수 → 완납 = 기존 제한 유지(열린 장부는 그대로 자유, 마감 뒤는 settle_unpaid_after_close 의 비밀번호).
--
-- 지금(라이브 20261001j, _ledger_buyins_client_guard md5 1baa2b4f37fa68251da1f8a7423e555e — 2026-10-04 select 실측):
--   세 겹(완납 매출 · 수납 완료 · 받을 가치) 중 하나라도 줄면 LEDGER_REDUCE_NEEDS_PASSWORD(42501) → 완납 → 미수도 비밀번호가 필요했다.
-- 이 파일이 바꾸는 것: 그 판정에 **한 가지 예외**만 더한다 — '줄어든 몫이 전부 미수로 간 수정'.
--   예외 조건 = 받을 가치 그대로(n[3] = o[3]) 그리고 이용권 몫이 늘지 않음(n[2] − n[1] ≤ o[2] − o[1]).
--   통과가 되는 것: 현금·카드·이체 완납 → 미수 · 티켓 완납 → 가불(미수) 티켓 · 분납의 일부를 미수로.
--   그대로 비밀번호: 금액 축소 · 가게지원 · 할인 자리 추가 · 미수 탕감 · 현금 → 이용권(+미수) — 받을 가치가 줄거나 이용권 몫이 는다.
--   그대로 잠금: 접수대 이용권 승인 전액 행의 결제수단·미수 표시(20261001j §3 — 이용권은 이미 받았다) · 마감된 장부(lb_update · ledger_is_closed).
--   클라이언트 쌍둥이: src/api/ledger.ts isRevenueReduction(같은 식). 한쪽만 고치면 화면은 통과로 보내는데 서버가 거절한다(또는 반대).
-- 나머지 본문은 라이브(20261001j §3)와 한 글자도 같다. create or replace → ACL 보존, REVOKE 재기재.
-- 마감 뒤 미수 → 완납(settle_unpaid_after_close)·update_ledger_buyin_reduce 는 건드리지 않는다.
--
-- 남은 위험(리드 판단용): 직원이 현금을 받고 완납으로 적은 뒤 비밀번호 없이 미수로 돌릴 수 있다(오너가 요청한 동작).
--   그 손님은 미수 명단·정산 '미수 손님'에 남아 업주가 볼 수 있다. 감사 기록(audit_log)은 이 트리거가 invoker 라 남기지 않는다 —
--   필요하면 별도 DEFINER 기록 함수가 필요하다(이번 범위 밖).
--
-- 적용 전 확인(쓰기 없음) — §0 이 자동으로 멈춘다:
--   select md5(prosrc) from pg_proc where oid = 'public._ledger_buyins_client_guard()'::regprocedure;  -- 기대 1baa2b4f37fa68251da1f8a7423e555e
-- 적용 후 기대 md5(prosrc): 335a3eb26e5af413c78017c8e8b9d39e (이 파일 본문 그대로, LF 기준 — 20261001j 본문 1baa2b4f 를 같은 방식으로 재현해 확인).
-- 리허설(라이브 한 방 트랜잭션, 끝 RAISE 로 전량 롤백): C:\Users\buffy\Documents\누리홀덤_영상분석_0930\ticket-check-1004\
--   node rehearse.mjs R0_harness.sql <이 파일> R1_tests.sql  → 'REHEARSAL_OK'   (store-team 은 실행하지 않았다 — 리드 지시)
--   음성 대조: 이 파일 없이 R0 + R1 → P1(완납 → 미수) 에서 CHECK FAIL 이 나야 한다.

-- §0 ── 라이브 정의 게이트 ────────────────────────────────────────────────────────────────
do $gate$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public._ledger_buyins_client_guard()'::regprocedure)
       is distinct from '1baa2b4f37fa68251da1f8a7423e555e' then
    raise exception 'ABORT: _ledger_buyins_client_guard 가 20261001j 본문(1baa2b4f)이 아니다 — 라이브 본문에서 다시 만들어라';
  end if;
end $gate$;

-- §1 ── 화면 가드: 완납 → 미수 예외 ──────────────────────────────────────────────────────────
create or replace function public._ledger_buyins_client_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_price numeric; v_discs jsonb; o bigint[]; n bigint[];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.request_id is not null then
      raise exception '바인 요청 연결은 서버만 설정할 수 있습니다' using errcode = '42501';
    end if;
    new.created_by := auth.uid();
    new.buyin_at := now();
    if coalesce(public.can_access_ledger(new.venue_id), false) then
      new := public._ledger_buyin_apply_amount_rule(new);
    end if;
  else
    if new.request_id is distinct from old.request_id
       or new.created_by is distinct from old.created_by
       or new.buyin_at is distinct from old.buyin_at
       or new.venue_id is distinct from old.venue_id
       or new.session_date is distinct from old.session_date then
      raise exception '기록자·기록 시각·매장·요청 연결은 바꿀 수 없습니다' using errcode = '42501';
    end if;
    if new.game_seq is distinct from old.game_seq then
      raise exception '기록의 게임 번호는 바꿀 수 없습니다' using errcode = '42501';
    end if;
    if new.player_name is distinct from old.player_name or new.entry_no is distinct from old.entry_no then
      raise exception '바인의 손님·순번은 직접 바꿀 수 없습니다 — 이름 변경은 플레이어 이름 수정으로 하세요' using errcode = '42501';
    end if;
    -- 20261001j(오너 10-01 '바꾸려면 취소 후 재승인') — 접수대 이용권 승인 행(전액·분납 모두 장수 k)은 장수·분납·할인을,
    --   전액 이용권 행은 결제수단·미수 표시까지 잠근다. 분납 행은 남은 금액의 수단·미수 전환만 바꿀 수 있다(합계는 금액 규칙이 검사).
    --   (critical-reviewer 10-01 F1: 장수·분납 두 칸만 보면 payment_method·is_unpaid·discount_index 만 바꾸는 요청이 통과했다)
    if old.request_id is not null and coalesce(old.ticket_count, 0) > 0
       and ((new.ticket_count, new.is_split, new.discount_index) is distinct from (old.ticket_count, old.is_split, old.discount_index)
            or (not coalesce(old.is_split, false)
                and (new.payment_method, new.is_unpaid) is distinct from (old.payment_method, old.is_unpaid))) then
      raise exception '이용권으로 승인한 바인은 결제 수단·할인·이용권 장수를 바꿀 수 없습니다(남은 금액의 결제 방법만 바꿀 수 있습니다). 바꾸려면 바인을 취소한 뒤 다시 승인하십시오.'
        using errcode = '42501';
    end if;
    if (new.payment_method, new.is_unpaid, new.is_split, new.cash_amount, new.card_amount, new.transfer_amount,
        new.ticket_count, new.unpaid_amount, new.discount_index)
       is distinct from
       (old.payment_method, old.is_unpaid, old.is_split, old.cash_amount, old.card_amount, old.transfer_amount,
        old.ticket_count, old.unpaid_amount, old.discount_index) then
      new := public._ledger_buyin_apply_amount_rule(new);
    end if;
    select s.buyin_amount, s.discounts into v_price, v_discs
      from public.ledger_sessions s
     where s.venue_id = old.venue_id and s.session_date = old.session_date and s.game_seq = old.game_seq;
    o := public._ledger_buyin_tiers(old, v_price, v_discs);
    n := public._ledger_buyin_tiers(new, v_price, v_discs);
    -- 20261004e(오너 10-04 F4-02): 줄어든 몫이 전부 미수로 간 수정(완납 → 미수)은 비밀번호 없이 — 받을 가치 그대로 · 이용권 몫 안 늚.
    if (n[1] < o[1] or n[2] < o[2] or n[3] < o[3])
       and not (n[3] = o[3] and n[2] - n[1] <= o[2] - o[1]) then
      raise exception '매출이 줄어드는 수정은 업주 취소 비밀번호가 필요합니다'
        using errcode = '42501', hint = 'LEDGER_REDUCE_NEEDS_PASSWORD';
    end if;
  end if;
  return new;
end $$;
revoke all on function public._ledger_buyins_client_guard() from public, anon, authenticated;

-- §2 ── 자가검사 — 하나라도 어긋나면 멈춘다(롤백) ────────────────────────────────────────────
do $check$
declare src text := (select prosrc from pg_proc where oid = 'public._ledger_buyins_client_guard()'::regprocedure);
begin
  if position('and not (n[3] = o[3] and n[2] - n[1] <= o[2] - o[1])' in src) = 0 then
    raise exception '20261004e: 완납 → 미수 예외식이 없다';
  end if;
  if position('LEDGER_REDUCE_NEEDS_PASSWORD' in src) = 0 or position('이용권으로 승인한 바인은' in src) = 0 then
    raise exception '20261004e: 감액 가드·이용권 승인 행 잠금이 사라졌다';
  end if;
  if has_function_privilege('anon', 'public._ledger_buyins_client_guard()', 'execute')
     or has_function_privilege('authenticated', 'public._ledger_buyins_client_guard()', 'execute') then
    raise exception '20261004e: 트리거 함수를 anon·authenticated 가 실행할 수 있다';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.ledger_buyins'::regclass
                  and tgname = 'ledger_buyins_client_guard' and not tgisinternal and tgenabled <> 'D') then
    raise exception '20261004e: ledger_buyins_client_guard 트리거가 없다(꺼져 있다)';
  end if;
end $check$;
