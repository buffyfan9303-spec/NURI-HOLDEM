-- ============================================================================
-- 랭킹 공개 동의 + '자주 가는 매장' 표기 (2026-08-29 · 오너 #12)
--
-- 무엇을 푸는가
--   메인 '이번 주 머니인 킹' 스트립은 지금 닉네임만 보여준다. 오너는 닉네임 옆에
--   '가장 자주 방문한 매장'을 붙이라고 했다. 그런데 "이 닉네임은 주로 여기 다닌다"는
--   개인의 이동·행동 패턴이라, 닉네임 하나만 공개하던 지금과 성격이 다르다.
--   → 표기는 '동의한 회원'에게만. 동의 컬럼과 조회 RPC를 함께 넣는다.
--
-- '방문'의 정의 = QR 체크인(public.checkins), 매장별 KST 방문 '일수'
--   왜 체크인인가(다른 후보를 버린 이유):
--   · ledger_buyins.player_name 은 매장이 손으로 치는 자유 텍스트다. 실측 1행이
--     '누리홀덤(나누리)' 형식이라 닉네임 정확일치가 0건이다. 부분일치로 붙이면
--     남의 매장을 남에게 붙이는 개인정보 오귀속이라 공개 표기에는 쓸 수 없다.
--   · schedule_reservations 는 '예약'이라 노쇼가 섞인다 = 방문이 아니다.
--     (개인 대시보드용 my_visited_venues 는 예약 기반이지만 그건 본인만 보는 화면이라 그대로 둔다.)
--   · venue_follows 는 관심 표시, venue_rankings 는 성적이지 방문이 아니다.
--   · checkins 만 user_id FK 로 사람이 확정된다. 매장 QR 을 스캔해야 생기므로
--     '그 자리에 갔다'의 직접 증거이기도 하다.
--   같은 날 여러 번 스캔 = 1방문(날짜 distinct). 리바이·재스캔이 순위를 부풀리지 않게.
--
-- 동률·기록 없음
--   방문일수 동률 → 최근 방문이 늦은 매장 → 그래도 같으면 매장명 오름차순.
--   (무작위로 고르면 새로고침마다 매장이 바뀐다 — 결정적이어야 한다.)
--   체크인 0건이면 아무 행도 돌려주지 않는다 → 화면은 매장명을 아예 그리지 않는다.
--
-- 비파괴: 컬럼 추가 2개 + 신규 함수 2개 + handle_new_user 보강. DROP 없음.
-- ============================================================================

-- ── 1) 동의 컬럼 (additive) ──────────────────────────────────────────────────
-- NULL 을 남기는 게 핵심이다. 3-state 여야 한다:
--   NULL  = 아직 물어본 적 없음(기존 회원 · 소셜 가입자) → 기본 비공개, 나중에 재요청 가능
--   false = 물어봤고 거부                                 → 재요청 배너로 괴롭히지 않음
--   true  = 동의
-- 소급 동의 간주(기존 회원을 true 로 backfill)는 하지 않는다 — 개인정보보호법 §15 의
-- 동의는 사전·명시적이어야 하고, 이미 가입한 사람은 이 항목을 본 적이 없다.
alter table public.profiles add column if not exists public_ranking_consent    boolean;
alter table public.profiles add column if not exists public_ranking_consent_at timestamptz;

comment on column public.profiles.public_ranking_consent is
  '랭킹 프로필 공개 동의(선택). NULL=미응답(기본 비공개) / false=거부 / true=동의. 자주 가는 매장 표기 게이트.';

-- ── 2) 가입 트리거 보강 — user_metadata 의 동의값을 프로필로 옮긴다 ──────────
-- 현재 라이브 정의(2026-08-29 조회)에 두 줄만 더한 것이다. 나머지는 손대지 않았다.
-- 메타데이터에 키가 없으면(소셜 가입) NULL 로 남긴다 = '미응답'. false 로 굳히면
-- 나중에 동의를 받을 수 있는 사람을 '거부자'로 잘못 분류한다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_provider text     := coalesce(new.raw_app_meta_data->>'provider', 'email');
  v_name   text       := nullif(trim(coalesce(
                           new.raw_user_meta_data->>'name',
                           new.raw_user_meta_data->>'full_name',
                           new.raw_user_meta_data->>'preferred_username',
                           split_part(coalesce(new.email, ''), '@', 1))), '');
  v_nick   text       := nullif(trim(coalesce(new.raw_user_meta_data->>'nickname', '')), '');
  v_role   user_role  := coalesce((new.raw_user_meta_data->>'role')::user_role, 'user');
  v_status user_status := case when coalesce((new.raw_user_meta_data->>'role')::user_role, 'user') = 'venue_owner'
                               then 'pending'::user_status else 'active'::user_status end;
  v_social boolean    := v_provider <> 'email';
  v_pubrank boolean   := (new.raw_user_meta_data->>'public_ranking_consent')::boolean;
begin
  if v_name is null then v_name := '홀덤회원'; end if;
  if v_nick is null or exists (select 1 from public.profiles where lower(trim(nickname)) = lower(v_nick)) then
    v_nick := v_name || '_' || left(new.id::text, 4);
  end if;
  -- 닉네임도 중복이면(동명 소셜 가입) id 4자리로 한 번 더 유일화
  if exists (select 1 from public.profiles where lower(trim(nickname)) = lower(v_nick)) then
    v_nick := v_name || '_' || left(replace(new.id::text, '-', ''), 8);
  end if;

  insert into public.profiles (
    id, email, name, nickname, role, status,
    agreed_to_terms, agreed_to_privacy, agreed_to_anti_gambling, agreed_to_marketing, terms_agreed_at,
    public_ranking_consent, public_ranking_consent_at
  ) values (
    new.id, new.email, v_name, v_nick, v_role, v_status,
    coalesce((new.raw_user_meta_data->>'agreed_to_terms')::boolean, v_social),
    coalesce((new.raw_user_meta_data->>'agreed_to_privacy')::boolean, v_social),
    coalesce((new.raw_user_meta_data->>'agreed_to_anti_gambling')::boolean, v_social),
    coalesce((new.raw_user_meta_data->>'agreed_to_marketing')::boolean, false),
    case when coalesce((new.raw_user_meta_data->>'agreed_to_terms')::boolean, v_social) then now() else null end,
    v_pubrank,
    case when v_pubrank is not null then now() else null end
  ) on conflict (id) do nothing;

  -- 소셜 프로필 사진 반영(있을 때만) — 이후 사용자가 바꾸면 그 값 유지(가입 시 1회)
  if new.raw_user_meta_data->>'avatar_url' is not null then
    update public.profiles set avatar_url = new.raw_user_meta_data->>'avatar_url'
     where id = new.id and avatar_url is null;
  end if;

  -- venue_owner는 매장 자동 생성 안 함(셀프 매장 생성으로). 전화번호만 저장.
  if v_role = 'venue_owner' then
    update public.profiles set approved = false, phone = nullif(new.raw_user_meta_data->>'phone','')
     where id = new.id;
  elsif v_role = 'venue_staff' then
    update public.profiles set venue_id = nullif(new.raw_user_meta_data->>'venue_id', '')::uuid, approved = false
     where id = new.id;
  end if;

  return new;
end;
$function$;

-- ── 3) 동의 갱신 RPC (프로필 설정 · 가입 후 재요청 경로) ─────────────────────
-- 타임스탬프를 서버가 찍는다 — 동의 시각은 분쟁 시 증거라 클라이언트가 쓰게 두지 않는다.
-- p_on = null 이면 '미응답'으로 되돌린다(동의 철회와 구분해 쓰고 싶을 때).
create or replace function public.set_my_public_ranking_consent(p_on boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare v_uid uuid := auth.uid();
begin
  -- NULL-safe: 비로그인(auth.uid() IS NULL)에서 조용히 통과하지 않게 명시 차단.
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  update public.profiles
     set public_ranking_consent    = p_on,
         public_ranking_consent_at = case when p_on is null then null else now() end
   where id = v_uid;
  return coalesce(p_on, false);
end;
$fn$;
revoke all on function public.set_my_public_ranking_consent(boolean) from public, anon;
grant execute on function public.set_my_public_ranking_consent(boolean) to authenticated, service_role;

-- ── 4) 랭킹 닉네임 → 가장 자주 방문한 매장 ───────────────────────────────────
-- 동의한 활성 회원만. 닉네임이 2명 이상에게 걸리면(이론상 unique 지만 방어) 통째로 제외한다
-- — 확실하지 않은 귀속은 표기하지 않는 편이 틀린 매장을 붙이는 것보다 낫다.
-- weekly_moneyin_kings 를 손대지 않고 별도 RPC 로 둔 이유: 그 함수는 같은 웨이브의
-- 다른 작업이 잡고 있다. 반환 타입을 바꾸려면 DROP 이 필요해 충돌 면적이 커진다.
create or replace function public.ranking_top_venues(p_nicknames text[])
returns table(nickname text, venue_name text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  with q as (
    select distinct btrim(n) as raw, lower(btrim(n)) as key
    from unnest((coalesce(p_nicknames, '{}'::text[]))[1:20]) as n   -- 한 화면 상한
    where btrim(coalesce(n, '')) <> ''
  ),
  who as (
    select q.raw, (array_agg(p.id))[1] as id   -- min(uuid) 은 PG 에 없다
    from q
    join public.profiles p
      on lower(btrim(p.nickname)) = q.key
     and coalesce(p.status::text, 'active') = 'active'
     and coalesce(p.public_ranking_consent, false) = true
    group by q.raw
    having count(*) = 1                                             -- 동명이인은 표기하지 않음
  ),
  vis as (
    select w.raw,
           v.name as vname,
           count(distinct ((c.created_at at time zone 'Asia/Seoul')::date)) as visit_days,
           max(c.created_at) as last_at
    from who w
    join public.checkins c on c.user_id = w.id
    join public.venues   v on v.id = c.venue_id
                          and v.approved = true                     -- 미승인 매장은 공개면에 안 띄운다
                          and coalesce(v.status::text, 'active') = 'active'
    group by w.raw, c.venue_id, v.name
  )
  select distinct on (raw) raw, vname
  from vis
  order by raw, visit_days desc, last_at desc, vname asc;
$fn$;
revoke all on function public.ranking_top_venues(text[]) from public, anon;
grant execute on function public.ranking_top_venues(text[]) to authenticated, service_role;
-- anon 미부여는 의도다: 동의했더라도 '어느 매장에 자주 가는지'를 비로그인 크롤러에게까지
-- 뿌리지 않는다. 비로그인 홈은 닉네임만 보이고 매장명 자리는 비어 있다(레이아웃 영향 0).
