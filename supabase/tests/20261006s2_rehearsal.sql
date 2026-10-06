-- 20261006s2 라이브 롤백 리허설 (store-team 2026-10-06) — security-1006/tech.md#P2-2
--
-- 실행: node rehearse-geo.mjs <supabase/migrations/20261006s2_withdraw_storage_purge.sql> <이 파일>
--   (실행기: 누리홀덤_영상분석_0930/geo-notice-1005/rehearse-geo.mjs — 한 트랜잭션, 마지막 ZZ999 로 통째 되돌림)
--   · 저장소 객체는 **메타 행만 합성**한다(파일 업로드 없음). 크론의 net.http_post 는 커밋 뒤에야 나가므로 롤백되면 호출 0.
--   · 값(이메일·실명·시크릿)은 출력하지 않는다 — 개수·참거짓만.
--   · 음성 대조: 마이그레이션 자리에 r0(타임아웃 두 줄)만 넣으면(= 지금 라이브) 큐 표가 없어 42P01 로 멈춘다(FAIL).
--   · 롤백 확인: 리허설 뒤 select to_regclass('public._probe_20261006s2'), to_regclass('public.storage_purge_queue') 가 둘 다 null.
--
-- 계정은 조회해서 고른다(nuri-migration §5):
--   u1·u2 = 일반 회원(role user·활성·매장 대표 아님) — u1 본인 탈퇴, u2 관리자 강제 탈퇴
--   u3    = 또 다른 일반 회원 — 남의 폴더가 큐에 안 들어가는지(범위) 대조용
--   adm   = 관리자(role admin·활성)

create table public._probe_20261006s2 (x int);

do $rehearsal$
declare
  u1 uuid; u2 uuid; u3 uuid; adm uuid;
  pre1 int; pre2 int; n int; m int; b boolean; q0 int;
  out text := ''; fails int := 0; total int := 0;
begin
  select p.id into u1 from public.profiles p
   where p.role::text = 'user' and p.status::text = 'active'
     and not exists (select 1 from public.venues v where v.owner_id = p.id)
   order by p.id limit 1;
  select p.id into u2 from public.profiles p
   where p.role::text = 'user' and p.status::text = 'active' and p.id <> u1
     and not exists (select 1 from public.venues v where v.owner_id = p.id)
   order by p.id limit 1;
  select p.id into u3 from public.profiles p
   where p.role::text = 'user' and p.status::text = 'active' and p.id not in (u1, u2)
   order by p.id limit 1;
  select p.id into adm from public.profiles p where p.role::text = 'admin' and p.status::text = 'active' order by p.id limit 1;
  if u1 is null or u2 is null or u3 is null or adm is null then
    raise exception using errcode = 'ZZ999', message = format('REHEARSAL %s %s/%s | 계정 선택 실패', 'FAIL', 0, 1);
  end if;

  -- 합성 저장소 메타(되돌림): u1 신분증·사진, u2 신분증, u3 사진(범위 대조)
  insert into storage.objects(bucket_id, name, owner, metadata) values
    ('verifications', u1::text || '/zz-s2-idcard.webp', u1, '{"size":1}'),
    ('avatars',       u1::text || '/zz-s2-avatar.webp', u1, '{"size":1}'),
    ('verifications', u2::text || '/zz-s2-idcard.webp', u2, '{"size":1}'),
    ('avatars',       u3::text || '/zz-s2-avatar.webp', u3, '{"size":1}');
  select count(*) into pre1 from storage.objects where bucket_id in ('avatars','verifications') and name like u1::text || '/%';
  select count(*) into pre2 from storage.objects where bucket_id in ('avatars','verifications') and name like u2::text || '/%';

  -- W1 본인 탈퇴 → 그 회원 폴더 전부 큐, 메타는 Storage API 가 지우도록 남김, 익명화는 그대로
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.withdraw_my_account();
  execute 'reset role';
  select count(*) into n from public.storage_purge_queue where name like u1::text || '/%' and reason = 'withdraw_self' and done_at is null;
  select count(*) into m from storage.objects where bucket_id in ('avatars','verifications') and name like u1::text || '/%';
  select (status::text = 'withdrawn' and real_name is null and phone is null and avatar_url is null) into b from public.profiles where id = u1;
  if n = pre1 and n >= 2 and m = pre1 and b then out := out || format('W1 PASS(본인 탈퇴 큐 %s·메타 유지·익명화); ', n);
  else fails := fails + 1; out := out || format('W1 FAIL queued=%s/%s meta=%s anon=%s; ', n, pre1, m, b); end if;

  -- W2 일반 회원이 강제 탈퇴 호출 → 거절, 큐 0
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_withdraw_user(u2, 'zz-s2');
    fails := fails + 1; out := out || 'W2 FAIL 일반회원 강제탈퇴 통과; ';
  exception when others then
    select count(*) into n from public.storage_purge_queue where name like u2::text || '/%';
    if n = 0 then out := out || 'W2 PASS(거절·큐 0); '; else fails := fails + 1; out := out || format('W2 FAIL 큐 %s; ', n); end if;
  end;

  -- W3 비로그인 본인 탈퇴 → 거절
  total := total + 1;
  perform set_config('request.jwt.claims', '', true);
  select count(*) into q0 from public.storage_purge_queue;
  begin
    perform public.withdraw_my_account();
    fails := fails + 1; out := out || 'W3 FAIL 비로그인 탈퇴 통과; ';
  exception when others then
    select count(*) into n from public.storage_purge_queue;
    if n = q0 then out := out || 'W3 PASS(비로그인 거절); '; else fails := fails + 1; out := out || 'W3 FAIL 큐 변함; '; end if;
  end;

  -- W4 관리자 강제 탈퇴(양성) → u2 폴더 큐
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.admin_withdraw_user(u2, 'zz-s2 리허설');
  execute 'reset role';
  select count(*) into n from public.storage_purge_queue where name like u2::text || '/%' and reason = 'withdraw_admin';
  select count(*) into m from storage.objects where bucket_id in ('avatars','verifications') and name like u2::text || '/%';
  if n = pre2 and n >= 1 and m = pre2 then out := out || format('W4 PASS(강제 탈퇴 큐 %s·메타 유지); ', n);
  else fails := fails + 1; out := out || format('W4 FAIL queued=%s/%s meta=%s; ', n, pre2, m); end if;

  -- W5 범위: 탈퇴하지 않은 u3 폴더는 큐에 없다
  total := total + 1;
  select count(*) into n from public.storage_purge_queue where name like u3::text || '/%';
  if n = 0 then out := out || 'W5 PASS(남의 폴더 0); '; else fails := fails + 1; out := out || format('W5 FAIL u3 큐 %s; ', n); end if;

  -- W6 클라이언트 접근 차단(authenticated·anon): 큐 읽기·큐 넣기·크론 호출
  total := total + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  m := 0;
  execute 'set local role authenticated';
  begin select count(*) into n from public.storage_purge_queue; exception when insufficient_privilege then m := m + 1; end;
  begin perform public._enqueue_user_storage_purge(u3, 'zz'); exception when insufficient_privilege then m := m + 1; end;
  begin perform public.cron_storage_purge(); exception when insufficient_privilege then m := m + 1; end;
  execute 'reset role';
  execute 'set local role anon';
  begin select count(*) into n from public.storage_purge_queue; exception when insufficient_privilege then m := m + 1; end;
  begin perform public._enqueue_user_storage_purge(u3, 'zz'); exception when insufficient_privilege then m := m + 1; end;
  execute 'reset role';
  if m = 5 then out := out || 'W6 PASS(클라 5경로 42501); '; else fails := fails + 1; out := out || format('W6 FAIL 차단 %s/5; ', m); end if;

  -- W7 크론: 큐가 있으면 storage-purge 로 POST 1건(시크릿 헤더 비어 있지 않음), 크론 1개·10분
  total := total + 1;
  select count(*) into q0 from net.http_request_queue;
  perform public.cron_storage_purge();
  select count(*) into n from net.http_request_queue;
  select bool_and(r.url like '%/functions/v1/storage-purge' and r.method = 'POST'
                  and coalesce(r.headers->>'x-nuri-cron-secret', '') <> '')
    into b from net.http_request_queue r where r.url like '%storage-purge';
  if n = q0 + 1 and b and (select count(*) from cron.job where jobname = 'storage-purge' and schedule = '*/10 * * * *') = 1 then
    out := out || 'W7 PASS(크론 POST 1·시크릿 동봉·잡 1); ';
  else fails := fails + 1; out := out || format('W7 FAIL req=%s→%s hdr=%s; ', q0, n, b); end if;

  -- W8 크론: 큐가 비면 부르지 않는다
  total := total + 1;
  update public.storage_purge_queue set done_at = now() where done_at is null;
  select count(*) into q0 from net.http_request_queue;
  perform public.cron_storage_purge();
  select count(*) into n from net.http_request_queue;
  if n = q0 then out := out || 'W8 PASS(빈 큐 호출 0); '; else fails := fails + 1; out := out || 'W8 FAIL 빈 큐에서 호출; '; end if;

  raise exception using errcode = 'ZZ999',
    message = format('REHEARSAL %s %s/%s | %s', case when fails = 0 then 'PASS' else 'FAIL' end, total - fails, total, out);
end $rehearsal$;
