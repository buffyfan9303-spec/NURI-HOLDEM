-- ✅ 2026-09-24 운영 적용 완료(nuri-lead, MCP execute_sql). 리허설: 대조 C0=ERR(현행 실패 재현) · P1 본인 탈퇴 OK · N1 일반회원의 관리자 함수 BLOCKED · P2 관리자 강제탈퇴 OK · anon 실행 f/f.
--    적용 후 md5: withdraw_my_account 3d10e4b6… · admin_withdraw_user 28d5fdae… · ACL {postgres,authenticated,service_role}
-- 20260924n — 회원 탈퇴가 운영에서 항상 실패하던 결함 수정
--
-- 원인: storage.objects 의 protect_objects_delete 트리거(FOR EACH STATEMENT)가
--       지울 행이 0개여도 `storage.allow_delete_query` 가 'true' 가 아니면 42501 을 낸다.
--       withdraw_my_account · admin_withdraw_user 는 마지막 줄에서 아바타 행을 직접 지우므로
--       탈퇴 전체가 롤백됐다(critical-reviewer 2026-09-24 실측: pre_withdraw_live=ERR).
-- 수정: 두 함수의 storage 삭제 직전에 트랜잭션 한정 set_config 한 줄. 본문 나머지는 라이브 정의 그대로
--       (적용 전 라이브 md5: admin_withdraw_user d137f865… · withdraw_my_account d9d03f26…).
-- ponytail: 메타 행만 지운다 — S3 원본은 고아로 남는다(Storage API 로 옮기면 해결). 메타가 없으면 API 로는 안 열린다.
-- 되돌리기: 이 파일에서 `perform set_config(...)` 두 줄을 뺀 본문으로 다시 create or replace.

create or replace function public.admin_withdraw_user(p_user_id uuid, p_reason text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hash text; v_role text; v_status text; v_suffix text; v_anon_email text; v_reason text;
begin
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

  if v_role = 'admin' then
    raise exception '운영자 계정은 강제 탈퇴할 수 없습니다. 권한을 먼저 일반 회원으로 내려 주세요';
  end if;
  if exists (select 1 from public.venues where owner_id = p_user_id) then
    raise exception '매장 대표 계정입니다. 대표 이전 또는 매장 정리를 먼저 끝낸 뒤 다시 시도해 주세요';
  end if;

  perform public._audit(
    'admin_withdraw_user', p_user_id::text,
    jsonb_build_object('reason', v_reason, 'prev_status', v_status, 'prev_role', v_role,
                       'ci_tombstoned', v_hash is not null));

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

  update auth.users set email = v_anon_email, phone = null, raw_user_meta_data = '{}'::jsonb
  where id = p_user_id;
  delete from auth.identities      where user_id = p_user_id;
  delete from auth.sessions        where user_id = p_user_id;
  delete from auth.refresh_tokens  where user_id = p_user_id::text;
  delete from auth.one_time_tokens where user_id = p_user_id;

  delete from public.push_subscriptions where user_id = p_user_id;
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'avatars' and name like p_user_id::text || '/%';
end $function$;

create or replace function public.withdraw_my_account()
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'avatars' and name like v_uid::text || '/%';
end $function$;

revoke all on function public.admin_withdraw_user(uuid, text) from public, anon;
grant execute on function public.admin_withdraw_user(uuid, text) to authenticated, service_role;
revoke all on function public.withdraw_my_account() from public, anon;
grant execute on function public.withdraw_my_account() to authenticated, service_role;
