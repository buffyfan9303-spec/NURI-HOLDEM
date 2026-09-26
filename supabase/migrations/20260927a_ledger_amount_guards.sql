-- ✅ 적용 완료 2026-09-27 (nuri-lead, MCP execute_sql) — §0 게이트(위반 행 0)·§9 자가검사 통과. CHECK 2개 검증됨.
--    리허설(critical-reviewer, 전량 롤백): 티켓+현금 999,999→0, 음수 분납·잘못된 결제수단 거부, 양성 11종·합계 불변, 주간 리포트 = 정산 화면.
-- 20260927a — 장부 금액 불변식 서버 가드 (오너 2026-09-26 "장부에 잘 찍히는지 제대로 확인" 후속)
--
-- 원천: store-team 라이브 리허설 X1·X2·X3 (.claude/agent-memory-local/store-team/ledger_entry_points_verify_2026-09-27.md)
--
-- 1) ledger_buyins 에 CHECK 가 하나도 없었다(PK·FK·UNIQUE 뿐).
--      · 클라 직접 INSERT 로 payment_method 'bitcoin' 이 통과(X3).
--      · 분납 합계만 맞추면 음수가 통과(X2: 현금 −5만 + 카드 10만 = 5만). approve_buyin_request 의 분납 경로도 같은 구멍(합계만 본다).
--      → payment_method ∈ {cash, card, transfer, ticket, support}  (src/api/ledger.ts:10 PaymentMethod 와 같은 집합,
--        update_ledger_buyin_reduce 가 이미 쓰는 화이트리스트와도 같다)
--      → cash/card/transfer/ticket_count/unpaid_amount ≥ 0  (update_ledger_buyin_reduce 의 기존 '금액은 0 이상' 규칙과 같은 칸.
--        ticket_count·unpaid_amount 도 넣은 이유: 분납 합계식에 같이 들어가 −T 로 현금을 부풀리는 같은 부류라서)
--      NOT VALID 로 넣고 §0 에서 라이브 위반 0 을 확인한 뒤 VALIDATE 한다.
-- 2) _ledger_buyin_apply_amount_rule: 분납 아닌 ticket/support 행의 cash/card/transfer 를 0 으로 강제(X1: ticket + 현금 999,999 가 통과).
--      정산(_ledger_buyin_tiers·화면 buyinFinance)은 이 칸을 무시하지만 my_play_history·my_buyin_history 는 그대로 더한다.
--      전이 호출부: _ledger_buyins_client_guard(BEFORE INSERT/UPDATE 트리거, 클라 authenticated/anon 만) ·
--                   update_ledger_buyin_reduce(정의자 RPC). approve_buyin_request 는 정의자라 트리거가 current_user=postgres 로
--                   건너뛰지만 그 함수는 ticket 을 금액 0 으로만 넣는다 — 여기는 1) 의 CHECK 가 막는다.
--      ledger_buyins 트리거는 ledger_buyins_client_guard 하나뿐이다(2026-09-27 실측) — 순서 경합 없음.
-- 3) send_weekly_venue_reports: 분납+미수 행(is_split and is_unpaid — 화면 upsertBuyinSplit 이 unpaidAmount>0 이면 둘 다 true 로 쓴다)의
--      받은 금액(현금+카드+이체)을 `when b.is_unpaid then 0` 이 통째로 버렸다. 정산 화면 settlementReport(buyinFinance.paid)와
--      같은 식인 서버 정본 _ledger_buyin_tiers(...)[1] 로 바꾼다(분납 → 현금+카드+이체 / 지원·티켓 → 0 / 미수 → 0 / 레거시 → 세션 net).
--      바이인 횟수·신규 손님·요일 조언은 그대로.
--
-- 바꾸지 않는 것(보고만):
--   · 분납 아닌 행의 ticket_count·unpaid_amount 는 0 으로 강제하지 않는다 — 라이브에 그런 행이 2개 있다(dddd…0001 매장 2026-09-17).
--     my_play_history·my_buyin_history 는 unpaid_amount 도 더하므로 같은 부류의 오염 경로가 남는다(리드 결정 대기).
--   · 주간 리포트는 정산 화면의 '정산 제외'(방문자 유형·결제수단 제외 키)를 모른다 — 이전과 같다.
--
-- 되돌리기: alter table public.ledger_buyins drop constraint ledger_buyins_payment_method_check, drop constraint ledger_buyins_amounts_nonneg_check;
--           두 함수는 §0 md5 의 이전 본문으로 create or replace(같은 시그니처 → ACL 보존).

-- §0 적용 전 게이트 — 라이브 본문이 예상과 다르거나 위반 행이 있으면 멈춘다(이미 적용된 본문이면 통과 = 재적용 가능)
do $pre$
declare r record; n int;
begin
  for r in select * from (values
      ('public._ledger_buyin_apply_amount_rule(ledger_buyins)',         '4282fb1bdee3e13f6179776db72125c5', true),
      ('public.send_weekly_venue_reports()',                             '0c309ea867e287bcf9cfb7092dacf70b', true),
      -- 아래 둘은 바꾸지 않지만 이 파일의 전제다(트리거 분기·정산 정본)
      ('public._ledger_buyins_client_guard()',                           '5db3b0dacf2a10f29fc8a9c3d582dd51', false),
      ('public._ledger_buyin_tiers(ledger_buyins,numeric,jsonb)',        '3b192cbbe3b1cde4eb78032bfaaad832', false)) t(sig, want, mine)
  loop
    if md5(pg_get_functiondef(r.sig::regprocedure)) <> r.want
       and not (r.mine and pg_get_functiondef(r.sig::regprocedure) like '%20260927a%') then
      raise exception '20260927a: % 라이브 본문이 예상(%)과 다릅니다(%). 본문을 다시 맞추세요',
        r.sig, r.want, md5(pg_get_functiondef(r.sig::regprocedure));
    end if;
  end loop;
  select count(*) into n from public.ledger_buyins
   where payment_method is null or payment_method not in ('cash', 'card', 'transfer', 'ticket', 'support');
  if n > 0 then raise exception '20260927a: 결제수단 위반 행 %개 — 정리 후 적용', n; end if;
  select count(*) into n from public.ledger_buyins
   where cash_amount < 0 or card_amount < 0 or transfer_amount < 0 or ticket_count < 0 or unpaid_amount < 0;
  if n > 0 then raise exception '20260927a: 음수 금액 행 %개 — 정리 후 적용', n; end if;
  select count(*) into n from public.ledger_buyins
   where not is_split and payment_method in ('ticket', 'support')
     and (cash_amount <> 0 or card_amount <> 0 or transfer_amount <> 0);
  if n > 0 then raise exception '20260927a: 분납 아닌 티켓/지원에 금액이 있는 행 %개 — 정리 방침을 먼저 정하세요', n; end if;
end $pre$;

-- §1 CHECK (NOT VALID → VALIDATE)
alter table public.ledger_buyins drop constraint if exists ledger_buyins_payment_method_check;
alter table public.ledger_buyins add constraint ledger_buyins_payment_method_check
  check (payment_method in ('cash', 'card', 'transfer', 'ticket', 'support')) not valid;
alter table public.ledger_buyins drop constraint if exists ledger_buyins_amounts_nonneg_check;
alter table public.ledger_buyins add constraint ledger_buyins_amounts_nonneg_check
  check (cash_amount >= 0 and card_amount >= 0 and transfer_amount >= 0 and ticket_count >= 0 and unpaid_amount >= 0) not valid;
alter table public.ledger_buyins validate constraint ledger_buyins_payment_method_check;
alter table public.ledger_buyins validate constraint ledger_buyins_amounts_nonneg_check;

-- §2 금액 규칙 — 분납 아닌 ticket/support 는 받은 돈 0
create or replace function public._ledger_buyin_apply_amount_rule(b ledger_buyins)
 returns ledger_buyins
 language plpgsql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
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
  elsif b.payment_method in ('ticket', 'support') then
    -- 20260927a: 분납 아닌 이용권·가게지원은 받은 돈이 0 이다. 정산은 이 칸을 무시하지만
    --   my_play_history·my_buyin_history 가 그대로 더하므로 여기서 0 으로 맞춘다(ticket + 현금 999,999 위조 차단).
    b.cash_amount := 0; b.card_amount := 0; b.transfer_amount := 0;
  end if;
  return b;
end $function$;
revoke all on function public._ledger_buyin_apply_amount_rule(ledger_buyins) from public, anon;
-- authenticated 는 유지: 호출자인 트리거 _ledger_buyins_client_guard 가 INVOKER 라 클라 권한으로 이 함수를 부른다(쓰기 없음·STABLE).
grant execute on function public._ledger_buyin_apply_amount_rule(ledger_buyins) to authenticated, service_role;

-- §3 주간 리포트 매출 = 정산 화면 수납액(서버 정본 _ledger_buyin_tiers[1])
create or replace function public.send_weekly_venue_reports()
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
    -- 매출 = 실수령(현금+카드+이체). 20260927a: 정산 화면(buyinFinance.paid)과 같은 서버 정본 _ledger_buyin_tiers[1] 을 쓴다.
    --   예전 CASE 는 `is_unpaid then 0` 이 분납+미수 행의 받은 금액까지 버렸다. 티켓·지원·미수·레거시 규칙은 tiers 가 같은 식으로 가진다.
    select count(*),
           coalesce(sum((public._ledger_buyin_tiers(b, s.buyin_amount, s.discounts))[1]), 0)
      into v_entries, v_sales
      from public.ledger_buyins b
      join public.ledger_sessions s on s.venue_id = b.venue_id and s.session_date = b.session_date and s.game_seq = b.game_seq
     where b.venue_id = v.id and b.session_date between v_start and v_end;
    if v_entries = 0 then continue; end if;

    select count(*),
           coalesce(sum((public._ledger_buyin_tiers(b, s.buyin_amount, s.discounts))[1]), 0)
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

    insert into public.notifications(user_id, type, title, message, avatar_text, avatar_color, link)
    values (v.owner_id, 'system',
      '📊 ' || v.name || ' 주간 리포트',
      -- 2026-09-11(d): v_entries 는 count(*) = 바이인 횟수다. 예전엔 '엔트리 N건' 이라 불러
      --   오너 규칙(엔트리 = 실제 지불 가치 ÷ 정상가, 5만 할인이면 0.5)과 이름이 어긋났다.
      --   금액 기준 엔트리를 여기서 새로 계산하지는 않는다 — 지금은 이름만 맞춘다.
      format('지난주(%s~%s) 바이인 %s회 · 매출 %s만원 · 신규 손님 %s명%s' || E'\n' || '💡 %s',
             to_char(v_start, 'MM/DD'), to_char(v_end, 'MM/DD'), v_entries, (v_sales / 10000)::bigint, v_new, v_side_line, v_advice),
      '📊', '#FFD100', '?tab=my-store');
  end loop;
end;
$function$;
revoke all on function public.send_weekly_venue_reports() from public, anon, authenticated;
grant execute on function public.send_weekly_venue_reports() to service_role;

-- §9 자가검사 — 하나라도 어긋나면 전체를 되돌린다
do $post$
declare a text;
begin
  if (select count(*) from pg_constraint
       where conrelid = 'public.ledger_buyins'::regclass and convalidated
         and conname in ('ledger_buyins_payment_method_check', 'ledger_buyins_amounts_nonneg_check')) <> 2 then
    raise exception '20260927a 자가검사: CHECK 2개가 검증 상태가 아닙니다';
  end if;
  if pg_get_functiondef('public._ledger_buyin_apply_amount_rule(ledger_buyins)'::regprocedure) not like '%20260927a%'
     or pg_get_functiondef('public.send_weekly_venue_reports()'::regprocedure) not like '%_ledger_buyin_tiers(b, s.buyin_amount, s.discounts))[1]%'
     or pg_get_functiondef('public.send_weekly_venue_reports()'::regprocedure) like '%when b.is_unpaid then 0%' then
    raise exception '20260927a 자가검사: 함수 본문이 새 규칙이 아닙니다';
  end if;
  -- 보안 속성: 규칙 함수는 INVOKER·경로 고정, 리포트는 DEFINER·경로 고정
  if (select prosecdef from pg_proc where oid = 'public._ledger_buyin_apply_amount_rule(ledger_buyins)'::regprocedure)
     or not (select prosecdef from pg_proc where oid = 'public.send_weekly_venue_reports()'::regprocedure)
     or exists (select 1 from pg_proc where oid in ('public._ledger_buyin_apply_amount_rule(ledger_buyins)'::regprocedure,
                                                    'public.send_weekly_venue_reports()'::regprocedure)
                  and not (coalesce(proconfig, '{}') @> array['search_path=public, pg_temp'])) then
    raise exception '20260927a 자가검사: SECURITY/search_path 가 예상과 다릅니다';
  end if;
  -- ACL
  if has_function_privilege('anon', 'public._ledger_buyin_apply_amount_rule(ledger_buyins)', 'execute')
     or not has_function_privilege('authenticated', 'public._ledger_buyin_apply_amount_rule(ledger_buyins)', 'execute')
     or has_function_privilege('anon', 'public.send_weekly_venue_reports()', 'execute')
     or has_function_privilege('authenticated', 'public.send_weekly_venue_reports()', 'execute')
     or not has_function_privilege('service_role', 'public.send_weekly_venue_reports()', 'execute') then
    select proacl::text into a from pg_proc where oid = 'public.send_weekly_venue_reports()'::regprocedure;
    raise exception '20260927a 자가검사: ACL 이 예상과 다릅니다(%)', a;
  end if;
  -- 트리거 전제: ledger_buyins 의 사용자 트리거는 client_guard 하나
  if (select count(*) from pg_trigger where tgrelid = 'public.ledger_buyins'::regclass and not tgisinternal) <> 1 then
    raise exception '20260927a 자가검사: ledger_buyins 트리거 구성이 바뀌었습니다 — 규칙 적용 순서를 다시 확인하세요';
  end if;
end $post$;
