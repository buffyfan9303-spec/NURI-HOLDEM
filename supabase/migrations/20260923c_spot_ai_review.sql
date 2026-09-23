-- 20260923c — NURI SPOT 'AI 아쉬운 포인트'(SPOT-WRITE-UX-AI) 서버 기반.
--
-- ✅ **2026-09-24 라이브 적용 완료(기능 꺼짐 상태)** — project idsxiqspecrucvfvtgbw · MCP execute_sql · begin…commit, 자가검사 통과.
--   적용 후: shop_skus.spot_ai active=false · spot_ai_reviews 생성
--     md5 _spot_ai_begin e80c9e62… · _spot_ai_finish debad737… · _spot_ai_refund 40dd38b5… · spot_ai_status e6625e1f… · daily_purchase_count 30e61e24…
--   롤백 리허설(T0~T17 PASS): 꺼짐 DISABLED · 비작성자 NOT_OWNER · 첫 구매 spent+30 · 같은 스팟 재호출/재열람 무료(cached)
--     · 환불 true→재호출 false(멱등)·환불 뒤 finish false · 5분 초과 pending 자동 환불 · 환불분 제외 3회 뒤 4번째 DAILY_LIMIT
--     · 상점 daily_purchase_count 0→0(섞이지 않음) · spot_ai_status used=3 · 본인 read 5행 / 타인 0행 · 직접 refund·insert 42501
--   🔴 켜기 전 남은 것: 엣지 함수 spot-review 배포 → 라이브 음성 대조 → 앱 배포 → `update shop_skus set active=true where key='spot_ai'`
--
-- 오너 결정 2026-09-23: 활동 포인트 30점 · 하루 최대 3회(KST 자정) · AI 실패 시 환불 ·
--   09-11 "외부 AI 는 TDA 하나" 결정을 SPOT 코칭까지 확장 · 처리방침에 외부 AI 위탁 고지 추가.
-- 설계: gto-team 기억 spot_ai_review_design.md (라이브 롤백 리허설 18항목 통과본을 바탕으로 함).
--
-- 🔴 이 파일은 기능을 **꺼 둔 채** 적용한다 — shop_skus('spot_ai').active = false.
--    엣지 함수 spot-review 배포 → 라이브 음성 대조 → 앱 배포 뒤 active=true 로 켠다(리드).
--
-- 포인트는 activity_points 를 깎지 않는다(등급·마크가 떨어진다). 기존 구조대로 profiles.spent_points 를
--   올리고 원장 point_purchases 에 kind 'spot_ai' 로 남긴다(buy_shout 와 같은 조리법, 프로필 행 잠금).
-- 결과는 본인만 읽는 spot_ai_reviews 에 저장 — 같은 스팟 스냅샷(spot_hash)은 재열람 무료.
--   게시판 공유(share_spot_post)에는 절대 싣지 않는다.
-- begin/finish/refund 는 service_role 전용(엣지 함수만 부른다). 로그인 사용자 직접 호출 42501.

alter table public.point_purchases drop constraint if exists point_purchases_kind_check;
alter table public.point_purchases add constraint point_purchases_kind_check check (kind = any (array[
  'shout','mark_rent','mark_own','cheer','bump','cosmetic','season_badge','nick_change','spot_ai']));

insert into public.shop_skus(key, kind, label, descr, price, duration_hours, sort, active)
values ('spot_ai', 'service', 'AI 스팟 코칭', '저장한 스팟의 아쉬운 포인트(정성 코칭)', 30, 0, 900, false)
on conflict (key) do nothing;

create table if not exists public.spot_ai_reviews (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  spot_review_id uuid references public.spot_reviews(id) on delete set null,
  spot_hash text not null,
  purchase_id bigint not null references public.point_purchases(id),
  status text not null default 'pending' check (status in ('pending','done','refunded')),
  body text check (body is null or char_length(body) <= 1500),
  model text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index if not exists spot_ai_reviews_done_uq on public.spot_ai_reviews(user_id, spot_hash) where status in ('pending','done');
create index if not exists spot_ai_reviews_user_day on public.spot_ai_reviews(user_id, created_at);
alter table public.spot_ai_reviews enable row level security;
drop policy if exists spot_ai_reviews_read on public.spot_ai_reviews;
create policy spot_ai_reviews_read on public.spot_ai_reviews for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.spot_ai_reviews from anon, public;
revoke insert, update, delete on public.spot_ai_reviews from authenticated;
grant select on public.spot_ai_reviews to authenticated;

create or replace function public._spot_ai_refund(p_id bigint)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.spot_ai_reviews;
begin
  select * into v from public.spot_ai_reviews where id = p_id for update;
  if not found or v.status <> 'pending' then return false; end if;   -- 멱등: 두 번째 호출은 아무것도 안 한다
  update public.spot_ai_reviews set status = 'refunded', finished_at = now() where id = p_id;
  update public.point_purchases set refunded_at = now(), refunded_by = v.user_id, refund_points = cost, refund_reason = 'ai_failed'
   where id = v.purchase_id and refunded_at is null;
  if found then
    update public.profiles p set spent_points = greatest(0, coalesce(p.spent_points,0) - pp.cost)
      from public.point_purchases pp where pp.id = v.purchase_id and p.id = v.user_id;
  end if;
  return true;
end $$;

create or replace function public._spot_ai_begin(p_user uuid, p_spot uuid, p_limit int default 3)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_spot jsonb; v_hash text; v_row public.spot_ai_reviews; v_status text; v_ap int; v_sp int;
        v_price int; v_used int; v_pid bigint; v_day timestamptz; v_stale bigint;
begin
  select spot into v_spot from public.spot_reviews where id = p_spot and user_id = p_user;
  if v_spot is null then return jsonb_build_object('ok',false,'code','NOT_OWNER'); end if;
  v_hash := md5(v_spot::text);
  -- 같은 사람의 동시 요청은 프로필 행 잠금으로 줄 세운다(buy_shout 와 같은 조리법)
  select coalesce(status::text,'active'), coalesce(activity_points,0), coalesce(spent_points,0)
    into v_status, v_ap, v_sp from public.profiles where id = p_user for update;
  if v_status is distinct from 'active' then return jsonb_build_object('ok',false,'code','SANCTIONED'); end if;
  -- 함수가 begin 과 finish 사이에 죽어 남은 pending(5분 초과)은 먼저 환불한다 — 과금만 되고 결과가 없는 상태를 남기지 않는다.
  for v_stale in select id from public.spot_ai_reviews
                  where user_id = p_user and status = 'pending' and created_at < now() - interval '5 minutes' loop
    perform public._spot_ai_refund(v_stale);
  end loop;
  select coalesce(spent_points,0) into v_sp from public.profiles where id = p_user;
  -- 재열람: 같은 스냅샷의 결과가 있으면 무료로 돌려준다
  select * into v_row from public.spot_ai_reviews where user_id = p_user and spot_hash = v_hash and status in ('pending','done');
  if found then return jsonb_build_object('ok',true,'cached',true,'status',v_row.status,'id',v_row.id,'body',v_row.body); end if;
  v_day := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  select count(*) into v_used from public.spot_ai_reviews where user_id = p_user and status <> 'refunded' and created_at >= v_day;
  if v_used >= p_limit then return jsonb_build_object('ok',false,'code','DAILY_LIMIT','used',v_used); end if;
  select price into v_price from public.shop_skus where key = 'spot_ai' and active;
  if v_price is null then return jsonb_build_object('ok',false,'code','DISABLED'); end if;
  if v_ap - v_sp < v_price then return jsonb_build_object('ok',false,'code','INSUFFICIENT','available',v_ap - v_sp,'price',v_price); end if;
  update public.profiles set spent_points = coalesce(spent_points,0) + v_price where id = p_user;
  insert into public.point_purchases(user_id, kind, sku_key, cost, duration_hours, item_key)
  values (p_user, 'spot_ai', 'spot_ai', v_price, 0, p_spot::text) returning id into v_pid;
  insert into public.spot_ai_reviews(user_id, spot_review_id, spot_hash, purchase_id)
  values (p_user, p_spot, v_hash, v_pid) returning * into v_row;
  return jsonb_build_object('ok',true,'cached',false,'id',v_row.id,'spot',v_spot,'used',v_used+1,'available',v_ap - v_sp - v_price);
end $$;

create or replace function public._spot_ai_finish(p_id bigint, p_body text, p_model text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.spot_ai_reviews set status = 'done', body = left(p_body, 1500), model = p_model, finished_at = now()
   where id = p_id and status = 'pending';
  return found;
end $$;

-- 화면용 상태(가격·오늘 사용·켜짐 여부) — 본인 것만. 읽기 RPC.
create or replace function public.spot_ai_status()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_price int; v_used int; v_ap int; v_sp int; v_day timestamptz;
begin
  select price into v_price from public.shop_skus where key = 'spot_ai' and active;
  if v_uid is null then return jsonb_build_object('enabled', v_price is not null, 'price', v_price); end if;
  v_day := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  select count(*) into v_used from public.spot_ai_reviews where user_id = v_uid and status <> 'refunded' and created_at >= v_day;
  select coalesce(activity_points,0), coalesce(spent_points,0) into v_ap, v_sp from public.profiles where id = v_uid;
  return jsonb_build_object('enabled', v_price is not null, 'price', v_price, 'used_today', v_used, 'limit', 3, 'available', coalesce(v_ap,0) - coalesce(v_sp,0));
end $$;

revoke all on function public._spot_ai_begin(uuid,uuid,int), public._spot_ai_finish(bigint,text,text), public._spot_ai_refund(bigint) from public, anon, authenticated;
grant execute on function public._spot_ai_begin(uuid,uuid,int), public._spot_ai_finish(bigint,text,text), public._spot_ai_refund(bigint) to service_role;
revoke all on function public.spot_ai_status() from public, anon;
grant execute on function public.spot_ai_status() to authenticated, service_role;

-- 상점 '하루 10번' 한도에 AI 코칭이 끼지 않게(리허설 발견 1: AI 3회가 상점 한도 3칸을 먹었다). AI 는 자체 3회 한도가 있다.
create or replace function public.daily_purchase_count(p_user uuid)
returns integer language sql stable security definer set search_path = public, pg_temp as $function$
  select count(*)::int from public.point_purchases
   where user_id = p_user
     and refunded_at is null
     and kind <> 'cheer'     -- 응원은 별도 한도(post_cheers 기준). 소액 고빈도가 아이템 구매를 잠그지 않게.
     and kind <> 'spot_ai'   -- AI 스팟 코칭은 자체 하루 3회 한도(spot_ai_reviews).
     and created_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
$function$;

do $$
begin
  if exists (select 1 from public.shop_skus where key = 'spot_ai' and active) then raise exception 'self-check: spot_ai 가 켜진 채 적용됐다'; end if;
  if has_function_privilege('authenticated', 'public._spot_ai_begin(uuid,uuid,int)', 'execute')
     or has_function_privilege('authenticated', 'public._spot_ai_refund(bigint)', 'execute')
     or has_function_privilege('anon', 'public.spot_ai_status()', 'execute') then
    raise exception 'self-check: ACL';
  end if;
  if has_table_privilege('authenticated', 'public.spot_ai_reviews', 'insert') then raise exception 'self-check: 직접 insert 가능'; end if;
  if pg_get_functiondef('public.daily_purchase_count(uuid)'::regprocedure) not like '%spot_ai%' then raise exception 'self-check: daily_purchase_count'; end if;
end $$;
