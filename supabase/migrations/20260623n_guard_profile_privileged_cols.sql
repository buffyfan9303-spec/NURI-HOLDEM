-- 🔴 보안 치명: authenticated 가 profiles 의 특권 컬럼(role/verified_at/ci/activity_points/approved 등)을
-- 직접 UPDATE 할 수 있어 권한상승·본인인증 위장·포인트 조작이 가능했음. (profiles_update_self 의 WITH CHECK 부재 +
-- 컬럼 UPDATE 권한 부여) → BEFORE UPDATE 가드 트리거로 차단.
-- current_user 로 실행 컨텍스트 구분: 직접 클라(authenticated/anon)만 차단. SECURITY DEFINER RPC(owner)·
-- service_role(verify-identity)은 통과 → activity_points/뱃지/ci/verified_at 정상 동작. (검증: privileged_blocked=t, benign_allowed=t)
-- ⚠️ INVOKER 트리거여야 current_user 가 호출 컨텍스트를 반영(SECURITY DEFINER 로 만들면 안 됨).
create or replace function public.guard_profile_privileged_cols()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('authenticated','anon') and coalesce(public.my_role()::text,'') <> 'admin' then
    if new.role is distinct from old.role
       or new.verified_at is distinct from old.verified_at
       or new.ci is distinct from old.ci
       or new.approved is distinct from old.approved
       or new.activity_points is distinct from old.activity_points
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
    then
      raise exception '보호된 프로필 항목(권한/본인인증/포인트 등)은 직접 변경할 수 없습니다';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_profile_privileged on public.profiles;
create trigger trg_guard_profile_privileged before update on public.profiles
  for each row execute function public.guard_profile_privileged_cols();
