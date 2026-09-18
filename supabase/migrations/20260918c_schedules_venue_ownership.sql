-- 20260918c — 일정(포스터)을 **소유하지 않은 매장**으로 등록·이동하던 구멍을 막는다.
--
-- ✅ 적용 완료 2026-09-18 (오너 승인) — 라이브 실측
--   승인된 업주 세션으로 4방향 대조(전부 rollback):
--     ① 자기 매장으로 등록          → 통과 (양성)
--     ② 남의 매장으로 등록          → 막힘 (음성 — 이게 구멍이었다)
--     ③ venue_id NULL 로 등록       → 통과 (양성 — 매장 미연결 대회 보존)
--     ④ 자기 포스터를 남의 매장으로 이동 → 막힘 (음성)
--   ⚠ 처음 돌린 대조는 ①③이 '막힘'으로 나왔는데 정책이 아니라 **enum 값 오류**였다
--     (format='홀덤' → tour_format 은 MTT|SNG|PKO|Bounty|Mix). 테스트가 틀린 것을 정책 회귀로
--     오인할 뻔했다 — 양성이 실패하면 먼저 테스트부터 의심하라.
--
-- ── 무엇이 문제인가 (2026-09-18 보안 감사 · 라이브 정책 실측) ────────────────
-- `schedules_insert` WITH CHECK 의 **첫 분기**:
--   owner_id = auth.uid() AND my_role() in (venue_owner, admin) AND (admin OR profiles.approved)
-- 여기에 venue_id 소유 검사가 없다. 승인된 업주면 **아무 매장 id** 로 일정을 등록할 수 있다.
-- (둘째 분기 `venue_id is not null and can_manage_venue_schedules(venue_id)` 는 제대로 돼 있는데,
--  OR 로 묶여 있어 첫 분기만 만족해도 통과한다.)
--
-- `schedules_update` 는 USING/WITH CHECK 가 같은 식이라 **venue_id 변경 자체를 막지 않는다**.
-- 게다가 트리거 `prevent_self_approve_poster` 가 `new.approved := old.approved` 로 승인을 유지해서,
-- 한 번 승인된 포스터를 **승인된 채로** 남의 매장으로 재지정할 수 있다.
--
-- 왜 위험한가: `reserve_schedule`·`request_buyin` 이 `s.venue_id` 를 그대로 믿는다 →
-- 예약과 바인 요청이 **남의 매장 장부**로 흘러간다.
--
-- ── 고치는 방법 ─────────────────────────────────────────────────────────────
-- 두 정책 모두에 "venue_id 가 있으면 그 매장을 관리할 수 있어야 한다" 를 **AND 로** 건다.
-- venue_id 가 NULL 인 일정(매장 미연결 대회)은 종전대로 통과한다 — 기능 보존.
-- admin 은 종전대로 전부 통과한다.

alter policy schedules_insert on public.schedules
  with check (
    (
      (owner_id = (select auth.uid()))
      and (
        (my_role() = any (array['venue_owner'::user_role, 'admin'::user_role]))
        and (
          (my_role() = 'admin'::user_role)
          or exists (select 1 from public.profiles p
                      where p.id = (select auth.uid()) and p.approved = true)
        )
      )
      -- 🔴 20260918c: 첫 분기에 빠져 있던 매장 소유 검사.
      and (venue_id is null or my_role() = 'admin'::user_role
           or can_manage_venue_schedules(venue_id))
    )
    or ((venue_id is not null) and can_manage_venue_schedules(venue_id))
  );

alter policy schedules_update on public.schedules
  using (
    (owner_id = (select auth.uid()))
    or (my_role() = 'admin'::user_role)
    or ((venue_id is not null) and can_manage_venue_schedules(venue_id))
  )
  with check (
    (
      (owner_id = (select auth.uid()))
      or (my_role() = 'admin'::user_role)
      or ((venue_id is not null) and can_manage_venue_schedules(venue_id))
    )
    -- 🔴 20260918c: 바뀐 뒤의 venue_id 도 내가 관리할 수 있는 매장이어야 한다.
    --   이것이 없으면 소유자(owner_id)가 승인된 포스터를 남의 매장으로 옮길 수 있다.
    and (venue_id is null or my_role() = 'admin'::user_role
         or can_manage_venue_schedules(venue_id))
  );

-- ── 적용 후 반드시 돌릴 대조 (음성 + 양성) ──────────────────────────────────
-- 음성: 승인된 업주 A 세션으로 자기 것이 아닌 venue_id 를 넣어 insert → 거부.
--       자기 포스터의 venue_id 를 남의 매장으로 update → 거부.
-- 양성: ① 자기 매장으로 등록·수정은 그대로 통과.
--       ② venue_id 가 NULL 인 일정(매장 미연결)도 그대로 통과.
--       ③ 매장 직원(can_manage_venue_schedules 로 받은 권한)도 그대로 통과.
-- 리허설: 라이브에서 begin; … rollback; 으로 돌린다(무료·정확). 검증 계정은 역할·소유·소속을
--         먼저 조회해서 고른다 — 아무도 통과 못 하는 고장은 음성만 봐선 안 잡힌다.
