-- ✅ 적용 완료 2026-09-25 (MCP execute_sql, §0 md5 게이트·§7 자가검사 통과). 리허설 38/38 PASS(critical-reviewer, rollback).
--    범위 규칙 리드 승인: phone_masked 는 호출자 매장 손님 행에만(find_user_by_phone 은 맞춘 행 전부).
-- (초안 표기는 적용 완료로 대체됨)
-- 20260925h — 손님 검색 RPC 5개에 phone_masked(010-****-5678) 칸 추가. 원문 phone 은 어떤 RPC 도 돌려주지 않는다.
-- 요구: 오너 2026-09-25 "손님 검색 결과에 전화번호를 가린 형태(010-****-5678)로 보여 달라" (선택: 검색 결과에 가린 번호 추가).
-- 화면 정본: src/lib/maskPhone.ts (숫자만 추출 → 앞3·별표·뒤4 · 빈값/숫자없음 → ''). 서버 _mask_phone 은 그 파일의
--   maskPhone.test.ts 벡터 12개와 같은 결과를 낸다(아래 자가검사 §A 가 적용 시 강제한다).
--
-- 범위 규칙(개인정보 범위를 실명 규칙과 같게 둔다 — 20260911j "내 매장 손님일 때만 실명"):
--   phone_masked 는 **호출자의 매장 손님(체크인·CRM·예약 = _venue_customer_ids)** 인 행에만 싣고, 그 밖의 행은 null.
--   find_user_by_phone 은 호출자가 이미 그 번호를 입력해 맞춘 행이므로 전부 싣는다(관리자 게이트·감사 기록은 20260925g 그대로).
--   find_user_for_transfer 는 일반 회원(쪽지 NotificationPanel)도 부르는 RPC 다 — 관리자·직원이 아닌 호출자는
--   _my_ledger_venue_ids()='{}' 라 항상 null. 직원(ledger_access)은 자기 매장 손님의 가린 번호를 본다(오너가 직원 실명 열람을 허용한 범위와 같다).
--
-- ── 적용 전 라이브 정본(2026-09-25 실측 md5 = md5(pg_get_functiondef)) — 아래 게이트가 다르면 멈춘다. 다시 읽어라 ──
--   search_registered_players(uuid,text)   9bc19c7d473dd71b33c272470f59b132
--   search_voucher_recipients(uuid,text)   1f48daf8c18b4a14f811002b85d39b10
--   find_user_for_transfer(text)           1a9d2b1927751c52f995a9318619c45e
--   search_ranking_members(text)           6519e8d775fb6e1f52aa365168f26746
--   find_user_by_phone(text)               e2c62b829e153e1fff5605aa84bc3fc6   (20260925g 의 plpgsql + phone_lookup_audit 본문 — 유지)
--   _mask_phone(text)                      (없음 — 신규)
--   ACL 5개 모두 {postgres=X, authenticated=X, service_role=X} · anon 없음 → 반환 타입 변경이라 DROP 뒤 같은 ACL 로 재부여.
--   전이 폐쇄: 이 5개를 부르는 SQL 함수·뷰·정책·트리거 0 (ilike 매치 2건은 can_search_ranking_members / resolve_ranking_members 의
--   **이름 부분일치**이지 호출이 아니다). 클라 호출부(메인 HEAD ad85f3a5): src/api/ledger.ts:1067 · src/api/vouchers.ts:366·373·411 · src/api/rankings.ts:508.
--   PostgreSQL 17.6 실측.

-- ═══ 0. 정본 게이트 ═══════════════════════════════════════════════════════════
do $$
declare bad text;
begin
  select string_agg(p.proname || '=' || md5(pg_get_functiondef(p.oid)), ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('search_registered_players','search_voucher_recipients','find_user_for_transfer','search_ranking_members','find_user_by_phone')
     and (p.proname, md5(pg_get_functiondef(p.oid))) not in (
       ('search_registered_players','9bc19c7d473dd71b33c272470f59b132'),
       ('search_voucher_recipients','1f48daf8c18b4a14f811002b85d39b10'),
       ('find_user_for_transfer','1a9d2b1927751c52f995a9318619c45e'),
       ('search_ranking_members','6519e8d775fb6e1f52aa365168f26746'),
       ('find_user_by_phone','e2c62b829e153e1fff5605aa84bc3fc6'));
  if bad is not null then
    raise exception '20260925h 중단 — 라이브 정본이 헤더 md5 와 다르다: %', bad;
  end if;
end $$;

-- ═══ 1. _mask_phone — src/lib/maskPhone.ts 와 같은 규칙 ═══════════════════════
--   숫자만 추출 → 0자리 '' · ≤4자리 전부 별표 · 5~6자리 '**-3456' · 7자리 '123-4567' · 8자리+ '앞3-별표-뒤4'. 앞의 '+' 는 유지.
create or replace function public._mask_phone(p_raw text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
           when s.d = ''            then ''
           when length(s.d) <= 4    then repeat('*', length(s.d))
           when length(s.d) < 7     then repeat('*', length(s.d) - 4) || '-' || right(s.d, 4)
           else s.plus || left(s.d, 3) || '-'
                || case when length(s.d) > 7 then repeat('*', length(s.d) - 7) || '-' else '' end
                || right(s.d, 4)
         end
    from (select regexp_replace(coalesce(p_raw, ''), '[^0-9]', '', 'g') as d,
                 case when left(btrim(coalesce(p_raw, ''), E' \t\r\n'), 1) = '+' then '+' else '' end as plus) s;
$$;
revoke all on function public._mask_phone(text) from public, anon, authenticated;
grant execute on function public._mask_phone(text) to service_role;
comment on function public._mask_phone(text) is
  '전화번호 표시용 가림(앞3·별표·뒤4). src/lib/maskPhone.ts 와 같은 규칙 — 한쪽을 바꾸면 다른 쪽도 바꾼다. 내부 전용(anon·authenticated 회수). (20260925h)';

-- ═══ 2. search_registered_players — 장부 접수대 손님 자동완성(can_access_ledger) ═══
--   본문은 라이브 정본 그대로, rel(내 매장 손님) 가지에만 phone_masked 를 싣고 그 밖의 가지는 null.
drop function if exists public.search_registered_players(uuid, text);
create function public.search_registered_players(p_venue_id uuid, p_query text)
returns table(user_id uuid, real_name text, nickname text, visits integer, phone_masked text)
language sql stable security definer set search_path = public, pg_temp as $$
  with v as (
    select c.user_id as uid, count(*)::int as n
      from public.checkins c
     where c.venue_id = p_venue_id
     group by c.user_id
  ),
  rel as materialized (
    select t.uid from public._venue_customer_ids(array[p_venue_id]) t
  ),
  hit as (
    select p.id as uid,
           p.real_name as rn,
           p.nickname as nick,
           coalesce(v.n, 0) as vis,
           coalesce(lower(btrim(p.nickname)) = lower(btrim(coalesce(p_query, ''))), false) as is_exact,
           public._mask_phone(p.phone) as pm
      from rel
      join public.profiles p on p.id = rel.uid
      left join v on v.uid = p.id
     where public.can_access_ledger(p_venue_id)
       and btrim(coalesce(p_query, '')) <> ''
       and (p.nickname  ilike '%' || btrim(p_query) || '%'
         or p.real_name ilike '%' || btrim(p_query) || '%'
         or p.name      ilike '%' || btrim(p_query) || '%')
    union all
    select p.id, null::text, p.nickname, 0, true, null::text
      from public.profiles p
     where public.can_access_ledger(p_venue_id)
       and btrim(coalesce(p_query, '')) <> ''
       and lower(btrim(p.nickname)) = lower(btrim(p_query))
       and not exists (select 1 from rel where rel.uid = p.id)
  )
  select h.uid, h.rn, h.nick, h.vis, h.pm
    from hit h
   order by h.is_exact desc, h.vis desc, h.nick
   limit 8;
$$;
revoke all on function public.search_registered_players(uuid, text) from public, anon;
grant execute on function public.search_registered_players(uuid, text) to authenticated, service_role;
comment on function public.search_registered_players(uuid, text) is
  '장부 접수대 손님 자동완성. 범위 판정은 순위 검색과 같은 공용 함수를 쓴다 — 두 화면이 같은 질문에 같은 답을 한다. (20260911h → 20260911j) phone_masked(앞3·별표·뒤4)는 내 매장 손님 행에만, 그 밖은 null. (20260925h)';

-- ═══ 3. search_voucher_recipients — 이용권 받는 사람 검색(can_manage_pos) ═══════
--   전 회원을 훑는 RPC 라 phone_masked 는 rel(이 매장 손님)에만. 나머지 본문은 라이브 정본 그대로.
drop function if exists public.search_voucher_recipients(uuid, text);
create function public.search_voucher_recipients(p_venue_id uuid, p_q text)
returns table(user_id uuid, nickname text, real_name text, verified boolean, matched text, phone_masked text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
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
           case when lower(btrim(p.real_name)) = v_k then p.real_name end as rn,
           public.is_ci_verified(p.ci_hash, p.verified_at) as ver,
           case when lower(btrim(p.nickname)) = v_k then 'nickname'
                when lower(btrim(p.real_name)) = v_k then 'real_name'
                when exists (select 1 from public.nickname_history h
                              where h.user_id = p.id and lower(btrim(h.old_nickname)) = v_k) then 'old_nickname'
                else 'partial' end as how,
           case when exists (select 1 from rel where rel.uid = p.id) then public._mask_phone(p.phone) end as pm
      from public.profiles p
     where coalesce(p.status::text, 'active') = 'active'
       and p.id <> auth.uid()
       and ( p.nickname ilike v_like
          or lower(btrim(p.real_name)) = v_k
          or exists (select 1 from public.nickname_history h
                      where h.user_id = p.id and lower(btrim(h.old_nickname)) = v_k) )
  )
  select h.id, h.nickname, h.rn, h.ver, h.how, h.pm
    from hit h
   order by case h.how when 'nickname' then 0 when 'real_name' then 1 when 'old_nickname' then 2 else 3 end,
            h.ver desc, h.nickname
   limit 8;
end $$;
revoke all on function public.search_voucher_recipients(uuid, text) from public, anon;
grant execute on function public.search_voucher_recipients(uuid, text) to authenticated, service_role;
comment on function public.search_voucher_recipients(uuid, text) is
  '이용권 받는 사람 검색(can_manage_pos). 닉네임 부분일치 · 실명/옛 닉네임은 정확일치. 실명은 입력과 같을 때만 싣는다. 8건. (20260924k) phone_masked 는 이 매장 손님 행에만, 그 밖은 null. (20260925h)';

-- ═══ 4. find_user_for_transfer — 닉네임 검색(쪽지·이용권 전달·직원 초대·CRM 연결) ═══
--   일반 회원도 부른다. phone_masked 는 호출자의 장부 매장(_my_ledger_venue_ids) 손님 행에만 — 일반 회원은 '{}' 라 항상 null.
drop function if exists public.find_user_for_transfer(text);
create function public.find_user_for_transfer(p_nickname text)
returns table(id uuid, display text, verified boolean, phone_masked text)
language sql stable security definer set search_path = public, pg_temp as $$
  with q as (select btrim(coalesce(p_nickname, '')) as s),
       rel as materialized (
         select t.uid from public._venue_customer_ids(public._my_ledger_venue_ids()) t
       )
  select p.id, p.nickname, public.is_ci_verified(p.ci_hash, p.verified_at),
         case when exists (select 1 from rel where rel.uid = p.id) then public._mask_phone(p.phone) end
    from public.profiles p, q
   where char_length(q.s) >= 2
     and coalesce(p.status::text, 'active') = 'active'
     and p.id <> auth.uid()
     and p.nickname ilike '%' || replace(replace(replace(q.s, '\', '\\'), '%', '\%'), '_', '\_') || '%'
   order by (lower(btrim(p.nickname)) = lower(q.s)) desc, public.is_ci_verified(p.ci_hash, p.verified_at) desc, p.nickname
   limit 8;
$$;
revoke all on function public.find_user_for_transfer(text) from public, anon;
grant execute on function public.find_user_for_transfer(text) to authenticated, service_role;
comment on function public.find_user_for_transfer(text) is
  '닉네임 부분일치 회원 검색(쪽지·이용권 전달·직원 초대). phone_masked 는 호출자의 장부 매장 손님 행에만 — 일반 회원 호출은 항상 null. (20260925h)';

-- ═══ 5. search_ranking_members — 순위 입력 자동완성(can_search_ranking_members) ═══
drop function if exists public.search_ranking_members(text);
create function public.search_ranking_members(p_q text)
returns table(id uuid, nickname text, real_name text, verified boolean, phone_masked text)
language sql stable security definer set search_path = public, pg_temp as $$
  with rel as materialized (
    select t.uid from public._venue_customer_ids(public._my_ledger_venue_ids()) t
  ),
  hit as (
    select p.id as uid,
           p.nickname as nick,
           null::text as rn,
           public.is_ci_verified(p.ci_hash, p.verified_at) as ver,
           coalesce(lower(btrim(p.nickname)) = lower(btrim(coalesce(p_q, ''))), false) as is_exact,
           public._mask_phone(p.phone) as pm
      from rel
      join public.profiles p on p.id = rel.uid
     where public.can_search_ranking_members()
       and coalesce(p.status::text, 'active') = 'active'
       and btrim(coalesce(p_q, '')) <> ''
       and p.nickname ilike '%' || btrim(p_q) || '%'
    union all
    select p.id, p.nickname, null::text, public.is_ci_verified(p.ci_hash, p.verified_at), true, null::text
      from public.profiles p
     where public.can_search_ranking_members()
       and coalesce(p.status::text, 'active') = 'active'
       and btrim(coalesce(p_q, '')) <> ''
       and lower(btrim(p.nickname)) = lower(btrim(p_q))
       and not exists (select 1 from rel where rel.uid = p.id)
  )
  select h.uid, h.nick, h.rn, h.ver, h.pm
    from hit h
   order by h.is_exact desc, h.nick
   limit 12;
$$;
revoke all on function public.search_ranking_members(text) from public, anon;
grant execute on function public.search_ranking_members(text) to authenticated, service_role;
comment on function public.search_ranking_members(text) is
  '순위 입력 자동완성. 게이트 can_search_ranking_members. 내 매장 손님만 부분 일치 + 이름 표시, 그 밖은 닉네임 정확 일치만이고 이름은 싣지 않는다. (20260911j) phone_masked 도 같은 규칙 — 내 매장 손님 행에만. (20260925h)';

-- ═══ 6. find_user_by_phone — 전화번호→회원(관리자·업주·공동운영자) · 20260925g 감사 기록 유지 ═══
drop function if exists public.find_user_by_phone(text);
create function public.find_user_by_phone(p_phone text)
returns table(id uuid, display text, verified boolean, phone_masked text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_digits text := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
        v_allowed boolean; v_venue uuid; v_n int;
begin
  v_allowed := public.my_role() = 'admin'
            or exists (select 1 from public.venues v where v.owner_id = auth.uid())
            or exists (select 1 from public.venue_owners vo where vo.user_id = auth.uid() and vo.status = 'approved');
  if not coalesce(v_allowed, false) or length(v_digits) < 9 then
    return;   -- 종전과 같이 0행(권한 없음·짧은 입력은 기록하지 않는다)
  end if;
  return query
  select p.id, coalesce(p.nickname, p.name), public.is_ci_verified(p.ci_hash, p.verified_at), public._mask_phone(p.phone)
    from public.profiles p
   where coalesce(p.status::text, 'active') = 'active'
     and regexp_replace(coalesce(p.phone,''), '[^0-9]', '', 'g') <> ''
     and right(regexp_replace(coalesce(p.phone,''), '[^0-9]', '', 'g'), 10) = right(v_digits, 10)
   limit 5;
  get diagnostics v_n = row_count;
  v_venue := coalesce(
    (select v.id from public.venues v where v.owner_id = auth.uid() order by v.id limit 1),
    (select vo.venue_id from public.venue_owners vo where vo.user_id = auth.uid() and vo.status = 'approved' order by vo.venue_id limit 1),
    (select pr.venue_id from public.profiles pr where pr.id = auth.uid()));
  insert into public.phone_lookup_audit(caller, venue_id, phone_last4, phone_hash, result_count)
  values (auth.uid(), v_venue, right(v_digits, 4), md5(v_digits), v_n);
  return;
end $$;
revoke all on function public.find_user_by_phone(text) from public, anon;
grant execute on function public.find_user_by_phone(text) to authenticated, service_role;
comment on function public.find_user_by_phone(text) is
  '전화번호→회원 조회(관리자·업주·공동운영자). 호출은 phone_lookup_audit 에 뒤4자리·md5 만 기록(20260925g). phone_masked 는 맞춘 행 전부. (20260925h)';

-- ═══ 7. 자가검사 — 실패하면 raise 로 멈춘다(적용 트랜잭션이 통째로 되돌아간다) ═══
do $$
declare
  v_fail text[] := '{}';
  r record;
  v_res text;
begin
  -- §A _mask_phone == src/lib/maskPhone.test.ts 벡터 12개
  for r in select * from (values
      ('010-1234-5678',    '010-****-5678'),
      ('01012345678',      '010-****-5678'),
      (' 010 1234 5678 ',  '010-****-5678'),
      ('02-123-4567',      '021-**-4567'),
      ('+82-10-1234-5678', '+821-*****-5678'),
      ('',                 ''),
      ('   ',              ''),
      (null::text,         ''),
      ('없음',             ''),
      ('1234',             '****'),
      ('123456',           '**-3456'),
      ('1234567',          '123-4567')) as t(input, expected)
  loop
    if public._mask_phone(r.input) is distinct from r.expected then
      v_fail := v_fail || (format('A mask(%L) = %L, 기대 %L', r.input, public._mask_phone(r.input), r.expected))::text;
    end if;
  end loop;

  -- §B ACL: 5 RPC = authenticated 가능·anon 불가 / _mask_phone = 둘 다 불가
  for r in select * from (values
      ('public.search_registered_players(uuid,text)', true),
      ('public.search_voucher_recipients(uuid,text)', true),
      ('public.find_user_for_transfer(text)',         true),
      ('public.search_ranking_members(text)',         true),
      ('public.find_user_by_phone(text)',             true),
      ('public._mask_phone(text)',                    false)) as t(fn, auth_ok)
  loop
    if has_function_privilege('anon', r.fn, 'execute') then
      v_fail := v_fail || ('B anon 이 실행 가능: ' || r.fn)::text;
    end if;
    if has_function_privilege('authenticated', r.fn, 'execute') is distinct from r.auth_ok then
      v_fail := v_fail || ('B authenticated 권한이 기대와 다름: ' || r.fn)::text;
    end if;
    if not has_function_privilege('service_role', r.fn, 'execute') then
      v_fail := v_fail || ('B service_role 실행 불가: ' || r.fn)::text;
    end if;
  end loop;

  -- §C 반환 칸: phone_masked 가 있고 원문 phone 칸은 없다 · SECURITY DEFINER + search_path 고정
  for r in select p.proname, pg_get_function_result(p.oid) as res, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') as cfg
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('search_registered_players','search_voucher_recipients','find_user_for_transfer','search_ranking_members','find_user_by_phone')
  loop
    if r.res !~ 'phone_masked text\)$' then v_fail := v_fail || ('C phone_masked 칸 없음: ' || r.proname || ' → ' || r.res)::text; end if;
    if r.res ~ '(^|[ (,])phone text' then v_fail := v_fail || ('C 원문 phone 칸이 있다: ' || r.proname)::text; end if;
    if not r.prosecdef then v_fail := v_fail || ('C SECURITY DEFINER 아님: ' || r.proname)::text; end if;
    if r.cfg !~ 'search_path=public, ?pg_temp' then v_fail := v_fail || ('C search_path 미고정: ' || r.proname || ' [' || r.cfg || ']')::text; end if;
  end loop;

  if array_length(v_fail, 1) > 0 then
    raise exception E'20260925h 자가검사 실패 %건:\n%', array_length(v_fail, 1), array_to_string(v_fail, E'\n');
  end if;
end $$;
