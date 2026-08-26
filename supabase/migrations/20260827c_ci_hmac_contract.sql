-- ── CI 원문 컬럼 제거(Contract) ───────────────────────────────────────────────
-- Expand(20260827b)에서 전 리더가 ci_hash 로 이관·검증 완료. 남은 원문을 지우고 컬럼을
-- drop 한다. ci 를 참조하던 함수 3개(guard·withdraw·commit)는 참조 제거판으로 교체.
-- 복구 스냅샷: backup_20260827.profiles (원문 포함 — 안정화 후 오너 승인 하에 삭제 예정).

update public.profiles set ci = null where ci is not null;

-- 인증 커밋 — ci 컬럼 참조 제거판
create or replace function public.verify_identity_commit(
  p_uid uuid, p_ci text, p_name text, p_phone text, p_birth date, p_gender text, p_carrier text
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v_hash text; v_tomb boolean;
begin
  v_hash := public.hash_ci(p_ci);
  if p_uid is null or v_hash is null then
    return jsonb_build_object('ok', false, 'code', 'bad_request');
  end if;
  if exists (select 1 from public.profiles where ci_hash = v_hash and id <> p_uid) then
    return jsonb_build_object('ok', false, 'code', 'dup');
  end if;
  v_tomb := exists (select 1 from public.withdrawn_identities w where w.ci_hash = v_hash);
  update public.profiles set
    ci_hash = v_hash,
    real_name = p_name, phone = p_phone, birth_date = p_birth,
    gender = p_gender, carrier = p_carrier,
    verified_at = now(),
    identity_tombstoned = v_tomb
  where id = p_uid;
  if not found then return jsonb_build_object('ok', false, 'code', 'no_profile'); end if;
  return jsonb_build_object('ok', true, 'tombstoned', v_tomb);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'code', 'dup');
end $$;

-- 보호 컬럼 가드 — new.ci 줄 제거(ci_hash·identity_tombstoned 는 유지)
create or replace function public.guard_profile_privileged_cols() returns trigger
language plpgsql set search_path to 'public', 'pg_temp'
as $$
begin
  if current_user in ('authenticated','anon') and coalesce(public.my_role()::text,'') <> 'admin' then
    if new.role is distinct from old.role
       or new.verified_at is distinct from old.verified_at
       or new.ci_hash is distinct from old.ci_hash
       or new.identity_tombstoned is distinct from old.identity_tombstoned
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

-- 탈퇴 — ci=null 라인 제거판(그 외 20260827b 와 동일)
create or replace function public.withdraw_my_account() returns void
language plpgsql security definer set search_path to 'public'
as $$
declare v_uid uuid := auth.uid(); v_suffix text; v_status text; v_hash text; v_anon_email text;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  select status, ci_hash into v_status, v_hash from public.profiles where id = v_uid;
  if v_status in ('banned','suspended') then
    raise exception '제재 중인 계정은 탈퇴할 수 없습니다. 고객센터로 문의해 주세요';
  end if;
  if exists (select 1 from public.venues where owner_id = v_uid) then
    raise exception '매장 대표는 매장을 먼저 정리(삭제 또는 대표 양도)한 뒤 탈퇴할 수 있습니다';
  end if;
  if v_hash is not null then
    insert into public.withdrawn_identities(ci_hash, reason)
    values (v_hash, 'withdrawn')
    on conflict (ci_hash) do update set reason = 'withdrawn', created_at = now();
  end if;
  v_suffix := substr(replace(v_uid::text, '-', ''), 1, 12);
  v_anon_email := 'withdrawn_' || v_suffix || '@deleted.invalid';
  update public.profiles set
    status='withdrawn', nickname='탈퇴회원_'||v_suffix, email=v_anon_email,
    real_name=null, phone=null, ci_hash=null, verified_at=null,
    birth_date=null, gender=null, carrier=null,
    venue_id=null, sanction_reason='본인 탈퇴', avatar_url=null
  where id = v_uid;
  delete from public.venue_staff  where user_id = v_uid;
  delete from public.venue_owners where user_id = v_uid;
  update auth.users set email = v_anon_email, phone = null, raw_user_meta_data = '{}'::jsonb
  where id = v_uid;
  delete from auth.identities where user_id = v_uid;
  delete from auth.sessions where user_id = v_uid;
  delete from auth.refresh_tokens where user_id = v_uid::text;
  delete from auth.one_time_tokens where user_id = v_uid;
  delete from public.push_subscriptions where user_id = v_uid;
  delete from storage.objects where bucket_id = 'avatars' and name like v_uid::text || '/%';
end $$;

-- 추천 보상 트리거가 'after update of ci'(컬럼 결합)라 drop 을 막는다 → ci_hash 감시로 재생성
drop trigger if exists trg_referral_reward_on_verify on public.profiles;
create trigger trg_referral_reward_on_verify
  after update of ci_hash on public.profiles
  for each row execute function public._referral_reward_on_verify();

alter table public.profiles drop column ci;
