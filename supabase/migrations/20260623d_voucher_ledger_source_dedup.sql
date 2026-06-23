-- 2026-06-23 이용권 정산 정합성 (감사 #9, #18)
-- #18 이용권→장부요청 출처 추적: voucher_id 컬럼 + 부분 유니크(같은 이용권 중복 요청 차단)
alter table public.ledger_buyin_requests add column if not exists voucher_id uuid;
create unique index if not exists uniq_ledger_req_voucher on public.ledger_buyin_requests(voucher_id) where voucher_id is not null;

-- #18+#9 트리거: voucher_id 채우고 동일 이용권 중복요청 방지(not exists 가드 + 위 유니크 백스톱)
create or replace function public.voucher_redeem_to_ledger_request()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.status = 'used' and (old.status is distinct from 'used') and new.used_venue_id is not null then
    insert into public.ledger_buyin_requests(venue_id, session_date, user_id, player_name, note, status, voucher_id)
    select
      new.used_venue_id,
      (now() at time zone 'Asia/Seoul')::date,
      new.holder_user_id,
      coalesce(nullif(btrim(new.holder_name), ''), '이용권 사용자'),
      '🎟 이용권 사용 — ' || coalesce(nullif(btrim(new.title), ''), '매장이용권') || ' · 수량/현금 확인 후 승인',
      'pending',
      new.id
    where not exists (select 1 from public.ledger_buyin_requests where voucher_id = new.id);
  end if;
  return new;
end; $function$;

-- #9 승인 시 이용권 출처 요청은 유료 바인으로 기록하지 않음(머니인/바인왕 집계 부풀림 차단).
--   플레이어는 세션(ledger_players)에 그대로 추가되되 유료 바인(ledger_buyins)은 강제 미기록.
--   추가된 가드 1줄 외 원본과 동일.
create or replace function public.approve_buyin_request(p_request_id uuid, p_game_seq smallint DEFAULT 1, p_record_buyin boolean DEFAULT false, p_pay_method text DEFAULT 'cash'::text, p_split boolean DEFAULT false, p_cash integer DEFAULT 0, p_card integer DEFAULT 0, p_transfer integer DEFAULT 0)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare r ledger_buyin_requests; v_sort int; v_amt int; v_entry int; v_pm text := lower(coalesce(p_pay_method, 'cash'));
begin
  select * into r from ledger_buyin_requests where id = p_request_id;
  if not found then raise exception '요청을 찾을 수 없습니다'; end if;
  if not can_access_ledger(r.venue_id) then raise exception '권한이 없습니다'; end if;
  if r.status <> 'pending' then raise exception '이미 처리된 요청입니다'; end if;
  if r.voucher_id is not null then p_record_buyin := false; end if;  -- #9 이용권은 무료입장: 유료 바인 미기록
  if not exists (select 1 from ledger_players lp where lp.venue_id = r.venue_id and lp.session_date = r.session_date and lp.game_seq = p_game_seq and lp.name = r.player_name) then
    select coalesce(max(sort_order) + 1, 0) into v_sort from ledger_players where venue_id = r.venue_id and session_date = r.session_date and game_seq = p_game_seq;
    insert into ledger_players (venue_id, session_date, game_seq, name, sort_order, created_by) values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_sort, auth.uid());
  end if;
  if p_record_buyin then
    select coalesce(buyin_amount, 0) into v_amt from ledger_sessions where venue_id = r.venue_id and session_date = r.session_date and game_seq = p_game_seq;
    select coalesce(max(entry_no), 0) + 1 into v_entry from ledger_buyins where venue_id = r.venue_id and session_date = r.session_date and game_seq = p_game_seq and player_name = r.player_name;
    if p_split then
      v_pm := case when coalesce(p_card,0) >= coalesce(p_cash,0) and coalesce(p_card,0) >= coalesce(p_transfer,0) and coalesce(p_card,0) > 0 then 'card'
                   when coalesce(p_transfer,0) > coalesce(p_cash,0) and coalesce(p_transfer,0) > 0 then 'transfer' else 'cash' end;
      insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method, is_split, cash_amount, card_amount, transfer_amount, created_by)
      values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, v_pm, true, coalesce(p_cash,0), coalesce(p_card,0), coalesce(p_transfer,0), auth.uid());
    else
      if v_pm not in ('cash','card','transfer') then v_pm := 'cash'; end if;
      insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method, cash_amount, card_amount, transfer_amount, created_by)
      values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, v_pm,
              case when v_pm = 'cash' then coalesce(v_amt, 0) else 0 end,
              case when v_pm = 'card' then coalesce(v_amt, 0) else 0 end,
              case when v_pm = 'transfer' then coalesce(v_amt, 0) else 0 end, auth.uid());
    end if;
  end if;
  update ledger_buyin_requests set status = 'approved', game_seq = p_game_seq, resolved_at = now(), resolved_by = auth.uid() where id = p_request_id;
end; $function$;
