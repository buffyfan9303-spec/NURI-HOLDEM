-- ============================================================================
-- 20260909a — 소셜(Google·카카오) 가입자의 동의 플래그를 '받은 것만' 기록한다 (AUTH-04)
--
-- ⚠ 운영 미적용. 적용 절차·롤백·검증은 이 파일 맨 아래 주석에 분리해 두었다(nuri-migration 절차).
--
-- 무엇이 잘못됐나
--   20260818b 부터 handle_new_user 는 provider ≠ 'email' 이면 agreed_to_terms / agreed_to_privacy /
--   agreed_to_anti_gambling 을 **true 로 폴백**했다("버튼 옆 고지 후 진입 = 동의"). 20260903c 는 그 위에
--   consented_legal_version 까지 현행판으로 찍는다. 결과: 소셜 신규 유저는 만 19세 선언·이용약관·개인정보·
--   사행성 금지 서약 어느 것도 체크한 적이 없는데 '동의 완료' 로 저장돼, 이미 있는 ConsentGateModal(initial 모드 =
--   필수 4종 체크 + record_my_legal_consent 이력)이 App.tsx 의 open 조건 `agreedToTerms === false` 를 만족하지
--   못해 열리지 않는다. 20260903c 본체 주석("소셜 가입은 ConsentGateModal 이 이후에 받는다")과 코드가 반대였다.
--   법·규제(AGENTS.md 1번: 만 19세 미만 이용 불가 고지)와 Play 제출 선언문(playstore/gambling-policy.md '가입 시
--   연령 확인과 필수 동의 절차')에 실제 흐름이 못 미친다.
--
-- 고치는 것 — 한 곳
--   메타데이터에 동의 플래그가 **있을 때만** 그 값을 쓰고, 없으면 false. 이메일 가입(AuthModal 이 메타에 4종을 실어
--   보낸다)은 종전과 동일하고, 소셜 가입만 false/NULL 로 시작해 첫 로그인에 ConsentGateModal 이 자동으로 뜬다.
--   그 게이트는 record_my_legal_consent 를 타므로 legal_consents 이력과 consented_legal_version 이 그때 채워진다.
--   v_social / v_provider 는 이 폴백에만 쓰였으므로 함께 지웠다(다른 분기 없음). 나머지 본체는 20260903c §0 그대로.
--
-- 기존 행: 손대지 않는다. 이미 true 로 저장된 소셜 가입자를 되돌려 재동의를 받을지는 오너 결정(BLOCKED 항목).
-- 멱등: create or replace + revoke 재기입 → 재실행 안전.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_name   text       := nullif(trim(coalesce(
                           new.raw_user_meta_data->>'name',
                           new.raw_user_meta_data->>'full_name',
                           new.raw_user_meta_data->>'preferred_username',
                           split_part(coalesce(new.email, ''), '@', 1))), '');
  v_nick   text       := nullif(trim(coalesce(new.raw_user_meta_data->>'nickname', '')), '');
  v_role   user_role  := coalesce((new.raw_user_meta_data->>'role')::user_role, 'user');
  v_status user_status := case when coalesce((new.raw_user_meta_data->>'role')::user_role, 'user') = 'venue_owner'
                               then 'pending'::user_status else 'active'::user_status end;
  v_pubrank boolean   := (new.raw_user_meta_data->>'public_ranking_consent')::boolean;
  -- 동의는 화면에서 체크한 값(메타데이터)만 인정한다. 소셜 가입은 메타가 없으므로 false 로 시작 →
  -- 첫 로그인에 ConsentGateModal 이 필수 4종을 받고 record_my_legal_consent 가 이력과 함께 true 로 바꾼다.
  v_terms  boolean    := coalesce((new.raw_user_meta_data->>'agreed_to_terms')::boolean, false);
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
    coalesce((new.raw_user_meta_data->>'agreed_to_privacy')::boolean, false),
    coalesce((new.raw_user_meta_data->>'agreed_to_anti_gambling')::boolean, false),
    coalesce((new.raw_user_meta_data->>'agreed_to_marketing')::boolean, false),
    case when v_terms then now() else null end,
    v_pubrank,
    case when v_pubrank is not null then now() else null end,
    case when v_terms then public.current_legal_version() else null end,
    case when v_terms then now() else null end
  ) on conflict (id) do nothing;

  -- 여기서는 이력 행(legal_consents)을 만들지 않는다 — 트리거가 만든 행은 '사용자가 화면에서 눌렀다'는 증거가 아니다.
  -- 이메일 가입의 이력은 클라이언트가 가입 직후 record_my_legal_consent(source='signup')로, 소셜은 ConsentGateModal 이 남긴다.

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

-- ============================================================================
-- 적용(오너·운영자만, 라이브 DB):
--   1) 위 본문을 그대로 실행한다(트랜잭션 1개). 트리거 on_auth_user_created 는 이미 이 함수를 가리키고 있어 재생성 불필요.
--   2) 아래 '검증' 을 1회 돌린다. 어드바이저 보안 ERROR 0 유지 확인.
--   3) 메모리(nuri-holdem-launch-state)에 파일명·요지 리포.
--
-- 검증(적용 직후):
--   -- ① ACL — 셋 다 false 여야 한다
--   select has_function_privilege('anon',          'public.handle_new_user()', 'execute'),
--          has_function_privilege('authenticated', 'public.handle_new_user()', 'execute'),
--          has_function_privilege('public',        'public.handle_new_user()', 'execute');
--   -- ② 본체에 소셜 폴백이 남아 있지 않다(0 이어야 한다)
--   select position('v_social' in pg_get_functiondef('public.handle_new_user()'::regprocedure));
--   -- ③ 합성 검증(롤백) — 구글 가입자 1명을 트랜잭션 안에서 만들어 프로필 값만 보고 되돌린다
--   begin;
--     insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
--     values ('00000000-0000-4000-8000-00000000c0de', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
--             'consent-probe@example.com', '{"provider":"google","providers":["google"]}', '{"name":"probe"}', now(), now());
--     select agreed_to_terms, agreed_to_privacy, agreed_to_anti_gambling, terms_agreed_at, consented_legal_version
--       from public.profiles where id = '00000000-0000-4000-8000-00000000c0de';
--     -- 기대: false | false | false | null | null  (이메일 가입 메타 '{"agreed_to_terms":true,…}' 로 같은 insert 를 하면 true/2)
--   rollback;
--   -- ④ 실서비스 확인: 새 소셜 계정으로 첫 로그인 → '서비스 이용 동의' 시트가 뜨고 '동의하고 시작' 뒤
--   --    legal_consents 에 source='gate' 1행, profiles.consented_legal_version = current_legal_version().
--
-- 롤백:
--   supabase/migrations/20260903c_name_unique.sql §0(17~93행)의 create or replace … revoke 블록을 그대로 다시 실행한다
--   (소셜 폴백 v_social 복원). 이 파일이 만든 데이터 변경은 없으므로 데이터 롤백은 불필요.
-- ============================================================================
