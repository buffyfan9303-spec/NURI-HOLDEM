-- 20260830g — 마크 소유 판정을 '남은 기간'에서 '영구 소장'으로.
-- 기존 렌탈 보유분(mark_rentals)은 **그대로 인정한다** — 이미 산 것을 뺏지 않는다.
-- 즉 판정은 (도달 점수) or (영구 소장) or (아직 기간이 남은 예전 렌탈) 세 갈래다.

create or replace function public.set_equipped_mark(p_key text)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid  uuid := (select auth.uid());
  v_mark public.shop_marks;
  v_pts  int;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;

  if p_key is null or btrim(p_key) = '' then
    update public.profiles set equipped_mark = null where id = v_uid;
    return null;
  end if;

  select * into v_mark from public.shop_marks where key = p_key and active;
  if not found then raise exception '없는 마크입니다'; end if;

  if v_mark.kind = 'earn' then
    select coalesce(activity_points, 0) into v_pts from public.profiles where id = v_uid;
    if v_pts < v_mark.need then
      raise exception '아직 해금되지 않은 마크입니다 (필요 %점 · 현재 %점)', v_mark.need, v_pts;
    end if;
  else
    -- 영구 소장이 우선. 없으면 예전 렌탈이 아직 살아 있는지 본다(구매 이력 존중).
    if not exists (select 1 from public.mark_unlocks where user_id = v_uid and mark_key = p_key)
       and not exists (
         select 1 from public.mark_rentals
          where user_id = v_uid and mark_key = p_key and expires_at > now()
       ) then
      raise exception '아직 소장하지 않은 마크예요';
    end if;
  end if;

  update public.profiles set equipped_mark = p_key where id = v_uid;
  return p_key;
end $function$;

-- 표시 경로도 같은 규칙으로. 소장했으면 만료 개념 없이 계속 보인다.
create or replace function public.get_equipped_marks(p_ids uuid[])
returns table(id uuid, equipped_mark text)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select p.id, p.equipped_mark
  from public.profiles p
  left join public.shop_marks m on m.key = p.equipped_mark
  where p.id = any(p_ids)
    and p.equipped_mark is not null
    and (
      m.key is null
      or (m.kind = 'earn' and coalesce(p.activity_points, 0) >= m.need)
      or (m.kind = 'rent' and (
            exists (select 1 from public.mark_unlocks u
                     where u.user_id = p.id and u.mark_key = p.equipped_mark)
         or exists (select 1 from public.mark_rentals r
                     where r.user_id = p.id and r.mark_key = p.equipped_mark and r.expires_at > now())
      ))
    );
$function$;

-- 내가 가진 마크(소장 + 아직 살아 있는 렌탈) — 상점 화면이 '보유' 표시에 쓴다.
create or replace function public.my_owned_marks()
returns table(mark_key text, source text, until timestamptz)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select u.mark_key, 'own'::text, null::timestamptz
    from public.mark_unlocks u where u.user_id = (select auth.uid())
  union all
  select r.mark_key, 'rent'::text, r.expires_at
    from public.mark_rentals r
   where r.user_id = (select auth.uid()) and r.expires_at > now()
     and not exists (select 1 from public.mark_unlocks u2
                      where u2.user_id = r.user_id and u2.mark_key = r.mark_key);
$function$;

-- 환불: 슬롯 외침은 '방송 전이면 전액, 시작했으면 불가'. 일할 계산이 없으므로 나눗셈도 없다
-- (duration_hours 가 0 이 되면서 예전 식은 0으로 나누게 된다 — 그 경로를 아예 없앤다).
create or replace function public.refund_quote(p_purchase_id bigint)
returns table(points integer, block text)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_pp public.point_purchases;
  v_sh public.community_shouts;
  v_rt public.mark_rentals;
  v_remaining_h numeric;
  v_this_h      numeric;
  v_pts         int;
begin
  select * into v_pp from public.point_purchases where id = p_purchase_id;
  if not found then
    return query select 0, '환불할 구매 내역이 없습니다'::text; return;
  end if;
  if v_pp.refunded_at is not null then
    return query select 0, format('이미 환불된 구매입니다 (%s점 반환)', v_pp.refund_points)::text; return;
  end if;
  if now() - v_pp.created_at > interval '24 hours' then
    return query select 0, '구매 후 24시간이 지나 환불할 수 없습니다 — 보상 지급은 활동점수 지급을 쓰세요'::text; return;
  end if;
  if (select count(*) from public.point_purchases q
       where q.user_id = v_pp.user_id
         and q.refunded_at > now() - interval '30 days') >= 3 then
    return query select 0, '최근 30일 환불이 이미 3건입니다 — 반복 환불은 활동점수 지급으로 처리하세요'::text; return;
  end if;

  if v_pp.kind = 'shout' then
    select * into v_sh from public.community_shouts where id = v_pp.shout_id;
    if not found then
      return query select 0, '외침 기록을 찾을 수 없습니다'::text; return;
    end if;
    if v_sh.hidden then
      return query select 0, '이미 내려간 외침은 환불할 수 없습니다'::text; return;
    end if;
    -- 슬롯 방식: 방송이 시작됐으면 상품을 이미 받은 것이다.
    if coalesce(v_sh.plays_at, v_sh.created_at) <= now() then
      return query select 0, '이미 방송이 시작돼 환불할 수 없습니다'::text; return;
    end if;
    return query select v_pp.cost, null::text; return;
  end if;

  if v_pp.kind = 'mark_own' then
    -- 영구 소장은 일할이 없다. 24시간 안이고 아직 달고 있지 않으면 전액.
    if exists (select 1 from public.profiles
                where id = v_pp.user_id and equipped_mark = v_pp.mark_key) then
      return query select 0, '달고 있는 마크는 환불할 수 없습니다 — 먼저 해제해 주세요'::text; return;
    end if;
    if not exists (select 1 from public.mark_unlocks
                    where user_id = v_pp.user_id and mark_key = v_pp.mark_key) then
      return query select 0, '이미 회수된 마크입니다'::text; return;
    end if;
    return query select v_pp.cost, null::text; return;
  end if;

  -- 예전 기간 마크(mark_rent) — 판매는 중지됐지만 24시간 내 구매분은 남아 있을 수 있다.
  if coalesce(v_pp.duration_hours, 0) <= 0 then
    return query select 0, '환불 계산에 필요한 기간 정보가 없습니다'::text; return;
  end if;
  if exists (select 1 from public.point_purchases q
              where q.user_id = v_pp.user_id and q.kind = 'mark_rent'
                and q.id > v_pp.id and q.mark_key is distinct from v_pp.mark_key) then
    return query select 0, '이후 다른 기간 마크를 구매해 이 구매의 기간은 이미 소멸했습니다 — 보상은 활동점수 지급을 쓰세요'::text; return;
  end if;
  select * into v_rt from public.mark_rentals where user_id = v_pp.user_id;
  if not found or v_rt.mark_key is distinct from v_pp.mark_key then
    return query select 0, '다른 기간 마크로 교체되어 이 구매는 환불할 수 없습니다'::text; return;
  end if;
  v_remaining_h := greatest(0, extract(epoch from (v_rt.expires_at - now())) / 3600.0);
  v_this_h := least(v_remaining_h, v_pp.duration_hours::numeric);
  v_pts := floor(v_pp.cost * v_this_h / v_pp.duration_hours)::int;
  if v_pts <= 0 then
    return query select 0, '이미 기간이 끝나 환불할 점수가 없습니다'::text; return;
  end if;
  return query select v_pts, null::text;
end $function$;

revoke all on function public.my_owned_marks() from public, anon;
grant execute on function public.my_owned_marks() to authenticated, service_role;
revoke all on function public.set_equipped_mark(text) from public, anon;
grant execute on function public.set_equipped_mark(text) to authenticated, service_role;
revoke all on function public.get_equipped_marks(uuid[]) from public, anon;
grant execute on function public.get_equipped_marks(uuid[]) to authenticated, service_role;
revoke all on function public.refund_quote(bigint) from public, anon;
grant execute on function public.refund_quote(bigint) to authenticated, service_role;
