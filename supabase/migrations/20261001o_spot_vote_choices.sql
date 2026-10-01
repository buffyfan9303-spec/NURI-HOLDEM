-- ⏳ 미적용 — 초안(community-team 2026-10-01). 적용은 리드만 한다. 라이브에는 begin…raise 롤백 리허설만 했다(아래 §R).
-- 20261001o — SPOT 공유 글의 투표 보기를 상황에 맞춘다(체크를 받은 뒤 내 차례면 '체크·벳').
--   요구 원천: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\spot-share-design\README.md#P9 · 오너 2026-10-01(리드 전달:
--             정본 proto\a-detail-mw-hidden-dark.png — "SB 가 체크한 뒤 내 차례인데 보기가 폴드/콜/레이즈로 나온다 … 체크/벳으로").
--
-- 지금(라이브 20260930f, share_spot_post md5 3765a675…): 보기를 고정값 ('폴드','콜','레이즈') 로 넣는다.
-- 바꾸는 것:
--   §1 _spot_vote_choices(jsonb) 새 내부 함수 — 판정 규칙. 화면 src/components/features/community/spotShare/shareView.ts
--      의 voteChoices 와 **같은 규칙**이다(한쪽을 바꾸면 둘 다 바꾼다):
--        결정 스트리트(spot.street)에 bet·raise 가 있으면 → 폴드·콜·레이즈
--        없고 프리플랍이면 → heroPos 가 BB 면 체크·레이즈, 아니면(블라인드를 마주함) 폴드·콜·레이즈
--        없고 포스트플랍이면 → 체크·벳
--      표시용 라벨만 정한다(권한·금액 없음). immutable · 실행 권한은 PUBLIC/anon/authenticated 모두 회수(정의자 함수 안에서만 쓴다).
--   §2 share_spot_post(같은 12인자 서명 · create or replace → ACL 보존, REVOKE/GRANT 재기재) — 보기 INSERT 한 곳만 바뀐다.
--      나머지 본문은 라이브(20260930f) 그대로다(§0 게이트가 md5 로 확인).
-- 바꾸지 않는 것: 이미 올라간 글의 보기·표(post_poll_options 행 무변경). 옛 글은 화면(fitPollOptions)이 뜻이 같은 이름으로 보여 준다.
--   post_poll_options 의 보기 수 제약(2~6개)은 2개 보기로 충족한다(§R 에서 실제 INSERT 로 확인).
-- 서버 적용 전에도 화면은 안전하다: 화면은 '보기가 정확히 폴드·콜·레이즈' 일 때만 이름을 바꾸고, 이 파일 적용 뒤 글은 손대지 않는다.
-- 되돌리기: share_spot_post 를 20260930f §3 본문으로 create or replace · drop function public._spot_vote_choices(jsonb).

-- §0 적용 전 본문 게이트 — 2026-10-01 라이브 md5(pg_get_functiondef). 이미 이 파일이 적용된 본문이면 통과(재적용 가능).
do $pre$
declare d text;
begin
  d := pg_get_functiondef('public.share_spot_post(text,jsonb,text,text,text,text,text,text,jsonb,boolean,boolean,boolean)'::regprocedure);
  if md5(d) <> '3765a67566ffde0e9ef35fc82e7d99cf' and d not like '%20261001o%' then
    raise exception '20261001o 게이트: share_spot_post 라이브 본문이 초안 작성 때(md5 3765a675…)와 다릅니다 — 다시 읽고 초안을 갱신하세요 (지금 md5 %)', md5(d);
  end if;
end
$pre$;

-- §1 판정 규칙(내부)
create or replace function public._spot_vote_choices(p_spot jsonb)
 returns text[]
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select case
    when exists (
      select 1
        from jsonb_array_elements(case when jsonb_typeof(p_spot -> 'actions') = 'array' then p_spot -> 'actions' else '[]'::jsonb end) a
       where (a ->> 'street') is not distinct from (p_spot ->> 'street')
         and (a ->> 'type') in ('bet', 'raise'))
      then array['폴드', '콜', '레이즈']
    when coalesce(p_spot ->> 'street', 'preflop') = 'preflop'
      then case when (p_spot ->> 'heroPos') = 'BB' then array['체크', '레이즈'] else array['폴드', '콜', '레이즈'] end
    else array['체크', '벳']
  end
$function$;
revoke all on function public._spot_vote_choices(jsonb) from public, anon, authenticated;

-- §2 share_spot_post — 보기 INSERT 만 바뀐다(20261001o 표시).
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
    -- 20261001o: 보기를 상황에 맞춘다(_spot_vote_choices — 화면 voteChoices 와 같은 규칙). 예전: 폴드·콜·레이즈 고정.
    insert into public.post_poll_options (poll_id, idx, label)
    select v_poll, (o.n - 1)::int, o.label
      from unnest(public._spot_vote_choices(p_spot)) with ordinality as o(label, n);
  end if;

  return v_post;
end;
$function$;
revoke all on function public.share_spot_post(text,jsonb,text,text,text,text,text,text,jsonb,boolean,boolean,boolean) from public, anon;
grant execute on function public.share_spot_post(text,jsonb,text,text,text,text,text,text,jsonb,boolean,boolean,boolean) to authenticated, service_role;

-- §3 자가검사
do $self$
begin
  if pg_get_functiondef('public.share_spot_post(text,jsonb,text,text,text,text,text,text,jsonb,boolean,boolean,boolean)'::regprocedure) not like '%_spot_vote_choices%' then
    raise exception '20261001o 자가검사: share_spot_post 본문이 바뀌지 않았습니다';
  end if;
  if has_function_privilege('anon', 'public.share_spot_post(text,jsonb,text,text,text,text,text,text,jsonb,boolean,boolean,boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.share_spot_post(text,jsonb,text,text,text,text,text,text,jsonb,boolean,boolean,boolean)', 'execute') then
    raise exception '20261001o 자가검사: share_spot_post 실행 권한이 예상과 다릅니다';
  end if;
  if has_function_privilege('anon', 'public._spot_vote_choices(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public._spot_vote_choices(jsonb)', 'execute') then
    raise exception '20261001o 자가검사: 내부 함수 _spot_vote_choices 가 열려 있습니다';
  end if;
  if public._spot_vote_choices('{"street":"flop","heroPos":"CO","actions":[{"street":"flop","actor":"villain","type":"check"}]}') <> array['체크','벳']
     or public._spot_vote_choices('{"street":"flop","heroPos":"CO","actions":[{"street":"flop","actor":"villain","type":"bet"}]}') <> array['폴드','콜','레이즈']
     or public._spot_vote_choices('{"street":"preflop","heroPos":"BTN","actions":[]}') <> array['폴드','콜','레이즈']
     or public._spot_vote_choices('{"street":"preflop","heroPos":"BB","actions":[{"street":"preflop","actor":"villain","type":"call"}]}') <> array['체크','레이즈'] then
    raise exception '20261001o 자가검사: 판정 규칙이 화면(voteChoices)과 다릅니다';
  end if;
end
$self$;

-- §R 리허설 기록(2026-10-01, 라이브 · 쓰기 0 — community-team):
--    먼저 롤백이 듣는지 확인: begin; create table _probe…; raise → information_schema 0건.
--    그다음 begin; §1·§2(주석만 줄인 같은 문장)·§3 ACL 검사; set local role authenticated; 행동 검증; raise exception 으로 되돌림.
--    계정은 profiles 에서 role=user·status=active·소유 매장 0 인 3명(글 작성 12초 제한 트리거 rl_posts 때문에 한 사람당 1건).
--    결과(그대로): check=[체크,벳] bet=[폴드,콜,레이즈] bb_limp=[체크,레이즈] villain_in_public_spot=f helper_direct=42501 anon=AUTH_REQUIRED role=authenticated
--      · 체크를 받은 플랍 → 체크·벳 / 벳을 마주한 플랍 → 폴드·콜·레이즈 / 림프만 받은 BB → 체크·레이즈 (양성 3)
--      · 공개 spot 에 villain 없음(가림 유지) · 내부 함수 직접 호출 42501 · 비로그인 AUTH_REQUIRED (음성 3)
--    되돌림 확인: _spot_vote_choices 없음 · share_spot_post md5 3765a675… 그대로 · '리허설' 글 0건 · post_spots 0행.
--    ⚠ 첫 시도는 같은 계정으로 3건을 쓰다 rl_posts(12초 제한)에 걸려 중단됐다 — 이것도 롤백됐다(위 확인과 같은 쿼리).
