-- ⏳ 미적용 초안 (store-team 작성, 2026-09-30). 적용은 리드가 MCP execute_sql 로(적용 전 critical 재검토). 리허설 결과는 맨 아래.
-- 20260930f — 화면만 막던 가드를 서버로 (오너 2026-09-30 보안 점검 D-2 ← critical-reviewer D-1)
-- 🔴 §0 게이트는 이 파일을 **한 번에** 적용할 때만 전체를 지킨다 — 나눠 적용 금지(앞부분만 적용되면 뒤 함수의 md5 대조가 빠진다).
--
-- 원천: .claude/agent-memory-local/critical-reviewer/security_d1_ai_webapp_review_2026-09-30.md · D-1 ⑥ 화면 가드 표(F1~F4) · P2-1/2/3/5.
-- 전제(2026-09-30 라이브 실측): app_settings.identity_voucher_enabled = 'on' · PG 17.6 · 제재 계정 0명 · 미인증 일반 회원 2명.
--
-- F1 [P1] reserve_schedule 에 활성 계정 검사(제재 차단). **본인인증 검사는 넣지 않는다** — 오너 결정 2026-09-29 "대회 예약은 로그인만"
--    (20260929a_reservation_message_no_identity.sql 4–5행 · src/components/features/postGateContract.test.ts:56). critical 재검토(리드 결정)로 뺐다.
--    · 직접 INSERT 경로를 닫는다: schedule_reservations 의 INSERT 를 authenticated·anon 에서 회수(예약은 RPC 로만).
--      sr_update 는 with_check 가 없어 본인 행의 schedule_id 를 다른 대회로 바꾸는 '우회 예약'이 됐다 → UPDATE 는 display_name 열만.
--      anon 은 정책상 아무것도 못 했지만 GRANT 가 남아 있었다 → 전부 회수. 화면 사용(src/api/reservations.ts): select·delete·update(display_name) 만.
--    · 기존 미인증 예약 행은 지우지 않는다(과거 데이터 보존).
-- F2 [P1] require_active_author 트리거가 `current_user in ('authenticated','anon')` 일 때만 검사 → 정의자 함수 안(current_user=소유자)에서 꺼졌다.
--    · 근본: 트리거 조건에 `auth.uid() is not null` 을 더한다(로그인한 사람이 부른 쓰기면 정의자 함수 안에서도 검사).
--      크론·service_role(JWT sub 없음)은 종전대로 통과. 라이브 전수: 이 13개 테이블에 INSERT 하는 정의자 함수는 share_spot_post 하나뿐,
--      UPDATE 트리거(comments content/post_id)를 타는 정의자 함수는 0(_sync_nickname_snapshots 는 이름 열만).
--    · 그리고 함수 첫 분기에도 명시: share_spot_post · reserve_schedule · check_in(→ _apply_checkin 의 유일한 호출부).
-- F3 [P2] 제재 계정의 출석·점수·미션·투표·좋아요 쓰기 차단 — check_in · claim_daily_login_point(예외 대신 null — 비로그인과 같은 모양) ·
--    claim_mission · cast_poll_vote · toggle_post_like · toggle_listing_like · post_reactions 직접 쓰기(pr_self with_check).
--    이용권 사용·조회(redeem_my_voucher_by_qr/phone·지갑)는 **허용 유지** — 오너 결정 2026-09-30: 정지된 사용자도 이미 받은 이용권은 쓸 수 있다.
--    (리허설에 정지 계정의 이용권 사용·지갑 조회 양성 대조를 넣었다. 새 트리거 조건도 store_vouchers 경로에는 닿지 않는다.)
-- F4 [P2] venues_update 정책에 제재 판정(_actor_not_sanctioned — schedules 정책과 같은 함수). 승인 판정은 넣지 않는다
--    (20260926c 리드 결정: 심사 중 업주가 자기 신청 정보를 고치는 경로). 보호 컬럼은 guard_venue_verification 트리거가 그대로 막는다.
-- P2-1 get_domestic_rankings 의 total_won(상금 합 원화)을 반환에서 뺀다 — 화면 미사용(src 전수 grep: rankverify.ts 매핑뿐), §28.
--    반환 타입이 바뀌므로 DROP + 재생성 → ACL 이 초기화된다 → REVOKE/GRANT 를 라이브 값(anon·authenticated·service_role)대로 다시 쓴다.
--    정렬은 내부에서 그대로(points desc, 상금 합 desc).
-- P2-2 venue_player_counts 공개 분기의 장부 이름 원문 노출 — **보류 — 별도 과제**(리드 결정 2026-09-30).
--    순위 닉네임만 남기면 공개 바인왕·출석왕 보드가 통째로 비는 기능 축소라 이 파일에서 뺐다. 라이브 영향: rankMetrics 를 켠 매장 0.
-- P2-3 poll_results · cast_poll_vote 가 게시글 RLS(posts_select: 블라인드·차단·본인·관리자)를 우회 → _poll_visible(내부) 로 같은 조건을 본다.
--    ⚠ 조건은 posts_select 정책의 복제다 — §0-b 가 그 정책의 md5 를 고정해 둔다. 정책을 바꾸면 _poll_visible 도 같이 바꿔라.
-- P2-5 정책 0개인데 GRANT 가 남은 테이블 4개 → anon·authenticated 권한 전부 회수. 참조 전수(2026-09-30): 정책·invoker 함수·뷰 0곳,
--    src·엣지 직접 접근 0곳(정의자 함수만 쓴다).
--
-- ── F2 전수 표: 로그인 사용자가 부르는 정의자 쓰기 함수 중 제재 검사가 없던 것 (2026-09-30 라이브 pg_proc, admin_* 제외) ──
--   | 함수 | 쓰는 곳 | 이번 조치 |
--   | share_spot_post | community_posts·post_spots·post_polls | 함수 가드 + 트리거 근본 수정 |
--   | reserve_schedule | schedule_reservations | 함수 가드(활성) + 직접 INSERT 회수 (본인인증 없음 — 오너 결정 2026-09-29) |
--   | check_in → _apply_checkin | checkins·profiles.activity_points·customer_profiles | check_in 가드(_apply_checkin 은 service_role 전용, 호출부 1) |
--   | claim_daily_login_point | profiles.activity_points·last_seen_at | 비활성이면 null(적립·접속 갱신 없음) |
--   | claim_mission | mission_claims·profiles.activity_points | 함수 가드 |
--   | cast_poll_vote | post_poll_votes | 함수 가드 + 글 조회 가능 여부 |
--   | toggle_post_like | post_likes·community_posts.like_count | 함수 가드 |
--   | toggle_listing_like | listing_likes·marketplace_listings.like_count | 함수 가드 |
--   | (테이블) post_reactions 직접 INSERT | post_reactions(+트리거 on_post_reaction 카운트) | pr_self with_check 에 is_account_active() |
--   | redeem_my_voucher_by_qr / _by_phone | store_vouchers | 허용 유지(오너 결정 2026-09-30 — 정지 사용자도 받은 이용권은 사용) |
--   | request_buyin / cancel_buyin_request | ledger_buyin_requests | 범위 밖(보고) — 바인 요청은 업주 승인 단계가 있다 |
--   | create_group / join_group / update_group_profile / set_group_join_approval | venues(kind=group)·group_members | 범위 밖(보고) |
--   | punch_my_shift / set_my_shift_time | staff_schedule | 범위 밖(보고) — 직원 판정(_is_active_venue_staff)은 소속 상태만 본다 |
--   | reveal_post_spot / record_referral / record_my_legal_consent / set_my_* / increment_*_view / bump_schedule_view | 자기 설정·조회수 | 범위 밖(무해·자기 데이터) |
--   | bump_post · buy_shout · buy_cosmetic · buy_mark · buy_mark_rental · buy_nickname_reset · buy_season_badge | — | 이미 status 검사 있음 |
--
-- 바뀌는 것: 함수 11개(같은 시그니처 create or replace 10 + DROP/재생성 1) + 내부 함수 1 + 정책 2 + 테이블 권한 5.
-- 되돌리기: 각 함수를 §0 md5 가 가리키는 이전 본문으로 create or replace(get_domestic_rankings 는 DROP 후 옛 반환형으로 재생성 + ACL 재기재),
--   정책 2개를 이전 식으로 alter policy, drop function public._poll_visible(uuid),
--   grant insert, update on public.schedule_reservations to authenticated (anon 은 되돌리지 마라 — 쓰임 0).

-- §0 적용 전 본문 게이트 — 2026-09-30 라이브 md5(pg_get_functiondef). 이미 이 파일이 적용된 본문이면 통과(재적용 가능).
do $pre$
declare r record; d text;
begin
  for r in select * from (values
      ('public.require_active_author()',                 'a34998630427cb3b658442e693c9d46e'),
      ('public.reserve_schedule(uuid,text)',              '2e5c9ea0b55ca2f30e4853750b64d9aa'),
      ('public.share_spot_post(text,jsonb,text,text,text,text,text,text,jsonb,boolean,boolean,boolean)', '260518e1042325bdc9729b30d1233cff'),
      ('public.check_in(uuid,double precision,double precision,double precision)', 'de2c147d44612f3b31cbf325656975f0'),
      ('public.claim_daily_login_point()',                'da5210b510772bddcb2dc6ef40f11b7f'),
      ('public.claim_mission(text)',                      'd96c301b0f1837ef21a73cb4bc0b0615'),
      ('public.cast_poll_vote(uuid,uuid)',                '380e7cf96d793be76cf5036565cf7a1b'),
      ('public.toggle_post_like(uuid)',                   'bbe1d4c617b1e68c4b8ea498490909f2'),
      ('public.toggle_listing_like(uuid)',                'a79e575230fe85f8ec5cb9ff1d2bb546'),
      ('public.get_domestic_rankings(integer)',           '2d068f8a12d79c31b7a1dc24af4b22a5'),
      ('public.poll_results(uuid)',                       '6487b01eb00e2dd3b8e56b22158e33c0'),
      -- 아래 둘은 바꾸지 않는다 — 가드가 기대는 판정의 뜻을 고정한다.
      ('public.is_account_active()',                      'c7b56ae2fff4420cecedfce06bc9d395'),
      ('public._actor_not_sanctioned()',                  'ab42d1744fd2b787610537089f597659')) t(sig, want)
  loop
    d := pg_get_functiondef(r.sig::regprocedure);
    if md5(d) <> r.want and d not like '%20260930f%' then
      raise exception '20260930f: % 라이브 본문이 예상(%)과 다릅니다(%). 본문을 다시 맞추세요', r.sig, r.want, md5(d);
    end if;
  end loop;
end $pre$;

-- §0-b 정책 게이트 — md5(qual|with_check) 2026-09-30 라이브. 이미 적용된 정책이면 통과.
--   posts_select 는 바꾸지 않는다 — _poll_visible 이 그 조건을 복제하므로 어긋나면 멈춘다.
do $prepol$
declare r record; m text; body text;
begin
  for r in select * from (values
      ('venues',          'venues_update', '718e03f917c9fc6698978725d89bd237', '_actor_not_sanctioned'),
      ('post_reactions',  'pr_self',       'a100217ac3a8d3b7a6076e34239d0012', 'is_account_active'),
      ('community_posts', 'posts_select',  '3e147319c67d1c46835bf7111cdd3a67', null)) t(tbl, pol, want, applied_mark)
  loop
    select md5(coalesce(qual,'')||'|'||coalesce(with_check,'')), coalesce(qual,'')||'|'||coalesce(with_check,'') into m, body
      from pg_policies where schemaname = 'public' and tablename = r.tbl and policyname = r.pol;
    if m is null then raise exception '20260930f: 정책 %.% 이 없습니다', r.tbl, r.pol; end if;
    if m <> r.want and (r.applied_mark is null or body not like '%' || r.applied_mark || '%') then
      raise exception '20260930f: 정책 %.% 라이브 본문이 예상(%)과 다릅니다(%)', r.tbl, r.pol, r.want, m;
    end if;
  end loop;
end $prepol$;

-- §1 F2 근본 — 트리거 가드가 정의자 함수 안에서도 켜지게
-- ⚠ security invoker 그대로(20260927b) — definer 로 만들면 current_user 판정이 다시 죽는다.
create or replace function public.require_active_author()
 returns trigger
 language plpgsql
 security invoker
 set search_path to 'public', 'pg_temp'
as $function$
begin
  -- 20260930f: 정의자 함수 안에서는 current_user 가 함수 소유자라 종전 조건이 꺼졌다(share_spot_post 로 제재 계정 글 1행 — D-1 리허설).
  --   로그인한 사람이 부른 쓰기(auth.uid() 있음)면 어느 경로든 검사한다. 크론·service_role(sub 없음)은 종전대로.
  if (current_user in ('authenticated','anon') or auth.uid() is not null) and not public.is_account_active() then
    raise exception '제재 중이거나 비활성화된 계정은 작성할 수 없습니다';
  end if;
  return new;
end $function$;

-- §2 F1 reserve_schedule — 활성 계정 + 본인인증
create or replace function public.reserve_schedule(p_schedule_id uuid, p_name text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  -- 20260930f: 제재 계정 차단(트리거 가드는 정의자 함수 안에서 꺼졌다).
  if not public.is_account_active() then
    raise exception '제재 중이거나 비활성화된 계정은 이용할 수 없습니다';
  end if;
  -- 끝난 대회 차단 — 유령 예약(업주 명단 오염) + 오픈이벤트 첫예약 보너스 어뷰징 방지.
  -- 최종 게이트는 trg_block_ended_reservation 이고, 여기서도 같은 헬퍼를 써 판정이 갈리지 않게 한다.
  if public._schedule_ended(p_schedule_id) is not false then
    raise exception '이미 종료된 대회입니다 — 예약할 수 없습니다';
  end if;
  if v_name = '' then v_name := '예약자'; end if;
  v_name := left(v_name, 30);
  if exists (
    select 1 from schedule_reservations
    where schedule_id = p_schedule_id
      and lower(display_name) = lower(v_name)
      and user_id <> v_uid
  ) then
    raise exception '이미 등록된 닉네임입니다';
  end if;
  insert into schedule_reservations (schedule_id, user_id, display_name)
  values (p_schedule_id, v_uid, v_name)
  on conflict (schedule_id, user_id) do update set display_name = excluded.display_name;
end;
$function$;

-- §2-b 예약은 RPC 로만 — 직접 INSERT·열 전체 UPDATE 회수
revoke all on table public.schedule_reservations from anon;
revoke insert, update on table public.schedule_reservations from authenticated;
grant update (display_name) on table public.schedule_reservations to authenticated;

-- §3 share_spot_post — 활성 계정(본문은 라이브 그대로, 가드 한 분기만 추가)
create or replace function public.share_spot_post(p_content text, p_spot jsonb, p_coverage_kind text, p_dataset_version text, p_title text DEFAULT NULL::text, p_category text DEFAULT 'free'::text, p_hero_action text DEFAULT NULL::text, p_source_label text DEFAULT NULL::text, p_analysis jsonb DEFAULT NULL::jsonb, p_reveal_villain boolean DEFAULT false, p_reveal_result boolean DEFAULT false, p_with_vote boolean DEFAULT true)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := (select auth.uid());
  v_post uuid;
  v_poll uuid;
  v_name text;
  -- 🔴 20260922a(P1): 라이브는 `v_role text` 였고 enum 컬럼 INSERT 에서 42804 로 죽었다. enum 으로 받는다.
  v_role public.user_role;
  v_color text;
  v_spot jsonb;
  v_hidden_action jsonb;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  -- 20260930f: 제재 계정 차단(트리거 require_active_author 는 정의자 함수 안에서 꺼졌다 — D-1 F2).
  if not public.is_account_active() then
    raise exception '제재 중이거나 비활성화된 계정은 작성할 수 없습니다';
  end if;

  if p_content is null or btrim(p_content) = '' then
    raise exception 'CONTENT_REQUIRED' using errcode = '22023';
  end if;
  if char_length(p_content) > 5000 then
    raise exception 'CONTENT_TOO_LONG' using errcode = '22023';
  end if;
  if jsonb_typeof(p_spot) is distinct from 'object' then
    raise exception 'SPOT_INVALID' using errcode = '22023';
  end if;
  -- 🔴 20260922a: 공식 v3 와이어는 상대 카드를 전부 최상위 villain 에 싣고 자리만 extraPos 로 보낸다.
  --    extra 가 들어온 것은 정상 앱 경로가 아니다 — 카드가 가림을 우회해 공개 spot 에 실릴 수 있으므로 거부한다.
  --    이 검사는 어떤 INSERT 보다 앞이라 글·스팟·투표가 한 건도 만들어지지 않는다.
  if p_spot ? 'extra' then
    raise exception 'SPOT_WIRE_INVALID' using errcode = '22023';
  end if;
  if pg_column_size(p_spot) > 8192 then
    raise exception 'SPOT_TOO_LARGE' using errcode = '22023';
  end if;
  if p_coverage_kind not in ('exact_solver','chart_nash','normalized_reference','math_only','unsupported') then
    raise exception 'COVERAGE_INVALID' using errcode = '22023';
  end if;
  if p_hero_action is not null and p_hero_action not in ('fold','check','call','bet','raise') then
    raise exception 'ACTION_INVALID' using errcode = '22023';
  end if;

  select p.name, p.role, p.avatar_color
    into v_name, v_role, v_color
    from public.profiles p where p.id = v_user;
  if v_name is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = '22023';
  end if;

  insert into public.community_posts (user_id, user_name, user_role, user_color, content, title, category)
  values (v_user, v_name, v_role, coalesce(v_color, '#8B5CF6'), p_content,
          -- 🔴 20260922a(P1): category 도 enum(post_category) 이다. text 인자를 명시적으로 캐스트한다.
          nullif(btrim(coalesce(p_title, '')), ''), coalesce(p_category, 'free')::public.post_category)
  returning id into v_post;

  -- 🔴 20260922a: heroActionSizeBb 를 가림 목록에 추가한다. 이게 남으면 heroAction 가림이 무의미하다.
  v_spot := p_spot - 'villain' - 'result' - 'heroAction' - 'heroActionSizeBb';
  if coalesce(p_reveal_villain, false) and p_spot ? 'villain' then
    v_spot := v_spot || jsonb_build_object('villain', p_spot -> 'villain');
  end if;
  if coalesce(p_reveal_result, false) and p_spot ? 'result' then
    v_spot := v_spot || jsonb_build_object('result', p_spot -> 'result');
  end if;
  if coalesce(p_reveal_result, false) and p_spot ? 'heroAction' then
    v_spot := v_spot || jsonb_build_object('heroAction', p_spot -> 'heroAction');
  end if;
  if coalesce(p_reveal_result, false) and p_spot ? 'heroActionSizeBb' then
    v_spot := v_spot || jsonb_build_object('heroActionSizeBb', p_spot -> 'heroActionSizeBb');
  end if;

  -- 🔴 20260922a: hidden_action 을 object 로 저장한다(컬럼 타입 jsonb 그대로, 스키마 변경 없음).
  --    둘 다 없으면 NULL 로 둔다 — 빈 object 를 넣으면 reveal 이 heroAction: null 을 되살린다.
  if p_spot ? 'heroAction' or p_spot ? 'heroActionSizeBb' then
    v_hidden_action := jsonb_strip_nulls(jsonb_build_object(
      'heroAction',       p_spot -> 'heroAction',
      'heroActionSizeBb', p_spot -> 'heroActionSizeBb'));
    if v_hidden_action = '{}'::jsonb then v_hidden_action := null; end if;
  else
    v_hidden_action := null;
  end if;

  insert into public.post_spots (
    post_id, spot, hero_action, coverage_kind, source_label, dataset_version,
    analysis, reveal_villain, reveal_result, hidden_villain, hidden_result, hidden_action
  ) values (
    v_post, v_spot, p_hero_action, p_coverage_kind,
    nullif(btrim(coalesce(p_source_label, '')), ''), p_dataset_version,
    p_analysis, coalesce(p_reveal_villain, false), coalesce(p_reveal_result, false),
    p_spot -> 'villain', p_spot -> 'result', v_hidden_action
  );

  if coalesce(p_with_vote, true) then
    insert into public.post_polls (post_id, question)
    values (v_post, '당신이라면 어떻게 하시겠어요?')
    returning id into v_poll;
    insert into public.post_poll_options (poll_id, idx, label)
    values (v_poll, 0, '폴드'), (v_poll, 1, '콜'), (v_poll, 2, '레이즈');
  end if;

  return v_post;
end;
$function$;

-- §4 check_in — 활성 계정(_apply_checkin 의 유일한 호출부). 가드는 위치 판정·예외 블록 앞(좌표 기록도 남기지 않는다).
create or replace function public.check_in(p_venue_id uuid, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_accuracy double precision DEFAULT NULL::double precision)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_name text; v_recent timestamptz; v_vlat double precision; v_vlng double precision; v_dist double precision;
  v_geo boolean := false; v_err text; v_res jsonb;
begin
  if auth.uid() is null then raise exception '로그인 후 체크인할 수 있습니다'; end if;
  -- 20260930f: 제재 계정은 출석·활동 점수·방문 수를 만들 수 없다.
  if not public.is_account_active() then raise exception '제재 중이거나 비활성화된 계정은 이용할 수 없습니다'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_venue_id::text, 0));
  select name, lat, lng into v_name, v_vlat, v_vlng from public.venues where id = p_venue_id;
  if v_name is null then raise exception '매장을 찾을 수 없습니다'; end if;

  -- 20260926b: 중복 검사를 위치 판정보다 먼저 — 어차피 거부될 출석에는 위치를 쓰지 않는다
  select created_at into v_recent from public.checkins
   where venue_id = p_venue_id and user_id = auth.uid() order by created_at desc limit 1;
  if v_recent is not null and v_recent > now() - interval '4 hours' then
    raise exception '이미 체크인했습니다 (4시간 내 중복 방지)';
  end if;

  -- 20260926b: 좌표는 운영 스위치 'on' + 본인 동의가 있을 때만 쓴다(법 제15조①). 아니면 받은 좌표를 버리고 좌표 없는 출석으로 처리.
  if (p_lat is not null or p_lng is not null)
     and exists (select 1 from public.app_settings where key = 'checkin_geo_enabled' and value = 'on')
     -- 약관판 2 = src/lib/locationConsent.ts LOCATION_TERMS_VERSION. 판을 올리면 이 숫자도 같은 배포에서 올린다.
     and exists (select 1 from public.location_consents where user_id = auth.uid() and granted and terms_version >= 2) then
    v_geo := true;
    insert into public.location_access_log (user_id, purpose, acquired_via) values (auth.uid(), 'checkin_radius', 'device_gps');
    if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180
       or (p_accuracy is not null and p_accuracy < 0) then
      v_err := '위치 값이 올바르지 않아요';
    elsif coalesce(p_accuracy, 0) > 1000 then
      v_err := '위치 정확도가 낮아요. 매장 안에서 다시 시도해 주세요';
    elsif v_vlat is null or v_vlng is null then
      v_err := '이 매장은 아직 출석 위치가 등록되지 않았어요. 매장에 문의해 주세요';
    else
      v_dist := 2 * 6371000 * asin(sqrt(
        power(sin(radians(p_lat - v_vlat) / 2), 2)
        + cos(radians(v_vlat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - v_vlng) / 2), 2)));
      if v_dist > 300 + least(coalesce(p_accuracy, 0), 200) then
        v_err := '매장 근처에서만 출석할 수 있어요';
      end if;
    end if;
    if v_err is not null then return jsonb_build_object('error', v_err); end if;
  end if;

  begin
    v_res := public._apply_checkin(p_venue_id, auth.uid());
  exception when others then
    if v_geo then
      if sqlstate = 'P0001' then return jsonb_build_object('error', sqlerrm); end if;
      raise log 'check_in(geo) _apply_checkin 실패 %: %', sqlstate, sqlerrm;
      return jsonb_build_object('error', '출석을 처리하지 못했어요');
    end if;
    raise;
  end;
  return v_res || jsonb_build_object('name', v_name);
end $function$;

-- §5 claim_daily_login_point — 비활성이면 null(비로그인과 같은 모양 — 호출부 auth.ts 는 오류를 null 로 삼킨다)
create or replace function public.claim_daily_login_point()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_points integer;
begin
  if v_uid is null then
    return null;
  end if;
  -- 20260930f: 제재 계정은 접속 점수를 받지 않는다(화면은 로그인 자체를 막지만 남은 JWT 로 부를 수 있었다).
  if not public.is_account_active() then
    return null;
  end if;

  -- 접속 시각은 매번 갱신
  update public.profiles set last_seen_at = now() where id = v_uid;

  -- 활동 점수는 KST 기준 하루 1회만 +1
  update public.profiles
     set activity_points = coalesce(activity_points, 0) + 1,
         last_login_point_at = v_today
   where id = v_uid
     and (last_login_point_at is null or last_login_point_at < v_today)
  returning activity_points into v_points;

  if v_points is null then
    select activity_points into v_points from public.profiles where id = v_uid;
  end if;
  return v_points;
end; $function$;

-- §6 claim_mission
create or replace function public.claim_mission(p_key text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_week date; v_ok boolean := false; v_reward int := 0;
  v_cm record; v_goal int; v_type text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  -- 20260930f: 제재 계정 차단.
  if not public.is_account_active() then raise exception '제재 중이거나 비활성화된 계정은 이용할 수 없습니다'; end if;
  v_week := (date_trunc('week', (now() at time zone 'Asia/Seoul')::timestamp))::date;
  if exists (select 1 from mission_claims where user_id = auth.uid() and mission_key = p_key and week_start = v_week) then
    raise exception '이미 받은 보상입니다';
  end if;
  if p_key like 'c%' and p_key ~ '^c[0-9]+$' then
    select * into v_cm from custom_missions where id = substring(p_key from 2)::int and active = true;
    if v_cm is null then raise exception '종료된 미션입니다'; end if;
    v_reward := least(200, greatest(0, coalesce(v_cm.reward, 0)));
    v_goal := v_cm.goal; v_type := v_cm.goal_type;
  elsif p_key = 'checkin2' then v_reward := 20; v_goal := 2; v_type := 'checkin';
  elsif p_key = 'post1' then v_reward := 10; v_goal := 1; v_type := 'post';
  elsif p_key = 'moneyin1' then raise exception '종료된 미션 유형입니다 — 대회 순위를 근거로 한 보상은 지급하지 않습니다';
  else raise exception '알 수 없는 미션입니다';
  end if;
  if v_type = 'checkin' then
    select count(*) >= v_goal into v_ok from checkins
     where user_id = auth.uid() and created_at >= (v_week::timestamp at time zone 'Asia/Seoul');
  elsif v_type = 'post' then
    select count(*) >= v_goal into v_ok from community_posts
     where user_id = auth.uid() and created_at >= (v_week::timestamp at time zone 'Asia/Seoul');
  else
    -- 'moneyin'(대회 순위 등재 횟수) — 순위를 근거로 한 포인트 지급은 2026-09-05 종료(법적위험완화 v3)
    raise exception '종료된 미션 유형입니다 — 대회 순위를 근거로 한 보상은 지급하지 않습니다';
  end if;
  if not v_ok then raise exception '아직 미션을 달성하지 못했습니다'; end if;
  insert into mission_claims(user_id, mission_key, week_start) values (auth.uid(), p_key, v_week);
  update profiles set activity_points = coalesce(activity_points, 0) + v_reward where id = auth.uid();
  return format('+%s점 지급 완료!', v_reward);
end $function$;

-- §7 P2-3 투표 — 글 조회 가능 여부(posts_select 복제 · 내부 함수 · 정의자 함수 안에서만 호출)
create or replace function public._poll_visible(p_poll_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20260930f: posts_select 정책과 같은 조건(블라인드 아님 + 내가 차단한 사람 글 아님 / 본인 글 / 관리자).
  --   ⚠ posts_select 를 바꾸면 여기도 같이 — 20260930f §0-b 가 그 정책 md5 를 고정해 두었다.
  select exists (
    select 1
      from public.post_polls pl
      join public.community_posts p on p.id = pl.post_id
     where pl.id = p_poll_id
       and ( ( p.blinded = false
               and not coalesce(p.user_id = any (coalesce((select public.my_blocked_ids()), '{}'::uuid[])), false) )
          or p.user_id = auth.uid()
          or coalesce(public.my_role() = 'admin'::public.user_role, false) )
  );
$function$;
revoke all on function public._poll_visible(uuid) from public, anon, authenticated;
grant execute on function public._poll_visible(uuid) to service_role;

create or replace function public.poll_results(p_poll_id uuid)
 returns table(poll_id uuid, option_id uuid, idx smallint, label text, votes integer)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  -- 20260930f: 글을 볼 수 없는 사람(블라인드·차단·비공개)에게는 집계를 주지 않는다 — 0행.
  select o.poll_id, o.id as option_id, o.idx, o.label, count(v.user_id)::int as votes
  from public.post_poll_options o
  left join public.post_poll_votes v on v.option_id = o.id
  where o.poll_id = p_poll_id
    and public._poll_visible(p_poll_id)
  group by o.poll_id, o.id, o.idx, o.label
  order by o.idx;
$function$;

create or replace function public.cast_poll_vote(p_poll_id uuid, p_option_id uuid)
 returns table(option_id uuid, idx smallint, label text, votes integer)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  -- 20260930f: 제재 계정 차단 + 볼 수 없는 글의 투표 차단(게시글 RLS 우회 방지).
  if not public.is_account_active() then
    raise exception '제재 중이거나 비활성화된 계정은 이용할 수 없습니다';
  end if;
  if not public._poll_visible(p_poll_id) then
    raise exception '투표를 찾을 수 없습니다';
  end if;

  if not exists (
    select 1 from post_poll_options o where o.id = p_option_id and o.poll_id = p_poll_id
  ) then
    raise exception 'OPTION_POLL_MISMATCH' using errcode = '22023';
  end if;

  if exists (
    select 1 from post_polls p
    where p.id = p_poll_id and p.closes_at is not null and p.closes_at <= now()
  ) then
    raise exception 'POLL_CLOSED' using errcode = '22023';
  end if;

  insert into post_poll_votes (poll_id, option_id, user_id)
  values (p_poll_id, p_option_id, v_user)
  on conflict (poll_id, user_id)
  do update set option_id = excluded.option_id, created_at = now();

  return query
    select r.option_id, r.idx, r.label, r.votes
    from public.poll_results(p_poll_id) r
    order by r.idx;
end;
$function$;

-- §8 좋아요 두 곳
create or replace function public.toggle_post_like(p_post_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_liked boolean; v_count int; v_n int;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  -- 20260930f: 제재 계정 차단.
  if not public.is_account_active() then raise exception '제재 중이거나 비활성화된 계정은 이용할 수 없습니다'; end if;
  if exists (select 1 from public.post_likes where post_id = p_post_id and user_id = v_uid) then
    delete from public.post_likes where post_id = p_post_id and user_id = v_uid;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      update public.community_posts set like_count = greatest(0, coalesce(like_count,0) - 1) where id = p_post_id;
    end if;
    v_liked := false;
  else
    insert into public.post_likes(post_id, user_id) values (p_post_id, v_uid) on conflict do nothing;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      update public.community_posts set like_count = coalesce(like_count,0) + 1 where id = p_post_id;
    end if;
    v_liked := true;
  end if;
  select coalesce(like_count,0) into v_count from public.community_posts where id = p_post_id;
  return jsonb_build_object('liked', v_liked, 'count', v_count);
end $function$;

create or replace function public.toggle_listing_like(p_listing_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_liked boolean; v_count int;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  -- 20260930f: 제재 계정 차단.
  if not public.is_account_active() then raise exception '제재 중이거나 비활성화된 계정은 이용할 수 없습니다'; end if;
  if exists (select 1 from public.listing_likes where listing_id = p_listing_id and user_id = v_uid) then
    delete from public.listing_likes where listing_id = p_listing_id and user_id = v_uid;
    update public.marketplace_listings set like_count = greatest(0, coalesce(like_count,0) - 1) where id = p_listing_id;
    v_liked := false;
  else
    insert into public.listing_likes(listing_id, user_id) values (p_listing_id, v_uid) on conflict do nothing;
    update public.marketplace_listings set like_count = coalesce(like_count,0) + 1 where id = p_listing_id;
    v_liked := true;
  end if;
  select coalesce(like_count,0) into v_count from public.marketplace_listings where id = p_listing_id;
  return jsonb_build_object('liked', v_liked, 'count', v_count);
end $function$;

-- §8-b 반응(post_reactions) 직접 쓰기 — 삭제(qual)는 그대로, 새로 쓰기(with_check)만 활성 계정
alter policy pr_self on public.post_reactions
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_account_active());

-- §9 F4 venues UPDATE — 제재된 업주는 매장 행을 못 고친다(관리자 분기는 그대로)
alter policy venues_update on public.venues
  using (((owner_id = (select auth.uid())) and public._actor_not_sanctioned()) or (my_role() = 'admin'::user_role));

-- §10 P2-1 get_domestic_rankings — total_won 제거(반환형 변경 → DROP + 재생성 → ACL 재기재)
drop function if exists public.get_domestic_rankings(integer);
create function public.get_domestic_rankings(p_limit integer default 30)
 returns table(nickname text, points bigint, wins integer, overseas integer)
 language sql
 stable security definer
 set search_path = public, pg_temp
as $function$
  -- 20260930f: 상금 합(원화)은 반환하지 않는다(§28 · 화면 미사용). 동점 정렬에만 안에서 쓴다.
  select s.nickname, s.points, s.wins, s.overseas
  from (
    select rv.nickname,
           sum(public.moneyin_points(rv.amount_won))::bigint                as points,
           sum(rv.amount_won)::bigint                                       as won_sort,
           count(*)::integer                                                as wins,
           count(*) filter (where rv.is_overseas)::integer                  as overseas
    from public.rank_verifications rv
    where rv.status = 'approved'
      and rv.event_kind = 'official'
    group by rv.nickname
    having sum(public.moneyin_points(rv.amount_won)) > 0
  ) s
  order by s.points desc, s.won_sort desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$function$;
revoke all on function public.get_domestic_rankings(integer) from public;
grant execute on function public.get_domestic_rankings(integer) to anon, authenticated, service_role;

-- §12 P2-5 정책 0개 테이블의 남은 GRANT 회수(정의자 함수만 쓴다)
revoke all on table public.venue_event_requests    from anon, authenticated;
revoke all on table public.venue_owners            from anon, authenticated;
revoke all on table public.voucher_credit_requests from anon, authenticated;
revoke all on table public.venue_kill_switch       from anon, authenticated;

-- §13 ACL 재기재(같은 시그니처 create or replace 는 ACL 을 보존하지만, 새로 만들어지는 경우를 위해 라이브 값대로)
revoke all on function public.reserve_schedule(uuid,text) from public, anon;
grant execute on function public.reserve_schedule(uuid,text) to authenticated, service_role;
revoke all on function public.share_spot_post(text,jsonb,text,text,text,text,text,text,jsonb,boolean,boolean,boolean) from public, anon;
grant execute on function public.share_spot_post(text,jsonb,text,text,text,text,text,text,jsonb,boolean,boolean,boolean) to authenticated, service_role;
revoke all on function public.check_in(uuid,double precision,double precision,double precision) from public, anon;
grant execute on function public.check_in(uuid,double precision,double precision,double precision) to authenticated, service_role;
revoke all on function public.claim_daily_login_point() from public, anon;
grant execute on function public.claim_daily_login_point() to authenticated, service_role;
revoke all on function public.claim_mission(text) from public, anon;
grant execute on function public.claim_mission(text) to authenticated, service_role;
revoke all on function public.cast_poll_vote(uuid,uuid) from public, anon;
grant execute on function public.cast_poll_vote(uuid,uuid) to authenticated, service_role;
revoke all on function public.toggle_post_like(uuid) from public, anon;
grant execute on function public.toggle_post_like(uuid) to authenticated, service_role;
revoke all on function public.toggle_listing_like(uuid) from public, anon;
grant execute on function public.toggle_listing_like(uuid) to authenticated, service_role;
revoke all on function public.poll_results(uuid) from public;
grant execute on function public.poll_results(uuid) to anon, authenticated, service_role;

-- §14 자가검사
do $check$
declare r record;
begin
  -- 본문 표식
  for r in select * from (values
      ('public.require_active_author()'), ('public.reserve_schedule(uuid,text)'),
      ('public.share_spot_post(text,jsonb,text,text,text,text,text,text,jsonb,boolean,boolean,boolean)'),
      ('public.check_in(uuid,double precision,double precision,double precision)'),
      ('public.claim_daily_login_point()'), ('public.claim_mission(text)'), ('public.cast_poll_vote(uuid,uuid)'),
      ('public.toggle_post_like(uuid)'), ('public.toggle_listing_like(uuid)'), ('public.get_domestic_rankings(integer)'),
      ('public.poll_results(uuid)'), ('public._poll_visible(uuid)')) t(sig)
  loop
    if pg_get_functiondef(r.sig::regprocedure) not like '%20260930f%' then
      raise exception '20260930f 자가검사: % 본문이 바뀌지 않았습니다', r.sig;
    end if;
  end loop;
  -- 정의자 함수는 search_path 고정
  if exists (select 1 from pg_proc p where p.oid in ('public._poll_visible(uuid)'::regprocedure, 'public.get_domestic_rankings(integer)'::regprocedure)
              and not (p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '20260930f 자가검사: search_path 고정이 빠졌습니다';
  end if;
  -- 트리거 판정은 호출자 권한(20260927b) — definer 로 돌아가면 current_user 판정이 죽는다
  if (select prosecdef from pg_proc where oid = 'public.require_active_author()'::regprocedure) then
    raise exception '20260930f 자가검사: require_active_author 가 security definer 입니다';
  end if;
  -- 반환 열: total_won 없음
  if pg_get_function_result('public.get_domestic_rankings(integer)'::regprocedure) like '%total_won%' then
    raise exception '20260930f 자가검사: get_domestic_rankings 가 아직 total_won 을 반환합니다';
  end if;
  -- ACL: 변이 RPC 는 anon 불가·authenticated 가능, 공개 읽기 3개는 anon 가능, 내부 함수는 둘 다 불가
  if has_function_privilege('anon', 'public.reserve_schedule(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.cast_poll_vote(uuid,uuid)', 'execute')
     or has_function_privilege('anon', 'public.toggle_post_like(uuid)', 'execute')
     or has_function_privilege('anon', 'public._poll_visible(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._poll_visible(uuid)', 'execute') then
    raise exception '20260930f 자가검사: 막아야 할 실행 권한이 열려 있습니다';
  end if;
  if not has_function_privilege('authenticated', 'public.reserve_schedule(uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.share_spot_post(text,jsonb,text,text,text,text,text,text,jsonb,boolean,boolean,boolean)', 'execute')
     or not has_function_privilege('anon', 'public.get_domestic_rankings(integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.get_domestic_rankings(integer)', 'execute')
     or not has_function_privilege('anon', 'public.poll_results(uuid)', 'execute') then
    raise exception '20260930f 자가검사: 필요한 실행 권한이 빠졌습니다';
  end if;
  -- 테이블 권한
  if has_table_privilege('authenticated', 'public.schedule_reservations', 'insert')
     or has_table_privilege('anon', 'public.schedule_reservations', 'select')
     or has_column_privilege('authenticated', 'public.schedule_reservations', 'schedule_id', 'update')
     or not has_column_privilege('authenticated', 'public.schedule_reservations', 'display_name', 'update')
     or not has_table_privilege('authenticated', 'public.schedule_reservations', 'select')
     or not has_table_privilege('authenticated', 'public.schedule_reservations', 'delete') then
    raise exception '20260930f 자가검사: schedule_reservations 권한이 예상과 다릅니다';
  end if;
  if exists (select 1 from information_schema.role_table_grants g
              where g.table_schema = 'public' and g.grantee in ('anon','authenticated')
                and g.table_name in ('venue_event_requests','venue_owners','voucher_credit_requests','venue_kill_switch')) then
    raise exception '20260930f 자가검사: 정책 0개 테이블에 GRANT 가 남았습니다';
  end if;
  -- 비로그인: 트리거 판정·투표 조회 fail-open 없음
  perform set_config('request.jwt.claims', '', true);
  if public.is_account_active() then
    raise exception '20260930f 자가검사: 비로그인에서 is_account_active 가 참입니다';
  end if;
end $check$;

notify pgrst, 'reload schema';

-- 리허설(2026-09-30, store-team, 라이브 begin…raise…rollback — 이 파일 전문 + 적용 전/후 같은 시험 50칸. 하네스: 세션 scratchpad sec-d2/pre.sql·post.sql)
--   §0·§0-b·§0-c 게이트, §14 자가검사 통과. 계정은 역할·인증·소유를 먼저 조회해 골랐다(UN 미인증 일반 · UV 인증 일반 ·
--   SU 인증 일반을 트랜잭션 안에서 7일 정지 · O 승인 업주(로티아레나 소유) · A 관리자). 적용 전 → 후:
--   음성  F1 미인증 예약 ok → '본인인증을 완료해야…' · 정지 예약 ok → '제재 중…' · sr 직접 INSERT 1 → 42501 ·
--         sr schedule_id 바꾸기 1 → 42501 · 비로그인 sr 조회 0행 → 42501
--         F2 정지 share_spot_post 글 생성 → '제재 중…작성할 수 없습니다'
--         F3 정지 출석(+3점) → 거절 · 정지 접속점수 2 → null · 정지 미션 → 제재 문구 · 정지 투표 1 → 거절 ·
--            정지 글 좋아요·매물 찜 → 거절 · 정지 반응 INSERT 1 → 42501(RLS)
--         F4 정지 업주 venues 수정 1 → 0
--         P2-1 비로그인 반환형 total_won 포함 → 없음 · P2-2 공개 분기 4행(4행 모두 순위 밖 이름) → 0행
--         P2-3 블라인드 글 결과(UV·비로그인) 1 → 0, 블라인드 글 기표 1 → '투표를 찾을 수 없습니다'
--         P2-5 venue_owners(UV)·voucher_credit_requests(비로그인) 조회 0행 → 42501, kill_switch INSERT RLS 거절 → 권한 거절
--   양성(전후 동일) 인증 예약 ok · 스위치 off 미인증 예약 ok · 본인 예약 조회·이름 수정·삭제 1 · 활성 share_spot·직접 글 ·
--         크론 문맥(uid 없음) INSERT 1 · 활성 출석·접속점수·투표·좋아요·찜·반응 · 업주·관리자 venues 수정 1 · 남(UV) 0 ·
--         업주 관리 분기 인원수 4 · 작성자·관리자의 블라인드 글 결과 1 · 비로그인 보이는 글 결과 1 ·
--         **정지 계정의 이용권 사용(로티아레나)·지갑 조회 1(오너 결정 — 허용 유지)**
--   본문 대조(적용 전 prosrc 대비 줄 집합 차이): 모든 함수에서 '추가'는 20260930f 주석·가드 줄뿐, '삭제'는
--         require_active_author 조건 1줄 · get_domestic_rankings total_won 2줄 · venue_player_counts 재구성 6줄뿐(의도한 곳).
--   미검증: 원격 클라이언트에서의 화면 문구(서버 문구는 P0001 한국어 — createReservation·shareSpotPost·checkIn·claimMission·
--         castPollVote·toggleListingLike 는 error.message 를, togglePostLike 는 gateError 를 그대로 쓴다).
-- 리허설 뒤 수정(1건): require_active_author 에 `security invoker` 를 명시하고 §14 에 prosecdef 검사를 더했다(20260927b 계약).
--   재리허설(같은 날, 롤백): 새 정의 적용 후 prosecdef=f · ACL {postgres,service_role} 유지 · 정지 계정 share_spot_post 를
--   **함수 가드 없이 트리거만으로** 거절(DENY '제재 중이거나…') — 근본 수정이 단독으로도 막는다는 대조.
-- 2차 수정(2026-09-30, critical 재검토 → 리드 결정): F1 본인인증 분기·§0-c 삭제(오너 결정 '예약은 로그인만'), P2-2(§11) 제외(별도 과제).
--   위 리허설 표의 'F1 미인증 예약 → 본인인증 문구'·'P2-2 공개 분기 → 0행' 줄은 이 판에 해당하지 않는다. 이 판의 재리허설은 아래.
--   재리허설(2차 판, 라이브 롤백): §0·§0-b 게이트·§14 자가검사 통과. 적용 전 → 후:
--     미인증 일반 회원 예약 ok → ok(양성) · 인증 회원 예약 ok → ok · 정지 계정 예약 ok → '제재 중…' 거절 ·
--     미인증 직접 INSERT 1 → 42501 · venue_player_counts md5 554054c1… → 그대로(손대지 않음).
--     ⚠ 이 재리허설은 함수 본문 안의 옛 설명 주석 일부를 줄여 붙였다(실행 문장은 파일과 같다).
