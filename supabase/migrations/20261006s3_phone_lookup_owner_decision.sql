select set_config('lock_timeout', '3s', true);
select set_config('statement_timeout', '60s', true);
-- ⏳ 미적용(store-team 2026-10-06). 적용 판단·실행은 nuri-lead(nuri-migration 절차). 위 두 줄을 떼지 말 것.
--   순서: 20261006s1 → 20261006s2 → **이 파일**(s1 이 바꾼 search_voucher_recipients md5 를 게이트로 쓴다). LF 본문으로 적용.
--   클라이언트(PR #187 의 이용권 받는 사람 칸 = 010 + 8자리)가 **먼저** 나가야 한다 — 옛 화면은 9·10자리·하이픈으로도
--   find_user_by_phone 을 불러 이 파일 뒤로는 22023 을 받는다. 새 화면은 옛 서버에서도 그대로 돈다(11자리 숫자만 보냄).
-- 리허설: supabase/tests/20261006s3_rehearsal.sql (node rehearse-geo.mjs <s1+s2+이 파일> <리허설 파일>, 통째 롤백)
--
-- 20261006s3 — 오너 결정(2026-10-06, security-1006 P3-1 후속): 회원 전화번호 노출 범위
--   ① 닉네임으로 회원을 찾는 검색 RPC 4개(20260925h 가 phone_masked 를 넣은 5개 중 find_user_by_phone 을 뺀 넷)에서
--      **닉네임(지금·옛)으로 맞은 행의 phone_masked = null** — 내 매장 손님이어도. 실명으로만 맞은 내 손님 행은 그대로 싣는다.
--      매장 고객관리(단골·고객카드)의 업주 등록 연락처(customer_profiles.phone)는 이 RPC 들과 무관 — 그대로.
--        search_registered_players : 닉네임·name(=닉네임 사본) 부분 일치면 null, 실명으로만 맞으면 가린 번호
--        search_voucher_recipients : 실명 정확 일치(내 손님) + 닉네임 불일치 행만 가린 번호, 나머지(닉네임·옛 닉·부분) null
--        find_user_for_transfer    : 닉네임 검색뿐 → 항상 null
--        search_ranking_members    : 닉네임 검색뿐 → 항상 null
--   ② find_user_by_phone: 입력은 '010' + 숫자 8자리 정확 형식만(그 외 22023 — 단, 권한 없는 호출은 종전처럼 0행).
--      결과는 매장 구분 없이 닉네임 그대로 · 가린 전화(010-****-5678) · 가린 실명 name_masked(김*혜 · 김* · 남**수). 실명 전체는 없다.
--   ③ 호출자 매장(감사 기록의 venue_id — 기존 계산 그대로) 단위 KST 하루 1만 회 상한. 결과가 나온 조회(result_count > 0)만 센다.
--      셈의 원천은 **기존 감사 표 phone_lookup_audit** 이다(새 표 없음). 상한이면 결과 유무와 무관하게 PT429 로 거절한다
--      (결과가 있을 때만 거절하면 '거절 = 그 번호의 회원이 있다' 가 새어 나간다). PostgREST 는 PT429 를 HTTP 429 로 낸다.
--      같은 매장의 동시 호출은 트랜잭션 advisory lock 으로 줄 세운다(1만 번째 경계에서 넘치지 않게).
--   ④ 회원 거부 장치: profiles.allow_venue_phone_lookup boolean not null default true · find_user_by_phone 은 false 회원을 뺀다 ·
--      set_my_phone_lookup(p_allow) 본인만(NULL 22023). 이름은 home-team 화면(PR #193 ProfileModal PhoneLookupSetting)과 맞춘 것 — 바꾸지 말 것.
--      칸 숨김은 칼럼 REVOKE 가 아니라 **기존 profiles 방식(RLS profiles_select = 본인·관리자 행만)** 을 따른다
--      — 클라이언트가 본인 행을 select('*') 로 읽기 때문(2026-10-06 실측: authenticated·anon 칼럼 권한 제한 0개, 정책 2개).
-- 라이브 출발점(2026-10-06 read_only 실측 md5(pg_get_functiondef); svr 은 s1+s2 리허설 안에서 잰 값):
--   search_registered_players ccbcf8f5bf35c35534b3c2612d8eb1af · search_voucher_recipients(s1 후) 850ddaaacc46c7c13195723625e21fe4
--   find_user_for_transfer 35ca1a8a04737b5fbb67a253557ac937 · search_ranking_members 2196b74c56130a14d8090be664969696
--   find_user_by_phone 2330ec4b4d85fdee8892428907c39315 (20260930d 본문)
-- 전이 폐쇄: 이 5개를 부르는 SQL 함수·정책·트리거 0(20260925h 실측 그대로). 클라 호출부: src/api/ledger.ts · vouchers.ts · rankings.ts.

do $gate$
declare bad text;
begin
  select string_agg(p.proname || '=' || md5(pg_get_functiondef(p.oid)), ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('search_registered_players','search_voucher_recipients','find_user_for_transfer','search_ranking_members','find_user_by_phone')
     and (p.proname, md5(pg_get_functiondef(p.oid))) not in (
       ('search_registered_players','ccbcf8f5bf35c35534b3c2612d8eb1af'),
       ('search_voucher_recipients','850ddaaacc46c7c13195723625e21fe4'),
       ('find_user_for_transfer','35ca1a8a04737b5fbb67a253557ac937'),
       ('search_ranking_members','2196b74c56130a14d8090be664969696'),
       ('find_user_by_phone','2330ec4b4d85fdee8892428907c39315'));
  if bad is not null then
    raise exception '20261006s3 게이트: 라이브 정의가 작성 때와 다르다(s1 을 먼저 적용했나?) — %', bad;
  end if;
  if to_regclass('public.phone_lookup_audit') is null then
    raise exception '20261006s3 게이트: phone_lookup_audit 이 없다';
  end if;
end $gate$;

-- ④ 거부 칸 — 상수 기본값이라 행 재작성 없이 메타데이터만 바뀐다(PG11+)
alter table public.profiles add column if not exists allow_venue_phone_lookup boolean not null default true;
comment on column public.profiles.allow_venue_phone_lookup is
  '매장 전화번호 조회 허용(처리방침 제9조④). false 면 find_user_by_phone 이 이 회원을 돌려주지 않는다. 본인은 set_my_phone_lookup 으로 바꾼다. (20261006s3)';

-- ③ 상한 셈용 색인(매장·시각, 결과 있는 조회만)
create index if not exists phone_lookup_audit_venue_hit_idx
  on public.phone_lookup_audit (venue_id, created_at) where result_count > 0;

-- ② 실명 가림 — 2자 김* · 3자 김*혜 · 4자+ 첫·끝만(남**수) · 1자 * · 빈값 null
create or replace function public._mask_name(p_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
           when s.n is null              then null
           when char_length(s.n) = 1     then '*'
           when char_length(s.n) = 2     then left(s.n, 1) || '*'
           else left(s.n, 1) || repeat('*', char_length(s.n) - 2) || right(s.n, 1)
         end
    from (select nullif(btrim(p_name), '') as n) s;
$$;
revoke all on function public._mask_name(text) from public, anon, authenticated;
grant execute on function public._mask_name(text) to service_role;

-- ① search_registered_players — 라이브 본문에서 pm 한 줄만: 닉네임·name 으로 맞으면 null
CREATE OR REPLACE FUNCTION public.search_registered_players(p_venue_id uuid, p_query text)
 RETURNS TABLE(user_id uuid, real_name text, nickname text, visits integer, phone_masked text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
           -- 20261006s3: 닉네임(·name = 닉네임 사본)으로 맞은 행은 전화를 싣지 않는다 — 실명으로만 맞은 내 손님만
           case when coalesce(p.nickname ilike '%' || btrim(p_query) || '%', false)
                  or coalesce(p.name ilike '%' || btrim(p_query) || '%', false) then null::text
                else public._mask_phone(p.phone) end as pm
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
$function$;
revoke all on function public.search_registered_players(uuid, text) from public, anon;
grant execute on function public.search_registered_players(uuid, text) to authenticated, service_role;

-- ① search_voucher_recipients — s1 본문에서 pm 한 줄만: 실명 정확 일치(내 손님)이고 닉네임은 안 맞는 행만
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
           -- 20261006s3: 닉네임(지금·옛)으로 맞은 행은 내 손님이어도 전화를 싣지 않는다
           case when r.uid is not null and lower(btrim(p.real_name)) = v_k
                     and not coalesce(p.nickname ilike v_like, false)
                then public._mask_phone(p.phone) end as pm
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

-- ① find_user_for_transfer — 닉네임 검색뿐이라 전화는 항상 null(rel 은 전화에만 쓰여 함께 뺐다)
CREATE OR REPLACE FUNCTION public.find_user_for_transfer(p_nickname text)
 RETURNS TABLE(id uuid, display text, verified boolean, phone_masked text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with q as (select btrim(coalesce(p_nickname, '')) as s)
  select p.id, p.nickname, public.is_ci_verified(p.ci_hash, p.verified_at),
         null::text   -- 20261006s3: 닉네임으로 찾은 행은 내 손님이어도 전화를 싣지 않는다
    from public.profiles p, q
   where char_length(q.s) >= 2
     and coalesce(p.status::text, 'active') = 'active'
     and p.id <> auth.uid()
     and p.nickname ilike '%' || replace(replace(replace(q.s, '\', '\\'), '%', '\%'), '_', '\_') || '%'
   order by (lower(btrim(p.nickname)) = lower(q.s)) desc, public.is_ci_verified(p.ci_hash, p.verified_at) desc, p.nickname
   limit 8;
$function$;
revoke all on function public.find_user_for_transfer(text) from public, anon;
grant execute on function public.find_user_for_transfer(text) to authenticated, service_role;

-- ① search_ranking_members — 닉네임 검색뿐이라 전화는 항상 null
CREATE OR REPLACE FUNCTION public.search_ranking_members(p_q text)
 RETURNS TABLE(id uuid, nickname text, real_name text, verified boolean, phone_masked text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with rel as materialized (
    select t.uid from public._venue_customer_ids(public._my_ledger_venue_ids()) t
  ),
  hit as (
    select p.id as uid,
           p.nickname as nick,
           null::text as rn,
           public.is_ci_verified(p.ci_hash, p.verified_at) as ver,
           coalesce(lower(btrim(p.nickname)) = lower(btrim(coalesce(p_q, ''))), false) as is_exact,
           null::text as pm   -- 20261006s3: 닉네임으로 찾은 행은 내 손님이어도 전화를 싣지 않는다
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
$function$;
revoke all on function public.search_ranking_members(text) from public, anon;
grant execute on function public.search_ranking_members(text) to authenticated, service_role;

-- ②③④ find_user_by_phone — 반환 칸(name_masked)이 늘어 DROP 후 재생성 → ACL 이 초기화되므로 아래 REVOKE/GRANT 가 필수다
drop function if exists public.find_user_by_phone(text);
create function public.find_user_by_phone(p_phone text)
returns table(id uuid, display text, verified boolean, phone_masked text, name_masked text)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_allowed boolean; v_venue uuid; v_n int; v_used int;
begin
  -- 20260926c: 승인된 매장(kind=venue) 업주·공동운영자·관리자만. 20260926a D6: phone_hash 저장 안 함.
  -- 20260930d: 공동 운영자도 프로필 승인이 있어야 한다(_venue_coowner_ok).
  v_allowed := public.my_role() = 'admin'
            or exists (select 1 from public.venues v
                        where v.owner_id = auth.uid() and v.kind = 'venue' and public._venue_owner_ok(v.id))
            or exists (select 1 from public.venue_owners vo
                        where vo.user_id = auth.uid() and public._venue_coowner_ok(vo.venue_id, vo.user_id));
  if not coalesce(v_allowed, false) then
    return;   -- 종전과 같이 0행 — 손님 지갑(VoucherWallet·MyVoucherSheet)의 '업주 확인' 이 이 0행에 기댄다(기록·상한 없음)
  end if;
  -- 20261006s3 ②: '010' + 숫자 8자리만(하이픈·공백·9·10자리·국가번호 전부 거절)
  if p_phone is null or p_phone !~ '^010[0-9]{8}$' then
    raise exception using errcode = '22023', message = '휴대전화번호는 010 뒤 숫자 8자리로 입력해 주세요';
  end if;
  v_venue := coalesce(
    (select v.id from public.venues v where v.owner_id = auth.uid() and v.kind = 'venue' order by v.id limit 1),
    (select vo.venue_id from public.venue_owners vo where vo.user_id = auth.uid() and vo.status = 'approved' order by vo.venue_id limit 1),
    (select pr.venue_id from public.profiles pr where pr.id = auth.uid()));
  -- 20261006s3 ③: 매장 단위 KST 하루 1만 회(결과 있는 조회만). 매장이 없으면(관리자) 호출자 단위.
  perform pg_advisory_xact_lock(hashtextextended('find_user_by_phone:' || coalesce(v_venue::text, 'caller:' || auth.uid()::text), 0));
  select count(*) into v_used
    from public.phone_lookup_audit a
   where a.result_count > 0
     and a.created_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
     and (a.venue_id = v_venue or (v_venue is null and a.venue_id is null and a.caller = auth.uid()));
  if v_used >= 10000 then
    raise exception using errcode = 'PT429', message = '오늘 조회 한도를 넘었습니다. 내일 다시 시도해 주세요';
  end if;
  return query
  select p.id, coalesce(p.nickname, p.name), public.is_ci_verified(p.ci_hash, p.verified_at),
         public._mask_phone(p.phone), public._mask_name(p.real_name)
    from public.profiles p
   where coalesce(p.status::text, 'active') = 'active'
     and p.allow_venue_phone_lookup   -- 20261006s3 ④: 거부한 회원은 뺀다
     and regexp_replace(coalesce(p.phone,''), '[^0-9]', '', 'g') <> ''
     and right(regexp_replace(coalesce(p.phone,''), '[^0-9]', '', 'g'), 10) = right(p_phone, 10)
   limit 5;
  get diagnostics v_n = row_count;
  insert into public.phone_lookup_audit(caller, venue_id, phone_last4, result_count)
  values (auth.uid(), v_venue, right(p_phone, 4), v_n);
  return;
end $function$;
revoke all on function public.find_user_by_phone(text) from public, anon;
grant execute on function public.find_user_by_phone(text) to authenticated, service_role;
comment on function public.find_user_by_phone(text) is
  '전화번호→회원(승인 업주·공동운영자·관리자). 입력 010+8자리만(22023). 매장 단위 KST 하루 1만 회(결과 있는 조회, phone_lookup_audit 로 셈, 초과 PT429). allow_venue_phone_lookup=false 회원 제외. 닉네임·가린 전화·가린 실명만. (20261006s3)';

-- ④ 본인 설정
create or replace function public.set_my_phone_lookup(p_allow boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = '로그인이 필요합니다';
  end if;
  if p_allow is null then
    raise exception using errcode = '22023', message = '허용 여부를 지정해 주세요';
  end if;
  update public.profiles set allow_venue_phone_lookup = p_allow where id = auth.uid();
end $function$;
revoke all on function public.set_my_phone_lookup(boolean) from public, anon;
grant execute on function public.set_my_phone_lookup(boolean) to authenticated, service_role;

-- 자가검사
do $self$
declare v_fail text[] := '{}'; r record;
begin
  for r in select * from (values ('김민혜', '김*혜'), ('김수', '김*'), ('남궁민수', '남**수'), ('제갈공명님', '제***님'),
                                 (' 김민혜 ', '김*혜'), ('김', '*'), ('', null), (null::text, null)) as t(i, e) loop
    if public._mask_name(r.i) is distinct from r.e then v_fail := v_fail || format('mask_name(%L)=%L 기대 %L', r.i, public._mask_name(r.i), r.e); end if;
  end loop;
  for r in select * from (values
      ('public.search_registered_players(uuid,text)', true), ('public.search_voucher_recipients(uuid,text)', true),
      ('public.find_user_for_transfer(text)', true), ('public.search_ranking_members(text)', true),
      ('public.find_user_by_phone(text)', true), ('public.set_my_phone_lookup(boolean)', true),
      ('public._mask_name(text)', false)) as t(fn, auth_ok) loop
    if has_function_privilege('anon', r.fn, 'execute') then v_fail := v_fail || ('anon 실행 가능: ' || r.fn); end if;
    if has_function_privilege('authenticated', r.fn, 'execute') is distinct from r.auth_ok then v_fail := v_fail || ('authenticated 권한 기대와 다름: ' || r.fn); end if;
    if (select proconfig from pg_proc where oid = r.fn::regprocedure) is distinct from array['search_path=public, pg_temp'] then
      v_fail := v_fail || ('search_path: ' || r.fn); end if;
  end loop;
  if pg_get_functiondef('public.find_user_for_transfer(text)'::regprocedure) ~ '_mask_phone'
     or pg_get_functiondef('public.search_ranking_members(text)'::regprocedure) ~ '_mask_phone' then
    v_fail := v_fail || '닉네임 전용 검색이 전화를 싣는다'::text; end if;
  if pg_get_functiondef('public.find_user_by_phone(text)'::regprocedure) !~ 'allow_venue_phone_lookup'
     or pg_get_functiondef('public.find_user_by_phone(text)'::regprocedure) !~ 'PT429'
     or pg_get_functiondef('public.find_user_by_phone(text)'::regprocedure) !~ '_mask_name\(p\.real_name\)'
     or (select count(*) from regexp_matches(pg_get_functiondef('public.find_user_by_phone(text)'::regprocedure), 'real_name', 'g')) <> 1 then
    v_fail := v_fail || 'find_user_by_phone 거부·상한·실명 가림 중 빠진 것'::text; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
                  and column_name = 'allow_venue_phone_lookup' and is_nullable = 'NO' and column_default = 'true') then
    v_fail := v_fail || 'allow_venue_phone_lookup 칸'::text; end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'allow_venue_phone_lookup', 'select') then
    v_fail := v_fail || '본인 select * 가 깨진다(칼럼 권한)'::text; end if;
  if array_length(v_fail, 1) > 0 then
    raise exception E'20261006s3 자가검사 실패 %건:\n%', array_length(v_fail, 1), array_to_string(v_fail, E'\n');
  end if;
end $self$;

notify pgrst, 'reload schema';

-- ROLLBACK(먼저 위 다섯 함수의 md5 가 이 파일 적용 직후 값인지 본다 — 그 뒤 다른 마이그레이션이 얹혔으면 그것부터)
--   네 검색 함수: 위 게이트 md5 의 정의(20260925h·20260930d·s1)로 되돌린다(반환 타입 같음 → CREATE OR REPLACE).
--   find_user_by_phone: DROP 후 20260930d 정의로 재생성 + revoke public, anon / grant authenticated, service_role.
--   drop function public.set_my_phone_lookup(boolean); drop function public._mask_name(text);
--   drop index public.phone_lookup_audit_venue_hit_idx;
--   profiles.allow_venue_phone_lookup 은 회원이 고른 값이라 지우지 않는다(남겨도 무해).
