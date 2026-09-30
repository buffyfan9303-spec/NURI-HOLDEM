-- ⏳ 미적용 초안 (store-team 작성, 2026-09-30). 적용은 리드가 MCP execute_sql 로. 적용 전 아래 "적용 전 확인" 을 먼저 돈다.
-- 20260930g — KW-1b: 이용권 N장 = 참가 1회(W-01) · 첫 리바인 할인 종류(firstRebuy, PR #60 Fable 관찰 · W-28 후속).
--   요구 원문: .claude/handoff/specs-0930/W-defects.md#W-01 · 오너 결정 2026-09-30(W-01 (다) "게임마다 매장이 'N장 = 참가 1회' 지정,
--   1장 = 1T = 1만원 환산은 장부·정산 유지") · 오너 결정 2026-09-30 F3(정지 계정도 기존 이용권 사용 허용 — 이 파일은 사용 경로를 건드리지 않는다).
--
-- 지금(라이브 2026-09-30 SELECT): 손님이 이용권 k장을 쓰면 장마다 redeem_my_voucher_by_qr → 트리거가 요청 행 k개(voucher_id 1개씩).
--   approve_buyin_request 는 요청 1개 = 티켓 바인 1행(단가 전액) → 키키 "BUY IN 매장이용권 10장" 게임이 **바인 10회·엔트리 10·100T** 가 됐다(W-01 RH2).
--
-- 이 파일이 바꾸는 것
--   §1 ledger_buyin_requests.bundle_request_id uuid null — '이 이용권 요청은 저 요청의 바인 1회에 묶여 승인됐다'. 스키마 추가만(기존 행 null).
--   §2 _restore_voucher_for_request — 바인이 취소·삭제되면(취소 RPC 4곳이 부르는 **같은 함수**) 묶인 장까지 전부 되돌린다.
--      묶음이 없는 요청(기존 전부)은 예전과 한 글자도 다르지 않다.
--   §3 _ledger_buyin_discount_kind_guard — kind 'firstRebuy'(첫 리바인 = 그 손님의 2번째 바인에만) 추가. 기존 rebuy·firstBuyin 규칙 불변.
--   §4 approve_buyin_request(같은 10인자 서명 · create or replace → ACL 보존, 아래 REVOKE/GRANT 재기재)
--      · 참가 1회 장수 N 은 **서버가** 정한다 — 그 게임 장부 세션의 연결 포스터(ledger_sessions.schedule_id → schedules.buy_in.voucherPerEntry).
--        포스터가 **같은 매장**이어야 한다(다른 매장 포스터 = 1). 음 아닌 정수면 100 으로 자르고, 정수가 아니거나 연결이 없으면 N = 1(= 예전 동작).
--        화면이 보낸 값은 쓰지 않는다.
--      · 이용권 요청을 '바인' 으로 승인할 때 N > 1 이면 같은 손님(user_id)·같은 영업일·같은 매장의 **대기 중 이용권 요청** 중
--        오래된 순 N−1 개를 함께 잠가(for update) 묶는다 → 티켓 바인 **1행**(request_id = 이 요청) + 묶인 요청들 approved·bundle_request_id.
--        모자라면 거절(23514, 요청·이용권 그대로) — "이 게임은 이용권 N장이 참가 1회입니다 — 지금 받은 사용 요청은 k장".
--        묶을 후보는 손님이 원한 게임이 없거나(null) 이번 게임과 같은 요청만.
--      · 이미 다른 요청의 묶음으로 승인된 요청을 다시 승인하면 **성공으로 끝낸다**(일괄 승인이 뒤따라 불러도 '실패 9건' 이 되지 않게).
--      · 애드온 용도(p_voucher_use='addon')·현금 바인·N=1 은 예전과 같다. 애드온의 장수 규칙은 오너 미결정 — 1장 그대로.
--      · 두 접수대가 같은 손님의 서로 다른 장을 동시에 승인하면 행 잠금 순서가 엇갈려 한쪽이 deadlock(40P01)으로 실패할 수 있다 —
--        그쪽 요청은 pending 그대로이고 다시 누르면 '이미 묶여 승인됨' 으로 성공한다(데이터 손상 없음).
--
-- 금액: 티켓 바인 가치 = 세션 참가비 − 할인(클라 buyinFinance, 기존 식) → 10만 게임 10장 = 1행 = 10T · 엔트리 1 · 바인 1회.
--   서버는 금액 칸을 쓰지 않는다(티켓 행은 예전처럼 cash/card/transfer 0).
--
-- 적용 전 확인(쓰기 없음, 리드):
--   ① select version(); → 17.x
--   ② select md5(prosrc) from pg_proc where proname='approve_buyin_request'; → 619e033c4c4c5583d289e94dfaceb196 (20260929u 본문, 2026-09-30 store-team 실측)
--      select md5(prosrc) from pg_proc where proname='_restore_voucher_for_request'; → 36a8c2a759b46dd236b67007e3001956
--      select md5(prosrc) from pg_proc where proname='_ledger_buyin_discount_kind_guard'; → 65dc8352b03554f49b8df60f645febaa (20260930e)
--      다르면 누군가 먼저 바꾼 것 — 이 파일 본문을 그 정의와 대조한 뒤 적용한다.
--   ③ select count(*) from information_schema.columns where table_name='ledger_buyin_requests' and column_name='bundle_request_id'; → 0
--
-- 리허설(라이브 한 방 트랜잭션 + 끝 RAISE 로 전량 롤백, 2026-09-30 store-team 실측 · PG 17.6).
--   하네스: scratchpad kw1b/pre.sql(전 시나리오) + 이 파일(줄 주석만 뺀 본문) + kw1b/post.sql(후 시나리오).
--   계정은 역할·소유 조회 후: 업주 = 키키홀덤펍 소유자(admin 나누리) · 손님 = 본인인증 일반 회원 · 음성 = 다른 매장(E2E) 업주.
--   포스터 d0e20929-…-000000000004(키키, 영업일 2026-09-30)의 buy_in 에 voucherPerEntry=10 을 트랜잭션 안에서만 넣었다.
--   PRE(라이브 함수):  10장 사용 → 일괄 승인 ok=10 → 티켓 바인 **10행·엔트리 1~10**(W-01 FAIL 재현) ·
--                      firstRebuy 할인 1·2·3번째 바인 = 1:d1:5만 2:d1:5만 3:d1:5만(전부 할인 = FAIL).
--   POST(이 파일):     a) 5장만 → ERR 23514 '이 게임은 이용권 10장이 참가 1회입니다 — 지금 받은 사용 요청은 5장…' · 0행 · pending 5
--                      c) 다른 매장 업주 → '권한이 없습니다' · 비로그인 → 42501 permission denied
--                      b) 7장 더(대기 12) 일괄 승인 → ok=10 err=2(남은 2장은 모자람 거절) · **1행·엔트리 1** · approved 10 · pending 2 · 묶임 9 · used_for=buyin 10
--                      d) 그 바인 취소(cancel_ledger_buyin) → 묶인 10장 active · 2장 used(대기) · 승인 요청의 voucher 연결 0
--                      e) 대조: 포스터 연결 없는 게임(N=1) 2장 → 2행·엔트리 1,2(예전 동작)
--                      f) firstRebuy = 1:d0:10만 2:d1:5만 3:d0:10만 · ACL approve anon=f auth=t · 복원 함수 auth=f
--   롤백 확인: 프로브 테이블 0 · bundle_request_id 칸 0 · approve md5 619e033c…(그대로) · 포스터 buy_in 원래 값.
--   2차(critical 반영 — 매장 결속 `sc.venue_id = r.venue_id` · 정규식 `^[0-9]+$` + numeric + least 100, 같은 하네스 · 이 파일 §1~§5 본문 그대로):
--      적용 직후 approve md5 = 458be576a8c8bb25de6563d5e989935c(= 이 파일 §4 본문 md5, 붙여 넣은 본문과 파일이 같다는 증거) ·
--      5장 → 23514 거절 · 10장 → ok=10 · **1행·엔트리 1** · 묶임 9 ·
--      다른 매장(퀸) 포스터(N=10)에 키키 세션 연결 → N=1: 2장 = 2행·엔트리 1,2 ·
--      N=1000 → 1장 요청 '이 게임은 이용권 **100장**이 참가 1회…' 거절 · N=99999999999999999999 → 같은 100장(넘침 오류 없음) ·
--      firstRebuy 1:d0:10만 2:d1:5만 3:d0:10만 · ACL anon=f auth=t. 롤백 확인: 프로브 0 · 칸 0 · approve md5 619e033c… · voucherPerEntry 있는 포스터 0.
--   적용 후 기대 md5(prosrc): approve_buyin_request 458be576a8c8bb25de6563d5e989935c · _restore_voucher_for_request 2cbd9085609819e822f43cda2ee36881 ·
--      _ledger_buyin_discount_kind_guard 73eafcc4d5bb18dafbdab86c1a7420ad (파일 본문 그대로 적용했을 때 — 줄 주석을 빼고 넣으면 달라진다).
--   NOT_RUN: 애드온 용도 재리허설(분기 본문 불변 — voucherAddonApprove.test.ts 가 SQL 을 잠근다) · 두 접수대 동시 승인(deadlock) 실측.

-- §1 ── 칸 ─────────────────────────────────────────────────────────────────────────────
alter table public.ledger_buyin_requests add column if not exists bundle_request_id uuid
  references public.ledger_buyin_requests(id) on delete set null;
comment on column public.ledger_buyin_requests.bundle_request_id is
  'W-01(2026-09-30) 이 이용권 요청이 묶여 들어간 바인 요청 id(그 요청의 ledger_buyins.request_id 행 하나가 N장 몫). approve_buyin_request 만 쓴다.';
create index if not exists ledger_buyin_requests_bundle_idx on public.ledger_buyin_requests (bundle_request_id)
  where bundle_request_id is not null;

-- §2 ── 복원(묶인 장까지) ────────────────────────────────────────────────────────────────
create or replace function public._restore_voucher_for_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_voucher uuid; c record;
begin
  if p_request_id is null then return; end if;
  -- W-01 — 이 바인에 묶여 승인된 다른 장들. 본 요청과 같은 조건(사용 매장 = 요청 매장)으로만 되돌린다.
  for c in
    select q.id, q.voucher_id
      from public.ledger_buyin_requests q join public.store_vouchers s on s.id = q.voucher_id
     where q.bundle_request_id = p_request_id and s.used_venue_id = q.venue_id
     for update of q
  loop
    update public.ledger_buyin_requests set voucher_id = null where id = c.id;
    perform public._restore_voucher(c.voucher_id);
  end loop;
  select r.voucher_id into v_voucher
    from public.ledger_buyin_requests r join public.store_vouchers s on s.id = r.voucher_id
   where r.id = p_request_id and s.used_venue_id = r.venue_id;
  if v_voucher is null then return; end if;
  update public.ledger_buyin_requests set voucher_id = null where id = p_request_id;
  perform public._restore_voucher(v_voucher);
end $$;
revoke all on function public._restore_voucher_for_request(uuid) from public, anon, authenticated;
grant execute on function public._restore_voucher_for_request(uuid) to service_role;

-- §3 ── 할인 적용 조건 + 첫 리바인 ──────────────────────────────────────────────────────────
create or replace function public._ledger_buyin_discount_kind_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_discs jsonb; v_kind text;
begin
  if coalesce(new.discount_index, 0) <= 0 then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.discount_index is not distinct from old.discount_index and new.entry_no is not distinct from old.entry_no then
    return new;
  end if;
  select s.discounts into v_discs
    from public.ledger_sessions s
   where s.venue_id = new.venue_id and s.session_date = new.session_date and s.game_seq = new.game_seq;
  if jsonb_typeof(v_discs) is distinct from 'array' or jsonb_array_length(v_discs) < new.discount_index then
    return new;
  end if;
  v_kind := v_discs -> (new.discount_index - 1) ->> 'kind';
  -- ledger.ts discountAllowed 와 같은 규칙: rebuy = 2번째 이후 바인에만 · firstBuyin = 첫 바인에만 · firstRebuy = 2번째 바인에만
  if (v_kind = 'rebuy' and coalesce(new.entry_no, 1) <= 1)
     or (v_kind = 'firstBuyin' and coalesce(new.entry_no, 1) <> 1)
     or (v_kind = 'firstRebuy' and coalesce(new.entry_no, 1) <> 2) then
    new.discount_index := 0;
    new := public._ledger_buyin_apply_amount_rule(new);
  end if;
  return new;
end $$;
revoke all on function public._ledger_buyin_discount_kind_guard() from public, anon, authenticated;

-- §4 ── 승인(이용권 N장 = 바인 1회) ──────────────────────────────────────────────────────
create or replace function public.approve_buyin_request(
  p_request_id uuid, p_game_seq smallint default 1, p_record_buyin boolean default false, p_pay_method text default 'cash'::text,
  p_split boolean default false, p_cash integer default 0, p_card integer default 0, p_transfer integer default 0,
  p_discount_index integer default 0, p_voucher_use text default 'buyin'::text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
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
  v_sched uuid;
  v_need int := 1;
  v_bundle uuid[] := '{}'::uuid[];
  v_got int := 0;
begin
  select * into r from ledger_buyin_requests where id = p_request_id for update;
  if not found then raise exception '요청을 찾을 수 없습니다'; end if;
  if not coalesce(can_access_ledger(r.venue_id), false) then raise exception '권한이 없습니다'; end if;
  if r.status is distinct from 'pending' then
    -- W-01 — 다른 요청의 바인 1회에 이미 묶여 승인된 장. 일괄 승인이 뒤따라 불러도 성공으로 끝낸다(할 일이 없다).
    if r.status = 'approved' and r.bundle_request_id is not null then return; end if;
    raise exception '이미 처리된 요청입니다';
  end if;
  if v_use not in ('buyin', 'addon') then
    raise exception '이용권 용도가 올바르지 않습니다' using errcode = '22023';
  end if;
  if v_use = 'addon' and r.voucher_id is null then
    raise exception '이용권 사용 요청만 애드온으로 승인할 수 있습니다' using errcode = '22023';
  end if;
  if public.ledger_is_closed(r.venue_id, r.session_date, p_game_seq) then
    raise exception '마감된 장부입니다 — 다른 게임을 선택하거나 마감을 해제하세요';
  end if;

  select coalesce(buyin_amount, 0), coalesce(discounts, '[]'::jsonb), schedule_id
    into v_amt, v_discounts, v_sched
    from ledger_sessions
   where venue_id = r.venue_id and session_date = r.session_date and game_seq = p_game_seq;
  v_has_session := FOUND;
  v_amt := coalesce(v_amt, 0); v_discounts := coalesce(v_discounts, '[]'::jsonb);

  if (p_record_buyin or r.voucher_id is not null) and not v_has_session then
    raise exception '이 게임의 장부가 아직 열려 있지 않습니다 — 장부에서 게임을 먼저 여세요';
  end if;
  if p_record_buyin and not p_split and v_amt <= 0 then
    raise exception '참가비가 0원입니다 — 장부에서 참가비를 먼저 입력하세요';
  end if;

  -- W-01 — 참가 1회 = 이용권 N장. 서버가 연결 포스터에서 읽는다(화면 값 불신). 음 아닌 정수면 1~100 으로 자르고 그 밖은 1(예전 동작).
  if r.voucher_id is not null and v_use = 'buyin' and v_sched is not null then
    -- 매장 결속(critical 2026-09-30): 다른 매장 포스터에 세션을 이어도 그 포스터의 N 을 쓰지 않는다(N = 1).
    -- 숫자 길이 제한 없이 읽고 100 으로 자른다 — {1,3} 이면 1000 이 조용히 1 이 됐다. 너무 긴 수는 numeric 으로 받아 넘침 없음.
    select case when (sc.buy_in ->> 'voucherPerEntry') ~ '^[0-9]+$'
                then least(100, greatest(1, (sc.buy_in ->> 'voucherPerEntry')::numeric))::int else 1 end
      into v_need
      from schedules sc where sc.id = v_sched and sc.venue_id = r.venue_id;
    v_need := coalesce(v_need, 1);
  end if;
  if v_need > 1 then
    if r.user_id is null then
      raise exception '이 요청은 손님 계정이 없어 이용권을 묶을 수 없습니다' using errcode = '23514';
    end if;
    select coalesce(array_agg(x.id order by x.created_at, x.id), '{}'::uuid[]) into v_bundle
      from (select q.id, q.created_at
              from ledger_buyin_requests q
             where q.venue_id = r.venue_id and q.session_date = r.session_date and q.user_id = r.user_id
               and q.status = 'pending' and q.voucher_id is not null and q.id <> r.id
               and (q.requested_game_seq is null or q.requested_game_seq = p_game_seq)
             order by q.created_at, q.id
             limit v_need - 1
             for update) x;
    v_got := coalesce(array_length(v_bundle, 1), 0);
    if v_got < v_need - 1 then
      raise exception '이 게임은 이용권 %장이 참가 1회입니다 — 지금 받은 사용 요청은 %장입니다. 나머지를 사용한 뒤 승인하세요', v_need, v_got + 1
        using errcode = '23514';
    end if;
  end if;

  if p_discount_index between 1 and 5 and jsonb_typeof(v_discounts) = 'array' then
    v_disc := coalesce((v_discounts -> (p_discount_index - 1) ->> 'amount')::int, 0);
    if v_disc > 0 then v_idx := p_discount_index; v_disc := least(v_disc, v_amt); else v_disc := 0; end if;
  end if;

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
      update ledger_buyins set addon_method = 'ticket', addon_unpaid = false, addon_request_id = r.id where id = v_target;
    else
      select coalesce(max(entry_no), 0) + 1 into v_entry
        from ledger_buyins where venue_id = r.venue_id and session_date = r.session_date
                             and game_seq = p_game_seq and player_name = r.player_name;
      insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method, discount_index, created_by, request_id)
      values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, 'ticket', v_idx, auth.uid(), r.id);
      if v_got > 0 then
        -- W-01 — 묶인 장들: 같은 바인 1회의 몫. 바인 행은 만들지 않는다(취소하면 _restore_voucher_for_request 가 함께 되돌린다).
        update ledger_buyin_requests
           set status = 'approved', game_seq = p_game_seq, resolved_at = now(), resolved_by = auth.uid(), bundle_request_id = r.id
         where id = any(v_bundle) and status = 'pending';
        get diagnostics v_sum = row_count;
        if v_sum is distinct from v_got then raise exception '이용권 묶음이 바뀌었습니다 — 새로고침 후 다시 승인하세요'; end if;
        update store_vouchers set used_for = 'buyin'
         where id in (select q.voucher_id from ledger_buyin_requests q where q.id = any(v_bundle) and q.voucher_id is not null);
      end if;
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

-- §5 ── 자가검사 ─────────────────────────────────────────────────────────────────────────
do $check$
begin
  if (select count(*) from pg_proc where proname = 'approve_buyin_request' and pronamespace = 'public'::regnamespace) <> 1 then
    raise exception 'ABORT: approve_buyin_request 오버로드가 1개가 아니다';
  end if;
  if has_function_privilege('anon', 'public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer, text)', 'execute') then
    raise exception 'ABORT: approve_buyin_request ACL 이 anon=f·authenticated=t 가 아니다';
  end if;
  if has_function_privilege('authenticated', 'public._restore_voucher_for_request(uuid)', 'execute')
     or has_function_privilege('anon', 'public._restore_voucher_for_request(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._ledger_buyin_discount_kind_guard()', 'execute') then
    raise exception 'ABORT: 내부 함수가 화면에서 실행 가능하다';
  end if;
end $check$;
