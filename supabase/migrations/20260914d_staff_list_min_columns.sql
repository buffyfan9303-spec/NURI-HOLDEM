-- 20260914d — get_my_venue_staff 가 직원 profiles 전 컬럼을 내려주던 것 (S2, 보안 표준 §6)
--
-- 적용 전 실측(2026-09-14, 라이브): PostgreSQL 17.6 · get_my_venue_staff(uuid) 단일 오버로드 ·
--   RETURNS SETOF profiles · ACL {postgres, anon, authenticated, service_role} — **anon 이 들어 있다** ·
--   profiles.role='venue_staff' 0행(피해자 0, 첫 직원을 들이는 순간 터지는 잠복 결함).
--
-- 무엇이 문제였나
--   업주에게 직원의 ci_hash·real_name·phone·birth_date·gender·carrier·verified_at·이메일·동의/제재 이력까지
--   전 컬럼이 나갔다. 화면(VenueManageTab StaffManager · NuriPosLedger · StaffSchedule · StaffPayroll)이
--   실제로 그리는 것은 id·name·nickname·email·avatar_color·staff_title 여섯뿐이다(2026-09-14 전수 확인 —
--   인증 배지·실명·전화는 직원 목록 어디에도 안 그린다). 그 여섯만 내려준다.
--
-- ⚠ 반환 타입 변경 = DROP + 재생성 = **ACL 초기화**(CLAUDE.md §3 실측). 아래에서 REVOKE/GRANT 를 다시 쓴다.
--   anon 은 이번에 뺀다(변이는 아니지만 세션 없는 호출이 성립할 이유가 없다 — auth.uid() 가 NULL 이면 어차피 0행).
-- ⚠ 클라이언트 짝: src/api/auth.ts 의 getMyVenueStaff 가 rowToUser 대신 staffRowToUser 를 쓴다(같은 커밋).
--   rowToUser 를 그대로 두면 verified(!!ci_hash) 가 조용히 false 로 그려진다 — 직원 화면은 그 필드를 안 쓰지만
--   타입상 '미인증' 이 아니라 '모름(undefined)' 이어야 맞다.
--
-- 게이트·정렬·매장 폴백(p_venue_id 생략 → 내가 소유한 첫 매장)은 라이브 본문 그대로다. 바뀐 것은 SELECT 목록뿐.
-- 롤백: 라이브 이전 정의는 supabase/baseline/2026-07-20-live-snapshot.sql 의 get_my_venue_staff.

drop function if exists public.get_my_venue_staff(uuid);

create function public.get_my_venue_staff(p_venue_id uuid default null)
returns table(id uuid, name text, nickname text, email text, avatar_color text, staff_title text)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select s.id, s.name, s.nickname, s.email, s.avatar_color, s.staff_title
  from public.profiles s
  where s.role = 'venue_staff'
    and s.venue_id = coalesce(p_venue_id, (select v.id from public.venues v where v.owner_id = auth.uid() order by v.id limit 1))
    and public.can_manage_pos(coalesce(p_venue_id, (select v.id from public.venues v where v.owner_id = auth.uid() order by v.id limit 1)))
  order by s.approved asc, s.joined_at desc;
$fn$;

revoke all on function public.get_my_venue_staff(uuid) from public, anon;
grant execute on function public.get_my_venue_staff(uuid) to authenticated, service_role;

-- 반환 타입이 바뀌었다 — PostgREST 스키마 캐시를 갱신하지 않으면 옛 형태로 응답하거나 404 가 난다.
notify pgrst, 'reload schema';

-- ── 자가검사 — 어긋나면 트랜잭션 전체 롤백 ─────────────────────────────────────
do $chk$
declare
  v_oid  oid := to_regprocedure('public.get_my_venue_staff(uuid)');
  v_res  text;
  v_cfg  text[];
  n      int;
begin
  if v_oid is null then raise exception 'ABORT: get_my_venue_staff(uuid) 가 없다'; end if;
  if (select count(*) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'public' and p.proname = 'get_my_venue_staff') <> 1 then
    raise exception 'ABORT: get_my_venue_staff 오버로드가 1개가 아니다';
  end if;

  -- 반환 형태: profiles 행이 아니어야 하고, 민감 컬럼 이름이 결과 목록에 없어야 한다
  if (select prorettype from pg_proc where oid = v_oid) = 'public.profiles'::regtype::oid then
    raise exception 'ABORT: 여전히 SETOF profiles 다';
  end if;
  v_res := pg_get_function_result(v_oid);
  if v_res !~ '^TABLE\(' then raise exception 'ABORT: RETURNS TABLE 이 아니다: %', v_res; end if;
  if v_res ~* '(ci_hash|real_name|phone|birth_date|gender|carrier|verified_at|status|sanction|agreed|consent)' then
    raise exception 'ABORT: 결과에 민감 컬럼이 있다: %', v_res;
  end if;

  -- SECURITY DEFINER + search_path 고정
  if not (select prosecdef from pg_proc where oid = v_oid) then raise exception 'ABORT: security definer 가 아니다'; end if;
  select proconfig into v_cfg from pg_proc where oid = v_oid;
  if not exists (select 1 from unnest(v_cfg) c where c like 'search_path=%' and c like '%pg_temp%') then
    raise exception 'ABORT: search_path 에 pg_temp 가 없다: %', v_cfg;
  end if;

  -- ACL: DROP 으로 초기화된 뒤 다시 닫혔는가
  -- anon 은 PUBLIC 의 GRANT 를 상속하므로 anon=false 이면 PUBLIC 도 닫힌 것이다
  if has_function_privilege('anon', v_oid, 'execute') then raise exception 'ABORT: anon 이 실행할 수 있다'; end if;
  if not has_function_privilege('authenticated', v_oid, 'execute') then raise exception 'ABORT: authenticated 에 닫혀 있다 — 직원 화면이 죽는다'; end if;

  -- 본문이 실제로 실행되는가(세션 없음 → can_manage_pos false → 0행, 오류 없이)
  select count(*) into n from public.get_my_venue_staff(null);
  if n <> 0 then raise exception 'ABORT: 세션 없는 호출이 %행을 돌려준다', n; end if;

  raise notice '[자가검사] 통과 — %', v_res;
end
$chk$;
