select set_config('lock_timeout', '3s', true);
select set_config('statement_timeout', '60s', true);
-- 20261006m — 이용 제한(정지·영구정지) 중인 회원의 본인 탈퇴 허용 · home-team 2026-10-06
-- ⏳ 미적용(작성·라이브 롤백 리허설만). 적용은 리드가 한다 — 적용 후 이 줄을 "✅ 적용 완료 + 실측값" 으로 바꾼다.
--
-- 요구: 오너 2026-10-06 "계정 탈퇴도 만들어" → security-1006/legal.md P2-8 초안 ②(리드 결정).
--   개인정보 보호법 §36(삭제)·§37(처리정지) — 제재 중이라는 이유만으로 탈퇴(파기 요구)를 막을 근거가 약하다.
--   제재 회피 재가입은 CI 변환값(withdrawn_identities)으로 계속 막는다. PR #188 반증(pr188-review.md P2-A) 뒤 리드 결정 (b):
--     · 영구정지(banned) 중 탈퇴 → reason='banned'(tombstone_banned_ci 가 영구정지 때 쓰는 값) · **5년 보관 뒤 파기**
--       (탈퇴가 profiles.ci_hash 를 지우므로, 6개월 파기면 영구정지가 6개월 정지로 바뀐다 — 반증 X1).
--     · 기간 정지(suspended, 아직 기간 안) 중 탈퇴 → reason='suspended' · 일반 탈퇴와 같은 6개월 보관, 그동안 같은 본인인증 재가입 거절.
--     · 정지 기간이 이미 끝났는데 크론(cron_unsuspend_expired) 전이라 status 만 'suspended' → 일반 탈퇴('withdrawn').
--       판정식은 서버 _actor_not_sanctioned() 와 같다(suspended_until is null or > now()) — P3-2.
--   그래서 verify_identity_commit 의 거절 목록에 'suspended' 를 더하고, _purge_withdrawn_identities 를 사유별 기간으로 바꾼다.
--   ('banned' 5년은 영구정지 처분 때 남기는 행에도 같이 적용된다 — 해제(active)되면 tombstone_banned_ci 가 즉시 지우는 것은 그대로.)
-- 기준: **20261006s2(PR #187, 탈퇴 파일 큐) 적용 후** withdraw_my_account 정의 — 첫 분기와 CI 행 reason 만 바꿨다.
--   적용 순서(리드 결정): 20261006s1 → 20261006s2 → 20261006l → 20261006m. s2 의 큐 넣기 호출을 지우지 않는다.
--   admin_withdraw_user 는 건드리지 않는다(s2 정의 그대로).
--
-- legal.md P2-4(탈퇴 후 profiles.name 잔존): 고치지 않는다 — 라이브 BEFORE 트리거 profiles_nickname_rules 가
--   모든 INSERT/UPDATE 에서 name := nickname 으로 맞추므로 탈퇴(nickname='탈퇴회원_…')와 함께 name 도 바뀐다.
--   리허설 W1·W3(본인·관리자 탈퇴)이 name 을 직접 단언해 이 사실을 잠근다.
--
-- 리허설: Documents/누리홀덤_영상분석_0930/security-1006/legal-fix/20261006m_rehearsal.sql (rehearse-geo.mjs 로 롤백 전용)

-- 출발점 게이트: withdraw_my_account 는 s2 적용 후 정의(2026-10-06 롤백 리허설에서 s1+s2 를 얹고 잰 md5),
--   verify_identity_commit·_purge_withdrawn_identities 는 라이브 정의(2026-10-06 ro.mjs md5).
--   s2 없이 이 파일만 적용하거나 그 사이 다른 PR 이 바꿨으면 조용히 덮지 않고 멈춘다.
do $gate$
begin
  if md5(pg_get_functiondef('public.withdraw_my_account()'::regprocedure)) is distinct from '570a3eb5aa675e0baf61781abc4c0281' then
    raise exception '20261006m 게이트: withdraw_my_account 가 20261006s2 적용 후 정의와 다르다 — s2 를 먼저 적용하거나 라이브 정의를 다시 떠서 합쳐라';
  end if;
  if md5(pg_get_functiondef('public.verify_identity_commit(uuid,text,text,text,date,text,text,text)'::regprocedure)) is distinct from '3d6a76addaf955060f069bc9e28cf043' then
    raise exception '20261006m 게이트: verify_identity_commit 가 작성 때(2026-10-06)와 다르다 — 라이브 정의를 다시 떠서 합쳐라';
  end if;
  if md5(pg_get_functiondef('public._purge_withdrawn_identities()'::regprocedure)) is distinct from '30d607f8606ef789887ca84ca5789d99' then
    raise exception '20261006m 게이트: _purge_withdrawn_identities 가 작성 때(2026-10-06)와 다르다 — 라이브 정의를 다시 떠서 합쳐라';
  end if;
end $gate$;

create or replace function public.withdraw_my_account()
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_suffix text; v_status text; v_hash text; v_anon_email text; v_until timestamptz; v_kind text;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  select status, ci_hash, suspended_until into v_status, v_hash, v_until from public.profiles where id = v_uid;
  -- 20261006m: 제재(정지·영구정지) 중에도 본인 탈퇴를 받는다. 대신 CI 변환값으로 재가입을 계속 막는다(아래 v_kind).
  --   정지는 _actor_not_sanctioned() 와 같은 식으로 '아직 기간 안' 일 때만 정지로 본다.
  v_kind := case
    when v_status = 'banned' then 'banned'                                            -- 5년(_purge_withdrawn_identities)
    when v_status = 'suspended' and (v_until is null or v_until > now()) then 'suspended'  -- 6개월
    else 'withdrawn' end;                                                             -- 6개월, 재가입 표시만
  if v_status = 'withdrawn' then
    raise exception '이미 탈퇴한 계정입니다';
  end if;
  if exists (select 1 from public.venues where owner_id = v_uid) then
    raise exception '매장 대표는 매장을 먼저 정리(삭제 또는 대표 양도)한 뒤 탈퇴할 수 있습니다';
  end if;
  if v_hash is not null then
    insert into public.withdrawn_identities(ci_hash, reason)
    values (v_hash, v_kind)
    on conflict (ci_hash) do update set reason = excluded.reason, created_at = now();
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
  perform public._purge_private_records(v_uid);  -- 20260925d
  -- 20261006s2: SQL 로 storage.objects 를 지우면 파일이 버킷에 고아로 남는다(Supabase 공식 문서) → 큐에 넣고
  --   storage-purge 엣지 함수가 Storage API 로 지운다. 프로필 사진(avatars)에 순위 인증 신분증·증빙(verifications)까지.
  perform public._enqueue_user_storage_purge(v_uid, 'withdraw_self');
end $function$;
revoke all on function public.withdraw_my_account() from public, anon;
grant execute on function public.withdraw_my_account() to authenticated, service_role;

-- ── 같은 CI 의 재가입(본인인증) 거절 목록에 'suspended'(기간 정지 중 탈퇴)를 더한다 — 라이브 정의에서 그 한 줄만 바꿨다.
create or replace function public.verify_identity_commit(p_uid uuid, p_ci text, p_name text, p_phone text, p_birth date, p_gender text, p_carrier text, p_idv text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_hash text; v_tomb boolean; v_idv_hash text; v_owner uuid;
begin
  v_hash := public.hash_ci(p_ci);
  if p_uid is null or v_hash is null then
    return jsonb_build_object('ok', false, 'code', 'bad_request');
  end if;

  if exists (
    select 1 from public.withdrawn_identities w
     where w.ci_hash = v_hash and w.reason in ('banned', 'admin_withdrawn', 'suspended')   -- 20261006m: + 기간 정지 중 탈퇴
  ) then
    return jsonb_build_object('ok', false, 'code', 'tombstoned');
  end if;

  if p_idv is not null and btrim(p_idv) <> '' then
    v_idv_hash := public.hash_ci(p_idv);
    insert into public.used_identity_verifications (idv_hash, user_id)
    values (v_idv_hash, p_uid)
    on conflict (idv_hash) do nothing;
    if not found then
      select user_id into v_owner from public.used_identity_verifications where idv_hash = v_idv_hash;
      if v_owner is distinct from p_uid then
        return jsonb_build_object('ok', false, 'code', 'reused');
      end if;
    end if;
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
end $function$;
revoke all on function public.verify_identity_commit(uuid,text,text,text,date,text,text,text) from public, anon, authenticated;
grant execute on function public.verify_identity_commit(uuid,text,text,text,date,text,text,text) to service_role;

-- ── 보관 기간: 영구정지(banned) 5년 · 그 밖(기간 정지 중 탈퇴·일반 탈퇴·강제 탈퇴) 6개월 — 처리방침 제3조.
create or replace function public._purge_withdrawn_identities()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare n integer;
begin
  -- 20261006m: 영구정지 행은 부정 재가입 방지를 위해 5년 보관(리드 결정 (b), pr188-review P2-A).
  delete from public.withdrawn_identities
   where created_at < now() - case when reason = 'banned' then interval '5 years' else interval '6 months' end;
  get diagnostics n = row_count;
  return n;
end $function$;
revoke all on function public._purge_withdrawn_identities() from public, anon, authenticated;
grant execute on function public._purge_withdrawn_identities() to service_role;
