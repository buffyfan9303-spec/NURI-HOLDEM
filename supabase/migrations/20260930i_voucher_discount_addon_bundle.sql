-- ⏳ 초안(미적용) — store-team 2026-09-30. 적용은 리드(MCP execute_sql, 이 파일 §A~§2 본문 그대로 한 번에).
-- 20260930i — 이용권 장수와 분납: ③ 할인 바인은 할인만큼 덜 받는다 · ④ 애드온 = 애드온 금액 기준(포스터 N 설정 게임만) ·
--             ⑤ 이용권은 **만원 단위로만** 받고, 모자라거나 만원 미만 나머지가 있으면 '이용권 k장 + 남은 금액(현금·카드·계좌·미수)' 분납.
--   요구 원문: .claude/agent-memory-local/nuri-lead/project_owner_decisions_0930.md 오후 결정 ③④ + 리드 결정(④는 N 설정 게임만) +
--             오너 추가 결정 2026-09-30(모자라면 분납) + 리드 결정(critical·Fable 검토 반영 2026-09-30:
--             .claude/agent-memory-local/critical-reviewer/voucher_disc_addon_0930i_review.md — ① 분납 애드온 '티켓' 전환 틈 ② 접수대 행 이용권 장수 잠금
--             ③ 만원 단위(floor)·금액 우선 ④ N×1만 > 참가비 막다른 길 → 필요한 장수만 묶고 나머지 장은 대기).
--   ①(참가비≠N×1만 경고만)·②(N 미설정 게임 = 1장 = 참가 1회, 애드온도 1장)는 그대로.
--
-- 지금(라이브 20260930g, approve md5 458be576…): 할인이 붙어도 N장을 다 묶는다(장부 5T 인데 이용권 10장) · 애드온은 금액과 무관하게 1장 ·
--   모자라면 23514 거절뿐(분납 불가) · 8만 게임·N=10 은 10장이 아니면 승인 불가.
--
-- 이 파일이 바꾸는 것
--   §A ledger_buyins.addon_ticket_count smallint default 0 (+ CHECK ≥ 0) — 애드온 분납의 이용권 몫(T). 바인 분납은 **기존 칸**
--      (is_split · ticket_count(T) · cash/card/transfer_amount · unpaid_amount · is_unpaid)을 그대로 쓴다. 기존 행 0 = 예전 동작.
--   §B _ledger_buyins_addon_request_guard — 화면(authenticated/anon)이 addon_ticket_count 도 못 바꾼다(트리거 칸 목록에 추가).
--   §C _ledger_buyin_addon_rule — 애드온을 지우면 이용권 몫 0 · 몫 > 0 이면 'ticket' 으로 못 바꾼다(23514) · 몫 × 1만 < 금액 검사.
--   §D _ledger_buyins_addon_voucher_restore — 몫이 남은 분납 애드온은 남은 금액 수단을 바꿔도(미수→현금 등) 이용권 유지,
--      애드온 제거·행 삭제면 예전처럼 전부 되돌리고 몫 0.
--   §E _ledger_buyins_client_guard — 접수대 이용권 승인 행(request_id 있고 ticket_count > 0)의 ticket_count·is_split 을 화면이 못 바꾼다(42501).
--      남은 금액 수단(미수→현금)은 그대로 바꿀 수 있다. 나머지 본문은 라이브(20260925g)와 같다.
--   §1 approve_buyin_request(같은 10인자 서명 · create or replace → ACL 보존, REVOKE/GRANT 재기재)
--      · 바인: 티켓 행을 먼저 넣고 트리거가 확정한 discount_index 를 RETURNING 으로 읽는다(할인 종류 규칙 = kind_guard 한 곳).
--        N > 1 게임이면 금액 = 참가비 − 할인, 필요 장수 = min(N, floor(금액 / 1만))(만원 단위 · 포스터 약속 N장 = 참가 1회가 상한).
--        N장을 다 받으면 남은 금액 없이 참가 1회(12만·N=10 → 10장 = 1회, critical N7). 모자라면 남은 금액 = 금액 − k × 1만.
--        N ≤ 1(미설정)은 예전처럼 1장.
--      · 애드온: 금액 = 트리거가 스냅샷한 addon_amount(RETURNING, 클라 값 불신), 포스터 N ≥ 2 게임만 필요 장수 = floor(금액 / 1만).
--        N 미설정·N=1 명시는 예전처럼 1장(리드 결정 2026-09-30: N=1 = 미설정과 같다 — v_n_set 은 N ≥ 2 일 때만 참).
--      · 금액이 1만 미만이면 이용권으로 받지 않는다(23514 — 요청 그대로).
--      · 묶음: 같은 손님·영업일·매장의 대기 이용권 요청을 오래된 순 **필요−1 개까지만** 잠금(나머지 장은 대기로 남는다) → bundle_request_id.
--      · 받은 k장 × 1만 < 금액이면(장수 모자람이든 만원 미만 나머지든) 남은 금액 = 금액 − k × 1만(서버 계산):
--          p_record_buyin=false(기본) → 23514 · hint 'VOUCHER_SHORT' · detail {"need","have","ticketWon","remainder","use"} — 화면이 분납 선택을 띄운다.
--          p_record_buyin=true        → 분납 승인. p_pay_method ∈ cash·card·transfer·unpaid. 바인은 기존 분납 칸 + _ledger_buyin_apply_amount_rule
--            합계 검사, 애드온은 addon_method(+addon_unpaid) + addon_ticket_count. k장 전부 그 행에 묶이고 취소·삭제·애드온 제거 때 전부 복원.
--      · 현금 요청(이용권 아님)의 현금·카드·이체·분납 바인, 권한·마감·세션 검사는 그대로.
--   정산·통계: 바인 분납 행 = 1행 = 바인 1회(엔트리 = 가치/정가, 기존 buyinFinance·_ledger_buyin_tiers 식) — 이용권 kT + 나머지 수단.
--      애드온 분납 = 애드온 1회(클락 addons 는 addon_method 가 있는 행 수라 불변) — 이용권 kT + 나머지(ledger.ts addonFinance 가 나눈다).
--
-- 적용 전 확인(쓰기 없음, 리드):
--   ① select proname, md5(prosrc) from pg_proc where proname in ('approve_buyin_request','_ledger_buyins_addon_request_guard',
--        '_ledger_buyin_addon_rule','_ledger_buyins_addon_voucher_restore','_ledger_buyins_client_guard');
--      → approve 458be576a8c8bb25de6563d5e989935c · guard c9fdce5879e80c6f4778b3677f71459b · rule c3104ae31d0e253f9aa2cf0cb6d918b5 ·
--        restore 8330ce1c4338157a7c839ab4ee5762b9 · client_guard c99d897bed2e0f5b90551578becd600a (2026-09-30 실측). 다르면 대조 뒤 적용.
--   ② select count(*) from information_schema.columns where table_name='ledger_buyins' and column_name='addon_ticket_count'; → 0
--   ③ bundle_request_id 칸 존재(20260930g) → 1
--   🔴 클라이언트보다 먼저 적용한다(새 화면의 분납 승인은 이 서버가 있어야 동작 — 옛 서버는 hint 가 없어 분납 선택이 안 뜬다).
--
-- 리허설(라이브 한 방 트랜잭션 + 끝 RAISE 로 전량 롤백, 2026-09-30 store-team · 하네스 scratchpad kw1i/common.sql·scen2.sql·scen3.sql).
--   계정: 업주 = 키키홀덤펍 소유자(admin) · 손님 = 본인인증 일반 회원 · 음성 = 다른 매장(E2E) 업주. 참가비 10만 · 포스터 N=10(트랜잭션 안에서만).
--   PRE = 라이브 함수, POST = 이 파일 본문(§A~§2). POST 는 네 번(기존 반례 / 새 반례 / N=1 대조 / N7 포스터 상한) — 매번 함수 md5 가 파일과 일치.
--   | 시나리오                                   | PRE(라이브)                             | POST(이 파일)                                                          |
--   | A 첫 리바인 50%, 5장                         | 23514 · 0행                     FAIL    | 2행 [d0, d1] · 5장 used/buyin · 취소 → 5장 active                PASS |
--   | B 50% 리바인 4장                             | 23514                                   | 23514 VOUCHER_SHORT '5장까지 · 받은 4장 · 남은 1만'                    |
--   | C 할인 0, 10장                               | 1행                                     | 1행(불변)                                                              |
--   | D 애드온 5만(N 설정), 5장                     | 1장만 씀                        FAIL    | 5장 used/addon · 취소 → 5장 active                               PASS |
--   | E 애드온 5만, 3장                             | 1장으로 애드온                  FAIL    | 23514 VOUCHER_SHORT '받은 3장(3만) · 남은 2만'                   PASS |
--   | I 애드온 5만, N 미설정 게임                   | 1장 · 대기 1                             | 1장 · 대기 1(불변, 결정 ②)                                       PASS |
--   | S1 10장 게임 7장 + 현금 · 취소                | 23514                           FAIL    | split tk=7 cash=3만 · tiers {3만,10만,10만} · 취소 → 7장 active   PASS |
--   | S4 7장 + 미수                                 | 23514                           FAIL    | pm=ticket split tk=7 unpaid=3만 · tiers {0,7만,10만}             PASS |
--   | S2 애드온 3장 + 카드 · 몫 변경 · 카드→현금 · 제거 | 1장만 씀                    FAIL    | card/5만 tk=3 · 몫 변경 42501 · 수단 변경 3장 유지 · 제거 3장 active PASS |
--   | S3 애드온 3장 + 미수 → 미수 해제 → 삭제        | 1장만 씀                        FAIL    | cash/5만 tk=3 미수 → 해제(3장 유지) → 삭제 3장 active           PASS |
--   | S5 10장 넉넉 + 현금 지정                      | 1행 ticket                               | 1행 ticket(분납 아님)                                                  |
--   | N1 첫 리바인 3.5만 할인(6.5만) · 7장          | 23514                           FAIL    | 23514 VOUCHER_SHORT '6장까지 · 남은 5천' → +현금: split tk=6 cash=5천 · tiers {5천,6.5만,6.5만} · 1장 대기 PASS |
--   | N2 8만 게임·N=10 · 9장                        | 23514(막다른 길)                FAIL    | 1행 ticket · 8장만 묶음 · 1장 대기 · tiers {0,8만,8만}            PASS |
--   | N3 분납 애드온을 화면이 티켓 완납/미수로        | ok(전액 이용권으로 셈)          FAIL    | 23514 '티켓으로 바꿀 수 없습니다' · 행 card/5만 tk=3 그대로      PASS |
--   | N4 분납 바인을 화면이 3장·현금 7만 / 분납 해제   | ok                              FAIL    | 42501 둘 다 · 행 tk=7 cash=3만 그대로                            PASS |
--   | N5 양성: 7장 + 미수 → 화면이 미수를 현금 수납    | (분납 불가)                              | ok · tk=7 cash=3만 · tiers {3만,10만,10만}                       PASS |
--   | N6 금액 5천(9.5만 할인) 바인 1장                | 23514(10장 필요)                         | 23514 '1만 원보다 작아 이용권으로 받을 수 없습니다' · 요청 대기  PASS |
--   | N7 12만·N=10 · 10장(포스터 약속 우선)         | 1행 ticket · 10장 묶음                      | 1행 ticket · 분납 없음 · tiers {0,12만,12만} (직전 초안은 '남은 2만' 분납 요구 = FAIL) PASS |
--   | N7b 12만·N=10 · 7장 + 현금                    | 23514                           FAIL    | split tk=7 cash=5만 · tiers {5만,12만,12만}                      PASS |
--   | N7 회귀: A 50% 5장 · N1 6.5만 7장 + 현금 · N2 8만 9장 · S1 7장 + 현금 | 위 표와 같음                   | 위 표와 같음(각 2행 d1 5T · tk6 cash 5천 1장 대기 · 8장 1장 대기 · tk7 cash 3만) PASS |
--   | P1 양성: 포스터 N=1 명시 · 애드온 5만 · 3장  | 1장(애드온 ticket/5만) · 2장 대기           | 동일 — N=1 은 미설정과 같다(v_n_set = N ≥ 2, 리드 결정)    PASS |
--   | P2 대조: 포스터 N=10 · 애드온 5만 · 5장       | 1장만 씀 · 4장 대기             FAIL    | 5장 묶음 · 대기 0                                                PASS |
--   | F 양성: N 미설정 + 할인 2장                    | 2행 d1,d1                                | 동일                                                                   |
--   | G 양성: 현금 바인 할인(N=10 게임)               | cash 5만 d1                              | 동일                                                                   |
--   | H 음성: 다른 매장 업주 · 비로그인               | 권한 없음 · 42501                          | 동일                                                                   |
--   | 정산 합계(게임 15~19, _ledger_buyin_tiers 합)    | 15 {0,10만,10만} 17 {0,10만,10만}         | 15 {5천,16.5만,16.5만} 16 {0,8만,8만} 17 {0,10만,10만} 18 {3만,10만,10만} 19 {3만,10만,10만} |
--   | §2 자가검사(ACL·트리거 3·client_guard authenticated=f) | —                                  | 통과                                                                   |
--   적용 직후 md5(prosrc) — 파일 본문과 일치: approve de5cd99da0c1aadb34e5535bcb7705da · guard fad4fc8e9e673805e310855d87f1a2e4 ·
--     rule 35e7504abaae6d7c62ce93f3eaebdfde · restore f1d77776be662d4deeef8c357dca3f12 · client_guard eee44d4d0c9c53e9fda390227d5f30c2.
--   롤백 확인: 프로브 없음 · addon_ticket_count 칸 0 · 다섯 함수 md5 적용 전 값 그대로 · 포스터 buy_in md5 348ae304…(그대로) · 리허설 이용권 0.
--   NOT_RUN: 두 접수대 동시 승인(deadlock) · 바인 분납의 p_split 금액 나눔(화면은 단일 수단만 보냄 — 합계 검사는 기존 함수).
--   남은 틈(범위 밖, 기존): 전액 이용권 바인 행(ticket_count 0)을 화면이 현금으로 바꾸는 것(§E 는 분납 행만 잠근다) ·
--            update_ledger_buyin_reduce(비밀번호 RPC, definer)는 client_guard 를 건너뛴다 · 취소로 복원된 이용권의 used_for 잔존.
-- 적용 후 기대 md5(prosrc): 위 다섯 값(파일 본문 그대로 적용했을 때).

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
  if new.addon_method = 'ticket' and coalesce(new.addon_ticket_count, 0) > 0 then
    raise exception '이용권 분납 애드온은 티켓으로 바꿀 수 없습니다 — 남은 금액의 수단만 바꾸거나, 애드온을 지우고 다시 승인하세요'
      using errcode = '23514';
  end if;
  if coalesce(new.addon_ticket_count, 0) > 0
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

-- §E ── 화면 가드: 접수대 이용권 승인 행의 이용권 장수(ticket_count)·분납 여부는 화면이 못 바꾼다 ─────────────
--   묶인 이용권 k장(request_id + bundle_request_id)과 장부 T(ticket_count)가 갈리지 않게. 남은 금액 수단(미수→현금 등)은 그대로 바꿀 수 있다.
--   나머지는 라이브 본문(20260925g, md5 c99d897b…)과 한 글자도 다르지 않다.
create or replace function public._ledger_buyins_client_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
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
    if coalesce(public.can_access_ledger(new.venue_id), false) then
      new := public._ledger_buyin_apply_amount_rule(new);
    end if;
  else
    if new.request_id is distinct from old.request_id
       or new.created_by is distinct from old.created_by
       or new.buyin_at is distinct from old.buyin_at
       or new.venue_id is distinct from old.venue_id
       or new.session_date is distinct from old.session_date then
      raise exception '기록자·기록 시각·매장·요청 연결은 바꿀 수 없습니다' using errcode = '42501';
    end if;
    if new.game_seq is distinct from old.game_seq then
      raise exception '기록의 게임 번호는 바꿀 수 없습니다' using errcode = '42501';
    end if;
    if new.player_name is distinct from old.player_name or new.entry_no is distinct from old.entry_no then
      raise exception '바인의 손님·순번은 직접 바꿀 수 없습니다 — 이름 변경은 플레이어 이름 수정으로 하세요' using errcode = '42501';
    end if;
    if old.request_id is not null and coalesce(old.ticket_count, 0) > 0
       and (new.ticket_count is distinct from old.ticket_count or new.is_split is distinct from old.is_split) then
      raise exception '접수대에서 이용권으로 승인한 바인의 이용권 장수는 바꿀 수 없습니다 — 남은 금액의 수단만 바꾸거나, 바인을 취소하고 다시 승인하세요'
        using errcode = '42501';
    end if;
    if (new.payment_method, new.is_unpaid, new.is_split, new.cash_amount, new.card_amount, new.transfer_amount,
        new.ticket_count, new.unpaid_amount, new.discount_index)
       is distinct from
       (old.payment_method, old.is_unpaid, old.is_split, old.cash_amount, old.card_amount, old.transfer_amount,
        old.ticket_count, old.unpaid_amount, old.discount_index) then
      new := public._ledger_buyin_apply_amount_rule(new);
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
end $$;
revoke all on function public._ledger_buyins_client_guard() from public, anon, authenticated;

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
  v_val int;
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
  --   v_n_set = 포스터 N ≥ 2(리드 결정: N=1 명시는 미설정과 같다 — 1장 = 참가 1회 가치) — ④ 애드온 금액 규칙은 이 게임에서만 켠다.
  if r.voucher_id is not null and v_sched is not null then
    select case when (sc.buy_in ->> 'voucherPerEntry') ~ '^[0-9]+$'
                then least(100, greatest(1, (sc.buy_in ->> 'voucherPerEntry')::numeric))::int else 1 end,
           case when (sc.buy_in ->> 'voucherPerEntry') ~ '^[0-9]+$' then (sc.buy_in ->> 'voucherPerEntry')::numeric >= 2 else false end
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
      -- ④ 애드온 이용권 = 애드온 금액(트리거가 세션 가격으로 스냅샷한 값)의 **만원 단위**만(floor). 만원 미만 나머지는 분납.
      --    포스터 N ≥ 2 인 게임에서만(리드 결정: N=1 명시는 미설정과 같다 — 1장 = 참가 1회 가치). 그 밖은 예전처럼 1장(결정 ②).
      if v_n_set then
        v_val := greatest(0, coalesce(v_addon_amt, 0));
        v_need := greatest(1, floor(v_val / 10000.0))::int;
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
      -- ③ 이용권은 **만원 단위로만** 받는다(리드 결정 2026-09-30): 필요 장수 = floor((참가비 − 할인) / 1만), 만원 미만 나머지는 분납.
      --    단 포스터 약속 'N장 = 참가 1회' 가 상한이다(critical N7, 리드 결정): 필요 장수 = min(N, floor(금액 / 1만)) —
      --    12만·N=10 게임은 10장이면 분납 없이 바인 1회(장부는 기존 정의대로 참가비 기준). N ≤ 1(미설정·N=1)은 예전처럼 1장(결정 ②).
      if v_n > 1 and v_amt > 0 then
        v_val := greatest(0, v_amt - v_row_disc);
        v_need := greatest(1, least(v_n, floor(v_val / 10000.0)::int));
      else
        v_need := v_n;
      end if;
    end if;

    if v_val is not null and v_val < 10000 then
      raise exception '이 %은 금액(%원)이 1만 원보다 작아 이용권으로 받을 수 없습니다 — 요청을 거절하고 다른 결제로 받으세요',
        case when v_use = 'addon' then '애드온' else '바인' end, v_val using errcode = '23514';
    end if;
    if v_need > 1 then
      if r.user_id is null then
        raise exception '이 요청은 손님 계정이 없어 이용권을 묶을 수 없습니다' using errcode = '23514';
      end if;
      -- 필요한 장수까지만 잠근다 — 더 쓴 장은 대기로 남는다(과다 차감 없음).
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
    end if;
    v_k := v_got + 1;
    -- 남은 금액 = 금액 − k × 1만(금액 기준 게임에서만). 모자란 장수든 만원 미만 나머지든 같은 분납 경로로 받는다.
    v_rem := case when v_val is null then 0
                  when v_use = 'buyin' and v_k >= v_n then 0   -- 포스터 약속: N장을 다 받으면 참가 1회(남은 금액 없음)
                  else v_val - v_k * 10000 end;
    if v_rem > 0 then
      if not v_pm_short then
        raise exception '남은 금액이 있습니다 — 이 %은 이용권 %장까지 받습니다(만원 단위). 받은 사용 요청 %장(%원) · 남은 %원을 현금·카드·계좌·미수로 받아 승인하세요',
          case when v_use = 'addon' then '애드온' else '바인' end, v_need, v_k, v_k * 10000, v_rem
          using errcode = '23514', hint = 'VOUCHER_SHORT',
                detail = json_build_object('need', v_need, 'have', v_k, 'ticketWon', v_k * 10000, 'remainder', v_rem, 'use', v_use)::text;
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
    if v_got > 0 then
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
     or has_function_privilege('anon', 'public._ledger_buyins_addon_voucher_restore()', 'execute')
     or has_function_privilege('authenticated', 'public._ledger_buyins_client_guard()', 'execute') then
    raise exception 'ABORT: 애드온 내부 함수가 화면에서 실행 가능하다';
  end if;
  if (select count(*) from pg_trigger where tgrelid = 'public.ledger_buyins'::regclass and not tgisinternal
        and tgname in ('ledger_buyins_addon_request_guard', 'ledger_buyins_addon_rule', 'trg_ledger_buyins_addon_voucher_restore')) <> 3 then
    raise exception 'ABORT: 애드온 트리거 3개가 아니다';
  end if;
end $check$;
