-- 20260915g — 직원에게 **스케줄 편성**을 위임할 수 있게 한다 (오너 지시 2026-09-15 ②).
--
-- 오너 요구 원문: "장부만 볼 수 있거나 정산까지 볼 수 있거나 **직원들 스케쥴을 짤 수 있어야**"
--
-- 지금 무엇이 문제인가 (2026-09-15 라이브 실측)
--   `staff_schedule` 의 쓰기 정책 4개가 전부 `can_manage_pos(venue_id)` 로 **업주에 고정**돼 있다.
--     staff_sched_select / insert / update / delete  → can_manage_pos
--   즉 **매니저에게 스케줄 편성을 맡길 경로가 서버에 아예 없다.** 화면에서 버튼을 열어 줘 봐야
--   서버가 0행으로 거절한다(PostgREST 는 RLS 거절을 200+0행으로 돌려주므로 조용히 실패한다 — nuri-affect).
--
-- 무엇을 하는가 — **기존 권한 축을 건드리지 않고 더한다**
--   `can_access_ledger` 를 참조하는 객체가 **40개**(정책 28 + 함수 12), `can_manage_pos` 는 **71개**다(실측).
--   그 축을 재설계하면 40곳을 다시 써야 하고, 그 과정이 바로 2026-09-15 에 닫은 권한 구멍이 생긴 자리다.
--   → `ledger_access` 가 이미 쓰는 **"테이블에 행이 있으면 허용"** 모양을 그대로 복제한다.
--     기존 정책·함수는 **한 줄도 바뀌지 않는다.** 바뀌는 것은 staff_schedule 정책 4개뿐이다.
--
-- 안전한 이유 — **데이터가 0건이다** (2026-09-15 실측)
--   staff_schedule 0행 · staff_wage 0행 · ledger_access 0행 · venue_staff 0행 ·
--   venue_staff_invites 0행 · profiles(role='venue_staff') 0명.
--   따라서 이 파일은 **아무의 권한도 바꾸지 않는다.** schedule_access 가 비어 있는 동안
--   `can_manage_schedule(v)` ≡ `can_manage_pos(v)` 라 종전과 **정확히 같다**(자가검사가 이걸 증명한다).
--
-- 되돌리기
--   alter policy 4개를 can_manage_pos 로 되돌리고 schedule_access 를 drop 하면 완전히 원복된다.
--   행이 없으므로 잃는 데이터도 없다.

-- ── 1) 권한 테이블 — ledger_access 와 같은 모양 ─────────────────────────────
create table if not exists public.schedule_access (
  venue_id uuid not null references public.venues(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  primary key (venue_id, user_id)
);

alter table public.schedule_access enable row level security;

comment on table public.schedule_access is
  '매장별 **스케줄 편성** 위임(2026-09-15). ledger_access 와 같은 모양이다 — 행이 있으면 허용. '
  '업주/공동사장/관리자는 이 표와 무관하게 can_manage_pos 로 이미 통과한다.';

-- 본인 행과 업주는 볼 수 있다(장부 권한 화면이 ledger_access 에 쓰는 규칙과 동일).
drop policy if exists sa_select on public.schedule_access;
create policy sa_select on public.schedule_access
  for select using (can_manage_pos(venue_id) or user_id = (select auth.uid()));

-- 쓰기는 RPC 로만 한다(아래). 직접 INSERT/UPDATE/DELETE 정책을 두지 않아
-- 클라이언트가 PostgREST 로 자기 권한을 만들 수 없다.

-- ── 2) 판정 함수 ────────────────────────────────────────────────────────────
create or replace function public.can_manage_schedule(p_venue_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $function$
  select can_manage_pos(p_venue_id)
      or exists (select 1 from public.schedule_access sa
                  where sa.venue_id = p_venue_id and sa.user_id = auth.uid());
$function$;

comment on function public.can_manage_schedule(uuid) is
  '스케줄 편성 권한 — 업주(can_manage_pos) 또는 schedule_access 보유자. 2026-09-15 신설.';

revoke execute on function public.can_manage_schedule(uuid) from public, anon;
grant  execute on function public.can_manage_schedule(uuid) to authenticated, service_role;

-- ── 3) 부여·회수·조회 RPC — grant_ledger_access 와 같은 계약 ────────────────
create or replace function public.grant_schedule_access(p_venue_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $function$
begin
  -- ⚠ 부여 권한은 **업주만** 이다. 스케줄 편성 권한자가 다른 사람에게 다시 나눠 주면
  --   권한이 조용히 번진다(권한 상승). 그래서 can_manage_schedule 이 아니라 can_manage_pos 로 잠근다.
  if can_manage_pos(p_venue_id) is distinct from true then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
  if p_venue_id is null or p_user_id is null then
    raise exception '매장 또는 대상이 지정되지 않았습니다' using errcode = '22023';
  end if;
  insert into public.schedule_access (venue_id, user_id) values (p_venue_id, p_user_id)
  on conflict do nothing;
end; $function$;

create or replace function public.revoke_schedule_access(p_venue_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $function$
begin
  if can_manage_pos(p_venue_id) is distinct from true then
    raise exception '권한이 없습니다' using errcode = '42501';
  end if;
  delete from public.schedule_access where venue_id = p_venue_id and user_id = p_user_id;
end; $function$;

create or replace function public.get_schedule_access_user_ids(p_venue_id uuid)
returns table(user_id uuid) language plpgsql stable security definer set search_path = public, pg_temp
as $function$
begin
  if p_venue_id is null then
    raise exception '매장이 지정되지 않았습니다' using errcode = '22023';
  end if;
  -- ⚠ 20260915a 의 교훈: 인가를 WHERE 절로 하면 비인가 호출자가 **200 + 0행**을 받아
  --   "아무도 권한이 없음" 으로 위장된다. 그래서 42501 로 **명시적으로 거절**한다.
  if can_manage_pos(p_venue_id) is distinct from true then
    raise exception '권한 없음' using errcode = '42501';
  end if;
  return query
    select sa.user_id from public.schedule_access sa
     where sa.venue_id = p_venue_id order by sa.user_id;
end; $function$;

revoke execute on function public.grant_schedule_access(uuid, uuid)     from public, anon;
revoke execute on function public.revoke_schedule_access(uuid, uuid)    from public, anon;
revoke execute on function public.get_schedule_access_user_ids(uuid)    from public, anon;
grant  execute on function public.grant_schedule_access(uuid, uuid)     to authenticated, service_role;
grant  execute on function public.revoke_schedule_access(uuid, uuid)    to authenticated, service_role;
grant  execute on function public.get_schedule_access_user_ids(uuid)    to authenticated, service_role;

-- ── 4) staff_schedule 정책을 새 축으로 ──────────────────────────────────────
-- ⚠ `alter policy` 를 쓴다(drop+create 아님) — 정책을 지웠다 만드는 사이에 **잠깐 열리는 창**이 없다.
-- ⚠ staff_sched_self_select(본인 행 조회)는 **건드리지 않는다.** 이미 올바르게 짜여 있고
--   (is_my_shift_row: 행 주인 우선 · 동명이인 2명 이상이면 아무도 통과 못 함) 오너 요구 ④의 절반이다.
alter policy staff_sched_select on public.staff_schedule using (can_manage_schedule(venue_id));
alter policy staff_sched_insert on public.staff_schedule with check (can_manage_schedule(venue_id));
alter policy staff_sched_update on public.staff_schedule
  using (can_manage_schedule(venue_id)) with check (can_manage_schedule(venue_id));
alter policy staff_sched_delete on public.staff_schedule using (can_manage_schedule(venue_id));

-- ── 자가검사 ────────────────────────────────────────────────────────────────
-- 실패하면 트랜잭션이 죽는다. **양성 대조**(통과해야 하는 것)까지 넣는다 —
-- 음성만 검사하면 "아무것도 안 만들어졌는데 통과" 가 가능하다(nuri-verify 의 빈 검사 문제).
do $$
declare
  n_pol int;
  anon_can boolean;
  auth_can boolean;
  n_rows int;
begin
  -- (a) 정책 4개가 전부 새 축을 쓰는가
  select count(*) into n_pol from pg_policies
   where schemaname='public' and tablename='staff_schedule'
     and policyname in ('staff_sched_select','staff_sched_insert','staff_sched_update','staff_sched_delete')
     and coalesce(qual,'')||' '||coalesce(with_check,'') like '%can_manage_schedule%';
  if n_pol <> 4 then
    raise exception '자가검사 실패: staff_schedule 정책 중 %개만 can_manage_schedule 을 쓴다(4개여야 함)', n_pol;
  end if;

  -- (b) 본인 행 조회 정책은 **그대로 살아 있어야** 한다(기능 보존 — CLAUDE.md 3번)
  if not exists (select 1 from pg_policies where schemaname='public'
                  and tablename='staff_schedule' and policyname='staff_sched_self_select') then
    raise exception '자가검사 실패: staff_sched_self_select 가 사라졌다 — 직원이 본인 스케줄을 못 본다';
  end if;

  -- (c) 권한: anon 은 못 부르고 authenticated 는 불러야 한다(양성 대조 포함)
  anon_can := has_function_privilege('anon', 'public.grant_schedule_access(uuid,uuid)', 'execute');
  auth_can := has_function_privilege('authenticated', 'public.grant_schedule_access(uuid,uuid)', 'execute');
  if anon_can then raise exception '자가검사 실패: anon 이 grant_schedule_access 를 실행할 수 있다'; end if;
  if not auth_can then raise exception '자가검사 실패(양성 대조): authenticated 가 실행할 수 없다'; end if;

  -- (d) 이 파일은 **아무의 권한도 바꾸지 않아야** 한다 — schedule_access 가 비어 있으므로
  --     can_manage_schedule ≡ can_manage_pos 다. 행이 생겼다면 이 파일이 의도 밖의 일을 한 것이다.
  select count(*) into n_rows from public.schedule_access;
  if n_rows <> 0 then
    raise exception '자가검사 실패: schedule_access 에 %행이 있다 — 이 마이그레이션은 행을 만들지 않는다', n_rows;
  end if;

  raise notice '✅ 20260915g 자가검사 통과 — 정책 4/4 · 본인조회 보존 · anon 차단 · authenticated 허용 · 신규행 0';
end $$;
