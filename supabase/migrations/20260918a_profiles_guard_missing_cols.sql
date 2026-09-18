-- 20260918a — profiles 의 '보호되지 않은 컬럼' 11개를 트리거 가드에 넣는다.
--
-- ✅ 적용 완료 2026-09-18 (오너 승인) — 라이브 실측
--   적용 전 음성 대조: 일반 유저(role=user) 세션으로 자기 행의
--     `shadowbanned=true, checkin_streak=999` UPDATE 가 **통과했다**(취약 확인, rollback).
--   적용 후 음성 대조: 같은 시도가 예외로 막힘 → negative-control OK.
--   적용 후 양성 대조 3종 전부 통과(rollback):
--     ① 관리자 세션의 status/approved/shadowbanned 직접 update (관리자 화면 경로)
--     ② 일반 유저의 허용 필드(name·avatar_color) update
--     ③ SECURITY DEFINER 경로(소유자 권한이라 가드를 안 탄다)
--   → 기능 회귀 0. 음성만 보면 '아무도 못 지나가는 고장'을 못 잡으므로 양성을 같이 쟀다.
--
-- ── 무엇이 문제인가 (2026-09-18 보안 감사 · 라이브 실측) ─────────────────────
-- 정책 `profiles_update_self` 는 **행 단위**로만 통과시키고(WITH CHECK 없음),
-- authenticated/anon 에 profiles 전 컬럼 UPDATE grant 가 있다.
-- 컬럼 단위 유일한 가드가 트리거 `trg_guard_profile_privileged`(= guard_profile_privileged_cols)인데,
-- 서버 로직이 소비하는 컬럼 11개가 그 목록 **밖**이라 본인이 직접 PATCH 로 바꿀 수 있었다.
--
--   shadowbanned          → get_activity_leaderboard 의 제외 필터. 섀도우밴 **자가 해제**.
--   post_points_today/date, comment_points_today/date, last_login_point_at,
--   checkin_streak, last_checkin_date
--                         → award_post_points(하루 30점 상한) · claim_daily_login_point(하루 1회) ·
--                           _apply_checkin(7일 연속 +10) 의 카운터. 되돌리면 **activity_points 무한 적립** →
--                           buy_mark/buy_cosmetic/buy_shout/buy_season_badge 상점 경제가 무너진다.
--   nickname              → set_my_nickname 이 nickname_locked 로 1회 잠그는데, 트리거는 nickname_locked 만
--                           지키고 nickname 자체는 안 지켜 잠금이 우회됐다.
--   email                 → weekly_email_digest_rows 가 이 값으로 발송(임의 주소 수신).
--                           profiles_email_key 유니크라 타인 이메일 선점 시 handle_new_user INSERT 가 실패해
--                           **그 이메일로는 가입이 막힌다**.
--   venue_id              → is_my_shift_row 의 '그 매장 사람' 판정을 스스로 만족시킨다.
--
-- ── 왜 이 모양인가(대안 기각 근거) ──────────────────────────────────────────
-- 더 튼튼한 안은 `REVOKE UPDATE ON profiles FROM authenticated` + 허용 컬럼만 GRANT 다.
-- 그러나 관리자 화면이 profiles 를 **직접** update 한다(src/api/auth.ts:471 제재, :615 업주 승인).
-- 컬럼 GRANT 로 가면 그 두 경로를 RPC 로 옮기는 코드 변경이 먼저 배포돼야 해서, 운영 중인 서비스에서
-- 순서를 어기면 관리자 기능이 죽는다. 지금은 **코드 변경 0인 최소 수정**을 택한다.
--   (컬럼 GRANT 화이트리스트는 별도 과제로 남긴다.)
--
-- ── 안전 근거(실측으로 확인한 것) ───────────────────────────────────────────
-- ① 추가 위치는 `coalesce(my_role(),'') <> 'admin'` **안쪽**이다 → 관리자 직접 update 는 종전대로 통과.
-- ② 이 컬럼들을 쓰는 서버 함수는 전부 SECURITY DEFINER 다(라이브 pg_proc.prosecdef 확인:
--    set_my_nickname · claim_daily_login_point · award_post_points · award_comment_points ·
--    _apply_checkin · admin_set_shadowban · handle_new_user 모두 true).
--    DEFINER 안에서는 current_user 가 함수 소유자라 이 가드 블록 자체가 돌지 않는다 → 기능 회귀 없음.
-- ③ 클라이언트에서 profiles 를 직접 update 하는 곳은 **두 곳뿐**이고(위 관리자 2건),
--    둘 다 이미 보호 목록에 있던 컬럼(status·suspended_until·sanction_reason·approved)만 보낸다.
-- ④ 11개 컬럼 존재를 라이브 information_schema 로 확인했다.
--
-- ⚠ CREATE OR REPLACE 라 ACL 은 보존된다(2026-09-12 격리 컨테이너 실측). 트리거 재생성 불필요.

create or replace function public.guard_profile_privileged_cols()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if current_user in ('authenticated','anon') then
    if new.activity_points is distinct from old.activity_points
       or new.spent_points is distinct from old.spent_points
    then
      raise exception '활동점수는 직접 변경할 수 없습니다 (운영자는 admin_grant_points 를 쓰세요)';
    end if;
    if new.equipped_mark is distinct from old.equipped_mark then
      raise exception '마크 장착은 set_equipped_mark 로만 할 수 있습니다';
    end if;
    -- 2026-08-30(20260830n): 코스메틱도 유료 소장물이다. 마크와 같은 자물쇠를 건다.
    if new.equipped_card_frame is distinct from old.equipped_card_frame
       or new.equipped_nick_color is distinct from old.equipped_nick_color then
      raise exception '코스메틱 장착은 set_equipped_cosmetic 으로만 할 수 있습니다';
    end if;
    -- 2026-08-30(20260830n): 30일 쿨다운 무료 해제 경로 차단.
    -- 닉네임을 실제로 바꿀 때 트리거(trg_enforce_nickname_cooldown)가 먼저 돌며 찍는 값은
    -- 통과시킨다 — 무조건 막으면 닉네임 변경 기능 자체가 사라진다.
    if new.name_changed_at is distinct from old.name_changed_at
       and new.name is not distinct from old.name then
      raise exception '닉네임 변경 시각은 직접 바꿀 수 없습니다 (즉시 변경은 상점의 즉시 변경권을 쓰세요)';
    end if;
    -- 2026-09-18(20260918a): 아래 11개가 목록 밖이라 서버 판정을 본인이 되돌릴 수 있었다.
    --   적립 카운터를 되돌리면 활동점수가 무한히 쌓이고, shadowbanned 는 스스로 풀 수 있었다.
    if coalesce(public.my_role()::text, '') <> 'admin' then
      if new.role is distinct from old.role
         or new.verified_at is distinct from old.verified_at
         or new.ci_hash is distinct from old.ci_hash
         or new.identity_tombstoned is distinct from old.identity_tombstoned
         or new.approved is distinct from old.approved
         or new.badges is distinct from old.badges
         or new.status is distinct from old.status
         or new.suspended_until is distinct from old.suspended_until
         or new.sanction_reason is distinct from old.sanction_reason
         or new.nickname_locked is distinct from old.nickname_locked
         or new.real_name is distinct from old.real_name
         or new.phone is distinct from old.phone
         or new.birth_date is distinct from old.birth_date
         or new.gender is distinct from old.gender
         or new.carrier is distinct from old.carrier
         -- ↓ 20260918a 추가분
         or new.shadowbanned is distinct from old.shadowbanned
         or new.nickname is distinct from old.nickname
         or new.email is distinct from old.email
         or new.venue_id is distinct from old.venue_id
         or new.post_points_today is distinct from old.post_points_today
         or new.post_points_date is distinct from old.post_points_date
         or new.comment_points_today is distinct from old.comment_points_today
         or new.comment_points_date is distinct from old.comment_points_date
         or new.last_login_point_at is distinct from old.last_login_point_at
         or new.checkin_streak is distinct from old.checkin_streak
         or new.last_checkin_date is distinct from old.last_checkin_date
      then
        raise exception '보호된 프로필 항목(권한/본인인증/포인트 등)은 직접 변경할 수 없습니다';
      end if;
    end if;
  end if;
  return new;
end $function$;

-- ── 적용 후 반드시 돌릴 대조 (음성 + 양성) ──────────────────────────────────
-- 음성: 일반 유저 세션으로 profiles 자기 행의 shadowbanned/checkin_streak PATCH → 예외.
-- 양성: ① 관리자 화면의 제재·업주 승인이 여전히 통과(위 두 컬럼은 admin 분기 안쪽).
--       ② set_my_nickname · claim_daily_login_point · 출석 QR 이 여전히 동작(DEFINER 라 가드를 안 탄다).
--       둘 다 봐야 한다 — 음성만 보면 '아무도 통과 못 하는 고장'을 못 잡는다.
