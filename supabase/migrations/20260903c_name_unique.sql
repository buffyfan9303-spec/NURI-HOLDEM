-- ============================================================================
-- 20260903c — 닉네임(profiles.name) 중복 불가 + 가용성 검사 RPC
--
-- 배경: 앱에서 '닉네임'으로 보이는 값은 profiles.name(프로필 설정 '닉네임 입력', 30일 쿨다운,
--   랭킹·글 작성자명)이다. profiles.nickname 은 '받는 아이디'(이용권 전송용)로 이미
--   uniq_profiles_nickname_ci + is_nickname_available 이 있다. 오너 지시(2026-09-03):
--   "닉네임, 아이디 모두 중복 불가, 중복체크 필수" → name 에도 같은 장치를 단다.
-- 실측: 적용 시점 profiles 7행, lower(trim(name)) 중복 0 → 인덱스 생성 안전.
-- 멱등 → 재실행 안전. 순서: 트리거 보강(0) → 인덱스(1) → RPC(2).
-- ============================================================================

-- ── 0) 가입 트리거 선보강 — 인덱스보다 먼저 ─────────────────────────────────
-- 유니크 인덱스가 살아나는 순간 handle_new_user(20260830m 본체) 가 OAuth 메타(name/full_name/
-- preferred_username)·이메일 local-part·'홀덤회원' 폴백을 그대로 insert 하므로 동명이인·두 번째
-- '홀덤회원' 이 23505 로 터지고 Supabase Auth 는 'Database error saving new user' 를 돌려준다
-- (소셜 가입 실패 = 라이브 회귀). 20260830m 본체를 그대로 복사하고 name 중복 해소 2단만 더했다.
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
  -- name 유니크(profiles_name_lower_uidx) 충돌 해소 — v_nick 이 v_name 에서 파생되므로 그보다 앞에 둔다.
  -- 20자 상한을 지키도록 left() 로 자른 뒤 접미사(아래 nickname 2단 폴백과 같은 문법).
  if exists (select 1 from public.profiles where lower(trim(name)) = lower(v_name)) then
    v_name := left(v_name, 15) || '_' || left(new.id::text, 4);
  end if;
  if exists (select 1 from public.profiles where lower(trim(name)) = lower(v_name)) then
    v_name := left(v_name, 11) || '_' || left(replace(new.id::text, '-', ''), 8);
  end if;
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
-- 트리거 함수 — 20260902b 가 회수한 상태 유지(CREATE OR REPLACE 는 ACL 을 초기화하므로 다시 쓴다).
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ── 1) 대소문자·앞뒤공백 무시 유니크(빈 이름·null 은 제외) ────────────────────
create unique index if not exists profiles_name_lower_uidx
  on public.profiles (lower(trim(name)))
  where name is not null and trim(name) <> '';

-- ── 2) 가용성 검사 RPC ───────────────────────────────────────────────────────
-- true = 사용 가능, false = 이미 사용 중 또는 형식 위반(공백 정리 후 2~20자 밖).
-- 로그인 상태면 본인 행은 제외한다(프로필 설정에서 현재 닉네임을 그대로 두고 저장해도 통과).
-- auth.uid() 가 null(가입 전 화면)이면 `is distinct from null` 이 항상 true 라 전체 행과 비교.
create or replace function public.is_name_available(p_name text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    case
      when p_name is null
        or char_length(trim(p_name)) < 2
        or char_length(trim(p_name)) > 20 then false
      else not exists (
        select 1 from public.profiles
        where lower(trim(name)) = lower(trim(p_name))
          and id is distinct from auth.uid()
      )
    end;
$$;

-- ACL: PUBLIC 기본 GRANT 회수 후 필요한 롤에만 재부여(가입 전 화면도 쓰므로 anon 포함).
-- 존재 여부 boolean 만 반환하고 컬럼을 노출하지 않는 읽기 RPC 라 anon 허용이 안전하다.
revoke execute on function public.is_name_available(text) from public, anon;
grant  execute on function public.is_name_available(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- ROLLBACK:
--   drop function if exists public.is_name_available(text);
--   drop index if exists public.profiles_name_lower_uidx;
--   handle_new_user 는 20260830m §5 본체로 복원(인덱스를 먼저 지우면 name 중복 해소 2단은 남아 있어도 무해).
