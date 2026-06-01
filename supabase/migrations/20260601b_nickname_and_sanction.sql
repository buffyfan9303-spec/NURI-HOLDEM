-- ============================================================================
-- Stage 3 마이그레이션
--  1) profiles.nickname 컬럼 + 대소문자·공백 무시 UNIQUE 인덱스(중복 방지)
--  2) 닉네임 가용성 검사 RPC (security definer → RLS 우회, 존재여부 boolean만 반환)
--  3) handle_new_user 트리거: user_metadata.nickname 반영(없으면 name/email로 폴백)
--  4) profiles.sanction_reason 컬럼(관리자 제재 사유 기록)
--  모두 멱등 → 재실행 안전.
-- ============================================================================

-- ── 0) user_status enum 에 'withdrawn'(강제 탈퇴) 추가 ──────────────────────
-- 정지(suspended) / 영구정지(banned) / 강제탈퇴(withdrawn) 3단계 제재 구분.
-- (이 파일의 이후 SQL은 'withdrawn' 값을 사용하지 않으므로 한 번에 실행해도 안전)
alter type user_status add value if not exists 'withdrawn';

-- ── 1) nickname 컬럼 + 유니크 인덱스 ───────────────────────────────────────
alter table public.profiles
  add column if not exists nickname text;

alter table public.profiles
  add column if not exists sanction_reason text;

-- 기존 회원: nickname 이 비어있으면 name 으로 1회 채움(유니크 충돌 시 id 일부 접미)
update public.profiles
set nickname = name
where nickname is null
  and not exists (
    select 1 from public.profiles p2
    where p2.id <> public.profiles.id
      and lower(trim(p2.nickname)) = lower(trim(public.profiles.name))
  );
-- 남은 충돌(중복 name) 회원은 닉네임에 id 앞 4자리 접미로 유일화
update public.profiles
set nickname = name || '_' || left(id::text, 4)
where nickname is null;

-- 대소문자·앞뒤공백 무시 유니크(부분 인덱스: null 제외)
create unique index if not exists uniq_profiles_nickname_ci
  on public.profiles (lower(trim(nickname)))
  where nickname is not null;

-- ── 2) 닉네임 가용성 검사 RPC ──────────────────────────────────────────────
-- true = 사용 가능, false = 이미 사용 중. 형식 위반(2자 미만 등)도 false 처리.
create or replace function public.is_nickname_available(p_nickname text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    case
      when p_nickname is null or char_length(trim(p_nickname)) < 2 then false
      else not exists (
        select 1 from public.profiles
        where lower(trim(nickname)) = lower(trim(p_nickname))
      )
    end;
$$;

grant execute on function public.is_nickname_available(text) to anon, authenticated;

-- ── 3) handle_new_user 트리거: nickname + 동의이력 + 업주 매장 자동생성 ──────
-- 운영 DB의 기존 트리거(동의 기록 + 업주 venue 자동생성)를 보존하는 "상위집합"으로
-- 재정의한다. nickname 추가 기록 + 미입력/중복 시 name 기반 폴백.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text      := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  v_nick  text      := nullif(trim(coalesce(new.raw_user_meta_data->>'nickname', '')), '');
  v_role  user_role := coalesce((new.raw_user_meta_data->>'role')::user_role, 'user');
  v_venue uuid;
begin
  -- 닉네임 미입력/중복 시 안전 폴백(유니크 인덱스 위반 방지)
  if v_nick is null or exists (
    select 1 from public.profiles where lower(trim(nickname)) = lower(v_nick)
  ) then
    v_nick := v_name || '_' || left(new.id::text, 4);
  end if;

  insert into public.profiles (
    id, email, name, nickname, role,
    agreed_to_terms, agreed_to_privacy, agreed_to_anti_gambling, agreed_to_marketing, terms_agreed_at
  )
  values (
    new.id, new.email, v_name, v_nick, v_role,
    coalesce((new.raw_user_meta_data->>'agreed_to_terms')::boolean, false),
    coalesce((new.raw_user_meta_data->>'agreed_to_privacy')::boolean, false),
    coalesce((new.raw_user_meta_data->>'agreed_to_anti_gambling')::boolean, false),
    coalesce((new.raw_user_meta_data->>'agreed_to_marketing')::boolean, false),
    case when (new.raw_user_meta_data->>'agreed_to_terms')::boolean then now() else null end
  )
  on conflict (id) do nothing;

  -- 업주 가입: 매장(venues) 자동 생성(승인 대기) + profiles.venue_id 연결
  if v_role = 'venue_owner' then
    insert into public.venues (name, region, address, contact_phone, owner_id, approved)
    values (
      coalesce(new.raw_user_meta_data->>'venue_name', v_name || ' 매장'),
      coalesce(new.raw_user_meta_data->>'region', ''),
      coalesce(new.raw_user_meta_data->>'address', ''),
      new.raw_user_meta_data->>'phone',
      new.id,
      false
    )
    returning id into v_venue;

    update public.profiles set venue_id = v_venue, approved = false where id = new.id;
  end if;

  return new;
end;
$$;
