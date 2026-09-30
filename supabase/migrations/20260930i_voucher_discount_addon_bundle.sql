-- ⏳ 초안(미적용) — store-team 2026-09-30. 적용은 리드(MCP execute_sql, 이 파일 §A~§2 본문 그대로 한 번에).
-- 20260930i — 이용권 장수와 분납: ③ 할인 바인은 할인만큼 덜 받는다 · ④ 애드온 = 애드온 금액 ÷ 1만 장(포스터 N 설정 게임만) ·
--             ⑤ 이용권이 모자라면 거절 대신 '이용권 k장 + 남은 금액(현금·카드·계좌·미수)' 분납으로 받는다.
--   요구 원문: .claude/agent-memory-local/nuri-lead/project_owner_decisions_0930.md 오후 결정 ③④ + 리드 결정(④는 N 설정 게임만) +
--             오너 추가 결정 2026-09-30(모자라면 분납 — 예: 5만 애드온에 3장 → 3장(3만) + 2만 다른 결제 · 10장 게임 7장 → 7장 + 3만).
--   ①(참가비≠N×1만 경고만)·②(N 미설정 게임 = 1장 = 참가 1회, 애드온도 1장)는 그대로.
--
-- 지금(라이브 20260930g, approve md5 458be576…): 할인이 붙어도 N장을 다 묶는다(장부 5T 인데 이용권 10장) · 애드온은 금액과 무관하게 1장 ·
--   모자라면 23514 거절뿐(분납 불가).
--
-- 이 파일이 바꾸는 것
--   §A ledger_buyins.addon_ticket_count smallint default 0 (+ CHECK ≥ 0) — 애드온 분납의 이용권 몫(T). 바인 분납은 **기존 칸**
--      (is_split · ticket_count(T) · cash/card/transfer_amount · unpaid_amount · is_unpaid)을 그대로 쓴다. 기존 행 0 = 예전 동작.
--   §B _ledger_buyins_addon_request_guard — 화면(authenticated/anon)이 addon_ticket_count 도 못 바꾼다(트리거 칸 목록에 추가).
--   §C _ledger_buyin_addon_rule — 애드온을 지우면 이용권 몫 0 · 이용권 몫 × 1만 < 애드온 금액(남은 금액 > 0) 검사. 금액 스냅샷 규칙 불변.
--   §D _ledger_buyins_addon_voucher_restore — 이용권 몫이 남은 분납 애드온은 남은 금액 수단을 바꿔도(미수→현금 등) 이용권을 유지,
--      애드온 제거·행 삭제면 예전처럼 전부 되돌리고 몫을 0 으로.
--   §1 approve_buyin_request(같은 10인자 서명 · create or replace → ACL 보존, REVOKE/GRANT 재기재)
--      · ③ 티켓 바인 행을 먼저 넣고 트리거가 확정한 discount_index 를 RETURNING 으로 읽는다(할인 종류 규칙 = kind_guard 한 곳).
--        필요 장수 = ceil(N × (참가비 − 할인) / 참가비), 최소 1 · N=1(미설정)·참가비 0 은 N 그대로.
--      · ④ 애드온 금액은 트리거가 세션 가격으로 스냅샷한 addon_amount(RETURNING, 클라 값 불신) · 필요 장수 = ceil(금액/1만) —
--        같은 매장 연결 포스터에 N(voucherPerEntry ≥ 1)이 있을 때만, 없으면 1장.
--      · 묶음(바인·애드온 한 벌): 같은 손님·영업일·매장의 대기 이용권 요청을 오래된 순 필요−1 개 잠금 → bundle_request_id = 이 요청.
--      · ⑤ 모자라면(k = 받은 장수 < 필요):
--          p_record_buyin=false(기본) → 23514 · hint 'VOUCHER_SHORT' · detail {"need","have","ticketWon","remainder","use"} — 화면이 분납 선택을 띄운다.
--          p_record_buyin=true        → 분납 승인. 남은 금액 = (바인: 참가비−할인 / 애드온: 애드온 금액) − k×1만 을 **서버가** 정한다.
--            p_pay_method ∈ cash·card·transfer·unpaid(미수). 바인은 p_split 로 cash/card/transfer 금액을 나눠 받을 수 있고
--            합계는 _ledger_buyin_apply_amount_rule 이 검사(≠ 이면 23514). 애드온은 한 가지 방법만(addon_method + addon_unpaid).
--          k장 전부 그 행에 묶이고(바인 request_id / 애드온 addon_request_id + bundle_request_id) 취소·삭제·애드온 제거 때 전부 복원.
--          이용권이 넉넉하면 p_record_buyin=true 여도 이용권만(분납 아님).
--      · 현금 요청(이용권 아님)의 현금·카드·이체·분납 바인, 권한·마감·세션 검사는 그대로.
--   정산·통계: 바인 분납 행 = 1행 = 바인 1회(엔트리 = 가치/정가, 기존 buyinFinance·_ledger_buyin_tiers 식) — 이용권 kT + 나머지 수단.
--      애드온 분납 = 애드온 1회(클락 addons 는 addon_method 가 있는 행 수라 불변) — 이용권 kT + 나머지 수단(ledger.ts addonFinance 가 나눈다).
--
-- 적용 전 확인(쓰기 없음, 리드):
--   ① select proname, md5(prosrc) from pg_proc where proname in ('approve_buyin_request','_ledger_buyins_addon_request_guard',
--        '_ledger_buyin_addon_rule','_ledger_buyins_addon_voucher_restore');
--      → approve 458be576a8c8bb25de6563d5e989935c · guard c9fdce5879e80c6f4778b3677f71459b · rule c3104ae31d0e253f9aa2cf0cb6d918b5 ·
--        restore 8330ce1c4338157a7c839ab4ee5762b9 (2026-09-30 실측). 다르면 누군가 먼저 바꾼 것 — 대조 뒤 적용.
--   ② select count(*) from information_schema.columns where table_name='ledger_buyins' and column_name='addon_ticket_count'; → 0
--   ③ bundle_request_id 칸 존재(20260930g) → 1
--   🔴 클라이언트보다 먼저 적용한다(새 화면의 분납 승인은 이 서버가 있어야 동작 — 옛 서버는 hint 가 없어 분납 선택이 안 뜬다).
--
-- 리허설(라이브 한 방 트랜잭션 + 끝 RAISE 로 전량 롤백, 2026-09-30 store-team · 하네스 scratchpad kw1i/common.sql + scen2.sql).
--   계정: 업주 = 키키홀덤펍 소유자(admin) · 손님 = 본인인증 일반 회원 · 음성 = 다른 매장(E2E) 업주. 참가비 10만 · 포스터 N=10(트랜잭션 안에서만).
--   | 시나리오                                | PRE(라이브)                                  | POST(이 파일)                                                         |
--   | A 첫 리바인 50%, 5장                      | 23514(10장 필요) · 0행                FAIL   | ok · 2행 [1:d0 2:d1] · 5장 used/buyin · 취소 → 5장 active       PASS |
--   | C 할인 0, 10장                            | 1행                                          | 1행(불변)                                                             |
--   | D 애드온 5만(N 설정), 5장                  | 1장만 씀 · 4장 '이미 애드온'          FAIL   | 5장 used/addon · 대기 0 · 취소 → 5장 active                     PASS |
--   | I 애드온 5만, N 미설정 게임                | 1장 · 대기 1                                  | 1장 · 대기 1(불변, 결정 ②)                                      PASS |
--   | S1 10장 게임 7장 · 그냥 승인               | 23514                                        | 23514 hint VOUCHER_SHORT '7장(70000원)에 남은 30000원…'               |
--   | S1 7장 + 현금                              | 23514                                 FAIL   | 1행 split tk=7 cash=30000 · tiers {3만,10만,10만} · 승인 7 · 묶임 6  PASS |
--   | S1 그 바인 취소                            | —                                            | 7장 active                                                      PASS |
--   | S4 7장 + 미수                              | 23514                                 FAIL   | pm=ticket split tk=7 unpaid=30000 is_unpaid · tiers {0,7만,10만}  PASS |
--   | S2 애드온 5만 3장 + 카드                   | 1장만 씀 · 나머지 '이미 애드온'        FAIL   | add=card/50000 tk=3 · 3장 used/addon                            PASS |
--   | S2 화면이 addon_ticket_count 변경          | (칸 없음)                                    | 42501                                                           PASS |
--   | S2 화면이 수단 카드→현금                   | (1장 복원)                                    | tk=3 유지 · 3장 used/addon                                      PASS |
--   | S2 화면이 애드온 제거                      | —                                            | tk=0 · 3장 active                                               PASS |
--   | S3 애드온 3장 + 미수 → 미수 해제 → 행 삭제  | 1장만 씀                              FAIL   | cash/50000 tk=3 unpaid → unpaid 해제(3장 유지) → 삭제 3장 active PASS |
--   | S5 10장 넉넉 + 현금 지정                   | 1행 ticket                                   | 1행 ticket(분납 아님)                                           PASS |
--   | F 양성: N 미설정 + 할인 2장                 | 2행 d1,d1                                    | 동일                                                                  |
--   | G 양성: 현금 바인 할인(N=10 게임)            | cash 50000 d1                                | 동일                                                                  |
--   | H 음성: 다른 매장 업주 · 비로그인            | 권한 없음 · 42501                              | 동일                                                                  |
--   | ACL approve anon/auth                      | f/t                                          | f/t · 내부 함수 3개 authenticated=f(§2 자가검사 통과)                 |
--   적용 직후 md5(prosrc) — 파일 본문과 일치: approve 14e1868265e7f84a072c235003027c68 · guard fad4fc8e9e673805e310855d87f1a2e4 ·
--     rule ccc88ca6bcb3c77c9af065cd3610905e · restore f1d77776be662d4deeef8c357dca3f12.
--   롤백 확인: 프로브 없음 · addon_ticket_count 칸 0 · 네 함수 md5 적용 전 값 그대로 · 포스터 buy_in md5 348ae304…(그대로) · 리허설 이용권 0.
--   NOT_RUN: 두 접수대 동시 승인(deadlock) · 바인 분납의 p_split 금액 나눔(화면은 단일 수단만 보냄 — 합계 검사는 기존 함수) ·
--            N×1만 > 참가비 게임에서 k장이 이미 금액 이상인 경계(서버가 23514 로 막는다, 리허설 미실행).
--   관찰(범위 밖, 기존 동작): 바인 취소로 active 복원된 이용권의 used_for 가 남는다(PRE 도 동일) — 후속 과제.
-- 적용 후 기대 md5(prosrc): 위 네 값(파일 본문 그대로 적용했을 때).

-- §A ── 애드온 이용권 분납 칸 ──────────────────────────────────────────────────────────────
--   바인 분납은 기존 칸(is_split·ticket_count·cash/card/transfer·unpaid_amount)을 그대로 쓴다. 애드온은 수단 칸이 하나뿐이라
--   '이용권 k장 + 남은 금액은 addon_method' 를 적을 칸이 없다 → addon_ticket_count(T, 1T = 1만) 한 칸만 더한다. 기존 행 0 = 예전 동작.
alter table public.ledger_buyins add column if not exists addon_ticket_count smallint not null default 0;
alter table public.ledger_buyins drop constraint if exists ledger_buyins_addon_ticket_count_chk;
alter table public.ledger_buyins add constraint ledger_buyins_addon_ticket_count_chk check (addon_ticket_count >= 0);
comment on column public.ledger_buyins.addon_ticket_count is
  '20260930i 애드온을 이용권 k장 + 남은 금액(addon_method·addon_unpaid)으로 받았을 때 k(T). approve_buyin_request 만 쓴다. addon_method=ticket 이면 전액 이용권이라 0.';

-- §B ── 화면이 이용권 몫을 못 바꾼다(요청 연결과 같은 가드) ─────────────────────────────────────
create or replace function public._ledger_buyins_addon_request_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.addon_request_id is distinct from (case when tg_op = 'UPDATE' then old.addon_request_id end)
          or new.addon_ticket_count is distinct from (case when tg_op = 'UPDATE' then old.addon_ticket_count else 0 end)) then
    raise exception '애드온 요청 연결·이용권 몫은 서버만 설정할 수 있습니다' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public._ledger_buyins_addon_request_guard() from public, anon, authenticated;
drop trigger if exists ledger_buyins_addon_request_guard on public.ledger_buyins;
create trigger ledger_buyins_addon_request_guard before insert or update of addon_request_id, addon_ticket_count on public.ledger_buyins
  for each row execute function public._ledger_buyins_addon_request_guard();

-- §C ── 애드온 금액 규칙: 애드온을 지우면 이용권 몫도 0, 이용권 몫은 금액보다 작아야(남은 금액 > 0) ─────────────
create or replace function public._ledger_buyin_addon_rule() returns trigger
language plpgsql set search_path to 'public', 'pg_temp' as $function$
declare v_is_addon boolean; v_price integer;
begin
  if new.addon_method is null then
    new.addon_unpaid := false;
    new.addon_amount := 0;
    new.addon_ticket_count := 0;
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.addon_method is not distinct from old.addon_method
     and new.addon_unpaid is not distinct from old.addon_unpaid then
    new.addon_amount := old.addon_amount;
  else
    select s.is_addon, s.addon_amount into v_is_addon, v_price
      from public.ledger_sessions s
     where s.venue_id = new.venue_id and s.session_date = new.session_date and s.game_seq = new.game_seq;
    if not found then
      raise exception '이 게임의 장부가 아직 열려 있지 않습니다 — 장부에서 게임을 먼저 여세요'
        using errcode = '23514', hint = 'LEDGER_SESSION_MISSING';
    end if;
    if not coalesce(v_is_addon, false) then
      raise exception '애드온 게임이 아닙니다 — 세션 정보에서 애드온 게임을 켜 주세요' using errcode = '23514';
    end if;
    if coalesce(v_price, 0) <= 0 then
      raise exception '애드온 가격이 없습니다 — 세션 정보에서 애드온 가격을 넣어 주세요' using errcode = '23514';
    end if;
    new.addon_amount := v_price;
  end if;
  if new.addon_method <> 'ticket' and coalesce(new.addon_ticket_count, 0) > 0
     and new.addon_ticket_count::int * 10000 >= new.addon_amount then
    raise exception '애드온 이용권 몫(%원)이 애드온 금액(%원) 이상입니다', new.addon_ticket_count::int * 10000, new.addon_amount
      using errcode = '23514';
  end if;
  return new;
end $function$;
revoke execute on function public._ledger_buyin_addon_rule() from public, anon, authenticated;
drop trigger if exists ledger_buyins_addon_rule on public.ledger_buyins;
create trigger ledger_buyins_addon_rule
  before insert or update of addon_method, addon_unpaid, addon_amount, addon_ticket_count on public.ledger_buyins
  for each row execute function public._ledger_buyin_addon_rule();

-- §D ── 애드온 이용권 복원: 이용권 몫이 남아 있는 분납 애드온은 남은 금액 수단을 바꿔도(미수 → 현금 등) 이용권을 되돌리지 않는다 ──
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
  if tg_op = 'UPDATE' and new.addon_request_id is not distinct from old.addon_request_id
     and (new.addon_method is not distinct from 'ticket'
          or (new.addon_method is not null and coalesce(new.addon_ticket_count, 0) > 0)) then
    return new;   -- 애드온 이용권이 그대로 붙어 있다(전액 또는 분납 몫)
  end if;
  select voucher_id into v_voucher from public.ledger_buyin_requests where id = old.addon_request_id;
  perform public._restore_voucher_for_request(old.addon_request_id);
  if v_voucher is not null then
    update public.store_vouchers set used_for = null where id = v_voucher and status = 'active';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.addon_request_id := null;
  new.addon_ticket_count := 0;
  return new;
end $$;
revoke all on function public._ledger_buyins_addon_voucher_restore() from public, anon, authenticated;
drop trigger if exists trg_ledger_buyins_addon_voucher_restore on public.ledger_buyins;
create trigger trg_ledger_buyins_addon_voucher_restore before update of addon_method, addon_request_id, addon_ticket_count or delete on public.ledger_buyins
  for each row execute function public._ledger_buyins_addon_voucher_restore();

-- §1 ── 승인(할인 바인 = 덜 받음 · 애드온 = 금액 ÷ 1만 장 · 모자라면 분납) ─────────────────────
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
  v_n int := 1;
  v_n_set boolean := false;
  v_need int := 1;
  v_bundle uuid[] := '{}'::uuid[];
  v_got int := 0;
  v_row_idx int;
  v_row_disc int := 0;
  v_addon_amt int;
  v_bid uuid;
  v_k int;
  v_rem int;
  v_row ledger_buyins;
  v_pm_short boolean := false;
begin
  select * into r from ledger_buyin_requests where id = p_request_id for update;
  if not found then raise exception '요청을 찾을 수 없습니다'; end if;
  if not coalesce(can_access_ledger(r.venue_id), false) then raise exception '권한이 없습니다'; end if;
  if r.status is distinct from 'pending' then
    -- W-01 — 다른 요청의 바인 1회(또는 애드온)에 이미 묶여 승인된 장. 일괄 승인이 뒤따라 불러도 성공으로 끝낸다.
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

  -- W-01 — 참가 1회 = 이용권 N장. 서버가 같은 매장의 연결 포스터에서 읽는다(화면 값 불신). 음 아닌 정수면 1~100, 그 밖은 1.
  --   v_n_set = 포스터에 N 이 적혀 있다(1 이상 정수) — ④ 애드온 규칙은 이 게임에서만 켠다.
  if r.voucher_id is not null and v_sched is not null then
    select case when (sc.buy_in ->> 'voucherPerEntry') ~ '^[0-9]+$'
                then least(100, greatest(1, (sc.buy_in ->> 'voucherPerEntry')::numeric))::int else 1 end,
           case when (sc.buy_in ->> 'voucherPerEntry') ~ '^[0-9]+$' then (sc.buy_in ->> 'voucherPerEntry')::numeric >= 1 else false end
      into v_n, v_n_set
      from schedules sc where sc.id = v_sched and sc.venue_id = r.venue_id;
    v_n := coalesce(v_n, 1); v_n_set := coalesce(v_n_set, false);
  end if;

  if p_discount_index between 1 and 5 and jsonb_typeof(v_discounts) = 'array' then
    v_disc := coalesce((v_discounts -> (p_discount_index - 1) ->> 'amount')::int, 0);
    if v_disc > 0 then v_idx := p_discount_index; v_disc := least(v_disc, v_amt); else v_disc := 0; end if;
  end if;

  -- 이용권 요청의 분납 금액은 '남은 금액' 과 맞춰 아래(분납 분기)에서 검사한다 — 여기는 현금 요청의 전액 분납만.
  if p_record_buyin and p_split and r.voucher_id is null then
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
    -- 이용권 요청에서 p_record_buyin 은 '모자라면 남은 금액을 p_pay_method(또는 p_split 금액)로 받는다' 는 뜻이다.
    v_pm_short := p_record_buyin;
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
      update ledger_buyins set addon_method = 'ticket', addon_unpaid = false, addon_request_id = r.id where id = v_target
        returning addon_amount into v_addon_amt;
      -- ④ 애드온 이용권 장수 = 애드온 금액(트리거가 세션 가격으로 스냅샷한 값) ÷ 1만, 올림, 최소 1.
      --    포스터에 N 이 설정된 게임에서만. N 미설정 게임은 예전처럼 1장(결정 ②).
      if v_n_set then
        v_need := greatest(1, ceil(greatest(0, coalesce(v_addon_amt, 0))::numeric / 10000))::int;
      end if;
    else
      select coalesce(max(entry_no), 0) + 1 into v_entry
        from ledger_buyins where venue_id = r.venue_id and session_date = r.session_date
                             and game_seq = p_game_seq and player_name = r.player_name;
      insert into ledger_buyins (venue_id, session_date, game_seq, player_name, entry_no, payment_method, discount_index, created_by, request_id)
      values (r.venue_id, r.session_date, p_game_seq, r.player_name, v_entry, 'ticket', v_idx, auth.uid(), r.id)
      returning id, discount_index into v_bid, v_row_idx;
      -- ③ 할인 바인은 할인만큼 덜 받는다. 할인 종류 규칙은 트리거가 확정한 행의 discount_index 를 쓴다(한 곳).
      --    할인액은 _ledger_buyin_apply_amount_rule 과 같은 식 — 장부 T(참가비−할인)와 같은 수.
      if coalesce(v_row_idx, 0) > 0 and jsonb_typeof(v_discounts) = 'array' and jsonb_array_length(v_discounts) >= v_row_idx then
        v_row_disc := least(v_amt, greatest(0, round(coalesce((v_discounts -> (v_row_idx - 1) ->> 'amount')::numeric, 0))))::int;
      end if;
      if v_n > 1 and v_amt > 0 then
        v_need := greatest(1, ceil(v_n::numeric * (v_amt - v_row_disc) / v_amt))::int;
      else
        v_need := v_n;
      end if;
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
        -- 모자람 — 받은 k장(1장 = 1만)에 남은 금액을 다른 수단으로 받는 분납(오너 결정 2026-09-30). 금액은 서버가 정한다.
        v_k := v_got + 1;
        v_rem := case when v_use = 'addon' then coalesce(v_addon_amt, 0) else greatest(0, v_amt - v_row_disc) end - v_k * 10000;
        if not v_pm_short then
          raise exception '이용권이 모자랍니다 — 이 %은 이용권 %장인데 받은 사용 요청은 %장입니다. 이용권 %장(%원)에 남은 %원을 현금·카드·계좌·미수로 받아 승인할 수 있습니다',
            case when v_use = 'addon' then '애드온' else '바인' end, v_need, v_k, v_k, v_k * 10000, greatest(v_rem, 0)
            using errcode = '23514', hint = 'VOUCHER_SHORT',
                  detail = json_build_object('need', v_need, 'have', v_k, 'ticketWon', v_k * 10000, 'remainder', greatest(v_rem, 0), 'use', v_use)::text;
        end if;
        if v_rem <= 0 then
          raise exception '받은 이용권 %장(%원)이 이미 금액 이상입니다 — 남은 사용 요청을 모두 받은 뒤 승인하세요', v_k, v_k * 10000
            using errcode = '23514';
        end if;
        if v_pm not in ('cash', 'card', 'transfer', 'unpaid') then
          raise exception '남은 금액의 결제 방법이 올바르지 않습니다' using errcode = '22023';
        end if;
        if v_use = 'addon' then
          if p_split then
            raise exception '애드온의 남은 금액은 한 가지 방법으로 받습니다' using errcode = '22023';
          end if;
          -- 애드온 = addon_method(남은 금액 수단) + addon_ticket_count(이용권 k장). 미수는 addon_unpaid.
          update ledger_buyins
             set addon_method = case when v_pm = 'unpaid' then 'cash' else v_pm end,
                 addon_unpaid = (v_pm = 'unpaid'), addon_ticket_count = v_k
           where id = v_target;
        else
          -- 바인 = 기존 분납 행(is_split · ticket_count(T) · cash/card/transfer · unpaid_amount). 합계는 금액 규칙 함수가 검사한다.
          select * into v_row from ledger_buyins where id = v_bid;
          v_row.is_split := true;
          v_row.ticket_count := v_k;
          v_row.cash_amount := 0; v_row.card_amount := 0; v_row.transfer_amount := 0; v_row.unpaid_amount := 0;
          if p_split then
            v_row.cash_amount := coalesce(p_cash, 0); v_row.card_amount := coalesce(p_card, 0); v_row.transfer_amount := coalesce(p_transfer, 0);
          elsif v_pm = 'unpaid' then v_row.unpaid_amount := v_rem;
          elsif v_pm = 'card' then v_row.card_amount := v_rem;
          elsif v_pm = 'transfer' then v_row.transfer_amount := v_rem;
          else v_row.cash_amount := v_rem;
          end if;
          v_row.is_unpaid := v_row.unpaid_amount > 0;
          -- 대표 수단 = ledger.ts upsertBuyinSplit 과 같은 규칙(돈이 0 이고 이용권뿐이면 ticket).
          v_row.payment_method := case
            when v_row.cash_amount + v_row.card_amount + v_row.transfer_amount = 0 then 'ticket'
            when v_row.card_amount >= v_row.cash_amount and v_row.card_amount >= v_row.transfer_amount and v_row.card_amount > 0 then 'card'
            when v_row.transfer_amount > v_row.cash_amount and v_row.transfer_amount > 0 then 'transfer'
            else 'cash' end;
          v_row := public._ledger_buyin_apply_amount_rule(v_row);   -- 합계 ≠ 참가비−할인이면 23514
          update ledger_buyins
             set is_split = true, ticket_count = v_row.ticket_count, cash_amount = v_row.cash_amount, card_amount = v_row.card_amount,
                 transfer_amount = v_row.transfer_amount, unpaid_amount = v_row.unpaid_amount, is_unpaid = v_row.is_unpaid,
                 payment_method = v_row.payment_method
           where id = v_bid;
        end if;
      end if;
      -- 묶인 장들: 같은 바인 1회(또는 애드온 1회)의 몫. 행을 만들지 않는다(취소·제거하면 _restore_voucher_for_request 가 함께 되돌린다).
      update ledger_buyin_requests
         set status = 'approved', game_seq = p_game_seq, resolved_at = now(), resolved_by = auth.uid(), bundle_request_id = r.id
       where id = any(v_bundle) and status = 'pending';
      get diagnostics v_sum = row_count;
      if v_sum is distinct from v_got then raise exception '이용권 묶음이 바뀌었습니다 — 새로고침 후 다시 승인하세요'; end if;
      update store_vouchers set used_for = v_use
       where id in (select q.voucher_id from ledger_buyin_requests q where q.id = any(v_bundle) and q.voucher_id is not null);
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

-- §2 ── 자가검사 ─────────────────────────────────────────────────────────────────────────
do $check$
begin
  if (select count(*) from pg_proc where proname = 'approve_buyin_request' and pronamespace = 'public'::regnamespace) <> 1 then
    raise exception 'ABORT: approve_buyin_request 오버로드가 1개가 아니다';
  end if;
  if has_function_privilege('anon', 'public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.approve_buyin_request(uuid, smallint, boolean, text, boolean, integer, integer, integer, integer, text)', 'execute') then
    raise exception 'ABORT: approve_buyin_request ACL 이 anon=f·authenticated=t 가 아니다';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'ledger_buyin_requests' and column_name = 'bundle_request_id') <> 1 then
    raise exception 'ABORT: 20260930g(bundle_request_id) 가 먼저 적용돼 있어야 한다';
  end if;
  if has_function_privilege('authenticated', 'public._ledger_buyins_addon_request_guard()', 'execute')
     or has_function_privilege('authenticated', 'public._ledger_buyin_addon_rule()', 'execute')
     or has_function_privilege('authenticated', 'public._ledger_buyins_addon_voucher_restore()', 'execute')
     or has_function_privilege('anon', 'public._ledger_buyins_addon_voucher_restore()', 'execute') then
    raise exception 'ABORT: 애드온 내부 함수가 화면에서 실행 가능하다';
  end if;
  if (select count(*) from pg_trigger where tgrelid = 'public.ledger_buyins'::regclass and not tgisinternal
        and tgname in ('ledger_buyins_addon_request_guard', 'ledger_buyins_addon_rule', 'trg_ledger_buyins_addon_voucher_restore')) <> 3 then
    raise exception 'ABORT: 애드온 트리거 3개가 아니다';
  end if;
end $check$;
