-- 20260924g — 직원 권한 분기에 계정 상태 확인 (STORE-CHAIN-AUDIT ② F6).
-- ✅ 2026-09-24 라이브 적용 완료 · can_access_ledger md5 330ee087295f4a9e23ccd52b836499cc · can_view_vouchers md5 61a0a5fce46de0e0d78ac541ff4966cd
--   리허설: 활성 직원 t/t · 정지 중 f/f · 정지 만료 t/t · 영구정지 f/f · 업주 t/t · anon 실행 권한 유지 true.
--   음성 대조: 적용 전 정지 중 직원 can_access_ledger = true.
-- 판정 문장은 can_manage_pos(20260921c)와 같다. ⚠ can_access_ledger 는 anon/PUBLIC 실행을 유지해야 한다
--   (비로그인 clock_states_public_read·venue_player_counts 가 부른다) — REVOKE 하지 마라. CREATE OR REPLACE 는 ACL 보존.
-- 전이 폐쇄(라이브 실측): can_access_ledger 를 부르는 함수 12 + _can_see_ranking_real_names 경유 5 + 정책 23,
--   can_view_vouchers 를 부르는 함수 5 + 정책 2 — 모두 '정지 직원 차단'이 더해지는 방향이라 넓어지는 곳 없음.
create or replace function public.can_access_ledger(p_venue_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $fn$
  select public.can_manage_pos(p_venue_id)
      or ( exists (select 1 from public.ledger_access la where la.venue_id = p_venue_id and la.user_id = auth.uid())
           and not exists (select 1 from public.profiles p where p.id = auth.uid()
                             and ( p.status::text in ('banned','withdrawn')
                                or (p.status::text = 'suspended' and (p.suspended_until is null or p.suspended_until > now())) )) );
$fn$;
create or replace function public.can_view_vouchers(p_venue_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $fn$
  select public.can_manage_pos(p_venue_id)
      or ( exists (select 1 from public.voucher_access va where va.venue_id = p_venue_id and va.user_id = auth.uid())
           and not exists (select 1 from public.profiles p where p.id = auth.uid()
                             and ( p.status::text in ('banned','withdrawn')
                                or (p.status::text = 'suspended' and (p.suspended_until is null or p.suspended_until > now())) )) );
$fn$;
do $chk$ begin
  if not has_function_privilege('anon','public.can_access_ledger(uuid)','EXECUTE') then raise exception '[chk] anon lost can_access_ledger'; end if;
end $chk$;
