-- ✅ 적용 완료 2026-09-28 (nuri-lead, MCP execute_sql). 오너 결정: 매장 전환기(여러 매장 소속자).
-- 리허설(롤백): 대표 업주 1행 · 관리자 1행(그룹 제외) · 일반 회원 0 · anon 42501. 적용 후 anon=false·authenticated=true.

-- 내 매장 상단 매장 전환기 목록: 대표 업주 ∪ 승인 공동운영자 ∪ 직원(profiles.venue_id, role=venue_staff).
-- 권한 판정과 같은 식을 쓴다(can_manage_pos 의 owner 분기는 _venue_owner_ok 라 정지 업주는 빠진다).
-- 반환 칸은 id·name·relation 셋뿐(보안 표준 6항).
create or replace function public.my_member_venues()
returns table(id uuid, name text, relation text)
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select distinct on (v.id) v.id, v.name, r.relation
    from (
      select v0.id as vid, 'owner'::text as relation, 0 as rk
        from public.venues v0 where v0.owner_id = auth.uid() and public._venue_owner_ok(v0.id)
      union all
      select vo.venue_id, 'coowner', 1
        from public.venue_owners vo where vo.user_id = auth.uid() and vo.status = 'approved'
      union all
      select p.venue_id, 'staff', 2
        from public.profiles p
       where p.id = auth.uid() and p.role = 'venue_staff' and p.venue_id is not null
         and public._is_active_venue_staff(auth.uid(), p.venue_id)
    ) r
    join public.venues v on v.id = r.vid
   where auth.uid() is not null
   order by v.id, r.rk;
$$;
revoke all on function public.my_member_venues() from public, anon;
grant execute on function public.my_member_venues() to authenticated, service_role;

-- 리허설(begin … rollback) 기대값:
--   대표 업주(정상)        → 자기 매장 1행 relation='owner'
--   승인 공동운영자         → 공동운영 매장 행 relation='coowner' (profiles.venue_id 와 무관하게)
--   pending 공동운영자      → 그 매장 없음
--   정지 업주               → owner 행 없음(_venue_owner_ok)
--   anon(set role anon)     → execute 거부(42501)
--   대표 업주이면서 같은 매장 공동운영 행도 있는 경우 → 1행, relation='owner'(distinct on + rk)
