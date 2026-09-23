-- ✅ **2026-09-23 라이브 적용 완료** — 오너 적용 승인(2026-09-23, QR-EVENT-GRANT-VERIFY 결함 2: 이용권 사용에도 이벤트 카드가 나가던 구멍).
--    project idsxiqspecrucvfvtgbw · MCP execute_sql · begin…commit, 자가검사 통과. 적용 본문은 아래 ①·② 그대로(선택 ②-b 미적용).
--    적용 후: _voucher_used_checkin md5 11ffe9bd1f8487d37786de96a509b12b(적용 전 6c2c4081…) · _apply_venue_visit md5 472090424fb352dbc4ecf1feceda7e05
--             두 함수 ACL {postgres, service_role}
--    롤백 리허설(운영 · 유일한 active 이용권, 보유자 1명):
--      음성 대조(패치 전 정의): 이용권 사용 → checkins 1→2 · activity_points 28→31 · 방문 0→1  (경로 재현 확인)
--      패치 후: 이용권 사용 → checkins 1→1 · points 28→28 · 방문 0→1
--               이어서 같은 매장 check_in → ok · checkins 1→2 · points 28→31 · 방문 1→2  (시나리오 5 — 예전엔 '이미 체크인' 거절)
--    ⚠ 아래 '검증 계획'의 "운영 BEGIN…ROLLBACK 금지" 는 이 파일이 쓰일 때의 방침이었다. 현행 정본(CLAUDE.md·nuri-migration)은
--      운영 롤백 리허설을 권장하므로 그 방식으로 했다.

-- ============================================================================
-- 설계안: 이용권 사용은 '방문'만 남기고 '출석'은 만들지 않는다
--   🔴 아직 적용하지 않았다. 오너 결정(2026-09-21): "방문 기록만 남긴다" + "설계만 남긴다".
--   적용하려면 오너의 별도 승인 + `.claude/skills/nuri-migration/SKILL.md` 게이트가 먼저다.
--   파일명 후보: supabase/migrations/2026MMDDx_voucher_visit_not_checkin.sql
--
-- 왜 — 오너 지적(2026-09-21): "출석 QR 하고 바이인 QR 하고 다를텐데 왜 이용권 사용이 출석완료야,
--   이건 다른거야." 서버에서 `insert into checkins` 를 하는 함수는 `_apply_checkin` 하나뿐이고
--   그걸 부르는 곳이 둘이다 — `check_in()`(출석 QR)과 `_voucher_used_checkin()`(이용권 사용 트리거).
--   바인 QR·가입 QR 은 출석을 만들지 않는다(이미 올바름). 섞이는 자리는 이 트리거 한 곳이다.
--
-- 역사 — 2026-06-23c 에서 '사용 매장 기준 출석'으로 도입, 2026-09-05k 에서 `_apply_checkin` 공유로
--   오히려 강화됐다(그전엔 checkins 직삽입만 해서 점수·CRM 이 빠져 있었다). 즉 의도된 동작이었고
--   이번 변경은 버그 수정이 아니라 **제품 결정의 반영**이다. 되돌리려면 그 두 파일을 보라.
--
-- 부수 효과(중요) — 이 변경은 critical-reviewer 가 2026-09-21 에 찾은 **P0 출석 이중 생성 경합을
--   통째로 없앤다.** 미보호 경합 쌍 두 개(`check_in × 트리거`, `트리거 × 트리거`)는 둘 다
--   "트리거가 checkins 에 행을 넣는다"는 사실에서 나온다. 트리거가 출석을 안 만들면 쌍이 사라지고
--   advisory 잠금 추가 패치(안 B)가 불필요해진다. 4시간 순서 의존(20260905k 주석의 #2)도 같이 없어진다.
--   → **잠금을 추가하는 안보다 이 안을 먼저 검토하라.** diff 가 작고 더 근본적이다.
-- ============================================================================

-- ── ① CRM 적재만 하는 공유 함수 ─────────────────────────────────────────────
--   `_apply_checkin` 의 마지막 블록(customer_profiles 3단계 적재)을 그대로 추출했다.
--   3단계인 이유: ① user_id 로 찾기 → ② 이름만 있고 user_id 가 비어 있는 기존 손님과 잇기
--   → ③ 없으면 새로 만들되 (venue_id, name) 충돌 시 합치기. 이 순서를 바꾸면 업주 장부의
--   기존 손님과 새 계정이 따로 놀아 방문수가 갈린다.
create or replace function public._apply_venue_visit(p_venue_id uuid, p_uid uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_disp text;
begin
  select coalesce(nickname, name) into v_disp from public.profiles where id = p_uid;
  update public.customer_profiles
     set visit_count = coalesce(visit_count,0) + 1, last_visit_at = now(),
         name = coalesce(nullif(btrim(name),''), v_disp), updated_at = now()
   where venue_id = p_venue_id and user_id = p_uid;
  if not found then
    update public.customer_profiles
       set user_id = p_uid, visit_count = coalesce(visit_count,0) + 1, last_visit_at = now(), updated_at = now()
     where venue_id = p_venue_id and user_id is null and lower(btrim(name)) = lower(btrim(v_disp));
    if not found then
      insert into public.customer_profiles(venue_id, user_id, name, visit_count, first_visit_at, last_visit_at)
      values (p_venue_id, p_uid, v_disp, 1, now(), now())
      on conflict (venue_id, name) do update
        set user_id = coalesce(public.customer_profiles.user_id, excluded.user_id),
            visit_count = coalesce(public.customer_profiles.visit_count,0) + 1,
            last_visit_at = now(), updated_at = now();
    end if;
  end if;
end $function$;

-- 내부 전용 — SECURITY DEFINER 호출자만. `from anon` 만으로는 무효다(PUBLIC 기본 GRANT).
revoke execute on function public._apply_venue_visit(uuid, uuid) from public, anon, authenticated;
grant  execute on function public._apply_venue_visit(uuid, uuid) to service_role;

-- ── ② 트리거: 출석 대신 방문만 ──────────────────────────────────────────────
--   `create or replace` 라 ACL 이 보존된다(CLAUDE.md 2026-09-12 실측 — ACL 이 날아가는 것은
--   `DROP` + 재생성이다). 그래도 REVOKE/GRANT 를 같이 적는 관행은 유지한다.
--   ⚠ 함수 이름에 `checkin` 이 남아 오해를 부른다. 이름 변경은 DROP + 트리거 재지정 + ACL 재부여라
--     위험이 커서 **이번에는 바꾸지 않는다.** 주석으로 못 박는다.
create or replace function public._voucher_used_checkin()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $function$
begin
  -- 이름과 달리 **출석을 만들지 않는다**(오너 결정 2026-09-21). 방문 기록만 남긴다.
  if new.status = 'used'
     and old.status is distinct from 'used'          -- used→used 재갱신 무동작(멱등)
     and new.holder_user_id is not null
     -- 같은 매장 4시간 내 방문이 이미 있으면 중복 계상하지 않는다.
     -- `last_visit_at` 은 `_apply_checkin`(출석 QR)도 갱신하므로, 출석 QR 을 찍은 뒤
     -- 이용권을 써도 방문이 두 번 세지지 않는다. 연속 3장 사용도 방문 1회다.
     and not exists (
       select 1 from public.customer_profiles cp
        where cp.venue_id = coalesce(new.used_venue_id, new.venue_id)
          and cp.user_id  = new.holder_user_id
          and cp.last_visit_at > now() - interval '4 hours')
  then
    perform public._apply_venue_visit(coalesce(new.used_venue_id, new.venue_id), new.holder_user_id);
  end if;
  -- 🔴 예외를 삼키지 않는다(현행 유지). `_apply_venue_visit` 이 터지면 이용권 사용 전체가 롤백된다.
  --    형제 트리거 `_grant_event_tickets` 는 반대로 삼킨다 — 설계가 다르다. 맞추려 하지 마라.
  return new;
end $function$;

revoke execute on function public._voucher_used_checkin() from public, anon, authenticated;
grant  execute on function public._voucher_used_checkin() to service_role;

-- ── 선택 ②-b: `_apply_checkin` 도 CRM 부분을 `_apply_venue_visit` 호출로 바꿀 것인가 ──────────
--   DRY 로는 맞지만 출석 경로의 동작을 건드리게 된다. 출석은 라이브에서 이미 도는 경로라
--   **이번에는 손대지 않기를 권한다.** 복제 2벌이 생기는 것은 주석으로 못 박아 관리한다.
--   (두 벌이 어긋나면 업주 CRM 방문수가 경로에 따라 달라진다 — 합칠 때는 별도 작업으로.)

-- ============================================================================
-- 검증 계획 — 🔴 격리 DB 에서만. 운영 DB 쓰기·BEGIN…ROLLBACK 금지.
--
-- 음성 대조(먼저 한다) — **패치 전 정의**로 같은 하네스를 돌린다. 이용권 1장 사용에서
--   checkins +1 · activity_points +3 · event_tickets 1장 이 **나와야 한다.**
--   안 나오면 하네스가 경로를 재현 못 한 것이고, 그 뒤의 초록은 아무것도 재지 않은 초록이다.
--
-- 양성 대조(패치 후)
--   1. 이용권 1장 사용       → checkins +0 · activity_points +0 · event_tickets +0 · visit_count +1
--   2. 이용권 3장 연속 사용  → visit_count +1 (4시간 가드)
--   3. 출석 QR(check_in)     → checkins +1 · activity_points +3 · event_tickets 1 · visit_count +1  ← 회귀 없음
--   4. 출석 QR 먼저 → 이용권 사용 → visit_count 총 +1 (가드가 막는다)
--   5. 🔴 이용권 사용 먼저 → 출석 QR → checkins +1 · 점수 +3 · visit_count 총 +1
--      **이게 이번 변경의 가장 큰 사용자 편익이다.** 라이브 `check_in` 본문(실측 2026-09-21)은
--        select created_at into v_recent from public.checkins where venue_id=… and user_id=… order by created_at desc limit 1;
--        if v_recent is not null and v_recent > now() - interval '4 hours' then
--          raise exception '이미 체크인했습니다 (4시간 내 중복 방지)';
--      로 **예외를 던져 거절한다.** 즉 지금은 이용권을 쓴 손님이 그 뒤 출석 QR 을 찍으면
--      "이미 체크인했습니다" 오류를 본다 — 본인은 출석을 찍은 적이 없는데도. 20260905k 주석의
--      "순서에 따라 결과가 갈림"이 바로 이것이다. 패치 후에는 트리거가 checkins 를 안 만들므로
--      출석 QR 이 정상 통과한다. **검증에서 이 시나리오를 반드시 넣어라.**
--   6. holder_user_id NULL   → 아무 일도 없음
--   7. used→used 재갱신      → 아무 일도 없음(멱등)
--   8. 이름만 있는 기존 손님(user_id NULL)에 잇기 → 새 행이 아니라 그 행의 visit_count 가 오른다
--
-- 경합(선택) — 두 세션이 서로 다른 이용권을 동시에 used 로 전이. checkins 를 안 만드므로
--   출석 이중 생성은 구조적으로 불가능하다. customer_profiles 는 행잠금으로 직렬화된다.
--
-- 소급 — 과거에 트리거로 들어간 checkins 행은 **소급하지 않는다**(20260905k 와 같은 방침).
--   지우면 출석왕 집계·연속출석 이력이 바뀐다. 기준선만 바꾸고 과거는 둔다.
--
-- 롤백 — `20260905k_checkin_apply_shared.sql` 의 `_voucher_used_checkin` 정의를 재실행(+ACL),
--   `drop function public._apply_venue_visit(uuid, uuid);`
-- ============================================================================
