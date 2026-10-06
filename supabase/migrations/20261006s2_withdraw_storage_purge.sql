select set_config('lock_timeout', '3s', true);
select set_config('statement_timeout', '60s', true);
-- ⏳ 미적용(store-team 2026-10-06). 적용 판단·실행은 nuri-lead(nuri-migration 절차). 위 두 줄을 떼지 말 것.
-- 🔴 적용 순서(pr187-review P2-A — 바꾸지 말 것). 이 마이그레이션 뒤로는 탈퇴해도 avatars 메타 행이 남아(공개 버킷)
--    엣지 함수가 지울 때까지 프로필 사진 URL 이 열린다. 엣지가 없거나 401 이면 큐가 영원히 안 줄고 아무도 모른다. 그래서:
--   1) 엣지 함수 supabase/functions/storage-purge 를 **먼저** 배포한다: `supabase functions deploy storage-purge`
--      (verify_jwt 는 기본값 true 그대로 — 크론이 공개 anon JWT 를 동봉해 통과한다. 게이트는 verify_jwt 가 아니라 x-nuri-cron-secret)
--   2) 시크릿 없는 POST 가 401 인지 확인한다: `curl -i -X POST -H "Authorization: Bearer <anon>" <url>/functions/v1/storage-purge` → 401
--   3) 이 파일을 적용한다(`git show <커밋>:<경로>` 로 뜬 **LF 본문** — CRLF 로 적용하면 20261006m 게이트 md5 가 어긋난다, P3-7).
--   4) 시험 계정 1개(프로필 사진 업로드한)를 탈퇴시키고 10분 회차 뒤 확인: 그 회원의 큐 행 done_at 이 채워지고
--      Storage 목록(avatars·verifications 의 '<uid>/' 폴더)이 0개. 결과를 이 머리말 '✅ 적용 완료' 줄에 남긴다.
--   관측(10회 소진·401 반복 — 둘 다 큐에 '안 끝난 행'으로 남는다):
--     select count(*) filter (where attempts >= 10) as exhausted,
--            count(*) filter (where done_at is null and created_at < now() - interval '30 minutes') as stale
--       from public.storage_purge_queue;      -- 둘 다 0 이어야 정상. stale>0·attempts=0 이면 엣지 401/미배포다.
--     엣지 로그: '[storage-purge] unauthorized' = 시크릿 불일치, '[storage-purge] exhausted' = 10회 실패 행 수.
-- 리허설: supabase/tests/20261006s2_rehearsal.sql (node rehearse-geo.mjs <이 파일> <리허설 파일>, 통째 롤백)
--
-- 20261006s2 — 기술 보안 점검 tech.md#P2-2: 탈퇴해도 신분증·프로필 사진 **파일**이 지워지지 않는다
--
-- 실측(security-1006 r5·r2, 라이브 롤백 리허설):
--   · 순위 인증 대기 중 탈퇴 → rank_verifications 행은 _purge_private_records 가 지우지만 verifications 버킷의
--     신분증·증빙 이미지 2개가 그대로 남는다(경로를 가리키던 행이 없어져 관리자 화면에서도 못 찾는 고아 = 무기한 보관).
--   · avatars 는 SQL `delete from storage.objects` 로 지운다. Supabase 공식 문서: "Deleting objects via a SQL query will not
--     remove the object from the bucket and will result in the object being orphaned"
--     (https://supabase.com/docs/guides/storage/management/delete-objects). 처리방침 PrivacyPolicy.tsx '복구·재생 불가 삭제' 와 다르다.
-- 바꾸는 것
--   ① storage_purge_queue(서비스 전용, RLS 켜고 정책 0) + _enqueue_user_storage_purge(uid, reason):
--      avatars·verifications 의 '<uid>/' 폴더 객체 경로를 큐에 넣는다(업로드 경로: src/lib/storage.ts uploadAvatar · src/api/rankverify.ts).
--   ② withdraw_my_account · admin_withdraw_user: 마지막 두 줄(SQL 메타 삭제)만 큐 넣기로 바꾼다. 나머지 본문은
--      라이브 pg_get_functiondef 그대로(스크립트로 두 줄만 치환 — 손 전사 0).
--   ③ cron_storage_purge(): 큐에 남은 게 있을 때만 10분마다 storage-purge 를 부른다. 호출 방식은 기존 크론
--      cron_weekly_email_digest(20260902b)와 같다 — Authorization 은 verify_jwt 관문용 공개 anon 키,
--      인증은 x-nuri-cron-secret = Vault push_shared_secret(엣지가 get_push_shared_secret 로 읽어 타이밍 안전 비교).
--   ④ 이미 남은 탈퇴자 고아 backfill(2026-10-06 라이브 실측 0개 — 멱등 안전장치).
-- 범위 밖: 게시글·장터 이미지(community_images·listings)는 처리방침상 '내용은 남김'(오너·법령 축 결정).
-- 라이브 출발점(2026-10-06 read_only 실측 md5(pg_get_functiondef)):
--   withdraw_my_account() 10a3b8d6000eeae4adecc4378282ca57 · admin_withdraw_user(uuid,text) 8c44fd1a44a73d8d45354d2a3e66796e

do $gate$
begin
  if md5(pg_get_functiondef('public.withdraw_my_account()'::regprocedure)) is distinct from '10a3b8d6000eeae4adecc4378282ca57' then
    raise exception '20261006s2 게이트: withdraw_my_account 가 작성 때(2026-10-06)와 다르다 — 라이브 정의를 다시 떠서 합쳐라'; end if;
  if md5(pg_get_functiondef('public.admin_withdraw_user(uuid,text)'::regprocedure)) is distinct from '8c44fd1a44a73d8d45354d2a3e66796e' then
    raise exception '20261006s2 게이트: admin_withdraw_user 가 작성 때(2026-10-06)와 다르다 — 라이브 정의를 다시 떠서 합쳐라'; end if;
  if to_regprocedure('public.get_push_shared_secret()') is null
     or not exists (select 1 from vault.secrets where name = 'push_shared_secret') then
    raise exception '20261006s2 게이트: 크론 공유 시크릿(push_shared_secret · get_push_shared_secret)이 없다'; end if;
end $gate$;

-- ① 큐
create table if not exists public.storage_purge_queue (
  id bigserial primary key,
  bucket_id text not null,
  name text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  attempts int not null default 0,
  last_error text,
  done_at timestamptz,
  unique (bucket_id, name)
);
alter table public.storage_purge_queue enable row level security;   -- 정책 0 = 클라이언트 전면 거부
revoke all on table public.storage_purge_queue from public, anon, authenticated;
revoke all on sequence public.storage_purge_queue_id_seq from public, anon, authenticated;
grant select, update on table public.storage_purge_queue to service_role;

create or replace function public._enqueue_user_storage_purge(p_uid uuid, p_reason text)
 returns integer
 language sql
 security definer
 set search_path = public, pg_temp
as $fn$
  with ins as (
    insert into public.storage_purge_queue(bucket_id, name, reason)
    select o.bucket_id, o.name, p_reason
      from storage.objects o
     where p_uid is not null
       and o.bucket_id in ('avatars', 'verifications')
       and o.name like p_uid::text || '/%'
    on conflict (bucket_id, name) do update set done_at = null, last_error = null, attempts = 0
    returning 1)
  select count(*)::int from ins;
$fn$;
revoke all on function public._enqueue_user_storage_purge(uuid, text) from public, anon, authenticated;
grant execute on function public._enqueue_user_storage_purge(uuid, text) to service_role;

-- ② 탈퇴 두 함수 — 라이브 본문에서 마지막 두 줄만 교체
CREATE OR REPLACE FUNCTION public.withdraw_my_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  perform public._purge_private_records(v_uid);  -- 20260925d
  -- 20261006s2: SQL 로 storage.objects 를 지우면 파일이 버킷에 고아로 남는다(Supabase 공식 문서) → 큐에 넣고
  --   storage-purge 엣지 함수가 Storage API 로 지운다. 프로필 사진(avatars)에 순위 인증 신분증·증빙(verifications)까지.
  perform public._enqueue_user_storage_purge(v_uid, 'withdraw_self');
end $function$;

CREATE OR REPLACE FUNCTION public.admin_withdraw_user(p_user_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  perform public._purge_private_records(p_user_id);  -- 20260925d
  -- 20261006s2: SQL 로 storage.objects 를 지우면 파일이 버킷에 고아로 남는다(Supabase 공식 문서) → 큐에 넣고
  --   storage-purge 엣지 함수가 Storage API 로 지운다. 프로필 사진(avatars)에 순위 인증 신분증·증빙(verifications)까지.
  perform public._enqueue_user_storage_purge(p_user_id, 'withdraw_admin');
end $function$;

revoke all on function public.withdraw_my_account() from public, anon;
grant execute on function public.withdraw_my_account() to authenticated, service_role;
revoke all on function public.admin_withdraw_user(uuid,text) from public, anon;
grant execute on function public.admin_withdraw_user(uuid,text) to authenticated, service_role;

-- ③ 크론 → 엣지 storage-purge (호출 방식은 cron_weekly_email_digest 와 같다)
create or replace function public.cron_storage_purge()
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $fn$
begin
  if not exists (select 1 from public.storage_purge_queue where done_at is null and attempts < 10) then return; end if;
  perform net.http_post(
    url     := 'https://idsxiqspecrucvfvtgbw.supabase.co/functions/v1/storage-purge',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- anon 키는 verify_jwt=true 관문 통과용(원래부터 공개 키 — 20260826a·20260902b 와 같은 관행). 인증은 아래 시크릿 헤더가 한다.
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc3hpcXNwZWNydWN2ZnZ0Z2J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzA0OTUsImV4cCI6MjA5NTY0NjQ5NX0.3Ljf6EjlnBXqRfzyb7VMiRJ9-El6JsfL5UGdXAWCI0c',
      'x-nuri-cron-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'push_shared_secret'), '')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end $fn$;
revoke all on function public.cron_storage_purge() from public, anon, authenticated;
grant execute on function public.cron_storage_purge() to service_role;
select cron.schedule('storage-purge', '*/10 * * * *', $$select public.cron_storage_purge()$$);  -- 같은 이름이면 덮어쓴다(멱등)

-- ④ 이미 남아 있는 탈퇴자 고아(2026-10-06 라이브 실측 0개)
insert into public.storage_purge_queue(bucket_id, name, reason)
select o.bucket_id, o.name, 'backfill_withdrawn'
  from storage.objects o
  join public.profiles p on p.id::text = split_part(o.name, '/', 1)
 where o.bucket_id in ('avatars', 'verifications') and p.status::text = 'withdrawn'
on conflict (bucket_id, name) do nothing;

-- 자가검사
do $self$
begin
  if pg_get_functiondef('public.withdraw_my_account()'::regprocedure) ~* 'delete\s+from\s+storage\.objects'
     or pg_get_functiondef('public.admin_withdraw_user(uuid,text)'::regprocedure) ~* 'delete\s+from\s+storage\.objects' then
    raise exception '20261006s2 자가검사: SQL 저장소 메타 삭제가 남아 있다'; end if;
  if pg_get_functiondef('public.withdraw_my_account()'::regprocedure) !~ '_enqueue_user_storage_purge\(v_uid'
     or pg_get_functiondef('public.admin_withdraw_user(uuid,text)'::regprocedure) !~ '_enqueue_user_storage_purge\(p_user_id' then
    raise exception '20261006s2 자가검사: 탈퇴 함수가 큐에 넣지 않는다'; end if;
  if has_function_privilege('authenticated', 'public._enqueue_user_storage_purge(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public._enqueue_user_storage_purge(uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.cron_storage_purge()', 'execute')
     or has_function_privilege('anon', 'public.cron_storage_purge()', 'execute')
     or has_function_privilege('anon', 'public.withdraw_my_account()', 'execute')
     or has_function_privilege('anon', 'public.admin_withdraw_user(uuid,text)', 'execute')
     or has_table_privilege('authenticated', 'public.storage_purge_queue', 'select')
     or has_table_privilege('anon', 'public.storage_purge_queue', 'select') then
    raise exception '20261006s2 자가검사: 내부 객체가 클라이언트에 열려 있다'; end if;
  if not has_function_privilege('authenticated', 'public.withdraw_my_account()', 'execute')
     or not has_function_privilege('authenticated', 'public.admin_withdraw_user(uuid,text)', 'execute') then
    raise exception '20261006s2 자가검사: 본인·관리자 탈퇴를 authenticated 가 못 부른다'; end if;
  if not has_table_privilege('service_role', 'public.storage_purge_queue', 'update') then
    raise exception '20261006s2 자가검사: 엣지 함수(service_role)가 큐를 못 고친다'; end if;
  if (select count(*) from cron.job where jobname = 'storage-purge') <> 1 then
    raise exception '20261006s2 자가검사: 크론 storage-purge 가 1개가 아니다'; end if;
end $self$;

notify pgrst, 'reload schema';

-- ROLLBACK(엣지 함수는 그대로 둬도 무해 — 큐가 비면 크론이 부르지 않는다)
-- 🔴 먼저 md5(pg_get_functiondef('public.withdraw_my_account()'::regprocedure)) = '570a3eb5aa675e0baf61781abc4c0281'(s2 직후)인지 본다.
--    다르면 20261006m(제재 계정 탈퇴) 등이 그 위에 얹힌 것이다 — 아래를 그대로 하면 그 변경이 조용히 사라지니 그것부터 되돌린다(P3-2).
-- select cron.unschedule('storage-purge');
-- 탈퇴 두 함수: 위 ② 의 `perform public._enqueue_user_storage_purge(...)` 를 라이브 출발점 두 줄
--   `perform set_config('storage.allow_delete_query', 'true', true);`
--   `delete from storage.objects where bucket_id = 'avatars' and name like <uid>::text || '/%';` 로 되돌린다(md5 위 게이트 값).
-- drop function if exists public.cron_storage_purge(); drop function if exists public._enqueue_user_storage_purge(uuid, text);
-- 큐 표는 처리 기록이라 남긴다(drop table public.storage_purge_queue 는 미처리 행이 0 일 때만).
