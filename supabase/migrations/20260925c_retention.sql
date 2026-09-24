-- 20260925c — 탈퇴·매장 삭제 뒤 남던 개인정보 파기 (오너 2026-09-25 DATA-RETENTION)
-- ✅ 2026-09-25 운영 적용 완료(nuri-lead, 한 트랜잭션 · §7 자가검사 통과). 적용 후 md5: _sync_nickname_snapshots b495c313… · _tg_sync_nickname e78a9669… · _voucher_events_immutable 8d90e68c… · kill_venue c009eee6…
-- 리허설(2026-09-25 store-team, 라이브 begin…raise 로 전량 롤백 · 전후 흔적 동일: 함수 해시 76420f26… · cron 12 · flow_state 19 ·
--   withdrawn_identities 0 · voucher_events 1 · venues 4 · audit_log 4 · notifications 17 · profiles md5 fdbf1aff… · kill_switch 0):
--   C0(현행) 탈퇴 7f98 후 남은 사본: 알림 제목·본문·장터 판매자명·활동 로그·신고자명·차단 대상명·그룹 회원명·이벤트 카드·글/댓글 user_avatar
--   R1(적용) 탈퇴 7f98 후: ledger_players.name·ledger_buyins.player_name·venue_rankings.nickname 만 남음(매장 기록 — 의도된 보존) · 다른 회원 알림 1건 치환
--   R2 관리자 강제 탈퇴(c8e3→fd14) 후: 위 매장 기록 + store_vouchers.holder_name·voucher_events.new_row(매장 기록 — 의도된 보존)
--   CI: 7개월 전 삭제 · 6개월-1시간 전·1일 전 유지 (deleted=1) · flow_state 19→0
--   음성: 크론 함수 authenticated/anon 42501 · voucher_events 설정값 없이 DELETE 42501 · 다른 매장 id 설정값 42501 ·
--         설정값 있어도 UPDATE 42501 · TRUNCATE 42501 · authenticated 직접 DELETE "permission denied" · 미사용 이용권 매장 삭제 거부 ·
--         대표 아닌 회원 kill_venue 거부 · 삭제 뒤 다른 매장 이벤트 DELETE 42501
--   양성: 업주 c8e3 가 9cf5 삭제 → 매장 0 · 그 매장 voucher_events 1→0 · 다른 매장(dddd) 1 유지 · 설정값 되돌림 '' ·
--         감사 meta {"owner_name_verified": true}, 실명 포함 0 · 자가검사 통과
--
-- 오너 결정(2026-09-25):
--   · 유료 상품 없음 → 회원 정보는 탈퇴 즉시 파기
--   · 탈퇴 회원의 글·댓글은 '탈퇴회원_xxxx' 로 **내용은 남기고 이름·사진은 지운다**
--   · 탈퇴자 CI 해시는 **6개월** 보관 후 자동 파기
--   · 매장 기록(장부·이용권·근무)은 매장 결정에 따른다 — **회원 탈퇴로 지우지 않는다**
--     (그래서 store_vouchers.holder_name · voucher_events · ledger_* · venue_rankings 는 탈퇴 경로에서 손대지 않는다)
--   · 매장 영구 삭제 시 자료 내려받기 후 파기(화면 쪽) — 이 파일은 kill_venue 가 남기던 두 곳을 지운다
--
-- 원천: 전수표 retention-inventory.md §2 #3·#6·#7·#10·#12·#15, §3-A.
-- 적용 전 라이브 md5(2026-09-25 실측):
--   _sync_nickname_snapshots 2faa5126… · _voucher_events_immutable 32a07740… · kill_venue 7c3d73db…
--   withdraw_my_account 3d10e4b6…(불변) · admin_withdraw_user 28d5fdae…(불변) · _voucher_events_log 94b425c4…(불변)
--   ⚠ §0 이 kill_venue 본문이 예상과 다르면 멈춘다.
--
-- 바뀌는 것
--   1. _sync_nickname_snapshots: 닉네임 사본 6표 추가(장터 판매자명·신고자명·차단 대상명·그룹 회원명·이벤트 카드 개봉자명·활동 로그)
--      + 글·댓글·실시간 글의 user_avatar 를 현재 프로필 사진으로 맞춘다(탈퇴 = avatar_url null → 사본도 null).
--      탈퇴 두 함수는 닉네임을 '탈퇴회원_xxxx' 로 바꾸므로 trg_sync_nickname 이 이 함수를 부른다 → 탈퇴 함수는 고치지 않는다.
--   2. _tg_sync_nickname: 탈퇴(status→withdrawn)로 닉네임이 바뀔 때 **다른 회원에게 간 알림**의 제목·본문 속 옛 닉네임을
--      새 이름으로 치환(옛 닉네임 2자 이상일 때만 — 한 글자 치환은 무관한 글자를 바꾼다).
--   3. 기존 탈퇴 회원 되채움: 사본만 맞춘다(알림은 옛 닉네임이 nickname_history 에서 이미 지워져 불가).
--   4. withdrawn_identities: 생성 후 6개월 지난 행 매일 삭제(pg_cron 03:40 UTC, 함수는 anon·authenticated 회수).
--   5. auth.flow_state: 만든 지 하루 지난 행 매일 삭제(03:50 UTC — 소셜 로그인 제공자 토큰 평문 보관분).
--   6. kill_venue: 감사 로그에서 업주 실명(owner_name) 제거 + 그 매장의 voucher_events 삭제.
--      voucher_events 추가만 트리거는 **트랜잭션 한정 설정값 nuri.voucher_purge_venue = 그 매장 id** 일 때
--      **그 매장 행의 DELETE 만** 허용한다(UPDATE·TRUNCATE·다른 매장은 여전히 42501).
--      authenticated 는 voucher_events 에 SELECT 권한뿐이라 설정값을 세워도 직접 DELETE 는 권한 오류다.
--      미사용 이용권 가드(20260924p)는 그대로다.
--
-- 되돌리기: 1·2·6 은 위 md5 의 이전 본문으로 create or replace. 4·5 는 cron.unschedule + drop function.

-- §0 적용 전 본문 확인 — 라이브 kill_venue 가 이 초안이 전제한 본문이 아니면 멈춘다(재적용은 통과)
do $pre$
declare d text := pg_get_functiondef('public.kill_venue(uuid,text,text)'::regprocedure);
begin
  if md5(d) <> '7c3d73dbcf1525ff699790513262131d' and d not like '%nuri.voucher_purge_venue%' then
    raise exception '20260925c: kill_venue 라이브 본문이 예상(7c3d73db…)과 다릅니다(%). 본문을 다시 맞추세요', md5(d);
  end if;
end $pre$;

-- §1 닉네임·사진 사본 동기화 (탈퇴 시에도 이 경로로 파기된다)
create or replace function public._sync_nickname_snapshots(p_user uuid)
 returns integer language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v text; a text; n integer := 0; c integer;
begin
  if p_user is null then return 0; end if;
  select nickname, avatar_url into v, a from public.profiles where id = p_user;
  if v is null then return 0; end if;
  update public.checkins             set display_name = v where user_id   = p_user and display_name is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.comments             set user_name    = v where user_id   = p_user and user_name    is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.community_posts      set user_name    = v where user_id   = p_user and user_name    is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.community_shouts     set nickname     = v where user_id   = p_user and nickname     is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.dealer_posts         set author_name  = v where author_id = p_user and author_name  is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.group_messages       set user_name    = v where user_id   = p_user and user_name    is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.group_posts          set author_name  = v where author_id = p_user and author_name  is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.live_wall            set user_name    = v where user_id   = p_user and user_name    is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.owner_posts          set author_name  = v where author_id = p_user and author_name  is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.schedule_reservations set display_name = v where user_id  = p_user and display_name is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.support_inquiries    set user_name    = v where user_id   = p_user and user_name    is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.venue_messages       set user_name    = v where user_id   = p_user and user_name    is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.venue_notices        set author_name  = v where author_id = p_user and author_name  is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.venue_reviews        set nickname     = v where user_id   = p_user and nickname     is distinct from v; get diagnostics c = row_count; n := n + c;
  -- 20260925c: 동기화에서 빠져 있던 사본 6표
  update public.marketplace_listings set seller_name   = v where seller_id   = p_user and seller_name   is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.reports              set reporter_name = v where reporter_id = p_user and reporter_name is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.user_blocks          set blocked_name  = v where blocked_id  = p_user and blocked_name  is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.group_members        set member_name   = v where user_id     = p_user and member_name   is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.event_cards          set opened_name   = v where opened_by   = p_user and opened_name   is distinct from v; get diagnostics c = row_count; n := n + c;
  update public.activity_log         set actor_name    = v where actor_id    = p_user and actor_name    is distinct from v; get diagnostics c = row_count; n := n + c;
  -- 20260925c: 작성 시 복사된 프로필 사진(fill_user_avatar) — 탈퇴하면 avatar_url 이 null 이라 사본도 null
  update public.comments        set user_avatar = a where user_id = p_user and user_avatar is distinct from a; get diagnostics c = row_count; n := n + c;
  update public.community_posts set user_avatar = a where user_id = p_user and user_avatar is distinct from a; get diagnostics c = row_count; n := n + c;
  update public.live_wall       set user_avatar = a where user_id = p_user and user_avatar is distinct from a; get diagnostics c = row_count; n := n + c;
  return n;  -- ⚠ rank_verifications 는 증빙 대조용이라 절대 넣지 않는다 · 매장 기록(이용권·장부·순위)도 넣지 않는다(오너 결정)
end $function$;
revoke all on function public._sync_nickname_snapshots(uuid) from public, anon, authenticated;
grant execute on function public._sync_nickname_snapshots(uuid) to service_role;

-- §2 탈퇴 시 다른 회원에게 간 알림 속 옛 닉네임 치환
create or replace function public._tg_sync_nickname()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.nickname is distinct from old.nickname then
    perform public._sync_nickname_snapshots(new.id);
    if new.status::text = 'withdrawn' and old.status::text is distinct from 'withdrawn'
       and char_length(btrim(coalesce(old.nickname, ''))) >= 2 then
      update public.notifications
         set title   = replace(title,   old.nickname, new.nickname),
             message = replace(message, old.nickname, new.nickname)
       where user_id is distinct from new.id
         and (strpos(title, old.nickname) > 0 or strpos(message, old.nickname) > 0);
    end if;
  end if;
  return null;
end $function$;
revoke all on function public._tg_sync_nickname() from public, anon, authenticated;
grant execute on function public._tg_sync_nickname() to service_role;

-- §3 이미 탈퇴한 회원 되채움(사본 동기화만)
select public._sync_nickname_snapshots(id) from public.profiles where status::text = 'withdrawn';

-- §4 탈퇴자 CI 해시 6개월 보관 후 파기
create or replace function public._purge_withdrawn_identities()
 returns integer language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare n integer;
begin
  delete from public.withdrawn_identities where created_at < now() - interval '6 months';
  get diagnostics n = row_count;
  return n;
end $function$;
revoke all on function public._purge_withdrawn_identities() from public, anon, authenticated;
grant execute on function public._purge_withdrawn_identities() to service_role;

-- §5 소셜 로그인 흐름 상태(제공자 토큰 평문) 하루 뒤 파기
create or replace function public._purge_auth_flow_state()
 returns integer language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare n integer;
begin
  delete from auth.flow_state where created_at < now() - interval '1 day';
  get diagnostics n = row_count;
  return n;
end $function$;
revoke all on function public._purge_auth_flow_state() from public, anon, authenticated;
grant execute on function public._purge_auth_flow_state() to service_role;

do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'purge-withdrawn-identities') then
    perform cron.unschedule('purge-withdrawn-identities');
  end if;
  if exists (select 1 from cron.job where jobname = 'purge-auth-flow-state') then
    perform cron.unschedule('purge-auth-flow-state');
  end if;
  perform cron.schedule('purge-withdrawn-identities', '40 3 * * *', 'select public._purge_withdrawn_identities()');
  perform cron.schedule('purge-auth-flow-state',      '50 3 * * *', 'select public._purge_auth_flow_state()');
end $cron$;

-- §6 voucher_events: 추가만 — 단 매장 영구 삭제 트랜잭션 안에서 **그 매장 행의 DELETE** 만 허용
create or replace function public._voucher_events_immutable()
 returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'DELETE'
     and old.venue_id is not null
     and current_setting('nuri.voucher_purge_venue', true) = old.venue_id::text then
    return old;
  end if;
  raise exception 'voucher_events 는 추가만 됩니다' using errcode = '42501';
end $function$;
revoke all on function public._voucher_events_immutable() from public, anon, authenticated;
grant execute on function public._voucher_events_immutable() to service_role;

create or replace function public.kill_venue(p_venue_id uuid, p_owner_name text, p_password text)
 returns integer language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_owner uuid; v_real text; v_hash text; v_tbl text; v_left int;
  v_whitelist text[] := array[
    'comments','schedules','venue_follows','venue_staff_invites','venue_rankings','venue_notices',
    'venue_pos_settings','ledger_access','venue_staff','ledger_sessions','staff_schedule','clock_presets',
    'ranking_point_awards','ledger_buyins','ledger_players','clock_states','staff_wage','waitlist',
    'customer_profiles','coupons','dealer_shifts','store_vouchers','checkins','voucher_access',
    'venue_messages','venue_score_entries','league_members','league_entries','venue_reviews',
    'voucher_credit_requests','venue_owners','ledger_buyin_requests','venue_announcements',
    'venue_seasons','game_presets','venue_kill_switch','league_event_status'
  ];
begin
  select owner_id into v_owner from public.venues where id = p_venue_id;
  if v_owner is null then raise exception '매장을 찾을 수 없습니다'; end if;
  if auth.uid() is null or auth.uid() <> v_owner then raise exception '매장 대표 업주만 실행할 수 있습니다'; end if;
  select real_name into v_real from public.profiles where id = v_owner;
  if coalesce(trim(v_real), '') = '' then raise exception '본인인증(실명)된 업주만 실행할 수 있습니다'; end if;
  if lower(trim(p_owner_name)) <> lower(trim(v_real)) then raise exception '업주 실명이 일치하지 않습니다'; end if;
  select pw_hash into v_hash from public.venue_kill_switch where venue_id = p_venue_id;
  if v_hash is null then raise exception '킬스위치 비밀번호를 먼저 설정하세요'; end if;
  if v_hash <> extensions.crypt(p_password, v_hash) then raise exception '킬스위치 비밀번호가 일치하지 않습니다'; end if;
  select count(*) into v_left from public.store_vouchers
   where venue_id = p_venue_id and status = 'active' and (expires_at is null or expires_at > now());
  if v_left > 0 then
    raise exception '손님이 아직 쓰지 않은 매장이용권이 %장 남아 있어 매장을 삭제할 수 없습니다. 이용권을 모두 사용하거나 회수한 뒤 다시 시도해 주세요', v_left;
  end if;
  -- 20260925c: 업주 실명은 검증에만 쓰고 감사 로그에 남기지 않는다
  perform public._audit('kill_venue', p_venue_id::text, jsonb_build_object('owner_name_verified', true));
  update public.profiles set venue_id = null where venue_id = p_venue_id;
  foreach v_tbl in array v_whitelist loop
    execute format('delete from public.%I where venue_id = $1', v_tbl) using p_venue_id;
  end loop;
  -- 20260925c: 이용권 이력(보유자 이름 포함 전체 행 사본)도 파기.
  --   위 store_vouchers 삭제가 방금 남긴 DELETE 이벤트까지 지우려고 루프 **뒤**에 둔다.
  perform set_config('nuri.voucher_purge_venue', p_venue_id::text, true);
  delete from public.voucher_events where venue_id = p_venue_id;
  perform set_config('nuri.voucher_purge_venue', '', true);
  delete from public.venues where id = p_venue_id;
  return 1;
end $function$;
revoke all on function public.kill_venue(uuid, text, text) from public, anon;
grant execute on function public.kill_venue(uuid, text, text) to authenticated, service_role;

-- §7 자가검사
do $check$
declare v text := pg_get_functiondef('public.kill_venue(uuid,text,text)'::regprocedure);
begin
  if has_function_privilege('anon', 'public._purge_withdrawn_identities()', 'execute')
     or has_function_privilege('authenticated', 'public._purge_withdrawn_identities()', 'execute')
     or has_function_privilege('anon', 'public._purge_auth_flow_state()', 'execute')
     or has_function_privilege('authenticated', 'public._purge_auth_flow_state()', 'execute')
     or has_function_privilege('authenticated', 'public._sync_nickname_snapshots(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._tg_sync_nickname()', 'execute') then
    raise exception '20260925c 자가검사: 내부 함수 ACL 이 열려 있습니다';
  end if;
  if has_function_privilege('anon', 'public.kill_venue(uuid,text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.kill_venue(uuid,text,text)', 'execute') then
    raise exception '20260925c 자가검사: kill_venue ACL 이상';
  end if;
  if v like '%''owner_name'', p_owner_name%' or v not like '%v_left > 0%' or v not like '%nuri.voucher_purge_venue%' then
    raise exception '20260925c 자가검사: kill_venue 본문 이상(실명 기록·이용권 가드·이력 파기)';
  end if;
  if (select count(*) from cron.job where jobname in ('purge-withdrawn-identities','purge-auth-flow-state')) <> 2 then
    raise exception '20260925c 자가검사: 크론 2건이 없습니다';
  end if;
  if (select count(*) from pg_trigger where tgrelid = 'public.voucher_events'::regclass and not tgisinternal
        and tgfoid = 'public._voucher_events_immutable'::regproc) <> 2 then
    raise exception '20260925c 자가검사: voucher_events 불변 트리거 2개가 아닙니다';
  end if;
end $check$;
