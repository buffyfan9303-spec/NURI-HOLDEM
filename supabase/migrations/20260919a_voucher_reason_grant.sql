-- ✅ 적용 완료 2026-09-19 (오너 사전 승인) — 라이브 실측
--    예행연습: `begin; … rollback;` 으로 자가검사 4종 통과를 먼저 확인한 뒤 적용했다.
--    적용 후 실측:
--      · CHECK = welcome / visit / event / service / other / **grant** (6개)
--      · issue_voucher 가드에 grant 포함
--      · 검사용 잔여 행 0
--      · **ACL 보존 확인**: anon=false / authenticated=true
--        (CLAUDE.md 실측대로 `CREATE OR REPLACE` 는 권한을 지우지 않는다 — DROP 이 지운다)
--      · 어드바이저 보안 **ERROR 0** (INFO 1 · WARN 3 은 이전부터 있던 항목)
--    ⚠ **예행연습이 내 자가검사의 결함을 잡았다.** `issued_by` 가 NOT NULL 이라
--      CHECK 에 닿기도 전에 not-null 로 막혀서, 검사가 아무것도 재지 못하고 있었다.
--      예행연습을 건너뛰었다면 '통과하는 것처럼 보이는 빈 검사' 가 그대로 나갔다.
-- 20260919a — 매장이용권 발급 근거에 **'이용권 지급'(grant)** 추가. 오너 지시 2026-09-19.
--
-- 왜
--   오너: "첫방문 환영과 방문 감사를 삭제하고 첫 PILL 에 이용권 지급을 추가."
--   화면은 그대로 바꿀 수 있었지만 **서버가 받는 값이 5개로 고정**이라, 팀이 임시로
--   '이용권 지급' 라벨을 `welcome`(첫 방문 환영) 값에 얹었다. 그래서 발급 내역을 나중에 보면
--   **사유 없이 그냥 준 것도 '첫 방문 환영' 으로 보인다** — 데이터의 뜻이 섞인다.
--   오너 결정(2026-09-19): "내역도 '이용권 지급' 으로 보이게 해라."
--
-- 무엇을 바꾸나 — **두 곳이다. 하나만 바꾸면 발급이 막힌다.**
--   ① `store_vouchers_issue_reason_chk` CHECK 제약
--   ② `public.issue_voucher(...)` 안의 `v_reason not in (...)` 가드
--   ⚠ 이 저장소 규칙: 권한·검증 함수를 손댈 때는 **전이 폐쇄로 센다.** 라이브에서
--     `pg_get_functiondef ilike '%welcome%'` 로 전수 조회해 이 둘만 나오는 것을 확인했다
--     (`_event_open_welcome_bonus` 는 이벤트 보너스라 무관).
--
-- 무엇을 바꾸지 않나
--   · **과거 `welcome` 기록은 건드리지 않는다.** 그건 진짜 '첫 방문 환영' 이었다. 소급 변환 금지.
--   · 기존 5개 값은 전부 그대로 받는다(양성 대조로 확인).
--
-- ⚠ ② 는 **함수 본문을 손으로 다시 타이핑하지 않는다.** 라이브 정의를 읽어 그 한 줄만 치환해
--   되쓴다 — 긴 본문을 옮겨 적다가 다른 줄을 흘리는 것이 이 작업의 제일 큰 위험이다.
--   `CREATE OR REPLACE` 는 ACL 을 보존한다(2026-09-12 격리 컨테이너 실측) — 권한은 그대로다.

begin;

-- ① CHECK 제약
alter table public.store_vouchers drop constraint if exists store_vouchers_issue_reason_chk;
alter table public.store_vouchers add constraint store_vouchers_issue_reason_chk
  check (issue_reason is null
         or issue_reason in ('welcome', 'visit', 'event', 'service', 'other', 'grant'));

-- ② issue_voucher 가드 — 라이브 정의를 읽어 목록 한 줄만 넓힌다
do $mig$
declare src text; patched text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'issue_voucher';
  if src is null then
    raise exception '[20260919a] issue_voucher 를 찾지 못했다 — 함수명이 바뀌었나?';
  end if;

  patched := replace(
    src,
    $old$in ('welcome', 'visit', 'event', 'service', 'other')$old$,
    $new$in ('welcome', 'visit', 'event', 'service', 'other', 'grant')$new$);

  if patched = src then
    raise exception '[20260919a] issue_voucher 안에서 근거 목록을 못 찾았다 — 문자열이 바뀌었다. 손으로 확인해라.';
  end if;

  execute patched;
end $mig$;

-- ③ 자가검사 — 음성(막아야 할 것)과 **양성(되어야 할 것)** 을 둘 다 본다.
--    이 저장소 기록: 음성만 넣으면 "아무도 통과 못 하는 고장" 을 못 잡는다.
do $chk$
declare ok boolean; zero uuid := '00000000-0000-0000-0000-000000000000';
begin
  -- ⚠ `issued_by` 는 NOT NULL 이다. 처음엔 안 채웠다가 **CHECK 에 닿기도 전에 not-null 로 막혀**
  --   예행연습이 실패했다 — 그래서 검사가 아무것도 못 재고 있었다. 반드시 채운다.
  -- ⚠ 판정 원리: PostgreSQL 은 **CHECK 를 FK 트리거보다 먼저** 평가한다.
  --   → 값이 허용되면 FK 에서 막히고(= 양성), 아니면 CHECK 에서 막힌다(= 음성). 결정적이다.

  -- 양성 ①: 새 값이 CHECK 를 통과한다
  begin
    insert into public.store_vouchers(venue_id, issued_by, title, issue_reason)
    values (zero, zero, '__migchk__', 'grant');
    raise exception '[20260919a] 검사용 행이 실제로 들어갔다 — 롤백된다';
  exception
    when foreign_key_violation then
      null;  -- CHECK 는 통과하고 FK 에서 막혔다 = 값 자체는 허용된다(원하는 상태)
    when check_violation then
      raise exception '[20260919a] 양성 실패: 새 값 grant 가 CHECK 에 막혔다';
  end;

  -- 양성 ②: 기존 값이 여전히 통과한다(하나라도 막히면 발급이 통째로 죽는다)
  begin
    insert into public.store_vouchers(venue_id, issued_by, title, issue_reason)
    values (zero, zero, '__migchk__', 'welcome');
    raise exception '[20260919a] 검사용 행이 실제로 들어갔다 — 롤백된다';
  exception
    when foreign_key_violation then null;
    when check_violation then
      raise exception '[20260919a] 회귀: 기존 값 welcome 이 막혔다';
  end;

  -- 음성: 아무 값이나 받아서는 안 된다
  begin
    insert into public.store_vouchers(venue_id, issued_by, title, issue_reason)
    values (zero, zero, '__migchk__', '__not_a_reason__');
    raise exception '[20260919a] 음성 실패: 아무 문자열이나 통과한다 — CHECK 가 무력해졌다';
  exception
    when check_violation then null;   -- 막혔다 = 정상
    when foreign_key_violation then
      raise exception '[20260919a] 음성 실패: 잘못된 값이 CHECK 를 지나 FK 까지 갔다';
  end;

  -- 함수 가드도 실제로 넓어졌는지
  select pg_get_functiondef(p.oid) like '%''grant''%' into ok
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'issue_voucher';
  if not coalesce(ok, false) then
    raise exception '[20260919a] issue_voucher 가드에 grant 가 없다';
  end if;
end $chk$;

commit;
