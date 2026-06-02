-- ============================================================================
-- Task 5: 업주 가입은 '승인대기(pending)'로 시작 + 승인 전 포스터 등록 차단
--  1) handle_new_user: venue_owner 는 status='pending'(그 외 'active')으로 생성
--  2) 기존 미승인 업주 백필(active→pending) → 관리자 승인 큐에 노출
--  3) schedules INSERT RLS: 승인된 업주(또는 관리자)만 포스터 등록 가능
--  모두 멱등 → 재실행 안전.
-- ============================================================================

-- 1) 트리거 재정의(상위집합 유지 + status 분기 추가)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name   text        := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  v_nick   text        := nullif(trim(coalesce(new.raw_user_meta_data->>'nickname', '')), '');
  v_role   user_role   := coalesce((new.raw_user_meta_data->>'role')::user_role, 'user');
  v_status user_status := case when coalesce((new.raw_user_meta_data->>'role')::user_role, 'user') = 'venue_owner'
                               then 'pending'::user_status
                               else 'active'::user_status end;
  v_venue  uuid;
begin
  -- 닉네임 미입력/중복 시 안전 폴백
  if v_nick is null or exists (
    select 1 from public.profiles where lower(trim(nickname)) = lower(v_nick)
  ) then
    v_nick := v_name || '_' || left(new.id::text, 4);
  end if;

  insert into public.profiles (
    id, email, name, nickname, role, status,
    agreed_to_terms, agreed_to_privacy, agreed_to_anti_gambling, agreed_to_marketing, terms_agreed_at
  )
  values (
    new.id, new.email, v_name, v_nick, v_role, v_status,
    coalesce((new.raw_user_meta_data->>'agreed_to_terms')::boolean, false),
    coalesce((new.raw_user_meta_data->>'agreed_to_privacy')::boolean, false),
    coalesce((new.raw_user_meta_data->>'agreed_to_anti_gambling')::boolean, false),
    coalesce((new.raw_user_meta_data->>'agreed_to_marketing')::boolean, false),
    case when (new.raw_user_meta_data->>'agreed_to_terms')::boolean then now() else null end
  )
  on conflict (id) do nothing;

  -- 업주: 매장 자동 생성(승인 대기) + profiles 연결(approved=false)
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

-- 2) 기존 미승인 업주 백필(승인 큐 노출)
update public.profiles
set status = 'pending'
where role = 'venue_owner' and approved = false and status = 'active';

-- 3) 스케줄 등록은 '승인된 업주' 또는 '관리자'만 (승인 전 포스터 등록 차단)
drop policy if exists "schedules_insert" on public.schedules;
create policy "schedules_insert" on public.schedules
  for insert to public
  with check (
    owner_id = auth.uid()
    and my_role() = any (array['venue_owner'::user_role, 'admin'::user_role])
    and (
      my_role() = 'admin'::user_role
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved = true)
    )
  );
