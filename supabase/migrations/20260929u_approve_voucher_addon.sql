-- ⏸ 초안 — 리드가 리허설 후 적용 (store-team logic 묶음, 2026-09-29). 라이브 미적용.
--    적용 순서: 20260929s·t 다음(독립적이지만 t 가 있으면 애드온 승인 즉시 TV 애드온·총칩이 따라간다).
--    🔴 클라이언트 배포보다 **먼저** 적용한다 — 새 화면의 [애드온] 승인은 p_voucher_use 인자를 보낸다.
--       함수가 없으면 PGRST202 → 화면이 '서버에 애드온 승인 기능이 아직 적용되지 않았습니다' 를 띄운다(바인으로 조용히 떨어지지 않는다).
--       바인 승인(인자 없음)은 적용 전후 모두 그대로 동작한다.
--
-- 요구: 오너 결정 #8(docs/HANDOFF-2026-09-29-results.md §4 #8) — "'애드온 5T 사용': 손님 QR 이용권 사용 요청을
--   **접수대(업주·직원)가 승인할 때 용도(바인/애드온)를 고른다**. 승인 시 애드온이면 장부에 애드온 행 + 이용권 차감 +
--   실시간 이용권 탭 행에 '애드온' 표시." 권한은 기존 승인 권한과 동일.
--
-- 지금(라이브 pg_get_functiondef 2026-09-29): approve_buyin_request 는 이용권 요청(r.voucher_id)이면 **무조건** 티켓 바인 1행을 넣는다.
--   이용권 차감은 손님이 사용을 누를 때 이미 됐다(redeem_my_voucher_by_qr: status active→used, 트리거가 이 요청 행을 만든다).
--
-- 이 파일이 바꾸는 것:
--   1) store_vouchers.used_for text null — 'buyin' | 'addon'. 승인 때 서버가 적는다(레일·이용권 탭이 '애드온' 을 표시).
--      기존 행은 null(= 예전 동작: 표시 없음). 스키마 추가만, 기존 값 불변.
--   2) approve_buyin_request 에 p_voucher_use text default 'buyin' 추가(인자 10개). 서명이 바뀌므로 DROP 후 재생성 —
--      ACL 이 초기화되니 아래 REVOKE/GRANT 로 **라이브와 같은** ACL(postgres·authenticated·service_role, anon·PUBLIC 없음)을 되살린다.
--      · 'buyin'(기본): 예전과 한 글자도 다르지 않다(티켓 바인 1행).
--      · 'addon': 이용권 요청일 때만 허용. 그 손님(같은 게임)의 **애드온이 아직 없는 가장 최근 바인 행**에 이용권 애드온을 붙인다
--        (addon_method='ticket'). 금액·애드온 게임 여부·가격 검사는 기존 트리거 _ledger_buyin_addon_rule 이 그대로 한다
--        (애드온 게임이 아니면·가격이 없으면 23514 로 거절 → 요청은 pending 그대로, 이용권도 그대로 used).
--        바인 행이 없으면 거절('먼저 바인을 기록하거나 바인으로 승인하세요').
--      · 이용권 요청이 아닌데 'addon' → 22023 거절(돈 받은 애드온은 장부 결제 모달이 따로 한다).
--   권한 줄·마감 검사·세션 검사·분납 검사는 그대로(한 글자도 바꾸지 않았다).
--
-- 리허설 시나리오(라이브 begin … rollback, nuri-migration §5):
--   R0 롤백 프로브 · 업주 1·ledger_access 직원 1·다른 매장 업주 1 을 역할/소유 조회로 고른다.
--      애드온 게임 세션(is_addon=true, addon_amount 50000) 1개와 손님 A 의 바인 1행, A 의 이용권(active)을 리허설 안에서 만든다.
--   R1 양성(애드온) — A 로 redeem_my_voucher_by_qr → 요청 1행 pending → 업주로
--      approve_buyin_request(req, seq, false, 'cash', false, 0,0,0, 0, 'addon') → A 의 바인 행 addon_method='ticket', addon_amount=50000,
--      ledger_buyins 행 수 불변(새 바인 없음), store_vouchers.used_for='addon', 요청 approved.
--   R2 양성(바인, 인자 없음 = 예전 호출) — 같은 절차로 9인자 호출 → 티켓 바인 1행 추가, used_for='buyin'.
--   R3 양성 대조 — ledger_access 위임 직원도 R1 통과.
--   R4 음성 — 비애드온 게임에서 'addon' → 23514 · 바인 없는 손님 'addon' → 거절 · 이용권 아닌 요청 'addon' → 22023 ·
--      p_voucher_use='x' → 22023 · 다른 매장 업주 → '권한이 없습니다' · 비로그인 → 거절. 거절 뒤 요청 pending·이용권 used 그대로.
--   R5 ACL — anon execute=false, authenticated=true, PUBLIC 미부여, 옛 9인자 서명 0개(pg_proc 에 approve_buyin_request 1개).
--   R6 기존 행 불변 — store_vouchers·ledger_buyins md5(롤백 후) 동일. used_for 기존 행 전부 null.
--   R7 어드바이저 보안 ERROR 0.
--   R8 RISK-A(critical 2026-09-29) — 손님 1바인(애드온 없음)+2바인(애드온 현금)에 이용권 애드온 승인 → 거절(P0001), 행 1:-,2:cash 그대로,
--      요청 pending·이용권 used 그대로. 최신 행이 애드온 없음이면 그 행에 붙는다(A 2바인).
--   R9 RISK-B — 애드온 이용권이 붙은 행 삭제 → 이용권 active·used_for null·요청 voucher_id null /
--      애드온만 제거(addon_method=null) → 이용권 active·연결 null / 화면(authenticated)이 addon_request_id 를 바꾸거나 지우면 42501 /
--      바인 승인분(request_id) 복원 경로 불변(active).
--   ▶ store-team 실측(2026-09-29, 라이브 DO 블록 + 끝 RAISE 로 전량 롤백, s·t 적용된 라이브 위):
--      수정 전 u: A 반례 격리 실행 `1:ticket,2:cash`(옛 1바인에 붙음) · 행 삭제 뒤 이용권 used · 애드온 제거 뒤 used · 화면 연결 변경 42703(열 없음).
--      수정 후 u: ACL anon=f auth=t 내부함수 auth=f · A1 거절 P0001 rows=1:-,2:cash req=pending v=used · A2 1:ticket,2:ticket ·
--      B1 active/-/null · B2 active/null · B3 42501 · B3b 42501 · B4 바인분 active · B5 active. 생성기: scratchpad/lg/rh/(build-logic-rh.cjs + slim.sql).
--
-- 적용 전 실측(2026-09-29 SELECT 만): approve_buyin_request 1개(9인자) ACL {postgres,authenticated,service_role} ·
--   ledger_buyin_requests 0행 · store_vouchers CHECK 는 issue_reason 뿐.

alter table public.store_vouchers add column if not exists used_for text;
do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 'store_vouchers_used_for_chk' and conrelid = 'public.store_vouchers'::regclass) then
    alter table public.store_vouchers add constraint store_vouchers_used_for_chk check (used_for is null or used_for in ('buyin', 'addon'));
  end if;
end $c$;
comment on column public.store_vouchers.used_for is
  '#8(2026-09-29) 접수대 승인 때 고른 용도(buyin|addon). approve_buyin_request 만 쓴다. null = 이 기능 이전 사용분 또는 아직 승인 전.';

-- 🔴 RISK-B(critical 리허설 U7) — 애드온으로 승인된 이용권의 연결·복원. 바인 승인은 ledger_buyins.request_id 로 연결되고
--   취소·삭제 RPC 4곳(cancel_ledger_buyin·cancel_my_recent_buyin·delete_ledger_player·delete_ledger_session)이
--   `returning request_id` → _restore_voucher_for_request 로 되돌린다. 애드온은 기존 행에 붙으므로 request_id 칸을 쓸 수 없다
--   (그 칸은 그 행의 바인 요청 몫). 그래서 같은 모양의 칸(addon_request_id)을 두고, 되돌리기는 **같은 함수**
--   _restore_voucher_for_request 로 한다. 호출 자리는 RPC 4곳을 고치는 대신 행 트리거 하나 — 삭제 경로·애드온 제거·
--   이용권 아닌 수단으로 바꾸기를 한 번에 덮는다. 기존 바인 복원 경로(request_id)는 한 줄도 바꾸지 않는다.
alter table public.ledger_buyins add column if not exists addon_request_id uuid;
comment on column public.ledger_buyins.addon_request_id is
  '#8(2026-09-29) 이 행의 애드온을 이용권 요청으로 승인했을 때 그 요청 id. approve_buyin_request 만 쓴다. 행 삭제·애드온 제거 시 이용권 복원.';

-- 화면이 연결을 만들거나 바꾸지 못하게(request_id 와 같은 규칙 — _ledger_buyins_client_guard 는 그대로 두고 옆에 둔다).
create or replace function public._ledger_buyins_addon_request_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.addon_request_id is distinct from (case when tg_op = 'UPDATE' then old.addon_request_id end) then
    -- 지우기(null)도 막는다 — 화면이 연결만 끊으면 애드온은 남고 이용권만 되살아난다(공짜 애드온). 끊기는 복원 트리거만 한다.
    raise exception '애드온 요청 연결은 서버만 설정할 수 있습니다' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public._ledger_buyins_addon_request_guard() from public, anon, authenticated;
drop trigger if exists ledger_buyins_addon_request_guard on public.ledger_buyins;
create trigger ledger_buyins_addon_request_guard before insert or update of addon_request_id on public.ledger_buyins
  for each row execute function public._ledger_buyins_addon_request_guard();

-- 복원: 행이 지워지거나, 애드온이 빠지거나, 이용권이 아닌 수단으로 바뀌면 그 요청의 이용권을 되돌리고 연결을 끊는다.
create or replace function public._ledger_buyins_addon_voucher_restore()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_voucher uuid;
begin
  if old.addon_request_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and new.addon_method is not distinct from 'ticket'
     and new.addon_request_id is not distinct from old.addon_request_id then
    return new;   -- 애드온 이용권이 그대로 붙어 있다
  end if;
  select voucher_id into v_voucher from public.ledger_buyin_requests where id = old.addon_request_id;
  perform public._restore_voucher_for_request(old.addon_request_id);
  if v_voucher is not null then
    update public.store_vouchers set used_for = null where id = v_voucher and status = 'active';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.addon_request_id := null;
  return new;
end $$;
revoke all on function public._ledger_buyins_addon_voucher_restore() from public, anon, authenticated;
drop trigger if exists trg_ledger_buyins_addon_voucher_restore on public.ledger_buyins;
create trigger trg_ledger_buyins_addon_voucher_restore before update of addon_method, addon_request_id or delete on public.ledger_buyins
  for each row execute function public._ledger_buyins_addon_voucher_restore();

drop function if exists public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer);

create function public.approve_buyin_request(
  p_request_id uuid, p_game_seq smallint default 1, p_record_buyin boolean default false, p_pay_method text default 'cash'::text,
  p_split boolean default false, p_cash integer default 0, p_card integer default 0, p_transfer integer default 0,
  p_discount_index integer default 0, p_voucher_use text default 'buyin'::text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
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
begin
  select * into r from ledger_buyin_requests where id = p_request_id for update;
  if not found then raise exception '요청을 찾을 수 없습니다'; end if;
  if not coalesce(can_access_ledger(r.venue_id), false) then raise exception '권한이 없습니다'; end if;
  if r.status is distinct from 'pending' then raise exception '이미 처리된 요청입니다'; end if;
  -- #8 용도 검사 — 권한 검사 뒤(권한 없는 호출자에게 요청의 성격을 알려 주지 않는다).
  if v_use not in ('buyin', 'addon') then
    raise exception '이용권 용도가 올바르지 않습니다' using errcode = '22023';
  end if;
  if v_use = 'addon' and r.voucher_id is null then
    raise exception '이용권 사용 요청만 애드온으로 승인할 수 있습니다' using errcode = '22023';
  end if;
  if public.ledger_is_closed(r.venue_id, r.session_date, p_game_seq) then
    raise exception '마감된 장부입니다 — 다른 게임을 선택하거나 마감을 해제하세요';
  end if;

  select coalesce(buyin_amount, 0), coalesce(discounts, '[]'::jsonb)
    into v_amt, v_discounts
    from ledger_sessions
   where venue_id = r.venue_id and session_date = r.session_date and game_seq = p_game_seq;
  v_has_session := FOUND;
  v_amt := coalesce(v_amt, 0); v_discounts := coalesce(v_discounts, '[]'::jsonb);

  -- 🔴 C① 2026-09-17: 세션 행이 없어도 v_amt 가 0 으로 떨어져 **0원 바인이 영구 기록**됐다.
  --   대시보드 QR 위젯은 장부를 안 열어도(클락만 켜도) 승인 버튼을 띄우므로 실제로 닿는 경로다.
  if (p_record_buyin or r.voucher_id is not null) and not v_has_session then
    raise exception '이 게임의 장부가 아직 열려 있지 않습니다 — 장부에서 게임을 먼저 여세요';
  end if;
  if p_record_buyin and not p_split and v_amt <= 0 then
    raise exception '참가비가 0원입니다 — 장부에서 참가비를 먼저 입력하세요';
  end if;

  if p_discount_index between 1 and 5 and jsonb_typeof(v_discounts) = 'array' then
    v_disc := coalesce((v_discounts -> (p_discount_index - 1) ->> 'amount')::int, 0);
    if v_disc > 0 then v_idx := p_discount_index; v_disc := least(v_disc, v_amt); else v_disc := 0; end if;
  end if;

  -- 🔴 C② 분납은 서버 검증이 0 이었다. 장부 화면은 이미 합계 일치를 강제한다 — 같은 규칙을 서버에도.
  if p_record_buyin and p_split then
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
    p_record_buyin := false;
    if v_use = 'addon' then
      -- #8 — 이용권으로 애드온: 그 손님의 **가장 최근 바인 한 행**에만 붙인다(새 바인·엔트리를 만들지 않는다).
      --   🔴 RISK-A(critical 리허설 U6): '애드온 없는 가장 최근' 으로 고르면 2바인에 이미 애드온이 있을 때 옛 1바인으로
      --   내려가 붙었다(1:ticket,2:cash). 최신 행이 이미 애드온이면 거절한다 — 요청은 pending, 이용권은 used 그대로.
      --   금액·애드온 게임·가격 검사는 BEFORE 트리거 _ledger_buyin_addon_rule 이 한다(여기서 두 번 쓰지 않는다).
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
      -- 🔴 RISK-B — 바인 승인(request_id)과 같은 방식으로 요청을 행에 연결한다(addon_request_id).
      --   이 행이 지워지거나 애드온이 빠지면 trg_ledger_buyins_addon_voucher_restore 가 이용권을 되돌린다.
      update ledger_buyins set addon_method = 'ticket', addon_unpaid = false, addon_request_id = r.id where id = v_target;
    else
      select coalesce(max(entry_no), 0) + 1 into v_entry
        from ledger_buyins where venue_id = r.venue_id and session_date = r.session_date
                             and game_seq = p_game_seq and player_name = r.player_name;
      insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method, discount_index, created_by, request_id)
      values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, 'ticket', v_idx, auth.uid(), r.id);
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
