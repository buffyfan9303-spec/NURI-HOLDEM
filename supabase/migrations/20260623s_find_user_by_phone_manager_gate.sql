-- 2026-06-23 #3 PII 보호: find_user_by_phone(이용권 발급 전화 조회)를 매장 운영자(owner/co-owner/admin) 전용으로 제한.
-- 일반 회원의 전화→신원·verified 조회(타겟 프라이버시 누출) 차단. 끝10자리 매칭 로직은 동일.
create or replace function public.find_user_by_phone(p_phone text)
returns table(id uuid, display text, verified boolean)
language sql security definer set search_path = public as $$
  select p.id, coalesce(p.nickname, p.name) as display, public.is_ci_verified(p.ci, p.verified_at) as verified
  from public.profiles p
  where (
      public.my_role() = 'admin'
      or exists (select 1 from public.venues v where v.owner_id = auth.uid())
      or exists (select 1 from public.venue_owners vo where vo.user_id = auth.uid() and vo.status = 'approved')
    )
    and coalesce(p.status::text, 'active') = 'active'
    and length(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')) >= 9
    and regexp_replace(coalesce(p.phone,''), '[^0-9]', '', 'g') <> ''
    and right(regexp_replace(coalesce(p.phone,''), '[^0-9]', '', 'g'), 10)
      = right(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g'), 10)
  limit 5;
$$;
revoke all on function public.find_user_by_phone(text) from public;
grant execute on function public.find_user_by_phone(text) to authenticated;
