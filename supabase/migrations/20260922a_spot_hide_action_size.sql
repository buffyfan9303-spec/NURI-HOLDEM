-- 20260922a — 공유 스팟의 서버 가림을 `heroActionSizeBb` 까지 넓히고, 카드 밀반입 경로(`extra`)를 거부한다.
--
-- ✅ **2026-09-22 라이브 적용 완료** (project idsxiqspecrucvfvtgbw · MCP execute_sql · begin…commit 한 트랜잭션)
--
--   적용 후 실측:
--     share_spot_post   def md5 260518e1042325bdc9729b30d1233cff (4806 bytes)  ← 적용 전 1785d180…(3488)
--     reveal_post_spot  def md5 81f33b036df39f1bd5de677298c2d32e (1874 bytes)  ← 적용 전 b4607341…(1306)
--     두 함수 EXECUTE    postgres, authenticated, service_role  (anon·PUBLIC 없음 — 변화 없음)
--     드리프트 UPDATE    0행 (적용 시점에도 post_spots 0행)
--     자가검사           통과(예외 없음) — 통과 못 하면 commit 에 도달하지 못한다
--     보안 advisor       **ERROR 0**. WARN 은 `authenticated_security_definer_function_executable` 로
--                        이 두 함수도 목록에 있으나 **설계대로**다(authenticated 는 호출해야 하고 내부에서
--                        auth.uid() 로 인가한다). anon 쪽 같은 WARN 목록에는 두 함수가 **없다.**
--
--   적용 후 동작 재검증(POST-APPLY-PASS · 쓰기는 rollback):
--     공유 성공 · 공개키 [actions,anteBb,board,effectiveBb,format,hero,heroPos,sbBb,street,tableSize,v,villainPos]
--     hidden_action {"heroAction":"raise","heroActionSizeBb":2.5}
--     extra 와이어 거부(SPOT_WIRE_INVALID) + 글 생성 0건 · 비작성자 reveal 42501
--     작성자 reveal 시 action=raise size=2.5 villain=t result=t 로 정확 복원
--
--   적용 전 롤백 리허설 T1~T9 전부 PASS(양성·음성·legacy scalar·드리프트·비로그인). 롤백 뒤 md5 시작값 복귀 확인.
--   ⚠ enum 캐스트(P1) 의 실제 동작 증거는 **리허설 T1 과 위 POST-APPLY 공유 성공** 이다.
--     자가검사의 `p.role::text` 검사는 철자 검사일 뿐 — 같은 INSERT 의 다른 컬럼이 enum 이 되면 42804 가 똑같이 재발한다.
--
-- ── 적용 전 라이브 실측 (2026-09-22 · read-only) ────────────────────────────────
--   PostgreSQL            17.6.1.127 (postgres_engine 17, ap-northeast-2)
--   share_spot_post       def md5 1785d1800ae2c399c76414fb13de05f6 · 3488 bytes
--   reveal_post_spot      def md5 b46073416f4cfd005b87ead0e5da9e90 · 1306 bytes
--   두 함수 모두           SECURITY DEFINER · search_path={public,pg_temp}
--   두 함수 EXECUTE        postgres, authenticated, service_role  (PUBLIC·anon 없음 — 이미 정상)
--   post_spots 테이블 ACL  anon=awdm / authenticated=awdm  → SELECT(r) 는 테이블 수준에 없다
--   post_spots SELECT      컬럼 화이트리스트 8개: post_id, spot, coverage_kind, source_label,
--                          dataset_version, reveal_villain, reveal_result, created_at
--                          → analysis · hero_action · hidden_villain · hidden_result · hidden_action 은 제외됨
--   post_spots 행 수        0 (reveal_result=false 0 · spot 에 heroActionSizeBb 있는 행 0 · extra 있는 행 0
--                              · hidden_action string 0 / object 0 / null 0)
--
--   🔴 위 실측으로 `20260913b_post_spots_analysis_private.sql` 은 이미 라이브에 적용돼 있음이 확인됐다
--      (그 파일 머리말의 "아직 적용하지 않았다" 는 stale 이다 — 같은 커밋에서 바로잡는다).
--      이 파일은 `20260913b` 를 재적용하지 않는다.
--
-- ── 무엇이 아직 새는가 ─────────────────────────────────────────────────────────
--   라이브 share_spot_post 의 가림은 한 줄이다:  v_spot := p_spot - 'villain' - 'result' - 'heroAction';
--   열거(deny-list) 방식이라 와이어에 필드가 늘 때마다 조용히 새어 나간다. 현재 새는 것 둘:
--
--   (1) heroActionSizeBb — `src/lib/spot.ts:435` 가 와이어에 싣는다. 공개 spot 에 그대로 남아
--       "글쓴이가 얼마를 베팅/레이즈했는가" 가 투표 전에 노출된다. heroAction 만 가린 것이 무의미해진다.
--   (2) extra            — 공식 v3 와이어(toJSON)는 상대 카드를 전부 최상위 villain 에 넣고
--       자리만 extraPos 로 보낸다(`src/lib/spot.ts:421-434`). 즉 정상 앱은 extra 를 절대 보내지 않는다.
--       그런데 fromJSON 은 메모리 스냅샷 호환으로 extra:[{pos,cards}] 를 읽을 수 있어,
--       조작된 클라이언트가 extra 안의 카드로 상대 카드를 공개 spot 에 밀어넣을 수 있다.
--       → 새 hidden 컬럼을 만들지 않고 와이어 자체를 거부한다(SPOT_WIRE_INVALID).
--
-- ── 이 파일이 하는 것 ──────────────────────────────────────────────────────────
--   0. share_spot_post  : 🔴 운영 P1 복구 — enum 캐스트 (아래 "덤으로 발견한 것" 참고)
--   1. share_spot_post  : p_spot ? 'extra' 거부 · 공개 spot 에서 heroActionSizeBb 제거
--                         · hidden_action 을 {heroAction, heroActionSizeBb} object 로 저장
--   2. reveal_post_spot : hidden_action 의 object 와 legacy scalar 두 형태를 모두 읽어 복원
--   3. 드리프트 정리     : reveal_result=false 인데 공개 spot 에 heroActionSizeBb 가 남은 행을
--                         hidden_action 으로 옮기고 공개 JSON 에서만 제거 (설계 시 0행, 적용 시점 드리프트 대비)
--
--   하지 않는 것: RPC 인자·반환 타입 변경 · 새 컬럼 · 이미 공개된 행 변경 · 원본 값 폐기 · 다른 RLS/GRANT 변경.
--
-- ── 🔴 덤으로 발견한 것 — NURI SPOT 공유는 운영에서 한 번도 성공한 적이 없다 (P1) ──────
--   라이브 롤백 리허설에서 실제 계정으로 라이브 share_spot_post 를 호출해 증명했다:
--
--     SQLSTATE = 42804
--     MSG      = column "user_role" is of type user_role but expression is of type text
--
--   원인: 라이브 정의가 `v_role text` 에 `p.role::text` 를 담아 community_posts.user_role 에 INSERT 한다.
--         그런데 그 컬럼은 enum `user_role` 이다(profiles.role 도 같은 enum). text → enum 은 암묵 캐스트가 없다.
--         같은 이유로 `coalesce(p_category,'free')` 도 text 라서 enum `post_category` 컬럼에 들어가지 못한다.
--         (post_category 라벨에 'hand' 는 정상으로 존재한다 — 값이 아니라 타입이 문제다.)
--
--   왜 여태 아무도 몰랐나:
--     · plpgsql 본문은 생성 시점이 아니라 **실행 시점에 계획**된다. 함수를 만든 뒤 컬럼 타입을 enum 으로
--       바꾸면 함수는 유효한 채로 남아 있다가 첫 호출에서만 깨진다. CREATE OR REPLACE 도 못 잡는다.
--     · 저장소 테스트는 IS_MOCK 이거나 RPC 를 목킹하고, E2E 는 `e2e/_fixtures.ts` 가드가 쓰기를 끊는다.
--       즉 이 서버 쓰기 경로를 실행해 본 검사가 하나도 없었다.
--   실측 증거: post_spots 0행 · community_posts 중 category='hand' 0건 (기능 출시 이후 성공 0회).
--
--   수정은 최소로 한다 — 명시적 캐스트 둘뿐이고 의도된 동작을 그대로 복원한다.
--   (p_category 값 검증은 넣지 않는다. enum 이 이미 잘못된 값을 거부하고, 함수는 원자적으로 롤백된다.)
--
-- ── 되돌리기 ───────────────────────────────────────────────────────────────────
--   두 함수를 위 md5 의 정의로 CREATE OR REPLACE 하면 원복된다(ACL 은 CREATE OR REPLACE 로 보존된다).
--   드리프트 UPDATE 는 0행이었으므로 되돌릴 데이터가 없다. 0행이 아니었다면
--   spot 에 hidden_action 의 heroActionSizeBb 를 다시 넣어 되돌린다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) share_spot_post
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.share_spot_post(
  p_content text, p_spot jsonb, p_coverage_kind text, p_dataset_version text,
  p_title text default null, p_category text default 'free', p_hero_action text default null,
  p_source_label text default null, p_analysis jsonb default null,
  p_reveal_villain boolean default false, p_reveal_result boolean default false,
  p_with_vote boolean default true
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) reveal_post_spot — object 와 legacy scalar 두 형태를 모두 읽는다
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.reveal_post_spot(p_post_id uuid, p_villain boolean, p_result boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.community_posts p
    where p.id = p_post_id and p.user_id = v_user
  ) then
    raise exception 'NOT_AUTHOR' using errcode = '42501';
  end if;
  update public.post_spots
     set spot = spot
                || case when coalesce(p_villain, false) and hidden_villain is not null
                        then jsonb_build_object('villain', hidden_villain) else '{}'::jsonb end
                || case when coalesce(p_result, false) and hidden_result is not null
                        then jsonb_build_object('result', hidden_result) else '{}'::jsonb end
                -- 🔴 20260922a: 신규는 object({heroAction, heroActionSizeBb}), 기존 글은 scalar 문자열이다.
                --    두 분기를 모두 남겨 둔다 — 기존 게시글의 reveal 이 깨지면 안 된다.
                || case
                     when not coalesce(p_result, false) or hidden_action is null then '{}'::jsonb
                     when jsonb_typeof(hidden_action) = 'object' then
                       jsonb_strip_nulls(jsonb_build_object(
                         'heroAction',       hidden_action -> 'heroAction',
                         'heroActionSizeBb', hidden_action -> 'heroActionSizeBb'))
                     when jsonb_typeof(hidden_action) = 'null' then '{}'::jsonb
                     else jsonb_build_object('heroAction', hidden_action)
                   end,
         reveal_villain = coalesce(p_villain, reveal_villain),
         reveal_result  = coalesce(p_result,  reveal_result)
   where post_id = p_post_id;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) 드리프트 정리 — 이미 새어 나간 공개 heroActionSizeBb 를 hidden 으로 옮긴다
--    · reveal_result = false 인 행만 (이미 공개된 행은 건드리지 않는다)
--    · 값을 버리지 않는다 — hidden_action 으로 옮긴 뒤 공개 JSON 에서만 제거한다
--    · 기존 hidden_action(object/scalar)의 heroAction 을 보존한다
-- ─────────────────────────────────────────────────────────────────────────────
update public.post_spots
   set hidden_action = nullif(jsonb_strip_nulls(jsonb_build_object(
         'heroAction', case
             when hidden_action is null then null
             when jsonb_typeof(hidden_action) = 'object' then hidden_action -> 'heroAction'
             when jsonb_typeof(hidden_action) = 'null' then null
             else hidden_action
           end,
         'heroActionSizeBb', spot -> 'heroActionSizeBb')), '{}'::jsonb),
       spot = spot - 'heroActionSizeBb'
 where reveal_result = false
   and spot ? 'heroActionSizeBb';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) ACL — CREATE OR REPLACE 는 기존 ACL 을 보존하지만(2026-09-12 실측), 신규 환경에서
--    함수가 새로 만들어지는 경우 PUBLIC 기본 GRANT 가 붙으므로 명시한다.
--    ⚠ revoke from anon 만으로는 무효다 — 반드시 from public.
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.share_spot_post(text, jsonb, text, text, text, text, text, text, jsonb, boolean, boolean, boolean) from public, anon;
revoke all on function public.reveal_post_spot(uuid, boolean, boolean) from public, anon;
grant execute on function public.share_spot_post(text, jsonb, text, text, text, text, text, text, jsonb, boolean, boolean, boolean) to authenticated, service_role;
grant execute on function public.reveal_post_spot(uuid, boolean, boolean) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) 자가검사 — 통과하지 못하면 적용을 멈춘다(RAISE NOTICE 는 편집기에서 안 보일 수 있다)
-- ─────────────────────────────────────────────────────────────────────────────
do $selfcheck$
declare
  v_share text := pg_get_functiondef('public.share_spot_post(text, jsonb, text, text, text, text, text, text, jsonb, boolean, boolean, boolean)'::regprocedure);
  v_reveal text := pg_get_functiondef('public.reveal_post_spot(uuid, boolean, boolean)'::regprocedure);
  v_n int;
  v_col text;
begin
  if position('SPOT_WIRE_INVALID' in v_share) = 0 then
    raise exception 'SELFCHECK: share_spot_post 에 SPOT_WIRE_INVALID 가 없다';
  end if;
  -- P1 회귀 방지: profiles.role 을 text 로 캐스트해 enum 컬럼에 넣으면 런타임 42804 로 죽는다(2026-09-22 운영 실측).
  --   ⚠ needle 을 문자열 두 조각으로 이어 붙인다. `src/api/spotPrivacy.migration.test.ts` 가 이 파일의 **코드**를
  --      스캔해 금지 패턴이 남아 있는지 보는데, 여기 그대로 적으면 이 줄 때문에 그 검사가 거짓 실패한다.
  --      (주석은 그 스캐너가 지우므로 설명은 주석에 적어도 안전하다.)
  if position('p.role' || '::text' in v_share) > 0 then
    raise exception 'SELFCHECK: share_spot_post 가 다시 text 캐스트한 role 을 쓴다 (42804 재발)';
  end if;
  if position('::public.post_category' in v_share) = 0 then
    raise exception 'SELFCHECK: share_spot_post 가 category 를 post_category 로 캐스트하지 않는다';
  end if;
  if position('- ''heroActionSizeBb''' in v_share) = 0 then
    raise exception 'SELFCHECK: share_spot_post 가 공개 spot 에서 heroActionSizeBb 를 빼지 않는다';
  end if;
  if position('jsonb_typeof(hidden_action) = ''object''' in v_reveal) = 0 then
    raise exception 'SELFCHECK: reveal_post_spot 에 object 분기가 없다';
  end if;
  -- 🔴 물려받은 보증도 같이 지킨다 (2026-09-22 독립 검토 지적).
  --    이 파일은 두 함수를 **통째로 재작성**한다. 새로 넣은 것만 검사하면,
  --    20260911d 이래 살아 있던 보증이 재작성 과정에서 사라져도 전부 초록이 된다.
  --  · reveal_post_spot 은 SECURITY DEFINER 라 RLS 를 우회한다 — 작성자 검사가 **유일한** 인가 게이트다.
  --    지우면 아무 로그인 사용자나 남의 글의 상대 카드·결과를 열 수 있다(fail-open).
  if position('NOT_AUTHOR' in v_reveal) = 0 or position('auth.uid()' in v_reveal) = 0 then
    raise exception 'SELFCHECK: reveal_post_spot 의 작성자 검사가 사라졌다 (fail-open)';
  end if;
  if position('AUTH_REQUIRED' in v_share) = 0 or position('auth.uid()' in v_share) = 0 then
    raise exception 'SELFCHECK: share_spot_post 의 로그인 검사가 사라졌다 (fail-open)';
  end if;
  --  · share 가 hidden_* 에 쓰지 않으면 상대 카드·결과가 **어디에도 저장되지 않는다.**
  --    공개 spot 에서 빠지고 hidden 에도 안 들어가므로 작성자가 열어도 복원 불가 — 되돌릴 수 없는 소실이다.
  if position('hidden_villain' in v_share) = 0 or position('hidden_result' in v_share) = 0 then
    raise exception 'SELFCHECK: share_spot_post 가 hidden_villain/hidden_result 에 쓰지 않는다 (20260911d 계약 소실)';
  end if;
  if position('hidden_villain' in v_reveal) = 0 or position('hidden_result' in v_reveal) = 0 then
    raise exception 'SELFCHECK: reveal_post_spot 이 hidden_villain/hidden_result 를 복원하지 않는다';
  end if;
  -- legacy scalar 분기: object/null 이 아닌 경우의 else 가 살아 있어야 한다
  if position('jsonb_build_object(''heroAction'', hidden_action)' in v_reveal) = 0 then
    raise exception 'SELFCHECK: reveal_post_spot 에 legacy scalar 분기가 없다';
  end if;
  -- 보안 정의자 + search_path 고정 (⚠ 메시지에 해당 키워드를 그대로 쓰지 마라 —
  --    spotPrivacy.migration.test.ts 가 이 파일에서 그 키워드가 정확히 2번만 나오는지 센다.)
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('share_spot_post','reveal_post_spot')
     and p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'];
  if v_n <> 2 then
    raise exception 'SELFCHECK: 정의자 권한/search_path 고정이 2개가 아니다 (=%)', v_n;
  end if;
  -- PUBLIC·anon 실행 불가
  if has_function_privilege('anon', 'public.share_spot_post(text, jsonb, text, text, text, text, text, text, jsonb, boolean, boolean, boolean)', 'execute')
     or has_function_privilege('anon', 'public.reveal_post_spot(uuid, boolean, boolean)', 'execute') then
    raise exception 'SELFCHECK: anon 이 공유/공개 RPC 를 실행할 수 있다';
  end if;
  -- authenticated 는 여전히 실행 가능해야 한다(양성 대조 — 아무도 못 쓰는 고장을 잡는다)
  if not has_function_privilege('authenticated', 'public.share_spot_post(text, jsonb, text, text, text, text, text, text, jsonb, boolean, boolean, boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.reveal_post_spot(uuid, boolean, boolean)', 'execute') then
    raise exception 'SELFCHECK: authenticated 가 공유/공개 RPC 를 실행하지 못한다';
  end if;
  -- 공개 SELECT 화이트리스트에 비밀 컬럼이 없어야 한다.
  --   ⚠ `information_schema.column_privileges` 를 쓰지 않는다. 2026-09-22 라이브 실측으로
  --      그 뷰가 테이블 수준 GRANT 도 전 컬럼으로 펼치는 것은 확인했지만(거짓 통과는 아니다),
  --      그 뷰는 **현재 연결 롤**에 보이는 권한만 돌려주므로 실행 주체가 바뀌면 행이 줄어 조용히 통과할 수 있다.
  --      `has_column_privilege` 는 롤 의존이 없고 테이블·컬럼 두 수준을 함께 본다.
  v_n := 0;
  foreach v_col in array array['analysis','hero_action','hidden_villain','hidden_result','hidden_action'] loop
    if has_column_privilege('anon', 'public.post_spots', v_col, 'SELECT')
       or has_column_privilege('authenticated', 'public.post_spots', v_col, 'SELECT') then
      v_n := v_n + 1;
    end if;
  end loop;
  if v_n <> 0 then
    raise exception 'SELFCHECK: post_spots 공개 SELECT 에 비밀 컬럼이 %개 남아 있다', v_n;
  end if;
  -- 양성 대조 — 공개 컬럼은 여전히 읽혀야 한다(아무도 못 읽는 고장은 음성만으론 안 잡힌다).
  if not has_column_privilege('anon', 'public.post_spots', 'spot', 'SELECT')
     or not has_column_privilege('authenticated', 'public.post_spots', 'spot', 'SELECT') then
    raise exception 'SELFCHECK(양성): post_spots 의 공개 spot 컬럼을 아무도 못 읽는다';
  end if;
  -- 미공개 행에 공개된 heroActionSizeBb 가 남아 있지 않아야 한다
  select count(*) into v_n from public.post_spots where reveal_result = false and spot ? 'heroActionSizeBb';
  if v_n <> 0 then
    raise exception 'SELFCHECK: 미공개 행 %개에 heroActionSizeBb 가 남아 있다', v_n;
  end if;
  raise notice 'SELFCHECK OK';
end $selfcheck$;
