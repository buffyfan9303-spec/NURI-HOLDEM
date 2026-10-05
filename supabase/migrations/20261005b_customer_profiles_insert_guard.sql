-- 초안 (store-team 2026-10-05) — 미적용. 적용 판단·실행은 리드. 리허설: supabase/tests/20261005b_rehearsal.sql
-- 20261005b — '내 고객' 관계를 업주가 만들어 낼 수 없게 한다 (critical 보고 2026-10-04/05 D)
--
-- 구멍: customer_profiles_pos_all(ALL · using/with check = can_manage_pos(venue_id))
--   업주·공동 운영자가 아무 회원의 user_id 로 자기 매장 customer_profiles 행을 INSERT 하거나, 이름만 있는 행의 user_id 를 UPDATE 할 수 있었다.
--   그 행은 _venue_customer_ids 에 들어가고, 이를 쓰는 5개 RPC(find_user_for_transfer · search_voucher_recipients ·
--   search_registered_players · search_ranking_members · resolve_ranking_members)가 그 회원의 전화번호를 _mask_phone(앞3·뒤4)으로 보여 준다.
--   link_customer_alias(RPC)도 같은 구멍이다 — 화면의 회원 검색(find_user_for_transfer)은 **모든** 회원을 닉네임으로 보여 주고,
--   고른 회원으로 customer_profiles(user_id) 행을 만든다. 즉 화면 조작만으로도 관계를 만들 수 있었다.
--
-- customer_profiles 쓰기 경로 전수(2026-10-05 라이브 prosrc ilike + pg_policies + 저장소 grep):
--   클라 saveCustomerProfile  upsert (venue_id,name,birthday,phone,memo,updated_at) on conflict(venue_id,name) — user_id 를 싣지 않는다 → 유지
--   클라 deleteCustomerProfile delete — 유지
--   _apply_checkin            check_in(손님 본인 QR) · staff_check_in(손님의 오늘 요청·참가 신청이 있어야) — 정당 → 그대로
--   _apply_venue_visit        _voucher_used_checkin 트리거(이용권 사용) — 정당 → 그대로
--   link_customer_alias       업주가 고른 아무 회원 — ③ 에서 관계 확인을 넣는다
--   kill_venue                삭제 — 그대로
-- 관계의 다른 원천은 이미 닫혀 있다: checkins 는 INSERT 정책 없음(정의자 함수만) · schedule_reservations INSERT 는 user_id = auth.uid().
--
-- 바꾸는 것
--   ① 표 권한: authenticated 의 표 단위 INSERT/UPDATE 를 거두고 (venue_id, name, birthday, phone, memo, updated_at) 칸에만 다시 준다.
--      user_id · visit_count · first_visit_at · last_visit_at 은 서버(정의자 함수)만 쓴다. — 이것이 UPDATE 로 user_id 를 바꾸는 길도 막는다
--      (RLS with check 는 옛 값을 못 봐서 UPDATE 를 막지 못한다).
--      venue_id·name 이 UPDATE 칸에 있는 이유: PostgREST upsert 는 on conflict do update set 에 실은 칸 전부를 쓴다.
--   ② 정책: pos_all 을 select/insert/update/delete 넷으로 나누고 insert 에 user_id is null — 누가 표 단위 GRANT 를 다시 줘도
--      user_id 행 INSERT 는 막힌다(이중 잠금). 대상 역할 public → authenticated(비로그인은 원래 can_manage_pos 가 거짓).
--   ③ link_customer_alias: 대상 회원이 이 매장과 이미 관계가 있을 때만 — _venue_customer_ids(이 매장) 안에 있거나,
--      이 매장에 출석 요청(checkin_requests)·앱 참가 신청(ledger_buyin_requests 중 voucher_id 없는 행 = 손님이 보낸 것)을 보낸 회원.
--      불변식: 연결이 _venue_customer_ids 를 '손님이 먼저 손을 든 적 없는 회원' 쪽으로 넓히지 않는다.
--      (이용권 자동 생성 신청 행 voucher_id 는 업주가 아무에게나 보낸 이용권에서 나올 수 있어 넣지 않는다 — staff_check_in 과 같은 기준.)
--
-- 기존 데이터(2026-10-05 읽기 조회): customer_profiles 5행 전부 user_id null(관계 없는 user 행 0) · customer_aliases 0행. 삭제·변경 없음.
-- 되돌리기: grant insert, update on public.customer_profiles to authenticated; 정책 넷을 지우고 pos_all 재생성;
--          link_customer_alias 를 아래 §0 md5 의 본문(20260623m)으로 create or replace(같은 시그니처 → ACL 보존).

-- §0 적용 전 게이트 — 라이브 link_customer_alias 가 2026-10-05 실측 본문이거나 이 파일 본문(재적용)이어야 한다.
do $pre$
declare s text := (select prosrc from pg_proc where oid = 'public.link_customer_alias(uuid,text,uuid)'::regprocedure);
begin
  if not (md5(s) = '66990a7635a7dc3cd1caac6d6d944811' or s like '%20261005b%') then
    raise exception '20261005b: link_customer_alias 라이브 본문이 예상과 다릅니다(md5 %) — 그 사이 바뀐 내용을 먼저 합치세요', md5(s);
  end if;
end $pre$;

-- ① 표 권한 — 칸 단위
revoke insert, update on public.customer_profiles from public, anon, authenticated;
grant insert (venue_id, name, birthday, phone, memo, updated_at),
      update (venue_id, name, birthday, phone, memo, updated_at)
   on public.customer_profiles to authenticated;
-- server-only column: user_id
-- server-only column: visit_count
-- server-only column: first_visit_at
-- server-only column: last_visit_at

-- ② 정책 분리
drop policy if exists customer_profiles_pos_all on public.customer_profiles;
drop policy if exists customer_profiles_pos_select on public.customer_profiles;
drop policy if exists customer_profiles_pos_insert on public.customer_profiles;
drop policy if exists customer_profiles_pos_update on public.customer_profiles;
drop policy if exists customer_profiles_pos_delete on public.customer_profiles;
create policy customer_profiles_pos_select on public.customer_profiles for select to authenticated
  using (public.can_manage_pos(venue_id));
create policy customer_profiles_pos_insert on public.customer_profiles for insert to authenticated
  with check (public.can_manage_pos(venue_id) and user_id is null);
create policy customer_profiles_pos_update on public.customer_profiles for update to authenticated
  using (public.can_manage_pos(venue_id)) with check (public.can_manage_pos(venue_id));
create policy customer_profiles_pos_delete on public.customer_profiles for delete to authenticated
  using (public.can_manage_pos(venue_id));

-- ③ link_customer_alias — 관계 확인 한 블록만 더한다(나머지 본문은 라이브 그대로)
create or replace function public.link_customer_alias(p_venue_id uuid, p_alias text, p_user_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_alias text := btrim(coalesce(p_alias,'')); v_disp text;
begin
  if not public.can_manage_pos(p_venue_id) then raise exception '권한이 없습니다'; end if;
  if v_alias = '' or p_user_id is null then raise exception '연결 대상을 지정하세요'; end if;
  -- 20261005b: 이 매장과 관계 있는 회원만 — 연결이 '내 고객'(_venue_customer_ids, 전화번호 마스킹 해제 기준)을 만들어 내지 않게.
  if not exists (select 1 from public._venue_customer_ids(array[p_venue_id]) t where t.uid = p_user_id)
     and not exists (select 1 from public.checkin_requests r where r.venue_id = p_venue_id and r.user_id = p_user_id)
     and not exists (select 1 from public.ledger_buyin_requests b
                      where b.venue_id = p_venue_id and b.user_id = p_user_id and b.voucher_id is null) then
    -- P0001(기본) — 화면(msgOf)이 이 문장을 그대로 보여 준다. 42501 이면 '권한이 없습니다' 로 바뀌어 업주가 이유를 모른다.
    raise exception '이 매장에 출석·예약·참가 신청 기록이 있는 회원만 연결할 수 있습니다';
  end if;
  insert into public.customer_aliases(venue_id, alias, user_id) values (p_venue_id, v_alias, p_user_id)
    on conflict (venue_id, alias) do update set user_id = excluded.user_id, created_at = now();
  select coalesce(nullif(btrim(nickname),''), name) into v_disp from public.profiles where id = p_user_id;
  insert into public.customer_profiles(venue_id, user_id, name, visit_count)
    values (p_venue_id, p_user_id, coalesce(v_disp, v_alias), 0)
    on conflict (venue_id, user_id) where user_id is not null do nothing;
  -- 동명(대소문자·공백 무시) 미연결 row 들의 방문수를 회원 row 로 합산 후 삭제
  update public.customer_profiles t set
    visit_count = coalesce(t.visit_count,0) + coalesce((select sum(visit_count) from public.customer_profiles o where o.venue_id=p_venue_id and o.user_id is null and lower(btrim(o.name))=lower(v_alias)),0),
    first_visit_at = least(t.first_visit_at, (select min(first_visit_at) from public.customer_profiles o where o.venue_id=p_venue_id and o.user_id is null and lower(btrim(o.name))=lower(v_alias))),
    last_visit_at = greatest(t.last_visit_at, (select max(last_visit_at) from public.customer_profiles o where o.venue_id=p_venue_id and o.user_id is null and lower(btrim(o.name))=lower(v_alias))),
    updated_at = now()
   where t.venue_id = p_venue_id and t.user_id = p_user_id;
  delete from public.customer_profiles where venue_id = p_venue_id and user_id is null and lower(btrim(name)) = lower(v_alias);
end $function$;
revoke all on function public.link_customer_alias(uuid, text, uuid) from public, anon;
grant execute on function public.link_customer_alias(uuid, text, uuid) to authenticated, service_role;

-- §9 자가검사 — 하나라도 어긋나면 적용 전체를 되돌린다
do $check$
begin
  if has_column_privilege('authenticated', 'public.customer_profiles', 'user_id', 'INSERT')
     or has_column_privilege('authenticated', 'public.customer_profiles', 'user_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.customer_profiles', 'visit_count', 'UPDATE')
     or has_table_privilege('anon', 'public.customer_profiles', 'INSERT')
     or has_table_privilege('anon', 'public.customer_profiles', 'UPDATE') then
    raise exception '20261005b 자가검사: user_id·방문 집계 칸이 클라이언트에 열려 있다';
  end if;
  if not (has_column_privilege('authenticated', 'public.customer_profiles', 'memo', 'INSERT')
      and has_column_privilege('authenticated', 'public.customer_profiles', 'birthday', 'UPDATE')
      and has_column_privilege('authenticated', 'public.customer_profiles', 'venue_id', 'UPDATE')
      and has_column_privilege('authenticated', 'public.customer_profiles', 'name', 'UPDATE')
      and has_table_privilege('authenticated', 'public.customer_profiles', 'SELECT')
      and has_table_privilege('authenticated', 'public.customer_profiles', 'DELETE')) then
    raise exception '20261005b 자가검사: 손님 메모 저장(upsert)·삭제에 필요한 권한이 빠졌다';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customer_profiles' and policyname = 'customer_profiles_pos_all')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customer_profiles'
                     and policyname = 'customer_profiles_pos_insert' and with_check ilike '%user_id IS NULL%')
     or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'customer_profiles') <> 4 then
    raise exception '20261005b 자가검사: customer_profiles 정책이 기대(넷, insert 에 user_id is null)와 다르다';
  end if;
  if has_function_privilege('anon', 'public.link_customer_alias(uuid,text,uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.link_customer_alias(uuid,text,uuid)', 'EXECUTE')
     or (select prosrc from pg_proc where oid = 'public.link_customer_alias(uuid,text,uuid)'::regprocedure) not like '%_venue_customer_ids(array[p_venue_id])%' then
    raise exception '20261005b 자가검사: link_customer_alias 관계 확인 또는 ACL 이 기대와 다르다';
  end if;
end $check$;
