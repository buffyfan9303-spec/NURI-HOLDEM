-- 초안 (store-team 2026-10-06) — 미적용. 적용 판단·실행은 리드. 리허설: supabase/tests/20261006a_rehearsal.sql (+ 20261005b_rehearsal.sql 회귀)
-- 라이브 롤백 리허설 결과는 PR 본문(#182)에 있다 — critical 반증(X1·X8) 반영판.
-- 20261006a — 장부명↔회원 연결이 '같은 이름의 미연결 고객 행'에서 23505 로 실패하던 것 (audit8-regress-connect.md#R8-01)
--
-- 결함: link_customer_alias 의 insert(name = 회원 표시 이름)가 on conflict (venue_id, user_id) 하나뿐이라,
--   업주가 장부 이름 X 로 메모를 먼저 저장해 둔 미연결 행(user_id null, name = X)이 있고 회원 닉네임도 X 면
--   (venue_id, name) 유일 키 customer_profiles_venue_id_name_key 에 걸려 23505. 원인 줄 20260623m:24-26 이 그대로 라이브에 있다.
--   #181(20261005b) 이 user_id 직접 수정을 막아 업주가 우회할 길도 없다(남은 우회 = 행 삭제 → 메모·생일·방문수 손실).
--   그리고 회원 행이 이미 있을 때의 병합은 방문수만 합치고 미연결 행을 지워 **메모·생일·전화가 사라졌다**.
--
-- 바꾸는 것 — link_customer_alias 의 고객 행 확보·병합만. 관계 확인(20261005b ③)·별칭 기록·권한 판정은 라이브 본문 그대로.
--   ① 회원 행(venue_id, user_id)이 있으면 그 행이 대상.
--   ② 없으면 이름(대소문자·공백 무시)이 장부 이름 또는 회원 표시 이름과 같은 미연결 행에 user_id 를 묶는다 — 그 행의
--      메모·생일·전화·방문수가 그대로 남는다. _apply_checkin·_apply_venue_visit 의 '동명 미연결 행에 연결' 단계와 같은 규칙.
--      표시 이름과 정확히 같은 행을 먼저 고른다(그 행을 두고 새로 만들면 유일 키 충돌이 난다).
--   ③ 그래도 없으면 새로 만든다. 표시 이름이 이미 다른 행(다른 회원에 묶인 장부 이름 등)에 쓰였으면 장부 이름,
--      그것도 쓰였으면 '표시 이름 #회원id 앞 8자' — 연결이 이름 충돌로 실패하지 않게.
--   ④ 남은 미연결 동명(장부 이름) 행을 대상 행에 합치고 지운다:
--      방문수 합산 · 첫 방문 최소 · 마지막 방문 최대(20260623m 그대로) — 그리고 새로
--      생일·전화는 대상 행 값이 비었을 때만 최근 저장한 값으로 채우고, 메모는 대상 메모 뒤에 줄바꿈으로 이어 붙인다(같은 메모는 한 번만).
--      저장소에 메모 병합 선례가 없어(20260623m·_apply_checkin 은 메모를 건드리지 않는다) '버리지 않는다' 를 최소 규칙으로 정했다.
--
-- 20261005b 불변식 유지: 관계 확인 블록·칸 GRANT(user_id·방문 집계 서버 전용)·비정의자 트리거 trg_guard_customer_profile_link.
--   ② 의 user_id UPDATE 는 정의자 함수 안(current_user = postgres)이라 트리거를 통과한다 — 클라는 여전히 못 한다.
--
-- (critical 반증 X1·X8 — 근본 원인은 _apply_checkin·_apply_venue_visit) 고객 행 이름은 장부 이름으로 남을 수 있어서, 다른 회원 u3 에
--   묶인 행의 이름이 회원 u4 의 닉네임과 같을 수 있다. 그때 u4 의 방문·출석 3단계 insert … on conflict (venue_id, name) do update 가
--   **u3 행에 방문을 더하고**(user_id 는 coalesce 로 u3 유지) u4 행은 생기지 않았다. 6a 의 묶기가 이 상황을 더 자주 만들고(X1),
--   6a 없이도 업주가 장부명을 연결하면 같은 일이 난다(X8 — 라이브 본문에서도 FAIL).
--   ⓪ 두 함수의 3단계 do update 에 `where 기존 행 user_id is null or = p_uid` 를 걸고, 걸리지 않으면(not found)
--      '표시 이름 #회원id 앞 8자' 로 이 회원 행을 따로 만든다(on conflict do nothing). 포인트·연속 출석·checkins 행 등 다른 분기는 그대로.
-- 기존 데이터(2026-10-06 읽기 조회 ro.mjs): customer_profiles 5행 전부 user_id null · customer_aliases 0행. 이 파일은 행을 바꾸지 않는다.
-- 되돌리기: link_customer_alias 를 20261005b 의 ③ 본문으로, _apply_checkin 을 20260905k 본문으로, _apply_venue_visit 을 20260921b 본문으로
--   create or replace(같은 시그니처 → ACL 보존). 표·정책·트리거는 건드리지 않는다.

-- §0 적용 전 게이트 — 세 함수의 라이브 본문이 2026-10-06 실측 md5(prosrc) 그대로이거나, 이 파일 본문 전체(재적용)여야 한다.
--   재적용 판별은 '주석·공백을 지운 본문'의 md5 전체 일치다 — 적용 경로가 -- 주석을 지우고(audit8 §4) 체크아웃이 줄끝을 CRLF 로
--   바꿔도 같은 값이 나오게. 일부 조각(like)으로 보면 나중에 바뀐 본문을 이 파일이 덮어쓸 수 있다(critical P3).
do $pre$
declare g record; s text;
begin
  for g in select * from (values
      ('public.link_customer_alias(uuid,text,uuid)', '4dcf9813b6ecc0f1ad1095fe6c62bab2', 'd75c18bd90fcf97b96ab2c80f5b91c64'),
      ('public._apply_checkin(uuid,uuid)',           'f3e16d1634102932f15b50a0b8117875', '2bad93fed17811bc5e0e55ddcfbf43b6'),
      ('public._apply_venue_visit(uuid,uuid)',       'c72b76c1539ec2c2c02175c64c3af1b4', 'b946a6dbc26ee903f60492c9826e2c54')) v(sig, live_md5, new_norm)
  loop
    s := (select prosrc from pg_proc where oid = g.sig::regprocedure);
    -- 정규화: 주석(대시 두 개 ~ 줄끝) 제거 → 공백 전부 제거. 패턴에 대시 두 개를 그대로 쓰지 않는다(주석 제거기가 리터럴을 자를 수 있다).
    if md5(s) is distinct from g.live_md5
       and md5(regexp_replace(regexp_replace(s, '[-]{2}[^\n]*', '', 'g'), '\s+', '', 'g')) is distinct from g.new_norm then
      raise exception '20261006a: % 라이브 본문이 예상과 다릅니다(md5 %) — 그 사이 바뀐 내용을 먼저 합치세요', g.sig, md5(s);
    end if;
  end loop;
end $pre$;

-- ⓪-1 _apply_checkin — 3단계(이름 충돌) 한 곳만 바꾼다. 나머지 본문은 2026-10-06 라이브(f3e16d16…) 그대로.
create or replace function public._apply_checkin(p_venue_id uuid, p_uid uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_disp text; v_today_cnt int; v_today date; v_last date; v_streak int; v_pts int := 0;
begin
  v_today := (now() at time zone 'Asia/Seoul')::date;
  select count(*) into v_today_cnt from public.checkins
   where venue_id = p_venue_id and user_id = p_uid
     and created_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  select coalesce(nickname, name) into v_disp from public.profiles where id = p_uid;
  insert into public.checkins(venue_id, user_id, display_name) values (p_venue_id, p_uid, v_disp);
  if v_today_cnt = 0 then
    v_pts := v_pts + 3;
    update public.profiles set activity_points = coalesce(activity_points, 0) + 3 where id = p_uid;
  end if;
  select last_checkin_date, checkin_streak into v_last, v_streak from public.profiles where id = p_uid;
  if v_last is distinct from v_today then
    if v_last = v_today - 1 then v_streak := coalesce(v_streak, 0) + 1; else v_streak := 1; end if;
    v_pts := v_pts + (case when v_streak % 7 = 0 then 10 else 0 end);
    update public.profiles set checkin_streak = v_streak, last_checkin_date = v_today,
           activity_points = coalesce(activity_points, 0) + (case when v_streak % 7 = 0 then 10 else 0 end)
     where id = p_uid;
  end if;
  update public.customer_profiles
     set visit_count = coalesce(visit_count,0) + 1, last_visit_at = now(),
         name = coalesce(nullif(btrim(name),''), v_disp), updated_at = now()
   where venue_id = p_venue_id and user_id = p_uid;
  if not found then
    update public.customer_profiles
       set user_id = p_uid, visit_count = coalesce(visit_count,0) + 1, last_visit_at = now(), updated_at = now()
     where venue_id = p_venue_id and user_id is null and lower(btrim(name)) = lower(btrim(v_disp));
    if not found then
      insert into public.customer_profiles(venue_id, user_id, name, visit_count, first_visit_at, last_visit_at)
      values (p_venue_id, p_uid, v_disp, 1, now(), now())
      on conflict (venue_id, name) do update
        set user_id = coalesce(public.customer_profiles.user_id, excluded.user_id),
            visit_count = coalesce(public.customer_profiles.visit_count,0) + 1,
            last_visit_at = now(), updated_at = now()
        where public.customer_profiles.user_id is null or public.customer_profiles.user_id = p_uid;
      if not found then
        -- 20261006a: 그 이름이 다른 회원의 행이면 거기에 방문을 더하지 않고 이 회원 행을 따로 만든다(critical X1·X8)
        insert into public.customer_profiles(venue_id, user_id, name, visit_count, first_visit_at, last_visit_at)
        values (p_venue_id, p_uid, v_disp || ' #' || left(p_uid::text, 8), 1, now(), now())
        on conflict do nothing;
      end if;
    end if;
  end if;
  return jsonb_build_object('points', v_pts, 'streak', coalesce(v_streak, 0));
end $function$;
revoke all on function public._apply_checkin(uuid, uuid) from public, anon, authenticated;
grant execute on function public._apply_checkin(uuid, uuid) to service_role;

-- ⓪-2 _apply_venue_visit — 같은 한 곳. 나머지는 2026-10-06 라이브(c72b76c1…) 그대로.
create or replace function public._apply_venue_visit(p_venue_id uuid, p_uid uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_disp text;
begin
  select coalesce(nickname, name) into v_disp from public.profiles where id = p_uid;
  update public.customer_profiles
     set visit_count = coalesce(visit_count,0) + 1, last_visit_at = now(),
         name = coalesce(nullif(btrim(name),''), v_disp), updated_at = now()
   where venue_id = p_venue_id and user_id = p_uid;
  if not found then
    update public.customer_profiles
       set user_id = p_uid, visit_count = coalesce(visit_count,0) + 1, last_visit_at = now(), updated_at = now()
     where venue_id = p_venue_id and user_id is null and lower(btrim(name)) = lower(btrim(v_disp));
    if not found then
      insert into public.customer_profiles(venue_id, user_id, name, visit_count, first_visit_at, last_visit_at)
      values (p_venue_id, p_uid, v_disp, 1, now(), now())
      on conflict (venue_id, name) do update
        set user_id = coalesce(public.customer_profiles.user_id, excluded.user_id),
            visit_count = coalesce(public.customer_profiles.visit_count,0) + 1,
            last_visit_at = now(), updated_at = now()
        where public.customer_profiles.user_id is null or public.customer_profiles.user_id = p_uid;
      if not found then
        -- 20261006a: 그 이름이 다른 회원의 행이면 거기에 방문을 더하지 않고 이 회원 행을 따로 만든다(critical X1·X8)
        insert into public.customer_profiles(venue_id, user_id, name, visit_count, first_visit_at, last_visit_at)
        values (p_venue_id, p_uid, v_disp || ' #' || left(p_uid::text, 8), 1, now(), now())
        on conflict do nothing;
      end if;
    end if;
  end if;
end $function$;
revoke all on function public._apply_venue_visit(uuid, uuid) from public, anon, authenticated;
grant execute on function public._apply_venue_visit(uuid, uuid) to service_role;

create or replace function public.link_customer_alias(p_venue_id uuid, p_alias text, p_user_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_alias text := btrim(coalesce(p_alias,'')); v_disp text; v_name text; v_tgt uuid;
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
  v_name := coalesce(nullif(btrim(v_disp),''), v_alias);

  -- 20261006a ① 회원 행
  select id into v_tgt from public.customer_profiles where venue_id = p_venue_id and user_id = p_user_id;
  -- ② 동명 미연결 행에 회원을 묶는다(메모·생일·전화·방문수 보존). 표시 이름과 정확히 같은 행이 먼저 — 남겨 두면 (venue_id,name) 충돌.
  if v_tgt is null then
    select id into v_tgt from public.customer_profiles
     where venue_id = p_venue_id and user_id is null and lower(btrim(name)) in (lower(v_alias), lower(v_name))
     order by (name = v_name) desc, (lower(btrim(name)) = lower(v_alias)) desc, updated_at desc, id
     limit 1;
    if v_tgt is not null then
      update public.customer_profiles set user_id = p_user_id, updated_at = now() where id = v_tgt;
    end if;
  end if;
  -- ③ 새 회원 행 — 이름이 이미 쓰였으면 장부 이름, 그다음 '표시 이름 #id8'
  if v_tgt is null then
    insert into public.customer_profiles(venue_id, user_id, name, visit_count)
      select p_venue_id, p_user_id, c.n, 0
        from (values (1, v_name), (2, v_alias), (3, v_name || ' #' || left(p_user_id::text, 8))) c(k, n)
       where not exists (select 1 from public.customer_profiles x where x.venue_id = p_venue_id and x.name = c.n)
       order by c.k limit 1
      on conflict do nothing
      returning id into v_tgt;
    if v_tgt is null then  -- 같은 순간 다른 연결이 회원 행을 만들었다
      select id into v_tgt from public.customer_profiles where venue_id = p_venue_id and user_id = p_user_id;
    end if;
    if v_tgt is null then raise exception '고객 정보를 만들지 못했습니다. 다시 시도해 주세요'; end if;
  end if;

  -- ④ 남은 동명(장부 이름) 미연결 행을 대상 행에 합친 뒤 지운다 — 방문 집계 합산, 생일·전화는 빈 칸만 채우고, 메모는 이어 붙인다
  update public.customer_profiles t set
    visit_count = coalesce(t.visit_count,0) + coalesce(m.vc,0),
    first_visit_at = least(t.first_visit_at, m.fv),
    last_visit_at = greatest(t.last_visit_at, m.lv),
    birthday = coalesce(t.birthday, m.bd),
    phone = case when nullif(btrim(t.phone),'') is null then coalesce(m.ph, t.phone) else t.phone end,
    memo = coalesce(nullif(concat_ws(E'\n', nullif(btrim(t.memo),''), m.memo), ''), t.memo),
    updated_at = now()
  from (select sum(o.visit_count) vc, min(o.first_visit_at) fv, max(o.last_visit_at) lv,
               (array_agg(o.birthday order by o.updated_at desc) filter (where o.birthday is not null))[1] bd,
               (array_agg(btrim(o.phone) order by o.updated_at desc) filter (where nullif(btrim(o.phone),'') is not null))[1] ph,
               string_agg(btrim(o.memo), E'\n' order by o.updated_at)
                 filter (where nullif(btrim(o.memo),'') is not null
                           and btrim(o.memo) is distinct from (select btrim(z.memo) from public.customer_profiles z where z.id = v_tgt))  memo
          from public.customer_profiles o
         where o.venue_id = p_venue_id and o.user_id is null and lower(btrim(o.name)) = lower(v_alias)) m
  where t.id = v_tgt;
  delete from public.customer_profiles where venue_id = p_venue_id and user_id is null and lower(btrim(name)) = lower(v_alias);
end $function$;
-- create or replace 는 ACL 을 보존한다 — 아래 두 줄은 함수가 새로 만들어지는 경우를 위한 관행이다(CLAUDE.md 보안 3).
revoke all on function public.link_customer_alias(uuid, text, uuid) from public, anon;
grant execute on function public.link_customer_alias(uuid, text, uuid) to authenticated, service_role;

-- §9 자가검사 — 하나라도 어긋나면 적용 전체를 되돌린다
--   ⚠ 한계: 세 함수 모두 이미 라이브에 있어 create or replace 가 ACL 을 보존한다 → 이 파일의 revoke/grant 줄을 지워도 아래 ACL 항목은
--   통과한다(CLAUDE.md 보안 3). 그리고 20261004b 기본 권한(fail-closed) 때문에 새 함수도 anon·PUBLIC 실행이 처음부터 없다.
--   그래서 ACL 항목은 '파일이 권한을 줬는가' 가 아니라 **적용 직후 라이브의 실제 실행 권한**만 판정한다(has_function_privilege —
--   PUBLIC 경유 권한까지 포함한다). revoke/grant 줄 자체의 효과는 drop 후 재생성에서만 검증된다.
do $check$
declare s text := (select prosrc from pg_proc where oid = 'public.link_customer_alias(uuid,text,uuid)'::regprocedure);
begin
  if s not like '%v_tgt%' or s not like '%_venue_customer_ids(array[p_venue_id])%'
     or not (select bool_and(prosecdef) from pg_proc where oid in ('public.link_customer_alias(uuid,text,uuid)'::regprocedure,
               'public._apply_checkin(uuid,uuid)'::regprocedure, 'public._apply_venue_visit(uuid,uuid)'::regprocedure)) then
    raise exception '20261006a 자가검사: link_customer_alias 본문(동명 행 묶기·20261005b 관계 확인)이나 정의자 속성이 기대와 다르다';
  end if;
  if (select count(*) from pg_proc where oid in ('public._apply_checkin(uuid,uuid)'::regprocedure, 'public._apply_venue_visit(uuid,uuid)'::regprocedure)
        and prosrc like '%public.customer_profiles.user_id is null or public.customer_profiles.user_id = p_uid%') <> 2 then
    raise exception '20261006a 자가검사: _apply_checkin·_apply_venue_visit 의 이름 충돌 가드(다른 회원 행에 방문 합산 금지)가 없다';
  end if;
  -- 실제 실행 권한: link 는 로그인 사용자만, 내부 함수 둘은 클라 역할 전부 불가 · service_role 가능
  if has_function_privilege('anon', 'public.link_customer_alias(uuid,text,uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.link_customer_alias(uuid,text,uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public._apply_checkin(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._apply_checkin(uuid,uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public._apply_checkin(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public._apply_venue_visit(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._apply_venue_visit(uuid,uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public._apply_venue_visit(uuid,uuid)', 'EXECUTE') then
    raise exception '20261006a 자가검사: 실행 권한(ACL)이 기대와 다르다';
  end if;
  -- 20261005b 불변식이 그대로인지(이 파일은 건드리지 않지만, 적용 순서가 어긋났으면 여기서 멈춘다)
  if has_column_privilege('authenticated', 'public.customer_profiles', 'user_id', 'INSERT')
     or has_column_privilege('authenticated', 'public.customer_profiles', 'user_id', 'UPDATE')
     or not exists (select 1 from pg_trigger where tgrelid = 'public.customer_profiles'::regclass
                     and tgname = 'trg_guard_customer_profile_link' and tgenabled <> 'D') then
    raise exception '20261006a 자가검사: 20261005b(칸 GRANT·고객 행 연결 가드 트리거)가 라이브에 없다 — 먼저 적용하세요';
  end if;
end $check$;
