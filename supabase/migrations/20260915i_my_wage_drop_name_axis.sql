-- 20260915i — 본인 인건비 조회에서 **이름 축을 끊는다**. 같은 날 20260915h 를 스스로 정정하는 파일이다.
--
-- 🔴 왜 정정하나 — `20260915h` 가 적은 근거가 **실측으로 반증됐다**
--   h 는 "staff_name 으로 이으면 동명이인에서 깨지니 is_my_shift_row 의 동명이인 가드를 재사용한다" 고 적었다.
--   그런데 라이브에 이런 인덱스가 있다:
--     profiles_name_lower_uidx  UNIQUE (lower(btrim(name)))  WHERE name is not null and btrim(name) <> ''
--   **전역** UNIQUE 다(매장별이 아니다). 실측 중복 0건. 즉 **동명이인은 애초에 존재할 수 없고**,
--   `is_my_shift_row` 의 "같은 이름이 2명 이상이면 아무도 통과 못 함" 가드는 급여에서 **항상 참인 빈 가드**였다.
--
-- 그래서 무슨 일이 실제로 일어나는가 (2026-09-15 운영 트랜잭션 롤백으로 실측)
--   `staff_wage.staff_name` 은 업주가 타이핑하는 **자유 텍스트**다(`src/api/staffSchedule.ts` 의 addStaffName 이
--   `name.trim()` 을 그대로 upsert 한다). profiles 와 아무 관계가 없다.
--   그런데 profiles.name 이 전역 유일하므로, 그 문자열은 **전 세계에서 정확히 한 사람**으로 해석된다.
--   측정 결과:
--     [음성대조] 현행(이름 축) 결과 = 1행, 금액 = 99000   ← user_id 가 **비어 있는** 줄이 새어 나왔다
--     [적용 후]  이름만같은미연결 = 0행 · 연결된줄 = 1행   ← 닫혔고, 정상 경로는 살아 있다
--   업주가 직원 이름을 적어 넣기만 해도, 연결하지 않은 채로 그 이름의 가입자가 시급·급여일을 읽는다.
--
-- 무엇을 하나
--   `my_staff_wage` 가 **user_id 로 명시 연결된 줄만** 돌려주게 한다. 이름 매칭을 완전히 버린다.
--   돈과 개인정보다 — 문자열 우연이 아니라 **업주가 고른 연결**만 인정한다.
--
-- 대가 (알고 받아들인다)
--   업주가 급여 줄만 만들고 직원을 연결하지 않으면 그 직원은 **아무것도 못 본다.**
--   급여에서는 그게 맞다 — 빈 화면이 남의 금액보다 낫다. 화면에 '직원 연결' 경로를 붙여야 한다(§3 참조).
--   선례가 이미 있다: `assignShift`(src/api/staffSchedule.ts)가 스케줄에서 같은 일을 한다(staffUserId 전달).
--
-- ⚠ `is_my_shift_row` 자체는 **건드리지 않는다.** 스케줄(staff_sched_self_select)이 그 함수를 쓰고,
--   스케줄은 금액이 아니라서 이름 폴백의 값이 다르다. 여기서 같이 바꾸면 영향 반경이 흐려진다.
--
-- 되돌리기: h 의 본문(is_my_shift_row 사용)으로 되돌리면 된다. 단 위 유출이 함께 돌아온다.

-- 한 매장에서 한 사람이 급여 줄을 둘 가질 수 없게 한다(부분 유니크 — user_id 가 빈 줄끼리는 자유).
create unique index if not exists staff_wage_venue_user_uidx
  on public.staff_wage (venue_id, user_id) where user_id is not null;

create or replace function public.my_staff_wage(p_venue_id uuid)
returns table(hourly_wage integer, payday integer, weekly_off text, updated_at timestamptz)
language sql stable security definer set search_path = public, pg_temp
as $function$
  -- 오직 **명시적으로 연결된 줄**만. 이름 매칭은 쓰지 않는다(위 헤더의 실측 근거).
  -- 비로그인이면 auth.uid() 가 NULL → `= NULL` 은 NULL → 0행(fail-closed).
  --   이 자리는 `IS DISTINCT FROM` 이 필요 없다 — NULL 이 '통과'가 아니라 '0행'으로 떨어진다.
  -- memo 는 돌려주지 않는다: 업주가 직원에 대해 적는 인사 메모다.
  --   컬럼 GRANT 로는 못 가린다 — 업주도 직원도 똑같이 `authenticated` 롤이라 권한이 둘을 구분하지 못한다.
  --   그래서 정책이 아니라 RPC 여야 한다.
  select w.hourly_wage, w.payday, w.weekly_off, w.updated_at
    from public.staff_wage w
   where w.venue_id = p_venue_id
     and w.user_id is not null
     and w.user_id = auth.uid();
$function$;

comment on function public.my_staff_wage(uuid) is
  '로그인한 직원 본인의 인건비. user_id 로 명시 연결된 줄만 — 이름 매칭 안 씀'
  '(2026-09-15 정정: profiles.name 이 전역 UNIQUE 라 이름 축이 타인 노출로 이어졌다). memo 는 반환하지 않는다.';

revoke execute on function public.my_staff_wage(uuid) from public, anon;
grant  execute on function public.my_staff_wage(uuid) to authenticated, service_role;

-- ── 자가검사 ────────────────────────────────────────────────────────────────
do $$
declare n int; def text; anon_can boolean; auth_can boolean;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'my_staff_wage';

  -- ⚠ 판정기가 **자기 설명문**에 걸리지 않게 호출 형태(여는 괄호까지)로 본다.
  --   2026-09-15 에 같은 실수를 세 번 했다: Tailwind 가 주석의 클래스명을 읽어 죽은 CSS 를 만든 것 ·
  --   계약 테스트 주석이 같은 짓을 한 것 · 그리고 이 자가검사의 첫 판(주석의 함수 이름에 걸려 거짓 실패).
  if def ~ 'is_my_shift_row\s*\(' then
    raise exception '자가검사 실패: my_staff_wage 가 아직 이름 축을 **호출**한다';
  end if;
  if def !~ 'w\.user_id\s*=\s*auth\.uid\(\)' then
    raise exception '자가검사 실패(양성 대조): user_id 매칭이 본문에 없다 — 빈 검사가 될 뻔했다';
  end if;

  select count(*) into n from information_schema.parameters
   where specific_schema = 'public'
     and specific_name = (select p.proname || '_' || p.oid from pg_proc p
                           join pg_namespace ns on ns.oid = p.pronamespace
                          where ns.nspname = 'public' and p.proname = 'my_staff_wage')
     and parameter_mode = 'TABLE' and parameter_name = 'memo';
  if n <> 0 then raise exception '자가검사 실패: my_staff_wage 가 memo 를 돌려준다'; end if;

  anon_can := has_function_privilege('anon', 'public.my_staff_wage(uuid)', 'execute');
  auth_can := has_function_privilege('authenticated', 'public.my_staff_wage(uuid)', 'execute');
  if anon_can then raise exception '자가검사 실패: anon 이 실행할 수 있다'; end if;
  if not auth_can then raise exception '자가검사 실패(양성 대조): authenticated 가 실행할 수 없다'; end if;

  if not exists (select 1 from pg_indexes where schemaname = 'public'
                  and indexname = 'staff_wage_venue_user_uidx') then
    raise exception '자가검사 실패: (venue_id,user_id) 부분 유니크 인덱스가 없다';
  end if;

  raise notice '✅ 20260915i 자가검사 통과 — 이름 축 제거 · user_id 매칭 존재 · memo 미반환 · anon 차단';
end $$;
