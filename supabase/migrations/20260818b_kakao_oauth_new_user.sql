-- 카카오 로그인 대비 handle_new_user 보강. (라이브 적용: kakao_oauth_new_user)
-- 카카오 특성: ①email 이 null 일 수 있다(동의 안 하면) → split_part(null) 로 이름이 비던 경로 방어
-- ②이름 메타가 name 이 아니라 full_name/preferred_username 로 온다 ③avatar_url 제공
-- ④소셜 가입은 약관 체크박스가 없다 — 버튼 옆 고지("가입 시 약관 동의") 후 진입이므로 동의로 기록.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
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
begin
  if v_name is null then v_name := '홀덤회원'; end if;
  if v_nick is null or exists (select 1 from public.profiles where lower(trim(nickname)) = lower(v_nick)) then
    v_nick := v_name || '_' || left(new.id::text, 4);
  end if;
  -- 닉네임도 중복이면(동명 소셜 가입) id 8자리로 한 번 더 유일화
  if exists (select 1 from public.profiles where lower(trim(nickname)) = lower(v_nick)) then
    v_nick := v_name || '_' || left(replace(new.id::text, '-', ''), 8);
  end if;

  insert into public.profiles (
    id, email, name, nickname, role, status,
    agreed_to_terms, agreed_to_privacy, agreed_to_anti_gambling, agreed_to_marketing, terms_agreed_at
  ) values (
    new.id, new.email, v_name, v_nick, v_role, v_status,
    coalesce((new.raw_user_meta_data->>'agreed_to_terms')::boolean, v_social),
    coalesce((new.raw_user_meta_data->>'agreed_to_privacy')::boolean, v_social),
    coalesce((new.raw_user_meta_data->>'agreed_to_anti_gambling')::boolean, v_social),
    coalesce((new.raw_user_meta_data->>'agreed_to_marketing')::boolean, false),
    case when coalesce((new.raw_user_meta_data->>'agreed_to_terms')::boolean, v_social) then now() else null end
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
