-- ✅ 적용 완료 2026-09-28 (nuri-lead, MCP execute_sql). 실측: addon 칸 4/4 · 트리거 1 · authenticated 실행권 false · 기존 행 소급 0.
--    리허설(begin…rollback, 픽스처 매장 dddd…0001/2026-09-17): R2 비애드온 거절 PASS · R1 클라 금액 1 → 30000 저장 ·
--    R6 세션가 5만 변경 후 기존 기록 30000 유지 · 미수 전환 시 현재가 50000 재스냅샷 · 잘못된 수단 거절 · R3 지우면 f/0.
--    미실행: R4·R5(역할 전환 RLS 대조) — 새 칸은 기존 lb_update/lb_write 행 정책을 그대로 탄다.
--
-- 요구: 오너 채팅 2026-09-28 "장부에 애드온 행 추가 — 현금 완납/현금 미수 고르는 칸 맨 아래에".
-- 결함: ledger_sessions 에 is_addon·addon_stack 은 있는데 **애드온 가격 칸이 없고**, ledger_buyins 에는
--       애드온 기록 칸이 없어 정산의 애드온 매출이 언제나 0 이었다(포스터에는 addon 비용이 있다).
--
-- ── 불변식 ─────────────────────────────────────────────────────────────────
--   애드온은 바이인 횟수·엔트리·얼리·총 칩에 **절대 들어가지 않는다**(오너 규칙 '장부의 세 수').
--   그래서 기존 바인 금액 칸(cash/card/transfer/ticket/unpaid)과 **따로** 둔다 — 섞으면
--   gross − disc === value === Σtender 항등식과 엔트리(value ÷ 단가)가 즉시 깨진다.
--   클라 정본: src/api/ledger.ts addonFinance / addonTotals, 정산: src/lib/ledgerSettlement.ts.
--
-- ── 라이브 정의 실측(2026-09-28, execute_sql 읽기 전용 · pg_get_functiondef) ─────────
--   PG 17.6. ledger_buyins 트리거 1개: ledger_buyins_client_guard → _ledger_buyins_client_guard
--   ledger_sessions 트리거 3개: trg_a0_ledger_sessions_client_insert_guard · trg_a_ledger_session_guard ·
--                              trg_guard_ledger_session_update
--   ① 마감 장부 세션 수정 차단 — _guard_ledger_session_update 는 to_jsonb(new) 전체(- close_memo·closed_at·
--      updated_at·clock_snapshot)를 비교한다 → **새 addon_amount 칸도 자동으로 막힌다**(추가 작업 없음).
--   ② 마감 장부 바인 수정 차단 — RLS lb_update USING (can_access_ledger AND NOT ledger_is_closed(...)),
--      lb_write(INSERT) WITH CHECK 동일 → **addon_* 칸 UPDATE 도 마감 장부에서는 0행**(클라 mustAffect 가 오류로 올린다).
--   ③ _ledger_buyins_client_guard — 금액 규칙(_ledger_buyin_apply_amount_rule)과 감액 판정(_ledger_buyin_tiers)이
--      바인 칸 9개만 본다. addon_* 칸은 **통과**한다(막지도, 고치지도 않는다).
--      ⚠ 따라서 완납 애드온을 지우는(매출이 줄어드는) 수정은 **비밀번호 없이 통과**한다 — 아래 NEEDS 참고.
--   ④ update_ledger_buyin_reduce(감액 비밀번호 RPC) — p_fields 키 화이트리스트 11개에 addon_* 가 **없다** →
--      addon 키를 실으면 '수정할 수 없는 항목' 42501. 그래서 클라는 애드온을 별도 UPDATE(setBuyinAddon)로만 쓴다.
--   ⑤ _ledger_session_guard — 바인이 있으면 buyin_amount·기존 할인 변경을 막지만 addon_amount 는 **안 막는다**.
--      괜찮다: 바인 행이 addon_amount 를 기록 시점 스냅샷으로 들고 있어 세션 가격 변경이 소급되지 않는다.
--   ⑥ approve_buyin_request 등 서버 INSERT 는 addon_* 를 안 쓴다 → 기본값(null/false/0) = 애드온 없음. 소급 영향 0.
--
-- ── NEEDS(리드 판단) ─────────────────────────────────────────────────────────
--   N1. 완납 애드온 삭제·완납→미수 전환을 LEDGER-REDUCE-PASSWORD 로 묶을지. 묶으려면 _ledger_buyin_tiers 에
--       애드온을 더하고 update_ledger_buyin_reduce 화이트리스트에 addon_method·addon_unpaid 를 추가해야 한다
--       (한쪽만 하면 업주가 잘못 누른 애드온을 지울 길이 없어진다). 이 초안은 둘 다 건드리지 않았다.
--
-- ── 이 파일이 하는 것 ─────────────────────────────────────────────────────────
--   1) 칸 4개 + CHECK 2개(멱등).
--   2) _ledger_buyin_addon_rule 트리거 — 애드온 금액을 **서버가** 세션 가격으로 스냅샷한다(클라가 보낸 금액은 무시).
--      애드온이 꺼진 게임(is_addon=false)에 애드온을 붙이면 거절. 애드온을 지우면 unpaid=false·amount=0 으로 정리.
--   3) 자가검사.

begin;

alter table public.ledger_sessions add column if not exists addon_amount integer not null default 0;
alter table public.ledger_buyins  add column if not exists addon_method text null;
alter table public.ledger_buyins  add column if not exists addon_unpaid boolean not null default false;
alter table public.ledger_buyins  add column if not exists addon_amount integer not null default 0;

do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 'ledger_sessions_addon_amount_nonneg') then
    alter table public.ledger_sessions add constraint ledger_sessions_addon_amount_nonneg check (addon_amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ledger_buyins_addon_chk') then
    alter table public.ledger_buyins add constraint ledger_buyins_addon_chk check (
      (addon_method is null or addon_method in ('cash', 'card', 'transfer', 'ticket'))
      and addon_amount >= 0);
  end if;
end $c$;

-- 애드온 금액은 서버가 정한다. SECURITY INVOKER — 세션 행은 이 바인을 쓸 수 있는 사람이면 이미 읽을 수 있다(ls RLS).
create or replace function public._ledger_buyin_addon_rule() returns trigger
language plpgsql set search_path to 'public', 'pg_temp' as $function$
declare v_is_addon boolean; v_price integer;
begin
  if new.addon_method is null then
    new.addon_unpaid := false;
    new.addon_amount := 0;
    return new;
  end if;
  -- 바뀐 게 없으면(다른 칸만 UPDATE) 기록 시점 스냅샷을 그대로 둔다.
  if tg_op = 'UPDATE'
     and new.addon_method is not distinct from old.addon_method
     and new.addon_unpaid is not distinct from old.addon_unpaid then
    new.addon_amount := old.addon_amount;
    return new;
  end if;
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
  return new;
end $function$;
revoke execute on function public._ledger_buyin_addon_rule() from public, anon, authenticated;

drop trigger if exists ledger_buyins_addon_rule on public.ledger_buyins;
create trigger ledger_buyins_addon_rule
  before insert or update of addon_method, addon_unpaid, addon_amount on public.ledger_buyins
  for each row execute function public._ledger_buyin_addon_rule();

-- ── 자가검사 ─────────────────────────────────────────────────────────────
do $check$
declare n int;
begin
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and (
     (table_name = 'ledger_sessions' and column_name = 'addon_amount') or
     (table_name = 'ledger_buyins' and column_name in ('addon_method', 'addon_unpaid', 'addon_amount')));
  if n <> 4 then raise exception 'selfcheck: addon 칸 % / 4', n; end if;
  if not exists (select 1 from pg_trigger where tgname = 'ledger_buyins_addon_rule' and not tgisinternal) then
    raise exception 'selfcheck: addon 트리거 없음';
  end if;
  if has_function_privilege('anon', 'public._ledger_buyin_addon_rule()', 'execute')
     or has_function_privilege('authenticated', 'public._ledger_buyin_addon_rule()', 'execute') then
    raise exception 'selfcheck: 트리거 함수 실행 권한이 열려 있다';
  end if;
  -- 기존 행 소급 0 — 새 칸은 전부 기본값이어야 한다.
  select count(*) into n from public.ledger_buyins where addon_method is not null or addon_amount <> 0 or addon_unpaid;
  if n <> 0 then raise exception 'selfcheck: 기존 바인 % 행에 애드온 값이 있다', n; end if;
end $check$;

commit;

-- ── 리허설 제안(리드용, begin … rollback) ────────────────────────────────
--   R1 애드온 게임(is_addon, addon_amount=30000) 바인에 addon_method='cash' UPDATE, 클라가 addon_amount=1 을 보내도 → 30000 저장.
--   R2 is_addon=false 세션 바인에 addon_method='cash' → 23514 거절.
--   R3 addon_method=null UPDATE → addon_unpaid=false, addon_amount=0.
--   R4 마감 장부 바인 addon UPDATE → 0행(lb_update RLS). 마감 장부 세션 addon_amount 변경 → '마감된 장부는 수정할 수 없습니다'.
--   R5 양성: 업주·장부 권한 직원 모두 R1 통과. 음성: 다른 매장 계정 0행.
--   R6 기존 바인 칸 UPDATE(payment_method 등)만 하면 addon_amount 가 유지된다(UPDATE OF 목록 밖).
