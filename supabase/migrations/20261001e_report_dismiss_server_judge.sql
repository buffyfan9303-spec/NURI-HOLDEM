-- ⏳ 미적용 초안(2026-10-01 · 서버 초안 담당). 적용은 리드가 MCP execute_sql 로 한다. 적용 뒤 이 줄을 "✅ 적용 완료 + 실측값" 으로 바꿔라.
--    롤백 리허설: 이 파일 본문 + 맨 아래 REHEARSAL 블록을 한 트랜잭션으로 돌려 REHEARSAL_OK(raise 로 되돌림) 확인 — admin-srv-report.md 참고.
--    ⚠ 적용만으로는 결함이 닫히지 않는다 — 화면(src/api/reports.ts updateReportStatus 의 '기각')이 admin_dismiss_report 로 바뀌어야 한다.
-- 20261001e — A-06: 신고 '기각' 한 건이 다른 미처리 신고·관리자 블라인드와 무관하게 글 블라인드를 풀던 것.
--
-- 원인(클라이언트 + 서버 둘 다):
--   · 클라이언트 src/api/reports.ts:59-65 가 기각이면 무조건 admin_set_post_blinded(false) 를 부른다.
--   · 서버에는 '누가 숨겼나'(자동/관리자)를 가를 칸이 없어서, 클라이언트만 고쳐도 관리자 블라인드를 구분할 수 없다.
--   · 자동 블라인드 트리거 auto_blind_reported_post 는 **기각된 신고까지** 세어, 기각 뒤 새 신고 한 건으로 다시 숨겨졌다.
-- 무엇을 바꾸나:
--   ① community_posts.blinded_source('auto'|'admin'|null) 추가 — 숨김일 때만 값이 있다(CHECK). 기존 숨김 3건은 신고가 0건이라 'admin' 으로 채운다.
--   ② auto_blind_reported_post: 기각되지 않은 신고의 신고자 수로 세고, 숨길 때 'auto' 로 적는다.
--   ③ admin_set_post_blinded: 숨길 때 'admin', 풀 때 null.
--   ④ admin_dismiss_report(p_report_id) 신설: open 신고만 기각(없으면 raise) → 같은 대상의 다른 신고가 전부 기각이고
--      숨김 출처가 'auto' 일 때만 블라인드를 푼다. 관리자 숨김·처리 완료(resolved) 신고가 남은 글은 그대로 둔다. audit_log 기록.
--   검토 반영(review-admin-srv-1001 e): ⑤ 기각 RPC 는 대상 글 행을 먼저 잠근다(동시 기각 경합) ⑥ 칸 추가 앞 lock_timeout 3s
--      ⑦ anon·authenticated 의 표 단위 INSERT/UPDATE 를 칸 단위로 바꿔 blinded_source 만 빼고 다시 준다(클라이언트 쓰기 차단).

-- 적용 전 게이트
do $$
begin
  if md5(pg_get_functiondef('public.auto_blind_reported_post()'::regprocedure)) is distinct from 'd24caef7032c31a8947db25dd7d64e8c' then
    raise exception '20261001e 게이트: auto_blind_reported_post 가 초안 작성 때와 다르다';
  end if;
  if md5(pg_get_functiondef('public.admin_set_post_blinded(uuid,boolean)'::regprocedure)) is distinct from 'abd1721335010f134da3a22dfcff9b71' then
    raise exception '20261001e 게이트: admin_set_post_blinded 가 초안 작성 때와 다르다';
  end if;
  if (select relacl::text from pg_class where oid = 'public.community_posts'::regclass)
       is distinct from '{postgres=arwdDxtm/postgres,anon=arwdm/postgres,authenticated=arwdm/postgres,service_role=arwdDxtm/postgres}' then
    raise exception '20261001e 게이트: community_posts 표 권한이 초안 작성 때와 다르다 — 칸 권한 전환을 다시 설계해라';
  end if;
  if exists (select 1 from pg_proc where proname = 'admin_dismiss_report' and pronamespace = 'public'::regnamespace) then
    raise exception '20261001e 게이트: admin_dismiss_report 가 이미 있다';
  end if;
  -- 이 파일 밖에서 blinded 를 true 로 쓰는 함수가 생겼으면 출처 칸이 비게 된다 — 먼저 확인해라.
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
               and p.proname not in ('auto_blind_reported_post', 'admin_set_post_blinded')
               and pg_get_functiondef(p.oid) ~* 'set\s+blinded\s*=') then
    raise exception '20261001e 게이트: blinded 를 쓰는 다른 함수가 있다 — 출처 칸 처리를 추가해라';
  end if;
end $$;

-- ① 숨김 출처 칸 (검토 반영: 잠금 대기가 길어지면 전체 읽기를 막지 않도록 3초에 포기)
set local lock_timeout = '3s';
alter table public.community_posts add column if not exists blinded_source text;
update public.community_posts set blinded_source = 'admin' where blinded and blinded_source is null;
update public.community_posts set blinded_source = null where not blinded and blinded_source is not null;
alter table public.community_posts drop constraint if exists community_posts_blinded_source_chk;
alter table public.community_posts add constraint community_posts_blinded_source_chk
  check (blinded_source is null or (blinded and blinded_source in ('auto', 'admin')));

-- ①-2 클라이언트가 새 칸을 못 쓰게(검토 반영). anon·authenticated 는 표 단위 INSERT/UPDATE 를 갖고 있어
--      칸 하나만 REVOKE 해도 효과가 없다 → 표 단위 INSERT/UPDATE 를 거두고, blinded_source 를 뺀 **기존 칸 전부**에
--      칸 단위로 다시 준다(다른 칸의 쓰기 권한은 적용 전과 같다). ⚠ 앞으로 이 표에 새 칸을 만들면 클라이언트 쓰기가
--      자동으로 열리지 않는다 — 필요한 칸만 GRANT insert(col)/update(col) 해야 한다.
do $$
declare v_cols text; r text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'community_posts' and column_name <> 'blinded_source';
  foreach r in array array['anon', 'authenticated'] loop
    execute format('revoke insert, update on public.community_posts from %I', r);
    execute format('grant insert (%s), update (%s) on public.community_posts to %I', v_cols, v_cols, r);
  end loop;
end $$;

-- ② 자동 블라인드: 기각된 신고는 세지 않고, 출처를 남긴다
create or replace function public.auto_blind_reported_post()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare cnt int;
begin
  if new.target_type = 'post' and new.target_id is not null then
    -- 20261001e: 기각된 신고는 세지 않는다(기각 뒤 한 건으로 다시 숨겨지지 않게).
    select count(distinct reporter_id) into cnt
      from public.reports
     where target_type = 'post' and target_id = new.target_id
       and status is distinct from 'dismissed';
    if cnt >= 3 then
      update public.community_posts set blinded = true, blinded_source = 'auto'
       where id = new.target_id::uuid and blinded = false;
    end if;
  end if;
  return new;
end; $function$;

revoke all on function public.auto_blind_reported_post() from public, anon, authenticated;

-- ③ 관리자 블라인드: 출처 기록
create or replace function public.admin_set_post_blinded(p_post_id uuid, p_blinded boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if coalesce(public.my_role()::text,'') <> 'admin' then raise exception '운영자만 가능합니다'; end if;
  -- 20261001e: 숨길 때 'admin', 풀 때 null(CHECK: 숨김일 때만 출처가 있다).
  update public.community_posts
     set blinded = p_blinded,
         blinded_source = case when p_blinded then 'admin' else null end
   where id = p_post_id;
end; $function$;

revoke all on function public.admin_set_post_blinded(uuid,boolean) from public, anon;
grant execute on function public.admin_set_post_blinded(uuid,boolean) to authenticated, service_role;

-- ④ 신고 기각 — 블라인드 해제 판정은 서버가 한다
create or replace function public.admin_dismiss_report(p_report_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_type text; v_target uuid; v_left int := 0; v_unblinded boolean := false;
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '운영자만 가능합니다';
  end if;
  -- 검토 반영: 대상 글 행을 먼저 잠근다 — 두 관리자가 같은 글의 마지막 두 신고를 동시에 기각하면
  -- 서로의 미확정 기각을 open 으로 보고 둘 다 안 푸는 경합을 막는다(두 번째는 첫 번째 커밋 뒤에 센다).
  select target_type, target_id into v_type, v_target from public.reports where id = p_report_id;
  if v_type = 'post' and v_target is not null then
    perform 1 from public.community_posts where id = v_target for update;
  end if;
  update public.reports set status = 'dismissed'
   where id = p_report_id and status = 'open'
  returning target_type, target_id into v_type, v_target;
  if not found then
    raise exception '이미 처리되었거나 없는 신고입니다';
  end if;

  if v_type = 'post' and v_target is not null then
    -- 같은 대상에 기각 아닌 신고(open·resolved)가 남아 있으면 풀지 않는다.
    select count(*) into v_left from public.reports
     where target_type = 'post' and target_id = v_target and status is distinct from 'dismissed';
    if v_left = 0 then
      update public.community_posts set blinded = false, blinded_source = null
       where id = v_target and blinded and blinded_source = 'auto';
      v_unblinded := found;
    end if;
  end if;

  perform public._audit('report_dismiss', p_report_id::text,
    jsonb_build_object('target_type', v_type, 'target_id', v_target, 'reports_left', v_left, 'unblinded', v_unblinded));
  return jsonb_build_object('unblinded', v_unblinded, 'reports_left', v_left);
end $function$;

revoke all on function public.admin_dismiss_report(uuid) from public, anon;
grant execute on function public.admin_dismiss_report(uuid) to authenticated, service_role;

-- 자가검사
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'community_posts' and column_name = 'blinded_source') then
    raise exception '20261001e: blinded_source 칸이 없다';
  end if;
  if exists (select 1 from public.community_posts where blinded and blinded_source is null) then
    raise exception '20261001e: 출처 없는 숨김 글이 남았다';
  end if;
  if position('dismissed' in pg_get_functiondef('public.auto_blind_reported_post()'::regprocedure)) = 0 then
    raise exception '20261001e: 자동 블라인드가 기각 신고를 계속 센다';
  end if;
  if has_function_privilege('anon', 'public.admin_dismiss_report(uuid)', 'execute')
     or has_function_privilege('anon', 'public.admin_set_post_blinded(uuid,boolean)', 'execute') then
    raise exception '20261001e: 관리자 RPC 가 anon 에 열려 있다';
  end if;
  if not has_function_privilege('authenticated', 'public.admin_dismiss_report(uuid)', 'execute') then
    raise exception '20261001e: 기각 RPC 가 authenticated 에 닫혔다';
  end if;
  if has_column_privilege('anon', 'public.community_posts', 'blinded_source', 'insert')
     or has_column_privilege('anon', 'public.community_posts', 'blinded_source', 'update')
     or has_column_privilege('authenticated', 'public.community_posts', 'blinded_source', 'insert')
     or has_column_privilege('authenticated', 'public.community_posts', 'blinded_source', 'update') then
    raise exception '20261001e: 클라이언트가 blinded_source 를 쓸 수 있다';
  end if;
  if not has_column_privilege('authenticated', 'public.community_posts', 'content', 'insert')
     or not has_column_privilege('authenticated', 'public.community_posts', 'content', 'update')
     or not has_column_privilege('anon', 'public.community_posts', 'content', 'insert')
     or not has_table_privilege('authenticated', 'public.community_posts', 'select')
     or not has_table_privilege('authenticated', 'public.community_posts', 'delete') then
    raise exception '20261001e: 기존 칸 권한이 줄었다(글쓰기 기능 소실)';
  end if;
  if position('for update' in pg_get_functiondef('public.admin_dismiss_report(uuid)'::regprocedure)) = 0 then
    raise exception '20261001e: 기각 RPC 가 글 행을 잠그지 않는다';
  end if;
  if has_function_privilege('authenticated', 'public.auto_blind_reported_post()', 'execute') then
    raise exception '20261001e: 트리거 함수가 클라이언트에 열려 있다';
  end if;
end $$;

/* REHEARSAL — 운영 DB 에서 `begin; <이 파일 본문>; <아래 블록>` 을 한 번에 돌린다. 끝의 raise 가 전부 되돌린다.
   계정(2026-10-01 조회): ADMIN c8e3734d(admin) · OWNER 7e435684(venue_owner, 비관리자)
     신고자 U1 fd14c2dc · U2 47360d8e · U3 7f985240 · U4 708de904 (모두 role=user) · 라이브 reports 0건.
   글 P = 1d703654-9260-4fe6-a2f1-c04c0c62a85c (숨김 아님) · 글 Q = dddd0000-0000-4000-8000-000000000903 (숨김 아님)
-- ▼REHEARSAL
do $$
declare
  c_admin uuid := 'c8e3734d-028d-4b69-86c9-a6d75c36601c';
  c_owner uuid := '7e435684-2c8c-458d-985c-31b784a44893';
  c_p uuid := '1d703654-9260-4fe6-a2f1-c04c0c62a85c';
  c_q uuid := 'dddd0000-0000-4000-8000-000000000903';
  r1 uuid; r2 uuid; r3 uuid; rq uuid; v_b boolean; v_src text; j jsonb;
begin
  insert into public.reports(reporter_id, target_type, target_id, reason) values ('fd14c2dc-d994-46e4-8f12-b6cf38104983','post',c_p,'리허설') returning id into r1;
  insert into public.reports(reporter_id, target_type, target_id, reason) values ('47360d8e-fd0e-49f3-ab3f-22e1fc1e9e60','post',c_p,'리허설') returning id into r2;
  insert into public.reports(reporter_id, target_type, target_id, reason) values ('7f985240-486c-4731-a166-109a52bea487','post',c_p,'리허설') returning id into r3;
  select blinded, blinded_source into v_b, v_src from public.community_posts where id = c_p;
  if not v_b or v_src is distinct from 'auto' then raise exception 'FAIL: 자동 블라인드 안 됨 % %', v_b, v_src; end if;

  -- 비로그인·비관리자 거절
  perform set_config('request.jwt.claims', '', true);
  begin perform public.admin_dismiss_report(r1); raise exception 'FAIL: 비로그인 기각 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%운영자만 가능합니다%' then raise exception 'FAIL: 엉뚱한 오류(기대: 운영자만 가능합니다): %', sqlerrm; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner, 'role', 'authenticated')::text, true);
  begin perform public.admin_dismiss_report(r1); raise exception 'FAIL: 업주 기각 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%운영자만 가능합니다%' then raise exception 'FAIL: 엉뚱한 오류(기대: 운영자만 가능합니다): %', sqlerrm; end if; end;

  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  -- 음성 1: 첫 건 기각 → 다른 open 신고 2건이 남아 계속 숨김
  j := public.admin_dismiss_report(r1);
  select blinded into v_b from public.community_posts where id = c_p;
  if not v_b or (j->>'unblinded')::boolean then raise exception 'FAIL: 다른 신고가 남았는데 풀림 %', j; end if;
  -- 음성 2: 같은 신고 두 번 기각 → raise
  begin perform public.admin_dismiss_report(r1); raise exception 'FAIL: 중복 기각 통과';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%이미 처리되었거나 없는 신고%' then raise exception 'FAIL: 엉뚱한 오류(기대: 이미 처리되었거나 없는 신고): %', sqlerrm; end if; end;
  -- 양성 1: 나머지를 다 기각하면 자동 숨김이 풀린다
  perform public.admin_dismiss_report(r2);
  j := public.admin_dismiss_report(r3);
  select blinded, blinded_source into v_b, v_src from public.community_posts where id = c_p;
  if v_b or v_src is not null or not (j->>'unblinded')::boolean then raise exception 'FAIL: 전부 기각했는데 안 풀림 % % %', v_b, v_src, j; end if;
  -- 음성 3: 기각 뒤 새 신고 1건으로 다시 숨겨지지 않는다(기각 신고 미집계)
  insert into public.reports(reporter_id, target_type, target_id, reason) values ('708de904-913e-4082-8803-8a2766b342f9','post',c_p,'리허설');
  select blinded into v_b from public.community_posts where id = c_p;
  if v_b then raise exception 'FAIL: 기각된 신고까지 세어 다시 숨김'; end if;

  -- 음성 4: 관리자가 직접 숨긴 글은 신고 기각으로 풀리지 않는다
  perform public.admin_set_post_blinded(c_q, true);
  select blinded_source into v_src from public.community_posts where id = c_q;
  if v_src is distinct from 'admin' then raise exception 'FAIL: 관리자 숨김 출처 %', v_src; end if;
  insert into public.reports(reporter_id, target_type, target_id, reason) values (c_owner,'post',c_q,'리허설') returning id into rq;
  perform public.admin_dismiss_report(rq);
  select blinded into v_b from public.community_posts where id = c_q;
  if not v_b then raise exception 'FAIL: 관리자 숨김이 기각으로 풀림'; end if;
  -- 양성 2: 관리자 해제는 여전히 된다
  perform public.admin_set_post_blinded(c_q, false);
  select blinded, blinded_source into v_b, v_src from public.community_posts where id = c_q;
  if v_b or v_src is not null then raise exception 'FAIL: 관리자 해제 실패'; end if;
  if not exists (select 1 from public.audit_log where action = 'report_dismiss' and target = rq::text and actor_id = c_admin) then
    raise exception 'FAIL: 기각 감사 없음';
  end if;

  -- 칸 권한(검토 반영): 일반 회원 글쓰기는 그대로 되고, blinded_source 를 실으면 권한 오류
  perform set_config('request.jwt.claims', json_build_object('sub', 'fd14c2dc-d994-46e4-8f12-b6cf38104983', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.community_posts (user_id, user_name, content)
  values ('fd14c2dc-d994-46e4-8f12-b6cf38104983', 'x', '리허설 글쓰기 양성 대조');
  begin
    insert into public.community_posts (user_id, user_name, content, blinded_source)
    values ('fd14c2dc-d994-46e4-8f12-b6cf38104983', 'x', '리허설', 'auto');
    raise exception 'FAIL: 클라이언트가 blinded_source 를 썼다';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%permission denied%' then raise exception 'FAIL: 엉뚱한 오류(기대: permission denied): %', sqlerrm; end if; end;
  execute 'reset role';
  if not exists (select 1 from public.community_posts where content = '리허설 글쓰기 양성 대조') then
    raise exception 'FAIL: 일반 글쓰기 양성 대조 실패';
  end if;

  raise exception 'REHEARSAL_OK 20261001e';
end $$;
-- ▲REHEARSAL
*/
