-- ⏳ 초안(미적용) — store-team 2026-10-01. **적용 금지**(리드가 판단·적용: MCP execute_sql, 이 파일 §0~§2 본문 그대로 한 번에).
-- 20261001j — 'T' = 차감된 이용권 장수 + N 미설정 게임 = 참가비 ÷ 1만 장.
--   요구 원천: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\audit-store-1001.md#S-01·S-02 ·
--             C:\Users\buffy\Documents\누리홀덤_영상분석_0930\fable-money-1001.md#판정①·판정③·불변식 1·2·5 ·
--             오너 결정 2026-10-01(리드 전달): ① N 미설정 게임은 이용권으로 낼 때 참가비 ÷ 1만 장(10만 = 10장)
--                                              ② N=10·참가비 12만 게임은 10장이면 완납(min 규칙 확정).
--
-- 지금(라이브 20260930i, approve md5 de5cd99d · rule md5 35e7504a):
--   · 전액 이용권 행(바인 payment_method='ticket' · 애드온 addon_method='ticket')에 **장수가 남지 않는다**(ticket_count 0 · addon_ticket_count 0).
--     장수는 ledger_buyin_requests.bundle_request_id 묶음에만 있어, 화면은 T 를 (참가비 − 할인) ÷ 1만 으로 거꾸로 만든다
--     → 12만·N=10 게임 10장이면 장부 12T 인데 지갑에서 사라진 건 10장(S-01).
--   · N 미설정(·N=1) 게임은 바인·애드온 모두 1장 = 참가 1회(결정 ②) → 10만 바인 1장이 장부 10T(S-02).
--
-- 이 파일이 바꾸는 것(네 함수 · create or replace → ACL 보존, REVOKE/GRANT 재기재 · 스키마·테이블·트리거 정의 변경 없음)
--   §1 _ledger_buyin_addon_rule(트리거 함수) — 전액 이용권 애드온이 장수 k 를 가질 수 있게:
--      · 'ticket' 으로 **바꾸는** 분납 애드온만 막는다(예전: 몫 > 0 인 'ticket' 행 전부 거절 → k 기록 불가).
--      · 몫 × 1만 검사: 분납 < 금액(그대로) · 전액 이용권 ≤ 금액(새로).
--      · 전액 이용권(k > 0)을 화면이 다른 수단으로 바꾸면 k := 0 → 복원 트리거(§D, 라이브 그대로)가 이용권을 전부 되돌린다(예전 동작 유지).
--   §2 approve_buyin_request(같은 10인자 서명)
--      · 바인 N 미설정(·N=1): 필요 장수 = floor((참가비 − 할인) ÷ 1만) — 상한 없음, 만원 미만 나머지·모자람은 기존 분납 경로(VOUCHER_SHORT).
--        참가비 0원 게임만 예전처럼 1장. 금액 1만 미만이면 23514(N 설정 게임과 같은 규칙).
--      · 바인 N ≥ 2: 그대로(min(N, floor(금액 ÷ 1만)), N장이면 남은 금액 없음 = 오너 ② 확정).
--      · 애드온: N 설정 여부와 무관하게 floor(금액 ÷ 1만) 장(오너 ①의 1장 = 1만 복원을 애드온에도 같은 규칙으로 — 리드 확인 요망, 보고서 §질문).
--      · 남은 금액이 없을 때(전액 이용권) 행에 k 를 남긴다: 바인 ticket_count = k · 애드온 addon_ticket_count = k.
--        돈은 안 바뀐다 — 분납 아닌 ticket 행은 _ledger_buyin_tiers·buyinFinance 가 참가비 − 할인으로 세고 ticket_count 를 읽지 않는다.
--        라이브 §E(client_guard)가 이미 'request_id 있고 ticket_count > 0' 행의 장수·분납 여부를 화면에서 잠근다 → 이제 전액 행도 잠긴다.
--   §3 _ledger_buyins_client_guard(트리거 함수) — 본문은 라이브(20260930i §E)와 같고 장수 잠금 오류 문구만 접수대용 합니다체로(오너 10-01 ①).
--   §4 update_ledger_buyin_reduce(비밀번호 감액 RPC) — 접수대 이용권 승인 행(request_id 있고 ticket_count > 0)의 ticket_count·is_split 을
--      바꾸려 하면 42501(오너 10-01 ②). 금액 감액(남은 금액 수단·미수 전환·현금 행 할인 등)은 그대로. 나머지 본문은 라이브(md5 a74bbdea)와 같다.
--   클라이언트(같은 브랜치 NURI/money-1001): buyinFinance ticket 분기 T = requestId && ticketCount > 0 ? ticketCount : net ÷ 1만,
--      addonFinance.ticketT = 전액 이용권이면 addon_ticket_count(없으면 금액 ÷ 1만), ticketUsedT = 바인 장수 + 애드온 장수.
--      클라를 먼저 배포해도 안전하다(서버 적용 전 행은 장수 0 → 예전 식). 서버를 먼저 적용해도 옛 클라는 ticket_count 를 안 읽어 예전 표시 그대로.
--
-- 바뀌는 동작(오너 10-01 확정)
--   B1 전액 이용권으로 승인된 바인을 화면에서 현금 등으로 고치거나 할인을 바꾸면 42501 — '취소 후 다시 승인'
--      (upsertBuyin 이 ticket_count 0 을 보내기 때문). 예전엔 통과해 이용권은 쓰인 채 행만 현금이 됐다(20260930i 머리말 '남은 틈' 첫 항목).
--      비밀번호 감액 RPC 도 같은 잠금(§4) — 20260930i 머리말 '남은 틈' 둘째 항목을 닫는다.
--   B2 N 미설정 게임의 이용권 바인은 1장 → 참가비 ÷ 1만 장, 애드온은 금액 ÷ 1만 장(09-30 오너 결정과 같다 — 리드 10-01 확인).
--
-- 적용 전 확인(쓰기 없음) — §0 이 자동으로 멈춘다:
--   select proname, md5(prosrc) from pg_proc where proname in ('approve_buyin_request','_ledger_buyin_addon_rule','_ledger_buyins_client_guard','update_ledger_buyin_reduce');
--   → approve de5cd99da0c1aadb34e5535bcb7705da · rule 35e7504abaae6d7c62ce93f3eaebdfde · client_guard eee44d4d0c9c53e9fda390227d5f30c2 ·
--     reduce a74bbdeaaeea76735902521a400a720e (2026-10-01 실측). 다르면 대조 뒤 적용.
--   라이브 노출(2026-10-01 select): 이용권 승인 바인 0행 · voucherPerEntry 포스터 0건 → 소급 대상 없음.
--
-- 리허설: 보고서 C:\Users\buffy\Documents\누리홀덤_영상분석_0930\money-fix-report.md §리허설(라이브 한 방 트랜잭션 + 끝 RAISE 로 전량 롤백).
-- 적용 후 기대 md5(prosrc): approve f82545490dcd5a67946577e37da9d843 · rule 80bd1d70abf215513bebb2f5c9690880 · client_guard 259c8f94d24540c96056c2a189b3f0de · reduce 17c9cb58dc4f57adeb6e4d12112ee403 (이 파일 본문 그대로, LF 기준).

-- §0 ── 라이브 정의 게이트 ──────────────────────────────────────────────────────────────
do $gate$
begin
  if (select md5(prosrc) from pg_proc where proname = 'approve_buyin_request' and pronamespace = 'public'::regnamespace)
       is distinct from 'de5cd99da0c1aadb34e5535bcb7705da'
     or (select md5(prosrc) from pg_proc where proname = '_ledger_buyin_addon_rule' and pronamespace = 'public'::regnamespace)
       is distinct from '35e7504abaae6d7c62ce93f3eaebdfde' then
    raise exception 'ABORT: 라이브 approve_buyin_request·_ledger_buyin_addon_rule 이 20260930i 본문(de5cd99d·35e7504a)과 다르다 — 대조 뒤 적용';
  end if;
  if (select md5(prosrc) from pg_proc where proname = '_ledger_buyins_client_guard' and pronamespace = 'public'::regnamespace)
       is distinct from 'eee44d4d0c9c53e9fda390227d5f30c2' then
    raise exception 'ABORT: _ledger_buyins_client_guard(§E 장수 잠금)가 20260930i 본문(eee44d4d)이 아니다';
  end if;
  if (select md5(prosrc) from pg_proc where proname = 'update_ledger_buyin_reduce' and pronamespace = 'public'::regnamespace)
       is distinct from 'a74bbdeaaeea76735902521a400a720e' then
    raise exception 'ABORT: update_ledger_buyin_reduce 가 라이브 기준 본문(a74bbdea)이 아니다';
  end if;
end $gate$;

-- §1 ── 애드온 금액 규칙(전액 이용권도 장수를 가진다) ─────────────────────────────────────────
create or replace function public._ledger_buyin_addon_rule() returns trigger
language plpgsql set search_path to 'public', 'pg_temp' as $function$
declare v_is_addon boolean; v_price integer;
begin
  if new.addon_method is null then
    new.addon_unpaid := false;
    new.addon_amount := 0;
    new.addon_ticket_count := 0;
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.addon_method is not distinct from old.addon_method
     and new.addon_unpaid is not distinct from old.addon_unpaid then
    new.addon_amount := old.addon_amount;
  else
    select s.is_addon, s.addon_amount into v_is_addon, v_price
      from public.ledger_sessions s
     where s.venue_id = new.venue_id and s.session_date = new.session_date and s.game_seq = new.game_seq;
    if not found then
      raise exception '이 게임의 장부가 아직 열려 있지 않습니다 — 장부에서 게임을 먼저 여세요'
        using errcode = '23514', hint = 'LEDGER_SESSION_MISSING';
    end if;
    if not coalesce(v_is_addon, false) then
      raise exception '애드온 게임이 아닙니다 — 세션 정보에서 애드온 게임을 켜 주세요' using errcode = '23514';
    end if;
    if coalesce(v_price, 0) <= 0 then
      raise exception '애드온 가격이 없습니다 — 세션 정보에서 애드온 가격을 넣어 주세요' using errcode = '23514';
    end if;
    new.addon_amount := v_price;
  end if;
  -- 20261001j — 전액 이용권 애드온(addon_method='ticket')도 서버가 묶은 장수 k 를 addon_ticket_count 에 남긴다(T = 장수).
  --   ① 전액 이용권 애드온을 화면이 다른 수단으로 바꾸면(이용권 → 현금 등) 장수도 0 — 아래 복원 트리거가 이용권을 전부 되돌린다(예전 동작).
  if tg_op = 'UPDATE' and old.addon_method = 'ticket' and new.addon_method is distinct from 'ticket'
     and coalesce(old.addon_ticket_count, 0) > 0 and new.addon_ticket_count is not distinct from old.addon_ticket_count then
    new.addon_ticket_count := 0;
  end if;
  --   ② 분납 애드온(몫 > 0, 수단 현금 등)을 'ticket' 으로 **바꾸는 것**만 막는다. 이미 전액 이용권인 행의 장수 기록은 허용.
  if new.addon_method = 'ticket' and coalesce(new.addon_ticket_count, 0) > 0
     and (tg_op = 'INSERT' or old.addon_method is distinct from 'ticket') then
    raise exception '이용권 분납 애드온은 티켓으로 바꿀 수 없습니다 — 남은 금액의 수단만 바꾸거나, 애드온을 지우고 다시 승인하세요'
      using errcode = '23514';
  end if;
  --   ③ 몫 × 1만 검사: 분납은 금액보다 작아야(남은 금액 > 0), 전액 이용권은 금액을 넘지 않아야 한다.
  if coalesce(new.addon_ticket_count, 0) > 0
     and (new.addon_ticket_count::int * 10000 > new.addon_amount
          or (new.addon_method is distinct from 'ticket' and new.addon_ticket_count::int * 10000 >= new.addon_amount)) then
    raise exception '애드온 이용권 몫(%원)이 애드온 금액(%원) 이상입니다', new.addon_ticket_count::int * 10000, new.addon_amount
      using errcode = '23514';
  end if;
  return new;
end $function$;
revoke execute on function public._ledger_buyin_addon_rule() from public, anon, authenticated;

-- §2 ── 승인(N 미설정 = 참가비 ÷ 1만 장 · 전액 이용권 행에 장수 k) ─────────────────────────────
create or replace function public.approve_buyin_request(
  p_request_id uuid, p_game_seq smallint default 1, p_record_buyin boolean default false, p_pay_method text default 'cash'::text,
  p_split boolean default false, p_cash integer default 0, p_card integer default 0, p_transfer integer default 0,
  p_discount_index integer default 0, p_voucher_use text default 'buyin'::text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  r ledger_buyin_requests;
  v_sort int; v_entry int;
  v_amt int; v_discounts jsonb;
  v_disc int := 0; v_idx int := 0; v_unit int; v_net int;
  v_pm text := lower(coalesce(p_pay_method, 'cash'));
  v_has_session boolean := false;
  v_sum int;
  v_use text := lower(coalesce(p_voucher_use, 'buyin'));
  v_target uuid;
  v_target_addon text;
  v_sched uuid;
  v_n int := 1;
  v_n_set boolean := false;
  v_need int := 1;
  v_bundle uuid[] := '{}'::uuid[];
  v_got int := 0;
  v_row_idx int;
  v_row_disc int := 0;
  v_addon_amt int;
  v_bid uuid;
  v_k int;
  v_rem int;
  v_row ledger_buyins;
  v_pm_short boolean := false;
  v_val int;
begin
  select * into r from ledger_buyin_requests where id = p_request_id for update;
  if not found then raise exception '요청을 찾을 수 없습니다'; end if;
  if not coalesce(can_access_ledger(r.venue_id), false) then raise exception '권한이 없습니다'; end if;
  if r.status is distinct from 'pending' then
    -- W-01 — 다른 요청의 바인 1회(또는 애드온)에 이미 묶여 승인된 장. 일괄 승인이 뒤따라 불러도 성공으로 끝낸다.
    if r.status = 'approved' and r.bundle_request_id is not null then return; end if;
    raise exception '이미 처리된 요청입니다';
  end if;
  if v_use not in ('buyin', 'addon') then
    raise exception '이용권 용도가 올바르지 않습니다' using errcode = '22023';
  end if;
  if v_use = 'addon' and r.voucher_id is null then
    raise exception '이용권 사용 요청만 애드온으로 승인할 수 있습니다' using errcode = '22023';
  end if;
  if public.ledger_is_closed(r.venue_id, r.session_date, p_game_seq) then
    raise exception '마감된 장부입니다 — 다른 게임을 선택하거나 마감을 해제하세요';
  end if;

  select coalesce(buyin_amount, 0), coalesce(discounts, '[]'::jsonb), schedule_id
    into v_amt, v_discounts, v_sched
    from ledger_sessions
   where venue_id = r.venue_id and session_date = r.session_date and game_seq = p_game_seq;
  v_has_session := FOUND;
  v_amt := coalesce(v_amt, 0); v_discounts := coalesce(v_discounts, '[]'::jsonb);

  if (p_record_buyin or r.voucher_id is not null) and not v_has_session then
    raise exception '이 게임의 장부가 아직 열려 있지 않습니다 — 장부에서 게임을 먼저 여세요';
  end if;
  if p_record_buyin and not p_split and v_amt <= 0 then
    raise exception '참가비가 0원입니다 — 장부에서 참가비를 먼저 입력하세요';
  end if;

  -- W-01 — 참가 1회 = 이용권 N장. 서버가 같은 매장의 연결 포스터에서 읽는다(화면 값 불신). 음 아닌 정수면 1~100, 그 밖은 1.
  --   v_n_set = 포스터 N ≥ 2(리드 결정: N=1 명시는 미설정과 같다 — 1장 = 참가 1회 가치) — 20261001j 부터 애드온 금액 규칙은 N 과 무관(v_n_set 은 참고용으로만 남는다).
  if r.voucher_id is not null and v_sched is not null then
    select case when (sc.buy_in ->> 'voucherPerEntry') ~ '^[0-9]+$'
                then least(100, greatest(1, (sc.buy_in ->> 'voucherPerEntry')::numeric))::int else 1 end,
           case when (sc.buy_in ->> 'voucherPerEntry') ~ '^[0-9]+$' then (sc.buy_in ->> 'voucherPerEntry')::numeric >= 2 else false end
      into v_n, v_n_set
      from schedules sc where sc.id = v_sched and sc.venue_id = r.venue_id;
    v_n := coalesce(v_n, 1); v_n_set := coalesce(v_n_set, false);
  end if;

  if p_discount_index between 1 and 5 and jsonb_typeof(v_discounts) = 'array' then
    v_disc := coalesce((v_discounts -> (p_discount_index - 1) ->> 'amount')::int, 0);
    if v_disc > 0 then v_idx := p_discount_index; v_disc := least(v_disc, v_amt); else v_disc := 0; end if;
  end if;

  -- 이용권 요청의 분납 금액은 '남은 금액' 과 맞춰 아래(분납 분기)에서 검사한다 — 여기는 현금 요청의 전액 분납만.
  if p_record_buyin and p_split and r.voucher_id is null then
    v_sum := coalesce(p_cash,0) + coalesce(p_card,0) + coalesce(p_transfer,0);
    if v_sum is distinct from greatest(0, v_amt - v_disc) then
      raise exception '분납 합계(%원)가 참가비(%원)와 다릅니다', v_sum, greatest(0, v_amt - v_disc);
    end if;
  end if;

  if not exists (select 1 from ledger_players lp
                  where lp.venue_id = r.venue_id and lp.session_date = r.session_date
                    and lp.game_seq = p_game_seq and lp.name = r.player_name) then
    select coalesce(max(sort_order) + 1, 0) into v_sort
      from ledger_players where venue_id = r.venue_id and session_date = r.session_date and game_seq = p_game_seq;
    insert into ledger_players (venue_id, session_date, game_seq, name, sort_order, created_by)
    values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_sort, auth.uid());
  end if;

  if r.voucher_id is not null then
    -- 이용권 요청에서 p_record_buyin 은 '모자라면 남은 금액을 p_pay_method(또는 p_split 금액)로 받는다' 는 뜻이다.
    v_pm_short := p_record_buyin;
    p_record_buyin := false;
    if v_use = 'addon' then
      select b.id, b.addon_method into v_target, v_target_addon
        from ledger_buyins b
       where b.venue_id = r.venue_id and b.session_date = r.session_date and b.game_seq = p_game_seq
         and b.player_name = r.player_name
       order by b.entry_no desc
       limit 1
       for update;
      if v_target is null then
        raise exception '이 손님의 바인 기록이 없어 애드온을 붙일 수 없습니다 — 먼저 바인을 기록하거나 바인으로 승인하세요';
      end if;
      if v_target_addon is not null then
        raise exception '이 손님의 최근 바인에 이미 애드온이 있습니다 — 새 바인을 먼저 기록하세요';
      end if;
      update ledger_buyins set addon_method = 'ticket', addon_unpaid = false, addon_request_id = r.id where id = v_target
        returning addon_amount into v_addon_amt;
      -- ④ 애드온 이용권 = 애드온 금액(트리거가 세션 가격으로 스냅샷한 값)의 **만원 단위**만(floor). 만원 미만 나머지는 분납.
      --    20261001j(오너 10-01 ①: N 미설정 게임 = 참가비 ÷ 1만 장 — 1장 = 1만 복원) — N 설정 여부와 무관하게 모든 게임.
      v_val := greatest(0, coalesce(v_addon_amt, 0));
      v_need := greatest(1, floor(v_val / 10000.0))::int;
    else
      select coalesce(max(entry_no), 0) + 1 into v_entry
        from ledger_buyins where venue_id = r.venue_id and session_date = r.session_date
                             and game_seq = p_game_seq and player_name = r.player_name;
      insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method, discount_index, created_by, request_id)
      values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, 'ticket', v_idx, auth.uid(), r.id)
      returning id, discount_index into v_bid, v_row_idx;
      -- ③ 할인 바인은 할인만큼 덜 받는다. 할인 종류 규칙은 트리거가 확정한 행의 discount_index 를 쓴다(한 곳).
      --    할인액은 _ledger_buyin_apply_amount_rule 과 같은 식 — 장부 T(참가비−할인)와 같은 수.
      if coalesce(v_row_idx, 0) > 0 and jsonb_typeof(v_discounts) = 'array' and jsonb_array_length(v_discounts) >= v_row_idx then
        v_row_disc := least(v_amt, greatest(0, round(coalesce((v_discounts -> (v_row_idx - 1) ->> 'amount')::numeric, 0))))::int;
      end if;
      -- ③ 이용권은 **만원 단위로만** 받는다(리드 결정 2026-09-30): 필요 장수 = floor((참가비 − 할인) / 1만), 만원 미만 나머지는 분납.
      --    단 포스터 약속 'N장 = 참가 1회' 가 상한이다(critical N7, 리드 결정): 필요 장수 = min(N, floor(금액 / 1만)) —
      --    12만·N=10 게임은 10장이면 분납 없이 바인 1회(장부는 기존 정의대로 참가비 기준). N ≤ 1(미설정·N=1)은 바로 아래 20261001j 분기(참가비 ÷ 1만 장).
      if v_n > 1 and v_amt > 0 then
        v_val := greatest(0, v_amt - v_row_disc);
        v_need := greatest(1, least(v_n, floor(v_val / 10000.0)::int));
      elsif v_amt > 0 then
        -- 20261001j(오너 10-01 ①) — N 미설정(·N=1) 게임은 참가비 ÷ 1만 장(할인이면 할인만큼 덜 받음, 만원 단위, 나머지 분납).
        --   포스터 약속 N 이 없으니 상한도 없다 — 금액 그대로(10만 = 10장, 3만 할인 = 7장).
        v_val := greatest(0, v_amt - v_row_disc);
        v_need := greatest(1, floor(v_val / 10000.0)::int);
      else
        v_need := v_n;   -- 참가비 0원 게임: 예전처럼 1장
      end if;
    end if;

    if v_val is not null and v_val < 10000 then
      raise exception '이 %은 금액(%원)이 1만 원보다 작아 이용권으로 받을 수 없습니다 — 요청을 거절하고 다른 결제로 받으세요',
        case when v_use = 'addon' then '애드온' else '바인' end, v_val using errcode = '23514';
    end if;
    if v_need > 1 then
      if r.user_id is null then
        raise exception '이 요청은 손님 계정이 없어 이용권을 묶을 수 없습니다' using errcode = '23514';
      end if;
      -- 필요한 장수까지만 잠근다 — 더 쓴 장은 대기로 남는다(과다 차감 없음).
      select coalesce(array_agg(x.id order by x.created_at, x.id), '{}'::uuid[]) into v_bundle
        from (select q.id, q.created_at
                from ledger_buyin_requests q
               where q.venue_id = r.venue_id and q.session_date = r.session_date and q.user_id = r.user_id
                 and q.status = 'pending' and q.voucher_id is not null and q.id <> r.id
                 and (q.requested_game_seq is null or q.requested_game_seq = p_game_seq)
               order by q.created_at, q.id
               limit v_need - 1
               for update) x;
      v_got := coalesce(array_length(v_bundle, 1), 0);
    end if;
    v_k := v_got + 1;
    -- 남은 금액 = 금액 − k × 1만(금액 기준 게임에서만). 모자란 장수든 만원 미만 나머지든 같은 분납 경로로 받는다.
    v_rem := case when v_val is null then 0
                  when v_use = 'buyin' and v_n > 1 and v_k >= v_n then 0   -- 포스터 약속(N ≥ 2): N장을 다 받으면 참가 1회(오너 10-01 ② min 규칙 확정)
                  else v_val - v_k * 10000 end;
    if v_rem > 0 then
      if not v_pm_short then
        raise exception '남은 금액이 있습니다 — 이 %은 이용권 %장까지 받습니다(만원 단위). 받은 사용 요청 %장(%원) · 남은 %원을 현금·카드·계좌·미수로 받아 승인하세요',
          case when v_use = 'addon' then '애드온' else '바인' end, v_need, v_k, v_k * 10000, v_rem
          using errcode = '23514', hint = 'VOUCHER_SHORT',
                detail = json_build_object('need', v_need, 'have', v_k, 'ticketWon', v_k * 10000, 'remainder', v_rem, 'use', v_use)::text;
      end if;
      if v_pm not in ('cash', 'card', 'transfer', 'unpaid') then
        raise exception '남은 금액의 결제 방법이 올바르지 않습니다' using errcode = '22023';
      end if;
      if v_use = 'addon' then
        if p_split then
          raise exception '애드온의 남은 금액은 한 가지 방법으로 받습니다' using errcode = '22023';
        end if;
        -- 애드온 = addon_method(남은 금액 수단) + addon_ticket_count(이용권 k장). 미수는 addon_unpaid.
        update ledger_buyins
           set addon_method = case when v_pm = 'unpaid' then 'cash' else v_pm end,
               addon_unpaid = (v_pm = 'unpaid'), addon_ticket_count = v_k
         where id = v_target;
      else
        -- 바인 = 기존 분납 행(is_split · ticket_count(T) · cash/card/transfer · unpaid_amount). 합계는 금액 규칙 함수가 검사한다.
        select * into v_row from ledger_buyins where id = v_bid;
        v_row.is_split := true;
        v_row.ticket_count := v_k;
        v_row.cash_amount := 0; v_row.card_amount := 0; v_row.transfer_amount := 0; v_row.unpaid_amount := 0;
        if p_split then
          v_row.cash_amount := coalesce(p_cash, 0); v_row.card_amount := coalesce(p_card, 0); v_row.transfer_amount := coalesce(p_transfer, 0);
        elsif v_pm = 'unpaid' then v_row.unpaid_amount := v_rem;
        elsif v_pm = 'card' then v_row.card_amount := v_rem;
        elsif v_pm = 'transfer' then v_row.transfer_amount := v_rem;
        else v_row.cash_amount := v_rem;
        end if;
        v_row.is_unpaid := v_row.unpaid_amount > 0;
        -- 대표 수단 = ledger.ts upsertBuyinSplit 과 같은 규칙(돈이 0 이고 이용권뿐이면 ticket).
        v_row.payment_method := case
          when v_row.cash_amount + v_row.card_amount + v_row.transfer_amount = 0 then 'ticket'
          when v_row.card_amount >= v_row.cash_amount and v_row.card_amount >= v_row.transfer_amount and v_row.card_amount > 0 then 'card'
          when v_row.transfer_amount > v_row.cash_amount and v_row.transfer_amount > 0 then 'transfer'
          else 'cash' end;
        v_row := public._ledger_buyin_apply_amount_rule(v_row);   -- 합계 ≠ 참가비−할인이면 23514
        update ledger_buyins
           set is_split = true, ticket_count = v_row.ticket_count, cash_amount = v_row.cash_amount, card_amount = v_row.card_amount,
               transfer_amount = v_row.transfer_amount, unpaid_amount = v_row.unpaid_amount, is_unpaid = v_row.is_unpaid,
               payment_method = v_row.payment_method
         where id = v_bid;
      end if;
    end if;
    -- 20261001j(Fable 판정 ① T = 차감된 장수) — 전액 이용권 행에도 묶인 장수 k 를 남긴다. 장부·정산·대시보드의 T 가 이 값을 읽는다.
    --   돈은 그대로다: 분납 아닌 ticket 행의 금액은 _ledger_buyin_tiers·buyinFinance 가 참가비 − 할인으로 세고 ticket_count 를 보지 않는다.
    --   §E(client_guard)가 request_id 있고 ticket_count > 0 인 행의 장수·분납 여부를 화면에서 잠근다.
    if v_rem <= 0 then
      if v_use = 'addon' then
        update ledger_buyins set addon_ticket_count = v_k where id = v_target;
      else
        update ledger_buyins set ticket_count = v_k where id = v_bid;
      end if;
    end if;
    if v_got > 0 then
      -- 묶인 장들: 같은 바인 1회(또는 애드온 1회)의 몫. 행을 만들지 않는다(취소·제거하면 _restore_voucher_for_request 가 함께 되돌린다).
      update ledger_buyin_requests
         set status = 'approved', game_seq = p_game_seq, resolved_at = now(), resolved_by = auth.uid(), bundle_request_id = r.id
       where id = any(v_bundle) and status = 'pending';
      get diagnostics v_sum = row_count;
      if v_sum is distinct from v_got then raise exception '이용권 묶음이 바뀌었습니다 — 새로고침 후 다시 승인하세요'; end if;
      update store_vouchers set used_for = v_use
       where id in (select q.voucher_id from ledger_buyin_requests q where q.id = any(v_bundle) and q.voucher_id is not null);
    end if;
    update store_vouchers set used_for = v_use where id = r.voucher_id;
  end if;

  if p_record_buyin then
    select coalesce(max(entry_no), 0) + 1 into v_entry
      from ledger_buyins where venue_id = r.venue_id and session_date = r.session_date
                           and game_seq = p_game_seq and player_name = r.player_name;
    if p_split then
      v_pm := case when coalesce(p_card,0) >= coalesce(p_cash,0) and coalesce(p_card,0) >= coalesce(p_transfer,0) and coalesce(p_card,0) > 0 then 'card'
                   when coalesce(p_transfer,0) > coalesce(p_cash,0) and coalesce(p_transfer,0) > 0 then 'transfer'
                   else 'cash' end;
      insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method, is_split,
                                 cash_amount, card_amount, transfer_amount, discount_index, created_by, request_id)
      values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, v_pm, true,
              coalesce(p_cash,0), coalesce(p_card,0), coalesce(p_transfer,0), v_idx, auth.uid(), r.id);
    else
      if v_pm not in ('cash','card','transfer') then v_pm := 'cash'; end if;
      v_unit := v_amt;
      v_net  := greatest(0, v_unit - v_disc);
      insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method,
                                 cash_amount, card_amount, transfer_amount, discount_index, created_by, request_id)
      values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, v_pm,
              case when v_pm = 'cash'     then v_net else 0 end,
              case when v_pm = 'card'     then v_net else 0 end,
              case when v_pm = 'transfer' then v_net else 0 end,
              v_idx, auth.uid(), r.id);
    end if;
  end if;

  update ledger_buyin_requests
     set status = 'approved', game_seq = p_game_seq, resolved_at = now(), resolved_by = auth.uid()
   where id = p_request_id and status = 'pending';
  if not found then raise exception '이미 처리된 요청입니다'; end if;
end;
$function$;

revoke all on function public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer, text) from public, anon;
grant execute on function public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer, text) to authenticated, service_role;

-- §3 ── 화면 가드(장수 잠금 문구만 접수대용으로) ─────────────────────────────────────────────
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
    -- 20261001j(오너 10-01) — 전액 이용권 승인 행도 장수 k 를 가지므로 이 잠금에 든다. 현금·할인으로 바꾸려면 '취소 후 다시 승인'.
    if old.request_id is not null and coalesce(old.ticket_count, 0) > 0
       and (new.ticket_count is distinct from old.ticket_count or new.is_split is distinct from old.is_split) then
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
    if n[1] < o[1] or n[2] < o[2] or n[3] < o[3] then
      raise exception '매출이 줄어드는 수정은 업주 취소 비밀번호가 필요합니다'
        using errcode = '42501', hint = 'LEDGER_REDUCE_NEEDS_PASSWORD';
    end if;
  end if;
  return new;
end $$;
revoke all on function public._ledger_buyins_client_guard() from public, anon, authenticated;

-- §4 ── 비밀번호 감액: 금액만, 이용권 장수는 못 바꾼다 ─────────────────────────────────────────
create or replace function public.update_ledger_buyin_reduce(p_id uuid, p_fields jsonb, p_password text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare r public.ledger_buyins; x public.ledger_buyins; k text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다' using errcode = '42501'; end if;
  if jsonb_typeof(p_fields) is distinct from 'object' then
    raise exception '수정 내용이 올바르지 않습니다' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_fields) loop
    if not (k = any (array['payment_method','is_unpaid','is_split','cash_amount','card_amount','transfer_amount',
                           'ticket_count','unpaid_amount','discount_level','discount_index','early_override'])) then
      raise exception '수정할 수 없는 항목입니다: %', k using errcode = '42501';
    end if;
  end loop;
  select * into r from public.ledger_buyins where id = p_id for update;
  if not found then raise exception '기록을 찾을 수 없습니다 — 화면을 새로 불러와 주세요' using errcode = 'P0002'; end if;
  if not coalesce(can_access_ledger(r.venue_id), false) then raise exception '권한이 없습니다' using errcode = '42501'; end if;
  if public.ledger_is_closed(r.venue_id, r.session_date, r.game_seq) then
    raise exception '마감된 장부의 바인은 수정할 수 없습니다 — 먼저 마감을 해제하세요';
  end if;
  perform public._ledger_require_cancel_auth(r.venue_id, p_password);
  x := jsonb_populate_record(r, p_fields);
  -- 20261001j(오너 10-01 ②) — 비밀번호 감액은 금액만 줄인다. 접수대 이용권 승인 행(request_id 있고 장수 > 0)의
  --   이용권 장수·분납 여부는 바꿀 수 없다(이 함수는 SECURITY DEFINER 라 client_guard 의 같은 잠금을 건너뛰었다).
  if r.request_id is not null and coalesce(r.ticket_count, 0) > 0
     and (x.ticket_count is distinct from r.ticket_count or x.is_split is distinct from r.is_split) then
    raise exception '이용권으로 승인한 바인은 결제 수단·할인·이용권 장수를 바꿀 수 없습니다(남은 금액의 결제 방법만 바꿀 수 있습니다). 바꾸려면 바인을 취소한 뒤 다시 승인하십시오.'
      using errcode = '42501';
  end if;
  if x.payment_method is null or x.payment_method not in ('ticket','cash','transfer','card','support') then
    raise exception '결제수단이 올바르지 않습니다' using errcode = '22023';
  end if;
  if least(coalesce(x.cash_amount,0), coalesce(x.card_amount,0), coalesce(x.transfer_amount,0),
           coalesce(x.ticket_count,0), coalesce(x.unpaid_amount,0), coalesce(x.discount_index,0)) < 0 then
    raise exception '금액은 0 이상이어야 합니다' using errcode = '22023';
  end if;
  if x.early_override is not null and x.early_override not in ('double','single','none') then
    raise exception '얼리 유형이 올바르지 않습니다' using errcode = '22023';
  end if;
  if (x.payment_method, x.is_unpaid, x.is_split, x.cash_amount, x.card_amount, x.transfer_amount,
      x.ticket_count, x.unpaid_amount, x.discount_index)
     is distinct from
     (r.payment_method, r.is_unpaid, r.is_split, r.cash_amount, r.card_amount, r.transfer_amount,
      r.ticket_count, r.unpaid_amount, r.discount_index) then
    x := public._ledger_buyin_apply_amount_rule(x);
  end if;
  update public.ledger_buyins set
    payment_method = x.payment_method, is_unpaid = coalesce(x.is_unpaid, false), is_split = coalesce(x.is_split, false),
    cash_amount = coalesce(x.cash_amount, 0), card_amount = coalesce(x.card_amount, 0), transfer_amount = coalesce(x.transfer_amount, 0),
    ticket_count = coalesce(x.ticket_count, 0), unpaid_amount = coalesce(x.unpaid_amount, 0),
    discount_level = coalesce(x.discount_level, 0), discount_index = coalesce(x.discount_index, 0),
    early_override = x.early_override
  where id = p_id;
end $function$;
revoke all on function public.update_ledger_buyin_reduce(uuid, jsonb, text) from public, anon;
grant execute on function public.update_ledger_buyin_reduce(uuid, jsonb, text) to authenticated, service_role;

-- §5 ── 자가검사 ─────────────────────────────────────────────────────────────────────────
do $check$
begin
  if (select count(*) from pg_proc where proname = 'approve_buyin_request' and pronamespace = 'public'::regnamespace) <> 1 then
    raise exception 'ABORT: approve_buyin_request 오버로드가 1개가 아니다';
  end if;
  if has_function_privilege('anon', 'public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer, text)', 'execute') then
    raise exception 'ABORT: approve_buyin_request ACL 이 anon=f·authenticated=t 가 아니다';
  end if;
  if has_function_privilege('authenticated', 'public._ledger_buyin_addon_rule()', 'execute')
     or has_function_privilege('anon', 'public._ledger_buyin_addon_rule()', 'execute') then
    raise exception 'ABORT: _ledger_buyin_addon_rule 이 화면에서 실행 가능하다';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.ledger_buyins'::regclass and tgname = 'ledger_buyins_addon_rule' and not tgisinternal) then
    raise exception 'ABORT: ledger_buyins_addon_rule 트리거가 없다';
  end if;
  if has_function_privilege('anon', 'public.update_ledger_buyin_reduce(uuid, jsonb, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.update_ledger_buyin_reduce(uuid, jsonb, text)', 'execute')
     or has_function_privilege('authenticated', 'public._ledger_buyins_client_guard()', 'execute') then
    raise exception 'ABORT: update_ledger_buyin_reduce(anon=f·authenticated=t) 또는 client_guard(authenticated=f) ACL 이 어긋난다';
  end if;
  if position('x.ticket_count is distinct from r.ticket_count' in (select prosrc from pg_proc where proname = 'update_ledger_buyin_reduce' and pronamespace = 'public'::regnamespace)) = 0 then
    raise exception 'ABORT: update_ledger_buyin_reduce 가 이용권 장수를 잠그지 않는다';
  end if;
  if position('ticket_count = v_k where id = v_bid' in (select prosrc from pg_proc where proname = 'approve_buyin_request' and pronamespace = 'public'::regnamespace)) = 0 then
    raise exception 'ABORT: approve_buyin_request 가 전액 이용권 행에 장수를 남기지 않는다';
  end if;
end $check$;
