-- 🔴 업주가 자기 매장의 '특권 컬럼'을 직접 덮어쓸 수 있었다.
--
-- venues UPDATE 정책은 '내 매장이면 통과'만 본다. guard_venue_verification 은 verification_status
-- 하나만 지켰고 나머지는 무방비였다 — 업주 세션 토큰만 있으면 REST 한 줄로
--   voucher_quota(유료 이용권 한도) · is_paid_ad(유료 광고) · approved(승인 여부) · status(제재)
--   owner_id(소유권 이전) · slug(주소 선점) · display_order(노출 순서)
-- 를 스스로 바꿀 수 있었다. 화면에 그 UI 가 없다는 건 방어가 아니다.
--
-- 왜 이 패턴인가: guard_profile_privileged_cols 와 동일하게 current_user in ('authenticated','anon')
--   로 게이트한다. 관리자 RPC 는 SECURITY DEFINER 라 owner(postgres) 로 돌아 이 조건에 안 걸리고,
--   admin 역할도 my_role() 로 통과한다. 즉 정상 관리 경로는 그대로 살아 있다.
-- ⚠ 이 함수에 SECURITY DEFINER 를 붙이면 안 된다 — 붙이면 current_user 가 함수 소유자로 바뀌어
--   게이트가 통째로 무력해진다(guard_profile_privileged_cols 가 DEFINER 없이 도는 이유가 이것이다).
--
-- 적용 후 별도 트랜잭션 검증: 업주 세션을 흉내내 voucher_quota 변경 → 차단 확인,
--   같은 세션으로 description 변경 → 통과 확인(과잉 차단이 아님을 함께 확인).

create or replace function public.guard_venue_verification()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if current_user in ('authenticated', 'anon') and coalesce(public.my_role()::text, '') <> 'admin' then
    if new.verification_status is distinct from old.verification_status then
      raise exception '매장 인증 상태는 관리자만 변경할 수 있습니다';
    end if;
    if new.approved               is distinct from old.approved
       or new.is_paid_ad             is distinct from old.is_paid_ad
       or new.voucher_quota          is distinct from old.voucher_quota
       or new.voucher_issue_approved is distinct from old.voucher_issue_approved
       or new.owner_id               is distinct from old.owner_id
       or new.slug                   is distinct from old.slug
       or new.status                 is distinct from old.status
       or new.display_order          is distinct from old.display_order
    then
      raise exception '보호된 매장 항목(승인·광고·이용권 한도·소유자·주소·제재·노출순서)은 직접 변경할 수 없습니다';
    end if;
  end if;
  return new;
end $function$;

-- 트리거가 실제로 붙어 있는지 확인하고, 없으면 만든다.
do $$
declare v_tg text;
begin
  select t.tgname into v_tg
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'venues' and not t.tgisinternal
     and pg_get_triggerdef(t.oid) ilike '%guard_venue_verification%';
  if v_tg is null then
    execute 'create trigger trg_guard_venue_privileged before update on public.venues
             for each row execute function public.guard_venue_verification()';
  end if;
end $$;

-- ── 자기검증(정적 불변식만) ──────────────────────────────────────────────────
do $$
declare v_col text; v_secdef boolean; v_src text;
begin
  select prosecdef, prosrc into v_secdef, v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'guard_venue_verification';
  if v_secdef is null then raise exception 'ABORT: 함수가 없다'; end if;
  if v_secdef then raise exception 'ABORT: SECURITY DEFINER 면 current_user 게이트가 무력해진다'; end if;

  foreach v_col in array array['approved','is_paid_ad','voucher_quota','voucher_issue_approved',
                               'owner_id','slug','status','display_order']
  loop
    if v_src not like '%new.' || v_col || '%' then
      raise exception 'ABORT: % 가 보호 목록에 없다', v_col;
    end if;
  end loop;

  if not exists (
    select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'venues' and not t.tgisinternal
       and pg_get_triggerdef(t.oid) ilike '%guard_venue_verification%')
  then raise exception 'ABORT: venues 에 가드 트리거가 안 붙어 있다'; end if;
end $$;
