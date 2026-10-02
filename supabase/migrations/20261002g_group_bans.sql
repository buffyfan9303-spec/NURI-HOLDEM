-- ✅ 적용 완료 2026-10-02 (리드, Management API). 되돌림 리허설 PASS · advisors ERROR 0 · 44_group_bans 58 + 회귀 166 단언, critical-reviewer FX1(가입 경합)·FX2(이름 사본 동기화) 반영, 함수 소유자 postgres, 적용 시 차단 행 0
-- ============================================================================
-- 20261002g_group_bans.sql — 그룹 강퇴 = 재가입 차단(오너 결정 2026-10-02). ⛔ 미적용 · 적용 판단은 리드.
-- 선행: 20261002f_group_members_guard_and_notify(수정판) — _group_owner_id · 가드 트리거 · join_group(승인·active 확인) 위에서 동작한다.
-- ----------------------------------------------------------------------------
-- 오너 결정: "강퇴된 회원은 개설자가 풀 때까지 같은 그룹 재가입 불가."
--   · 강퇴 = 승인 멤버를 **다른 사람**(개설자·운영진·관리자)이 지운 것. 화면 경로는 removeMember = group_members DELETE 그대로다.
--     → 경로를 RPC 로 바꾸지 않고 AFTER DELETE 트리거가 차단 행을 남긴다(옛 화면·캐시된 PWA 의 강퇴도 똑같이 차단된다).
--   · 차단하지 않는 것: 본인 탈퇴 · 대기 신청 거절(status=pending) · 개설자 행 · cascade(그룹 삭제·계정 삭제 — pg_trigger_depth()>1).
--   · 차단 확인은 join_group 한 곳(group_members INSERT 정책이 0개라 가입 경로가 이것뿐이다).
--   · 해제는 unban_group_member — 개설자·관리자만(운영진 지정과 같은 선: 운영진은 볼 수만 있다).
--   · 조회는 RLS gb_select = is_group_manager(개설자·승인 운영진·관리자). 본인은 차단 여부를 조회하지 않는다(가입을 누르면 서버 문구로 안다).
--   · 클라이언트 직접 쓰기 0: INSERT/UPDATE/DELETE 권한을 주지 않는다(트리거·RPC 는 DEFINER).
-- 클라 영향: 차단 목록(getGroupBans)·해제(unbanGroupMember)·가입 오류 문구는 NURI/group-bans-1002 브랜치. 표가 없으면 화면은 목록을 숨긴다.
-- 리허설: node rehearse.mjs 00_ids.sql 41f_revised.rehearse.sql 41g.rehearse.sql 44_group_bans.sql  (+ 43_groups_final.sql 회귀)
-- ============================================================================

create table if not exists public.group_bans (
  group_id    uuid not null references public.venues(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  banned_by   uuid references auth.users(id) on delete set null,
  member_name text,                                  -- 강퇴 시점 표시 이름(목록용 사본 — group_members.member_name 과 같은 방식)
  created_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table public.group_bans enable row level security;
revoke all on table public.group_bans from public, anon, authenticated;
grant select on table public.group_bans to authenticated;
grant all on table public.group_bans to service_role;

drop policy if exists gb_select on public.group_bans;
create policy gb_select on public.group_bans for select to authenticated
  using (public.is_group_manager(group_id));

-- ── 강퇴 → 차단 행 ──────────────────────────────────────────────────────────
-- DEFINER: 클라이언트는 group_bans 에 쓸 권한이 없다. auth.uid() 는 DEFINER 안에서도 요청자 JWT 를 읽는다.
create or replace function public._ban_on_group_kick()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner uuid;
begin
  if old.status is distinct from 'approved' or auth.uid() is null or old.user_id = auth.uid() then
    return old;
  end if;
  -- cascade(그룹 삭제·계정 삭제)는 강퇴가 아니다 — 그 그룹·계정이 이미 지워져 보이지 않으면 건너뛴다(참조하면 FK 오류로 삭제 자체가 실패).
  --   ⚠ pg_trigger_depth() 로는 못 가른다: RI cascade 가 지운 행의 AFTER 트리거는 바깥 문장 끝으로 미뤄져 깊이 1 에서 돈다
  --     (2026-10-02 리허설 X06 실측 — 깊이 조건만 두면 관리자 계정 삭제가 23503 으로 실패했다).
  v_owner := public._group_owner_id(old.group_id);
  if v_owner is null or old.user_id = v_owner
     or not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;
  insert into public.group_bans (group_id, user_id, banned_by, member_name)
  values (old.group_id, old.user_id, auth.uid(), old.member_name)
  on conflict (group_id, user_id) do nothing;
  return old;
end $$;
revoke all on function public._ban_on_group_kick() from public, anon, authenticated;

drop trigger if exists trg_ban_on_group_kick on public.group_members;
create trigger trg_ban_on_group_kick
  after delete on public.group_members
  for each row execute function public._ban_on_group_kick();

-- ── 해제 — 개설자·관리자 ────────────────────────────────────────────────────
create or replace function public.unban_group_member(p_group uuid, p_user uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  if public._group_owner_id(p_group) is distinct from auth.uid()
     and public.my_role() is distinct from 'admin'::user_role then
    raise exception '차단 해제는 그룹 개설자만 할 수 있습니다';
  end if;
  delete from public.group_bans where group_id = p_group and user_id = p_user;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.unban_group_member(uuid, uuid) from public, anon;
grant execute on function public.unban_group_member(uuid, uuid) to authenticated, service_role;

-- ── join_group — 20261002f 수정판 본문 + 차단 확인 한 줄 ─────────────────────
create or replace function public.join_group(p_group uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $function$
DECLARE need_appr boolean; st text; pname text; pcolor text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  SELECT join_approval INTO need_appr FROM public.venues
   WHERE id = p_group AND kind <> 'venue' AND approved = true AND status = 'active';
  IF need_appr IS NULL THEN RAISE EXCEPTION '그룹을 찾을 수 없습니다'; END IF;
  -- 20261002g: 강퇴된 회원은 개설자가 풀 때까지 재가입 불가(화면은 이 문구를 그대로 보여 준다)
  IF EXISTS (SELECT 1 FROM public.group_bans WHERE group_id = p_group AND user_id = auth.uid()) THEN
    RAISE EXCEPTION '이 그룹에서 내보내진 계정이라 다시 가입할 수 없습니다. 개설자가 차단을 풀면 가입할 수 있어요.';
  END IF;
  SELECT coalesce(nickname,'회원'), avatar_color INTO pname, pcolor FROM public.profiles WHERE id = auth.uid();
  st := CASE WHEN need_appr THEN 'pending' ELSE 'approved' END;
  INSERT INTO public.group_members (group_id, user_id, role, status, member_name, member_color)
    VALUES (p_group, auth.uid(), 'member', st, coalesce(pname,'회원'), pcolor)
    ON CONFLICT (group_id, user_id) DO NOTHING;
  RETURN st;
END; $function$;
revoke execute on function public.join_group(uuid) from public, anon;
grant execute on function public.join_group(uuid) to authenticated, service_role;

-- ── 자가검사 ────────────────────────────────────────────────────────────────
do $chk$
begin
  if to_regprocedure('public._group_owner_id(uuid)') is null then
    raise exception '20261002g: 20261002f 가 먼저 적용돼야 합니다(_group_owner_id 없음)';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.group_bans'::regclass) then
    raise exception '20261002g: group_bans RLS 가 꺼져 있습니다';
  end if;
  if has_table_privilege('anon', 'public.group_bans', 'select')
     or has_table_privilege('authenticated', 'public.group_bans', 'insert')
     or has_table_privilege('authenticated', 'public.group_bans', 'update')
     or has_table_privilege('authenticated', 'public.group_bans', 'delete') then
    raise exception '20261002g: group_bans 클라이언트 쓰기·비로그인 읽기가 열려 있습니다';
  end if;
  if (select count(*) from pg_policy where polrelid = 'public.group_bans'::regclass) <> 1 then
    raise exception '20261002g: group_bans 정책은 조회 1개여야 합니다';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.group_members'::regclass and tgname = 'trg_ban_on_group_kick' and not tgisinternal) then
    raise exception '20261002g: 강퇴 차단 트리거가 없습니다';
  end if;
  if has_function_privilege('authenticated', 'public._ban_on_group_kick()', 'execute')
     or has_function_privilege('anon', 'public.unban_group_member(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.join_group(uuid)', 'execute') then
    raise exception '20261002g: 함수 실행 권한이 넓습니다';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public.unban_group_member(uuid, uuid)'::regprocedure)
     or not (select prosecdef from pg_proc where oid = 'public._ban_on_group_kick()'::regprocedure) then
    raise exception '20261002g: 해제·차단 함수는 DEFINER 여야 합니다';
  end if;
  if (select prosrc from pg_proc where oid = 'public.join_group(uuid)'::regprocedure) not like '%group_bans%' then
    raise exception '20261002g: join_group 이 차단을 확인하지 않습니다';
  end if;
end $chk$;


-- ===== critical-reviewer 10-02 수정안 FX1·FX2 (review-groups-20261002g.md) =====
-- [FX1] join_group: 차단 확인을 INSERT 뒤로(강퇴와 동시에 들어온 가입 경합 — INSERT 가 강퇴 트랜잭션을 기다린 뒤 새 스냅샷으로 다시 본다)
create or replace function public.join_group(p_group uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $function$
DECLARE need_appr boolean; st text; pname text; pcolor text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  SELECT join_approval INTO need_appr FROM public.venues
   WHERE id = p_group AND kind <> 'venue' AND approved = true AND status = 'active';
  IF need_appr IS NULL THEN RAISE EXCEPTION '그룹을 찾을 수 없습니다'; END IF;
  SELECT coalesce(nickname,'회원'), avatar_color INTO pname, pcolor FROM public.profiles WHERE id = auth.uid();
  st := CASE WHEN need_appr THEN 'pending' ELSE 'approved' END;
  INSERT INTO public.group_members (group_id, user_id, role, status, member_name, member_color)
    VALUES (p_group, auth.uid(), 'member', st, coalesce(pname,'회원'), pcolor)
    ON CONFLICT (group_id, user_id) DO NOTHING;
  -- 20261002g: 강퇴된 회원은 개설자가 풀 때까지 재가입 불가. INSERT 뒤에 본다 — 강퇴와 겹친 가입은 INSERT 가
  --   강퇴 트랜잭션 커밋을 기다리고, 이 문장은 새 스냅샷이라 방금 생긴 차단 행을 본다(raise 가 INSERT 를 되돌린다).
  IF EXISTS (SELECT 1 FROM public.group_bans WHERE group_id = p_group AND user_id = auth.uid()) THEN
    RAISE EXCEPTION '이 그룹에서 내보내진 계정이라 다시 가입할 수 없습니다. 개설자가 차단을 풀면 가입할 수 있어요.';
  END IF;
  RETURN st;
END; $function$;
revoke execute on function public.join_group(uuid) from public, anon;
grant execute on function public.join_group(uuid) to authenticated, service_role;

-- [FX2] 차단 목록 이름 사본도 닉네임 변경·탈퇴 익명화를 따라간다(_sync_nickname_snapshots 의 user_blocks.blocked_name 과 같은 처리)
create or replace function public._sync_group_bans_name()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.group_bans set member_name = new.nickname
   where user_id = new.id and member_name is distinct from new.nickname;
  return null;
end $$;
revoke all on function public._sync_group_bans_name() from public, anon, authenticated;
drop trigger if exists trg_sync_group_bans_name on public.profiles;
create trigger trg_sync_group_bans_name
  after update of nickname on public.profiles
  for each row when (old.nickname is distinct from new.nickname)
  execute function public._sync_group_bans_name();
