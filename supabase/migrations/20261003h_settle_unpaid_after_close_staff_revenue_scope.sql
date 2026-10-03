-- 20261003h — 마감 뒤 미수 회수(Q2) · 직원 매출 합계 서버 차단(Q3)
-- ⏳ 적용 전 — 리드 적용 예정(화면 PR 병합 직전). 라이브 미적용. (store-team 2026-10-03 v2, critical-reviewer F1·F2 반영)
-- 리허설: Documents\누리홀덤_영상분석_0930\settle-auth-1003 — node rehearse.mjs R0_helpers_baseline.sql <이 파일> R1_tests.sql → REHEARSAL_OK(56항목), 음성 변형 8종 전부 실패 확인.
-- 요구: 오너 2026-10-03
--   Q2 "게임이 완전히 마감된 뒤의 손님 미수는 직원도 받을 수 있지만 비밀번호를 입력해야 한다."
--   Q3 "직원에게 매출 합계는 숨겨." (서버까지)
-- 근거 관찰: dummy-1003/REPORT.md O1(마감 뒤 미수 회수는 업주가 마감을 풀어야만 가능) · O2(장부 직원이 매출 전체를 읽음).
--
-- 새로 만드는 것만 있다 — 기존 함수 본문은 건드리지 않는다(라이브 정의가 정본: pg_get_functiondef 패치 불필요).
--   A. settle_unpaid_after_close(p_id, p_method, p_password, p_part)   — 신규 RPC
--   B. ledger_buyins 정책 lb_select 교체                                 — 직원 행 범위 축소
--   C. ledger_buyin_counts(p_venue_id, p_from, p_to) · ledger_dow_avg_buyins(p_venue_id) · venue_regulars(p_venue_id) — 신규 읽기 RPC(금액 없음)
--   개정 2026-10-03 오후: critical-reviewer F1(정책 to authenticated · SELECT 정책 1개 단언) · F2 리드 결정(직원 횟수 응답 축소) · 애드온 오류 문구
--
-- 비밀번호 규칙은 기존 _ledger_require_cancel_auth 를 그대로 부른다(20260925e/f D4 — 취소·감액·플레이어 삭제와 한 규칙):
--   관리자 통과 · 비밀번호 미설정 매장은 can_manage_pos(업주·승인 공동운영자)만 비밀번호 없이 · 설정 매장은 업주 포함 누구나 비밀번호.
--   → 직원은 항상 비밀번호가 필요하고(미설정 매장이면 업주가 먼저 설정해야 함), 업주도 설정 매장에서는 비밀번호를 넣는다.
--   5회 오입력 10분 잠금도 같은 카운터를 쓴다.
--
-- 적용 전 확인(쓰기 없음):
--   select count(*) from pg_proc where proname in ('settle_unpaid_after_close','ledger_buyin_counts','venue_regulars')
--     and pronamespace = 'public'::regnamespace;                                   -- 기대 0
--   select qual from pg_policies where tablename='ledger_buyins' and policyname='lb_select';  -- 기대 'can_access_ledger(venue_id)'

-- ─────────────────────────────────────────────────────────────────────────────
-- A. 마감된 장부의 미수 → 완납 전환
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.settle_unpaid_after_close(
  p_id uuid, p_method text, p_password text, p_part text default 'all')
 returns jsonb
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  r public.ledger_buyins; x public.ledger_buyins;
  v_price numeric; v_discs jsonb; v_closed boolean;
  o bigint[]; n bigint[];
  v_b boolean; v_a boolean; v_addon_won bigint := 0;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다' using errcode = '42501'; end if;
  if p_method is null or p_method not in ('cash', 'card', 'transfer') then
    raise exception '받은 방법은 현금·카드·이체 중 하나여야 합니다' using errcode = '22023';
  end if;
  if p_part is null or p_part not in ('buyin', 'addon', 'all') then
    raise exception '회수할 항목이 올바르지 않습니다' using errcode = '22023';
  end if;

  select * into r from public.ledger_buyins where id = p_id for update;
  if not found then raise exception '기록을 찾을 수 없습니다 — 화면을 새로 불러와 주세요' using errcode = 'P0002'; end if;
  if not coalesce(public.can_access_ledger(r.venue_id), false) then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
  -- 세션 행을 공유 잠금 — 회수하는 동안 다른 창의 마감 해제·가격 변경이 끼어들지 못한다.
  select s.closed, s.buyin_amount, s.discounts into v_closed, v_price, v_discs
    from public.ledger_sessions s
   where s.venue_id = r.venue_id and s.session_date = r.session_date and s.game_seq = r.game_seq
   for share;
  if coalesce(v_closed, false) is not true then
    raise exception '마감 전 장부의 미수는 장부 화면에서 바로 바꾸세요' using errcode = '55000', hint = 'LEDGER_NOT_CLOSED';
  end if;

  v_b := p_part in ('buyin', 'all')
         and (coalesce(r.is_unpaid, false) or (coalesce(r.is_split, false) and coalesce(r.unpaid_amount, 0) > 0));
  v_a := p_part in ('addon', 'all') and r.addon_method is not null and coalesce(r.addon_unpaid, false);
  if not (v_b or v_a) then
    raise exception '이 기록에는 받을 미수가 없습니다' using errcode = '22023', hint = 'LEDGER_NOTHING_UNPAID';
  end if;
  -- 접수대 이용권 승인 전액 행은 결제수단·미수를 못 바꾼다(client_guard·update_ledger_buyin_reduce 와 같은 잠금).
  if v_b and r.request_id is not null and coalesce(r.ticket_count, 0) > 0 and not coalesce(r.is_split, false) then
    raise exception '이용권으로 승인한 바인은 결제 수단을 바꿀 수 없습니다. 바인을 취소한 뒤 다시 승인하십시오.' using errcode = '42501';
  end if;

  perform public._ledger_require_cancel_auth(r.venue_id, p_password);

  x := r;
  if v_b then
    if coalesce(r.is_split, false) then
      -- 분납: 미수 몫만 받은 수단 칸으로 옮긴다. 합계는 그대로(금액 규칙이 다시 검사).
      if p_method = 'cash' then x.cash_amount := coalesce(x.cash_amount, 0) + r.unpaid_amount;
      elsif p_method = 'card' then x.card_amount := coalesce(x.card_amount, 0) + r.unpaid_amount;
      else x.transfer_amount := coalesce(x.transfer_amount, 0) + r.unpaid_amount; end if;
      x.unpaid_amount := 0;
    else
      x.payment_method := p_method;
      x.is_unpaid := false;
    end if;
    x := public._ledger_buyin_apply_amount_rule(x);
  end if;
  if v_a then
    x.addon_method := p_method;
    x.addon_unpaid := false;
    v_addon_won := greatest(0, coalesce(r.addon_amount, 0) - least(coalesce(r.addon_amount, 0), coalesce(r.addon_ticket_count, 0)::bigint * 10000));
  end if;

  -- 불변식(바인): 총액·이용권 몫 그대로, 미수는 회수한 부분만 0 이 되고 그만큼 완납이 는다.
  o := public._ledger_buyin_tiers(r, v_price, v_discs);
  n := public._ledger_buyin_tiers(x, v_price, v_discs);
  if n[3] is distinct from o[3] or (n[2] - n[1]) is distinct from (o[2] - o[1])
     or (v_b and n[3] <> n[2]) or (not v_b and (n[3] - n[2]) is distinct from (o[3] - o[2])) then
    raise exception '회수하면 기록 금액이 바뀝니다(기록 %원 → %원) — 업주가 마감을 풀어 확인해야 합니다', o[3], n[3]
      using errcode = '23514', hint = 'LEDGER_SETTLE_AMOUNT_CHANGED';
  end if;

  update public.ledger_buyins set
    payment_method = x.payment_method, is_unpaid = coalesce(x.is_unpaid, false),
    cash_amount = coalesce(x.cash_amount, 0), card_amount = coalesce(x.card_amount, 0), transfer_amount = coalesce(x.transfer_amount, 0),
    unpaid_amount = coalesce(x.unpaid_amount, 0),
    addon_method = x.addon_method, addon_unpaid = coalesce(x.addon_unpaid, false)
   where id = p_id
  returning * into x;

  -- 불변식(애드온): 트리거가 가격을 다시 읽어도 금액·이용권 연결·몫은 그대로여야 한다.
  if (x.addon_amount, x.addon_request_id, x.addon_ticket_count) is distinct from (r.addon_amount, r.addon_request_id, r.addon_ticket_count) then
    raise exception '회수하면 애드온 기록이 바뀝니다(금액 %원 → %원, 이용권 %장 → %장, 이용권 연결 %) — 업주가 마감을 풀어 확인해야 합니다',
      r.addon_amount, x.addon_amount, coalesce(r.addon_ticket_count, 0), coalesce(x.addon_ticket_count, 0),
      case when x.addon_request_id is not distinct from r.addon_request_id then '그대로' else '끊김' end
      using errcode = '23514', hint = 'LEDGER_SETTLE_AMOUNT_CHANGED';
  end if;

  -- 감사 기록: 누가·언제(created_at)·얼마. audit_log 는 관리자만 읽는다(정책 audit_log_admin_select).
  insert into public.audit_log (actor_id, action, target, meta)
  values (auth.uid(), 'ledger_settle_unpaid_after_close', p_id::text,
          jsonb_build_object('venue_id', r.venue_id, 'session_date', r.session_date, 'game_seq', r.game_seq,
                             'method', p_method, 'part', p_part,
                             'buyin_won', case when v_b then o[3] - o[2] else 0 end, 'addon_won', v_addon_won));

  return jsonb_build_object('id', p_id, 'buyin_won', case when v_b then o[3] - o[2] else 0 end, 'addon_won', v_addon_won, 'method', p_method);
end $function$;
revoke all on function public.settle_unpaid_after_close(uuid, text, text, text) from public, anon;
grant execute on function public.settle_unpaid_after_close(uuid, text, text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- B. 직원(장부 권한만)이 읽을 수 있는 바인 행을 좁힌다
--    업주·공동운영자·관리자(can_manage_pos)는 그대로 전부.
--    직원은 ① 영업일(ledger_business_date — 자정 넘긴 미마감 게임이면 어제) 이후 행
--          ② 아직 마감 안 된 게임의 행(묵은 미마감 게임에서 계속 기록할 수 있게 — 마감하면 사라진다)
--          ③ 미수가 남은 행(마감 뒤 회수 — Q2)
--    한계: ①은 오늘 행이라 직원이 더하면 오늘 합계는 계산된다(장부 작업에 필요한 행이라 서버로 못 막는다).
--    to authenticated (critical F1): anon 은 ledger_business_date·ledger_is_closed 실행권이 없어 정책이 anon 에 걸리면
--      0행 대신 42501 이 난다(로그아웃·토큰 만료 REST·Realtime 이 오류로 바뀜). anon 은 정책 대상이 아니면 오류 없이 0행.
--    OR 순서: 싼 열 비교 먼저(미수 표시·KST 오늘) → DEFINER 함수는 그다음(critical 성능 권고).
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists lb_select on public.ledger_buyins;
create policy lb_select on public.ledger_buyins for select to authenticated using (
  public.can_manage_pos(venue_id)
  or ( public.can_access_ledger(venue_id)
       and ( coalesce(is_unpaid, false) or coalesce(unpaid_amount, 0) > 0 or coalesce(addon_unpaid, false)
             or session_date >= (now() at time zone 'Asia/Seoul')::date
             or session_date >= public.ledger_business_date(venue_id)
             or not public.ledger_is_closed(venue_id, session_date, game_seq) ) )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- C. 금액 없는 집계 — B 때문에 직원 화면에서 사라질 기능을 보존한다.
--    리드 결정(F2, 2026-10-03): 직원이 '지난 날짜 바인 수 × 단가'로 날짜별 매출을 복원하지 못하게 직원 응답을 좁힌다.
--    · ledger_buyin_counts: 업주·공동운영자·관리자(can_manage_pos)는 날짜·게임별 전부(포스터 바인 수·업주 대시보드).
--                           직원은 lb_select 와 같은 범위(영업일 이후 · 미마감 게임)만. 지난 포스터 바인 수는 직원에게 숨김.
--    · ledger_dow_avg_buyins: 요일 평소 엔트리(StoreDashboard 위젯)용 — 같은 요일 지난 3주(오늘 제외 — 화면 last28 창의 같은 요일과 같다) 중 기록 있는 날의
--                           바인 횟수 평균(반올림)만. 창 고정(인자 없음 — 창을 바꿔 부르는 차분으로 날짜별 값이 새지 않게),
--                           기록 있는 날이 2일 미만이면 null(1일이면 평균 = 그날 정확한 횟수라).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.ledger_buyin_counts(p_venue_id uuid, p_from date, p_to date)
 returns table(session_date date, game_seq smallint, buyins bigint)
 language sql stable security definer
 set search_path = public, pg_temp
as $function$
  select b.session_date, b.game_seq, count(*)::bigint
    from public.ledger_buyins b
   where b.venue_id = p_venue_id and b.session_date between p_from and p_to
     and coalesce(public.can_access_ledger(p_venue_id), false)
     and ( coalesce(public.can_manage_pos(p_venue_id), false)
           or b.session_date >= public.ledger_business_date(p_venue_id)
           or not public.ledger_is_closed(p_venue_id, b.session_date, b.game_seq) )
   group by 1, 2 order by 1, 2
$function$;
revoke all on function public.ledger_buyin_counts(uuid, date, date) from public, anon;
grant execute on function public.ledger_buyin_counts(uuid, date, date) to authenticated, service_role;

create or replace function public.ledger_dow_avg_buyins(p_venue_id uuid)
 returns integer
 language sql stable security definer
 set search_path = public, pg_temp
as $function$
  with t as (select (now() at time zone 'Asia/Seoul')::date as d0),
  days as (
    select b.session_date, count(*) as n
      from public.ledger_buyins b, t
     where b.venue_id = p_venue_id
       and b.session_date in (t.d0 - 7, t.d0 - 14, t.d0 - 21)
       and coalesce(public.can_access_ledger(p_venue_id), false)
     group by 1
  )
  select case when count(*) >= 2 then round(avg(n))::integer end from days
$function$;
revoke all on function public.ledger_dow_avg_buyins(uuid) from public, anon;
grant execute on function public.ledger_dow_avg_buyins(uuid) to authenticated, service_role;

create or replace function public.venue_regulars(p_venue_id uuid)
 returns table(name text, buyins bigint, visits bigint)
 language sql stable security definer
 set search_path = public, pg_temp
as $function$
  select btrim(b.player_name), count(*)::bigint, count(distinct b.session_date)::bigint
    from public.ledger_buyins b
   where b.venue_id = p_venue_id and btrim(coalesce(b.player_name, '')) <> ''
     and coalesce(public.can_access_ledger(p_venue_id), false)
   group by 1 order by 2 desc, 3 desc
$function$;
revoke all on function public.venue_regulars(uuid) from public, anon;
grant execute on function public.venue_regulars(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 자가검사 — 하나라도 어긋나면 멈춘다(롤백).
-- ─────────────────────────────────────────────────────────────────────────────
do $check$
declare f record; q text;
begin
  for f in
    select p.oid, p.proname, p.prosecdef, p.proconfig
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('settle_unpaid_after_close', 'ledger_buyin_counts', 'ledger_dow_avg_buyins', 'venue_regulars')
  loop
    if not f.prosecdef then raise exception '20261003h: % 가 SECURITY DEFINER 가 아니다', f.proname; end if;
    if not (f.proconfig @> array['search_path=public, pg_temp']) then raise exception '20261003h: % search_path 미고정', f.proname; end if;
    if has_function_privilege('anon', f.oid, 'execute') then raise exception '20261003h: % 를 anon 이 실행할 수 있다', f.proname; end if;
    if not has_function_privilege('authenticated', f.oid, 'execute') then raise exception '20261003h: % 를 authenticated 가 실행할 수 없다', f.proname; end if;
  end loop;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
        and proname in ('settle_unpaid_after_close', 'ledger_buyin_counts', 'ledger_dow_avg_buyins', 'venue_regulars')) <> 4 then
    raise exception '20261003h: 새 함수 4개가 아니다';
  end if;
  -- 허용 정책은 OR 로 묶인다 — SELECT 를 허용하는 정책이 하나라도 더 붙으면 범위가 조용히 다시 열린다(critical F1-2).
  if (select count(*) from pg_policy where polrelid = 'public.ledger_buyins'::regclass
        and polcmd in ('r', '*') and polpermissive) <> 1 then
    raise exception '20261003h: ledger_buyins 의 SELECT 허용 정책이 정확히 1개가 아니다(%)',
      (select string_agg(polname, ',') from pg_policy where polrelid = 'public.ledger_buyins'::regclass and polcmd in ('r', '*') and polpermissive);
  end if;
  if (select polroles from pg_policy where polrelid = 'public.ledger_buyins'::regclass and polname = 'lb_select')
     is distinct from array['authenticated'::regrole::oid] then
    raise exception '20261003h: lb_select 대상 역할이 authenticated 하나가 아니다';
  end if;
  select pg_get_expr(polqual, polrelid) into q from pg_policy
   where polrelid = 'public.ledger_buyins'::regclass and polname = 'lb_select';
  if q is null or position('can_manage_pos' in q) = 0 or position('ledger_business_date' in q) = 0 or position('unpaid_amount' in q) = 0 then
    raise exception '20261003h: lb_select 정책이 예상과 다르다: %', q;
  end if;
end $check$;
