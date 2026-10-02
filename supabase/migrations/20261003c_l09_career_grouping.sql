-- ✅ 적용 완료 2026-10-03 (리드, Management API). 되돌림 리허설 PASS(수정 전 FAIL·후 PASS, 워크인 행 불변 양성 대조) · advisors ERROR 0 · critical-reviewer 설계·리허설
-- 20261003c — 적용됨 · 요구 키 audit-link-1002.md#L-09 · 작성 critical-reviewer 2026-10-02
-- 무엇: ① global_ranking_totals 의 묶음 키를 r.nickname 원문 → lower(btrim(nickname)) 로 바꾼다(다른 순위 함수와 같은 규칙).
--          반환 열·정렬 규칙은 그대로(표시 이름 = 그 묶음의 가장 최근 표기). 공개 보드는 여전히 '닉네임 단위' 다.
--       ② 새 읽기 RPC my_career_standing(p_since) — '전국 상위 N%' 를 **내 계정이 가진 행 전부**(옛 닉네임 포함,
--          nickname_owner_at 판정 = 20261003a 의 my_ranking_history 와 같은 시각 규칙)로 세어 (내 등수, 모집단) 을 돌려준다.
--          화면(CustomerDashboardPage.tsx:221·241-244)은 지금 닉네임으로 보드에서 찾는 대신 이 값을 쓴다(home-team).
-- 출발점(라이브): global_ranking_totals def 9886f190635686a8e52a624679b5286d / prosrc cc336361b20896619549cb892388ebac
-- 영향(2026-10-02 라이브 실측): 대소문자·공백으로 갈린 키 0 · 옛 닉네임 아래 순위 행 0 · 시즌 결과 0 → 지금 보이는 숫자 변화 0.
-- 정정: 감사 문서의 '우승 수도 지금 닉네임만' 은 사실과 다르다 — my_championships 는 본인일 때 my_nickname_aliases + nickname_owner_at 로 센다(라이브 본문).
-- 리허설: names-1002/l09_rehearse.sql. 파일명은 리드 지정(20261003c). 라이브 미적용. 20261003a(L-10) 다음에 적용 권장(판정 시각 규칙 공유, 단독도 동작).

do $pre_grt$ begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = 'public.global_ranking_totals'::regproc) is distinct from 'cc336361b20896619549cb892388ebac' then
    raise exception '표류: 라이브 global_ranking_totals 본문이 초안 작성 때와 다르다 — 라이브 본문에서 다시 만들어라';
  end if;
  if exists (select 1 from pg_proc where proname = 'my_career_standing' and pronamespace = 'public'::regnamespace) then
    raise exception '표류: my_career_standing 이 이미 있다';
  end if;
end $pre_grt$;

CREATE OR REPLACE FUNCTION public.global_ranking_totals(p_since date DEFAULT NULL::date)
 RETURNS TABLE(nickname text, moneyin_count bigint, wins bigint, top3 bigint, best_position integer, venues bigint, last_date date, real_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 20261002x L-09: 묶음 키 = lower(btrim(nickname)). 표시 이름은 그 묶음의 가장 최근 표기.
  select (array_agg(r.nickname order by r.ranking_date desc, r.created_at desc))[1] as nickname,
         count(*)::bigint                                          as moneyin_count,
         count(*) filter (where r.position = 1)::bigint             as wins,
         count(*) filter (where r.position <= 3)::bigint            as top3,
         min(r.position)::integer                                   as best_position,
         count(distinct r.venue_id)::bigint                         as venues,
         max(r.ranking_date)::date                                  as last_date,
         public._ranking_optin_real_name_span(null, min(r.nickname), p_since, null) as real_name
  from public.venue_rankings r
  where coalesce(trim(r.nickname), '') <> ''
    and (p_since is null or r.ranking_date >= p_since)
  group by lower(btrim(r.nickname))
  order by 2 desc, 3 desc, 4 desc, 5 asc, 7 desc, 1
$function$;
revoke all on function public.global_ranking_totals(date) from public, anon, authenticated;
grant execute on function public.global_ranking_totals(date) to anon, authenticated, service_role;   -- 공개 보드(라이브 ACL 그대로)

create or replace function public.my_career_standing(p_since date default null)
 returns table(my_rank integer, population integer)
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20261002x L-09: 내 계정이 가진 순위 행(옛 닉네임 포함)을 한 사람으로 묶어 보드(닉네임 묶음)와 같은 규칙으로 등수를 센다.
  --   비교 = 입상 수 → 우승 → TOP3 → 최고 등수(작을수록) → 최근 입상. 완전 동률은 앞선 것으로 치지 않는다.
  with al as (select distinct lower(btrim(a.nickname)) as k from public.my_nickname_aliases() a where a.nickname is not null),
  mine as (
    select r.id, r.position, r.ranking_date
      from public.venue_rankings r
      join al on lower(btrim(r.nickname)) = al.k
     where auth.uid() is not null
       and (p_since is null or r.ranking_date >= p_since)
       and public.nickname_owner_at(r.nickname, least(r.created_at, ((r.ranking_date + 1)::timestamp at time zone 'Asia/Seoul'))) = auth.uid()
  ),
  me as (
    select count(*) as c, count(*) filter (where position = 1) as w, count(*) filter (where position <= 3) as t3,
           min(position) as bp, max(ranking_date) as ld
      from mine
  ),
  others as (
    select count(*) as c, count(*) filter (where r.position = 1) as w, count(*) filter (where r.position <= 3) as t3,
           min(r.position) as bp, max(r.ranking_date) as ld
      from public.venue_rankings r
     where coalesce(btrim(r.nickname), '') <> ''
       and (p_since is null or r.ranking_date >= p_since)
       and not exists (select 1 from mine where mine.id = r.id)
     group by lower(btrim(r.nickname))
  )
  select (1 + count(o.c) filter (where (o.c, o.w, o.t3, -o.bp, o.ld) > (me.c, me.w, me.t3, -me.bp, me.ld)))::integer,
         (1 + count(o.c))::integer
    from me left join others o on true
   where me.c > 0
   group by me.c, me.w, me.t3, me.bp, me.ld;
$function$;
revoke all on function public.my_career_standing(date) from public, anon, authenticated;
grant execute on function public.my_career_standing(date) to authenticated, service_role;

do $post_grt$ begin
  if has_function_privilege('anon', 'public.global_ranking_totals(date)', 'execute') is distinct from true
     or has_function_privilege('anon', 'public.my_career_standing(date)', 'execute') is distinct from false
     or has_function_privilege('authenticated', 'public.my_career_standing(date)', 'execute') is distinct from true then
    raise exception '자가검사: ACL 이 기대와 다르다';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.my_career_standing(date)'::regprocedure
                  and prosecdef and proconfig @> array['search_path=public, pg_temp']) then
    raise exception '자가검사: my_career_standing 의 SECURITY DEFINER / search_path 고정이 빠졌다';
  end if;
end $post_grt$;
