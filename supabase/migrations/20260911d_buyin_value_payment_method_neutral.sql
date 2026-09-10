-- 20260911d — 서버 바인 기록을 클라이언트 계산 정본과 맞춘다 (오너 지시 2026-09-11)
--
-- ⚠ 선행: 20260911c (ledger_buyins.request_id 와 그 링크를 넣는 approve_buyin_request).
--    이 파일은 **c 의 함수 본문 위에** 두 줄만 얹은 것이다 — request_id 링크를 그대로 들고 간다.
--    (처음엔 20260911a 로 썼다가 c 보다 앞서 정렬돼 c 를 되돌리는 것을 발견하고 d 로 옮겼다.)
--
-- 배경 — 클라이언트가 바뀌었다
--   2026-09-11 장부 규칙 정리: 정상가는 세션 **현금 단가**이고 **결제수단이 이를 바꾸지 않는다.**
--   할인은 금액에서만 차감하며 정가를 넘지 못한다.
--   클라이언트(src/api/ledger.ts nonSplitSnapshot·discountOf)는 이미 이 규칙으로 기록한다.
--   서버 RPC 가 예전 규칙을 쓰면 **같은 손님이 QR 승인이냐 접수대 입력이냐에 따라 장부 금액이 달라진다.**
--
-- 바꾸는 것 (본문 세 줄)
--   ① approve_buyin_request : 카드 행 단가 card_amount → buyin_amount
--   ② approve_buyin_request : v_disc := least(v_disc, v_amt)  (음수 가치 방지)
--   ③ send_weekly_venue_reports : 레거시 분기 카드 단가 통일 + **discount_index >= 1 가드**
--      ③의 가드는 별개의 실제 버그다 — `s.discounts -> (0 - 1)` 은 jsonb 음수 인덱스라
--      **마지막 할인 프리셋**을 집는다(PG 11+ 동작 확인). 다만 이 식은 레거시 분기 안에만 있고
--      운영에 해당 행이 0건이라 **실제 매출 피해는 없었다** — 예방 수정이다(2곳).
--
-- 바꾸지 않는 것
--   · 함수 시그니처·인자 기본값·반환 타입(void) · DROP 하지 않음
--   · can_access_ledger 권한 검사 · status='pending' 가드 · ledger_is_closed 마감 가드
--   · SECURITY DEFINER · set search_path = public, pg_temp
--   · **c 가 넣은 request_id 링크 3곳** (이용권 복원이 여기에 달려 있다)
--   · 머니인 점수식(moneyin_points) — 100만원당 1점 그대로
--   · ledger_sessions.card_amount 컬럼·설정 화면 (수수료 회계용)
--   · 과거 기록 소급 변경 없음(approve 경로) — 저장된 스냅샷이 정본.
--     ⚠ 예외 한 곳: 주간 리포트의 **레거시 재계산 분기**(저장액 0 · 비분납 · 2026-08-18 이전)는
--       과거 주차의 표시 매출을 다시 계산하므로 카드 단가 통일이 그 값을 바꾼다.
--       2026-09-11 운영 실측: card_amount > 0 인 매장 0곳 · ledger_buyins 0행 → 실제 영향 0.
--
-- ⚠ CREATE OR REPLACE 는 ACL 을 초기화한다(nuri-migration §1) — 아래에서 REVOKE/GRANT 재발급.
--
-- 적용 전 확인
--   select id, name from venues v where exists (
--     select 1 from ledger_sessions s where s.venue_id = v.id and coalesce(s.card_amount,0) > 0);
--   → 있으면 그 매장에 '앞으로 카드 바인이 현금 단가로 기록된다'를 먼저 알린다(과거는 불변).
-- 적용 후 확인
--   select proname, proacl from pg_proc where proname in ('approve_buyin_request','send_weekly_venue_reports');
--   어드바이저 보안 ERROR 0 유지.
-- ROLLBACK: 20260911c 의 approve_buyin_request 와 20260905d 의 send_weekly_venue_reports 를 그대로 재실행.

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
  select * into r from ledger_buyin_requests where id = p_request_id;
  if not found then raise exception '요청을 찾을 수 없습니다'; end if;
  if not coalesce(can_access_ledger(r.venue_id), false) then raise exception '권한이 없습니다'; end if;
  if r.status is distinct from 'pending' then raise exception '이미 처리된 요청입니다'; end if;
  if public.ledger_is_closed(r.venue_id, r.session_date, p_game_seq) then
    raise exception '마감된 장부입니다 — 다른 게임을 선택하거나 마감을 해제하세요';
  end if;

  -- 세션 단가 · 할인 프리셋. card_amount 는 더 이상 읽지 않는다(위 ① 참조).
  select coalesce(buyin_amount, 0), coalesce(discounts, '[]'::jsonb)
    into v_amt, v_discounts
    from ledger_sessions
   where venue_id = r.venue_id and session_date = r.session_date and game_seq = p_game_seq;
  v_amt := coalesce(v_amt, 0); v_discounts := coalesce(v_discounts, '[]'::jsonb);

  -- 할인 자리번호(1~5) → 금액. 프리셋이 비었거나 0원이면 '할인 없음'으로 기록한다(정가 — 명시적·매장 유리).
  if p_discount_index between 1 and 5 and jsonb_typeof(v_discounts) = 'array' then
    v_disc := coalesce((v_discounts -> (p_discount_index - 1) ->> 'amount')::int, 0);
    -- 2026-09-11(d): 정가를 넘는 할인은 정가로 자른다(클라 discountOf 와 같은 방어). 음수 가치를 만들지 않는다.
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
    -- 티켓: 금액 칸은 0(클라 nonSplitSnapshot 과 동일). 할인 자리번호는 기록한다 — 클라 티켓 버튼도 discIdx 를 받는다.
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
      -- 분납: 입력 금액이 이미 net(할인이 빠진 실수령액)이라 그대로. 할인 자리번호만 남긴다.
      insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method, is_split,
                                 cash_amount, card_amount, transfer_amount, discount_index, created_by, request_id)
      values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, v_pm, true,
              coalesce(p_cash,0), coalesce(p_card,0), coalesce(p_transfer,0), v_idx, auth.uid(), r.id);
    else
      if v_pm not in ('cash','card','transfer') then v_pm := 'cash'; end if;
      -- 2026-09-11(d): 결제수단은 바인 가치를 바꾸지 않는다(오너 지시) — 카드도 현금 단가로 기록한다.
      --   예전엔 카드만 카드단가를 써서 같은 자리가 카드 손님에게만 더 비싼 바인이 됐고,
      --   클라이언트(nonSplitSnapshot)가 현금 단가로 바뀌면서 서버와 갈렸다.
      --   card_amount 컬럼·설정 화면은 그대로 둔다 — 수수료 회계용이지 정가가 아니다.
      v_unit := v_amt;
      -- ① 정가 − 할인 = net 을 스냅샷으로 저장(클라 nonSplitSnapshot 과 같은 식).
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
   where id = p_request_id;
end;
$$;

-- ── ③ 주간 리포트 — 레거시 분기 카드 단가 · discount_index=0 음수 인덱스 ──
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
                        s.buyin_amount
                        - case when b.discount_index >= 1
                               then least(coalesce((s.discounts -> (b.discount_index - 1) ->> 'amount')::int, 0), s.buyin_amount)
                               else 0 end)
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
                        s.buyin_amount
                        - case when b.discount_index >= 1
                               then least(coalesce((s.discounts -> (b.discount_index - 1) ->> 'amount')::int, 0), s.buyin_amount)
                               else 0 end)
               else coalesce(b.cash_amount,0) + coalesce(b.card_amount,0) + coalesce(b.transfer_amount,0)
             end), 0)
      into v_side_entries, v_side_sales
      from public.ledger_buyins b
      join public.ledger_sessions s on s.venue_id = b.venue_id and s.session_date = b.session_date and s.game_seq = b.game_seq
     where b.venue_id = v.id and b.session_date between v_start and v_end and b.game_seq > 1;
    if v_side_entries > 0 then
      v_side_line := format(E'\n🎲 사이드 %s회 · 매출 %s만원', v_side_entries, (v_side_sales / 10000)::bigint);
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
      -- 2026-09-11(d): v_entries 는 count(*) = **바이인 횟수**다. 예전엔 이걸 '엔트리 N건' 이라 불러
      --   오너 규칙(엔트리 = 실제 지불 가치 ÷ 정상가, 5만 할인이면 0.5)과 이름이 정면으로 어긋났다.
      --   금액 기준 엔트리를 여기서 새로 계산하지는 않는다 — 클라 buyinFinance 를 SQL 에 복제하는
      --   유지보수 부담이 알림 한 줄의 값보다 크다. 필요해지면 그때 넣는다. 지금은 **이름만** 맞춘다.
      format('지난주(%s~%s) 바이인 %s회 · 매출 %s만원 · 신규 손님 %s명%s' || E'\n' || '💡 %s',
             to_char(v_start, 'MM/DD'), to_char(v_end, 'MM/DD'), v_entries, (v_sales / 10000)::bigint, v_new, v_side_line, v_advice),
      '📊', '#FFD100');
  end loop;
end;
$$;

revoke all on function public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer) from public, anon;
grant execute on function public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer) to authenticated, service_role;

revoke all on function public.send_weekly_venue_reports() from public, anon, authenticated;
grant execute on function public.send_weekly_venue_reports() to service_role;

notify pgrst, 'reload schema';
