-- 20261004e — 장부 결제 변경: '같은 결제 수단 안에서만' 비밀번호 없이 + 모든 결제 변경 감사 기록(오너 2026-10-04 F4-02)
-- ⏳ 미적용 초안 v2(store-team 2026-10-04, 브랜치 NURI/ledger-ticket-check-1004). 적용 판단은 리드 — critical-reviewer 재반증 뒤.
-- 요구 원천: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\dummy-1004\RUN-REPORT.md#F4-02 · 오너 답 2026-10-04(리드 전달):
--   v1 "완납에서 미수로 바꾸는 것은 비밀번호 없이 가능하게."
--   v2(critical 반증 뒤 오너 결정) "같은 결제 수단으로만 자유" — 현금 미수 → 현금 완납 · 티켓 미수(가불) → 티켓 완납 · 완납 → 같은 수단 미수는
--      비밀번호 없이. 결제 수단 분류가 바뀌는 전이(현금 → 티켓 등, 단계를 나눠도)는 비밀번호.
--      그리고 모든 결제 상태·수단·금액 변경을 누가·언제·전후 값으로 기록(업주만 읽기).
-- v1 의 결함(critical-reviewer 2026-10-04, R2_critical B·C): 예외를 한 번의 UPDATE 로만 봐서
--   현금 완납 → (비번 없이) 미수 → 티켓 완납(미수 → 완납은 '증가'라 자유) 두 단계로 현금이 이용권으로 바뀌었다. 분납 현금+티켓도 같았다.
--
-- 지금(라이브 20261001j, _ledger_buyins_client_guard md5 1baa2b4f37fa68251da1f8a7423e555e — 2026-10-04 select 실측):
--   세 겹(완납 매출 · 수납 완료 · 받을 가치) 중 하나라도 줄면 LEDGER_REDUCE_NEEDS_PASSWORD(42501). 늘어나는 수정은 전부 자유.
-- v2 판정(세 겹 o/n = [완납 매출, 수납 완료, 받을 가치] · 분류 = 비분납 행의 payment_method: 현금·카드·이체 = 현금성 / ticket / support, 분납 = 없음):
--   비밀번호가 필요하다 ⇔ 아래 하나라도
--   ① 감액이고, 줄어든 몫이 전부 미수로 간 수정(받을 가치 그대로 · 이용권 몫 안 늚)이 아니다  — 금액 축소·가게지원·할인·미수 탕감
--   ② 이용권 몫이 늘었고, 비분납 티켓 행 → 비분납 티켓 행(가불 → 회수)이 아니다                 — 현금(미수 포함) → 이용권, 분납 미수 → 이용권
--   ③ 비분납 → 비분납인데 분류가 바뀌었다                                                     — 현금 ↔ 이용권 ↔ 가게지원(미수 상태 포함)
--   자유: 현금 완납 ↔ 현금 미수 · 현금 ↔ 카드 ↔ 이체 · 티켓 완납 ↔ 티켓 가불 · 분납의 현금 몫 ↔ 미수 · 분납 미수 → 현금성 · 증액.
--   ②가 단계를 나눈 우회를 막는 이유: 미수 상태에서도 비분납 행은 payment_method 로 분류를 지니고(현금 미수 ≠ 티켓 가불),
--     분납 행의 미수는 분류가 없어 이용권으로는 못 간다 — 어떤 경로로든 이용권 몫이 늘려면 처음부터 티켓 행이어야 한다.
--   한계(ponytail): 비분납 티켓 행 → 분납(현금 몫)처럼 이용권이 현금으로 가는 쪽은 ③이 안 본다(분납이 끼면 분류 비교 안 함).
--     현금 매출이 느는 방향이라 빼돌림 경로는 아니다. 막으려면 분납 행 분류를 정의해야 한다.
--   그대로 잠금: 접수대 이용권 승인 행(20261001j §3) · 마감된 장부(lb_update · ledger_is_closed).
--   클라이언트 쌍둥이: src/api/ledger.ts isRevenueReduction(같은 세 조건). 한쪽만 고치면 판정이 갈린다.
-- 감사 기록(§2): public.ledger_buyin_audit — 결제 칸(수단·미수·분납·금액·장수·할인·애드온)이 바뀌는 **모든** UPDATE(화면 직접·RPC·서버 경로)를
--   AFTER UPDATE 트리거 → SECURITY DEFINER 기록 함수가 남긴다: 누가(auth.uid(), 서버 경로는 null) · 언제 · 전후 미수·수단·세 겹·결제 칸.
--   읽기는 can_manage_pos(업주·승인 공동운영자·관리자)만. 쓰기 정책 없음(정의자 함수만 쓴다) · 기록 함수 실행권 회수.
--   바인 취소(DELETE)는 기록하지 않는다(취소는 이미 비밀번호 게이트 · 범위 밖). 화면에 보여 주는 판은 아직 없다(다음 단계).
-- 마감 뒤 미수 → 완납(settle_unpaid_after_close)·update_ledger_buyin_reduce 본문은 건드리지 않는다(감사 트리거는 그 갱신도 기록한다).
--
-- 적용 전 확인(쓰기 없음) — §0 이 자동으로 멈춘다:
--   select md5(prosrc) from pg_proc where oid = 'public._ledger_buyins_client_guard()'::regprocedure;  -- 기대 1baa2b4f37fa68251da1f8a7423e555e
--   select to_regclass('public.ledger_buyin_audit'), to_regprocedure('public._ledger_buyin_audit()');  -- 기대 null, null (2026-10-04 실측)
-- 적용 후 기대 md5(prosrc, 이 파일 본문 그대로 LF): 가드 1027d603b005c0ef6f1d333e72466797 · 감사 6207691499cfaee4cd0a3e3567f70f05 (2026-10-04 리허설 트랜잭션 안 실측과 일치)
-- 리허설(라이브 한 방 트랜잭션, 끝 RAISE 로 전량 롤백): C:\Users\buffy\Documents\누리홀덤_영상분석_0930\ticket-check-1004\
--   node rehearse.mjs R0_harness.sql <이 파일> R1_tests.sql R2_critical_v2.sql  → 'REHEARSAL_OK'
--   음성 대조: 이 파일 없이 R0 + R1 → P1(완납 → 미수) 에서 CHECK FAIL.
-- 리허설 실행(store-team 2026-10-04, RAISE 되돌림 하네스 — 운영 쓰기 0): R0(critical 수정본) + 이 파일 + R1 + R2_critical_v2 → REHEARSAL_OK(53항목 · R9_dump 로 확인)
--   음성 ① 이 파일 없이 → P1 CHECK FAIL(42501) ② v1 본문(45cf8a44) → B2 CHECK FAIL(n=1, 두 단계 우회 통과). PGlite 22케이스 ALL_MATCH(`=` 비교면 C2 불일치).

-- §0 ── 라이브 정의 게이트 ────────────────────────────────────────────────────────────────
do $gate$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public._ledger_buyins_client_guard()'::regprocedure)
       is distinct from '1baa2b4f37fa68251da1f8a7423e555e' then
    raise exception 'ABORT: _ledger_buyins_client_guard 가 20261001j 본문(1baa2b4f)이 아니다 — 라이브 본문에서 다시 만들어라';
  end if;
end $gate$;

-- §1 ── 화면 가드: 같은 결제 수단 안에서만 자유 ──────────────────────────────────────────────────────────
create or replace function public._ledger_buyins_client_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_price numeric; v_discs jsonb; o bigint[]; n bigint[]; v_co text; v_cn text;
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
    -- 20261001j(오너 10-01 '바꾸려면 취소 후 재승인') — 접수대 이용권 승인 행(전액·분납 모두 장수 k)은 장수·분납·할인을,
    --   전액 이용권 행은 결제수단·미수 표시까지 잠근다. 분납 행은 남은 금액의 수단·미수 전환만 바꿀 수 있다(합계는 금액 규칙이 검사).
    --   (critical-reviewer 10-01 F1: 장수·분납 두 칸만 보면 payment_method·is_unpaid·discount_index 만 바꾸는 요청이 통과했다)
    if old.request_id is not null and coalesce(old.ticket_count, 0) > 0
       and ((new.ticket_count, new.is_split, new.discount_index) is distinct from (old.ticket_count, old.is_split, old.discount_index)
            or (not coalesce(old.is_split, false)
                and (new.payment_method, new.is_unpaid) is distinct from (old.payment_method, old.is_unpaid))) then
      raise exception '이용권으로 승인한 바인은 결제 수단·할인·이용권 장수를 바꿀 수 없습니다(남은 금액의 결제 방법만 바꿀 수 있습니다). 바꾸려면 바인을 취소한 뒤 다시 승인하십시오.'
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
    -- 20261004e v2(오너 10-04 '같은 결제 수단으로만 자유'): ① 감액(미수로만 간 것은 제외) ② 이용권 몫 증가(티켓 행 가불 → 회수 제외) ③ 비분납 분류 변경.
    --   분납의 분류는 null — ②는 NULL-safe(is not distinct from)로 비교한다. '=' 로 쓰면 null 이 되어 분납 행에서 ②가 꺼진다(PGlite C2 실측 2026-10-04).
    v_co := case when coalesce(old.is_split, false) then null when old.payment_method = 'ticket' then 'ticket'
                 when old.payment_method = 'support' then 'support' else 'cash' end;
    v_cn := case when coalesce(new.is_split, false) then null when new.payment_method = 'ticket' then 'ticket'
                 when new.payment_method = 'support' then 'support' else 'cash' end;
    if ((n[1] < o[1] or n[2] < o[2] or n[3] < o[3]) and not (n[3] = o[3] and n[2] - n[1] <= o[2] - o[1]))
       or (n[2] - n[1] > o[2] - o[1] and not (v_co is not distinct from 'ticket' and v_cn is not distinct from 'ticket'))
       or (v_co is not null and v_cn is not null and v_co <> v_cn) then
      raise exception '매출이 줄거나 결제 수단 분류(현금·이용권·가게지원)가 바뀌는 수정은 업주 취소 비밀번호가 필요합니다'
        using errcode = '42501', hint = 'LEDGER_REDUCE_NEEDS_PASSWORD';
    end if;
  end if;
  return new;
end $$;
revoke all on function public._ledger_buyins_client_guard() from public, anon, authenticated;

-- §2 ── 결제 변경 감사 기록 ─────────────────────────────────────────────────────────────────
create table if not exists public.ledger_buyin_audit (
  id bigserial primary key,
  buyin_id uuid not null,                 -- FK 없음: 바인이 나중에 취소(삭제)돼도 기록은 남는다
  venue_id uuid not null,
  session_date date not null,
  game_seq smallint not null,
  actor_id uuid,                          -- auth.uid() — 서버 경로(크론·service_role)는 null
  changed_at timestamptz not null default now(),
  before_unpaid boolean, after_unpaid boolean,
  before_method text, after_method text,
  before_tiers bigint[], after_tiers bigint[],   -- [완납 매출, 수납 완료, 받을 가치] (_ledger_buyin_tiers)
  before_pay jsonb, after_pay jsonb              -- 결제 칸 원문(분납 금액·장수·할인·애드온)
);
create index if not exists ledger_buyin_audit_venue_time on public.ledger_buyin_audit (venue_id, changed_at desc);
create index if not exists ledger_buyin_audit_buyin on public.ledger_buyin_audit (buyin_id, changed_at);
alter table public.ledger_buyin_audit enable row level security;
revoke all on table public.ledger_buyin_audit from public, anon, authenticated;
grant select on table public.ledger_buyin_audit to authenticated;
grant all on table public.ledger_buyin_audit to service_role;
revoke all on sequence public.ledger_buyin_audit_id_seq from public, anon, authenticated;
drop policy if exists lba_select on public.ledger_buyin_audit;
create policy lba_select on public.ledger_buyin_audit for select to authenticated using (public.can_manage_pos(venue_id));

create or replace function public._ledger_buyin_audit()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_price numeric; v_discs jsonb;
begin
  select s.buyin_amount, s.discounts into v_price, v_discs
    from public.ledger_sessions s
   where s.venue_id = new.venue_id and s.session_date = new.session_date and s.game_seq = new.game_seq;
  insert into public.ledger_buyin_audit (buyin_id, venue_id, session_date, game_seq, actor_id,
    before_unpaid, after_unpaid, before_method, after_method, before_tiers, after_tiers, before_pay, after_pay)
  values (new.id, new.venue_id, new.session_date, new.game_seq, auth.uid(),
    old.is_unpaid, new.is_unpaid, old.payment_method, new.payment_method,
    public._ledger_buyin_tiers(old, v_price, v_discs), public._ledger_buyin_tiers(new, v_price, v_discs),
    jsonb_build_object('is_split', old.is_split, 'cash', old.cash_amount, 'card', old.card_amount, 'transfer', old.transfer_amount,
      'ticket', old.ticket_count, 'unpaid', old.unpaid_amount, 'discount_index', old.discount_index,
      'addon_method', old.addon_method, 'addon_unpaid', old.addon_unpaid, 'addon_amount', old.addon_amount, 'addon_ticket', old.addon_ticket_count),
    jsonb_build_object('is_split', new.is_split, 'cash', new.cash_amount, 'card', new.card_amount, 'transfer', new.transfer_amount,
      'ticket', new.ticket_count, 'unpaid', new.unpaid_amount, 'discount_index', new.discount_index,
      'addon_method', new.addon_method, 'addon_unpaid', new.addon_unpaid, 'addon_amount', new.addon_amount, 'addon_ticket', new.addon_ticket_count));
  return null;
end $function$;
revoke all on function public._ledger_buyin_audit() from public, anon, authenticated;
grant execute on function public._ledger_buyin_audit() to service_role;
drop trigger if exists trg_ledger_buyin_audit on public.ledger_buyins;
create trigger trg_ledger_buyin_audit
  after update on public.ledger_buyins
  for each row
  when ((old.payment_method, old.is_unpaid, old.is_split, old.cash_amount, old.card_amount, old.transfer_amount,
         old.ticket_count, old.unpaid_amount, old.discount_index, old.addon_method, old.addon_unpaid, old.addon_amount, old.addon_ticket_count)
        is distinct from
        (new.payment_method, new.is_unpaid, new.is_split, new.cash_amount, new.card_amount, new.transfer_amount,
         new.ticket_count, new.unpaid_amount, new.discount_index, new.addon_method, new.addon_unpaid, new.addon_amount, new.addon_ticket_count))
  execute function public._ledger_buyin_audit();

-- §3 ── 자가검사 — 하나라도 어긋나면 멈춘다(롤백) ────────────────────────────────────────────
do $check$
declare src text := (select prosrc from pg_proc where oid = 'public._ledger_buyins_client_guard()'::regprocedure);
begin
  if position('and not (n[3] = o[3] and n[2] - n[1] <= o[2] - o[1])' in src) = 0
     or position('or (n[2] - n[1] > o[2] - o[1] and not (v_co is not distinct from ''ticket'' and v_cn is not distinct from ''ticket''))' in src) = 0
     or position('or (v_co is not null and v_cn is not null and v_co <> v_cn)' in src) = 0 then
    raise exception '20261004e: 같은 결제 수단 판정 세 조건 중 하나가 없다';
  end if;
  if position('LEDGER_REDUCE_NEEDS_PASSWORD' in src) = 0 or position('이용권으로 승인한 바인은' in src) = 0 then
    raise exception '20261004e: 감액 가드·이용권 승인 행 잠금이 사라졌다';
  end if;
  if has_function_privilege('anon', 'public._ledger_buyins_client_guard()', 'execute')
     or has_function_privilege('authenticated', 'public._ledger_buyins_client_guard()', 'execute') then
    raise exception '20261004e: 트리거 함수를 anon·authenticated 가 실행할 수 있다';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.ledger_buyins'::regclass
                  and tgname = 'ledger_buyins_client_guard' and not tgisinternal and tgenabled <> 'D') then
    raise exception '20261004e: ledger_buyins_client_guard 트리거가 없다(꺼져 있다)';
  end if;
  -- 감사 기록
  if not exists (select 1 from pg_trigger where tgrelid = 'public.ledger_buyins'::regclass
                  and tgname = 'trg_ledger_buyin_audit' and not tgisinternal and tgenabled <> 'D') then
    raise exception '20261004e: 감사 트리거가 없다(꺼져 있다)';
  end if;
  if not (select prosecdef and proconfig @> array['search_path=public, pg_temp'] from pg_proc where oid = 'public._ledger_buyin_audit()'::regprocedure) then
    raise exception '20261004e: 감사 기록 함수가 DEFINER·search_path 고정이 아니다';
  end if;
  if has_function_privilege('anon', 'public._ledger_buyin_audit()', 'execute')
     or has_function_privilege('authenticated', 'public._ledger_buyin_audit()', 'execute') then
    raise exception '20261004e: 감사 기록 함수를 anon·authenticated 가 실행할 수 있다';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.ledger_buyin_audit'::regclass) then
    raise exception '20261004e: 감사 표 RLS 꺼짐';
  end if;
  if has_table_privilege('anon', 'public.ledger_buyin_audit', 'select')
     or has_table_privilege('authenticated', 'public.ledger_buyin_audit', 'insert')
     or has_table_privilege('authenticated', 'public.ledger_buyin_audit', 'update')
     or has_table_privilege('authenticated', 'public.ledger_buyin_audit', 'delete') then
    raise exception '20261004e: 감사 표 권한이 넓다(anon 읽기 또는 authenticated 쓰기)';
  end if;
  if (select count(*) from pg_policy where polrelid = 'public.ledger_buyin_audit'::regclass) <> 1
     or (select pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'public.ledger_buyin_audit'::regclass and polname = 'lba_select')
        is distinct from 'can_manage_pos(venue_id)' then
    raise exception '20261004e: 감사 표 정책이 can_manage_pos 읽기 하나가 아니다';
  end if;
end $check$;
