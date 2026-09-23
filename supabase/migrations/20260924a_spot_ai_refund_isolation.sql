-- 20260924a — NURI SPOT AI 코칭 켜기 전 수리(critical-reviewer 판정 F1·F2, 2026-09-24).
--
-- ✅ **2026-09-24 라이브 적용 완료** (project idsxiqspecrucvfvtgbw · MCP execute_sql · begin…commit, 자가검사 통과)
--   refund_quote md5 2cb0569e… → bf42e807b860314cb652f89d5a4950b8 · ACL {postgres, service_role} 불변
--   🔴 변경 범위 실측: 새 정의에서 추가한 두 구간을 지우면 md5 가 적용 전 값 2cb0569e455f566da717844c13cd5e2d 와 **일치** — 나머지 규칙 무변경.
--   롤백 리허설: AI 환불 3건 보유자 — 응원 구매 견적 전 '30일 3건'으로 막힘 → 후 응원 고유 규칙으로 판정 · spot_ai 구매 견적 → 'AI 코칭은 자동 환불' 명시 차단
--   _spot_ai_refund_stale ACL {postgres, service_role} · cron 'spot-ai-refund-stale' */5 등록 · 적용 직후 실행 0건(대기 행 없음)
--
-- F1: AI 실패 자동 환불(_spot_ai_refund)이 point_purchases.refunded_at 을 채우는데, 관리자 환불 견적(refund_quote)의
--     '최근 30일 환불 3건' 상한이 kind 를 가리지 않아 **AI 오류 3번이면 그 사용자의 정당한 구매(외치기 등)를 30일간 환불 못 했다**
--     (리뷰어 롤백 리허설 실측). 또 spot_ai 는 다룰 가지가 없어 '기간 정보 없음'으로 **우연히** 막혀 있었다.
--     → 30일 카운트에서 spot_ai 제외 + spot_ai 는 명시적으로 수동 환불 불가(자동 환불 전용).
-- F2: 5분 넘게 남은 pending 은 **같은 사용자의 다음 요청**에서만 환불됐다(크론 없음) → 5분마다 도는 크론.
--
-- refund_quote 는 라이브 정의(md5 2cb0569e455f566da717844c13cd5e2d, 2026-09-24 실측)를 그대로 옮기고 두 곳만 바꿨다:
--   ① 30일 카운트에 `and q.kind <> 'spot_ai'`  ② kind = 'spot_ai' 차단 가지(응원 가지 앞).  반환 타입 동일 → CREATE OR REPLACE(ACL 보존).

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
  -- AI 스팟 코칭 — 실패하면 서버가 자동 환불한다(_spot_ai_refund). 받은 코칭은 되돌릴 수 없다. 수동 환불 경로를 두지 않는다.
  if v_pp.kind = 'spot_ai' then
    return query select 0, 'AI 코칭은 실패 시 자동 환불됩니다 — 받은 코칭은 환불할 수 없습니다. 보상은 활동점수 지급을 쓰세요'::text; return;
  end if;
  if now() - v_pp.created_at > interval '24 hours' then
    return query select 0, '구매 후 24시간이 지나 환불할 수 없습니다 — 보상 지급은 활동점수 지급을 쓰세요'::text; return;
  end if;
  if (select count(*) from public.point_purchases q
       where q.user_id = v_pp.user_id
         and q.kind <> 'spot_ai'   -- AI 실패 자동 환불은 운영자 환불 상한에 세지 않는다(20260924a F1)
         and q.refunded_at > now() - interval '30 days') >= 3 then
    return query select 0, '최근 30일 환불이 이미 3건입니다 — 반복 환불은 활동점수 지급으로 처리하세요'::text; return;
  end if;

  -- 응원 — 보낸 즉시 상대에게 알림이 가고 표시가 붙는다. 되돌릴 수 없는 상품이다.
  if v_pp.kind = 'cheer' then
    return query select 0, '응원은 보내는 즉시 상대에게 전달돼 환불할 수 없습니다 — 보상은 활동점수 지급을 쓰세요'::text; return;
  end if;
  -- 끌올 — 이미 나간 상단 노출은 회수할 수 없다(외치기 방송과 같은 성질).
  if v_pp.kind = 'bump' then
    return query select 0, '끌올은 이미 노출이 시작돼 환불할 수 없습니다 — 보상은 활동점수 지급을 쓰세요'::text; return;
  end if;
  -- 닉네임 즉시 변경권 — 산 순간 대기 시간이 사라진다(=상품을 이미 받았다).
  -- 되돌리려면 쿨다운을 '다시 걸어야' 하는데 그 시작 시각을 만들어 낼 근거가 없다(원래 값은 지워졌다).
  if v_pp.kind = 'nick_change' then
    return query select 0, '즉시 변경권은 구매 즉시 대기 시간이 사라져 환불할 수 없습니다 — 보상은 활동점수 지급을 쓰세요'::text; return;
  end if;

  -- 코스메틱(프레임·닉네임 색) — 영구 소장이라 일할이 없다. 마크와 같은 판정이다.
  if v_pp.kind = 'cosmetic' then
    if v_pp.item_key is null then
      return query select 0, '환불에 필요한 상품 정보가 없습니다'::text; return;
    end if;
    if exists (select 1 from public.profiles
                where id = v_pp.user_id
                  and (equipped_card_frame = v_pp.item_key or equipped_nick_color = v_pp.item_key)) then
      return query select 0, '장착 중인 항목은 환불할 수 없습니다 — 먼저 해제해 주세요'::text; return;
    end if;
    if not exists (select 1 from public.cosmetic_unlocks
                    where user_id = v_pp.user_id and item_key = v_pp.item_key
                      and kind in ('card_frame', 'nick_color')) then
      return query select 0, '이미 회수된 항목입니다'::text; return;
    end if;
    return query select v_pp.cost, null::text; return;
  end if;

  -- 시즌 뱃지 — 소장을 회수하면 그대로 되돌아간다(장착 개념이 없다).
  if v_pp.kind = 'season_badge' then
    if v_pp.item_key is null then
      return query select 0, '환불에 필요한 시즌 정보가 없습니다'::text; return;
    end if;
    if not exists (select 1 from public.cosmetic_unlocks
                    where user_id = v_pp.user_id and kind = 'season_badge'
                      and item_key = v_pp.item_key) then
      return query select 0, '이미 회수된 뱃지입니다'::text; return;
    end if;
    return query select v_pp.cost, null::text; return;
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
    -- (예약분은 방송이 아직 멀었을 수 있어 여기서 전액 환불로 살아난다 — 의도한 동작이다.)
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
revoke all on function public.refund_quote(bigint) from public, anon, authenticated;
grant execute on function public.refund_quote(bigint) to service_role;

-- F2: 5분 넘게 남은 pending 을 크론이 환불한다(함수가 begin 과 finish 사이에 죽고 사용자가 다시 오지 않는 경우).
create or replace function public._spot_ai_refund_stale()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_n int := 0;
begin
  for v_id in select id from public.spot_ai_reviews where status = 'pending' and created_at < now() - interval '5 minutes' loop
    if public._spot_ai_refund(v_id) then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;
revoke all on function public._spot_ai_refund_stale() from public, anon, authenticated;
grant execute on function public._spot_ai_refund_stale() to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'spot-ai-refund-stale';
select cron.schedule('spot-ai-refund-stale', '*/5 * * * *', $$select public._spot_ai_refund_stale()$$);

do $$
begin
  if pg_get_functiondef('public.refund_quote'::regproc) not like '%q.kind <> ''spot_ai''%' then raise exception 'self-check: 30일 카운트'; end if;
  if pg_get_functiondef('public.refund_quote'::regproc) not like '%v_pp.kind = ''spot_ai''%' then raise exception 'self-check: spot_ai 차단 가지'; end if;
  if has_function_privilege('authenticated', 'public.refund_quote(bigint)', 'execute')
     or has_function_privilege('authenticated', 'public._spot_ai_refund_stale()', 'execute') then raise exception 'self-check: ACL'; end if;
  if not exists (select 1 from cron.job where jobname = 'spot-ai-refund-stale') then raise exception 'self-check: cron'; end if;
end $$;
