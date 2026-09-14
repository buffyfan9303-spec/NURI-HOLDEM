-- 20260914c — 직원 관리 게이트 통일(S1) + 죽은 fail-open 함수 제거(A1)
--
-- ⚠ 이 파일은 2026-09-14 라이브에 적용했다(오너 승인). 적용 전 실측: venue_staff 0행 ·
--   profiles.role='venue_staff' 0명 · venue_owners approved 1명 · ledger_access 0행.
--   즉 지금 당장 피해자는 없고 **첫 직원을 들이는 순간** 터지는 잠복 결함이었다.
--
-- ── S1. 화면과 서버가 서로 다른 권한을 물었다 ────────────────────────────────
--   '직원 관리' 메뉴는 can_manage_venue_staff(admin · 대표 · 승인 공동사장, 20260911e)로 열리는데,
--   실제 실행 RPC 3종은 여전히 `profiles.role='venue_owner' AND venues.owner_id = auth.uid()` 만 통과시켰다.
--   결과: 공동 사장·운영자는 메뉴는 열리는데
--     · manage_staff / set_staff_title → '직원을 관리할 권한이 없습니다' 오류
--     · cancel_staff_invite → 예외 없이 **0행 삭제 후 '초대를 취소했습니다' 성공 토스트**
--       (nuri-affect 가 기록한 서버형 조용한 0행 — 화면만 성공이고 초대는 그대로 살아 있다)
--   → 세 함수의 게이트를 화면과 같은 can_manage_venue_staff(매장)로 통일한다.
--
--   ⚠ NULL 함정: can_manage_venue_staff 는 첫 절이 `coalesce(my_role()='admin', false)` 라
--     **운영자에게는 p_venue_id 가 NULL 이어도 true** 다. 그래서 매장을 못 찾은 경우를 먼저 걸러야
--     운영자가 존재하지 않는 대상에 대해 통과하지 않는다. 아래는 전부 '대상 조회 → 없으면 raise → 게이트' 순서다.
--
-- ── A1. create_my_venue(text,text,text) 제거 ────────────────────────────────
--   `my_role() <> 'venue_owner'` 가드는 profiles 행이 없는 세션에서 NULL 이 되어 if 를 건너뛴다(fail-open).
--   클라이언트는 8인자 오버로드만 부른다(src/api/community.ts:1201 전수 확인) — 죽은 함수라 지운다.
--   ⚠ 8인자 판은 NULL-safe(`not in`)라 그대로 둔다.
--
-- 멱등: create or replace / drop if exists. 기존 행 변경 0.
--
-- 롤백: 이 파일 적용 전 본문은 baseline 및 git 이력 참조. 되돌리면 공동 사장이 다시 막힌다.

-- ── ① 직원 승인·거절·제거 ────────────────────────────────────────────────────
create or replace function public.manage_staff(p_staff_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_staff_venue uuid;
begin
  -- 대상을 먼저 찾는다 — 못 찾으면 게이트를 보기 전에 막는다(운영자 NULL 통과 방지).
  select venue_id into v_staff_venue
    from public.profiles where id = p_staff_id and role = 'venue_staff';
  if v_staff_venue is null then
    raise exception '본인 매장 직원만 관리할 수 있습니다';
  end if;

  -- 화면(VenueManageTab 의 staffOk)과 **같은 판정**을 쓴다: 관리자 · 대표 · 승인 공동사장.
  if not public.can_manage_venue_staff(v_staff_venue) then
    raise exception '직원을 관리할 권한이 없습니다';
  end if;

  if p_action = 'approve' then
    update public.profiles set approved = true  where id = p_staff_id;
  elsif p_action = 'reject' then
    update public.profiles set approved = false where id = p_staff_id;
  elsif p_action = 'remove' then
    update public.profiles set role = 'user', venue_id = null, approved = false where id = p_staff_id;
    delete from public.ledger_access  where venue_id = v_staff_venue and user_id = p_staff_id;
    delete from public.voucher_access where venue_id = v_staff_venue and user_id = p_staff_id;
  else
    raise exception '알 수 없는 작업';
  end if;
end;
$fn$;

revoke all on function public.manage_staff(uuid, text) from public, anon;
grant execute on function public.manage_staff(uuid, text) to authenticated, service_role;

-- ── ② 직책 변경 ──────────────────────────────────────────────────────────────
create or replace function public.set_staff_title(p_staff_id uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_staff_venue uuid;
begin
  select venue_id into v_staff_venue
    from public.profiles where id = p_staff_id and role = 'venue_staff';
  if v_staff_venue is null then
    raise exception '본인 매장 직원만 관리할 수 있습니다';
  end if;
  if not public.can_manage_venue_staff(v_staff_venue) then
    raise exception '직원을 관리할 권한이 없습니다';
  end if;
  update public.profiles
     set staff_title = nullif(left(btrim(coalesce(p_title, '')), 20), '')
   where id = p_staff_id;
end;
$fn$;

revoke all on function public.set_staff_title(uuid, text) from public, anon;
grant execute on function public.set_staff_title(uuid, text) to authenticated, service_role;

-- ── ③ 초대 취소 — 조용한 0행을 오류로 바꾼다 ─────────────────────────────────
create or replace function public.cancel_staff_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_venue uuid;
begin
  select venue_id into v_venue from public.venue_staff_invites where id = p_invite_id;
  -- ⚠ 예전엔 여기서 조건이 안 맞으면 **0행 삭제 후 조용히 성공**했다. 화면은 '취소했습니다' 라고
  --   말하고 초대는 그대로 살아 있었다(nuri-affect §6-3 서버형 조용한 0행).
  if v_venue is null then
    raise exception '이미 처리됐거나 존재하지 않는 초대입니다';
  end if;
  if not public.can_manage_venue_staff(v_venue) then
    raise exception '직원을 관리할 권한이 없습니다';
  end if;
  delete from public.venue_staff_invites where id = p_invite_id;
end;
$fn$;

revoke all on function public.cancel_staff_invite(uuid) from public, anon;
grant execute on function public.cancel_staff_invite(uuid) to authenticated, service_role;

-- ── ④ A1: 죽은 fail-open 오버로드 제거 ───────────────────────────────────────
drop function if exists public.create_my_venue(text, text, text);

notify pgrst, 'reload schema';

-- ── 자가검사 ─────────────────────────────────────────────────────────────────
do $chk$
declare v_src text;
begin
  foreach v_src in array array['manage_staff','set_staff_title','cancel_staff_invite'] loop
    declare s text;
    begin
      select prosrc into s from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = v_src;
      if s is null then raise exception 'ABORT: % 가 없다', v_src; end if;
      if strpos(s, 'can_manage_venue_staff') = 0 then
        raise exception 'ABORT: % 가 통일 게이트를 쓰지 않는다', v_src;
      end if;
      if strpos(s, 'p.role = ''venue_owner''') > 0 then
        raise exception 'ABORT: % 에 옛 role 게이트가 남아 있다', v_src;
      end if;
    end;
  end loop;

  -- 조용한 0행이 오류가 됐는가
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cancel_staff_invite';
  if strpos(v_src, 'raise exception') = 0 then
    raise exception 'ABORT: cancel_staff_invite 가 여전히 조용히 성공한다';
  end if;

  -- 죽은 오버로드가 사라졌는가 / 살아 있는 8인자는 남았는가
  if to_regprocedure('public.create_my_venue(text, text, text)') is not null then
    raise exception 'ABORT: fail-open 3인자 오버로드가 남아 있다';
  end if;
  if to_regprocedure('public.create_my_venue(text, text, text, text, text, text, text, text)') is null then
    raise exception 'ABORT: 실제로 쓰는 8인자 판이 사라졌다 — 매장 생성이 죽는다';
  end if;

  -- ACL: 변이 RPC 가 anon/PUBLIC 에 열리면 안 되고, 로그인 사용자는 실행할 수 있어야 한다
  if has_function_privilege('anon', 'public.manage_staff(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.set_staff_title(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.cancel_staff_invite(uuid)', 'execute') then
    raise exception 'ABORT: 직원 관리 RPC 가 anon 에 열려 있다';
  end if;
  if not has_function_privilege('authenticated', 'public.manage_staff(uuid, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.cancel_staff_invite(uuid)', 'execute') then
    raise exception 'ABORT: authenticated 에 닫혀 있다 — 직원 관리 화면이 죽는다';
  end if;
end
$chk$;
