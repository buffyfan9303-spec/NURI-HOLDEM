-- NURI 권한 기준선 (pgTAP 1.3.3 · extensions 스키마) — critical-reviewer 2026-09-28
-- 실행: 라이브에서 이 파일 전체를 한 번에 execute_sql. begin … rollback 이라 아무것도 남기지 않는다
--       (임시표 _tap 은 on commit drop + rollback).
-- 마지막 SELECT 가 요약(ok/not ok 개수)과 실패 줄 전문을 돌려준다.
-- 2026-09-28 첫 실행: 1304 중 1303 ok. 실패 1 = B _block_ended_reservation() search_path=public (pg_temp 누락, 수정 전까지 빨강이 정상).
-- 음성 대조(anon GRANT·정책 불일치·search_path 제거·RLS 끔) 4종 모두 not ok 로 검출 확인.
--
-- 기준(2026-09-28 라이브 스냅숏에서 뽑음 — 목록이 바뀌면 여기부터 고친다):
--   A 변이 RPC(volatile, public, 트리거·확장 소유 제외)
--     A1 anon 실행 불가 — 단 ANON_ALLOW(조회수·오류율·출석 QR·공지 상태) 5개
--     A2 ANON_ALLOW 5개는 anon 실행 가능(양성 대조 — 목록이 조용히 바뀌면 여기서 걸린다)
--     A3 authenticated 실행 가능 — 단 SERVICE_ONLY(크론·엣지·폐기 RPC) 23개와 '_' 내부 함수
--     A4 SERVICE_ONLY 23개는 authenticated 실행 불가
--     A5 service_role 은 public 의 모든 비트리거 함수 실행 가능
--     A6 '_' 내부 비트리거 함수: anon 불가, authenticated 는 INTERNAL_AUTH_ALLOW 4개(RLS 정책·트리거 헬퍼)만
--     A7 트리거 함수: anon·authenticated 실행 불가
--   B  SECURITY DEFINER 는 search_path = public, pg_temp 고정 (예외: search_path="" 인 get_push_shared_secret)
--   C1 public 의 모든 표 RLS 켜짐
--   C2 주요 표 정책 목록 고정(policies_are) — 정책이 추가·삭제·개명되면 걸린다
begin;
set local search_path = extensions, public, pg_temp;
create temp table _tap(n serial primary key, line text) on commit drop;
select no_plan();

create temp view _fn as   -- 임시 뷰는 rollback 으로 사라진다
select p.oid, p.proname, p.oid::regprocedure::text as sig, p.provolatile, p.prosecdef, p.proconfig,
       (p.prorettype = 'trigger'::regtype) as is_trigger,
       coalesce((select array_agg(format_type(t, null) order by o)::name[]
                   from unnest(p.proargtypes::oid[]) with ordinality u(t, o)), '{}'::name[]) as args
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
   and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e');

create temp table _anon_allow(sig text primary key) on commit drop;
insert into _anon_allow values
 ('client_error_rate_ok()'), ('increment_listing_view(uuid)'), ('increment_post_view(uuid)'),
 ('venue_announce_status(uuid)'), ('venue_today_games(uuid)');

create temp table _service_only(sig text primary key) on commit drop;
insert into _service_only values
 ('accrue_voucher(uuid,text,integer)'), ('check_free_plan_limits()'), ('consume_ai_quota(uuid,text,integer)'),
 ('cron_unsuspend_expired()'), ('cron_weekly_email_digest()'), ('end_expired_seasons()'),
 ('expire_old_buyin_requests()'), ('get_push_shared_secret()'), ('increment_post_likes(uuid)'),
 ('is_email_available(text)'), ('league_reset_event(uuid)'), ('league_set_status(uuid,uuid,text,integer,jsonb)'),
 ('league_settle_all(uuid)'), ('league_start_final(uuid)'), ('notify_season_deadline()'),
 ('purge_old_client_errors()'), ('redeem_my_voucher(uuid)'), ('redeem_voucher(uuid,uuid)'),
 ('send_cheer(uuid,uuid)'), ('send_tournament_reminders()'), ('send_weekly_follow_digest()'),
 ('send_weekly_venue_reports()'), ('verify_identity_commit(uuid,text,text,text,date,text,text,text)');

create temp table _internal_auth_allow(sig text primary key) on commit drop;
insert into _internal_auth_allow values
 ('_can_manage_reservation_schedule(uuid)'),          -- schedule_reservations 정책 sr_select/update/delete
 ('_actor_not_sanctioned()'),                         -- schedules 정책 *_not_sanctioned_*
 ('_ledger_buyin_tiers(ledger_buyins,numeric,jsonb)'), -- 장부 트리거 헬퍼(호출자 권한)
 ('_ledger_buyin_apply_amount_rule(ledger_buyins)');

-- A1
insert into _tap(line)
select function_privs_are('public', f.proname, f.args, 'anon', '{}'::name[], 'A1 anon 변이 RPC 실행 불가: ' || f.sig)
  from _fn f where not f.is_trigger and f.provolatile = 'v' and f.sig not in (select sig from _anon_allow);
-- A2
insert into _tap(line)
select function_privs_are('public', f.proname, f.args, 'anon', array['EXECUTE']::name[], 'A2 anon 허용 목록 유지: ' || f.sig)
  from _fn f where f.sig in (select sig from _anon_allow);
insert into _tap(line)
select is((select count(*)::int from _fn where sig in (select sig from _anon_allow)), 5, 'A2 anon 허용 목록 5개 전부 존재');
-- A3
insert into _tap(line)
select function_privs_are('public', f.proname, f.args, 'authenticated', array['EXECUTE']::name[], 'A3 authenticated 변이 RPC 실행 가능: ' || f.sig)
  from _fn f where not f.is_trigger and f.provolatile = 'v' and f.proname !~ '^_'
   and f.sig not in (select sig from _service_only);
-- A4
insert into _tap(line)
select function_privs_are('public', f.proname, f.args, 'authenticated', '{}'::name[], 'A4 서비스 전용은 authenticated 불가: ' || f.sig)
  from _fn f where f.sig in (select sig from _service_only);
insert into _tap(line)
select is((select count(*)::int from _fn where sig in (select sig from _service_only)), 23, 'A4 서비스 전용 목록 23개 전부 존재');
-- A5
insert into _tap(line)
select ok(has_function_privilege('service_role', f.oid, 'EXECUTE'), 'A5 service_role 실행 가능: ' || f.sig)
  from _fn f where not f.is_trigger;
-- A6
insert into _tap(line)
select function_privs_are('public', f.proname, f.args, 'anon', '{}'::name[], 'A6 내부 함수 anon 불가: ' || f.sig)
  from _fn f where not f.is_trigger and f.proname ~ '^_';
insert into _tap(line)
select function_privs_are('public', f.proname, f.args, 'authenticated',
         case when f.sig in (select sig from _internal_auth_allow) then array['EXECUTE']::name[] else '{}'::name[] end,
         'A6 내부 함수 authenticated 기준: ' || f.sig)
  from _fn f where not f.is_trigger and f.proname ~ '^_';
-- A7
insert into _tap(line)
select ok(not has_function_privilege('anon', f.oid, 'EXECUTE') and not has_function_privilege('authenticated', f.oid, 'EXECUTE'),
          'A7 트리거 함수 직접 실행 불가: ' || f.sig)
  from _fn f where f.is_trigger;
-- B
insert into _tap(line)
select ok(coalesce('search_path=public, pg_temp' = any(f.proconfig), false)
          or (f.sig = 'get_push_shared_secret()' and 'search_path=""' = any(f.proconfig)),
          'B SECURITY DEFINER search_path 고정: ' || f.sig || ' → ' || coalesce(array_to_string(f.proconfig, ';'), '(없음)'))
  from _fn f where f.prosecdef;
-- C1
insert into _tap(line)
select ok(c.relrowsecurity, 'C1 RLS 켜짐: public.' || c.relname)
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p');
-- C2 (2026-09-28 라이브 정책명 스냅숏)
insert into _tap(line) select policies_are('public', 'profiles', array['profiles_select','profiles_update_self']::name[], 'C2 profiles 정책');
insert into _tap(line) select policies_are('public', 'venues', array['venues_delete','venues_select','venues_update']::name[], 'C2 venues 정책(INSERT 정책 없음 = 자가 생성 차단)');
insert into _tap(line) select policies_are('public', 'venue_owners', '{}'::name[], 'C2 venue_owners 정책 0(직접 접근 거부)');
insert into _tap(line) select policies_are('public', 'venue_kill_switch', '{}'::name[], 'C2 venue_kill_switch 정책 0');
insert into _tap(line) select policies_are('public', 'secret_settings', '{}'::name[], 'C2 secret_settings 정책 0');
insert into _tap(line) select policies_are('public', 'venue_staff', array['venue_staff_select']::name[], 'C2 venue_staff 정책');
insert into _tap(line) select policies_are('public', 'venue_staff_invites', array['vsi_read']::name[], 'C2 venue_staff_invites 정책');
insert into _tap(line) select policies_are('public', 'store_vouchers', array['store_vouchers_select']::name[], 'C2 store_vouchers 정책(쓰기는 RPC 만)');
insert into _tap(line) select policies_are('public', 'voucher_events', array['voucher_events_select']::name[], 'C2 voucher_events 정책');
insert into _tap(line) select policies_are('public', 'voucher_access', array['voucher_access_select']::name[], 'C2 voucher_access 정책');
insert into _tap(line) select policies_are('public', 'ledger_sessions', array['ls_select','ls_update','ls_write']::name[], 'C2 ledger_sessions 정책');
insert into _tap(line) select policies_are('public', 'ledger_buyins', array['lb_select','lb_update','lb_write']::name[], 'C2 ledger_buyins 정책');
insert into _tap(line) select policies_are('public', 'ledger_players', array['lp_insert','lp_select','lp_update']::name[], 'C2 ledger_players 정책');
insert into _tap(line) select policies_are('public', 'ledger_access', array['la_select']::name[], 'C2 ledger_access 정책');
insert into _tap(line) select policies_are('public', 'ledger_buyin_requests', array['lbr_select']::name[], 'C2 ledger_buyin_requests 정책');
insert into _tap(line) select policies_are('public', 'schedule_access', array['sa_select']::name[], 'C2 schedule_access 정책');
insert into _tap(line) select policies_are('public', 'checkins', array['checkins_select']::name[], 'C2 checkins 정책');
insert into _tap(line) select policies_are('public', 'schedules', array['schedules_delete','schedules_insert','schedules_not_sanctioned_ins','schedules_not_sanctioned_upd','schedules_select','schedules_update']::name[], 'C2 schedules 정책');
insert into _tap(line) select policies_are('public', 'schedule_reservations', array['sr_delete','sr_insert','sr_select','sr_update']::name[], 'C2 schedule_reservations 정책');
insert into _tap(line) select policies_are('public', 'customer_profiles', array['customer_profiles_pos_all']::name[], 'C2 customer_profiles 정책');
insert into _tap(line) select policies_are('public', 'customer_aliases', array['customer_aliases_pos']::name[], 'C2 customer_aliases 정책');
insert into _tap(line) select policies_are('public', 'staff_wage', array['staff_wage_del','staff_wage_ins','staff_wage_select','staff_wage_upd']::name[], 'C2 staff_wage 정책');
insert into _tap(line) select policies_are('public', 'staff_schedule', array['staff_sched_delete','staff_sched_insert','staff_sched_select','staff_sched_self_select','staff_sched_update']::name[], 'C2 staff_schedule 정책');
insert into _tap(line) select policies_are('public', 'clock_states', array['clock_states_del','clock_states_ins','clock_states_public_read','clock_states_upd']::name[], 'C2 clock_states 정책');
insert into _tap(line) select policies_are('public', 'community_posts', array['posts_delete','posts_insert','posts_select']::name[], 'C2 community_posts 정책');
insert into _tap(line) select policies_are('public', 'comments', array['comments_delete','comments_insert','comments_select','comments_update_self']::name[], 'C2 comments 정책');
insert into _tap(line) select policies_are('public', 'notifications', array['notif_select_self','notif_update_self']::name[], 'C2 notifications 정책');
insert into _tap(line) select policies_are('public', 'phone_lookup_audit', array['phone_lookup_audit_admin_read']::name[], 'C2 phone_lookup_audit 정책');
insert into _tap(line) select policies_are('public', 'client_errors', array['client_errors_admin_delete','client_errors_admin_select','client_errors_insert']::name[], 'C2 client_errors 정책');
insert into _tap(line) select policies_are('public', 'app_settings', array['app_settings_admin_del','app_settings_admin_ins','app_settings_admin_upd','app_settings_read']::name[], 'C2 app_settings 정책');

insert into _tap(line) select * from finish();

select 'SUMMARY' as kind,
       format('ok=%s not_ok=%s total=%s',
              count(*) filter (where line ~ '^ok '),
              count(*) filter (where line ~ '^not ok '),
              count(*) filter (where line ~ '^(not )?ok ')) as line
  from _tap
union all
select 'FAIL', line from _tap where line ~ '^not ok ' or line ~ '^# Looks like'
union all
select 'COUNT_' || substring(line from '(?:not )?ok \d+ - ([A-C]\d?)'),
       format('ok=%s not_ok=%s', count(*) filter (where line ~ '^ok '), count(*) filter (where line ~ '^not ok '))
  from _tap where line ~ '^(not )?ok ' group by 1
order by 1;
rollback;
