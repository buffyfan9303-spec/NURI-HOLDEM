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
      -- #8 — 이용권으로 애드온: 그 손님의 애드온이 아직 없는 가장 최근 바인 행에 붙인다(새 바인·엔트리를 만들지 않는다).
      --   금액·애드온 게임·가격 검사는 BEFORE 트리거 _ledger_buyin_addon_rule 이 한다(여기서 두 번 쓰지 않는다).
      select b.id into v_target
        from ledger_buyins b
       where b.venue_id = r.venue_id and b.session_date = r.session_date and b.game_seq = p_game_seq
         and b.player_name = r.player_name and b.addon_method is null
       order by b.entry_no desc
       limit 1
       for update;
      if v_target is null then
        raise exception '이 손님의 바인 기록이 없어 애드온을 붙일 수 없습니다 — 먼저 바인을 기록하거나 바인으로 승인하세요';
      end if;
      update ledger_buyins set addon_method = 'ticket', addon_unpaid = false where id = v_target;
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
