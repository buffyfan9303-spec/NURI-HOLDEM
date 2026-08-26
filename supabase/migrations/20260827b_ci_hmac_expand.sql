-- ── CI 원문 저장 종료(Expand): HMAC 해시 전환 + 탈퇴 파기 완결 ────────────────
-- 왜: profiles.ci(연계정보 원문)가 평문 저장돼 있었다. 유출 시 교체 불가능한 전 국민
-- 불변 식별자다. 전 리더(9개 함수)를 ci_hash(HMAC-SHA256 · Vault 페퍼) 기반으로 재작성하고
-- 신규 인증부터 원문을 저장하지 않는다. Contract(다음 마이그레이션)에서 ci 컬럼을 drop.
-- 탈퇴(withdraw_my_account)는 auth 계정 익명화·세션/토큰/푸시/아바타 파기까지 완결한다
-- (오너 확정 2026-08-27: 서비스에 '출금' 개념 없음 — 매장이용권 수수만 존재).
-- 텀스톤(withdrawn_identities)은 현재 0행 — md5 레거시 병행 없이 HMAC로 클린 컷오버.

-- 1) Vault 페퍼 자기 생성(존재 시 유지 — 재실행 안전, 키는 DB 밖으로 나가지 않는다)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'ci_hmac_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'ci_hmac_key',
      'profiles.ci_hash HMAC pepper (2026-08-27)'
    );
  end if;
end $$;

-- 2) hash_ci — HMAC-SHA256(hex). definer 전용(클라이언트 롤 실행 금지).
create or replace function public.hash_ci(p_ci text) returns text
language plpgsql stable security definer set search_path to 'public'
as $$
declare v_key text;
begin
  if p_ci is null or btrim(p_ci) = '' then return null; end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'ci_hmac_key';
  if v_key is null then raise exception 'ci_hmac_key가 Vault에 없습니다'; end if;
  return encode(extensions.hmac(convert_to(p_ci, 'utf8'), convert_to(v_key, 'utf8'), 'sha256'), 'hex');
end $$;
revoke all on function public.hash_ci(text) from public, anon, authenticated;

-- 3) 컬럼 + 1인 1계정 유니크(기존엔 엣지의 조회-후-쓰기라 레이스 여지) + 백필
alter table public.profiles add column if not exists ci_hash text;
alter table public.profiles add column if not exists identity_tombstoned boolean not null default false;
update public.profiles set ci_hash = public.hash_ci(ci) where ci is not null and ci_hash is null;
create unique index if not exists profiles_ci_hash_key on public.profiles (ci_hash) where ci_hash is not null;
update public.profiles p set identity_tombstoned = true
 where p.ci is not null and not p.identity_tombstoned
   and exists (select 1 from public.withdrawn_identities w where w.ci_hash = md5(p.ci));

-- 4) 인증 커밋 RPC — 원문 CI는 이 트랜잭션 안에서 해시로만 남는다(엣지가 service_role로 호출)
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
  -- 텀스톤 = 가입 거부가 아니라 추천 보상 파밍 차단 플래그(기존 동작 보존)
  v_tomb := exists (select 1 from public.withdrawn_identities w where w.ci_hash = v_hash);
  update public.profiles set
    ci_hash = v_hash,
    ci = null,                          -- 원문 저장 중단(Expand 기간 포함)
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
revoke all on function public.verify_identity_commit(uuid, text, text, text, date, text, text) from public, anon, authenticated;
grant execute on function public.verify_identity_commit(uuid, text, text, text, date, text, text) to service_role;

-- 5) 리더 재작성 ① 추천 보상 트리거 — ci_hash 변화 감지로 전환
create or replace function public._referral_reward_on_verify() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  if NEW.ci_hash is not null and (OLD.ci_hash is null or OLD.ci_hash is distinct from NEW.ci_hash) then
    perform public._grant_referral_reward(NEW.id);
  end if;
  return NEW;
end $$;

-- ② 추천 보상 본체 — 텀스톤 판정을 해시·플래그로
create or replace function public._grant_referral_reward(p_referee uuid) returns void
language plpgsql security definer set search_path to 'public'
as $$
declare r public.referrals; v_hash text; v_tomb boolean;
begin
  select * into r from public.referrals where referee_id = p_referee and rewarded_at is null;
  if not found then return; end if;
  select ci_hash, identity_tombstoned into v_hash, v_tomb
    from public.profiles where id = p_referee and verified_at is not null;
  if v_hash is null then return; end if;
  -- 과거 탈퇴/제재 명의의 재가입이면 보상 파밍으로 보고 지급 없이 마감(재시도 루프 방지)
  if coalesce(v_tomb, false) or exists (select 1 from public.withdrawn_identities where ci_hash = v_hash) then
    update public.referrals set rewarded_at = now() where referee_id = p_referee;
    return;
  end if;
  update public.profiles set activity_points = coalesce(activity_points,0) + 300 where id = r.referee_id;
  update public.profiles set activity_points = coalesce(activity_points,0) + 500 where id = r.referrer_id;
  update public.referrals set rewarded_at = now() where referee_id = p_referee;
  insert into public.notifications (user_id, type, title, message, link) values
    (r.referrer_id, 'system', '🎉 친구 초대 보상', '초대한 친구가 본인인증을 완료해 활동점수 +500점!', '/'),
    (r.referee_id,  'system', '🎉 추천 가입 보상', '추천 가입 + 본인인증 완료로 활동점수 +300점!', '/');
end $$;

-- ③ 제재 텀스톤 트리거
create or replace function public.tombstone_banned_ci() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  if new.status = 'banned' and old.status is distinct from 'banned' and new.ci_hash is not null then
    insert into public.withdrawn_identities(ci_hash, reason)
    values (new.ci_hash, 'banned')
    on conflict (ci_hash) do update set reason = 'banned', created_at = now();
  end if;
  return new;
end $$;

-- ④~⑥ 인증 배지 리더 3곳 — is_ci_verified(보유 판정)에 해시를 전달
create or replace function public.find_user_by_phone(p_phone text)
returns table(id uuid, display text, verified boolean)
language sql security definer set search_path to 'public'
as $$
  select p.id, coalesce(p.nickname, p.name) as display, public.is_ci_verified(p.ci_hash, p.verified_at) as verified
  from public.profiles p
  where (
      public.my_role() = 'admin'
      or exists (select 1 from public.venues v where v.owner_id = auth.uid())
      or exists (select 1 from public.venue_owners vo where vo.user_id = auth.uid() and vo.status = 'approved')
    )
    and coalesce(p.status::text, 'active') = 'active'
    and length(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')) >= 9
    and regexp_replace(coalesce(p.phone,''), '[^0-9]', '', 'g') <> ''
    and right(regexp_replace(coalesce(p.phone,''), '[^0-9]', '', 'g'), 10)
      = right(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g'), 10)
  limit 5;
$$;

create or replace function public.find_user_for_transfer(p_nickname text)
returns table(id uuid, display text, verified boolean)
language sql security definer set search_path to 'public'
as $$
  select p.id,
         coalesce(nullif(btrim(p.nickname), ''), p.name) as display,
         public.is_ci_verified(p.ci_hash, p.verified_at) as verified
  from public.profiles p
  where coalesce(p.status::text, 'active') = 'active'
    and p.id <> auth.uid()
    and btrim(coalesce(p_nickname, '')) <> ''
    and (p.nickname ilike '%' || btrim(p_nickname) || '%' or p.name ilike '%' || btrim(p_nickname) || '%')
  order by (p.nickname = btrim(p_nickname)) desc, public.is_ci_verified(p.ci_hash, p.verified_at) desc, p.nickname
  limit 8;
$$;

create or replace function public.search_members_for_ranking(p_q text)
returns table(nickname text, real_name text, verified boolean)
language sql security definer set search_path to 'public'
as $$
  select p.nickname, p.name, public.is_ci_verified(p.ci_hash, p.verified_at) as verified
  from public.profiles p
  where exists (select 1 from profiles me where me.id = auth.uid() and me.role in ('venue_owner','admin'))
    and coalesce(p.status::text, 'active') = 'active'
    and btrim(coalesce(p_q, '')) <> ''
    and (p.nickname ilike '%' || btrim(p_q) || '%' or p.name ilike '%' || btrim(p_q) || '%')
  order by (p.nickname = btrim(p_q)) desc, p.nickname
  limit 8;
$$;

-- ⑦ 장터 인증 뱃지 스탬프
create or replace function public.guard_listing_seller() returns trigger
language plpgsql set search_path to 'public', 'pg_temp'
as $$
declare v_ci_ok boolean; v_nick text;
begin
  if current_user in ('authenticated','anon') then
    select (ci_hash is not null), nickname into v_ci_ok, v_nick from public.profiles where id = auth.uid();
    new.seller_id       := auth.uid();
    new.seller_verified := coalesce(v_ci_ok, false);      -- 인증뱃지는 CI 인증 여부로만
    new.seller_name     := coalesce(v_nick, new.seller_name);
    new.seller_trade_count := coalesce(
      (select count(*) from public.marketplace_listings where seller_id = auth.uid() and status = 'sold'), 0);
  end if;
  return new;
end $$;

-- ⑧ 보호 컬럼 가드 — ci_hash·identity_tombstoned 추가
create or replace function public.guard_profile_privileged_cols() returns trigger
language plpgsql set search_path to 'public', 'pg_temp'
as $$
begin
  if current_user in ('authenticated','anon') and coalesce(public.my_role()::text,'') <> 'admin' then
    if new.role is distinct from old.role
       or new.verified_at is distinct from old.verified_at
       or new.ci is distinct from old.ci
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

-- ⑨ 탈퇴 — ci_hash 텀스톤 + 파기 완결(auth 익명화·세션/토큰/푸시/아바타)
create or replace function public.withdraw_my_account() returns void
language plpgsql security definer set search_path to 'public'
as $$
declare v_uid uuid := auth.uid(); v_suffix text; v_status text; v_hash text; v_anon_email text;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  select status, ci_hash into v_status, v_hash from public.profiles where id = v_uid;
  -- 제재 중인 계정의 self-withdraw 금지(탈퇴로 CI 를 풀어 재가입 리셋하는 밴 회피 차단)
  if v_status in ('banned','suspended') then
    raise exception '제재 중인 계정은 탈퇴할 수 없습니다. 고객센터로 문의해 주세요';
  end if;
  if exists (select 1 from public.venues where owner_id = v_uid) then
    raise exception '매장 대표는 매장을 먼저 정리(삭제 또는 대표 양도)한 뒤 탈퇴할 수 있습니다';
  end if;
  -- 재식별 방지 텀스톤: CI HMAC 해시 보존 — 재가입 시 추천 보상 파밍 차단용
  if v_hash is not null then
    insert into public.withdrawn_identities(ci_hash, reason)
    values (v_hash, 'withdrawn')
    on conflict (ci_hash) do update set reason = 'withdrawn', created_at = now();
  end if;
  v_suffix := substr(replace(v_uid::text, '-', ''), 1, 12);
  v_anon_email := 'withdrawn_' || v_suffix || '@deleted.invalid';
  update public.profiles set
    status='withdrawn', nickname='탈퇴회원_'||v_suffix, email=v_anon_email,
    real_name=null, phone=null, ci=null, ci_hash=null, verified_at=null,
    birth_date=null, gender=null, carrier=null,
    venue_id=null, sanction_reason='본인 탈퇴', avatar_url=null
  where id = v_uid;
  delete from public.venue_staff  where user_id = v_uid;
  delete from public.venue_owners where user_id = v_uid;
  -- 파기 완결(2026-08-27): auth 계정은 '삭제'가 아니라 익명화 — 행을 지우면 FK 연쇄로
  -- 게시물·장부 이력까지 사라진다. 로그인 경로(이메일·소셜 identity·세션·토큰)만 전부 끊는다.
  update auth.users set email = v_anon_email, phone = null, raw_user_meta_data = '{}'::jsonb
  where id = v_uid;
  delete from auth.identities where user_id = v_uid;
  delete from auth.sessions where user_id = v_uid;
  delete from auth.refresh_tokens where user_id = v_uid::text;  -- user_id 컬럼은 varchar
  delete from auth.one_time_tokens where user_id = v_uid;
  -- 푸시 구독·아바타 파기(아바타는 스토리지 메타 삭제 = 접근 차단; 원본 바이트는 버킷 GC 대상)
  delete from public.push_subscriptions where user_id = v_uid;
  delete from storage.objects where bucket_id = 'avatars' and name like v_uid::text || '/%';
end $$;
