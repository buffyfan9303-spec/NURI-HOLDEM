-- 장부 서버 경로 3건 — 할인 감사(2026-09-05, 38-에이전트) 확인 결함. 오너 지시 "서버 3건 스스로 수정".
--
-- ① approve_buyin_request 에 할인 파라미터가 없었다.
--    QR 바인요청 승인으로 들어온 바인은 클락 레벨 자동할인이 통째로 빠져, 같은 레벨인데
--    접수대(할인 5만 반영)와 QR 승인(정가)이 다른 금액으로 남았다.
-- ② 같은 함수가 카드 승인에도 **현금단가**를 저장했다(ledger_sessions.card_amount 를 아예 읽지 않음).
--    카드단가 11만 매장이면 QR 카드 1건당 1만원 매출 누락. 현재 카드단가 쓰는 매장 0 → 영향 0, 잠복.
-- ③ send_weekly_venue_reports 가 비분납 현금/카드/이체 매출을 **세션 단가로 재계산**해
--    할인도 스냅샷도 무시했다. 클라(buyinFinance)는 2026-08-18 전환 후 저장 금액이 정본이다.
--
-- 클라 규칙(src/api/ledger.ts nonSplitSnapshot / buyinFinance)을 그대로 미러한다:
--   비분납 현금/카드/이체 : net = greatest(0, 단가 − 할인). 카드 단가 = coalesce(nullif(card_amount,0), buyin_amount).
--   분납                 : 입력 금액이 이미 net(할인이 빠진 실수령액) — 그대로 저장, discount_index 만 기록.
--   티켓                 : 금액 0, discount_index 기록(클라 티켓 버튼이 discIdx 를 받는 것과 같다).
--   스냅샷 판정           : stored = 0 이고 buyin_at < 2026-08-18 인 행만 레거시(세션 단가 재계산).
--
-- ⚠ 시그니처가 바뀐다(p_discount_index 추가). CREATE OR REPLACE 는 새 오버로드를 만들 뿐 옛 8인자
--   함수를 남기므로 PostgREST 가 RPC 호출을 모호하다고 거절한다 → 옛 시그니처를 먼저 DROP 한다.
--   DROP 은 ACL 도 지우므로 REVOKE/GRANT 를 다시 쓴다(라이브 ACL: authenticated · service_role).
--
-- 롤백: 이 파일 아래 '-- ROLLBACK' 블록(옛 본문 그대로)을 실행.

-- ── ① ② approve_buyin_request ────────────────────────────────────────────
drop function if exists public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer);

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
  v_amt int; v_card_unit int; v_discounts jsonb;
  v_disc int := 0; v_idx int := 0; v_unit int; v_net int;
  v_pm text := lower(coalesce(p_pay_method, 'cash'));
begin
  select * into r from ledger_buyin_requests where id = p_request_id;
  if not found then raise exception '요청을 찾을 수 없습니다'; end if;
  if not coalesce(can_access_ledger(r.venue_id), false) then raise exception '권한이 없습니다'; end if;
  if r.status is distinct from 'pending' then raise exception '이미 처리된 요청입니다'; end if;
  if public.ledger_is_closed(r.venue_id, r.session_date, p_game_seq) then
    raise exception '마감된 장부입니다 — 다른 게임을 선택하거나 마감을 해제하세요';
  end if;

  -- 세션 단가 · 카드단가 · 할인 프리셋 — 한 번에 읽는다
  select coalesce(buyin_amount, 0), coalesce(card_amount, 0), coalesce(discounts, '[]'::jsonb)
    into v_amt, v_card_unit, v_discounts
    from ledger_sessions
   where venue_id = r.venue_id and session_date = r.session_date and game_seq = p_game_seq;
  v_amt := coalesce(v_amt, 0); v_card_unit := coalesce(v_card_unit, 0); v_discounts := coalesce(v_discounts, '[]'::jsonb);

  -- 할인 자리번호(1~5) → 금액. 프리셋이 비었거나 0원이면 '할인 없음'으로 기록한다(정가 — 명시적·매장 유리).
  if p_discount_index between 1 and 5 and jsonb_typeof(v_discounts) = 'array' then
    v_disc := coalesce((v_discounts -> (p_discount_index - 1) ->> 'amount')::int, 0);
    if v_disc > 0 then v_idx := p_discount_index; else v_disc := 0; end if;
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
    -- 티켓: 금액 칸은 0(클라 nonSplitSnapshot 과 동일). 할인 자리번호는 기록한다 — 클라 티켓 버튼도 discIdx 를 받는다.
    insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method, discount_index, created_by)
    values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, 'ticket', v_idx, auth.uid());
  end if;

  if p_record_buyin then
    select coalesce(max(entry_no), 0) + 1 into v_entry
      from ledger_buyins where venue_id = r.venue_id and session_date = r.session_date
                           and game_seq = p_game_seq and player_name = r.player_name;
    if p_split then
      v_pm := case when coalesce(p_card,0) >= coalesce(p_cash,0) and coalesce(p_card,0) >= coalesce(p_transfer,0) and coalesce(p_card,0) > 0 then 'card'
                   when coalesce(p_transfer,0) > coalesce(p_cash,0) and coalesce(p_transfer,0) > 0 then 'transfer'
                   else 'cash' end;
      -- 분납: 입력 금액이 이미 net(할인이 빠진 실수령액)이라 그대로. 할인 자리번호만 남긴다.
      insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method, is_split,
                                 cash_amount, card_amount, transfer_amount, discount_index, created_by)
      values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, v_pm, true,
              coalesce(p_cash,0), coalesce(p_card,0), coalesce(p_transfer,0), v_idx, auth.uid());
    else
      if v_pm not in ('cash','card','transfer') then v_pm := 'cash'; end if;
      -- ② 카드는 카드단가(미설정이면 현금단가). 예전엔 무조건 현금단가라 카드단가 매장에서 매출이 샜다.
      v_unit := case when v_pm = 'card' then coalesce(nullif(v_card_unit, 0), v_amt) else v_amt end;
      -- ① 정가 − 할인 = net 을 스냅샷으로 저장(클라 nonSplitSnapshot 과 같은 식).
      v_net  := greatest(0, v_unit - v_disc);
      insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method,
                                 cash_amount, card_amount, transfer_amount, discount_index, created_by)
      values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, v_pm,
              case when v_pm = 'cash'     then v_net else 0 end,
              case when v_pm = 'card'     then v_net else 0 end,
              case when v_pm = 'transfer' then v_net else 0 end,
              v_idx, auth.uid());
    end if;
  end if;

  update ledger_buyin_requests
     set status = 'approved', game_seq = p_game_seq, resolved_at = now(), resolved_by = auth.uid()
   where id = p_request_id;
end;
$$;

revoke all on function public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer) from public, anon;
grant execute on function public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer) to authenticated, service_role;

-- ── ③ send_weekly_venue_reports — 저장 스냅샷을 정본으로 ─────────────────
create or replace function public.send_weekly_venue_reports()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  v_start date; v_end date;
  v_entries int; v_sales bigint; v_new int; v_total_players int;
  v_worst_day text; v_worst_cnt int; v_best_cnt int; v_days int;
  v_advice text;
  v_side_entries int; v_side_sales bigint; v_side_line text;
begin
  v_start := (date_trunc('week', ((now() at time zone 'Asia/Seoul')::date - 7)::timestamp))::date;
  v_end := v_start + 6;
  for v in select id, name, owner_id from public.venues where owner_id is not null loop
    -- 매출 = 실수령(현금+카드+이체). 클라 buyinFinance 와 같은 규칙:
    --   분납·비분납 모두 **저장된 금액(스냅샷)** 이 정본. 2026-08-18 전환 이전에 저장액 0 인
    --   레거시 행만 세션 단가로 재계산(할인·카드단가 반영). 티켓·지원·미수는 0.
    select count(*),
           coalesce(sum(
             case
               when b.payment_method in ('support','ticket') then 0
               when b.is_unpaid then 0
               when (coalesce(b.cash_amount,0) + coalesce(b.card_amount,0) + coalesce(b.transfer_amount,0)) = 0
                    and not b.is_split and b.buyin_at < timestamptz '2026-08-18'
                 then greatest(0,
                        case when b.payment_method = 'card' then coalesce(nullif(s.card_amount, 0), s.buyin_amount) else s.buyin_amount end
                        - coalesce((s.discounts -> (b.discount_index - 1) ->> 'amount')::int, 0))
               else coalesce(b.cash_amount,0) + coalesce(b.card_amount,0) + coalesce(b.transfer_amount,0)
             end), 0)
      into v_entries, v_sales
      from public.ledger_buyins b
      join public.ledger_sessions s on s.venue_id = b.venue_id and s.session_date = b.session_date and s.game_seq = b.game_seq
     where b.venue_id = v.id and b.session_date between v_start and v_end;
    if v_entries = 0 then continue; end if;

    select count(*),
           coalesce(sum(
             case
               when b.payment_method in ('support','ticket') then 0
               when b.is_unpaid then 0
               when (coalesce(b.cash_amount,0) + coalesce(b.card_amount,0) + coalesce(b.transfer_amount,0)) = 0
                    and not b.is_split and b.buyin_at < timestamptz '2026-08-18'
                 then greatest(0,
                        case when b.payment_method = 'card' then coalesce(nullif(s.card_amount, 0), s.buyin_amount) else s.buyin_amount end
                        - coalesce((s.discounts -> (b.discount_index - 1) ->> 'amount')::int, 0))
               else coalesce(b.cash_amount,0) + coalesce(b.card_amount,0) + coalesce(b.transfer_amount,0)
             end), 0)
      into v_side_entries, v_side_sales
      from public.ledger_buyins b
      join public.ledger_sessions s on s.venue_id = b.venue_id and s.session_date = b.session_date and s.game_seq = b.game_seq
     where b.venue_id = v.id and b.session_date between v_start and v_end and b.game_seq > 1;
    if v_side_entries > 0 then
      v_side_line := format(E'\n🎲 사이드 %s건 · 매출 %s만원', v_side_entries, (v_side_sales / 10000)::bigint);
    else
      v_side_line := '';
    end if;

    select count(distinct lp.name) into v_new
      from public.ledger_players lp
     where lp.venue_id = v.id and lp.session_date between v_start and v_end
       and not exists (
         select 1 from public.ledger_players p2
          where p2.venue_id = v.id and p2.name = lp.name and p2.session_date < v_start);
    select count(distinct lp.name) into v_total_players
      from public.ledger_players lp
     where lp.venue_id = v.id and lp.session_date between v_start and v_end;

    select day_label, cnt, max_cnt, n_days into v_worst_day, v_worst_cnt, v_best_cnt, v_days
      from (
        select g.day_label, g.cnt,
               max(g.cnt) over () as max_cnt,
               count(*) over () as n_days
          from (
            select case extract(dow from b.session_date)
                     when 0 then '일' when 1 then '월' when 2 then '화' when 3 then '수'
                     when 4 then '목' when 5 then '금' else '토' end as day_label,
                   count(*) as cnt
              from public.ledger_buyins b
             where b.venue_id = v.id and b.session_date between v_start and v_end
             group by extract(dow from b.session_date)
          ) g
        order by g.cnt asc limit 1
      ) t;

    if v_days >= 2 and v_worst_cnt * 2 < v_best_cnt then
      v_advice := format('%s요일이 약했어요(%s건) — %s요일 프리롤·이벤트로 끌어올려 보세요.', v_worst_day, v_worst_cnt, v_worst_day);
    elsif v_total_players > 0 and v_new * 100 >= v_total_players * 30 then
      v_advice := format('신규 손님이 %s명이나 왔어요 — 첫 방문 쿠폰으로 단골 전환을 노려보세요.', v_new);
    else
      v_advice := '이번 주도 꾸준했어요 — 단골 재방문 이벤트로 한 번 더 끌어올려 보세요.';
    end if;

    insert into public.notifications(user_id, type, title, message, avatar_text, avatar_color)
    values (v.owner_id, 'report',
      '📊 ' || v.name || ' 주간 리포트',
      format('지난주(%s~%s) 엔트리 %s건 · 매출 %s만원 · 신규 손님 %s명%s' || E'\n' || '💡 %s',
             to_char(v_start, 'MM/DD'), to_char(v_end, 'MM/DD'), v_entries, (v_sales / 10000)::bigint, v_new, v_side_line, v_advice),
      '📊', '#FFD100');
  end loop;
end;
$$;

-- CREATE OR REPLACE 는 ACL 을 보존하지만 규약대로 명시한다(크론 전용 — service_role 만).
revoke all on function public.send_weekly_venue_reports() from public, anon, authenticated;
grant execute on function public.send_weekly_venue_reports() to service_role;

-- ROLLBACK (필요 시):
--   drop function public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer);
--   그리고 20260818f_ledger_business_day_and_close_seal.sql 의 approve_buyin_request 본문과
--   20260611d_weekly_report_advice.sql 의 send_weekly_venue_reports 본문을 다시 실행 + 같은 REVOKE/GRANT.
