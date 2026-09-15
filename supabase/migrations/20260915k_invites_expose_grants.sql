-- 20260915k — 대기 중 초대 목록에 **부여 예정 권한·직함**을 같이 내려준다.
--
-- 왜 필요한가
--   `20260915j` 가 `venue_staff_invites` 에 `grant_ledger/voucher/schedule`·`staff_title` 을 더했지만,
--   목록 RPC 가 그 값을 안 내려주면 화면이 **지금 무엇이 켜져 있는지 그릴 수 없다.**
--   그러면 업주가 껐는지 켰는지 모른 채 누르게 되고, 그건 2026-09-13 P02("모른다"와 "없다"를 화면이
--   갈라 말해야 한다)에서 이미 한 번 데인 부류다.
--
-- 🔴 이 파일은 **반환 타입을 바꾼다 → `CREATE OR REPLACE` 가 거부한다 → `DROP` + 재생성이다.**
--   그리고 `DROP` 은 **ACL 을 초기화한다**(CLAUDE.md 보안 §3 · 2026-09-12 격리 컨테이너 실측).
--   → 원래 ACL 을 **정확히 그대로** 복원한다. 적용 전 실측한 원래 값:
--       anon = X · authenticated = X · service_role = X   (PUBLIC 없음)
--   anon 을 남겨 두는 것이 이상해 보일 수 있으나 **이번 변경에서 건드리지 않는다** — 순수 추가여야
--   영향 반경을 판정할 수 있다. (본문이 `can_manage_pos` 로 잠그므로 anon 은 어차피 0행이다.
--   정리하고 싶으면 **별건으로** 하고, 그때 부팅 경로에서 이 RPC 를 비로그인으로 부르는 곳이
--   없는지부터 확인해라 — 지금은 0행이지만 그때는 42501 이 된다.)
--
-- 되돌리기: 아래 새 컬럼 4개를 select 목록과 returns 에서 빼고 같은 절차(DROP + 재생성 + ACL 복원)로.

drop function if exists public.get_my_venue_invites(uuid);

create function public.get_my_venue_invites(p_venue_id uuid default null)
returns table(id uuid, user_id uuid, email text, nickname text, name text, created_at timestamptz,
              grant_ledger boolean, grant_voucher boolean, grant_schedule boolean, staff_title text)
language sql stable security definer set search_path = public, pg_temp
as $function$
  select i.id, i.user_id, p.email, p.nickname, p.name, i.created_at,
         i.grant_ledger, i.grant_voucher, i.grant_schedule, i.staff_title
  from venue_staff_invites i
  join profiles p on p.id = i.user_id
  where i.status = 'pending'
    and i.venue_id = coalesce(p_venue_id, (select v.id from venues v where v.owner_id = auth.uid() order by v.id limit 1))
    and can_manage_pos(i.venue_id)
  order by i.created_at desc;
$function$;

-- ⚠ DROP 이 ACL 을 날렸다. **원래와 똑같이** 되돌린다(위 헤더의 실측값).
revoke execute on function public.get_my_venue_invites(uuid) from public;
grant  execute on function public.get_my_venue_invites(uuid) to anon, authenticated, service_role;

-- ── 자가검사 ────────────────────────────────────────────────────────────────
-- ⚠ `information_schema.parameters` 로 반환 컬럼을 세려다 0 이 나와 거짓 실패를 한 번 겪었다.
--   `pg_get_function_result` 가 짧고 확실하다.
do $$
declare ret text; a boolean; b boolean; c boolean;
begin
  select pg_get_function_result(p.oid) into ret
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'get_my_venue_invites';
  if ret !~ 'grant_ledger' or ret !~ 'grant_voucher' or ret !~ 'grant_schedule' or ret !~ 'staff_title' then
    raise exception '자가검사 실패: 반환에 새 컬럼이 없다 — [%]', ret;
  end if;

  -- ACL 복원 — 셋 다 참이어야 한다(양성 대조). 하나라도 빠지면 화면이 조용히 죽는다.
  a := has_function_privilege('anon', 'public.get_my_venue_invites(uuid)', 'execute');
  b := has_function_privilege('authenticated', 'public.get_my_venue_invites(uuid)', 'execute');
  c := has_function_privilege('service_role', 'public.get_my_venue_invites(uuid)', 'execute');
  if not (a and b and c) then
    raise exception '자가검사 실패: ACL 미복원 anon=% authenticated=% service_role=%', a, b, c;
  end if;

  raise notice '✅ 20260915k 자가검사 통과 — 반환 컬럼 확장 · ACL 3롤 복원';
end $$;
