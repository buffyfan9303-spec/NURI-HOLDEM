-- 20260911c — 승인된 티켓 바인을 취소해도 이용권이 돌아오지 않던 것 (2026-09-11 장부 점검, 20260911b 후속)
--
-- ⚠ 선행: 20260911b (public._restore_voucher 를 만든다). 먼저 적용하지 않으면 아래 함수들이 그 헬퍼를 못 찾는다.
--
-- 근본 원인
--   20260911b 는 요청이 **끝나는** 세 경로(거절·손님취소·만료)를 닫았다. 그런데 승인되어 장부에 들어간 뒤
--   업주가 그 바인을 지우는 경로(cancel_ledger_buyin · cancel_my_recent_buyin)는 그대로 남아 있었다.
--   ledger_buyins 에는 어느 요청에서 왔는지 적히지 않아(user_id·voucher_id·request_id 전부 없음)
--   지워진 바인에서 이용권을 되짚을 방법 자체가 없었다 — 이용권은 'used' 에 갇힌 채 영구 소멸.
--
-- 그래서 링크를 만든다
--   ledger_buyins.request_id — 앱 요청에서 생성된 바인만 채워진다(접수대 수기 입력은 null).
--   이 한 칸이 '앱에서 온 참가'와 '현장 수기 참가'를 처음으로 구분해 주기도 한다.
--
-- 되살릴 때 요청의 voucher_id 도 비운다 — 이유
--   uniq_ledger_req_voucher 는 (voucher_id) where status <> 'rejected' 인 부분 유니크다.
--   'approved' 행이 그 이용권을 계속 쥐고 있으면, 되살린 이용권을 손님이 다시 쓰는 순간
--   트리거의 INSERT 가 그 인덱스에 걸려 실패한다 — 되살려 놓고 못 쓰게 만드는 셈이다.
--   요청 행은 status·resolve_note 를 그대로 두어 이력으로 남기고, 이용권 소유권만 놓는다.
--
-- 함께: 손님 화면이 '이용권이 걸린 요청인가'를 알 수 있게 한다
--   get_my_buyin_requests_current 에 used_voucher 를 더한다(이용권 id 는 주지 않는다 — 필요한 최소).
--   손님이 대기 중 취소를 누를 때 "이용권은 지갑으로 돌아갔습니다" 를 **사실일 때만** 말하기 위한 것.
--   반환 타입이 바뀌므로 DROP 후 재생성하고 ACL 을 다시 쓴다.
--
-- 데이터 영향: 0. 2026-09-11 운영 실측 store_vouchers 0행 · ledger_buyins(ticket) 0행 —
--   되살릴 과거 데이터가 없다. 이 수정은 전부 **예방**이다(이용권 기능은 app_settings
--   identity_voucher_enabled='off' 로 꺼져 있다).
-- 롤백: 파일 하단 '-- ROLLBACK' 참고.

-- ── ① 링크 컬럼 ────────────────────────────────────────────────────────────
-- 새 컬럼이라 기존 행은 전부 NULL — FK 검증 스캔이 없다(메타데이터 변경).
alter table public.ledger_buyins
  add column if not exists request_id uuid references public.ledger_buyin_requests(id) on delete set null;
comment on column public.ledger_buyins.request_id is
  '이 바인을 만든 앱 바인요청(approve_buyin_request). 접수대 수기 입력은 null. 취소 시 이용권 복원에 쓴다(2026-09-11).';
-- 요청이 지워질 때의 ON DELETE SET NULL 이 순차 스캔이 되지 않게. 부분 인덱스라 거의 비어 있다.
create index if not exists ledger_buyins_request_idx
  on public.ledger_buyins (request_id) where request_id is not null;

-- ── ② approve_buyin_request — 만든 바인에 요청을 적어 둔다 ──────────────────
--   20260905d 본문 그대로이고, 세 insert 에 request_id 한 칸만 더했다. 시그니처 동일(오버로드 안 생김).
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
      -- ② 카드는 카드단가(미설정이면 현금단가). 예전엔 무조건 현금단가라 카드단가 매장에서 매출이 샜다.
      v_unit := case when v_pm = 'card' then coalesce(nullif(v_card_unit, 0), v_amt) else v_amt end;
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
revoke all on function public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer) from public, anon;
grant execute on function public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer) to authenticated, service_role;

-- ── ③ 공용 헬퍼 — 지워진 바인의 요청에서 이용권을 되돌린다 ────────────────────
--   요청의 voucher_id 를 비우는 이유는 파일 머리말 참고(부분 유니크가 재사용을 막는다).
create or replace function public._restore_voucher_for_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_voucher uuid;
begin
  if p_request_id is null then return; end if;
  select voucher_id into v_voucher from public.ledger_buyin_requests where id = p_request_id;
  if v_voucher is null then return; end if;
  update public.ledger_buyin_requests set voucher_id = null where id = p_request_id;
  perform public._restore_voucher(v_voucher);
end $$;
revoke all on function public._restore_voucher_for_request(uuid) from public, anon, authenticated;
grant execute on function public._restore_voucher_for_request(uuid) to service_role;
comment on function public._restore_voucher_for_request(uuid) is
  '취소된 바인의 요청에 붙어 있던 이용권을 지갑으로 되돌리고 요청의 소유권을 놓는다(2026-09-11). 내부 전용.';

-- ── ④ cancel_ledger_buyin(비밀번호 취소) — 20260818f 본문 + 복원 ────────────
create or replace function public.cancel_ledger_buyin(p_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_venue uuid; v_date date; v_game smallint; v_hash text; v_req uuid;
begin
  select venue_id, session_date, game_seq into v_venue, v_date, v_game from public.ledger_buyins where id = p_id;
  if v_venue is null then return; end if;
  if not coalesce(can_access_ledger(v_venue), false) then raise exception '권한이 없습니다'; end if;
  if public.ledger_is_closed(v_venue, v_date, v_game) then
    raise exception '마감된 장부의 바인은 취소할 수 없습니다 — 먼저 마감을 해제하세요';
  end if;
  if my_role() is distinct from 'admin'::user_role then
    select cancel_password_hash into v_hash from public.venue_pos_settings where venue_id = v_venue;
    if v_hash is null then raise exception '취소 비밀번호가 설정되지 않았습니다. 업주가 먼저 설정해야 합니다'; end if;
    if extensions.crypt(coalesce(p_password,''), v_hash) <> v_hash then raise exception '비밀번호가 올바르지 않습니다'; end if;
  end if;
  -- 삭제와 복원을 한 문장 흐름으로 — 실제로 지워진 행의 요청만 되돌린다
  delete from public.ledger_buyins where id = p_id returning request_id into v_req;
  perform public._restore_voucher_for_request(v_req);
end $$;
revoke all on function public.cancel_ledger_buyin(uuid, text) from public, anon;
grant execute on function public.cancel_ledger_buyin(uuid, text) to authenticated, service_role;

-- ── ⑤ cancel_my_recent_buyin(90초 되돌리기) — 20260818f 본문 + 복원 ──────────
create or replace function public.cancel_my_recent_buyin(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v record; v_req uuid;
begin
  select venue_id, session_date, game_seq, created_by, buyin_at into v from public.ledger_buyins where id = p_id;
  if v.venue_id is null then return; end if;
  if not coalesce(can_access_ledger(v.venue_id), false) then raise exception '권한이 없습니다'; end if;
  if v.created_by is distinct from auth.uid() or v.buyin_at < now() - interval '90 seconds' then
    raise exception '직접 기록한 바인만 90초 안에 되돌릴 수 있습니다 — 이후엔 취소 비밀번호를 이용하세요';
  end if;
  if public.ledger_is_closed(v.venue_id, v.session_date, v.game_seq) then
    raise exception '마감된 장부입니다';
  end if;
  delete from public.ledger_buyins where id = p_id returning request_id into v_req;
  perform public._restore_voucher_for_request(v_req);
end $$;
revoke all on function public.cancel_my_recent_buyin(uuid) from public, anon;
grant execute on function public.cancel_my_recent_buyin(uuid) to authenticated, service_role;

-- ── ⑥ 손님 화면이 '이용권이 걸린 요청'인지 알 수 있게 ─────────────────────────
--   반환 타입이 바뀌므로 DROP 이 필요하다. DROP 은 ACL 을 지우므로 아래에서 다시 부여한다.
drop function if exists public.get_my_buyin_requests_current();
create or replace function public.get_my_buyin_requests_current()
returns table(
  id uuid, venue_id uuid, status text,
  requested_game_seq smallint, game_seq smallint, resolve_note text, venue_name text,
  used_voucher boolean
)
language sql
stable
set search_path = public, pg_temp
as $function$
  select r.id, r.venue_id, r.status, r.requested_game_seq, r.game_seq, r.resolve_note, v.name,
         (r.voucher_id is not null) as used_voucher
  from public.ledger_buyin_requests r
  left join public.venues v on v.id = r.venue_id
  where r.user_id = auth.uid()
    and r.session_date = public.ledger_business_date(r.venue_id)  -- 매장별 '지금 진행 중인 장부 날짜'(어제 미마감이면 어제, 아니면 KST 오늘)
  order by r.created_at desc;
$function$;
revoke all on function public.get_my_buyin_requests_current() from public, anon;
grant execute on function public.get_my_buyin_requests_current() to authenticated, service_role;

notify pgrst, 'reload schema';

-- ── 검증 — 적용 직후 스스로 확인, 어긋나면 중단 ──────────────────────────────
do $$
declare v_src text;
begin
  -- 선행 마이그레이션(20260911b)이 먼저 적용됐는가
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = '_restore_voucher') then
    raise exception 'ABORT: 20260911b 를 먼저 적용해야 한다(_restore_voucher 없음)';
  end if;
  -- 링크 컬럼과 인덱스
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'ledger_buyins' and column_name = 'request_id') then
    raise exception 'ABORT: ledger_buyins.request_id 없음';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'ledger_buyins_request_idx') then
    raise exception 'ABORT: request_id 인덱스 없음';
  end if;
  -- 승인이 세 경로 모두에 링크를 적는가
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'approve_buyin_request';
  if (length(v_src) - length(replace(v_src, 'request_id', ''))) / length('request_id') < 3 then
    raise exception 'ABORT: approve 의 insert 세 곳에 request_id 가 다 들어가지 않았다';
  end if;
  -- 두 취소 경로가 복원을 부르는가
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cancel_ledger_buyin';
  if v_src not like '%returning request_id into v_req%' or v_src not like '%_restore_voucher_for_request%' then
    raise exception 'ABORT: cancel_ledger_buyin 에 이용권 복원 없음';
  end if;
  if v_src not like '%ledger_is_closed%' then raise exception 'ABORT: cancel_ledger_buyin 마감가드 누락'; end if;
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cancel_my_recent_buyin';
  if v_src not like '%returning request_id into v_req%' or v_src not like '%_restore_voucher_for_request%' then
    raise exception 'ABORT: cancel_my_recent_buyin 에 이용권 복원 없음';
  end if;
  -- 복원 헬퍼가 요청의 이용권 소유권을 놓는가(부분 유니크가 재사용을 막지 않게)
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_restore_voucher_for_request';
  if v_src not like '%set voucher_id = null%' then
    raise exception 'ABORT: 복원 후 요청이 이용권을 계속 쥐고 있다 — 재사용이 유니크 인덱스에 막힌다';
  end if;
  if has_function_privilege('authenticated', 'public._restore_voucher_for_request(uuid)', 'execute') then
    raise exception 'ABORT: 내부 헬퍼가 외부에 열려 있다';
  end if;
  -- 손님 RPC 가 used_voucher 를 돌려주고, ACL 이 복구됐는가
  if not exists (select 1 from information_schema.routines rt
                 join information_schema.parameters pa on pa.specific_name = rt.specific_name
                 where rt.routine_schema = 'public' and rt.routine_name = 'get_my_buyin_requests_current'
                   and pa.parameter_name = 'used_voucher') then
    raise exception 'ABORT: get_my_buyin_requests_current 에 used_voucher 없음';
  end if;
  if has_function_privilege('anon', 'public.get_my_buyin_requests_current()', 'execute')
     or not has_function_privilege('authenticated', 'public.get_my_buyin_requests_current()', 'execute') then
    raise exception 'ABORT: get_my_buyin_requests_current ACL 이 어긋났다';
  end if;
end $$;

-- ROLLBACK (필요 시 수동)
--   drop index if exists public.ledger_buyins_request_idx;
--   alter table public.ledger_buyins drop column if exists request_id;   -- ⚠ 링크 이력이 사라진다
--   drop function if exists public._restore_voucher_for_request(uuid);
--   approve_buyin_request / cancel_ledger_buyin / cancel_my_recent_buyin :
--     각각 20260905d:26 · 20260818f:228 · 20260818f:252 의 본문으로 되돌린 뒤 REVOKE/GRANT 재적용
--   get_my_buyin_requests_current : 20260905j:21 본문으로 DROP 후 재생성 + REVOKE/GRANT
