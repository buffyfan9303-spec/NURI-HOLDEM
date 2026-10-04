-- 20261004e — 장부 결제 변경: '같은 결제 수단 안에서만' 비밀번호 없이 + 모든 결제 변경 감사 기록(오너 2026-10-04 F4-02)
-- ✅ 적용 완료 2026-10-04 (리드, Management API · critical v3 재반증 PASS · 운영 리허설 REHEARSAL_OK) — 실측 md5: guard ff9fb941… · audit 591390f9… · 금액규칙 06a44e6b… · 애드온 RPC edf8e89e… · advisors ERROR 0
-- 요구 원천: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\dummy-1004\RUN-REPORT.md#F4-02 · 오너 답 2026-10-04(리드 전달):
--   v1 "완납에서 미수로 바꾸는 것은 비밀번호 없이 가능하게."
--   v2(critical 반증 뒤 오너 결정) "같은 결제 수단으로만 자유" — 현금 미수 → 현금 완납 · 티켓 미수(가불) → 티켓 완납 · 완납 → 같은 수단 미수는
--      비밀번호 없이. 결제 수단 분류가 바뀌는 전이(현금 → 티켓 등, 단계를 나눠도)는 비밀번호.
--      그리고 모든 결제 상태·수단·금액 변경을 누가·언제·전후 값으로 기록(업주만 읽기).
-- v1 의 결함(critical-reviewer 2026-10-04, R2_critical B·C): 예외를 한 번의 UPDATE 로만 봐서
--   현금 완납 → (비번 없이) 미수 → 티켓 완납(미수 → 완납은 '증가'라 자유) 두 단계로 현금이 이용권으로 바뀌었다. 분납 현금+티켓도 같았다.
-- v3(critical 재반증 2026-10-04 R3_critical_v2b K, 리드 결정): v2 의 분류 비교가 비분납끼리만이라 **분납(분류 null)을 징검다리로**
--   현금 완납 → 분납(미수 10만) → 비분납 티켓 가불 → 티켓 완납 세 단계가 비밀번호 없이 통과했다. 애드온 칸은 가드 밖이었다.
--   v3 는 전이 하나가 아니라 **행의 상태량**으로 판정한다(경로와 무관한 불변식):
--     받을 가치 V = 바인 세 겹[3] + 애드온 금액 · 현금성 몫 C = 현금성 완납 + 현금성 미수(비분납 현금·카드·이체 미수, 분납 미수) + 애드온 현금성 몫
--     (V = C + 이용권 몫 T 항등식 — 가게지원은 어느 몫에도 없다.)
--     비밀번호 ⇔ ① V 가 줄었다  ② C 가 줄었다  ③ 바인 분류(현금성·티켓·가게지원·분납=null)가 티켓에 닿게 바뀌었거나 비분납끼리 바뀌었다
--               ③' 애드온 수단 분류(현금성 ↔ 티켓)가 바뀌었다.
--     ①②만으로 '비밀번호 없는 전이로는 C 가 절대 줄지 않는다'가 성립한다 — C 는 비밀번호 없이 V 그대로 이용권으로 갈 수도(②), 사라질 수도(①) 없고,
--       미수는 어느 상태에서든 C 또는 T 한쪽에 귀속되므로 몇 단계를 거쳐도 C → T 합성은 생기지 않는다(K2 에서 C 10만 → 0 = ② 거절).
--     ③·③' 은 오너 원문 "결제 수단 분류가 바뀌는 전이는 비밀번호" 를 그대로 지키려고 남긴다(티켓 → 현금 같은 반대 방향 포함).
--       ③ 식은 critical 제안: 분납 ↔ 티켓(가불 포함)은 비밀번호, 현금성 ↔ 분납·분납 일부 → 미수는 자유.
--   애드온(리드 결정 2): 애드온 현금 → 티켓은 ②(C 감소), 애드온 제거는 ①(V 감소), 애드온 티켓 → 현금은 ③' — 전부 비밀번호.
--     같은 수단 안 완납 ↔ 미수·현금 ↔ 카드 ↔ 이체·새 애드온 추가는 자유. 비밀번호 경로가 없던 애드온 수정은 새 RPC
--     update_ledger_addon_with_password(§1-3) 로 연다(update_ledger_buyin_reduce 는 애드온 칸을 모른다).
--   비분납 unpaid_amount 단독 값(리드 결정 3, critical P): 금액 규칙(§1-2)이 비분납 행의 unpaid_amount 를 0 으로 정규화한다.
--     비분납 행의 미수는 is_unpaid + 수단 금액으로만 센다(_ledger_buyin_tiers·buyinFinance 둘 다 unpaid_amount 를 안 읽는다) — 값은 바뀌지 않는다.
--     라이브 실측(2026-10-04): 비분납인데 unpaid_amount ≠ 0 인 행 1건(2026-09-17 · 현금 미수 · 수단 금액 0 · 30000) — 다음 금액 변경 때 0 이 된다(세 겹 값 불변).
--   감사 기록 DELETE(리드 결정 4): AFTER DELETE 도 같은 기록 함수가 op='D' · 삭제 직전 값으로 남긴다
--     (cancel_ledger_buyin·cancel_my_recent_buyin·delete_ledger_player·delete_ledger_session — 직접 지우든 연쇄로 지우든 행 트리거가 돈다).
--
-- 지금(라이브 20261001j, _ledger_buyins_client_guard md5 1baa2b4f37fa68251da1f8a7423e555e — 2026-10-04 select 실측):
--   세 겹(완납 매출 · 수납 완료 · 받을 가치) 중 하나라도 줄면 LEDGER_REDUCE_NEEDS_PASSWORD(42501). 늘어나는 수정은 전부 자유.
-- v2 판정(9199ce9f — v3 로 대체, 기록): ① 감액(미수로만 간 것 제외) ② 이용권 몫 증가(티켓 행 가불 → 회수 제외) ③ 비분납끼리 분류 변경.
--   한계였던 '분납을 낀 분류 비교 없음' 이 critical K 경로가 됐다.
-- 그대로 잠금: 접수대 이용권 승인 행(20261001j §3) · 마감된 장부(lb_update · ledger_is_closed).
-- 클라이언트 쌍둥이: src/api/ledger.ts isRevenueReduction(같은 네 조건). 한쪽만 고치면 판정이 갈린다.
-- 감사 기록(§2): public.ledger_buyin_audit — 결제 칸(수단·미수·분납·금액·장수·할인·애드온)이 바뀌는 **모든** UPDATE(화면 직접·RPC·서버 경로)를
--   AFTER UPDATE·DELETE 트리거 → SECURITY DEFINER 기록 함수가 남긴다: 누가(auth.uid(), 서버 경로는 null) · 언제 · 전후 미수·수단·세 겹·결제 칸.
--   읽기는 can_manage_pos(업주·승인 공동운영자·관리자)만. 쓰기 정책 없음(정의자 함수만 쓴다) · 기록 함수 실행권 회수.
--   v3: 행 삭제(DELETE)도 op='D' 로 삭제 직전 값을 남긴다. 화면에 보여 주는 판은 아직 없다(다음 단계).
-- 마감 뒤 미수 → 완납(settle_unpaid_after_close)·update_ledger_buyin_reduce 본문은 건드리지 않는다(감사 트리거는 그 갱신도 기록한다).
--
-- 적용 전 확인(쓰기 없음) — §0·§1-2 게이트가 자동으로 멈춘다:
--   select md5(prosrc) from pg_proc where oid = 'public._ledger_buyins_client_guard()'::regprocedure;             -- 기대 1baa2b4f37fa68251da1f8a7423e555e
--   select md5(prosrc) from pg_proc where oid = 'public._ledger_buyin_apply_amount_rule(public.ledger_buyins)'::regprocedure; -- 기대 82bc5962e48e39af2c0e59789090d2ca
--   select to_regclass('public.ledger_buyin_audit'), to_regprocedure('public._ledger_buyin_audit()'),
--          to_regprocedure('public.update_ledger_addon_with_password(uuid,text,boolean,text)');                  -- 기대 null, null, null (2026-10-04 실측)
-- 적용 후 기대 md5(prosrc) — 리허설 트랜잭션 안 실측(2026-10-04, M_md5.sql):
--   가드 ff9fb94174a14f04a0d6ed672223cc89 · 감사 591390f9651ca570a741ce91b97ca73e · 금액 규칙 06a44e6b1a89a007f7de22706b1862e8 · 애드온 RPC edf8e89eb76f115b0a92fea10bc12404
-- 리허설(라이브 한 방 트랜잭션, 끝 RAISE 로 전량 롤백 — 운영 쓰기 0): C:\Users\buffy\Documents\누리홀덤_영상분석_0930\ticket-check-1004\
--   node rehearse.mjs R0_harness.sql <이 파일> R1_tests.sql R2_critical_v2.sql R3_critical_v3.sql  → 'REHEARSAL_OK'(store-team 2026-10-04 실행 · 82항목, R9_dump 로 확인)
--   음성 ① 이 파일 없이 R0+R1 → P1 CHECK FAIL ② v1 본문(45cf8a44) → R2 B2 FAIL ③ v2 본문(9199ce9f, neg_v2_20261004e.sql) → R3 K2 FAIL(n=1, 분납 징검다리 통과).
--   PGlite(가드 본문만) 32케이스 v3 ALL_MATCH · v2 본문 4건 불일치(K2·애드온 3).

-- §0 ── 라이브 정의 게이트 ────────────────────────────────────────────────────────────────
do $gate$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public._ledger_buyins_client_guard()'::regprocedure)
       is distinct from '1baa2b4f37fa68251da1f8a7423e555e' then
    raise exception 'ABORT: _ledger_buyins_client_guard 가 20261001j 본문(1baa2b4f)이 아니다 — 라이브 본문에서 다시 만들어라';
  end if;
end $gate$;

-- §1 ── 화면 가드: 같은 결제 수단 안에서만 자유 ──────────────────────────────────────────────────────────
create or replace function public._ledger_buyins_client_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_price numeric; v_discs jsonb; o bigint[]; n bigint[]; v_co text; v_cn text;
        v_oc bigint; v_nc bigint; v_oa bigint; v_na bigint; v_oac bigint; v_nac bigint;
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
    -- 20261004e v3(오너 10-04 '같은 결제 수단으로만 자유' · critical 재반증 K): 상태량으로 판정한다(머리말 v3).
    --   분류: 비분납 행의 payment_method(현금·카드·이체 = 'cash' / ticket / support), 분납 = null — 미수 상태도 수단 분류를 지닌다.
    --   C(현금성 몫) = 완납 현금성(o[1]) + 미수 중 티켓 가불이 아닌 것(분납 미수 포함) + 애드온 현금성 몫.
    --   NULL 주의: 분류 비교는 전부 is [not] distinct from — '=' 는 분납(null)에서 null 이 되어 조건을 끈다(v2 PGlite C2 실측).
    v_co := case when coalesce(old.is_split, false) then null when old.payment_method = 'ticket' then 'ticket'
                 when old.payment_method = 'support' then 'support' else 'cash' end;
    v_cn := case when coalesce(new.is_split, false) then null when new.payment_method = 'ticket' then 'ticket'
                 when new.payment_method = 'support' then 'support' else 'cash' end;
    v_oc := o[1] + case when v_co is not distinct from 'ticket' then 0 else o[3] - o[2] end;
    v_nc := n[1] + case when v_cn is not distinct from 'ticket' then 0 else n[3] - n[2] end;
    v_oa := case when old.addon_method in ('cash', 'card', 'transfer', 'ticket') then greatest(0, coalesce(old.addon_amount, 0)) else 0 end;
    v_na := case when new.addon_method in ('cash', 'card', 'transfer', 'ticket') then greatest(0, coalesce(new.addon_amount, 0)) else 0 end;
    v_oac := case when old.addon_method in ('cash', 'card', 'transfer')
                  then v_oa - least(v_oa, greatest(0, coalesce(old.addon_ticket_count, 0))::bigint * 10000) else 0 end;
    v_nac := case when new.addon_method in ('cash', 'card', 'transfer')
                  then v_na - least(v_na, greatest(0, coalesce(new.addon_ticket_count, 0))::bigint * 10000) else 0 end;
    if (n[3] + v_na < o[3] + v_oa)
       or (v_nc + v_nac < v_oc + v_oac)
       or (v_co is distinct from v_cn and (v_co is not distinct from 'ticket' or v_cn is not distinct from 'ticket' or (v_co is not null and v_cn is not null)))
       or (old.addon_method is not null and new.addon_method is not null
           and (old.addon_method = 'ticket') is distinct from (new.addon_method = 'ticket')) then
      raise exception '매출이 줄거나 결제 수단 분류(현금·이용권·가게지원)가 바뀌는 수정은 업주 취소 비밀번호가 필요합니다'
        using errcode = '42501', hint = 'LEDGER_REDUCE_NEEDS_PASSWORD';
    end if;
  end if;
  return new;
end $$;
revoke all on function public._ledger_buyins_client_guard() from public, anon, authenticated;

-- §1-2 ── 금액 규칙: 비분납 행의 unpaid_amount 정규화(v3, critical P) ──────────────────────────────────
--   라이브 본문(md5 82bc5962e48e39af2c0e59789090d2ca, 20260927a 이후) 그대로에 비분납 두 갈래마다 'b.unpaid_amount := 0;' 한 줄씩만 더한다.
--   create or replace → ACL 보존(라이브 {postgres, authenticated, service_role} 실행 — 화면 가드·RPC 가 부른다).
do $gate_rule$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public._ledger_buyin_apply_amount_rule(public.ledger_buyins)'::regprocedure)
       is distinct from '82bc5962e48e39af2c0e59789090d2ca' then
    raise exception 'ABORT: _ledger_buyin_apply_amount_rule 이 2026-10-04 실측 본문(82bc5962)이 아니다 — 라이브 본문에서 다시 만들어라';
  end if;
end $gate_rule$;
CREATE OR REPLACE FUNCTION public._ledger_buyin_apply_amount_rule(b ledger_buyins)
 RETURNS ledger_buyins
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_price numeric; v_discs jsonb; v_gross bigint; v_disc bigint := 0; v_net bigint; v_sum bigint;
        v_idx int := coalesce(b.discount_index, 0);
begin
  select s.buyin_amount, s.discounts into v_price, v_discs
    from public.ledger_sessions s
   where s.venue_id = b.venue_id and s.session_date = b.session_date and s.game_seq = b.game_seq;
  if not found then
    raise exception '이 게임의 장부가 아직 열려 있지 않습니다 — 장부에서 게임을 먼저 여세요'
      using errcode = '23514', hint = 'LEDGER_SESSION_MISSING';
  end if;
  v_gross := greatest(0, round(coalesce(v_price, 0)));
  if v_idx > 0 and jsonb_typeof(v_discs) = 'array' and jsonb_array_length(v_discs) >= v_idx then
    v_disc := least(v_gross, greatest(0, round(coalesce((v_discs -> (v_idx - 1) ->> 'amount')::numeric, 0))));
  end if;
  v_net := greatest(0, v_gross - v_disc);
  if coalesce(b.is_split, false) then
    v_sum := coalesce(b.cash_amount, 0) + coalesce(b.card_amount, 0) + coalesce(b.transfer_amount, 0)
           + coalesce(b.ticket_count, 0)::bigint * 10000 + coalesce(b.unpaid_amount, 0);
    if v_sum is distinct from v_net then
      raise exception '분납 합계(%원)가 참가비(%원)와 다릅니다 — 화면을 새로 불러와 주세요', v_sum, v_net
        using errcode = '23514', hint = 'LEDGER_SPLIT_MISMATCH';
    end if;
  elsif b.payment_method in ('cash', 'card', 'transfer') then
    b.cash_amount     := case when b.payment_method = 'cash'     then v_net else 0 end;
    b.card_amount     := case when b.payment_method = 'card'     then v_net else 0 end;
    b.transfer_amount := case when b.payment_method = 'transfer' then v_net else 0 end;
    b.unpaid_amount := 0;   -- 20261004e v3: 비분납 미수는 is_unpaid + 수단 금액으로만 센다(단독 쓰레기 값 정규화)
  elsif b.payment_method in ('ticket', 'support') then
    -- 20260927a: 분납 아닌 이용권·가게지원은 받은 돈이 0 이다(my_play_history·my_buyin_history 합계 오염 차단).
    b.cash_amount := 0; b.card_amount := 0; b.transfer_amount := 0;
    b.unpaid_amount := 0;   -- 20261004e v3
  end if;
  return b;
end $function$;

-- §1-3 ── 애드온 수정의 비밀번호 경로(v3, 리드 결정 2) ────────────────────────────────────────────────
--   화면 가드가 애드온 제거·현금 → 티켓·티켓 → 현금을 LEDGER_REDUCE_NEEDS_PASSWORD 로 거절하면, 화면은 비밀번호를 받아 이 RPC 로 다시 보낸다.
--   비밀번호 규칙은 _ledger_require_cancel_auth(취소·감액과 한 규칙) · 마감 장부는 거절 · 금액은 세션 애드온 가격(트리거 20260928g 가 다시 맞춘다).
create or replace function public.update_ledger_addon_with_password(p_id uuid, p_method text, p_unpaid boolean, p_password text)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare r public.ledger_buyins; v_amt integer;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다' using errcode = '42501'; end if;
  if p_method is not null and p_method not in ('cash', 'card', 'transfer', 'ticket') then
    raise exception '애드온 결제 방법이 올바르지 않습니다' using errcode = '22023';
  end if;
  select * into r from public.ledger_buyins where id = p_id for update;
  if not found then raise exception '기록을 찾을 수 없습니다 — 화면을 새로 불러와 주세요' using errcode = 'P0002'; end if;
  if not coalesce(public.can_access_ledger(r.venue_id), false) then raise exception '권한이 없습니다' using errcode = '42501'; end if;
  if public.ledger_is_closed(r.venue_id, r.session_date, r.game_seq) then
    raise exception '마감된 장부는 고칠 수 없습니다 — 먼저 마감을 해제하세요' using errcode = '42501';
  end if;
  perform public._ledger_require_cancel_auth(r.venue_id, p_password);
  select coalesce(s.addon_amount, 0) into v_amt from public.ledger_sessions s
   where s.venue_id = r.venue_id and s.session_date = r.session_date and s.game_seq = r.game_seq;
  update public.ledger_buyins
     set addon_method = p_method,
         addon_unpaid = case when p_method is null then false else coalesce(p_unpaid, false) end,
         addon_amount = case when p_method is null then 0 else coalesce(v_amt, 0) end
   where id = p_id;
end $function$;
revoke all on function public.update_ledger_addon_with_password(uuid, text, boolean, text) from public, anon;
grant execute on function public.update_ledger_addon_with_password(uuid, text, boolean, text) to authenticated, service_role;

-- §2 ── 결제 변경 감사 기록 ─────────────────────────────────────────────────────────────────
create table if not exists public.ledger_buyin_audit (
  id bigserial primary key,
  buyin_id uuid not null,                 -- FK 없음: 바인이 나중에 취소(삭제)돼도 기록은 남는다
  venue_id uuid not null,
  session_date date not null,
  game_seq smallint not null,
  actor_id uuid,                          -- auth.uid() — 서버 경로(크론·service_role)는 null
  changed_at timestamptz not null default now(),
  op char(1) not null default 'U' check (op in ('U', 'D')),   -- U = 결제 칸 변경 · D = 행 삭제(취소·플레이어 삭제·장부 삭제 — 삭제 직전 값, after_* 는 null)
  before_unpaid boolean, after_unpaid boolean,
  before_method text, after_method text,
  before_tiers bigint[], after_tiers bigint[],   -- [완납 매출, 수납 완료, 받을 가치] (_ledger_buyin_tiers)
  before_pay jsonb, after_pay jsonb              -- 결제 칸 원문(분납 금액·장수·할인·애드온)
);
create index if not exists ledger_buyin_audit_venue_time on public.ledger_buyin_audit (venue_id, changed_at desc);
create index if not exists ledger_buyin_audit_buyin on public.ledger_buyin_audit (buyin_id, changed_at);
alter table public.ledger_buyin_audit enable row level security;
revoke all on table public.ledger_buyin_audit from public, anon, authenticated;
grant select on table public.ledger_buyin_audit to authenticated;
grant all on table public.ledger_buyin_audit to service_role;
revoke all on sequence public.ledger_buyin_audit_id_seq from public, anon, authenticated;
drop policy if exists lba_select on public.ledger_buyin_audit;
create policy lba_select on public.ledger_buyin_audit for select to authenticated using (public.can_manage_pos(venue_id));

create or replace function public._ledger_buyin_audit()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_price numeric; v_discs jsonb;
begin
  select s.buyin_amount, s.discounts into v_price, v_discs
    from public.ledger_sessions s
   where s.venue_id = old.venue_id and s.session_date = old.session_date and s.game_seq = old.game_seq;
  if tg_op = 'DELETE' then
    -- 삭제 직전 값만(after_* null). 장부 삭제가 세션을 먼저 지웠으면 단가를 몰라 세 겹이 0 기준이 된다 — 원문은 before_pay 에 남는다.
    insert into public.ledger_buyin_audit (buyin_id, venue_id, session_date, game_seq, actor_id, op,
      before_unpaid, before_method, before_tiers, before_pay)
    values (old.id, old.venue_id, old.session_date, old.game_seq, auth.uid(), 'D',
      old.is_unpaid, old.payment_method, public._ledger_buyin_tiers(old, v_price, v_discs),
      jsonb_build_object('player', old.player_name, 'entry_no', old.entry_no, 'request_id', old.request_id,
        'is_split', old.is_split, 'cash', old.cash_amount, 'card', old.card_amount, 'transfer', old.transfer_amount,
        'ticket', old.ticket_count, 'unpaid', old.unpaid_amount, 'discount_index', old.discount_index,
        'addon_method', old.addon_method, 'addon_unpaid', old.addon_unpaid, 'addon_amount', old.addon_amount, 'addon_ticket', old.addon_ticket_count));
    return null;
  end if;
  insert into public.ledger_buyin_audit (buyin_id, venue_id, session_date, game_seq, actor_id, op,
    before_unpaid, after_unpaid, before_method, after_method, before_tiers, after_tiers, before_pay, after_pay)
  values (new.id, new.venue_id, new.session_date, new.game_seq, auth.uid(), 'U',
    old.is_unpaid, new.is_unpaid, old.payment_method, new.payment_method,
    public._ledger_buyin_tiers(old, v_price, v_discs), public._ledger_buyin_tiers(new, v_price, v_discs),
    jsonb_build_object('is_split', old.is_split, 'cash', old.cash_amount, 'card', old.card_amount, 'transfer', old.transfer_amount,
      'ticket', old.ticket_count, 'unpaid', old.unpaid_amount, 'discount_index', old.discount_index,
      'addon_method', old.addon_method, 'addon_unpaid', old.addon_unpaid, 'addon_amount', old.addon_amount, 'addon_ticket', old.addon_ticket_count),
    jsonb_build_object('is_split', new.is_split, 'cash', new.cash_amount, 'card', new.card_amount, 'transfer', new.transfer_amount,
      'ticket', new.ticket_count, 'unpaid', new.unpaid_amount, 'discount_index', new.discount_index,
      'addon_method', new.addon_method, 'addon_unpaid', new.addon_unpaid, 'addon_amount', new.addon_amount, 'addon_ticket', new.addon_ticket_count));
  return null;
end $function$;
revoke all on function public._ledger_buyin_audit() from public, anon, authenticated;
grant execute on function public._ledger_buyin_audit() to service_role;
drop trigger if exists trg_ledger_buyin_audit on public.ledger_buyins;
create trigger trg_ledger_buyin_audit
  after update on public.ledger_buyins
  for each row
  when ((old.payment_method, old.is_unpaid, old.is_split, old.cash_amount, old.card_amount, old.transfer_amount,
         old.ticket_count, old.unpaid_amount, old.discount_index, old.addon_method, old.addon_unpaid, old.addon_amount, old.addon_ticket_count)
        is distinct from
        (new.payment_method, new.is_unpaid, new.is_split, new.cash_amount, new.card_amount, new.transfer_amount,
         new.ticket_count, new.unpaid_amount, new.discount_index, new.addon_method, new.addon_unpaid, new.addon_amount, new.addon_ticket_count))
  execute function public._ledger_buyin_audit();
drop trigger if exists trg_ledger_buyin_audit_del on public.ledger_buyins;
create trigger trg_ledger_buyin_audit_del
  after delete on public.ledger_buyins
  for each row
  execute function public._ledger_buyin_audit();

-- §3 ── 자가검사 — 하나라도 어긋나면 멈춘다(롤백) ────────────────────────────────────────────
do $check$
declare src text := (select prosrc from pg_proc where oid = 'public._ledger_buyins_client_guard()'::regprocedure);
begin
  if position('if (n[3] + v_na < o[3] + v_oa)' in src) = 0
     or position('or (v_nc + v_nac < v_oc + v_oac)' in src) = 0
     or position('or (v_co is distinct from v_cn and (v_co is not distinct from ''ticket'' or v_cn is not distinct from ''ticket'' or (v_co is not null and v_cn is not null)))' in src) = 0
     or position('or (old.addon_method is not null and new.addon_method is not null' in src) = 0 then
    raise exception '20261004e: v3 판정 네 조건(받을 가치·현금성 몫·바인 분류·애드온 분류) 중 하나가 없다';
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
  -- v3: 금액 규칙 정규화 · 애드온 비밀번호 RPC
  if (select count(*) from regexp_matches((select prosrc from pg_proc where oid = 'public._ledger_buyin_apply_amount_rule(public.ledger_buyins)'::regprocedure),
        'b\.unpaid_amount := 0;', 'g')) <> 2 then
    raise exception '20261004e: 금액 규칙의 비분납 unpaid_amount 정규화 두 줄이 없다';
  end if;
  if not (select prosecdef and proconfig @> array['search_path=public, pg_temp'] from pg_proc
           where oid = 'public.update_ledger_addon_with_password(uuid,text,boolean,text)'::regprocedure)
     or has_function_privilege('anon', 'public.update_ledger_addon_with_password(uuid,text,boolean,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.update_ledger_addon_with_password(uuid,text,boolean,text)', 'execute') then
    raise exception '20261004e: update_ledger_addon_with_password 가 DEFINER·search_path·ACL(anon 불가·authenticated 가능)이 아니다';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.ledger_buyins'::regclass
                  and tgname = 'trg_ledger_buyin_audit_del' and not tgisinternal and tgenabled <> 'D') then
    raise exception '20261004e: 삭제 감사 트리거가 없다(꺼져 있다)';
  end if;
  -- 감사 기록
  if not exists (select 1 from pg_trigger where tgrelid = 'public.ledger_buyins'::regclass
                  and tgname = 'trg_ledger_buyin_audit' and not tgisinternal and tgenabled <> 'D') then
    raise exception '20261004e: 감사 트리거가 없다(꺼져 있다)';
  end if;
  if not (select prosecdef and proconfig @> array['search_path=public, pg_temp'] from pg_proc where oid = 'public._ledger_buyin_audit()'::regprocedure) then
    raise exception '20261004e: 감사 기록 함수가 DEFINER·search_path 고정이 아니다';
  end if;
  if has_function_privilege('anon', 'public._ledger_buyin_audit()', 'execute')
     or has_function_privilege('authenticated', 'public._ledger_buyin_audit()', 'execute') then
    raise exception '20261004e: 감사 기록 함수를 anon·authenticated 가 실행할 수 있다';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.ledger_buyin_audit'::regclass) then
    raise exception '20261004e: 감사 표 RLS 꺼짐';
  end if;
  if has_table_privilege('anon', 'public.ledger_buyin_audit', 'select')
     or has_table_privilege('authenticated', 'public.ledger_buyin_audit', 'insert')
     or has_table_privilege('authenticated', 'public.ledger_buyin_audit', 'update')
     or has_table_privilege('authenticated', 'public.ledger_buyin_audit', 'delete') then
    raise exception '20261004e: 감사 표 권한이 넓다(anon 읽기 또는 authenticated 쓰기)';
  end if;
  if (select count(*) from pg_policy where polrelid = 'public.ledger_buyin_audit'::regclass) <> 1
     or (select pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'public.ledger_buyin_audit'::regclass and polname = 'lba_select')
        is distinct from 'can_manage_pos(venue_id)' then
    raise exception '20261004e: 감사 표 정책이 can_manage_pos 읽기 하나가 아니다';
  end if;
end $check$;
