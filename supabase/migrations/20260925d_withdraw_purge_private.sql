-- ✅ 2026-09-25 운영 적용 완료(nuri-lead, 한 트랜잭션 · §3 자가검사 통과). 적용 후 md5: _purge_private_records d6128ea1… · admin_withdraw_user 8c44fd1a… · withdraw_my_account 10a3b8d6…
-- 20260925d — 탈퇴 시 **본인만의 개인 기록** 실제 삭제 (오너 2026-09-25 DATA-RETENTION 2차 "회원 정보는 탈퇴 즉시 파기")
-- ⏳ 초안 · 미적용. 적용은 nuri-lead.
-- 리허설(store-team 2026-09-25, 라이브 · 파일 전문 + 시드 → raise 로 전량 롤백. 전후 흔적 동일: 탈퇴 함수 md5 묶음 0ee8e7cd… ·
--   purge 함수 0 · profiles md5 2e7a3c05… · 쪽지 0 · 알림 17 · 예약 1 · 문의 0 · audit 4 · withdrawn_identities 0 · follower 합 2):
--   C0(현행) fd14 탈퇴: 개인 기록(알림·문의·조회·보이는 쪽지) 7 → 7 그대로
--   R1 fd14 본인 탈퇴: 개인 기록 11종 → 0 · 매장 기록(출석 1·지난 예약 1·이용권 1·이용권 이력 1)·글·장터 글·본인인증 재사용 차단 1 그대로 ·
--      시작 전 예약 1 삭제 · 상대(7f98) 화면: 받은 쪽지 유지(보낸 사람 '탈퇴회원_…')·자기가 보낸 쪽지 유지 · 상대가 이미 지운 쪽지 2 → 실제 삭제
--   R2 관리자 c8e3 → 7f98 강제 탈퇴: 개인 기록 5종(동의 8·약관 동의 1·AI 사용량 1·팔로우 1·쪽지) → 0 · 출석·글·댓글·장터 글 그대로 · audit +1(기존 동작)
--   음성: 4736·708d·c8e3 개인·매장 기록 전후 동일 · 4736→708d 쪽지 그대로 · 전체 표 변화는 두 회원 몫과 정확히 일치(장부·이용권·순위·출석 0 변화)
--         _purge_private_records 직접 호출 authenticated 42501 · anon 42501
--
-- 오너 결정(2026-09-25)
--   · 회원 정보는 탈퇴 즉시 파기
--   · 글·댓글·장터 글은 '탈퇴회원_xxxx' 로 내용 유지(이름·사진은 20260925c 가 이미 지운다)
--   · CI 해시 6개월(20260925c 크론)
--   · 매장 기록(장부·이용권·순위·출석·예약·근무/급여·손님 관리)은 매장 소관 — 탈퇴로 지우지 않는다
--
-- 적용 전 라이브 md5(2026-09-25 실측): withdraw_my_account 3d10e4b6d01336fe957e72d0ca53410a ·
--   admin_withdraw_user 28d5fdae4b998d4e6d17748b79d41e2d (= 20260924n 본문). §0 이 다르면 멈춘다.
--
-- 바뀌는 것
--   1. 새 내부 함수 _purge_private_records(uuid): 본인만의 기록을 DELETE 하고 표별 삭제 수를 jsonb 로 돌려준다.
--   2. 탈퇴 두 함수: 20260924n 본문 그대로 + 스토리지 삭제 직전에 `perform public._purge_private_records(…)` 한 줄.
--      (프로필 갱신 뒤에 부른다 — 탈퇴 중 트리거가 새로 만든 행까지 같이 지운다)
--
-- 쪽지(user_messages) — 한 행을 보낸 쪽·받은 쪽이 같이 쓰고, 자기 쪽 숨김 표시(sender_deleted/recipient_deleted)만 있다.
--   · 내가 보낸 쪽지: 내 보낸함에서 숨김(sender_deleted). 상대 받은함에는 내용 유지 · 보낸 사람은 '탈퇴회원_xxxx'(게시물 원칙과 같다)
--   · 내가 받은 쪽지: 내 받은함에서 숨김(recipient_deleted). 상대가 쓴 글이라 상대 보낸함에는 남는다(상대 대화 문맥 유지)
--   · 양쪽 모두 숨긴 행(상대가 이미 지웠던 것 포함)은 실제 DELETE
--   ⚠ 상대가 나중에 자기 쪽을 지우면 양쪽 숨김 행이 남는다 — 현행 쪽지 삭제와 같은 동작(이 파일 범위 밖).
--
-- 지우지 않는 것(이유)
--   · checkins · 지난 예약 · ledger_* · store_vouchers · voucher_events · venue_rankings · ranking_point_awards ·
--     customer_profiles/aliases · staff_* · ledger_buyin_requests · event_tickets/event_cards — 매장 기록(오너 결정)
--   · 아직 시작 전 예약은 지운다: 탈퇴 계정은 올 수 없는 자리라 매장 좌석만 묶는다(예약 표는 매장 기록 — 리드 판단으로 빼도 된다)
--   · community_posts·comments·marketplace_listings·listing_messages·community_shouts·venue_reviews·venue_messages·group_* ·
--     owner/dealer_posts·live_wall — 내용 유지(오너 결정, 이름·사진은 20260925c 동기화)
--   · used_identity_verifications — 본인인증 거래 재사용 차단(verify_identity_commit 'reused'). 지우면 탈퇴자의 옛 인증으로
--     다른 계정이 인증될 여지가 생긴다. user_id NOT NULL. 값은 거래 ID 의 HMAC.
--   · referrals — 상대(추천인·피추천인)의 보상 통계(my_referral_stats)와 대기 중 지급(referral_ticket_grants cascade)이 걸린다
--   · user_blocks(blocked_id=나) · reports — 다른 회원의 차단 목록·운영 제재 근거(이름은 20260925c 동기화)
--   · audit_log — 운영 감사 기록(취급자 접속기록 성격)
--   · 좋아요·조회 수 등 집계 칸은 저장값이라 행을 지워도 그대로다. 반응(post_reactions)만 트리거가 수를 줄이고,
--     매장 팔로우(venue_follows)는 follower_count 를 줄인다(정상).
--
-- ponytail: rank_verifications.id_card_path 가 가리키는 스토리지 원본(verifications 버킷)은 DB 로 못 지운다(20260924n 과 같은 한계).
--           현재 0행. 엣지 함수로 Storage API remove 를 붙일 때 같이 처리.
-- 되돌리기: 탈퇴 두 함수는 20260924n 본문으로 create or replace, `drop function public._purge_private_records(uuid)`.

-- §0 적용 전 본문 확인(재적용은 통과)
do $pre$
declare a text := pg_get_functiondef('public.withdraw_my_account()'::regprocedure);
        b text := pg_get_functiondef('public.admin_withdraw_user(uuid,text)'::regprocedure);
begin
  if md5(a) <> '3d10e4b6d01336fe957e72d0ca53410a' and a not like '%_purge_private_records%' then
    raise exception '20260925d: withdraw_my_account 라이브 본문이 예상과 다릅니다(%)', md5(a);
  end if;
  if md5(b) <> '28d5fdae4b998d4e6d17748b79d41e2d' and b not like '%_purge_private_records%' then
    raise exception '20260925d: admin_withdraw_user 라이브 본문이 예상과 다릅니다(%)', md5(b);
  end if;
end $pre$;

-- §1 본인만의 개인 기록 삭제
create or replace function public._purge_private_records(p_uid uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare r jsonb := '{}'::jsonb; c integer;
begin
  if p_uid is null then return r; end if;

  -- 쪽지: 내 쪽 숨김 → 양쪽 숨김 행은 삭제
  update public.user_messages set sender_deleted = true    where sender_id    = p_uid and not sender_deleted;
  update public.user_messages set recipient_deleted = true where recipient_id = p_uid and not recipient_deleted;
  delete from public.user_messages where (sender_id = p_uid or recipient_id = p_uid) and sender_deleted and recipient_deleted;
  get diagnostics c = row_count; r := r || jsonb_build_object('user_messages', c);

  delete from public.notifications        where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('notifications', c);
  delete from public.support_inquiries    where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('support_inquiries', c);  -- 운영자 답변 포함
  -- NURI SPOT·AI 코칭 (spot_ai_reviews.purchase_id → point_purchases 가 NO ACTION 이라 먼저)
  delete from public.spot_ai_reviews      where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('spot_ai_reviews', c);
  delete from public.spot_reviews         where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('spot_reviews', c);
  -- 활동점수·포인트 이력 (매장 순위 적립 ranking_point_awards 는 매장 기록이라 제외)
  delete from public.point_purchases      where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('point_purchases', c);
  delete from public.point_grants         where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('point_grants', c);
  delete from public.post_cheers          where sender_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('post_cheers', c);
  delete from public.mission_claims       where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('mission_claims', c);
  delete from public.cosmetic_unlocks     where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('cosmetic_unlocks', c);
  delete from public.mark_unlocks         where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('mark_unlocks', c);
  delete from public.mark_rentals         where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('mark_rentals', c);
  delete from public.referral_ticket_grants where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('referral_ticket_grants', c);
  delete from public.ai_usage             where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('ai_usage', c);
  -- 기록장
  delete from public.bankroll_entries     where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('bankroll_entries', c);
  -- 찜·팔로우·반응·투표·열람 흔적
  delete from public.venue_follows        where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('venue_follows', c);
  delete from public.schedule_likes       where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('schedule_likes', c);
  delete from public.post_likes           where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('post_likes', c);
  delete from public.listing_likes        where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('listing_likes', c);
  delete from public.post_reactions       where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('post_reactions', c);
  delete from public.post_poll_votes      where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('post_poll_votes', c);
  delete from public.post_views           where viewer = p_uid::text; get diagnostics c = row_count; r := r || jsonb_build_object('post_views', c);
  delete from public.listing_views        where viewer = p_uid::text; get diagnostics c = row_count; r := r || jsonb_build_object('listing_views', c);
  delete from public.listing_message_reads where reader_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('listing_message_reads', c);
  delete from public.user_blocks          where blocker_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('user_blocks', c);
  -- 동의 이력: 신원 정보가 모두 지워진 계정에 묶여 입증 가치가 없고, 법정 보존 근거를 찾지 못했다(retention-law.md §4)
  delete from public.consent_logs         where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('consent_logs', c);
  delete from public.legal_consents       where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('legal_consents', c);
  -- 본인이 낸 신청서(연락처 포함)·입상 증빙(신분증 경로)
  delete from public.dealer_applications  where applicant_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('dealer_applications', c);
  delete from public.rank_verifications   where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('rank_verifications', c);
  -- 매장이 준 권한·초대(기록이 아니라 권한 — venue_staff 는 이미 탈퇴 함수가 지운다)
  delete from public.ledger_access        where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('ledger_access', c);
  delete from public.voucher_access       where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('voucher_access', c);
  delete from public.schedule_access      where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('schedule_access', c);
  delete from public.venue_staff_invites  where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('venue_staff_invites', c);
  -- 앱 오류 기록(30일 크론을 기다리지 않는다)
  delete from public.client_errors        where user_id = p_uid; get diagnostics c = row_count; r := r || jsonb_build_object('client_errors', c);
  -- 아직 시작 전인 예약만(지난 예약은 매장 기록). 시작 시각 없으면 19:00 — _schedule_ended 와 같은 기본값, KST
  delete from public.schedule_reservations sr using public.schedules s
   where sr.user_id = p_uid and s.id = sr.schedule_id
     and (now() at time zone 'Asia/Seoul') < (s.date + coalesce(s.start_time, time '19:00'));
  get diagnostics c = row_count; r := r || jsonb_build_object('schedule_reservations_future', c);
  return r;
end $function$;
revoke all on function public._purge_private_records(uuid) from public, anon, authenticated;
grant execute on function public._purge_private_records(uuid) to service_role;

-- §2 탈퇴 두 함수 — 20260924n 본문 + purge 한 줄
create or replace function public.admin_withdraw_user(p_user_id uuid, p_reason text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hash text; v_role text; v_status text; v_suffix text; v_anon_email text; v_reason text;
begin
  if public.my_role() is distinct from 'admin'::user_role then
    raise exception '권한 없음: 관리자만 강제 탈퇴를 처리할 수 있습니다';
  end if;
  if p_user_id is null then
    raise exception '대상 회원이 지정되지 않았습니다';
  end if;
  v_reason := left(btrim(coalesce(p_reason, '')), 500);
  if v_reason = '' then
    raise exception '강제 탈퇴 사유를 입력해 주세요';
  end if;

  select ci_hash, role::text, status::text
    into v_hash, v_role, v_status
    from public.profiles where id = p_user_id;
  if not found then
    raise exception '대상 회원을 찾을 수 없습니다';
  end if;

  if v_role = 'admin' then
    raise exception '운영자 계정은 강제 탈퇴할 수 없습니다. 권한을 먼저 일반 회원으로 내려 주세요';
  end if;
  if exists (select 1 from public.venues where owner_id = p_user_id) then
    raise exception '매장 대표 계정입니다. 대표 이전 또는 매장 정리를 먼저 끝낸 뒤 다시 시도해 주세요';
  end if;

  perform public._audit(
    'admin_withdraw_user', p_user_id::text,
    jsonb_build_object('reason', v_reason, 'prev_status', v_status, 'prev_role', v_role,
                       'ci_tombstoned', v_hash is not null));

  if v_hash is not null then
    insert into public.withdrawn_identities(ci_hash, reason)
    values (v_hash, 'admin_withdrawn')
    on conflict (ci_hash) do update set reason = 'admin_withdrawn', created_at = now();
  end if;

  v_suffix := substr(replace(p_user_id::text, '-', ''), 1, 12);
  v_anon_email := 'withdrawn_' || v_suffix || '@deleted.invalid';

  update public.profiles set
    status='withdrawn', nickname='탈퇴회원_'||v_suffix, email=v_anon_email,
    real_name=null, phone=null, ci_hash=null, verified_at=null,
    birth_date=null, gender=null, carrier=null,
    venue_id=null, avatar_url=null,
    suspended_until=null, sanction_reason=v_reason
  where id = p_user_id;

  delete from public.venue_staff  where user_id = p_user_id;
  delete from public.venue_owners where user_id = p_user_id;

  update auth.users set email = v_anon_email, phone = null, raw_user_meta_data = '{}'::jsonb
  where id = p_user_id;
  delete from auth.identities      where user_id = p_user_id;
  delete from auth.sessions        where user_id = p_user_id;
  delete from auth.refresh_tokens  where user_id = p_user_id::text;
  delete from auth.one_time_tokens where user_id = p_user_id;

  delete from public.push_subscriptions where user_id = p_user_id;
  perform public._purge_private_records(p_user_id);  -- 20260925d
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'avatars' and name like p_user_id::text || '/%';
end $function$;

create or replace function public.withdraw_my_account()
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_suffix text; v_status text; v_hash text; v_anon_email text;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  select status, ci_hash into v_status, v_hash from public.profiles where id = v_uid;
  if v_status in ('banned','suspended') then
    raise exception '제재 중인 계정은 탈퇴할 수 없습니다. 고객센터로 문의해 주세요';
  end if;
  if exists (select 1 from public.venues where owner_id = v_uid) then
    raise exception '매장 대표는 매장을 먼저 정리(삭제 또는 대표 양도)한 뒤 탈퇴할 수 있습니다';
  end if;
  if v_hash is not null then
    insert into public.withdrawn_identities(ci_hash, reason)
    values (v_hash, 'withdrawn')
    on conflict (ci_hash) do update set reason = 'withdrawn', created_at = now();
  end if;
  v_suffix := substr(replace(v_uid::text, '-', ''), 1, 12);
  v_anon_email := 'withdrawn_' || v_suffix || '@deleted.invalid';
  update public.profiles set
    status='withdrawn', nickname='탈퇴회원_'||v_suffix, email=v_anon_email,
    real_name=null, phone=null, ci_hash=null, verified_at=null,
    birth_date=null, gender=null, carrier=null,
    venue_id=null, sanction_reason='본인 탈퇴', avatar_url=null
  where id = v_uid;
  delete from public.venue_staff  where user_id = v_uid;
  delete from public.venue_owners where user_id = v_uid;
  update auth.users set email = v_anon_email, phone = null, raw_user_meta_data = '{}'::jsonb
  where id = v_uid;
  delete from auth.identities where user_id = v_uid;
  delete from auth.sessions where user_id = v_uid;
  delete from auth.refresh_tokens where user_id = v_uid::text;
  delete from auth.one_time_tokens where user_id = v_uid;
  delete from public.push_subscriptions where user_id = v_uid;
  perform public._purge_private_records(v_uid);  -- 20260925d
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'avatars' and name like v_uid::text || '/%';
end $function$;

revoke all on function public.admin_withdraw_user(uuid, text) from public, anon;
grant execute on function public.admin_withdraw_user(uuid, text) to authenticated, service_role;
revoke all on function public.withdraw_my_account() from public, anon;
grant execute on function public.withdraw_my_account() to authenticated, service_role;

-- §3 자가검사
do $check$
begin
  if has_function_privilege('anon', 'public._purge_private_records(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._purge_private_records(uuid)', 'execute') then
    raise exception '20260925d 자가검사: _purge_private_records ACL 이 열려 있습니다';
  end if;
  if has_function_privilege('anon', 'public.withdraw_my_account()', 'execute')
     or has_function_privilege('anon', 'public.admin_withdraw_user(uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.withdraw_my_account()', 'execute')
     or not has_function_privilege('authenticated', 'public.admin_withdraw_user(uuid,text)', 'execute') then
    raise exception '20260925d 자가검사: 탈퇴 함수 ACL 이상';
  end if;
  if pg_get_functiondef('public.withdraw_my_account()'::regprocedure) not like '%_purge_private_records(v_uid)%'
     or pg_get_functiondef('public.admin_withdraw_user(uuid,text)'::regprocedure) not like '%_purge_private_records(p_user_id)%' then
    raise exception '20260925d 자가검사: 탈퇴 함수가 purge 를 부르지 않습니다';
  end if;
end $check$;
