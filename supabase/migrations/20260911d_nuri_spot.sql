-- ============================================================================
-- 20260911d — NURI SPOT: 구조화된 스팟 저장 · 게시글 연결 · 원자적 공유
--
-- 무엇을 만드는가
--   ① spot_reviews  — '내 스팟'(비공개 저장). 작성자만 읽고 쓴다.
--   ② post_spots    — 게시글에 붙는 **공유 시점 스냅샷**. 읽기는 부모 글의 노출 규칙을 그대로 따른다.
--   ③ share_spot_post() — 게시글 + 스팟 + (선택) 액션 투표를 **한 트랜잭션**에 만든다.
--
-- 왜 스냅샷을 따로 두는가
--   내 스팟을 나중에 고치거나 지워도 이미 공유한 글의 근거는 바뀌면 안 된다.
--   또 분석 엔진(dataset_version)이 올라가도 옛 글이 말없이 다른 결론으로 변하면 안 된다.
--   그래서 post_spots 는 spot_reviews 를 참조하지 않고 **값을 복사해** 보관한다.
--
-- 왜 투표 테이블을 새로 만들지 않는가
--   post_polls / post_poll_options / post_poll_votes 가 이미 있다(20260827h).
--   post_poll_votes 의 PK 가 (poll_id, user_id) 라 **1인 1표가 이미 서버에서 강제**되고,
--   cast_poll_vote 가 원자적·멱등 기표를 이미 한다. 폴드·콜·레이즈 세 보기를 그 위에 얹으면
--   새 표·새 RPC·새 RLS 가 하나도 필요 없다. 중복 구현을 만들지 않는다.
--
-- 파괴적 변경 0 — 기존 표·컬럼·정책을 건드리지 않는다. 전부 신규 생성이고 멱등이다.
-- 라이브 적용 전: 어드바이저 보안 ERROR 0 확인.
-- 롤백: 이 파일 맨 아래 ROLLBACK 블록.
-- ============================================================================

-- ── ① 내 스팟 (비공개) ───────────────────────────────────────────────────────
create table if not exists public.spot_reviews (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  -- 구조화된 스팟(src/lib/spot.ts SpotReview). 클라 타입이 단일 소스이고 여기서는 크기·형태만 막는다.
  spot            jsonb not null,
  hero_action     text check (hero_action in ('fold','check','call','bet','raise')),
  coverage_kind   text not null
                    check (coverage_kind in ('exact_solver','chart_nash','normalized_reference','math_only','unsupported')),
  source_label    text check (char_length(source_label) <= 120),
  dataset_version text not null check (char_length(dataset_version) between 1 and 60),
  -- 저장 시점 분석 결과 스냅샷(빈도·판정·수학 지표). 없으면 NULL.
  analysis        jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- jsonb 크기 상한 — 무한정 큰 문서를 밀어 넣지 못하게(egress 예산 5GB/월).
  constraint spot_reviews_spot_obj  check (jsonb_typeof(spot) = 'object'),
  constraint spot_reviews_spot_size check (pg_column_size(spot) <= 8192),
  constraint spot_reviews_ana_size  check (analysis is null or pg_column_size(analysis) <= 8192)
);

create index if not exists spot_reviews_user_idx
  on public.spot_reviews (user_id, created_at desc);

alter table public.spot_reviews enable row level security;

-- 비공개 — 본인 것만. 읽기까지 본인으로 막는다(내 스팟은 남에게 보이지 않는다).
drop policy if exists spot_reviews_own on public.spot_reviews;
create policy spot_reviews_own on public.spot_reviews for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── ② 게시글에 붙는 스팟 스냅샷 ──────────────────────────────────────────────
create table if not exists public.post_spots (
  post_id         uuid primary key references public.community_posts(id) on delete cascade,
  spot            jsonb not null,
  hero_action     text check (hero_action in ('fold','check','call','bet','raise')),
  coverage_kind   text not null
                    check (coverage_kind in ('exact_solver','chart_nash','normalized_reference','math_only','unsupported')),
  source_label    text check (char_length(source_label) <= 120),
  dataset_version text not null check (char_length(dataset_version) between 1 and 60),
  analysis        jsonb,
  -- 공유 시 기본은 **가림** — 상대 카드와 결과는 토론이 끝난 뒤 열어 보는 것이 이 기능의 순서다.
  reveal_villain  boolean not null default false,
  reveal_result   boolean not null default false,
  created_at      timestamptz not null default now(),

  constraint post_spots_spot_obj  check (jsonb_typeof(spot) = 'object'),
  constraint post_spots_spot_size check (pg_column_size(spot) <= 8192),
  constraint post_spots_ana_size  check (analysis is null or pg_column_size(analysis) <= 8192)
);

-- 스포일러는 **서버가 쥔다**. 상대 카드·결과를 spot jsonb 안에 둔 채 reveal 플래그로만
-- 가리면, 행 자체는 읽히므로 devtools 로 정답이 그냥 보인다(= 투표 기능이 무의미해진다).
-- 그래서 공유 시점에 두 조각을 **본문 jsonb 에서 빼내** 아래 컬럼에 넣고, 그 컬럼의
-- SELECT 권한을 회수한다. 작성자가 열면 reveal_post_spot 이 spot 안으로 되돌려 넣는다.
alter table public.post_spots add column if not exists hidden_villain jsonb;
alter table public.post_spots add column if not exists hidden_result  jsonb;
-- 글쓴이가 실제로 한 선택도 **답의 일부**다. 먼저 보이면 "당신이라면?" 투표가
-- 그 값에 끌려간다(앵커링) — 결과와 같은 시점에 열린다.
alter table public.post_spots add column if not exists hidden_action  jsonb;

-- 컬럼 수준 회수 — 이 저장소가 실명 마스킹(20260910b)에서 쓴 것과 같은 수법이다.
-- ⚠ `from anon` 만으로는 부족하다: PUBLIC 기본 GRANT 가 남는다.
-- hero_action 컬럼도 같이 잠근다. jsonb 에서만 빼내고 이 컬럼을 열어 두면
-- `select hero_action` 한 줄로 정답이 그대로 나온다(문 하나만 닫은 셈이 된다).
-- 클라이언트는 이 컬럼을 **쓰기만** 하고 읽지 않는다(src/api/spots.ts 확인).
--
-- ⚠ '테이블 통째 회수 → 읽어도 되는 컬럼만 부여' 순서로 간다.
--   컬럼만 revoke 하는 방식은 **테이블 수준 GRANT 가 이미 있다는 전제**에 기대는데,
--   그 전제는 Supabase 기본 권한 설정에 달려 있어 프로젝트마다 다르다. 전제에 기대면
--   기본값이 바뀐 환경에서 조용히 열린다 — 화이트리스트로 못박는다.
revoke select on public.post_spots from public, anon, authenticated;
grant select (post_id, spot, coverage_kind, source_label, dataset_version,
              analysis, reveal_villain, reveal_result, created_at)
  on public.post_spots to anon, authenticated;

alter table public.post_spots enable row level security;

-- 읽기: **부모 글이 보일 때만**. 20260905m 의 첨부 3정책과 정확히 같은 꼴이다 —
--   서브쿼리 안의 community_posts 에도 호출자의 posts_select 가 적용되므로
--   블라인드·삭제 판정식이 이 저장소에 한 곳뿐이다(여기서 다시 쓰지 않는다).
drop policy if exists post_spots_read on public.post_spots;
create policy post_spots_read on public.post_spots for select
  using (exists (select 1 from public.community_posts p where p.id = post_id));

-- 쓰기: 그 글의 작성자만. 남의 글에 스팟을 붙일 수 없다.
drop policy if exists post_spots_write on public.post_spots;
create policy post_spots_write on public.post_spots for all to authenticated
  using      (exists (select 1 from public.community_posts p where p.id = post_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.community_posts p where p.id = post_id and p.user_id = (select auth.uid())));

-- ── ③ 원자적 공유 ────────────────────────────────────────────────────────────
-- 지금까지 게시글 첨부는 '글 insert → (성공 후) 첨부 insert' 2단이었다. 그래서
--   · 글은 생겼는데 첨부만 실패하는 **부분 성공**이 실제로 가능했고(PostFormModal 이 토스트로만 안내),
--   · 방금 만든 글의 id 를 몰라 **본문 문자열로 재조회**하는 코드까지 있었다(findCreatedPostId).
-- 이 함수는 둘 다 없앤다: 한 번의 호출 = 한 트랜잭션. 실패하면 글도 남지 않는다.
create or replace function public.share_spot_post(
  p_content         text,
  p_spot            jsonb,
  p_coverage_kind   text,
  p_dataset_version text,
  p_title           text default null,
  p_category        text default 'free',
  p_hero_action     text default null,
  p_source_label    text default null,
  p_analysis        jsonb default null,
  p_reveal_villain  boolean default false,
  p_reveal_result   boolean default false,
  -- 액션 투표(폴드·콜·레이즈)를 함께 만들 것인가. 기존 post_polls 를 그대로 쓴다.
  p_with_vote       boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
  v_post uuid;
  v_poll uuid;
  v_name text;
  v_role text;
  v_color text;
  v_spot jsonb;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  -- 입력 검증 — 클라이언트 값을 그대로 믿지 않는다.
  if p_content is null or btrim(p_content) = '' then
    raise exception 'CONTENT_REQUIRED' using errcode = '22023';
  end if;
  if char_length(p_content) > 5000 then
    raise exception 'CONTENT_TOO_LONG' using errcode = '22023';
  end if;
  if jsonb_typeof(p_spot) is distinct from 'object' then
    raise exception 'SPOT_INVALID' using errcode = '22023';
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

  -- 작성자 표시 정보는 **서버가 프로필에서 읽는다** — 클라이언트가 보낸 이름·역할을 쓰지 않는다.
  select p.name, p.role::text, p.avatar_color
    into v_name, v_role, v_color
    from public.profiles p where p.id = v_user;
  if v_name is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = '22023';
  end if;

  insert into public.community_posts (user_id, user_name, user_role, user_color, content, title, category)
  values (v_user, v_name, v_role, coalesce(v_color, '#8B5CF6'), p_content,
          nullif(btrim(coalesce(p_title, '')), ''), coalesce(p_category, 'free'))
  returning id into v_post;

  -- 가릴 조각을 본문에서 **빼낸 채로** 저장한다. 열기 전에는 행을 읽어도 정답이 없다.
  v_spot := p_spot - 'villain' - 'result' - 'heroAction';
  if coalesce(p_reveal_villain, false) and p_spot ? 'villain' then
    v_spot := v_spot || jsonb_build_object('villain', p_spot -> 'villain');
  end if;
  if coalesce(p_reveal_result, false) and p_spot ? 'result' then
    v_spot := v_spot || jsonb_build_object('result', p_spot -> 'result');
  end if;
  if coalesce(p_reveal_result, false) and p_spot ? 'heroAction' then
    v_spot := v_spot || jsonb_build_object('heroAction', p_spot -> 'heroAction');
  end if;

  insert into public.post_spots (
    post_id, spot, hero_action, coverage_kind, source_label, dataset_version,
    analysis, reveal_villain, reveal_result, hidden_villain, hidden_result, hidden_action
  ) values (
    v_post, v_spot, p_hero_action, p_coverage_kind,
    nullif(btrim(coalesce(p_source_label, '')), ''), p_dataset_version,
    p_analysis, coalesce(p_reveal_villain, false), coalesce(p_reveal_result, false),
    p_spot -> 'villain', p_spot -> 'result', p_spot -> 'heroAction'
  );

  -- 액션 투표 — 기존 투표 표를 그대로 쓴다(1인 1표는 post_poll_votes 의 PK 가 이미 강제).
  if coalesce(p_with_vote, true) then
    insert into public.post_polls (post_id, question)
    values (v_post, '당신이라면 어떻게 하시겠어요?')
    returning id into v_poll;
    insert into public.post_poll_options (poll_id, idx, label)
    values (v_poll, 0, '폴드'), (v_poll, 1, '콜'), (v_poll, 2, '레이즈');
  end if;

  return v_post;
end;
$$;

-- ⚠ CREATE OR REPLACE 는 ACL 을 초기화한다 — 재정의 뒤 REVOKE/GRANT 를 다시 쓴다.
--   `from anon` 만으로는 PUBLIC 기본 GRANT 때문에 무효라 반드시 `from public` 을 포함한다.
revoke all on function public.share_spot_post(
  text, jsonb, text, text, text, text, text, text, jsonb, boolean, boolean, boolean) from public, anon;
grant execute on function public.share_spot_post(
  text, jsonb, text, text, text, text, text, text, jsonb, boolean, boolean, boolean) to authenticated, service_role;

comment on function public.share_spot_post(
  text, jsonb, text, text, text, text, text, text, jsonb, boolean, boolean, boolean) is
  'NURI SPOT 공유 — 게시글·스팟 스냅샷·액션 투표를 한 트랜잭션에 만든다. 작성자 표시 정보는 서버가 profiles 에서 읽는다.';

-- ── ④ 스팟 공개 범위 토글(작성자) ────────────────────────────────────────────
-- 토론이 끝난 뒤 상대 카드·결과를 여는 동작. RLS 만으로도 UPDATE 는 되지만,
-- **이 두 컬럼만** 바꾸도록 좁혀 두면 클라이언트가 분석 스냅샷을 나중에 고칠 수 없다.
create or replace function public.reveal_post_spot(
  p_post_id uuid, p_villain boolean, p_result boolean
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
  -- 열기 = 숨겨 둔 조각을 본문 jsonb 로 되돌리는 일. 이때 비로소 클라이언트가 읽을 수 있다.
  update public.post_spots
     set spot = spot
                || case when coalesce(p_villain, false) and hidden_villain is not null
                        then jsonb_build_object('villain', hidden_villain) else '{}'::jsonb end
                || case when coalesce(p_result, false) and hidden_result is not null
                        then jsonb_build_object('result', hidden_result) else '{}'::jsonb end
                || case when coalesce(p_result, false) and hidden_action is not null
                        then jsonb_build_object('heroAction', hidden_action) else '{}'::jsonb end,
         reveal_villain = coalesce(p_villain, reveal_villain),
         reveal_result  = coalesce(p_result,  reveal_result)
   where post_id = p_post_id;
end;
$$;

revoke all on function public.reveal_post_spot(uuid, boolean, boolean) from public, anon;
grant execute on function public.reveal_post_spot(uuid, boolean, boolean) to authenticated, service_role;

-- ── ⑤ 봉인 검증 — 적용 직후 스스로 확인하고 아니면 중단한다 ──────────────────
do $$
declare v_src text;
begin
  -- 내 스팟은 남에게 보이면 안 된다
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'spot_reviews' and policyname = 'spot_reviews_own'
  ) then raise exception 'ABORT: spot_reviews RLS 정책 누락'; end if;

  -- 게시글 스팟 읽기는 부모 글 판정에 묶여 있어야 한다(블라인드 우회 금지)
  select pg_get_expr(polqual, polrelid) into v_src
    from pg_policy where polname = 'post_spots_read';
  if v_src is null or v_src not like '%community_posts%' then
    raise exception 'ABORT: post_spots 읽기가 부모 글에 묶여 있지 않다';
  end if;

  -- 스포일러 컬럼이 정말 안 읽히는가 — 이게 열려 있으면 투표 기능이 무의미해진다.
  if has_column_privilege('authenticated', 'public.post_spots', 'hidden_villain', 'SELECT')
     or has_column_privilege('anon', 'public.post_spots', 'hidden_villain', 'SELECT')
     or has_column_privilege('authenticated', 'public.post_spots', 'hidden_result', 'SELECT')
     or has_column_privilege('anon', 'public.post_spots', 'hidden_result', 'SELECT')
     or has_column_privilege('authenticated', 'public.post_spots', 'hidden_action', 'SELECT')
     or has_column_privilege('anon', 'public.post_spots', 'hidden_action', 'SELECT')
     or has_column_privilege('authenticated', 'public.post_spots', 'hero_action', 'SELECT')
     or has_column_privilege('anon', 'public.post_spots', 'hero_action', 'SELECT') then
    raise exception 'ABORT: 가려야 할 hidden_* 컬럼이 읽힌다';
  end if;

  -- 변이 RPC 가 anon 에게 열려 있으면 안 된다
  if has_function_privilege('anon', 'public.share_spot_post(text, jsonb, text, text, text, text, text, text, jsonb, boolean, boolean, boolean)', 'execute') then
    raise exception 'ABORT: share_spot_post 가 anon 에게 열려 있다';
  end if;
  if has_function_privilege('anon', 'public.reveal_post_spot(uuid, boolean, boolean)', 'execute') then
    raise exception 'ABORT: reveal_post_spot 가 anon 에게 열려 있다';
  end if;
end $$;

-- ============================================================================
-- ROLLBACK (필요 시 이 블록만 실행)
--
-- drop function if exists public.reveal_post_spot(uuid, boolean, boolean);
-- drop function if exists public.share_spot_post(
--   text, jsonb, text, text, text, text, text, text, jsonb, boolean, boolean, boolean);
-- drop table if exists public.post_spots;
-- drop table if exists public.spot_reviews;
-- ============================================================================
