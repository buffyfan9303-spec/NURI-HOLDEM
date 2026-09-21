-- ============================================================================
-- can_manage_pos 에 **제재 계정 deny-list** 한 절을 더한다 (오너 결정 2026-09-21)
--
-- 문제: can_manage_pos 는 profiles 를 한 줄도 읽지 않아 정지·영구정지·탈퇴 계정이
--   POS·장부 계열을 그대로 통과했다. 이 함수를 참조하는 public 함수 54개 · RLS 정책 29개.
--   대비 can_manage_venue 는 profiles.status='active' 와 approved 를 본다.
--   `updateUserStatus`(src/api/auth.ts:462)가 세션을 끊지 않으므로 이미 열린 탭·살아 있는 JWT 는
--   제재 뒤에도 계속 통과한다 — 화면 게이트(AuthContext sanctionMessage)가 유일한 가드였다.
--
-- 🔴 왜 `is_account_active()` 를 쓰지 않는가 (두 번 다 이 저장소가 겪은 부류다)
--   ① 그 함수는 `coalesce(..., false)` 라 **profiles 행이 없으면 false** 다.
--      쓰는 순간 함수 54개 + 정책 29개가 프로필 결손에 **동시에 닫힌다**
--      (20260918a_profiles_guard_missing_cols.sql 이 이 저장소가 결손을 실제로 겪은 증거다).
--   ② `status='active'` 만 통과시켜 **'pending'(승인 대기)까지** 잡는다 —
--      20260911n_sanction_gate_comments.sql:16-24 이 그 부작용에 ⚠ 4줄 경고를 달아 뒀다.
--   deny-list 는 둘 다 피한다: 행이 없으면 `not exists` 가 참이라 **현행과 동일하게 통과**(회귀 0),
--   'pending' 은 목록에 없어 안 걸린다.
--
-- 🔴 범위를 status 축으로만 한정한다. `role='venue_owner'`·`approved` 는 넣지 않는다 —
--   가입 트리거(20260602e:46-59)가 신규 업주를 approved=false 로 만들기 때문에 문자 그대로 통일하면
--   **가입 직후 업주가 자기 매장 POS 를 못 쓴다.** 그건 보안이 아니라 온보딩 결정이라 따로 둔다.
--
-- ⚠ 알려진 대가(오너에게 보고함): 제재 축이 하나뿐이라 커뮤니티 제재(욕설 등)로 정지된 업주의
--   매장이 정지 기간 동안 POS·클락·직원 출퇴근까지 멈춘다. 매장 단위 제재 축이 생기면 재검토한다.
--
-- ACL: `create or replace` 는 ACL 을 보존한다(CLAUDE.md 2026-09-12 격리 컨테이너 실측).
--   이 함수는 RLS 정책 29개가 부르므로 PUBLIC/authenticated 실행권을 **회수하면 안 된다** —
--   리허설에서 `{=X/postgres,postgres=X,authenticated=X,service_role=X}` 가 그대로 유지됨을 확인했다.
--
-- ✅ 2026-09-21 라이브 적용 완료.
--   적용 전 md5 37ac7f4723e371a2e02b0cee5b6ffa82
--   라이브 begin;…rollback; 리허설 실측(대상: [E2E] 자동테스트 전용 매장 소유자 1a8c5117…):
--     상태            패치전 pos / 패치후 pos
--     active            true  /  true
--     banned            true  /  false   ← 음성 대조가 패치 전에 빨간 것을 확인했다
--     suspended         true  /  false
--     withdrawn         true  /  false
--     suspended(기간지남) true  /  true
--     pending           true  /  true    (의도 — 제재가 아니다)
--   양성 대조: admin·로티아레나 업주 = true 유지 / 비로그인 = false (fail-open 없음)
-- ============================================================================

create or replace function public.can_manage_pos(p_venue_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select (
       coalesce(my_role() = 'admin'::user_role, false)
    or exists (select 1 from public.venues v
                where v.id = p_venue_id and v.owner_id = auth.uid())
    or exists (select 1 from public.venue_owners vo
                where vo.venue_id = p_venue_id and vo.user_id = auth.uid()
                  and vo.status = 'approved')
  )
  -- 제재 deny-list. 행이 없으면 통과한다(현행 보존) — allow-list 로 바꾸지 마라.
  and not exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and ( p.status::text in ('banned', 'withdrawn')
          or ( p.status::text = 'suspended'
               and (p.suspended_until is null or p.suspended_until > now()) ) )
  );
$function$;

-- 새로 만들어지는 경우를 위한 관행(기존 ACL 은 create or replace 가 보존한다).
-- ⚠ 이 함수는 RLS 정책이 부르므로 authenticated/PUBLIC 실행권을 회수하지 않는다.
grant execute on function public.can_manage_pos(uuid) to authenticated, service_role;
