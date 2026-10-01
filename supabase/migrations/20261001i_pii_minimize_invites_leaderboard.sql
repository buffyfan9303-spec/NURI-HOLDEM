-- ⏳ 미적용 초안 (2026-10-01, 보안 수정 초안 담당 Opus 5.5 high). 적용은 리드 승인 후 MCP execute_sql 로.
--    라이브 롤백 리허설(이 파일 본문 + 맨 아래 REHEARSAL 블록, 마지막 raise 로 되돌림) → REHEARSAL_OK 확인.
--    보고: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\sec-1001b-report.md
-- 20261001i — 공개 전 보안 점검(audit-security-1001.md) SEC-01 · SEC-04 · SEC-05.
--
-- ① SEC-01 [Medium] get_my_venue_invites 가 초대 대상 회원의 이메일을 업주·공동 운영자에게 준다.
--    닉네임으로도 초대가 되므로(invite_staff_by_email) 업주가 몰랐던 이메일을 받는다.
--    형제 함수 get_my_venue_staff 와 같은 식으로 맞춘다: 이메일은 관리자에게만, 그 외 null.
--    반환 타입은 그대로 → CREATE OR REPLACE(ACL 보존). 읽기 RPC 지만 업주 전용이라 anon 실행은 회수한다
--    (본문 게이트 can_manage_pos 로 이미 0행이었다 — 심층 방어).
-- ② SEC-04 [Low] kill_switch_is_set · pos_has_password 를 비로그인·무관계 회원이 매장 id 로 물을 수 있었다.
--    → anon 실행 회수 + 본문에 권한 조건(권한 없으면 false).
--      kill_switch_is_set: can_manage_pos(업주·공동 운영자·관리자). 설정·실행 화면은 대표 업주 전용이다.
--      pos_has_password : can_access_ledger(장부 권한 직원 포함 — 장부 화면 NuriPosLedger·LedgerStatsPanel 이 부른다).
--    반환 타입 그대로 → CREATE OR REPLACE.
--    venue_hidden_for_viewer·venue_today_games 는 건드리지 않는다(앞은 2차 재검토에서 수용, 뒤는 비로그인 출석 QR 경로).
-- ③ SEC-05 [Low · 표준 6] 공개 순위 get_activity_leaderboard 가 role 을 준다. 화면 소비처 0곳(실측 grep) → 칼럼 제거.
--    반환 타입이 바뀌므로 DROP + 재생성 → ACL 초기화 → REVOKE/GRANT 를 다시 쓴다(읽기 RPC 라 anon 허용).
--    클라이언트(src/api/community.ts)는 같은 커밋에서 role 매핑을 뺐다. 적용 순서 무관(옛 클라이언트는 undefined 를 받을 뿐).

-- 적용 전 게이트: 초안 작성 때 읽은 라이브 정의와 같을 때만(md5(pg_get_functiondef)).
do $$
begin
  if md5(pg_get_functiondef('public.get_my_venue_invites(uuid)'::regprocedure))     is distinct from '50deb1d63f7e26b89016367cdd5b87df'
  or md5(pg_get_functiondef('public.kill_switch_is_set(uuid)'::regprocedure))       is distinct from '56effd97dc607699f6500a79f313159f'
  or md5(pg_get_functiondef('public.pos_has_password(uuid)'::regprocedure))         is distinct from '4283d7c72980b7c5208a797a5b8184ce'
  or md5(pg_get_functiondef('public.get_activity_leaderboard(integer)'::regprocedure)) is distinct from '4419e4baa9e9560d9943693710de944e'
  then
    raise exception '20261001i 게이트: 라이브 정의가 초안 작성 때와 다르다 — 다시 읽고 고쳐 써라';
  end if;
end $$;

-- ① 직원 초대 대기 목록 — 이메일은 관리자에게만
create or replace function public.get_my_venue_invites(p_venue_id uuid default null)
 returns table(id uuid, user_id uuid, email text, nickname text, name text, created_at timestamp with time zone,
               grant_ledger boolean, grant_voucher boolean, grant_schedule boolean, staff_title text)
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  select i.id, i.user_id,
         case when my_role() = 'admin'::user_role then p.email end,
         p.nickname, p.name, i.created_at,
         i.grant_ledger, i.grant_voucher, i.grant_schedule, i.staff_title
  from venue_staff_invites i
  join profiles p on p.id = i.user_id
  where i.status = 'pending'
    and i.venue_id = coalesce(p_venue_id, (select v.id from venues v where v.owner_id = auth.uid() order by v.id limit 1))
    and can_manage_pos(i.venue_id)
  order by i.created_at desc;
$function$;
revoke all on function public.get_my_venue_invites(uuid) from public, anon;
grant execute on function public.get_my_venue_invites(uuid) to authenticated, service_role;

-- ② 매장 보안 설정 여부 — 권한자에게만
create or replace function public.kill_switch_is_set(p_venue_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  select coalesce(public.can_manage_pos(p_venue_id), false)
     and exists(select 1 from public.venue_kill_switch where venue_id = p_venue_id);
$function$;
revoke all on function public.kill_switch_is_set(uuid) from public, anon;
grant execute on function public.kill_switch_is_set(uuid) to authenticated, service_role;

create or replace function public.pos_has_password(p_venue_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  select coalesce(public.can_access_ledger(p_venue_id), false)
     and exists (select 1 from public.venue_pos_settings s where s.venue_id = p_venue_id and s.cancel_password_hash is not null);
$function$;
revoke all on function public.pos_has_password(uuid) from public, anon;
grant execute on function public.pos_has_password(uuid) to authenticated, service_role;

-- ③ 공개 활동 순위 — role 칼럼 제거(반환 타입 변경 → DROP + 재생성)
drop function if exists public.get_activity_leaderboard(integer);
create function public.get_activity_leaderboard(p_limit integer default 20)
 returns table(id uuid, nickname text, activity_points integer, avatar_color text, equipped_mark text)
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  select p.id, p.nickname, coalesce(p.activity_points, 0) as activity_points,
         p.avatar_color,
         case
           when m.key is null then p.equipped_mark
           when m.kind = 'earn' and coalesce(p.activity_points, 0) >= m.need then p.equipped_mark
           when m.kind = 'rent' and r.mark_key = p.equipped_mark and r.expires_at > now() then p.equipped_mark
           else null
         end as equipped_mark
  from public.profiles p
  left join public.shop_marks   m on m.key = p.equipped_mark
  left join public.mark_rentals r on r.user_id = p.id
  where coalesce(p.status, 'active') = 'active'
    and p.role <> 'admin'
    and coalesce(p.shadowbanned, false) = false
  order by coalesce(p.activity_points, 0) desc, p.joined_at asc nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$function$;
revoke all on function public.get_activity_leaderboard(integer) from public;
grant execute on function public.get_activity_leaderboard(integer) to anon, authenticated, service_role;

-- 자가검사: ACL·본문·반환 칼럼
do $$
declare
  f text;
begin
  foreach f in array array['public.get_my_venue_invites(uuid)', 'public.kill_switch_is_set(uuid)', 'public.pos_has_password(uuid)'] loop
    if has_function_privilege('anon', f, 'execute') then raise exception '20261001i 자가검사: % 를 anon 이 실행할 수 있다', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception '20261001i 자가검사: % 를 authenticated 가 실행 못 한다', f; end if;
  end loop;
  if not has_function_privilege('anon', 'public.get_activity_leaderboard(integer)', 'execute') then
    raise exception '20261001i 자가검사: 공개 순위를 anon 이 실행 못 한다';
  end if;
  if exists (select 1 from pg_proc p, unnest(p.proacl) a where p.oid = 'public.get_activity_leaderboard(integer)'::regprocedure and a::text like '=%') then
    raise exception '20261001i 자가검사: get_activity_leaderboard 에 PUBLIC 실행 권한이 남았다';
  end if;
  if pg_get_function_result('public.get_activity_leaderboard(integer)'::regprocedure) ~ '\mrole\M' then
    raise exception '20261001i 자가검사: get_activity_leaderboard 가 아직 role 을 반환한다';
  end if;
  if position('my_role() = ''admin''::user_role then p.email' in pg_get_functiondef('public.get_my_venue_invites(uuid)'::regprocedure)) = 0 then
    raise exception '20261001i 자가검사: get_my_venue_invites 의 이메일 가림이 없다';
  end if;
  if (select count(*) from pg_proc where oid in ('public.get_my_venue_invites(uuid)'::regprocedure, 'public.kill_switch_is_set(uuid)'::regprocedure,
        'public.pos_has_password(uuid)'::regprocedure, 'public.get_activity_leaderboard(integer)'::regprocedure)
        and prosecdef and proconfig @> array['search_path=public, pg_temp']) <> 4 then
    raise exception '20261001i 자가검사: SECURITY DEFINER search_path 고정이 빠졌다';
  end if;
end $$;

/* ── REHEARSAL(라이브 롤백 리허설 — 적용 때는 이 블록을 빼고 돌린다) ─────────────────────────────
   begin;  <위 본문>  then:
do $$
declare
  v_owner uuid := '7e435684-2c8c-458d-985c-31b784a44893';   -- venue_owner, f35b42d1 의 대표(사전 조회)
  v_admin uuid := 'f5d305f2-0f30-4d61-91ce-51f3332e5193';   -- admin, 매장 소유 없음
  v_user  uuid := '708de904-913e-4082-8803-8a2766b342f9';   -- user, 매장 소유·소속 없음 → 초대 대상
  v_venue uuid := 'f35b42d1-2d54-4905-95c1-1fda24e0f178';
  n int; e text; b boolean; denied boolean;
begin
  insert into venue_staff_invites(venue_id, user_id, status) values (v_venue, v_user, 'pending');
  insert into venue_kill_switch(venue_id, pw_hash) values (v_venue, 'x');
  insert into venue_pos_settings(venue_id, cancel_password_hash) values (v_venue, 'x')
    on conflict (venue_id) do update set cancel_password_hash = 'x';
  -- 업주(양성: 목록은 나온다 / 음성: 이메일 null / 양성: 두 판정 true)
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  select count(*), max(email), bool_and(nickname is not null or name is not null) into n, e, b from get_my_venue_invites(v_venue) where user_id = v_user;
  if n <> 1 then raise exception 'FAIL owner invites rows=%', n; end if;
  if e is not null then raise exception 'FAIL owner got email'; end if;
  if not kill_switch_is_set(v_venue) then raise exception 'FAIL owner kill_switch_is_set false'; end if;
  if not pos_has_password(v_venue) then raise exception 'FAIL owner pos_has_password false'; end if;
  -- 관리자(양성: 이메일 보인다)
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select max(email) into e from get_my_venue_invites(v_venue) where user_id = v_user;
  if e is null then raise exception 'FAIL admin email null'; end if;
  -- 무관계 회원(음성)
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  if kill_switch_is_set(v_venue) or pos_has_password(v_venue) then raise exception 'FAIL stranger sees flags'; end if;
  select count(*) into n from get_my_venue_invites(v_venue);
  if n <> 0 then raise exception 'FAIL stranger invites rows=%', n; end if;
  -- 비로그인(음성: 본문 false + ACL 거부)
  perform set_config('request.jwt.claims', '', true);
  if kill_switch_is_set(v_venue) or pos_has_password(v_venue) then raise exception 'FAIL anon body sees flags'; end if;
  if has_function_privilege('anon', 'public.kill_switch_is_set(uuid)', 'execute')
     or has_function_privilege('anon', 'public.pos_has_password(uuid)', 'execute')
     or has_function_privilege('anon', 'public.get_my_venue_invites(uuid)', 'execute') then raise exception 'FAIL anon acl'; end if;
  -- 실제 anon 롤로: 판정 함수는 권한 거부(음성), 공개 순위는 행이 나온다(양성)
  execute 'set local role anon';
  begin
    perform kill_switch_is_set(v_venue); denied := false;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL anon role executed kill_switch_is_set'; end if;
  select count(*) into n from get_activity_leaderboard(5);
  execute 'reset role';
  if n = 0 then raise exception 'FAIL leaderboard empty'; end if;
  raise exception 'REHEARSAL_OK leaderboard_rows=%', n;
end $$;
   (raise 로 트랜잭션 전체가 되돌아간다 — 이후 md5 재조회로 원상 확인)
*/
