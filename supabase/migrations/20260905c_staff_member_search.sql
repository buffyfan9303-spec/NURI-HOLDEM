-- 직원(장부·순위 권한 보유자)에게 회원 조회를 열어 준다 (2026-09-05 전수 조사)
--
-- 증상: 사장님이 직원 관리에서 「장부·순위 권한」을 켜 주면 직원이 순위 입력 화면에 들어간다.
--       그런데 그 화면이 쓰는 회원 조회 RPC 3종은 `role in ('venue_owner','admin')` 으로 직원을 배제한다.
--       게이트가 **거절이 아니라 조용한 0행**이라 호출부 catch 에 안 걸리고, 화면은 그 0행을 사실로
--       바꿔 **실제 가입 회원의 줄에 '비회원' 배지**를 붙인다. 이용권 '전송' 버튼도 전부 영구 비활성이
--       되고 툴팁은 '비회원 · 가입·인증 후 지급 가능' 이라 말한다 — 손님을 미가입자로 지목하는 거짓말이다.
--       (이용권 지갑의 find_user_by_phone 막다른 길과 정확히 같은 형태)
--
-- 근본 원인: **두 권한 경계가 어긋나 있다.**
--   · 화면 진입 경계 = can_access_ledger(venue) = can_manage_pos(venue) OR ledger_access 행 존재
--   · 조회 RPC 경계  = profiles.role in ('venue_owner','admin')
--   직원은 앞은 통과하고 뒤에서 막힌다.
--
-- 조치: 세 RPC 는 매장 인자를 받지 않으므로 can_access_ledger(venue) 를 부를 수 없다.
--       대신 '어느 매장에서든 장부·순위 권한을 받은 사람'을 게이트에 더한다.
--       ledger_access 행은 **사장님이 명시적으로 켜 준 것**이므로(자동 부여 없음) 신뢰 경계로 적절하다.
--
-- ⚠ 노출 범위: 이 RPC 들이 주는 것은 nickname·name·verified 다. 직원은 이미 장부에서 손님 이름을
--   다루므로 새로 열리는 정보가 아니다. ci_hash·이메일·전화는 여전히 안 나간다(보안 표준 §6 유지).
--
-- 롤백:
--   세 함수의 where 절을 `exists (select 1 from public.profiles me where me.id = auth.uid()
--   and me.role in ('venue_owner','admin'))` 로 되돌리고, can_search_ranking_members 를 drop.

-- ── 공용 판정 ──────────────────────────────────────────────────────────────
create or replace function public.can_search_ranking_members()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
           select 1 from public.profiles me
           where me.id = auth.uid() and me.role in ('venue_owner', 'admin')
         )
      or exists (
           -- 장부·순위 권한을 받은 직원(사장님이 켜 준 것 — 자동 부여 경로 없음)
           select 1 from public.ledger_access la where la.user_id = auth.uid()
         );
$$;

revoke all on function public.can_search_ranking_members() from public;
revoke all on function public.can_search_ranking_members() from anon;
grant execute on function public.can_search_ranking_members() to authenticated, service_role;

-- ── ① 이름으로 회원 검색(순위 입력) ────────────────────────────────────────
create or replace function public.search_ranking_members(p_q text)
returns table(id uuid, nickname text, real_name text, verified boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id,
         p.nickname,
         p.name,
         public.is_ci_verified(p.ci_hash, p.verified_at)
  from public.profiles p
  where public.can_search_ranking_members()
    and coalesce(p.status::text, 'active') = 'active'
    and btrim(coalesce(p_q, '')) <> ''
    and (p.nickname ilike '%' || btrim(p_q) || '%' or p.name ilike '%' || btrim(p_q) || '%')
  order by (p.nickname = btrim(p_q)) desc, p.nickname
  limit 12;
$$;

-- ── ② 닉네임 일괄 대조(순위표 붙여넣기) ────────────────────────────────────
create or replace function public.resolve_ranking_members(p_names text[])
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
  from unnest((coalesce(p_names, '{}'::text[]))[1:100]) as n(q)
  join public.profiles p
    on lower(btrim(p.nickname)) = lower(btrim(n.q))
  where public.can_search_ranking_members()
    and coalesce(p.status::text, 'active') = 'active'
    and btrim(coalesce(n.q, '')) <> '';
$$;

-- ── ③ 순위 입력 자동완성 ───────────────────────────────────────────────────
create or replace function public.search_members_for_ranking(p_q text)
returns table(nickname text, real_name text, verified boolean)
language sql
security definer
set search_path = public, pg_temp
as $$
  select p.nickname, p.name, public.is_ci_verified(p.ci_hash, p.verified_at) as verified
  from public.profiles p
  where public.can_search_ranking_members()
    and coalesce(p.status::text, 'active') = 'active'
    and btrim(coalesce(p_q, '')) <> ''
    and (p.nickname ilike '%' || btrim(p_q) || '%' or p.name ilike '%' || btrim(p_q) || '%')
  order by (p.nickname = btrim(p_q)) desc, p.nickname
  limit 8;
$$;

-- CREATE OR REPLACE 는 기존 ACL 을 보존하지만, 명시적으로 다시 잠가 규약을 눈에 보이게 남긴다.
revoke all on function public.search_ranking_members(text) from public, anon;
revoke all on function public.resolve_ranking_members(text[]) from public, anon;
revoke all on function public.search_members_for_ranking(text) from public, anon;
grant execute on function public.search_ranking_members(text) to authenticated, service_role;
grant execute on function public.resolve_ranking_members(text[]) to authenticated, service_role;
grant execute on function public.search_members_for_ranking(text) to authenticated, service_role;
