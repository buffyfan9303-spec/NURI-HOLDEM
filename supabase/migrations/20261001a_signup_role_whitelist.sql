-- ✅ 2026-10-01 라이브 적용 완료(nuri-lead · MCP execute_sql). 실측: functiondef md5 bd5c65ba → 885031c5 · ACL postgres·service_role 만 ·
--    자가검사 통과 · 보안 어드바이저 ERROR 0.
--    적용 전 라이브 롤백 리허설(begin … raise, PG 17.6) REHEARSAL_OK — 음성 2(role=admin → user · 알 수 없는 값 → user),
--    양성 2(업주 가입 → venue_owner·pending·approved=false · 일반 가입 → user·active). 리허설 뒤 md5 원래대로·시험 계정 0행 확인.
-- 20261001a — 가입 트리거가 클라이언트가 보낸 역할(role)을 그대로 믿던 구멍을 막는다.
--
-- 왜(2026-10-01 critical-reviewer 관리자 전수 점검 A-01, 리드 라이브 조회로 확인):
--   handle_new_user 가 `coalesce((new.raw_user_meta_data->>'role')::user_role, 'user')` 로 역할을 정했다.
--   raw_user_meta_data 는 가입하는 사람이 signUp(options.data) 로 직접 보낼 수 있는 값이고,
--   user_role 에는 'admin' 이 있다. profiles 의 권한 가드(guard_profile_privileged_cols)는 UPDATE 에만 걸려 있어
--   가입(INSERT) 경로에서는 아무것도 막지 않았다 → 가입만으로 관리자가 될 수 있었다.
--   라이브 실측: 가입 메타데이터에 role=admin 이 들어간 계정 0건(악용 흔적 없음) · profiles INSERT 정책 없음(트리거가 유일한 경로).
--
-- 무엇을 바꾸나: 역할을 정하는 두 줄만. 가입으로 얻을 수 있는 역할은 user · venue_owner(승인 대기) · venue_staff(승인 대기) 뿐.
--   그 밖의 값(admin, 오타, 알 수 없는 값)은 전부 'user'. 전에는 알 수 없는 값이면 캐스트 오류로 가입 자체가 실패했다.
--   나머지 본문은 2026-10-01 라이브 정의(functiondef md5 bd5c65ba)와 같다.
-- 권한: 트리거 함수 — ACL 은 CREATE OR REPLACE 에서 보존되지만(라이브: postgres·service_role 만) 새로 만들어지는 경우를 위해 다시 적는다.

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_base   text;
  v_cand   text;
  v_nick   text;
  -- 20261001a: 가입으로 얻을 수 있는 역할만 허용(admin 등은 'user').
  v_role   user_role  := case when new.raw_user_meta_data->>'role' in ('venue_owner', 'venue_staff')
                               then (new.raw_user_meta_data->>'role')::user_role
                               else 'user'::user_role end;
  v_status user_status := case when v_role = 'venue_owner'
                               then 'pending'::user_status else 'active'::user_status end;
  v_pubrank boolean   := (new.raw_user_meta_data->>'public_ranking_consent')::boolean;
  v_terms  boolean    := coalesce((new.raw_user_meta_data->>'agreed_to_terms')::boolean, false);
begin
  foreach v_cand in array array[
      new.raw_user_meta_data->>'nickname',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'preferred_username',
      split_part(coalesce(new.email, ''), '@', 1)] loop
    v_cand := left(btrim(regexp_replace(coalesce(v_cand, ''), '\s+', ' ', 'g')), 20);
    if char_length(v_cand) >= 2
       and not public.shout_blocked(v_cand)
       and v_cand !~* '운영자|관리자|누리\s*홀덤|^admin' then
      v_base := v_cand; exit;
    end if;
  end loop;
  v_base := coalesce(v_base, '홀덤회원');
  v_nick := coalesce(public._free_nickname(v_base, new.id), left(v_base, 11) || '_' || left(replace(new.id::text, '-', ''), 8));

  insert into public.profiles (
    id, email, name, nickname, role, status,
    agreed_to_terms, agreed_to_privacy, agreed_to_anti_gambling, agreed_to_marketing, terms_agreed_at,
    public_ranking_consent, public_ranking_consent_at,
    consented_legal_version, consented_legal_version_at
  ) values (
    new.id, new.email, v_nick, v_nick, v_role, v_status,
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

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

-- 자가검사: 옛 형태가 남아 있거나 클라이언트에 열려 있으면 멈춘다.
do $$
declare d text := pg_get_functiondef('public.handle_new_user()'::regprocedure);
begin
  if d ~ $re$coalesce\(\(new\.raw_user_meta_data->>'role'\)::user_role$re$ then
    raise exception '20261001a: 옛 역할 계산식이 남아 있다';
  end if;
  if position($s$in ('venue_owner', 'venue_staff')$s$ in d) = 0 then
    raise exception '20261001a: 허용 목록이 없다';
  end if;
  if has_function_privilege('anon', 'public.handle_new_user()', 'execute')
     or has_function_privilege('authenticated', 'public.handle_new_user()', 'execute') then
    raise exception '20261001a: 트리거 함수가 클라이언트에 열려 있다';
  end if;
end $$;
