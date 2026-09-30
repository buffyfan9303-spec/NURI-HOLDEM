-- ✅ 2026-10-01 라이브 적용 완료(nuri-lead · MCP execute_sql). 실측: functiondef md5 885031c5 → fc49240c · ACL postgres·service_role 만 · 자가검사 통과.
--    적용 전 롤백 리허설 REHEARSAL_OK — 음성 2(role=admin → user · role=venue_staff+임의 venue_id → user·venue_id NULL),
--    양성 2(업주 가입 → venue_owner·pending·approved=false · 일반 가입 → user·active). 리허설 뒤 md5 원래대로·시험 계정 0행.
-- 20261001b — 가입 역할 허용 목록을 venue_owner 하나로 좁히고, 쓰이지 않는 직원 가입 분기를 지운다.
--
-- 왜(2026-10-01 critical-reviewer 독립 검토 R1, review-sec-20261001a.md):
--   20261001a 뒤에도 가입 메타데이터 role=venue_staff 로 가입하면 임의의 venue_id 에 '승인 대기 직원' 으로 붙어
--   남의 매장 직원 목록에 뜨고, 업주가 승인을 누르면 활성 직원이 됐다. 클라이언트 가입 코드는 'user'·'venue_owner' 만
--   보낸다(src/api/auth.ts:221·:252 — :306 은 직원 목록 표시용 매퍼라 가입과 무관). 직원은 업주 초대 → 서버 RPC 로만 붙는다.
-- 무엇을 바꾸나: 역할 계산 한 줄(venue_owner 외 전부 user) · venue_staff 분기(update venue_id) 삭제. 나머지는 20261001a 와 같다.

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
  -- 20261001b: 가입으로 얻을 수 있는 역할은 venue_owner(승인 대기)뿐. 직원은 업주 초대(서버 RPC)로만 붙는다.
  v_role   user_role  := case when new.raw_user_meta_data->>'role' = 'venue_owner'
                               then 'venue_owner'::user_role
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
  end if;

  return new;
end;
$function$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

-- 자가검사
do $$
declare d text := pg_get_functiondef('public.handle_new_user()'::regprocedure);
begin
  if d ~ $re$coalesce\(\(new\.raw_user_meta_data->>'role'\)::user_role$re$ then
    raise exception '20261001b: 옛 역할 계산식이 남아 있다';
  end if;
  if position($s$'venue_staff'$s$ in d) > 0 then
    raise exception '20261001b: 직원 가입 분기가 남아 있다';
  end if;
  if position($s$= 'venue_owner'$s$ in d) = 0 then
    raise exception '20261001b: 허용 목록이 없다';
  end if;
  if has_function_privilege('anon', 'public.handle_new_user()', 'execute')
     or has_function_privilege('authenticated', 'public.handle_new_user()', 'execute') then
    raise exception '20261001b: 트리거 함수가 클라이언트에 열려 있다';
  end if;
end $$;
