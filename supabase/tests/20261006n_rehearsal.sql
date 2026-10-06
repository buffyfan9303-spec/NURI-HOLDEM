-- 20261006n 라이브 롤백 리허설 (home-team 2026-10-06) — legal-full-1006 P1-5(매장 운영자 약관 동의) · P1-3(순위 인증 신분증 동의·보유기간)
-- 실행: python combine.py <워크트리> → node ../geo-notice-1005/rehearse-geo.mjs chain.sql 20261006n_rehearsal.sql
--   chain.sql = r0 + s1 + s2 + 20261006l + 20261006m + 20261006n (한 트랜잭션). 마지막 raise 는 언제나 ZZ999 → 전체 롤백.
--   음성 대조: chain_neg.sql(n 제외) + 이 파일 → O1·R1·R2·R3 이 FAIL 해야 한다(표·함수·트리거가 없다).
--   계정은 조회해서 고른다: 일반 회원(user)·활성·매장 대표 아님 2명.

create table public._probe_20261006n (x int);

do $rehearsal$
declare
  u1 uuid; u2 uuid; r record; t text; v_at timestamptz; n1 int; n2 int;
  out text := ''; fails int := 0; total int := 0;
begin
  select (array_agg(x.id order by x.id))[1], (array_agg(x.id order by x.id))[2] into u1, u2 from (
    select p.id from public.profiles p
     where p.role::text = 'user' and p.status::text = 'active'
       and not exists (select 1 from public.venues v where v.owner_id = p.id)
     order by p.id limit 2) x;
  if u2 is null then
    raise exception using errcode = 'ZZ999', message = format('REHEARSAL FAIL 0/0 대상 없음 u=%s,%s', u1, u2);
  end if;
  out := format('u1=%s u2=%s | ', left(u1::text, 8), left(u2::text, 8));

  -- O1 매장 운영자 약관 동의: 본인 기록 → 서버 시각 · 본인만 보인다(RLS) · 비로그인·잘못된 경로 거절 · anon 실행권 없음
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_at := public.record_my_owner_terms_consent(1, 'gate');
    select count(*) into n1 from public.owner_terms_consents;            -- 본인 행만
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n2 from public.owner_terms_consents where user_id = u1;   -- 남의 행은 0
    execute 'reset role';
    t := format('own=%s other=%s at_now=%s', n1, n2, v_at = now());
    begin
      perform set_config('request.jwt.claims', '', true);
      perform public.record_my_owner_terms_consent(1, 'gate');
      t := t || ' anon=열림';
    exception when others then t := t || ' anon=' || case when sqlerrm like '로그인이 필요%' then '거절' else sqlerrm end;
    end;
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
      perform public.record_my_owner_terms_consent(1, 'admin-forge');
      t := t || ' badsrc=열림';
    exception when others then t := t || ' badsrc=거절';
    end;
    t := t || ' acl=' || has_function_privilege('anon', 'public.record_my_owner_terms_consent(integer,text)', 'execute')::text
               || '/' || has_function_privilege('authenticated', 'public.record_my_owner_terms_consent(integer,text)', 'execute')::text;
    raise exception using errcode = 'ZZ001', message = t;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'own=1 other=0 at_now=t anon=거절 badsrc=거절 acl=false/true' then out := out || 'O1 PASS; ';
      else fails := fails + 1; out := out || 'O1 FAIL ' || sqlerrm || '; '; end if;
    when others then execute 'reset role'; fails := fails + 1; out := out || 'O1 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- O2 탈퇴하면 동의 이력이 지워진다(처리방침 제3조②) — 탈퇴 상태 전환만 흉내(트리거 대상)
  total := total + 1;
  begin
    insert into public.owner_terms_consents(user_id, terms_version, source) values (u2, 1, 'signup');
    update public.profiles set status = 'withdrawn' where id = u2;
    t := 'left=' || (select count(*) from public.owner_terms_consents where user_id = u2);
    raise exception using errcode = 'ZZ001', message = t;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'left=0' then out := out || 'O2 PASS; ';
      else fails := fails + 1; out := out || 'O2 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'O2 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- R1 순위 인증 신청(회원 본인 · RLS 경로): 동의 칸 없이 → 거절 / 동의+가림 확인 → 접수 · 동의 시각은 서버가 찍는다(클라 값 무시)
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      insert into public.rank_verifications(user_id, nickname, event_name, amount_won, proof_url, id_card_path, event_kind)
      values (u1, 'ZZ', 'ZZ-REH-1006n-A', 1000000, u1::text || '/zz-proof.webp', u1::text || '/zz-a-idcard.webp', 'official');
      t := 'noconsent=열림';
    exception when others then t := 'noconsent=' || case when sqlstate = '23514' then '거절' else sqlstate || ' ' || sqlerrm end;
    end;
    begin
      insert into public.rank_verifications(user_id, nickname, event_name, amount_won, proof_url, id_card_path, event_kind, id_consent_version, id_masked_confirmed)
      values (u1, 'ZZ', 'ZZ-REH-1006n-B', 1000000, u1::text || '/zz-proof.webp', u1::text || '/zz-b-idcard.webp', 'official', 1, false);
      t := t || ' unmasked=열림';
    exception when others then t := t || ' unmasked=' || case when sqlstate = '23514' then '거절' else sqlstate end;
    end;
    insert into public.rank_verifications(user_id, nickname, event_name, amount_won, proof_url, id_card_path, event_kind, id_consent_version, id_masked_confirmed, id_consent_at)
    values (u1, 'ZZ', 'ZZ-REH-1006n-C', 1000000, u1::text || '/zz-proof.webp', u1::text || '/zz-c-idcard.webp', 'official', 1, true, '2000-01-01');
    execute 'reset role';
    select status, id_consent_version v, id_masked_confirmed m, id_consent_at = now() as srv into r
      from public.rank_verifications where event_name = 'ZZ-REH-1006n-C';
    t := t || format(' ok=%s/%s/%s srv_at=%s', r.status, r.v, r.m, r.srv);
    raise exception using errcode = 'ZZ001', message = t;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'noconsent=거절 unmasked=거절 ok=pending/1/t srv_at=t' then out := out || 'R1 PASS; ';
      else fails := fails + 1; out := out || 'R1 FAIL ' || sqlerrm || '; '; end if;
    when others then execute 'reset role'; fails := fails + 1; out := out || 'R1 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- R2 보유기간: 31일 미심사 → 자동 반려·신분증 경로 비움·파일 삭제 큐·신청자 알림 / 29일 미심사 → 그대로 / 심사 끝났는데 경로 남은 행 → 큐+비움
  total := total + 1;
  begin
    insert into public.rank_verifications(user_id, nickname, event_name, amount_won, proof_url, id_card_path, event_kind, id_consent_version, id_masked_confirmed, created_at)
    values (u1, 'ZZ', 'ZZ-REH-1006n-OLD', 1000000, u1::text || '/zz-proof.webp', u1::text || '/zz-old-idcard.webp', 'official', 1, true, now() - interval '31 days'),
           (u1, 'ZZ', 'ZZ-REH-1006n-NEW', 1000000, u1::text || '/zz-proof.webp', u1::text || '/zz-new-idcard.webp', 'official', 1, true, now() - interval '29 days');
    insert into public.rank_verifications(user_id, nickname, event_name, amount_won, proof_url, id_card_path, event_kind, id_consent_version, id_masked_confirmed)
    values (u1, 'ZZ', 'ZZ-REH-1006n-DONE', 1000000, u1::text || '/zz-proof.webp', u1::text || '/zz-done-idcard.webp', 'official', 1, true);
    update public.rank_verifications set status = 'approved', decided_at = now() where event_name = 'ZZ-REH-1006n-DONE';
    select count(*) into n1 from public.notifications where user_id = u1 and title = '순위 인증 반려';
    n2 := public._expire_rank_verification_idcards();
    t := format('n=%s', n2);
    select status, id_card_path is null as gone, admin_note like '심사 기한(30일)%' as note into r from public.rank_verifications where event_name = 'ZZ-REH-1006n-OLD';
    t := t || format(' old=%s/%s/%s', r.status, r.gone, r.note);
    select status, id_card_path is null as gone into r from public.rank_verifications where event_name = 'ZZ-REH-1006n-NEW';
    t := t || format(' new=%s/%s', r.status, r.gone);
    select status, id_card_path is null as gone into r from public.rank_verifications where event_name = 'ZZ-REH-1006n-DONE';
    t := t || format(' done=%s/%s', r.status, r.gone);
    t := t || format(' q=%s/%s/%s',
      exists (select 1 from public.storage_purge_queue where bucket_id = 'verifications' and name = u1::text || '/zz-old-idcard.webp' and reason = 'rank_idcard_retention'),
      exists (select 1 from public.storage_purge_queue where bucket_id = 'verifications' and name = u1::text || '/zz-new-idcard.webp'),
      exists (select 1 from public.storage_purge_queue where bucket_id = 'verifications' and name = u1::text || '/zz-done-idcard.webp'));
    t := t || ' notif+' || ((select count(*) from public.notifications where user_id = u1 and title = '순위 인증 반려') - n1);
    raise exception using errcode = 'ZZ001', message = t;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'n=1 old=rejected/t/t new=pending/f done=approved/t q=t/f/t notif+1' then out := out || 'R2 PASS; ';
      else fails := fails + 1; out := out || 'R2 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'R2 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- R3 크론 등록 · 내부 함수는 회원이 직접 못 부른다
  total := total + 1;
  begin
    t := 'cron=' || exists (select 1 from cron.job where jobname = 'rank-idcard-retention' and command like '%_expire_rank_verification_idcards%');
    t := t || ' acl=' || has_function_privilege('authenticated', 'public._expire_rank_verification_idcards()', 'execute')::text
               || '/' || has_function_privilege('anon', 'public._expire_rank_verification_idcards()', 'execute')::text;
    raise exception using errcode = 'ZZ001', message = t;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'cron=true acl=false/false' then out := out || 'R3 PASS; ';
      else fails := fails + 1; out := out || 'R3 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'R3 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- U1 (P2-6) 만 19세 미만 확인 → 무기한 정지 + 사유 + 관리자 알림(관리자 수만큼) · 다시 불러도 알림 중복 없음 · 서버 판정도 비활성
  total := total + 1;
  begin
    perform set_config('request.jwt.claims', '', true);   -- 엣지 service_role 호출 흉내(auth.uid() NULL)
    select count(*) into n1 from public.profiles where role::text = 'admin';
    select count(*) into n2 from public.notifications where title = '만 19세 미만 본인인증 — 이용 제한';
    t := 'r1=' || public.restrict_underage_account(u1)::text;
    t := t || ' r2=' || public.restrict_underage_account(u1)::text;
    select status::text st, suspended_until is null as forever, sanction_reason like '본인인증에서 만 19세 미만%' as why into r from public.profiles where id = u1;
    t := t || format(' st=%s/%s/%s notif=%s', r.st, r.forever, r.why,
                     (select count(*) from public.notifications where title = '만 19세 미만 본인인증 — 이용 제한') - n2 = n1 and n1 > 0);
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    t := t || ' active=' || public.is_account_active()::text;
    raise exception using errcode = 'ZZ001', message = t;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'r1=true r2=true st=suspended/t/t notif=t active=false' then out := out || 'U1 PASS; ';
      else fails := fails + 1; out := out || 'U1 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'U1 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  -- U2 영구정지 계정은 건드리지 않는다 · 일반 회원(authenticated)·anon 은 직접 못 부른다 · 양성: 부르지 않은 회원 u2 는 그대로 active
  total := total + 1;
  begin
    update public.profiles set status = 'banned' where id = u1;
    t := 'banned=' || public.restrict_underage_account(u1)::text || '/' || (select status::text from public.profiles where id = u1);
    t := t || ' other=' || (select status::text from public.profiles where id = u2);
    t := t || ' acl=' || has_function_privilege('authenticated', 'public.restrict_underage_account(uuid)', 'execute')::text
               || '/' || has_function_privilege('anon', 'public.restrict_underage_account(uuid)', 'execute')::text
               || '/' || has_function_privilege('service_role', 'public.restrict_underage_account(uuid)', 'execute')::text;
    raise exception using errcode = 'ZZ001', message = t;
  exception
    when sqlstate 'ZZ001' then
      if sqlerrm = 'banned=false/banned other=active acl=false/false/true' then out := out || 'U2 PASS; ';
      else fails := fails + 1; out := out || 'U2 FAIL ' || sqlerrm || '; '; end if;
    when others then fails := fails + 1; out := out || 'U2 FAIL ' || sqlstate || ' ' || sqlerrm || '; ';
  end;

  raise exception using errcode = 'ZZ999',
    message = format('REHEARSAL %s %s/%s :: %s', case when fails = 0 then 'PASS' else 'FAIL' end, total - fails, total, out);
end $rehearsal$;
