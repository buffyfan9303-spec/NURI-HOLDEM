-- 순위 회원 검색 게이트에 '승인' 조건을 더한다
-- ✅ 2026-09-17 라이브 적용 완료 (오너 승인 "모두 진행" · MCP execute_sql · nuri-lead)
--
-- 적용 후 실측 7건 — 전부 기대대로:
--   본문에 approved 조건 있음 · anon 실행 불가 · authenticated 실행 가능
--   승인 업주(실제 계정) true · admin(실제 계정) true · 비로그인 false · 미가입 UUID false
-- 적용 전 리허설(begin; … rollback;) 5건도 전부 기대대로였고, 그때 **approved=NULL 이 막히는 것**까지 확인했다
--   (`= true` 로 썼다면 NULL 이 조건을 통과해 fail-open 이 됐을 자리다).
--   리허설 뒤 함수 본문·profiles.approved 원상복구를 직접 조회로 확인했다.
--
-- ── 무엇이 문제인가 ────────────────────────────────────────────────────────────
-- 라이브 정의(2026-09-17 `pg_get_functiondef` 실측):
--
--     select exists (select 1 from public.profiles me
--                    where me.id = auth.uid() and me.role in ('venue_owner','admin'))
--         or exists (select 1 from public.ledger_access la where la.user_id = auth.uid());
--
-- `approved` 도 `status` 도 보지 않는다. 그런데 가입 경로(`src/api/auth.ts:256`)가 `role:'venue_owner'` 를
-- 그대로 박고, `20260909a handle_new_user` 가 `approved=false`·pending 으로 넣는다.
-- 즉 **심사를 한 번도 거치지 않은 계정이 가입 직후부터 통과한다.**
--
-- 통과하면 `resolve_ranking_members(['닉1', …100개])` 로 닉네임 100개씩 묶어
-- "이 닉네임이 실제 회원인가 · 본인인증을 마쳤는가" 를 조회할 수 있다.
-- (`20260911j` 의 매장 범위 제한은 **이름 값**만 가린다 — 존재·인증 여부는 의도적으로 내보낸다.)
-- 화면 층 판정(`src/api/auth.ts:482`)은 서버 게이트가 아니다. 보안표준 2번 "인가는 서버(DB)가 한다".
--
-- 출처: 2026-09-17 순위 구조 감사 D6. 저장소 정본은 `20260905c_staff_member_search.sql:34-37`.
--
-- ── 지금 위험이 실현됐는가 ────────────────────────────────────────────────────
-- 아니다. 2026-09-17 라이브 실측: 미승인·비활성 업주 **0명**(`status` 분포도 active=6 뿐).
-- 즉 **아직 아무도 통과하지 않았다.** 다음 가입자가 생기는 순간 발현하는 잠복 결함이다.
--
-- ── 이 변경이 누구를 막는가 (적용 전 실측) ────────────────────────────────────
--   · 양성 대조 — 지금 통과하는 인원 **3명**(admin 1 + 승인 업주 2). 적용 후에도 그대로 통과해야 한다.
--   · 음성 대조 — 이 변경으로 **새로 막히는 인원 0명**. 오늘 아무도 잃지 않는다.
--   · `profiles.approved` 는 **nullable boolean** 이라 `is true` 로 받는다(`= true` 는 NULL 에서 NULL 이 된다).
--   · `profiles.status` 는 `user_status` NOT NULL(default 'active'). `= 'active'` 는 실패 시 **닫히는** 방향이다.
--   · admin 은 승인 조건을 받지 않는다(운영자는 approved 와 무관하게 통과).
--   · `ledger_access` 가지는 **그대로 둔다** — 장부 권한자는 업주가 직접 준 사람이다.
--
-- ── ACL ───────────────────────────────────────────────────────────────────────
-- 2026-09-17 실측: `anon=false / authenticated=true` (이미 올바르다).
-- `CREATE OR REPLACE` 는 ACL 을 보존하므로 아래 REVOKE/GRANT 는 **새로 만들어지는 경우**를 위한 것이다
-- (CLAUDE.md 보안표준 3번의 2026-09-12 실측 정정 참고 — ACL 이 날아가는 것은 `DROP` + 재생성이다).

create or replace function public.can_search_ranking_members()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select exists (
           select 1
           from public.profiles me
           where me.id = auth.uid()
             and (
                  me.role::text = 'admin'
               or (me.role::text = 'venue_owner'
                   and me.approved is true                 -- nullable boolean → NULL 은 막힌다
                   and me.status::text = 'active')         -- 정지·탈퇴 계정도 막힌다
             )
         )
      or exists (
           select 1 from public.ledger_access la where la.user_id = auth.uid()
         );
$function$;

revoke all on function public.can_search_ranking_members() from public, anon;
grant execute on function public.can_search_ranking_members() to authenticated, service_role;

-- ── 자가검사 ──────────────────────────────────────────────────────────────────
-- ⚠ 이 검사는 **판정기 자신을 못 본다**(nuri-migration §5-2 마지막 항목).
--    그래서 본문 텍스트 계약 + 실제 인원 수 양쪽을 본다.
do $$
declare
  v_body    text;
  v_pass    int;
  v_blocked int;
begin
  select pg_get_functiondef(p.oid) into v_body
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'can_search_ranking_members';

  -- ① 텍스트 계약 — 승인 조건이 본문에 실제로 들어갔는가
  if v_body is null then
    raise exception '자가검사 실패: can_search_ranking_members 가 없다';
  end if;
  if position('approved' in v_body) = 0 then
    raise exception '자가검사 실패: 본문에 approved 조건이 없다 — 이 마이그레이션이 하려던 일 자체가 안 됐다';
  end if;
  if position('status' in v_body) = 0 then
    raise exception '자가검사 실패: 본문에 status 조건이 없다';
  end if;

  -- ② 양성 대조 — 승인 업주·admin·장부권한자는 여전히 통과해야 한다
  select count(*) into v_pass
  from public.profiles p
  where p.role::text = 'admin'
     or (p.role::text = 'venue_owner' and p.approved is true and p.status::text = 'active')
     or exists (select 1 from public.ledger_access la where la.user_id = p.id);

  if v_pass < 1 then
    raise exception '자가검사 실패: 아무도 통과하지 못한다(양성 대조 0명) — 순위 회원 검색이 통째로 막혔다';
  end if;

  -- ③ 음성 대조 — 막히는 쪽이 실제로 생기는가(오늘은 0명이 정상)
  select count(*) into v_blocked
  from public.profiles p
  where p.role::text = 'venue_owner'
    and not (p.approved is true and p.status::text = 'active')
    and not exists (select 1 from public.ledger_access la where la.user_id = p.id);

  raise notice '자가검사 통과 — 통과 %명 / 이 변경으로 막히는 %명', v_pass, v_blocked;
end $$;

-- ── 적용 시 함께 돌릴 임퍼소네이션 리허설 (begin; … rollback;) ────────────────
-- 위 자가검사는 **술어를 다시 계산**할 뿐 실제 함수를 호출하지 않는다.
-- 진짜 게이트가 도는지는 세션을 흉내 내서 확인한다:
--
--   begin;
--     set local role authenticated;
--     -- 양성: 승인된 업주 uuid
--     set local request.jwt.claims = '{"sub":"<승인된 업주 uuid>"}';
--     select public.can_search_ranking_members();          -- 기대: true
--     -- 음성: 미승인 업주를 임시로 만들어 본다
--     set local role postgres;
--     update public.profiles set approved = false where id = '<그 업주 uuid>';
--     set local role authenticated;
--     select public.can_search_ranking_members();          -- 기대: false
--   rollback;
--
-- ⚠ 반드시 `rollback` 으로 끝낸다. `commit` 하면 실제 업주의 승인이 풀린다.
