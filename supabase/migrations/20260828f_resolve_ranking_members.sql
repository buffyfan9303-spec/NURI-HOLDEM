-- ============================================================================
-- 순위 행 ↔ 회원 일괄 대조 (2026-08-28) — 20260828e 의 짝
--
-- 왜 필요한가: 순위 입력 화면은 행마다 '이 이름이 회원인가 / 동명이인인가 /
--   본인인증을 마쳤는가'를 알아야 한다. 그걸 알아야 이용권 '전송' 버튼을
--   비회원 행에서 아예 비활성화하고, 동명이인 행은 후보 선택을 요구할 수 있다.
--   이미 저장된 순위를 다시 열면 행이 20개까지 차 있는데, 행마다 검색 RPC 를
--   따로 쏘면 진입 한 번에 20왕복이다(무료 티어 egress 가 실질 천장인 프로젝트).
--   이름 배열 하나로 한 번에 대조한다.
--
-- 정확 일치만 본다(부분일치 금지). 자동완성은 부분일치로 후보를 보여주지만,
--   '이 행의 지급 대상이 누구인가'는 부분일치로 정하면 안 된다 — 그게 예전
--   find_user_for_transfer 부분일치 지급이 만들던 오지급 위험이다.
-- 같은 닉네임이 2명 이상이면 그대로 2행을 돌려준다 → 호출부가 '중복'으로 표시하고
--   업주가 자동완성에서 직접 고르게 한다(임의로 한 명을 고르지 않는다).
-- ============================================================================

drop function if exists public.resolve_ranking_members(text[]);
create function public.resolve_ranking_members(p_names text[])
returns table(q text, id uuid, nickname text, real_name text, verified boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select n.q,
         p.id,
         p.nickname,
         p.name,
         public.is_ci_verified(p.ci_hash, p.verified_at)
  from unnest((coalesce(p_names, '{}'::text[]))[1:100]) as n(q)    -- 한 화면 행 수 상한
  join public.profiles p
    on lower(btrim(p.nickname)) = lower(btrim(n.q))
  where exists (                                                   -- 업주·운영자만(검색 RPC 와 동일 게이트)
          select 1 from public.profiles me
          where me.id = auth.uid() and me.role in ('venue_owner', 'admin')
        )
    and coalesce(p.status::text, 'active') = 'active'
    and btrim(coalesce(n.q, '')) <> '';
$$;
revoke all on function public.resolve_ranking_members(text[]) from public, anon;
grant execute on function public.resolve_ranking_members(text[]) to authenticated;
