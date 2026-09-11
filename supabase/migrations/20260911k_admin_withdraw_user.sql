-- ============================================================================
-- 20260911k — 관리자 '강제 탈퇴' 를 본인 탈퇴와 같은 무게로 만든다
--
-- 무엇이 잘못됐나
--   관리자 화면의 '강제 탈퇴'(UserManagementTab.confirmSanction → App.handleUpdateUser →
--   src/api/auth.ts updateUserStatus)는 profiles 의 세 컬럼(status·suspended_until·sanction_reason)만
--   바꾼다. 본인 탈퇴(public.withdraw_my_account, 20260827c)가 하는 일 중
--     · 개인정보 파기(실명·전화·생년월일·성별·통신사·이메일·아바타·ci_hash)
--     · 로그인 경로 차단(auth.users 익명화 + identities/sessions/refresh_tokens/one_time_tokens 삭제)
--     · 소속 정리(venue_staff · venue_owners · profiles.venue_id)
--     · 푸시 구독·아바타 오브젝트 파기
--     · 재가입 차단 텀스톤(withdrawn_identities)
--   를 하나도 하지 않는다. 강제 탈퇴된 계정은 살아 있는 세션으로 계속 쓰이고, 개인정보는 남고,
--   notify-sanction 메일이 약속한 "동일인의 재가입이 제한됩니다" 는 거짓이었다.
--
-- ⚠ 이미 강제 탈퇴된 기존 행이 바로 그 피해자다
--   옛 경로로 status='withdrawn' 이 된 행들은 real_name·phone·ci_hash·avatar 가 남아 있고
--   auth.sessions/identities 도 살아 있다. 그래서 이 함수에는 "이미 withdrawn 이면 통과" 같은
--   조기 return 을 **두지 않는다** — 그 한 줄이 기존 피해자 전원을 영구히 파기 불가로 만든다.
--   함수 전체가 자연 멱등이라(상수 UPDATE · on conflict · 조건부 DELETE) 재실행이 안전하고,
--   재실행 기록이 audit_log 에 한 줄 더 남는 것은 append-only 감사로그의 의도된 동작이다.
--
-- 이 마이그레이션이 하는 일 (함수 3개 교체. 기존 행 변경 0)
--   1) public.admin_withdraw_user(uuid, text) — 본인 탈퇴와 동일한 파기 전량 + 관리자용 차이.
--   2) public.verify_identity_commit(...) — 제재성 텀스톤 명의의 본인확인을 실제로 거절(code='tombstoned').
--      지금까지 텀스톤은 추천 보상 파밍 차단 플래그였을 뿐 가입을 막은 적이 없다(20260827b 주석 그대로).
--      이 줄이 붙어야 메일 문구가 사실이 된다.
--   3) public.tombstone_banned_ci() — '제재 해제' 로 영구정지가 풀리면 그때 남긴 텀스톤도 같이 걷는다.
--      2)가 없던 시절엔 잔여 텀스톤이 무해했지만, 2) 이후로는 해제된 계정을 영구히 재인증 불가로 만든다.
--
-- 관리자판이 본인 탈퇴와 **일부러** 다른 점 (근거)
--   · 제재 중 거절 가드를 두지 않는다 — 제재 계정을 정리하는 것이 이 함수의 존재 이유다.
--     본인 탈퇴의 그 가드는 "탈퇴로 CI 를 풀어 밴을 회피" 하는 동기를 막으려던 것이고, 관리자 경로엔
--     그 동기가 없다(오히려 텀스톤을 새로 심는다).
--   · 매장 대표는 계속 거절한다 — 매장을 자동 정리하면 owner_id 를 앵커로 쓰는 RLS·장부·클락이
--     통째로 고아가 되거나 kill_venue 급 연쇄 삭제를 사유 한 줄로 실행하게 된다. 되돌릴 수 없다.
--     관리자에게는 이미 대표 이전(transfer_venue_primary)과 매장 정리 경로가 있으므로 그쪽을 먼저
--     시키는 것이 유일한 비파괴 선택이다. 오류 메시지가 그 다음 행동을 지시한다.
--     (옛 경로에는 이 가드가 없었으므로 매장을 가진 채 withdrawn 이 된 기존 행이 있을 수 있다 —
--      그 행은 여기서 거절되고, 대표 정리 후 다시 시도하면 정상 파기된다.)
--   · 운영자(role='admin') 계정은 거절한다 — 자신·동료 운영자를 한 번의 오조작으로 영구 파기하는 것을 막는다.
--   · sanction_reason 에는 운영자가 입력한 사유가 들어간다(본인 탈퇴는 '본인 탈퇴' 고정).
--   · withdrawn_identities.reason = 'admin_withdrawn'.
--     기존 값은 자발 'withdrawn'(20260820c)·영구정지 'banned'(20260820d) 두 가지다. 세 번째 값을 새로 두는 이유는
--     **제재성만 재가입을 막고 자발 탈퇴는 복귀를 계속 허용**하기 위해서다
--     (20260820d 의 "재가입 자체는 허용하되 보상만 스킵 — 마음 바뀐 정상 복귀 보호" 결정을 자발 탈퇴에 한해 유지).
--   · 감사기록: public._audit('admin_withdraw_user', …) — 20260623q 의 append-only audit_log.
--     누가(actor_id=auth.uid())·언제(created_at)·누구를(target)·왜(meta.reason)가 남는다.
--
-- ⚠ 적용 뒤 달라지는 범위: 이미 'banned' 로 텀스톤된 명의는 그 순간부터 본인확인이 거절된다(의도된 것).
--    적용 전 규모 확인:  select reason, count(*) from public.withdrawn_identities group by 1;
--
-- ⚠ ACL: 이 저장소 규약대로 create or replace 뒤에는 REVOKE/GRANT 를 전부 다시 쓴다.
--    tombstone_banned_ci 도 예외 없이 다시 쓴다 — 20260827d 가 걸어 둔 회수가 이 파일을 읽는
--    사람에게 보이지 않으면 다음 사람이 그 회수를 지운 줄 모른다.
--
-- 멱등: 전부 create or replace / on conflict / 조건부 DELETE. 두 번 실행해도 결과가 같다.
-- ============================================================================

-- ── 1) 관리자 강제 탈퇴 ──────────────────────────────────────────────────────
create or replace function public.admin_withdraw_user(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_hash text; v_role text; v_status text; v_suffix text; v_anon_email text; v_reason text;
begin
  -- 관리자 게이트는 NULL-safe 여야 한다. `<> ''admin''` 꼴은 비로그인(auth.uid()=NULL)에서 NULL 이 되어
  -- if 분기가 통째로 스킵되고 가드가 열린다(20260820a 에서 실제로 났던 사고).
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '권한 없음: 관리자만 강제 탈퇴를 처리할 수 있습니다';
  end if;
  if p_user_id is null then
    raise exception '대상 회원이 지정되지 않았습니다';
  end if;
  v_reason := left(btrim(coalesce(p_reason, '')), 500);
  if v_reason = '' then
    raise exception '강제 탈퇴 사유를 입력해 주세요';
  end if;

  select ci_hash, role::text, status::text
    into v_hash, v_role, v_status
    from public.profiles where id = p_user_id;
  if not found then
    raise exception '대상 회원을 찾을 수 없습니다';
  end if;

  -- 본인 탈퇴에 있는 '제재 중이면 거절' 가드는 여기에 **일부러 두지 않는다**(머리말 참조).
  -- '이미 탈퇴 상태면 통과' 도 두지 않는다 — 옛 경로로 status 만 바뀐 행이야말로 파기 대상이다.

  if v_role = 'admin' then
    raise exception '운영자 계정은 강제 탈퇴할 수 없습니다. 권한을 먼저 일반 회원으로 내려 주세요';
  end if;
  if exists (select 1 from public.venues where owner_id = p_user_id) then
    raise exception '매장 대표 계정입니다. 대표 이전 또는 매장 정리를 먼저 끝낸 뒤 다시 시도해 주세요';
  end if;

  -- 감사기록 먼저 — 아래에서 하나라도 실패하면 트랜잭션째 되돌아가므로 기록과 실제가 어긋나지 않는다.
  perform public._audit(
    'admin_withdraw_user', p_user_id::text,
    jsonb_build_object('reason', v_reason, 'prev_status', v_status, 'prev_role', v_role,
                       'ci_tombstoned', v_hash is not null));

  -- 재가입 차단 텀스톤. 제재성 사유로 남기므로 verify_identity_commit 이 이 명의의 본인확인을 거절한다.
  if v_hash is not null then
    insert into public.withdrawn_identities(ci_hash, reason)
    values (v_hash, 'admin_withdrawn')
    on conflict (ci_hash) do update set reason = 'admin_withdrawn', created_at = now();
  end if;

  v_suffix := substr(replace(p_user_id::text, '-', ''), 1, 12);
  v_anon_email := 'withdrawn_' || v_suffix || '@deleted.invalid';

  update public.profiles set
    status='withdrawn', nickname='탈퇴회원_'||v_suffix, email=v_anon_email,
    real_name=null, phone=null, ci_hash=null, verified_at=null,
    birth_date=null, gender=null, carrier=null,
    venue_id=null, avatar_url=null,
    suspended_until=null, sanction_reason=v_reason
  where id = p_user_id;

  delete from public.venue_staff  where user_id = p_user_id;
  delete from public.venue_owners where user_id = p_user_id;

  -- auth 계정은 '제거' 가 아니라 익명화 — 행을 지우면 FK 연쇄로 게시물·장부 이력까지 사라진다
  -- (20260827b 의 판단 그대로). 로그인 경로만 전부 끊는다.
  update auth.users set email = v_anon_email, phone = null, raw_user_meta_data = '{}'::jsonb
  where id = p_user_id;
  delete from auth.identities      where user_id = p_user_id;
  delete from auth.sessions        where user_id = p_user_id;
  delete from auth.refresh_tokens  where user_id = p_user_id::text;  -- user_id 컬럼은 varchar
  delete from auth.one_time_tokens where user_id = p_user_id;

  delete from public.push_subscriptions where user_id = p_user_id;
  delete from storage.objects where bucket_id = 'avatars' and name like p_user_id::text || '/%';
end $fn$;

comment on function public.admin_withdraw_user(uuid, text) is
  '관리자 강제 탈퇴 — 본인 탈퇴(withdraw_my_account)와 동일한 개인정보 파기·세션 종료에 더해 재가입 차단 텀스톤(admin_withdrawn)과 감사기록을 남긴다. 매장 대표·운영자 계정은 거절. 옛 경로로 status 만 바뀐 기존 행의 재처리를 위해 멱등. (20260911k)';

-- ACL: create or replace 는 PUBLIC 기본 GRANT 로 되돌아간다 — from anon 만으로는 무효.
revoke all on function public.admin_withdraw_user(uuid, text) from public, anon;
grant execute on function public.admin_withdraw_user(uuid, text) to authenticated, service_role;

-- ── 2) 재가입 차단을 실제로 건다 ─────────────────────────────────────────────
-- 20260904a 의 8-인자 정의를 그대로 두고 텀스톤 거절 한 블록만 앞에 얹는다.
-- 순서 주의: 인증 ID 일회성 소진(used_identity_verifications)보다 **앞**에서 거절해야
-- 거절당한 사용자의 인증 ID 가 헛되이 소진되지 않는다.
create or replace function public.verify_identity_commit(
  p_uid uuid, p_ci text, p_name text, p_phone text, p_birth date,
  p_gender text, p_carrier text, p_idv text default null
)
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

  -- 제재성 탈퇴 명의는 재가입·재인증을 거절한다. 자발 탈퇴 명의는 복귀를 계속 허용한다(20260820d 결정 유지).
  if exists (
    select 1 from public.withdrawn_identities w
     where w.ci_hash = v_hash and w.reason in ('banned', 'admin_withdrawn')
  ) then
    return jsonb_build_object('ok', false, 'code', 'tombstoned');
  end if;

  -- 인증 ID 일회성 — 같은 사용자의 재시도는 통과, 타인의 재사용은 거절.
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

comment on function public.verify_identity_commit(uuid,text,text,text,date,text,text,text) is
  '본인확인 결과 커밋 — CI 는 HMAC 해시로만 저장, 1인 1계정(ci_hash 유니크), 인증 ID 일회성, 제재성 탈퇴 명의 거절(code=tombstoned). 호출자는 verify-identity 엣지 함수(service_role). (20260911k)';

revoke all on function public.verify_identity_commit(uuid,text,text,text,date,text,text,text) from public, anon, authenticated;
grant execute on function public.verify_identity_commit(uuid,text,text,text,date,text,text,text) to service_role;

-- ── 3) 제재 해제는 텀스톤도 함께 푼다 ────────────────────────────────────────
-- 20260827b 정의에 해제 분기만 추가. 관리자 '제재 해제'(status: banned → active)가 남긴 텀스톤을
-- 그대로 두면 2) 이후로는 그 명의가 영구히 재인증 불가가 된다 — 해제가 해제가 아니게 된다.
-- 강제 탈퇴 텀스톤은 지우지 않는다(탈퇴한 profiles 행은 ci_hash 가 null 이라 애초에 매치되지도 않는다).
create or replace function public.tombstone_banned_ci() returns trigger
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
begin
  if new.status = 'banned' and old.status is distinct from 'banned' and new.ci_hash is not null then
    insert into public.withdrawn_identities(ci_hash, reason)
    values (new.ci_hash, 'banned')
    on conflict (ci_hash) do update set reason = 'banned', created_at = now();
  elsif new.status = 'active' and old.status is distinct from new.status and new.ci_hash is not null then
    delete from public.withdrawn_identities
     where ci_hash = new.ci_hash and reason = 'banned';
  end if;
  return new;
end $$;

-- 20260827d 가 걸어 둔 회수를 그대로 다시 쓴다(트리거 발화는 EXECUTE 를 검사하지 않지만,
-- 이 저장소 규약은 create or replace 뒤 ACL 재선언이다 — 생략이 '열어 뒀다'로 읽히면 안 된다).
revoke all on function public.tombstone_banned_ci() from public, anon, authenticated;

notify pgrst, 'reload schema';

-- ── 자가검사 ─────────────────────────────────────────────────────────────────
-- 카탈로그 사실 + prosrc 를 **strpos** 로 본다.
--   · LIKE 를 쓰면 '_' 가 단일문자 와일드카드라 의도보다 느슨해진다(20260911i 가 같은 함정을 기록).
--   · prosrc 에는 본문 주석도 들어가므로, 아래에서 찾는 문자열은 각 함수 본문 주석에 등장하지 않는다(확인 완료).
do $check$
declare v_oid oid; v_cfg text[]; v_acl aclitem[]; v_src text;
begin
  select p.oid, p.proconfig, p.proacl, p.prosrc into v_oid, v_cfg, v_acl, v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_withdraw_user'
     and pg_get_function_identity_arguments(p.oid) = 'uuid, text';
  if v_oid is null then
    raise exception 'ABORT: admin_withdraw_user(uuid, text) 가 생성되지 않았습니다';
  end if;
  if not (select prosecdef from pg_proc where oid = v_oid) then
    raise exception 'ABORT: admin_withdraw_user 가 SECURITY DEFINER 가 아닙니다';
  end if;
  if v_cfg is null or not exists (select 1 from unnest(v_cfg) c where c like 'search_path=%pg_temp%') then
    raise exception 'ABORT: admin_withdraw_user 의 search_path 가 public, pg_temp 로 고정되지 않았습니다';
  end if;

  -- 파기 범위가 본인 탈퇴와 같은가(기능 소실 방지)
  if strpos(v_src, 'delete from auth.sessions') = 0
     or strpos(v_src, 'delete from auth.identities') = 0
     or strpos(v_src, 'delete from auth.refresh_tokens') = 0
     or strpos(v_src, 'delete from public.push_subscriptions') = 0
     or strpos(v_src, 'ci_hash=null') = 0
     or strpos(v_src, 'real_name=null') = 0 then
    raise exception 'ABORT: admin_withdraw_user 가 본인 탈퇴와 같은 파기를 하지 않습니다';
  end if;
  if strpos(v_src, 'admin_withdrawn') = 0 then
    raise exception 'ABORT: admin_withdraw_user 가 재가입 차단 텀스톤을 남기지 않습니다';
  end if;
  if strpos(v_src, 'is distinct from ''admin''::user_role') = 0 then
    raise exception 'ABORT: admin_withdraw_user 의 관리자 가드가 NULL-safe 가 아닙니다';
  end if;
  -- 옛 경로로 status 만 바뀐 기존 행을 파기 불가로 만드는 조기 return 이 다시 들어왔는가
  if v_src ~ 'v_status\s*=\s*''withdrawn''\s*then\s*return' then
    raise exception 'ABORT: 이미 withdrawn 인 행을 조기 return 하면 기존 피해자를 영구 방치합니다';
  end if;

  if v_acl is null then
    raise exception 'ABORT: admin_withdraw_user 의 EXECUTE 가 PUBLIC 기본 GRANT 상태입니다(REVOKE 누락)';
  end if;
  if has_function_privilege('anon', v_oid, 'execute') then
    raise exception 'ABORT: anon 이 admin_withdraw_user 를 실행할 수 있습니다';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception 'ABORT: authenticated 가 admin_withdraw_user 를 실행할 수 없습니다(관리자 화면이 죽는다)';
  end if;

  select p.oid, p.prosrc into v_oid, v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'verify_identity_commit'
     and pg_get_function_identity_arguments(p.oid) = 'uuid, text, text, text, date, text, text, text';
  if v_oid is null then
    raise exception 'ABORT: verify_identity_commit(8-인자) 가 사라졌습니다';
  end if;
  if strpos(v_src, 'admin_withdrawn') = 0 then
    raise exception 'ABORT: verify_identity_commit 에 제재성 텀스톤 거절이 없습니다(메일 문구가 다시 거짓이 된다)';
  end if;
  -- 기존 계약이 살아 있는가(1인 1계정 · 인증 ID 일회성)
  if strpos(v_src, 'used_identity_verifications') = 0 or strpos(v_src, '''reused''') = 0 then
    raise exception 'ABORT: verify_identity_commit 의 인증 ID 일회성이 사라졌습니다';
  end if;
  -- 거절이 인증 ID 소진보다 앞인가
  if strpos(v_src, 'admin_withdrawn') > strpos(v_src, 'used_identity_verifications') then
    raise exception 'ABORT: 텀스톤 거절이 인증 ID 소진보다 뒤입니다(막힌 사용자의 인증 ID 를 태운다)';
  end if;
  if has_function_privilege('anon', v_oid, 'execute')
     or has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception 'ABORT: verify_identity_commit 이 클라이언트 롤에 열려 있습니다(service_role 전용이어야 합니다)';
  end if;

  select p.oid, p.prosrc into v_oid, v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'tombstone_banned_ci';
  if v_oid is null then
    raise exception 'ABORT: tombstone_banned_ci 가 사라졌습니다';
  end if;
  if strpos(v_src, 'delete from public.withdrawn_identities') = 0 then
    raise exception 'ABORT: 제재 해제가 텀스톤을 걷지 않습니다(해제가 해제가 아니게 된다)';
  end if;
  if has_function_privilege('anon', v_oid, 'execute')
     or has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception 'ABORT: tombstone_banned_ci 가 클라이언트 롤에 열려 있습니다(20260827d 회수가 풀렸다)';
  end if;

  -- 텀스톤 테이블이 클라이언트 롤에 열려 있으면 CI 해시가 새어 나간다(20260820f 계약).
  if has_table_privilege('anon', 'public.withdrawn_identities', 'select')
     or has_table_privilege('authenticated', 'public.withdrawn_identities', 'select') then
    raise exception 'ABORT: withdrawn_identities 가 클라이언트 롤에 열려 있습니다';
  end if;
end $check$;

-- ROLLBACK
--   drop function if exists public.admin_withdraw_user(uuid, text);
--   그리고 20260904a 의 verify_identity_commit · 20260827b 의 tombstone_banned_ci 정의를 그대로 다시 실행하고
--   20260827d 의 `revoke execute on function public.tombstone_banned_ci() from public, anon, authenticated;` 재적용.
--   (이미 심긴 reason='admin_withdrawn' 행을 되돌리려면:
--      delete from public.withdrawn_identities where reason = 'admin_withdrawn';)
