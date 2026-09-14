-- 20260915j — 초대 시점에 권한·직함을 정하고, **수락과 같은 트랜잭션에서** 부여한다 (오너 지시 2026-09-15 ①).
--
-- 오너 요구 원문: "구성원초대에서 매장 업주가 구성원을 추가 후 직급이나 직함, 권한을 부여"
--
-- 지금 무엇이 문제였나
--   `venue_staff_invites` 에 권한을 담을 칸이 없어서, 업주는 **수락을 기다렸다가 따로** 권한을 줘야 했다.
--   그 사이가 위험 구간이다 — 직원은 들어왔는데 아무것도 못 하거나, 업주가 잊으면 영영 못 한다.
--
-- 🔴 같이 고치는 **fail-open 가드** (이게 이 파일에서 제일 중요하다)
--   `respond_staff_invite` 의 가드가 이랬다:
--       if v_user is null or v_user <> auth.uid() then raise exception ...
--   비로그인(`auth.uid()` = NULL)이고 초대 행이 존재하면:
--       false OR (v_user <> NULL) → false OR NULL → **NULL** → plpgsql 의 `if NULL then` 은 건너뛴다.
--   그대로 흘러가 `update venue_staff_invites set status='accepted'` 가 **실행된다.**
--   (2026-09-15 운영 트랜잭션 롤백으로 재현 확인했고, 고친 뒤 같은 시도가 막히는 것도 확인했다.)
--   → `IS DISTINCT FROM` 으로 교체. CLAUDE.md 보안 §2 가 요구하는 바로 그 형태다.
--
-- 🔴 초대자 권한 **재확인**
--   초대와 수락 사이에 초대자가 해임될 수 있다. 그때 권한이 부여되면 안 된다.
--   ⚠ 여기서 `can_manage_pos` 를 쓸 수 없다 — 그 함수는 `auth.uid()` 기준인데,
--     이 시점의 `auth.uid()` 는 **초대자가 아니라 수락자**다. 그래서 `invited_by` 로 인라인 EXISTS 를 쓴다.
--   확인에 실패해도 **수락 자체는 막지 않는다**(직원 소속은 유지) — 권한만 안 붙는다.
--   업주가 나중에 화면에서 줄 수 있고, 그쪽이 덜 파괴적이다.
--
-- 왜 `invite_staff_by_email` 의 시그니처를 안 건드렸나
--   파라미터를 더하면 **덮어쓰기가 아니라 오버로드**가 생겨 기존 2인자 호출이 "function is not unique" 로 깨진다.
--   피하려면 DROP + 재생성인데 그러면 **ACL 이 초기화된다**(CLAUDE.md 보안 §3 · 2026-09-12 실측).
--   → 시그니처를 건드리지 않고 `set_invite_grants` 를 따로 둔다. 화면은 초대 직후 이 RPC 를 한 번 더 부르면 된다.
--
-- 되돌리기: 칼럼 4개를 drop 하고 respond_staff_invite 를 옛 본문으로 되돌린다.
--   단 되돌리면 위 fail-open 이 함께 돌아온다 — 권장하지 않는다.

alter table public.venue_staff_invites
  add column if not exists grant_ledger   boolean not null default false,
  add column if not exists grant_voucher  boolean not null default false,
  add column if not exists grant_schedule boolean not null default false,
  add column if not exists staff_title    text;

comment on column public.venue_staff_invites.grant_ledger is
  '수락과 **같은 트랜잭션**에서 부여할 장부 권한(2026-09-15). 수락~부여 사이의 위험 구간을 없앤다.';

-- ── 업주가 초대 행의 권한을 정한다 ─────────────────────────────────────────
create or replace function public.set_invite_grants(
  p_invite_id uuid, p_ledger boolean, p_voucher boolean, p_schedule boolean, p_title text default null)
returns void language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_venue uuid;
begin
  select venue_id into v_venue from public.venue_staff_invites where id = p_invite_id and status = 'pending';
  if v_venue is null then raise exception '대기 중인 초대를 찾을 수 없습니다' using errcode = '22023'; end if;
  -- 권한을 정하는 것은 **업주만**. 위임받은 직원이 다시 나눠 주면 권한이 조용히 번진다.
  if can_manage_pos(v_venue) is distinct from true then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
  update public.venue_staff_invites
     set grant_ledger = coalesce(p_ledger, false), grant_voucher = coalesce(p_voucher, false),
         grant_schedule = coalesce(p_schedule, false),
         staff_title = nullif(left(btrim(coalesce(p_title, '')), 20), '')
   where id = p_invite_id;
end; $function$;

revoke execute on function public.set_invite_grants(uuid, boolean, boolean, boolean, text) from public, anon;
grant  execute on function public.set_invite_grants(uuid, boolean, boolean, boolean, text) to authenticated, service_role;

-- ── 수락 — 가드 교체 + 같은 트랜잭션에서 권한 부여 ────────────────────────
create or replace function public.respond_staff_invite(p_invite_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_venue uuid; v_user uuid; v_by uuid;
        v_gl boolean; v_gv boolean; v_gs boolean; v_title text; v_ok boolean;
begin
  select venue_id, user_id, invited_by, grant_ledger, grant_voucher, grant_schedule, staff_title
    into v_venue, v_user, v_by, v_gl, v_gv, v_gs, v_title
    from public.venue_staff_invites where id = p_invite_id and status = 'pending';
  -- ⚠ IS DISTINCT FROM — 옛 `<>` 는 비로그인에서 NULL 이 되어 if 를 통째로 건너뛰었다(위 헤더 참조).
  if v_user is null or v_user is distinct from auth.uid() then
    raise exception '초대를 찾을 수 없습니다';
  end if;

  if p_accept then
    update public.profiles set role = 'venue_staff', venue_id = v_venue, approved = true where id = auth.uid();
    if v_title is not null and btrim(v_title) <> '' then
      update public.profiles set staff_title = left(btrim(v_title), 20) where id = auth.uid();
    end if;
    -- 초대자가 지금도 권한자인가. can_manage_pos 는 auth.uid()(=수락자) 기준이라 여기선 못 쓴다.
    select exists (
      select 1 from public.profiles p where p.id = v_by and p.role = 'admin'
      union all
      select 1 from public.venues v where v.id = v_venue and v.owner_id = v_by
      union all
      select 1 from public.venue_owners vo
       where vo.venue_id = v_venue and vo.user_id = v_by and vo.status = 'approved'
    ) into v_ok;
    if coalesce(v_ok, false) then
      if v_gl then insert into public.ledger_access(venue_id, user_id)   values (v_venue, v_user) on conflict do nothing; end if;
      if v_gv then insert into public.voucher_access(venue_id, user_id)  values (v_venue, v_user) on conflict do nothing; end if;
      if v_gs then insert into public.schedule_access(venue_id, user_id) values (v_venue, v_user) on conflict do nothing; end if;
    end if;
    update public.venue_staff_invites set status = 'accepted' where id = p_invite_id;
  else
    update public.venue_staff_invites set status = 'declined' where id = p_invite_id;
  end if;
end; $function$;

-- ── 자가검사 ────────────────────────────────────────────────────────────────
do $$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'respond_staff_invite';
  if def !~ 'v_user\s+is\s+distinct\s+from\s+auth\.uid\(\)' then
    raise exception '자가검사 실패: fail-open 가드가 아직 남아 있다';
  end if;
  if has_function_privilege('anon', 'public.set_invite_grants(uuid,boolean,boolean,boolean,text)', 'execute') then
    raise exception '자가검사 실패: anon 이 set_invite_grants 를 실행할 수 있다';
  end if;
  if not has_function_privilege('authenticated', 'public.set_invite_grants(uuid,boolean,boolean,boolean,text)', 'execute') then
    raise exception '자가검사 실패(양성 대조): authenticated 가 실행할 수 없다';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'venue_staff_invites'
         and column_name in ('grant_ledger','grant_voucher','grant_schedule','staff_title')) <> 4 then
    raise exception '자가검사 실패: 초대 권한 칼럼 4개가 다 생기지 않았다';
  end if;
  raise notice '✅ 20260915j 자가검사 통과 — fail-open 제거 · 칼럼 4개 · anon 차단';
end $$;
