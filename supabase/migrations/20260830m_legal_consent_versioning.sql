-- ============================================================================
-- 약관 동의 '버전' 기록 + 재동의 이력 (2026-08-30 · 약관 개정 제2판)
--
-- 무엇을 푸는가
--   지금 profiles 의 동의 정보는 boolean 4개 + terms_agreed_at 하나뿐이다.
--   "동의했다"는 알지만 **"언제 것에 동의했는지"** 를 모른다. 약관이 실질적으로 바뀐 지금
--   (이용약관 7→16조 · 처리방침 7→14조), 기존 회원의 동의는 '제1판(2026-06-15)에 대한 동의'이지
--   제2판에 대한 동의가 아니다. 버전을 기록하지 않으면
--     ① 누구에게 재동의를 받아야 하는지 특정할 수 없고
--     ② 분쟁에서 "이 회원은 어느 판에 동의했다"를 증명할 수 없다.
--
-- 설계
--   1) profiles.consented_legal_version  — '현재 상태'(빠른 게이트 판정용). NULL = 제1판 이전 = 미상.
--      기존 회원을 2로 backfill 하지 않는다. 소급 동의 간주는 개인정보보호법 §15 의
--      '사전·명시적 동의'가 아니다(public_ranking_consent 때와 같은 이유).
--   2) public.legal_consents             — '이력'(분쟁 증거용). 동의할 때마다 한 행씩 쌓는다.
--      갱신·삭제 정책을 만들지 않는다 = append-only. 증거는 덮어쓰이면 증거가 아니다.
--   3) public.current_legal_version()    — 서버가 아는 현재 버전. 클라이언트가 임의의 큰 값을 보내
--      '미래 버전에 동의한 것'으로 표시해 앞으로의 게이트를 통째로 건너뛰는 것을 막는다(least 로 절단).
--      ⚠ 이 값은 src/lib/legalVersion.ts 의 LEGAL_VERSION 과 짝이다.
--         src/lib/legalVersion.migration.test.ts 가 두 값이 어긋나면 실패시킨다.
--
-- 선택 동의(마케팅)는 절대 필수로 묶지 않는다 — 개인정보보호법 §22⑤.
--   record_my_legal_consent 는 p_marketing 이 false 여도 정상 통과한다. 필수 3종만 검사한다.
--
-- 비파괴: 컬럼 추가 2 · 신규 테이블 1 · 신규 함수 2 · handle_new_user 보강(라이브 정의 + 2줄). DROP 없음.
-- ============================================================================

-- ── 1) 현재 상태 컬럼 (additive) ────────────────────────────────────────────
alter table public.profiles add column if not exists consented_legal_version    integer;
alter table public.profiles add column if not exists consented_legal_version_at timestamptz;

comment on column public.profiles.consented_legal_version is
  '회원이 동의한 약관 판(版) 번호. NULL=제1판 이전(미상) → 재동의 대상. src/lib/legalVersion.ts LEGAL_VERSION 과 짝.';

-- ── 2) 서버가 아는 현재 약관 버전 ───────────────────────────────────────────
-- 약관을 개정할 때: 이 함수의 반환값 +1 · src/lib/legalVersion.ts 의 LEGAL_VERSION +1 (둘은 짝).
create or replace function public.current_legal_version()
returns integer
language sql
immutable
security invoker
set search_path to 'public', 'pg_temp'
as $fn$ select 2 $fn$;
revoke all on function public.current_legal_version() from public, anon;
grant execute on function public.current_legal_version() to authenticated, service_role;

-- ── 3) 동의 이력 (append-only) ──────────────────────────────────────────────
create table if not exists public.legal_consents (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid        not null references auth.users(id) on delete cascade,
  legal_version           integer     not null,
  agreed_to_terms         boolean     not null,
  agreed_to_privacy       boolean     not null,
  agreed_to_anti_gambling boolean     not null,
  agreed_to_marketing     boolean     not null,
  -- 'signup' = 가입 시 동의 / 'gate' = 재동의 게이트 / 'settings' = 설정에서 변경
  source                  text        not null default 'gate',
  agreed_at               timestamptz not null default now()
);
create index if not exists legal_consents_user_at_idx on public.legal_consents (user_id, agreed_at desc);

alter table public.legal_consents enable row level security;

-- 본인 열람만 허용한다(정보주체의 열람권 — 개인정보보호법 §35 · 정보통신망법 §50⑦ 동의 상태 확인).
-- INSERT/UPDATE/DELETE 정책은 **만들지 않는다**. 기록 경로는 아래 SECURITY DEFINER RPC 하나뿐이고,
-- 정책이 없으면 RLS 가 그 외 경로를 전부 거부한다 = 증거의 위·변조 차단.
drop policy if exists legal_consents_select_own on public.legal_consents;
create policy legal_consents_select_own on public.legal_consents
  for select to authenticated
  using (user_id = auth.uid());

revoke all on table public.legal_consents from public, anon;
grant select on table public.legal_consents to authenticated;
grant all    on table public.legal_consents to service_role;

-- ── 4) 동의 기록 RPC ────────────────────────────────────────────────────────
-- 시각은 서버가 찍는다 — 동의 시각은 분쟁 시 증거라 클라이언트가 쓰게 두지 않는다.
create or replace function public.record_my_legal_consent(
  p_version   integer,
  p_terms     boolean,
  p_privacy   boolean,
  p_anti      boolean,
  p_marketing boolean,
  p_source    text default 'gate'
)
returns timestamptz
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid uuid        := auth.uid();
  v_at  timestamptz := now();
  v_ver integer;
begin
  -- NULL-safe: 비로그인에서 조용히 통과하지 않게 명시 차단.
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;

  -- 필수 3종만 검사한다. 마케팅(선택)이 false 여도 여기서 막으면 개인정보보호법 §22⑤ 위반이다.
  -- `is not true` 로 쓴다 — NULL 을 통과시키는 fail-open 을 막기 위함.
  if p_terms is not true or p_privacy is not true or p_anti is not true then
    raise exception '필수 항목에 모두 동의해야 합니다' using errcode = '22023';
  end if;

  -- 클라이언트가 보낸 버전은 서버가 아는 현재 버전을 넘을 수 없다(미래 동의 위조 차단).
  v_ver := least(greatest(coalesce(p_version, 1), 1), public.current_legal_version());

  update public.profiles set
    agreed_to_terms            = true,
    agreed_to_privacy          = true,
    agreed_to_anti_gambling    = true,
    -- 선택 동의는 사용자가 화면에서 정한 값 그대로. 철회(true→false)도 그대로 반영된다.
    agreed_to_marketing        = coalesce(p_marketing, false),
    terms_agreed_at            = v_at,
    -- 뒤로 내려가지 않게 greatest — 낮은 버전 재기록으로 게이트가 되살아나는 것을 막는다.
    consented_legal_version    = greatest(coalesce(consented_legal_version, 0), v_ver),
    consented_legal_version_at = v_at
  where id = v_uid;

  insert into public.legal_consents (
    user_id, legal_version, agreed_to_terms, agreed_to_privacy,
    agreed_to_anti_gambling, agreed_to_marketing, source, agreed_at
  ) values (
    v_uid, v_ver, true, true, true, coalesce(p_marketing, false),
    coalesce(nullif(btrim(p_source), ''), 'gate'), v_at
  );

  return v_at;
end;
$fn$;
revoke all on function public.record_my_legal_consent(integer, boolean, boolean, boolean, boolean, text) from public, anon;
grant execute on function public.record_my_legal_consent(integer, boolean, boolean, boolean, boolean, text) to authenticated, service_role;

-- ── 5) 가입 트리거 보강 — 신규 가입자는 '현재 판'에 동의한 것으로 기록 ──────
-- 2026-08-30 라이브 정의(pg_get_functiondef 로 확인)에 아래 2개 컬럼만 더했다. 나머지는 한 글자도 손대지 않았다.
-- 신규 가입자는 개정판 본문을 보고 동의하므로 현재 버전으로 남긴다 — 안 남기면 시행일에
-- '방금 가입한 사람'에게까지 재동의 게이트가 뜬다.
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
  v_terms  boolean    := coalesce((new.raw_user_meta_data->>'agreed_to_terms')::boolean, v_social);
begin
  if v_name is null then v_name := '홀덤회원'; end if;
  if v_nick is null or exists (select 1 from public.profiles where lower(trim(nickname)) = lower(v_nick)) then
    v_nick := v_name || '_' || left(new.id::text, 4);
  end if;
  if exists (select 1 from public.profiles where lower(trim(nickname)) = lower(v_nick)) then
    v_nick := v_name || '_' || left(replace(new.id::text, '-', ''), 8);
  end if;

  insert into public.profiles (
    id, email, name, nickname, role, status,
    agreed_to_terms, agreed_to_privacy, agreed_to_anti_gambling, agreed_to_marketing, terms_agreed_at,
    public_ranking_consent, public_ranking_consent_at,
    consented_legal_version, consented_legal_version_at
  ) values (
    new.id, new.email, v_name, v_nick, v_role, v_status,
    v_terms,
    coalesce((new.raw_user_meta_data->>'agreed_to_privacy')::boolean, v_social),
    coalesce((new.raw_user_meta_data->>'agreed_to_anti_gambling')::boolean, v_social),
    coalesce((new.raw_user_meta_data->>'agreed_to_marketing')::boolean, false),
    case when v_terms then now() else null end,
    v_pubrank,
    case when v_pubrank is not null then now() else null end,
    case when v_terms then public.current_legal_version() else null end,
    case when v_terms then now() else null end
  ) on conflict (id) do nothing;

  -- 소셜 가입은 여기서 동의를 받은 것이 아니라 ConsentGateModal 이 이후에 받는다.
  -- 그 경로는 record_my_legal_consent 를 타므로 이력이 남는다. 여기서는 이력 행을 만들지 않는다
  -- (트리거가 만든 행은 '사용자가 화면에서 눌렀다'는 증거가 아니다).

  if new.raw_user_meta_data->>'avatar_url' is not null then
    update public.profiles set avatar_url = new.raw_user_meta_data->>'avatar_url'
     where id = new.id and avatar_url is null;
  end if;

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
