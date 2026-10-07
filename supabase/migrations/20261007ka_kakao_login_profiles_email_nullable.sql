-- ⏳ 미적용 — 초안(home-team, 2026-10-07). 라이브 롤백 리허설만 했다(supabase/tests/20261007ka_rehearsal.sql — PASS 11/11,
--    마이그레이션 없이 돌리면 FAIL 0/2 · 23502). 적용 판단·실행은 리드.
--    적용하면 이 줄을 "✅ 적용 완료 + 실측값" 으로 바꾼다.
select set_config('lock_timeout', '3s', true);
select set_config('statement_timeout', '60s', true);
-- 20261007ka — 카카오 로그인(OIDC) 회원은 이메일이 없다 → profiles.email 의 NOT NULL 을 푼다.
--
-- 왜: 카카오 로그인은 openid profile_nickname profile_image 만 요청한다(account_email 은 비즈 앱 전용인데 전환이 거절됐다 —
--   src/lib/kakaoLogin.ts 머리말). 그래서 auth.users.email 이 NULL 인 회원이 생긴다. 가입 트리거 handle_new_user 는
--   provider 를 가리지 않고 `new.email` 을 profiles.email 에 그대로 넣는데, 라이브 profiles.email 은 NOT NULL(2026-10-07 읽기 전용 실측)이라
--   23502 로 트리거가 실패하고 GoTrue 는 'Database error saving new user' 로 **모든 카카오 가입을 막는다.**
--   트리거는 바꾸지 않는다 — 이메일·구글·카카오가 같은 함수·같은 닉네임 규칙·같은 동의 기본값(false)을 그대로 탄다.
--
-- UNIQUE(profiles_email_key)는 **그대로 둔다.** PostgreSQL 의 UNIQUE 는 기본이 NULLS DISTINCT 라 NULL 끼리를 같은 값으로 보지 않는다
--   (https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS) — 이메일 없는 회원 여럿이 공존하고,
--   이메일 있는 회원 사이의 중복은 지금처럼 막힌다. 아래 출발점 게이트가 그 인덱스가 NULLS NOT DISTINCT 가 아님을 확인한다.
--
-- email 을 non-null 로 가정하던 곳(2026-10-07 전수 — 라이브 함수 정의는 읽기 전용 질의, 나머지는 저장소 grep):
--   DB  handle_new_user            new.email 을 그대로 넣음 → 이 마이그레이션이 고치는 지점
--       withdraw_my_account · admin_withdraw_user   email 을 'withdrawn_…@deleted.invalid' 로 덮음 — NULL 이어도 같은 경로
--       weekly_email_digest_rows   `p.email is not null and btrim(p.email) <> ''` 로 이미 거른다
--       invite_staff_by_email · add_venue_staff     email/닉네임 일치 검색 — NULL 은 일치하지 않을 뿐(닉네임으로 초대 가능)
--       get_my_venue_staff · get_my_venue_invites   운영자에게만 email 을 싣는다 — NULL 이면 빈 칸
--       guard_profile_privileged_cols             `is distinct from` 비교 — NULL 안전
--       RLS 정책 중 email·provider·jwt 를 보는 것: 0건
--   엣지 notify-sanction            email 없으면 404(제재 자체는 이미 반영, 메일 통지만 못 감)
--       support-reply-email        email 없으면 no_email 404(앱 안 답변은 그대로)
--       weekly-email-digest        위 RPC 가 걸러서 받는다
--   앱  rowToUser(email ?? '')      src/api/auth.ts — 빈 값이면 화면이 그 줄을 안 그린다
--       ProfileModal 비밀번호 변경   이메일 인증번호가 필요해 이메일 없는 계정은 안내 문장으로 대체
--       verifyMyPassword           email 없으면 false — 탈퇴 재확인은 소셜 경로('영구 삭제' 입력)를 탄다(app_metadata.provider='kakao')
--
-- 되돌리기: alter table public.profiles alter column email set not null;  (그 전에 email IS NULL 행이 0 이어야 한다)

do $gate$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles' and column_name = 'email') then
    raise exception '20261007ka: profiles.email 이 없다 — 라이브 스키마를 다시 확인하라';
  end if;
  if not exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
                  where c.relname = 'profiles_email_key' and i.indisunique and not i.indnullsnotdistinct) then
    raise exception '20261007ka: profiles_email_key 가 NULLS DISTINCT UNIQUE 가 아니다 — NULL 여러 개가 막힌다';
  end if;
end $gate$;

alter table public.profiles alter column email drop not null;

-- 자가검사 — 적용 결과를 그 자리에서 잰다
do $check$
begin
  if (select is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'profiles' and column_name = 'email') is distinct from 'YES' then
    raise exception '20261007ka 자가검사: profiles.email 이 아직 NOT NULL 이다';
  end if;
  if not exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
                  where c.relname = 'profiles_email_key' and i.indisunique and not i.indnullsnotdistinct) then
    raise exception '20261007ka 자가검사: profiles_email_key UNIQUE 가 사라졌다';
  end if;
end $check$;
