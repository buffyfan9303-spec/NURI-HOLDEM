-- ⏳ 미적용 초안(2026-10-01 · 서버 초안 담당). 적용은 리드가 MCP execute_sql 로 한다. 적용 뒤 이 줄을 "✅ 적용 완료 + 실측값" 으로 바꿔라.
--    롤백 리허설: 이 파일 본문 + 맨 아래 REHEARSAL 블록을 한 트랜잭션으로 돌려 REHEARSAL_OK(raise 로 되돌림) 확인 — admin-srv-report.md 참고.
--    ⚠ 오너 결정 대기(audit A-11): '거절 = 영구 차단' 이 의도였다면 이 파일은 적용하지 않는다. 의도가 아니면 적용 + 화면 교체.
--    ⚠ 적용만으로는 결함이 닫히지 않는다 — 화면(UserManagementTab.tsx:233 reject)이 admin_reject_signup 을 불러야 한다.
-- 20261001f — A-11: '가입 거절'이 status='banned' 로 저장돼 트리거 tombstone_banned_ci 가 CI 를 withdrawn_identities 에
--             등록 → 본인인증 재가입까지 영구 차단되던 것. 거절과 정지를 분리한다.
--
-- 무엇을 바꾸나: admin_reject_signup(p_user_id, p_reason) 신설 — status='pending' 인 회원만,
--   역할은 일반 회원(user, 관리자는 그대로)·status='active'·approved=false 로 되돌리고 sanction_reason 은 비운다(제재가 아니다).
--   거절 사유는 audit_log 에 남긴다. banned 를 쓰지 않으므로 CI 차단 트리거는 불리지 않는다.
--   기존 정지(banned) 경로·tombstone 트리거는 건드리지 않는다.

-- 적용 전 게이트
do $$
begin
  if md5(pg_get_functiondef('public.tombstone_banned_ci()'::regprocedure)) is distinct from 'a269f5228a41ae2ede4d206bb17013d4' then
    raise exception '20261001f 게이트: tombstone_banned_ci 가 초안 작성 때와 다르다(active 전환 시 동작 재확인)';
  end if;
  if exists (select 1 from pg_proc where proname = 'admin_reject_signup' and pronamespace = 'public'::regnamespace) then
    raise exception '20261001f 게이트: admin_reject_signup 이 이미 있다';
  end if;
end $$;

create or replace function public.admin_reject_signup(p_user_id uuid, p_reason text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_role public.user_role;
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '운영자만 가능합니다';
  end if;
  update public.profiles
     set status = 'active'::user_status,
         role = case when role = 'admin'::user_role then role else 'user'::user_role end,
         approved = false,
         sanction_reason = null,
         suspended_until = null
   where id = p_user_id and status = 'pending'::user_status
  returning role into v_role;
  if not found then
    raise exception '가입 심사 대기 중인 회원이 아닙니다';
  end if;
  perform public._audit('signup_reject', p_user_id::text,
    jsonb_build_object('reason', left(nullif(btrim(p_reason), ''), 200), 'role_after', v_role));
end $function$;

revoke all on function public.admin_reject_signup(uuid,text) from public, anon;
grant execute on function public.admin_reject_signup(uuid,text) to authenticated, service_role;

-- 자가검사
do $$
declare d text := pg_get_functiondef('public.admin_reject_signup(uuid,text)'::regprocedure);
begin
  if position('banned' in d) > 0 then
    raise exception '20261001f: 거절 RPC 가 banned 를 쓴다';
  end if;
  if position($s$status = 'pending'::user_status$s$ in d) = 0 then
    raise exception '20261001f: 대기 회원 조건이 없다';
  end if;
  if has_function_privilege('anon', 'public.admin_reject_signup(uuid,text)', 'execute') then
    raise exception '20261001f: anon 에 열려 있다';
  end if;
  if not has_function_privilege('authenticated', 'public.admin_reject_signup(uuid,text)', 'execute') then
    raise exception '20261001f: authenticated 에 닫혔다';
  end if;
end $$;

/* REHEARSAL — 운영 DB 에서 `begin; <이 파일 본문>; <아래 블록>` 을 한 번에 돌린다. 끝의 raise 가 전부 되돌린다.
   라이브 status='pending' 회원은 0명(2026-10-01) → 리허설 안에서 auth.users 에 업주 신청자 1명을 만들어(handle_new_user 가 pending 프로필 생성) 쓴다.
   계정: ADMIN c8e3734d(admin) · OWNER 7e435684(venue_owner, 비관리자) · USER fd14c2dc(user/active — 대기 아님 음성 대조)
-- ▼REHEARSAL
do $$
declare
  c_admin uuid := 'c8e3734d-028d-4b69-86c9-a6d75c36601c';
  c_owner uuid := '7e435684-2c8c-458d-985c-31b784a44893';
  c_user  uuid := 'fd14c2dc-d994-46e4-8f12-b6cf38104983';
  c_new   uuid := '00000000-0000-4000-8000-00000020261f';
  r record;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (c_new, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rehearsal-20261001f@example.invalid',
          jsonb_build_object('role', 'venue_owner', 'nickname', '리허설신청자', 'agreed_to_terms', true), '{}'::jsonb, now(), now());
  update public.profiles set ci_hash = 'rehearsal-ci-20261001f' where id = c_new;
  select role::text, status::text into r from public.profiles where id = c_new;
  if r.status <> 'pending' or r.role <> 'venue_owner' then raise exception 'FAIL: 준비 실패 %', r; end if;

  -- 비로그인·비관리자 거절
  perform set_config('request.jwt.claims', '', true);
  begin perform public.admin_reject_signup(c_new, 'x'); raise exception 'FAIL: 비로그인 거절 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner, 'role', 'authenticated')::text, true);
  begin perform public.admin_reject_signup(c_new, 'x'); raise exception 'FAIL: 업주 거절 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;

  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  -- 음성: 대기 아닌 회원 → raise, 상태 불변
  begin perform public.admin_reject_signup(c_user, 'x'); raise exception 'FAIL: 대기 아닌 회원 거절 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  if (select status::text from public.profiles where id = c_user) <> 'active' then raise exception 'FAIL: 일반 회원 상태 변경'; end if;

  -- 양성: 대기 업주 신청자 거절 → user/active/approved=false, CI 차단 없음, 감사 기록
  perform public.admin_reject_signup(c_new, '서류 미비');
  select role::text, status::text, approved, sanction_reason into r from public.profiles where id = c_new;
  if r.role <> 'user' or r.status <> 'active' or r.approved is distinct from false or r.sanction_reason is not null then
    raise exception 'FAIL: 거절 결과 %', r;
  end if;
  if exists (select 1 from public.withdrawn_identities where ci_hash = 'rehearsal-ci-20261001f') then
    raise exception 'FAIL: 거절이 CI 재가입 차단을 만들었다';
  end if;
  if not exists (select 1 from public.audit_log where action = 'signup_reject' and target = c_new::text and actor_id = c_admin) then
    raise exception 'FAIL: 거절 감사 없음';
  end if;
  -- 두 번째 거절 → raise(이미 대기 아님)
  begin perform public.admin_reject_signup(c_new, 'x'); raise exception 'FAIL: 중복 거절 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;

  -- 대조(옛 화면 경로): 같은 회원을 banned 로 바꾸면 CI 차단이 생긴다 — 거절과 정지가 실제로 다른 효과임을 확인
  update public.profiles set status = 'banned' where id = c_new;
  if not exists (select 1 from public.withdrawn_identities where ci_hash = 'rehearsal-ci-20261001f') then
    raise exception 'FAIL: 대조 실패 — banned 가 CI 차단을 안 만든다(시험이 틀렸다)';
  end if;

  raise exception 'REHEARSAL_OK 20261001f';
end $$;
-- ▲REHEARSAL
*/
