-- 20260915h — 직원이 **본인 인건비**를 볼 수 있게 한다 (오너 지시 2026-09-15 ④).
--
-- 오너 요구 원문: "일반 직원들의 경우 본인의 스케쥴을 볼 수 있는 메뉴와 **본인 인건비**, 출퇴근을 볼 수 있어야"
--
-- 셋 중 둘은 이미 돼 있었다 (2026-09-15 실측)
--   · 본인 **출퇴근** — `set_my_shift_time` 이 2칼럼만 허용·정규식 검증·0행 예외. 잘 돼 있다.
--   · 본인 **스케줄** — 정책 `staff_sched_self_select` = `is_my_shift_row(...)`. 잘 돼 있다.
--   · 본인 **인건비** — 🔴 **경로가 아예 없었다.** staff_wage 의 정책 4개가 전부 can_manage_pos 다.
--
-- 왜 정책이 아니라 RPC 인가 — **memo 때문이다**
--   `staff_wage` 는 (venue_id, staff_name, hourly_wage, payday, weekly_off, **memo**, updated_at) 다.
--   본인 행 SELECT 를 정책으로 열면 **memo 까지 같이 열린다.** memo 는 업주가 그 직원에 대해 적어 두는
--   메모다 — 근태 평가나 인사 기록이 들어갈 수 있는 칸이다. 그게 당사자에게 보이면 안 된다.
--   CLAUDE.md 보안 §6("공개 RPC 는 필요한 컬럼만 select") 에 따라 **필요한 3칼럼만** 돌려주는 RPC 로 연다.
--
-- 본인 판정은 **새로 만들지 않고 `is_my_shift_row` 를 재사용**한다
--   이미 어려운 부분을 정확히 풀어 둔 함수가 있다:
--     1순위 행에 적힌 주인(user_id) · 2순위 이름 매칭 · **같은 이름이 2명 이상이면 아무도 통과 못 함**.
--   같은 판정을 두 번 구현하면 두 판정이 언젠가 어긋난다(그 자체가 버그다).
--
-- user_id 칼럼을 더한다 — **지금이 공짜다**
--   staff_wage 는 **0행**이다(2026-09-15 실측). 백필도, 동명이인 충돌도 없다.
--   행이 쌓인 뒤에 더하면 "이 줄이 누구 것인가" 를 사람이 일일이 정해야 한다.
--   기존 쓰기 정책(can_manage_pos)이 그대로 UPDATE 를 허용하므로 **업주가 화면에서 연결**할 수 있고,
--   연결 전에는 이름 매칭(2순위)이 받아 준다 — 어느 쪽이든 동작한다.
--
-- 되돌리기: RPC 를 drop 하고 칼럼을 drop 하면 원복된다(0행이라 잃는 데이터 없음).

-- ── 1) 주인 칼럼 ────────────────────────────────────────────────────────────
alter table public.staff_wage
  add column if not exists user_id uuid references public.profiles(id) on delete set null;

comment on column public.staff_wage.user_id is
  '이 급여 줄의 주인(2026-09-15). 비어 있으면 staff_name 으로 매칭한다 — 단 동명이인이면 아무도 통과 못 한다. '
  'on delete set null: 계정이 지워져도 **급여 기록 자체는 남는다**(정산 이력이라 지우면 안 된다).';

-- 조회가 본인 행 하나를 집는 경로다. 0행이라 지금 만드는 것이 가장 싸다.
create index if not exists staff_wage_user_idx on public.staff_wage (venue_id, user_id);

-- ── 2) 본인 인건비 조회 RPC — memo 는 **돌려주지 않는다** ────────────────────
create or replace function public.my_staff_wage(p_venue_id uuid)
returns table(hourly_wage integer, payday integer, weekly_off text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp
as $function$
begin
  if p_venue_id is null then
    raise exception '매장이 지정되지 않았습니다' using errcode = '22023';
  end if;
  -- ⚠ 여기서 **일부러 42501 을 던지지 않는다.** 남의 매장을 물어본 사람에게 "권한 없음" 을 주면
  --   그 자체가 "그 매장에 당신 급여 줄이 있다/없다" 를 알려 주는 신호가 된다.
  --   본인 행이 없으면 그냥 **0행**이다 — 있음/없음이 구분되지 않는다.
  return query
    select w.hourly_wage, w.payday, w.weekly_off, w.updated_at
      from public.staff_wage w
     where w.venue_id = p_venue_id
       and public.is_my_shift_row(w.venue_id, w.staff_name, w.user_id)
     limit 1;   -- 판정상 2행이 나올 수 없지만, 나온다면 그건 결함이므로 화면에 여러 줄을 흘리지 않는다
end; $function$;

comment on function public.my_staff_wage(uuid) is
  '로그인한 직원 **본인**의 인건비(2026-09-15 오너 지시). memo 는 의도적으로 제외한다 — 업주의 인사 메모다. '
  '본인 판정은 is_my_shift_row 재사용(행 주인 우선 · 동명이인이면 통과 없음). 없으면 0행.';

revoke execute on function public.my_staff_wage(uuid) from public, anon;
grant  execute on function public.my_staff_wage(uuid) to authenticated, service_role;

-- ── 자가검사 ────────────────────────────────────────────────────────────────
do $$
declare
  has_col boolean;
  n_out int;
  anon_can boolean;
  auth_can boolean;
  n_pol int;
begin
  -- (a) 칼럼이 생겼는가
  select exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='staff_wage' and column_name='user_id')
    into has_col;
  if not has_col then raise exception '자가검사 실패: staff_wage.user_id 가 없다'; end if;

  -- (b) 반환 칼럼에 memo 가 **없어야** 한다. 이게 이 파일의 핵심 주장이다.
  select count(*) into n_out from information_schema.parameters
   where specific_schema='public'
     and specific_name = (select p.proname||'_'||p.oid from pg_proc p
                           join pg_namespace n on n.oid=p.pronamespace
                          where n.nspname='public' and p.proname='my_staff_wage')
     and parameter_mode='TABLE' and parameter_name='memo';
  if n_out <> 0 then raise exception '자가검사 실패: my_staff_wage 가 memo 를 돌려준다'; end if;

  -- (c) 업주 전용 정책 4개가 **그대로 살아 있어야** 한다 — 이 파일은 정책을 넓히지 않는다.
  select count(*) into n_pol from pg_policies
   where schemaname='public' and tablename='staff_wage'
     and coalesce(qual,'')||' '||coalesce(with_check,'') like '%can_manage_pos%';
  if n_pol <> 4 then
    raise exception '자가검사 실패: staff_wage 의 can_manage_pos 정책이 %개다(4개여야 함) — 정책이 바뀌었다', n_pol;
  end if;

  -- (d) 권한 — 음성 + 양성 대조
  anon_can := has_function_privilege('anon', 'public.my_staff_wage(uuid)', 'execute');
  auth_can := has_function_privilege('authenticated', 'public.my_staff_wage(uuid)', 'execute');
  if anon_can then raise exception '자가검사 실패: anon 이 my_staff_wage 를 실행할 수 있다'; end if;
  if not auth_can then raise exception '자가검사 실패(양성 대조): authenticated 가 실행할 수 없다'; end if;

  raise notice '✅ 20260915h 자가검사 통과 — user_id 추가 · memo 미반환 · 업주정책 4/4 보존 · anon 차단';
end $$;
