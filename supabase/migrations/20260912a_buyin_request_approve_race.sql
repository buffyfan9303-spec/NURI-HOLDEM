-- V01 / P1 — 바인 요청 승인의 경합을 막는다 (2026-09-12)
--
-- APPLIED 2026-09-13: event_voucher_bundle_20260913_hardened. Activation is separate.
--
-- ── 무엇이 문제인가 ────────────────────────────────────────────────────────────
-- `approve_buyin_request` 는 요청 행을 **잠그지 않고** 읽고, 마지막 전이에도 상태 술어가 없다:
--
--     select * into r from ledger_buyin_requests where id = p_request_id;   -- 잠금 없음
--     if r.status is distinct from 'pending' then raise ...                  -- 스냅샷 검사
--     ...  (ledger_players / ledger_buyins INSERT — 되돌릴 수 없는 부수효과)
--     update ledger_buyin_requests set status='approved' where id = p_request_id;  -- 술어 없음
--
-- `reject_buyin_request`(20260911b)는 이미 CAS 를 갖고 있다
-- (`where id = ... and status='pending'` + `if not found then raise`).
-- 그래서 **거절이 승인을 덮는 방향은 막혀 있지만, 승인이 거절을 덮는 방향은 열려 있다.**
--
-- 재현(READ COMMITTED, connection 2개):
--   ① A: approve 가 pending 을 읽는다(잠금 없음).
--   ② B: reject 가 CAS 로 'rejected' 로 바꾸고 `_restore_voucher` 로 이용권을 active 로 되돌린 뒤 커밋.
--   ③ A: 그대로 진행해 ledger_buyins 를 INSERT 하고 status 를 'approved' 로 **덮어쓴다**.
--   결과: **active 이용권과 확정 바인이 동시에 남는다.**
--
--   approve ↔ approve 도 같다 — 둘 다 pending 을 읽고 둘 다 바인을 INSERT 해
--   요청 1건에 확정 바인 2건이 생긴다(다른 게임으로 각각 승인하는 경우 포함).
--
-- ── 어떻게 고치는가 ───────────────────────────────────────────────────────────
--   ① `for update` 로 요청 행을 잠근다. 잠금을 얻은 시점에 **최신 커밋본**을 다시 읽으므로
--      ②에서 거절이 커밋됐으면 여기서 걸린다. 부수효과 이전에 막힌다.
--   ② 마지막 전이에도 `and status='pending'` 을 넣고 `if not found` 로 확인한다(거절과 같은 모양).
--      ①이 있으면 도달하지 않지만, 두 겹으로 둔다 — 이 함수는 돈과 이용권을 동시에 움직인다.
--
-- 본문의 나머지 로직(단가·할인·분납·티켓·마감 검사)은 20260911d 와 **한 글자도 다르지 않다.**
-- 바꾼 것은 위 두 줄뿐이다.
--
-- ── 적용 후 확인 ──────────────────────────────────────────────────────────────
--   select proname, proacl from pg_proc where proname = 'approve_buyin_request';
--   어드바이저 보안 ERROR 0 유지.
--
-- ROLLBACK: 20260911d_buyin_value_payment_method_neutral.sql 의
--           approve_buyin_request 정의를 그대로 재실행한 뒤, 아래 REVOKE/GRANT 2줄을 다시 쓴다.

create or replace function public.approve_buyin_request(
  p_request_id uuid,
  p_game_seq smallint default 1,
  p_record_buyin boolean default false,
  p_pay_method text default 'cash',
  p_split boolean default false,
  p_cash integer default 0,
  p_card integer default 0,
  p_transfer integer default 0,
  p_discount_index integer default 0
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r ledger_buyin_requests;
  v_sort int; v_entry int;
  v_amt int; v_discounts jsonb;
  v_disc int := 0; v_idx int := 0; v_unit int; v_net int;
  v_pm text := lower(coalesce(p_pay_method, 'cash'));
begin
  -- ⚠ 2026-09-12(V01): `for update` — 같은 요청을 동시에 처리하는 다른 트랜잭션을 여기서 줄 세운다.
  --   잠금을 얻으면 최신 커밋본을 다시 읽으므로, 그 사이 거절/승인이 커밋됐다면 아래 상태 검사에 걸린다.
  --   **부수효과(바인 INSERT) 이전에** 막히는 것이 핵심이다 — 뒤에서 막으면 이미 돈이 기록된 뒤다.
  select * into r from ledger_buyin_requests where id = p_request_id for update;
  if not found then raise exception '요청을 찾을 수 없습니다'; end if;
  if not coalesce(can_access_ledger(r.venue_id), false) then raise exception '권한이 없습니다'; end if;
  if r.status is distinct from 'pending' then raise exception '이미 처리된 요청입니다'; end if;
  if public.ledger_is_closed(r.venue_id, r.session_date, p_game_seq) then
    raise exception '마감된 장부입니다 — 다른 게임을 선택하거나 마감을 해제하세요';
  end if;

  -- 세션 단가 · 할인 프리셋. card_amount 는 더 이상 읽지 않는다.
  select coalesce(buyin_amount, 0), coalesce(discounts, '[]'::jsonb)
    into v_amt, v_discounts
    from ledger_sessions
   where venue_id = r.venue_id and session_date = r.session_date and game_seq = p_game_seq;
  v_amt := coalesce(v_amt, 0); v_discounts := coalesce(v_discounts, '[]'::jsonb);

  -- 할인 자리번호(1~5) → 금액. 프리셋이 비었거나 0원이면 '할인 없음'으로 기록한다(정가).
  if p_discount_index between 1 and 5 and jsonb_typeof(v_discounts) = 'array' then
    v_disc := coalesce((v_discounts -> (p_discount_index - 1) ->> 'amount')::int, 0);
    if v_disc > 0 then v_idx := p_discount_index; v_disc := least(v_disc, v_amt); else v_disc := 0; end if;
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
    p_record_buyin := false;
    select coalesce(max(entry_no), 0) + 1 into v_entry
      from ledger_buyins where venue_id = r.venue_id and session_date = r.session_date
                           and game_seq = p_game_seq and player_name = r.player_name;
    insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method, discount_index, created_by, request_id)
    values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, 'ticket', v_idx, auth.uid(), r.id);
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
      -- 결제수단은 바인 가치를 바꾸지 않는다(오너 지시) — 카드도 현금 단가로 기록한다.
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

  -- ⚠ 2026-09-12(V01): 전이에도 술어를 둔다 — 거절(20260911b)과 같은 모양.
  --   위 `for update` 가 있으면 여기 도달하지 않지만, 이 함수는 돈과 이용권을 함께 움직이므로 두 겹으로 막는다.
  update ledger_buyin_requests
     set status = 'approved', game_seq = p_game_seq, resolved_at = now(), resolved_by = auth.uid()
   where id = p_request_id and status = 'pending';
  if not found then raise exception '이미 처리된 요청입니다'; end if;
end;
$$;

-- ⚠ CREATE OR REPLACE 는 ACL 을 초기화한다 — 반드시 다시 쓴다.
--   `from anon` 만으로는 무효다(PUBLIC 기본 GRANT). 반드시 `from public`.
revoke all on function public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer) from public, anon;
grant execute on function public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer) to authenticated, service_role;

comment on function public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer) is
  '바인 요청 승인. 2026-09-12(V01): 요청 행을 for update 로 잠그고 전이에 pending 술어를 둬 승인↔거절·승인↔승인 경합을 막는다.';

-- ── 요청당 확정 바인 1건 계약 ────────────────────────────────────────────────
--
-- `ledger_buyins_request_idx`(20260911c:38)는 **nonunique** 라 중복 승인을 막지 못한다.
-- 먼저 중복을 검사해 데이터가 있으면 임의 정리하지 않고 전체 적용을 중단한다. 0건이면 같은
-- 트랜잭션에서 유니크 인덱스를 만들어 함수 잠금뿐 아니라 저장 구조로도 1:1 계약을 고정한다.
do $request_uniq_preflight$
declare v_dup int;
begin
  select count(*) into v_dup
    from (select request_id from public.ledger_buyins
           where request_id is not null
           group by request_id having count(*) > 1) d;
  if v_dup > 0 then
    raise exception 'ABORT: request_id 중복 %건 — 자동 삭제하지 않고 적용을 중단합니다', v_dup;
  end if;
end $request_uniq_preflight$;

create unique index if not exists ledger_buyins_request_uniq
  on public.ledger_buyins (request_id) where request_id is not null;

do $request_uniq_check$
declare v_def text;
begin
  select indexdef into v_def from pg_indexes
   where schemaname = 'public' and indexname = 'ledger_buyins_request_uniq';
  if v_def is null
     or not exists (select 1 from pg_index where indexrelid = to_regclass('public.ledger_buyins_request_uniq')
                    and indisunique and indisvalid and indisready)
     or lower(v_def) not like '%unique%'
     or lower(v_def) not like '%(request_id)%'
     or lower(v_def) not like '%request_id is not null%' then
    raise exception 'ABORT: 요청당 확정 바인 1건 유니크가 올바르지 않습니다 — %', coalesce(v_def, 'missing');
  end if;
end $request_uniq_check$;
