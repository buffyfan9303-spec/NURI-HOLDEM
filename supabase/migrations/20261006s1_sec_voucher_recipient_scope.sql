select set_config('lock_timeout', '3s', true);
select set_config('statement_timeout', '60s', true);
-- ⏳ 미적용(store-team 2026-10-06). 적용 판단·실행은 nuri-lead(nuri-migration 절차). 위 두 줄을 떼지 말 것 —
--   2026-10-06 리허설 중 다른 세션의 pg_dump 잠금 뒤에서 ACCESS EXCLUSIVE 대기가 120초 걸린 적이 있다(security-1006/tech.md).
-- 리허설: supabase/tests/20261006s1_rehearsal.sql (node rehearse-geo.mjs <이 파일> <리허설 파일>, 통째 롤백)
--
-- 20261006s1 — 기술 보안 점검 tech.md#P2-1 (+ #P3-5 위생)
--
-- 결함(P2-1): search_voucher_recipients 의 '실명 정확 일치'·'옛 닉네임 정확 일치' 가 **전 회원**을 대상으로 돈다.
--   가드는 can_manage_pos(내 매장)뿐이라, 승인된 업주 누구나 우리 매장과 관계없는 회원의 실명을 넣어
--   '그 사람의 커뮤니티 닉네임·본인인증 여부' 를 알아낼 수 있었다(가명 해제. 라이브 r1 T1: 관계없는 회원 1행·실명 반환).
--   전화 마스킹은 20260925h 에서 '내 고객' 으로 좁혔지만 실명·옛 닉네임 일치는 좁히지 않았다.
-- 바꾸는 것
--   ① 실명·옛 닉네임 정확 일치는 **이 매장 고객(_venue_customer_ids — 출석·고객카드·예약)** 안에서만 찾는다.
--      닉네임 부분 일치(전 회원)는 그대로 — 닉네임은 공개 표시명이고, 처음 오는 손님에게 이용권을 보내는 기능을 지킨다.
--      닉네임으로 찾힌 남의 매장 회원의 실명이 입력과 우연히 같아도 실명은 싣지 않는다(rn 도 고객 한정).
--   ③ schedule_reservations_for_owner: anon·PUBLIC 실행 회수(본문이 can_manage_pos 로 막아 anon 은 이미 0행 — 위생, P3-5).
-- 이번에 넣지 않은 것
--   · P3-4 venues.kakao_url CHECK — ACCESS EXCLUSIVE 라 리허설을 못 했다(리드 결정: P3 로 남김).
--   · P3-1 find_user_by_phone 하루 상한 — 받는 사람 칸의 자동완성이 9·10·11자리에서 각각 한 번씩 불러
--     번호 하나에 최대 3회가 세어진다(VoucherManageModal 디바운스 + makeSearchCache 키 = 끝 10자리).
--     초안 값 30회면 하루 손님 10명 남짓에서 막혀 이용권 전송이 멈춘다 → 값·셈 방식은 오너 결정으로 넘긴다.
-- 반환 타입 불변 → CREATE OR REPLACE(ACL 보존). REVOKE/GRANT 는 새로 만들어지는 경우를 위해 명시.
-- 라이브 출발점(2026-10-06 read_only 실측, md5(pg_get_functiondef)): search_voucher_recipients(uuid,text) a5446267a1b9e59782784ab079c51a68

do $gate$
begin
  if md5(pg_get_functiondef('public.search_voucher_recipients(uuid,text)'::regprocedure)) is distinct from 'a5446267a1b9e59782784ab079c51a68' then
    raise exception '20261006s1 게이트: search_voucher_recipients 가 작성 때(2026-10-06)와 다르다 — 라이브 정의를 다시 떠서 합쳐라';
  end if;
end $gate$;

-- ① 받는 사람 검색 — 실명·옛 닉네임 정확 일치는 이 매장 고객 안에서만
create or replace function public.search_voucher_recipients(p_venue_id uuid, p_q text)
 returns table(user_id uuid, nickname text, real_name text, verified boolean, matched text, phone_masked text)
 language plpgsql
 stable security definer
 set search_path = public, pg_temp
as $function$
declare
  v_q    text := left(btrim(regexp_replace(coalesce(p_q, ''), '\s+', ' ', 'g')), 30);
  v_k    text;
  v_like text;
begin
  if auth.uid() is null or not coalesce(public.can_manage_pos(p_venue_id), false) then
    raise exception using errcode = '42501', message = '권한이 없습니다 — 매장이용권 발급 권한자만 검색할 수 있습니다';
  end if;
  if char_length(v_q) < 2 then return; end if;
  v_k    := lower(v_q);
  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  with rel as materialized (
    select t.uid from public._venue_customer_ids(array[p_venue_id]) t
  ),
  hit as (
    select p.id,
           p.nickname,
           -- 20261006s1: 실명은 '이 매장 고객' 이고 입력과 정확히 같을 때만
           case when r.uid is not null and lower(btrim(p.real_name)) = v_k then p.real_name end as rn,
           public.is_ci_verified(p.ci_hash, p.verified_at) as ver,
           case when lower(btrim(p.nickname)) = v_k then 'nickname'
                when r.uid is not null and lower(btrim(p.real_name)) = v_k then 'real_name'
                when r.uid is not null and exists (select 1 from public.nickname_history h
                              where h.user_id = p.id and lower(btrim(h.old_nickname)) = v_k) then 'old_nickname'
                else 'partial' end as how,
           case when r.uid is not null then public._mask_phone(p.phone) end as pm
      from public.profiles p
      left join rel r on r.uid = p.id
     where coalesce(p.status::text, 'active') = 'active'
       and p.id <> auth.uid()
       and ( p.nickname ilike v_like
          or ( r.uid is not null
               and ( lower(btrim(p.real_name)) = v_k
                  or exists (select 1 from public.nickname_history h
                              where h.user_id = p.id and lower(btrim(h.old_nickname)) = v_k) ) ) )
  )
  select h.id, h.nickname, h.rn, h.ver, h.how, h.pm
    from hit h
   order by case h.how when 'nickname' then 0 when 'real_name' then 1 when 'old_nickname' then 2 else 3 end,
            h.ver desc, h.nickname
   limit 8;
end $function$;
revoke all on function public.search_voucher_recipients(uuid,text) from public, anon;
grant execute on function public.search_voucher_recipients(uuid,text) to authenticated, service_role;

-- ③ 위생: 업주 전용 명단 RPC 의 anon 실행 회수(P3-5)
revoke all on function public.schedule_reservations_for_owner(uuid) from public, anon;
grant execute on function public.schedule_reservations_for_owner(uuid) to authenticated, service_role;

-- 자가검사
do $self$
begin
  if has_function_privilege('anon', 'public.search_voucher_recipients(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.schedule_reservations_for_owner(uuid)', 'execute') then
    raise exception '20261006s1 자가검사: anon 실행이 남아 있다';
  end if;
  if not has_function_privilege('authenticated', 'public.search_voucher_recipients(uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.schedule_reservations_for_owner(uuid)', 'execute') then
    raise exception '20261006s1 자가검사: 업주가 받는 사람 검색·예약 명단을 못 부른다';
  end if;
  if (select proconfig from pg_proc where oid = 'public.search_voucher_recipients(uuid,text)'::regprocedure)
     is distinct from array['search_path=public, pg_temp'] then
    raise exception '20261006s1 자가검사: search_path';
  end if;
end $self$;

notify pgrst, 'reload schema';

-- ROLLBACK: ① 의 본문에서 `r.uid is not null and` 조건(rn·how 두 곳·where)을 빼고 where 를
--   `p.nickname ilike v_like or lower(btrim(p.real_name)) = v_k or exists(옛 닉네임)` 로 되돌린 것이 라이브 출발점(md5 a5446267…)이다.
--   ③ 은 되돌릴 이유가 없다(anon 은 본문에서 이미 0행).
