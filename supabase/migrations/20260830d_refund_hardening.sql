-- 20260830d — 환불 경화. 적대적 검증에서 나온 결함 3건을 닫고 저장소/라이브 드리프트를 정리한다.
--
-- ⚠ 드리프트 정리: 20260830c 는 저장소 파일이 1개인데 라이브에는 3건으로 적용돼 있었다
--   (20260830c_refund / _rental_clawback_fix / _shout_lookup). 핫픽스를 직접 적용하고 파일을 안 남긴 탓이다.
--   이 파일이 그 셋을 흡수한다:
--     · _rental_clawback_fix 는 admin_refund_purchase 만 고쳤다 → 아래에서 통째로 재선언하므로 흡수됨
--     · _shout_lookup 은 admin_shout_refunds 를 **새로 만들었다** → 파일에 없었으므로 아래에 복원
--   여기서부터 이 세 함수의 정본은 이 파일이다.
--
-- ① [치명] 죽은 구매를 환불하면 살아 있는 구매가 파괴된다.
--    mark_rentals 는 유저당 1행 upsert 라 **다른 마크를 사는 순간 이전 기간이 소멸**한다.
--    그런데 환불은 mark_key 가 같은지만 보고, 정작 이 목적으로 원장에 넣어 둔
--    period_from/period_to 를 한 번도 쓰지 않았다.
--    재현(실측): X 30일권(1,100) → Y 1일권 → X 1일권 순으로 산 뒤 **첫 구매를 환불**하면
--      · 판정: v_rt.mark_key(X) = v_pp.mark_key(X) → 통과
--      · 반환 점수: floor(1100 × 24/720) = 36점
--      · 회수: expires_at -= 24h → **방금 산 X 1일권이 통째로 증발**
--    → 이후에 다른 마크 구매가 하나라도 있으면 그 시점에 이 구매의 기간은 이미 죽은 것이다.
--    적용 후 실측: 죽은 30일권 환불 = 차단 / 살아있는 1일권 = 50점 정상(과잉 차단 아님) /
--                  견적 호출로 렌탈 만료일 무손상 / 검증 데이터 잔존 0.
--
-- ② [중] 외침 환불창(24h)이 최고가 SKU 인 전광판의 노출시간(24h)과 같아,
--    23시간 55분 노출한 뒤에도 **전액(2,000점)** 이 나갔다. 외침은 일할 계산이 없어
--    (전액 아니면 없음) 창을 노출시간에 비례해 죄는 게 유일한 해법이다.
--    노출의 1/4 까지만 — basic 1.5h / gold 3h / board 6h.
--
-- ③ [하] 운영자 내부 메모(refund_reason)와 처리자 UUID(refunded_by)가 당사자에게 노출됐다.
--    화면엔 안 띄우지만 PostgREST 로 테이블을 직접 읽으면 보였다. 컬럼 단위로 회수한다.
--    (앱은 RPC 만 쓰므로 화면 영향 0 — src/api/community.ts 는 rpc 호출뿐임을 확인)

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
  v_window_h    numeric;
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
    if v_sh.expires_at <= now() then
      return query select 0, '노출이 끝난 외침은 환불할 수 없습니다'::text; return;
    end if;
    -- ② 외침은 일할 계산이 없다(전액 아니면 없음) → 창을 노출시간에 비례해 죈다.
    v_window_h := greatest(0.25, coalesce(v_pp.duration_hours, 6)::numeric / 4.0);
    if now() - v_pp.created_at > (v_window_h || ' hours')::interval then
      return query select 0, format(
        '노출 시간의 4분의 1(%s시간)이 지나 전액 환불할 수 없습니다 — 보상은 활동점수 지급을 쓰세요',
        round(v_window_h, 1))::text; return;
    end if;
    return query select v_pp.cost, null::text; return;
  end if;

  -- ① 이 구매 이후에 다른 마크 구매가 있었다면, 그 시점에 이 구매의 기간은 이미 소멸했다.
  --    (mark_rentals 가 유저당 1행 upsert 이므로 마크가 바뀌는 순간 이전 기간은 사라진다)
  --    이걸 안 보면 죽은 구매를 환불하면서 **살아 있는 현재 구매를 회수**한다.
  if exists (select 1 from public.point_purchases q
              where q.user_id = v_pp.user_id
                and q.kind = 'mark_rent'
                and q.id > v_pp.id
                and q.mark_key is distinct from v_pp.mark_key) then
    return query select 0, '이후 다른 기간 마크를 구매해 이 구매의 기간은 이미 소멸했습니다 — 보상은 활동점수 지급을 쓰세요'::text; return;
  end if;

  select * into v_rt from public.mark_rentals where user_id = v_pp.user_id;
  if not found or v_rt.mark_key is distinct from v_pp.mark_key then
    return query select 0, '다른 기간 마크로 교체되어 이 구매는 환불할 수 없습니다'::text; return;
  end if;

  v_remaining_h := greatest(0, extract(epoch from (v_rt.expires_at - now())) / 3600.0);
  -- ★ least() 가 핵심. 빠뜨리면 이어 붙은 이전 구매분까지 환불된다(실질 발권).
  v_this_h := least(v_remaining_h, v_pp.duration_hours::numeric);
  v_pts := floor(v_pp.cost * v_this_h / v_pp.duration_hours)::int;
  if v_pts <= 0 then
    return query select 0, '이미 기간이 끝나 환불할 점수가 없습니다'::text; return;
  end if;
  return query select v_pts, null::text;
end $function$;

create or replace function public.admin_refund_purchase(p_purchase_id bigint, p_reason text)
returns table(refunded integer, available integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_admin  uuid := (select auth.uid());
  v_reason text;
  v_user   uuid;
  v_pp     public.point_purchases;
  v_rt     public.mark_rentals;
  v_refund int;
  v_block  text;
  v_remaining_h numeric;
  v_this_h      numeric;
  v_ap int; v_sp int;
begin
  if v_admin is null then raise exception '로그인이 필요합니다'; end if;
  if public.my_role() <> 'admin' then raise exception '권한이 없습니다'; end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 4 then raise exception '환불 사유를 4자 이상 남겨 주세요'; end if;

  select user_id into v_user from public.point_purchases where id = p_purchase_id;
  if v_user is null then raise exception '환불할 구매 내역이 없습니다'; end if;

  perform 1 from public.profiles where id = v_user for update;
  if not found then raise exception '프로필을 찾을 수 없습니다'; end if;

  select * into v_pp from public.point_purchases where id = p_purchase_id for update;

  -- 판정은 refund_quote 가 단일 출처다(①②의 차단도 여기서 걸린다).
  select q.points, q.block into v_refund, v_block from public.refund_quote(p_purchase_id) q;
  if v_block is not null then raise exception '%', v_block; end if;

  if v_pp.kind = 'shout' then
    -- expires_at 은 건드리지 않는다 — 진열 쿼리와 RLS 가 hidden 을 보므로 이것만으로 사라지고,
    -- 원래 노출 기간이 기록으로 남는다.
    update public.community_shouts
       set hidden = true, hidden_by = v_admin, hidden_at = now()
     where id = v_pp.shout_id and hidden = false;
  else
    select * into v_rt from public.mark_rentals where user_id = v_user for update;
    v_remaining_h := greatest(0, extract(epoch from (v_rt.expires_at - now())) / 3600.0);
    v_this_h := least(v_remaining_h, v_pp.duration_hours::numeric);
    -- ⚠ least(..., now()) 금지 — 이어 붙은 이전 구매분까지 회수해 버린다(설계 초안의 함정).
    update public.mark_rentals
       set expires_at = v_rt.expires_at - (v_this_h || ' hours')::interval,
           updated_at = now()
     where user_id = v_user;
    -- 표시 경로는 만료 즉시 자동으로 낫지만 profiles.equipped_mark 에는 죽은 키가 남는다
    -- → 유저가 그 마크를 다시 누르면 set_equipped_mark 가 거절해 원인 모를 UX 사고가 된다.
    if not exists (select 1 from public.mark_rentals
                    where user_id = v_user and expires_at > now()) then
      update public.profiles set equipped_mark = null
       where id = v_user and equipped_mark = v_pp.mark_key;
    end if;
  end if;

  -- 점수 복원은 spent_points 감소로만. activity_points 는 건드리지 않는다.
  update public.profiles
     set spent_points = greatest(0, coalesce(spent_points, 0) - v_refund)
   where id = v_user;

  update public.point_purchases
     set refunded_at = now(), refunded_by = v_admin,
         refund_points = v_refund, refund_reason = v_reason
   where id = p_purchase_id;

  select coalesce(p.activity_points, 0), coalesce(p.spent_points, 0)
    into v_ap, v_sp from public.profiles p where p.id = v_user;

  return query select v_refund, greatest(0, v_ap - v_sp);
end $function$;

-- 드리프트 복원 — 20260830c_shout_lookup 이 라이브에만 만들어 둔 함수(저장소에 없었다).
create or replace function public.admin_shout_refunds(p_limit integer default 50)
returns table(shout_id uuid, purchase_id bigint, refund_estimate integer, refund_block text)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if (select auth.uid()) is null then raise exception '로그인이 필요합니다'; end if;
  if public.my_role() <> 'admin' then raise exception '권한이 없습니다'; end if;

  return query
    select pp.shout_id, pp.id, coalesce(q.points, 0), q.block
    from public.point_purchases pp
    cross join lateral public.refund_quote(pp.id) q
    where pp.kind = 'shout' and pp.shout_id is not null
    order by pp.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end $function$;

-- ③ 운영자 내부 메모·처리자는 당사자에게 보이지 않는다(앱은 RPC 만 쓰므로 화면 영향 0).
revoke select (refund_reason, refunded_by) on public.point_purchases from authenticated;

revoke all on function public.refund_quote(bigint) from public, anon;
grant execute on function public.refund_quote(bigint) to authenticated, service_role;
revoke all on function public.admin_refund_purchase(bigint, text) from public, anon;
grant execute on function public.admin_refund_purchase(bigint, text) to authenticated, service_role;
revoke all on function public.admin_shout_refunds(integer) from public, anon;
grant execute on function public.admin_shout_refunds(integer) to authenticated, service_role;
