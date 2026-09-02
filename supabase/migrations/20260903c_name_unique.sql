-- ============================================================================
-- 20260903c — 닉네임(profiles.name) 중복 불가 + 가용성 검사 RPC
--
-- 배경: 앱에서 '닉네임'으로 보이는 값은 profiles.name(프로필 설정 '닉네임 입력', 30일 쿨다운,
--   랭킹·글 작성자명)이다. profiles.nickname 은 '받는 아이디'(이용권 전송용)로 이미
--   uniq_profiles_nickname_ci + is_nickname_available 이 있다. 오너 지시(2026-09-03):
--   "닉네임, 아이디 모두 중복 불가, 중복체크 필수" → name 에도 같은 장치를 단다.
-- 실측: 적용 시점 profiles 7행, lower(trim(name)) 중복 0 → 인덱스 생성 안전.
-- 멱등 → 재실행 안전.
-- ============================================================================

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
