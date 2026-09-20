-- 20260921a — issue_voucher: 수신자 없는 발급과 조용한 장수 보정을 서버에서 막는다
--
-- 🔴 적용 상태: **미적용 (BLOCKED)**  — 2026-09-21
--    이 파일을 만든 작업의 지시가 "라이브 DB 적용 권한을 확대하지 마라" 였다.
--    적용하는 사람은 아래 §적용 절차를 그대로 따르고, 끝나면 이 머리말을
--    "✅ YYYY-MM-DD 라이브 적용 완료 + 실측값" 으로 바꿔라. 표기가 없으면 다음 사람이 또 적용한다.
--
-- ── 왜 ────────────────────────────────────────────────────────────────────────
-- ① **수신자 없는 발급** — 라이브 `issue_voucher` 는 `p_holder_user_id` 가 NULL 이어도
--    수량만큼 행을 만들고 `venues.voucher_quota` 를 차감한다. 만들어진 표는
--    `20260914b_voucher_kill_switch_server_gate.sql:107-108` 트리거가 사용 전이를 영구 거절하므로
--    **아무도 못 쓰는 고아 레코드 + 한도 낭비**가 된다.
--    ⚠ 이것은 기능 제거가 아니라 **이미 내려진 오너 결정을 서버까지 관철**하는 것이다:
--      `VoucherManageModal.tsx:272-275` 주석 — "오너 결정(2026-09-14): 손님 미지정 발급을 막는다 —
--      나중에 손님을 배정하는 기능이 없어 영원히 못 쓰는 표가 되고, 서버도 보유자 없는 이용권의
--      사용 전이를 거절한다(20260914b). 버튼도 비활성화하지만 한 번 더 막는다."
--      화면은 두 겹으로 막았는데 **서버만 안 막혀 있었다** — `grant execute … to authenticated` 라
--      인증된 업주/승인 공동운영자/admin 이 REST·콘솔로 직접 RPC 를 부르면 그대로 통과한다.
--    ⚠ **이미 존재하는 NULL 보유자 행은 건드리지 않는다.** 이 가드는 새 발급에만 적용된다.
--
-- ② **조용한 장수 보정** — `v_count := least(greatest(coalesce(p_count, 1), 1), 1000);` 이라
--    `p_count = -5` 를 보내면 **오류 없이 1장**이 발급된다. 화면이 요청한 수량과 서버가 만든 수량이
--    다른데 아무 신호가 없다. 실행문 요구: "UI 의 명시적 장수와 서버 실제 발급 수량이 다른
--    조용한 보정을 허용하지 않는다." → 범위를 벗어나면 **거절**한다(기본값 1 은 그대로 둔다).
--
-- ── 왜 통째로 재정의하지 않고 '읽어서 패치' 하는가 ──────────────────────────────
-- 🔴 **저장소 파일은 라이브 정의의 정본이 아니다.** `20260919a_voucher_reason_grant.sql:45-67` 이
--    `pg_get_functiondef()` 로 **라이브 소스를 읽어 한 줄만 치환**해 적용했다. 그래서 라이브 정의는
--    `20260905i` 파일 텍스트와 다르다. 여기서 `create or replace` 로 파일 본문을 덮으면
--    그 이후의 라이브 전용 변경이 **조용히 되돌아간다**. 같은 방식(읽기→치환→실행)을 쓴다.
-- ⚠ `create or replace` 라 ACL 은 보존된다(CLAUDE.md 2026-09-12 실측). 그래도 아래에 REVOKE/GRANT 를
--    다시 적는다 — 함수가 어떤 이유로 DROP 후 재생성되는 경우를 위한 관행이다.

begin;

-- ① 라이브 정의를 읽어 두 곳을 패치한다 ---------------------------------------
do $mig$
declare src text; patched text; step text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'issue_voucher'
     and pg_get_function_identity_arguments(p.oid) =
         'p_venue_id uuid, p_title text, p_count integer, p_holder_name text, p_holder_user_id uuid, p_note text, p_expires_at timestamp with time zone, p_reason text';
  if src is null then
    raise exception '[20260921a] issue_voucher(8인자) 를 찾지 못했다 — 시그니처가 바뀌었다. 손으로 확인해라.';
  end if;

  -- 이미 적용돼 있으면 조용히 끝낸다(재적용 안전).
  if position('[20260921a]' in src) > 0 then
    raise notice '[20260921a] 이미 적용돼 있다 — 건너뛴다.';
    return;
  end if;

  patched := src;

  -- (1) 수신자 필수 — 만료일 검사 **뒤**, 한도 차감 **앞**에 넣는다.
  --     순서가 중요하다: 한도를 깎기 전에 거절해야 실패했을 때 한도가 안 줄어든다.
  step := '만료일 가드';
  patched := replace(
    patched,
    $old$  if p_expires_at is not null and p_expires_at <= now() then
    raise exception '만료일은 미래 시각이어야 합니다';
  end if;$old$,
    $new$  if p_expires_at is not null and p_expires_at <= now() then
    raise exception '만료일은 미래 시각이어야 합니다';
  end if;
  -- [20260921a] 받는 회원 필수. 보유자 없는 이용권은 20260914b 트리거가 사용을 영구 거절하므로
  --   만들면 아무도 못 쓰는 표 + 한도 낭비가 된다. 화면은 2026-09-14 오너 결정으로 이미 막았고
  --   여기가 마지막 방어선이다. 한도 차감 **앞**이라 거절해도 한도는 그대로다.
  if p_holder_user_id is null then
    raise exception '받는 회원을 지정해야 매장이용권을 발급할 수 있습니다 — 보유자 없는 이용권은 사용할 수 없습니다';
  end if;
  if not exists (select 1 from public.profiles pr where pr.id = p_holder_user_id) then
    raise exception '받는 회원 계정을 찾을 수 없습니다';
  end if;$new$);
  if patched = src then
    raise exception '[20260921a] 치환 실패(%): 라이브 소스에서 앵커 문자열을 못 찾았다. 손으로 확인해라.', step;
  end if;

  -- (2) 장수 조용한 보정 → 명시적 거절. 기본값(NULL→1)은 그대로 둔다.
  step := '장수 clamp';
  declare before2 text := patched;
  begin
    patched := replace(
      patched,
      $old$v_count := least(greatest(coalesce(p_count, 1), 1), 1000);$old$,
      $new$-- [20260921a] 조용한 보정 금지 — 범위를 벗어나면 거절한다.
  --   예전: least(greatest(coalesce(p_count,1),1),1000) → p_count=-5 가 오류 없이 1장이 됐다.
  if p_count is not null and (p_count < 1 or p_count > 1000) then
    raise exception '발급 장수는 1~1000 사이여야 합니다 (요청 %장)', p_count;
  end if;
  v_count := coalesce(p_count, 1);$new$);
    if patched = before2 then
      raise exception '[20260921a] 치환 실패(%): 라이브 소스에서 앵커 문자열을 못 찾았다. 손으로 확인해라.', step;
    end if;
  end;

  execute patched;
  raise notice '[20260921a] issue_voucher 패치 적용';
end $mig$;

-- ② ACL 재확인 — CLAUDE.md 보안표준 3번 ---------------------------------------
revoke all on function public.issue_voucher(uuid, text, integer, text, uuid, text, timestamp with time zone, text) from public, anon;
grant execute on function public.issue_voucher(uuid, text, integer, text, uuid, text, timestamp with time zone, text) to authenticated, service_role;

-- ③ 자가검사 — 실패하면 스스로 멈춘다 -----------------------------------------
--    🔴 이 검사는 **소스와 ACL 만** 본다. 이것을 '동작이 맞다' 의 근거로 쓰지 마라 —
--       이 저장소가 가장 자주 밟는 함정이 '아무것도 안 잰 초록 검사' 다.
--       실제 거절/통과 동작은 §적용 절차의 `begin; … rollback;` 예행연습으로 **따로** 증명한다.
do $chk$
declare src text; acl_anon boolean; acl_auth boolean; n_over int;
  sig constant text := 'p_venue_id uuid, p_title text, p_count integer, p_holder_name text, p_holder_user_id uuid, p_note text, p_expires_at timestamp with time zone, p_reason text';
begin
  -- 🔴 오버로드를 구분하지 않으면 **엉뚱한 함수를 재고 초록이 뜬다**(이 저장소에 실제로 옛 6·7인자 정의가 있었다).
  --    시그니처로 정확히 하나를 고르고, 그게 정말 하나인지 세어서 단언한다.
  select count(*) into n_over
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'issue_voucher'
     and pg_get_function_identity_arguments(p.oid) = sig;
  if n_over <> 1 then
    raise exception '[20260921a-chk] 8인자 issue_voucher 가 %개다 — 하나여야 한다', n_over;
  end if;

  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'issue_voucher'
     and pg_get_function_identity_arguments(p.oid) = sig;

  if src is null then raise exception '[20260921a-chk] 함수가 사라졌다'; end if;
  if position('[20260921a]' in src) = 0 then
    raise exception '[20260921a-chk] 패치 표식이 없다 — 치환이 실제로 안 먹었다';
  end if;
  if position('받는 회원을 지정해야' in src) = 0 then
    raise exception '[20260921a-chk] 수신자 필수 가드가 없다';
  end if;
  if position('발급 장수는 1~1000 사이여야 합니다' in src) = 0 then
    raise exception '[20260921a-chk] 장수 범위 가드가 없다';
  end if;
  -- 옛 clamp 가 남아 있으면 두 규칙이 동시에 사는 것이다(치환이 절반만 먹은 경우).
  if position('least(greatest(coalesce(p_count, 1), 1), 1000)' in src) > 0 then
    raise exception '[20260921a-chk] 옛 clamp 가 아직 남아 있다';
  end if;
  -- 순서 검사: 수신자 가드가 한도 차감보다 **앞** 이어야 한다.
  if position('받는 회원을 지정해야' in src) > position('voucher_quota = voucher_quota -' in src) then
    raise exception '[20260921a-chk] 수신자 가드가 한도 차감보다 뒤에 있다 — 거절해도 한도가 깎인다';
  end if;
  -- SECURITY DEFINER search_path 고정이 유지됐는가
  if position('search_path' in src) = 0 then
    raise exception '[20260921a-chk] search_path 고정이 사라졌다';
  end if;

  select has_function_privilege('anon', p.oid, 'EXECUTE'),
         has_function_privilege('authenticated', p.oid, 'EXECUTE')
    into acl_anon, acl_auth
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'issue_voucher'
     and pg_get_function_identity_arguments(p.oid) = sig;
  if acl_anon then raise exception '[20260921a-chk] anon 이 아직 실행할 수 있다'; end if;
  if not acl_auth then raise exception '[20260921a-chk] authenticated 가 실행할 수 없다 — 정상 발급이 막혔다(양성 대조 실패)'; end if;

  raise notice '[20260921a-chk] 통과 — 소스 가드 3종 + 순서 + ACL 음성/양성';
end $chk$;

commit;

-- ── 적용 절차 (적용하는 사람이 그대로 따를 것) ────────────────────────────────
--
-- 0) 권한 확인. 이 파일을 만든 작업에는 **라이브 적용 권한이 없었다.** 오너의 명시적 승인을 먼저 받아라.
--
-- 1) **예행연습(무료·정확)** — 라이브에서 `begin; … rollback;` 으로 실제 동작을 증명한다.
--    소스 검사만으로 끝내지 마라. 실제 매장·계정을 **역할·소유·승인 상태를 조회해서** 고른다.
--
--    ⚠ 음성만 넣으면 "아무도 통과 못 하는 고장" 을 못 잡는다. **양성 대조를 반드시 같이** 넣어라.
--
--    begin;
--      -- 양성 ①: 인증 회원에게 정상 발급이 **여전히 된다** (기존 계약 보존 증명)
--      select public.issue_voucher(<승인매장>, '매장이용권', 2, null, <인증회원>, null, null, 'service');
--      --   기대: 2 반환 · store_vouchers 2행 · voucher_quota 2 감소
--      -- 음성 ①: 수신자 NULL → 거절
--      select public.issue_voucher(<승인매장>, '매장이용권', 1, '이름만', null, null, null, 'service');
--      --   기대: '받는 회원을 지정해야 …' 예외
--      -- 음성 ②: 장수 범위 밖 → 거절(예전엔 조용히 1장)
--      select public.issue_voucher(<승인매장>, '매장이용권', -5, null, <인증회원>, null, null, 'service');
--      --   기대: '발급 장수는 1~1000 사이여야 합니다 (요청 -5장)' 예외
--      -- 불변 확인: 거절된 두 호출 뒤 voucher_quota·store_vouchers 행수·notifications 가 **안 변했는가**
--    rollback;
--
-- 2) 적용은 **MCP `execute_sql`** 로 이 파일 내용을 직접 실행한다.
--    🔴 `supabase db push` · 브랜치 · `migration repair` 금지(nuri-migration §0).
--
-- 3) 적용 후 **보안 어드바이저 ERROR 0** 을 확인한다.
--
-- 4) 이 파일 머리말을 "✅ 적용 완료 + 실측값" 으로 고치고, `docs/HANDOFF.md` 에
--    양성/음성 결과와 어드바이저 결과를 남기고 커밋한다.
