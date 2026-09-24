-- 20260924j — 장부 바인 "매출을 줄이는 수정" 은 취소 비밀번호로만 (오너 2026-09-24 LEDGER-REDUCE-PASSWORD).
--
-- ✅ 2026-09-24 라이브 적용 완료 · guard md5 f00e83a8fcd62e18f0b74b30bac7f651 · update_ledger_buyin_reduce md5 afe4c209c8f339bc3c5f83d2005ba8c0
--   라이브 리허설(일반 업주 7e43… · 매장 f35b…, 롤백): A1 업주 직접 감액 42501 · A2 업주 무비번 RPC 감액 통과(비번 미설정) ·
--   A3 직원 RPC 42501 · A4 직원 직접 42501 · B1/B2 비번 설정 후 업주 무비번 거절 · B3 맞는 비번 통과 · N2~N6 거절 · P1~P5 통과.
--   (첫 리허설은 테스트 매장 업주가 admin 이라 비번 면제로 B2 가 통과 — admin 면제는 기존 cancel 규칙 그대로.)
--   적용 전 대조: cancel_ledger_buyin·guard 라이브 md5 가 초안 기준(b94b4af2…·561bcf6f…)과 일치.
--
-- 오너 지시: "직원이 장부 금액을 0으로 고치는 것도 취소 비밀번호로 막아."
-- 문제: 취소 비밀번호는 삭제(cancel_ledger_buyin)만 막았다. authenticated 는 ledger_buyins 를 직접 UPDATE 하므로
--   ① 금액 0 ② 결제수단 support ③ 분납 금액 축소 ④ 완납→미수 ⑤ 할인 자리 변경 으로 매출을 비밀번호 없이 지울 수 있었다.
--   (20260924d 헤더 '남은 것' 항목.)
--
-- 감액 정의 — 클라이언트 buyinFinance(src/api/ledger.ts) 의 tender 를 세 겹 누적으로 본다(_ledger_buyin_tiers):
--   t1 완납 매출   = cash + card + transfer               (정산 revenue)
--   t2 수납 완료   = t1 + ticket                          (정산 '수납 완료 가치')
--   t3 받을 가치   = t2 + unpaid  (= value − support)      (가게지원은 매출이 아니다)
--   셋 중 **하나라도 줄면** 감액이다. 결제수단 cash↔card↔transfer 같은 가치 교체, 미수→완납, 증액, 얼리 변경은 통과.
--   바이인 횟수(ledgerCounts)는 수정으로 바뀌지 않는다 — 행 수는 그대로다. 엔트리(value/정가)는 t3+support 라
--   support 로의 전환은 엔트리를 유지하지만 t1 이 줄어 감액으로 잡힌다.
--   클라이언트 쌍둥이: ledger.ts buyinTiers()/isRevenueReduction() — 같은 표를 ledger.reduce.test.ts 가 고정한다.
--
-- 비밀번호 판정은 **cancel_ledger_buyin 본문을 그대로 헬퍼로 옮겨** 두 RPC 가 같이 쓴다(새 판정 없음):
--   admin 은 면제 · 매장에 비밀번호가 없으면 '설정되지 않았습니다' 로 거절 · 틀리면 거절.
-- 감액 RPC 만 한 가지 다르다(오너 결정 2026-09-24): **비밀번호가 설정되지 않은 매장**에서는
--   업주·공동사장(can_manage_pos)만 비밀번호 없이 감액할 수 있고, 직원은 42501.
--   비밀번호가 설정되면 업주 포함 모두 비밀번호가 필요하다(헬퍼 그대로). 삭제(cancel_ledger_buyin) 규칙은 바꾸지 않는다.
--   (2026-09-24 실측 SELECT: venue_pos_settings 0행 — 지금은 모든 매장이 '업주만' 상태다.)
--
-- 적용 범위: 클라이언트 직접 쓰기(current_user authenticated/anon)만 가드. SECURITY DEFINER RPC(소유자 postgres)·service_role 통과.
-- 남는 구멍(범위 밖): 새 바인을 처음부터 0원/지원으로 기록하는 것은 막지 않는다 — 수정이 아니라 기록이라 판정 근거가 없다.

-- ── ① 행 가치 세 겹 — 순수 함수(테이블을 읽지 않는다) ───────────────────────────────
-- buyinFinance 의 분기와 1:1:
--   분납 → 기록 금액 그대로 · 지원 → 0 · 티켓 → net(미수면 unpaid 칸) · 그 외 → 스냅샷(레거시는 net)
create or replace function public._ledger_buyin_tiers(b public.ledger_buyins, p_price numeric, p_discs jsonb)
returns bigint[] language plpgsql immutable set search_path = public, pg_temp as $fn$
declare
  gross bigint := greatest(0, round(coalesce(p_price, 0)));
  disc bigint := 0; net bigint; paid bigint := 0; tk bigint := 0; up bigint := 0; stored bigint;
  idx int := coalesce(b.discount_index, 0);
begin
  if idx > 0 and jsonb_typeof(p_discs) = 'array' and jsonb_array_length(p_discs) >= idx then
    disc := least(gross, greatest(0, round(coalesce((p_discs -> (idx - 1) ->> 'amount')::numeric, 0))));
  end if;
  net := greatest(0, gross - disc);
  if coalesce(b.is_split, false) then
    paid := coalesce(b.cash_amount, 0) + coalesce(b.card_amount, 0) + coalesce(b.transfer_amount, 0);
    tk := coalesce(b.ticket_count, 0)::bigint * 10000;   -- TICKET_WON (src/lib/units.ts)
    up := coalesce(b.unpaid_amount, 0);
  elsif b.payment_method = 'support' then
    null;
  elsif b.payment_method = 'ticket' then
    if coalesce(b.is_unpaid, false) then up := net; else tk := net; end if;
  else
    stored := coalesce(b.cash_amount, 0) + coalesce(b.card_amount, 0) + coalesce(b.transfer_amount, 0);
    -- SNAPSHOT_SINCE = '2026-08-18' (ledger.ts) — 그 전 기록 중 금액 미저장 행만 세션 단가로 복원
    if stored = 0 and b.buyin_at < timestamptz '2026-08-18 00:00:00+00' then stored := net; end if;
    if coalesce(b.is_unpaid, false) then up := stored; else paid := stored; end if;
  end if;
  return array[paid, paid + tk, paid + tk + up];
end $fn$;
-- 순수 계산이라 데이터를 드러내지 않는다. 가드 트리거가 authenticated 권한으로 부르므로 authenticated 에 준다.
revoke all on function public._ledger_buyin_tiers(public.ledger_buyins, numeric, jsonb) from public, anon;
grant execute on function public._ledger_buyin_tiers(public.ledger_buyins, numeric, jsonb) to authenticated, service_role;

-- ── ② 비밀번호 판정 — cancel_ledger_buyin(20260911c) 의 블록 그대로 ─────────────────────
create or replace function public._ledger_check_cancel_password(p_venue uuid, p_password text)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_hash text;
begin
  if my_role() is distinct from 'admin'::user_role then
    select cancel_password_hash into v_hash from public.venue_pos_settings where venue_id = p_venue;
    if v_hash is null then raise exception '취소 비밀번호가 설정되지 않았습니다. 업주가 먼저 설정해야 합니다'; end if;
    if extensions.crypt(coalesce(p_password,''), v_hash) <> v_hash then raise exception '비밀번호가 올바르지 않습니다'; end if;
  end if;
end $fn$;
revoke all on function public._ledger_check_cancel_password(uuid, text) from public, anon, authenticated;

-- cancel_ledger_buyin — 라이브 본문(md5 b94b4af2a9f68effaeb92154a7845c5e, 2026-09-24 실측)에서 비밀번호 블록만 헬퍼 호출로. 동작 동일.
create or replace function public.cancel_ledger_buyin(p_id uuid, p_password text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_venue uuid; v_date date; v_game smallint; v_req uuid;
begin
  select venue_id, session_date, game_seq into v_venue, v_date, v_game from public.ledger_buyins where id = p_id;
  if v_venue is null then return; end if;
  if not coalesce(can_access_ledger(v_venue), false) then raise exception '권한이 없습니다'; end if;
  if public.ledger_is_closed(v_venue, v_date, v_game) then
    raise exception '마감된 장부의 바인은 취소할 수 없습니다 — 먼저 마감을 해제하세요';
  end if;
  perform public._ledger_check_cancel_password(v_venue, p_password);
  delete from public.ledger_buyins where id = p_id returning request_id into v_req;
  perform public._restore_voucher_for_request(v_req);
end $$;
revoke all on function public.cancel_ledger_buyin(uuid, text) from public, anon;
grant execute on function public.cancel_ledger_buyin(uuid, text) to authenticated, service_role;

-- ── ③ 클라이언트 직접 쓰기 가드 — 20260924d 본문(md5 561bcf6f…) + 게임 번호 고정 + 감액 거절 ─────
create or replace function public._ledger_buyins_client_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $fn$
declare v_price numeric; v_discs jsonb; o bigint[]; n bigint[];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.request_id is not null then
      raise exception '바인 요청 연결은 서버만 설정할 수 있습니다' using errcode = '42501';
    end if;
    new.created_by := auth.uid();
    new.buyin_at := now();
  else
    if new.request_id is distinct from old.request_id
       or new.created_by is distinct from old.created_by
       or new.buyin_at is distinct from old.buyin_at
       or new.venue_id is distinct from old.venue_id
       or new.session_date is distinct from old.session_date then
      raise exception '기록자·기록 시각·매장·요청 연결은 바꿀 수 없습니다' using errcode = '42501';
    end if;
    -- 게임 번호는 20260924d 가 안 막았다 — 옮기면 단가 기준이 바뀌어 감액 판정을 우회한다. 클라이언트는 이 칸을 고치지 않는다.
    if new.game_seq is distinct from old.game_seq then
      raise exception '기록의 게임 번호는 바꿀 수 없습니다' using errcode = '42501';
    end if;
    select s.buyin_amount, s.discounts into v_price, v_discs
      from public.ledger_sessions s
     where s.venue_id = old.venue_id and s.session_date = old.session_date and s.game_seq = old.game_seq;
    o := public._ledger_buyin_tiers(old, v_price, v_discs);
    n := public._ledger_buyin_tiers(new, v_price, v_discs);
    if n[1] < o[1] or n[2] < o[2] or n[3] < o[3] then
      raise exception '매출이 줄어드는 수정은 업주 취소 비밀번호가 필요합니다'
        using errcode = '42501', hint = 'LEDGER_REDUCE_NEEDS_PASSWORD';
    end if;
  end if;
  return new;
end $fn$;
revoke all on function public._ledger_buyins_client_guard() from public, anon, authenticated;
-- 트리거는 20260924d 가 이미 걸었다(이름·시점 동일) — 멱등으로 다시 건다.
drop trigger if exists ledger_buyins_client_guard on public.ledger_buyins;
create trigger ledger_buyins_client_guard before insert or update on public.ledger_buyins
  for each row execute function public._ledger_buyins_client_guard();

-- ── ④ 감액 수정 RPC — 비밀번호 확인 후 화이트리스트 컬럼만 바꾼다 ─────────────────────
create or replace function public.update_ledger_buyin_reduce(p_id uuid, p_fields jsonb, p_password text)
returns void language plpgsql security definer set search_path = public, pg_temp as $fn$
declare r public.ledger_buyins; x public.ledger_buyins; k text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다' using errcode = '42501'; end if;
  if jsonb_typeof(p_fields) is distinct from 'object' then
    raise exception '수정 내용이 올바르지 않습니다' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_fields) loop
    if not (k = any (array['payment_method','is_unpaid','is_split','cash_amount','card_amount','transfer_amount',
                           'ticket_count','unpaid_amount','discount_level','discount_index','early_override'])) then
      raise exception '수정할 수 없는 항목입니다: %', k using errcode = '42501';
    end if;
  end loop;
  select * into r from public.ledger_buyins where id = p_id for update;
  if not found then raise exception '기록을 찾을 수 없습니다 — 화면을 새로 불러와 주세요' using errcode = 'P0002'; end if;
  if not coalesce(can_access_ledger(r.venue_id), false) then raise exception '권한이 없습니다' using errcode = '42501'; end if;
  if public.ledger_is_closed(r.venue_id, r.session_date, r.game_seq) then
    raise exception '마감된 장부의 바인은 수정할 수 없습니다 — 먼저 마감을 해제하세요';
  end if;
  if my_role() is distinct from 'admin'::user_role
     and not exists (select 1 from public.venue_pos_settings v
                      where v.venue_id = r.venue_id and v.cancel_password_hash is not null) then
    -- 비밀번호 미설정 매장: 업주·공동사장만(오너 결정 2026-09-24)
    if not coalesce(can_manage_pos(r.venue_id), false) then
      raise exception '취소 비밀번호가 설정되지 않은 매장은 업주만 금액을 줄일 수 있습니다' using errcode = '42501';
    end if;
  else
    perform public._ledger_check_cancel_password(r.venue_id, p_password);
  end if;
  x := jsonb_populate_record(r, p_fields);   -- 타입 불일치는 여기서 22P02 로 멈춘다
  if x.payment_method is null or x.payment_method not in ('ticket','cash','transfer','card','support') then
    raise exception '결제수단이 올바르지 않습니다' using errcode = '22023';
  end if;
  if least(coalesce(x.cash_amount,0), coalesce(x.card_amount,0), coalesce(x.transfer_amount,0),
           coalesce(x.ticket_count,0), coalesce(x.unpaid_amount,0), coalesce(x.discount_index,0)) < 0 then
    raise exception '금액은 0 이상이어야 합니다' using errcode = '22023';
  end if;
  if x.early_override is not null and x.early_override not in ('double','single','none') then
    raise exception '얼리 유형이 올바르지 않습니다' using errcode = '22023';
  end if;
  update public.ledger_buyins set
    payment_method = x.payment_method, is_unpaid = coalesce(x.is_unpaid, false), is_split = coalesce(x.is_split, false),
    cash_amount = coalesce(x.cash_amount, 0), card_amount = coalesce(x.card_amount, 0), transfer_amount = coalesce(x.transfer_amount, 0),
    ticket_count = coalesce(x.ticket_count, 0), unpaid_amount = coalesce(x.unpaid_amount, 0),
    discount_level = coalesce(x.discount_level, 0), discount_index = coalesce(x.discount_index, 0),
    early_override = x.early_override
  where id = p_id;
end $fn$;
revoke all on function public.update_ledger_buyin_reduce(uuid, jsonb, text) from public, anon;
grant execute on function public.update_ledger_buyin_reduce(uuid, jsonb, text) to authenticated, service_role;

do $chk$ begin
  if not exists (select 1 from pg_trigger where tgname='ledger_buyins_client_guard' and tgrelid='public.ledger_buyins'::regclass) then raise exception '[chk] trigger missing'; end if;
  if has_function_privilege('anon','public.update_ledger_buyin_reduce(uuid, jsonb, text)','EXECUTE') then raise exception '[chk] anon reduce rpc'; end if;
  if has_function_privilege('authenticated','public._ledger_check_cancel_password(uuid, text)','EXECUTE') then raise exception '[chk] pw helper exposed'; end if;
  if not has_function_privilege('authenticated','public._ledger_buyin_tiers(public.ledger_buyins, numeric, jsonb)','EXECUTE') then raise exception '[chk] tiers not callable by guard'; end if;
  if (select prosrc from pg_proc where oid = 'public._ledger_buyins_client_guard()'::regprocedure) not like '%LEDGER_REDUCE_NEEDS_PASSWORD%' then raise exception '[chk] guard missing reduce check'; end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='update_ledger_buyin_reduce') <> 1 then raise exception '[chk] overload'; end if;
end $chk$;

/* ── 리허설 (리드 실행 · 라이브 · 반드시 rollback) ──────────────────────────────────────
   순서: begin;  <위 본문 전부>  <아래 SETUP>  <아래 TEST>  rollback;
   계정: 업주 c8e3734d-028d-4b69-86c9-a6d75c36601c = 테스트 매장 dddd0000-0000-4000-8000-000000000001 소유(2026-09-24 SELECT 실측).
         직원은 '매장 소유 없음 · admin 아님' 프로필을 골라 트랜잭션 안에서만 ledger_access 를 준다 — 실행 전 한 줄로 확인:
         select id, role, status, (select count(*) from venues v where v.owner_id=p.id) owns from profiles p where role::text <> 'admin' limit 10;

-- SETUP (postgres — 가드 통과)
select set_config('t.staff', (select p.id::text from profiles p
   where p.role::text <> 'admin' and not exists (select 1 from venues v where v.owner_id = p.id) limit 1), true);
insert into ledger_access (venue_id, user_id) values ('dddd0000-0000-4000-8000-000000000001', current_setting('t.staff')::uuid) on conflict do nothing;
delete from venue_pos_settings where venue_id = 'dddd0000-0000-4000-8000-000000000001';   -- 먼저 '비밀번호 미설정' 매장으로 본다
insert into ledger_sessions (venue_id, session_date, game_seq, buyin_amount, discounts)
  values ('dddd0000-0000-4000-8000-000000000001', '2099-01-01', 9, 100000, '[{"label":"1레벨","amount":50000,"level":1}]');
insert into ledger_buyins (id, venue_id, session_date, game_seq, player_name, entry_no, payment_method, is_unpaid, cash_amount) values
  ('eeee0000-0000-4000-8000-00000000000a','dddd0000-0000-4000-8000-000000000001','2099-01-01',9,'리허설A',1,'cash',false,100000),
  ('eeee0000-0000-4000-8000-00000000000b','dddd0000-0000-4000-8000-000000000001','2099-01-01',9,'리허설B',1,'cash',true, 100000),
  ('eeee0000-0000-4000-8000-00000000000c','dddd0000-0000-4000-8000-000000000001','2099-01-01',9,'리허설C',1,'ticket',false,0);

-- TEST
do $t$
declare ok boolean; a uuid := 'eeee0000-0000-4000-8000-00000000000a'; b uuid := 'eeee0000-0000-4000-8000-00000000000b';
        c uuid := 'eeee0000-0000-4000-8000-00000000000c'; v numeric;
        owner text := 'c8e3734d-028d-4b69-86c9-a6d75c36601c';
begin
  execute 'set local role authenticated';
  -- ── A. 비밀번호 미설정 매장 ──────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  -- 음성 A1 업주도 직접 UPDATE 감액은 막힌다(화면은 RPC 로 보낸다)
  begin update ledger_buyins set cash_amount = 0 where id = a; ok := true; exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'A1 업주 직접 감액 통과'; end if;
  -- 양성 A2 업주는 비밀번호 없이 RPC 감액 통과
  perform update_ledger_buyin_reduce(a, '{"cash_amount":90000}', null);
  select cash_amount into v from ledger_buyins where id = a;
  if v <> 90000 then raise exception 'A2 업주 무비번 감액 미반영 %', v; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('t.staff'), 'role', 'authenticated')::text, true);
  -- 음성 A3 직원 RPC 감액 42501
  begin perform update_ledger_buyin_reduce(b, '{"cash_amount":0}', null); ok := true; exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'A3 직원 무비번 RPC 감액 통과'; end if;
  -- 음성 A4 직원 직접 감액 42501
  begin update ledger_buyins set cash_amount = 0 where id = b; ok := true; exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'A4 직원 직접 감액 통과'; end if;
  -- ── B. 비밀번호 설정 매장 ───────────────────────────────
  execute 'reset role';
  insert into venue_pos_settings (venue_id, cancel_password_hash, updated_at)
    values ('dddd0000-0000-4000-8000-000000000001', extensions.crypt('4321', extensions.gen_salt('bf')), now());
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  -- 음성 B1 업주 직접 감액 42501
  begin update ledger_buyins set cash_amount = 0 where id = a; ok := true; exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'B1 업주 비번 없이 직접 감액 통과'; end if;
  -- 음성 B2 업주 RPC 도 비밀번호 없이는 거절
  begin perform update_ledger_buyin_reduce(a, '{"cash_amount":0}', null); ok := true; exception when others then ok := false; end;
  if ok then raise exception 'B2 업주 비번 없이 RPC 감액 통과'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('t.staff'), 'role', 'authenticated')::text, true);
  -- 음성 N1 직원 직접 0원
  begin update ledger_buyins set cash_amount = 0 where id = a; ok := true; exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'N1 직원 직접 0원 통과'; end if;
  -- 음성 N2 support 로 변경
  begin update ledger_buyins set payment_method = 'support', cash_amount = 0 where id = a; ok := true; exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'N2 support 변경 통과'; end if;
  -- 음성 N3 완납→미수
  begin update ledger_buyins set is_unpaid = true where id = a; ok := true; exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'N3 미수 전환 통과'; end if;
  -- 음성 N4 티켓 행 할인 자리 추가(10T→5T)
  begin update ledger_buyins set discount_index = 1 where id = c; ok := true; exception when insufficient_privilege then ok := false; end;
  if ok then raise exception 'N4 티켓 할인 전환 통과'; end if;
  -- 음성 N5 틀린 비밀번호
  begin perform update_ledger_buyin_reduce(a, '{"cash_amount":0}', '0000'); ok := true; exception when others then ok := false; end;
  if ok then raise exception 'N5 틀린 비밀번호 통과'; end if;
  -- 음성 N6 화이트리스트 밖 컬럼
  begin perform update_ledger_buyin_reduce(a, '{"venue_id":"dddd0000-0000-4000-8000-000000000002"}', '4321'); ok := true; exception when others then ok := false; end;
  if ok then raise exception 'N6 venue_id 변경 통과'; end if;
  -- 양성 P1 증액(초과 입력)
  update ledger_buyins set cash_amount = 110000 where id = a;
  -- 양성 P2 같은 가치 수단 변경 cash→card
  update ledger_buyins set payment_method = 'card', card_amount = 110000, cash_amount = 0 where id = a;
  -- 양성 P3 미수→완납
  update ledger_buyins set is_unpaid = false where id = b;
  -- 양성 P4 얼리만 변경
  update ledger_buyins set early_override = 'double' where id = a;
  -- 양성 P5 맞는 비밀번호로 가게지원 0원
  perform update_ledger_buyin_reduce(a, '{"payment_method":"support","card_amount":0}', '4321');
  select cash_amount + card_amount + transfer_amount into v from ledger_buyins where id = a;
  if v <> 0 then raise exception 'P5 감액 미반영 %', v; end if;
  execute 'reset role';
  -- 마감 규칙: 마감 후에는 비밀번호가 맞아도 거절
  update ledger_sessions set closed = true where venue_id = 'dddd0000-0000-4000-8000-000000000001' and session_date = '2099-01-01' and game_seq = 9;
  execute 'set local role authenticated';
  begin perform update_ledger_buyin_reduce(b, '{"cash_amount":0}', '4321'); ok := true; exception when others then ok := false; end;
  if ok then raise exception 'N7 마감 후 감액 통과'; end if;
  execute 'reset role';
  raise exception 'REHEARSAL_OK';   -- 여기까지 오면 전부 기대대로 — 일부러 멈춰 롤백을 보장한다
end $t$;
-- 기대 출력: ERROR REHEARSAL_OK.  그 외 메시지는 FAIL.
rollback;

   음성 대조: 위 본문에서 ③ 트리거 함수를 20260924d 원본으로 바꿔(감액 블록 제거) 같은 TEST 를 돌리면 'N1 직원 직접 0원 통과' 로 멈춰야 한다.
   ※ N5·N7 이 '다른 이유로' 실패하지 않는지(예: can_access_ledger false)는 양성 P5 가 대조한다 — 같은 직원·같은 매장.
*/
