-- 20260914d — fail-open 가드 4곳을 NULL-safe 로 (admin_grant_points · admin_point_summary · admin_shout_refunds · hide_shout)
--
-- 적용 전 실측(2026-09-14, 라이브 pg_get_functiondef 직접 읽음 — 저장소 텍스트가 아니다):
--   네 함수 모두 코드에 `public.my_role() <> 'admin'` 이 **정확히 한 곳**, if 조건식 안, then 뒤 첫 문장이 raise exception.
--   주석·문자열 안의 `<>` 는 없다(본문 전체를 눈으로 확인). anon 은 이미 회수돼 있다(authenticated·service_role 만).
--   admin_grant_voucher_quota 는 이미 `IS DISTINCT FROM` 이라 대상이 아니다.
--   재현: 가짜 sub(profiles 행 없음)로 admin_point_summary 를 부르면 **예외 없이 0행** 을 돌려줬다(적용 전 실측, 아래 자가검사와 같은 방법).
--
-- 무엇이 문제인가
--   `my_role() <> 'admin'` 은 profiles 행이 없는 세션(대시보드에서 사용자 삭제 → CASCADE 로 프로필 삭제, 토큰은 만료까지 유효)에서
--   NULL 이 되고 plpgsql `if NULL` 은 건너뛴다 → 가드가 열린다. `IS DISTINCT FROM` 은 NULL 을 TRUE 로 본다(CLAUDE.md 보안 표준 §2).
--
-- 왜 20260913a 와 별개인가
--   20260913a 는 판정기(pg_temp 함수)로 12개를 일괄 치환하는 파일이고 격리 컨테이너 검증 전까지 적용 금지 상태다.
--   이 파일은 그 판정기를 쓰지 않는다 — 라이브 본문을 **그대로 옮겨 적고 비교 연산자 한 곳만** 바꾼다.
--   20260913a 가 나중에 적용되면 이 4개는 '자동 0건 → 건너뜀' 으로 지나간다(멱등이라 충돌 없음). 20260913a 파일은 손대지 않았다.
--
-- ACL: CREATE OR REPLACE 는 ACL 을 보존하지만(§3 실측) 관행대로 다시 쓴다(새로 만들어지는 경우 대비).
-- 롤백: 라이브 이전 본문 = 아래에서 `is distinct from` 을 `<>` 로 되돌린 것(그 밖은 동일). 되돌리면 가드가 다시 열린다.

-- ── ① admin_grant_points ─────────────────────────────────────────────────────
create or replace function public.admin_grant_points(p_user uuid, p_delta integer, p_reason text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_uid uuid := (select auth.uid()); v_reason text; v_after int;
begin
  if v_uid is null or public.my_role() is distinct from 'admin' then raise exception '권한이 없습니다'; end if;
  if p_delta = 0 then raise exception '변동 없는 지급입니다'; end if;
  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 4 then raise exception '사유를 4자 이상 남겨 주세요'; end if;

  update public.profiles
     set activity_points = greatest(0, coalesce(activity_points, 0) + p_delta)
   where id = p_user
  returning activity_points into v_after;
  if v_after is null then raise exception '대상을 찾을 수 없습니다'; end if;

  insert into public.point_grants (user_id, delta, reason, granted_by)
  values (p_user, p_delta, v_reason, v_uid);
  return v_after;
end $function$;

revoke all on function public.admin_grant_points(uuid, integer, text) from public, anon;
grant execute on function public.admin_grant_points(uuid, integer, text) to authenticated, service_role;

-- ── ② admin_point_summary ────────────────────────────────────────────────────
create or replace function public.admin_point_summary(p_user uuid)
returns table(total integer, spent integer, available integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if (select auth.uid()) is null then raise exception '로그인이 필요합니다'; end if;
  if public.my_role() is distinct from 'admin' then raise exception '권한이 없습니다'; end if;
  return query
    select coalesce(p.activity_points, 0), coalesce(p.spent_points, 0),
           greatest(0, coalesce(p.activity_points, 0) - coalesce(p.spent_points, 0))
    from public.profiles p where p.id = p_user;
end $function$;

revoke all on function public.admin_point_summary(uuid) from public, anon;
grant execute on function public.admin_point_summary(uuid) to authenticated, service_role;

-- ── ③ admin_shout_refunds ────────────────────────────────────────────────────
create or replace function public.admin_shout_refunds(p_limit integer default 50)
returns table(shout_id uuid, purchase_id bigint, refund_estimate integer, refund_block text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if (select auth.uid()) is null then raise exception '로그인이 필요합니다'; end if;
  if public.my_role() is distinct from 'admin' then raise exception '권한이 없습니다'; end if;

  return query
    select pp.shout_id, pp.id, coalesce(q.points, 0), q.block
    from public.point_purchases pp
    cross join lateral public.refund_quote(pp.id) q
    where pp.kind = 'shout' and pp.shout_id is not null
    order by pp.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end $function$;

revoke all on function public.admin_shout_refunds(integer) from public, anon;
grant execute on function public.admin_shout_refunds(integer) to authenticated, service_role;

-- ── ④ hide_shout ─────────────────────────────────────────────────────────────
-- `v_owner <> v_uid and my_role() <> 'admin'` — 남의 외침이면 `true and NULL` = NULL → 건너뜀(열림). 고치면 `true and true` → raise.
create or replace function public.hide_shout(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_uid uuid := (select auth.uid()); v_owner uuid;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  select user_id into v_owner from public.community_shouts where id = p_id;
  if v_owner is null then raise exception '이미 없는 외침입니다'; end if;
  if v_owner <> v_uid and public.my_role() is distinct from 'admin' then
    raise exception '권한이 없습니다';
  end if;
  update public.community_shouts
     set hidden = true, hidden_by = v_uid, hidden_at = now()
   where id = p_id and hidden = false;
end $function$;

revoke all on function public.hide_shout(uuid) from public, anon;
grant execute on function public.hide_shout(uuid) to authenticated, service_role;

-- ── 자가검사 — 어긋나면 트랜잭션 전체 롤백 ─────────────────────────────────────
do $chk$
declare
  v_sig  text;
  v_src  text;
  v_fake uuid := gen_random_uuid();
  n      int;
  v_ok   boolean;
begin
  -- (1) 텍스트: 네 본문에 `my_role() <>` / `!=` 가 남아 있지 않고, `is distinct from 'admin'` 이 정확히 1곳.
  --     이 네 본문은 위에 그대로 적혀 있어 주석·문자열 안에 그 문구가 없음을 눈으로 확인했다 — 그래서 단순 strpos 로 충분하다.
  foreach v_sig in array array['public.admin_grant_points(uuid, integer, text)', 'public.admin_point_summary(uuid)',
                               'public.admin_shout_refunds(integer)', 'public.hide_shout(uuid)'] loop
    if to_regprocedure(v_sig) is null then raise exception 'ABORT: % 가 없다', v_sig; end if;
    select prosrc into v_src from pg_proc where oid = to_regprocedure(v_sig);
    if v_src ~ 'my_role\(\)\s*(<>|!=)' then raise exception 'ABORT: % 에 NULL-unsafe 가드가 남아 있다', v_sig; end if;
    if (length(v_src) - length(replace(v_src, 'my_role() is distinct from ''admin''', ''))) / length('my_role() is distinct from ''admin''') <> 1 then
      raise exception 'ABORT: % 의 NULL-safe 가드가 정확히 1곳이 아니다', v_sig;
    end if;
    -- anon 은 PUBLIC 의 GRANT 를 상속하므로 anon=false 이면 PUBLIC 도 닫힌 것이다
    if has_function_privilege('anon', to_regprocedure(v_sig), 'execute') then raise exception 'ABORT: anon 이 % 를 실행할 수 있다', v_sig; end if;
    if not has_function_privilege('authenticated', to_regprocedure(v_sig), 'execute') then raise exception 'ABORT: authenticated 에 % 가 닫혀 있다', v_sig; end if;
  end loop;

  -- (2) 동작: profiles 행이 없는 세션(가짜 sub)에서 가드가 **막는가**. 적용 전에는 admin_point_summary 가 예외 없이 0행을 돌려줬다.
  --     세 함수는 가드가 첫 문장 근처라 쓰기 전에 멈춘다(admin_grant_points 는 update 이전). hide_shout 은 가드 앞에서
  --     외침 조회가 먼저라 실데이터 없이는 가드에 닿지 못한다 — 텍스트 검사(1)만 적용한다(테스트 행을 라이브 테이블에 넣지 않는다).
  perform set_config('request.jwt.claim.sub', v_fake::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_fake, 'role', 'authenticated')::text, true);
  if auth.uid() is distinct from v_fake or public.my_role() is not null then
    raise exception 'ABORT: 가짜 세션 준비 실패(auth.uid()=% my_role()=%)', auth.uid(), public.my_role();
  end if;

  v_ok := false;
  begin
    select count(*) into n from public.admin_point_summary(v_fake);
  exception when others then
    v_ok := sqlerrm = '권한이 없습니다';
  end;
  if not v_ok then raise exception 'ABORT: admin_point_summary 가 프로필 없는 세션을 통과시킨다'; end if;

  v_ok := false;
  begin
    select count(*) into n from public.admin_shout_refunds(1);
  exception when others then
    v_ok := sqlerrm = '권한이 없습니다';
  end;
  if not v_ok then raise exception 'ABORT: admin_shout_refunds 가 프로필 없는 세션을 통과시킨다'; end if;

  v_ok := false;
  begin
    perform public.admin_grant_points(v_fake, 1, '자가검사 — 여기까지 오면 안 된다');
  exception when others then
    v_ok := sqlerrm = '권한이 없습니다';
  end;
  if not v_ok then raise exception 'ABORT: admin_grant_points 가 프로필 없는 세션을 통과시킨다'; end if;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  raise notice '[자가검사] 통과 — 4 함수 NULL-safe · anon/PUBLIC 실행 불가 · 프로필 없는 세션 3/3 차단(hide_shout 은 텍스트만)';
end
$chk$;
