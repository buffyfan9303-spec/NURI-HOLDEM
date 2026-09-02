-- 20260903b — 아이디(이메일) 가입 전 중복 체크 RPC (오너 지시 2026-09-03: "아이디·닉네임 모두 중복 불가, 중복체크 필수").
--
-- 왜 필요한가: Supabase Auth 는 이메일 확인 옵션이 켜져 있으면 이미 가입된 이메일로 signUp 해도
--   열거 방지를 위해 **오류 없이 성공처럼** 응답한다(docs: "obfuscated user response, no verification email sent").
--   그래서 유저는 "가입했는데 메일이 안 온다" 로 끝난다 — 가입 폼에서 미리 물어봐야 원인을 알 수 있다.
--
-- 노출 범위: boolean 하나. 존재 여부 외 어떤 컬럼도 읽어 돌려주지 않는다(보안 코딩 표준 6조).
--   열거 위험은 signUp 자체가 이미 갖는 것과 동일한 수준이며, 클라이언트는 형식 통과 후 600ms 디바운스로만 호출한다.
--   PostgREST 앞단의 Supabase API 레이트리밋이 추가 방어(함수 안 호출자별 제한은 anon 이라 식별자가 없어 불가).
--
-- 기준 테이블: auth.users — signUp 이 실제로 충돌을 보는 곳(profiles 는 트리거 산출물이라 어긋날 수 있다).
--   SECURITY DEFINER(소유자 postgres)라 auth 스키마를 읽을 수 있고, 호출자에게는 결과 boolean 만 간다.

create or replace function public.is_email_available(p_email text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select case
    -- 형식 위반은 false(사용 불가) — 클라이언트가 같은 정규식으로 먼저 거르므로 정상 경로에선 도달하지 않는다
    when p_email is null
      or char_length(trim(p_email)) > 254
      or trim(p_email) !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then false
    else not exists (
      select 1 from auth.users u
      where lower(u.email) = lower(trim(p_email))
    )
  end;
$$;

-- ACL 표준(보안 코딩 표준 3조): PUBLIC 기본 GRANT 회수가 먼저. 읽기 RPC 이고 **가입 전(비로그인) 화면에서 부르므로 anon 필수**.
revoke execute on function public.is_email_available(text) from public, anon;
grant  execute on function public.is_email_available(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
-- ROLLBACK: drop function if exists public.is_email_available(text);
