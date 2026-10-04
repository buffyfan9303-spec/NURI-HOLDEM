-- 20261004g — NURI SPOT AI 코칭: 회원 계정마다 평생 첫 3회 무료, 그 뒤 회당 30P (오너 결정 2026-10-04).
--
-- ✅ 적용 완료 2026-10-04 (리드 · critical PASS · 리허설 F0~F14) — project idsxiqspecrucvfvtgbw · MCP execute_sql
--   적용 후 실측 md5: _spot_ai_begin 10c6dcb1… · spot_ai_status 5322f7a3… · _spot_ai_refund a1df4e47… · spot_ai_reviews.purchase_id is_nullable=YES
--   (작성 gto-team 2026-10-04 · 아래 게이트 md5 는 적용 **전** 정의 값이다 — 다시 돌리면 게이트에서 멈추는 것이 정상)
--   롤백 리허설: 운영 DB 위에서 dummy-1004/rehearse.mjs 로 s1(더미 손님) + 이 파일 + s2(무료·과금 T) 를 한 트랜잭션에 돌리고 RAISE 로 되돌림.
--   결과는 아래 '리허설' 줄과 spot-ai-1004/README.md.
--
-- 바뀌는 것(최소):
--   ① spot_ai_reviews.purchase_id NOT NULL 해제 + free boolean(기본 false) + CHECK(무료면 원장 없음 / 유료면 원장 있음)
--   ② _spot_ai_begin — 한도 검사 뒤, 그 회원의 무료 사용(free 이고 pending·done, 환불 제외) 이 3 미만이면 포인트 검사·차감·원장 없이
--      free 행만 만든다. 아니면 기존 30P 경로 그대로. 반환에 free·free_left 를 더한다(엣지 함수는 몰라도 된다).
--   ③ spot_ai_status — free_limit·free_left 를 더한다(화면 안내용).
--   바뀌지 않는 것: _spot_ai_refund(원장 없는 행은 point_purchases update 가 0행 → 포인트 복원 없이 refunded 만 — 현재 정의 그대로 맞다),
--      _spot_ai_finish · _spot_ai_refund_stale · daily_purchase_count · refund_quote · shop_skus · point_purchases.
--
-- 왜 이 설계인가(무료 회차를 원장에 남기지 않는 이유):
--   · point_purchases_cost_check(cost > 0) · shop_skus_price_check(price > 0) — 0원 원장/0원 상품은 제약이 막는다(2026-10-04 실측).
--     제약을 풀면 상점·환불 견적(refund_quote)·하루 구매 수(daily_purchase_count)가 '0원 구매' 를 만나게 된다 — 영향 범위가 넓다.
--   · 무료 여부는 spot_ai_reviews 한 표에서 센다 → 하루 한도(같은 표)·캐시(같은 표)·환불(같은 행 status)과 한 곳에서 맞물린다.
--   · 환불(status='refunded')이면 무료 횟수가 자동 복원된다(세는 조건이 pending·done 이므로).
--   · 동시 요청: begin 은 이미 profiles 행 잠금으로 같은 회원을 줄 세운다 → 잠근 뒤 센 무료 건수에 pending 이 들어가므로 4번째 무료가 생기지 않는다.
--   · 같은 스냅샷 캐시는 한도·무료·포인트 검사 **앞**에서 돌려주므로 무료 횟수를 쓰지 않는다(기존 순서 유지).
--   · '평생' 은 계정(user_id) 단위다. 탈퇴(_purge_private_records)는 이 표를 지우고, 새 계정은 새 3회다 — 오너 문구 '모든 회원 계정마다' 그대로.
-- 숫자: 무료 3 · 하루 3 · 가격 30 은 화면 src/lib/spotAiLimits.ts 와 같아야 한다(src/api/spotReview.test.ts 계약).
-- 시그니처·반환 타입 동일 → CREATE OR REPLACE(ACL 보존). REVOKE/GRANT 는 관행대로 다시 적는다. search_path 고정.

-- 0) 라이브 게이트 — 저장소가 아는 정의 위에서만 적용한다(다르면 아무것도 안 바뀐다)
do $gate$
begin
  if md5(pg_get_functiondef('public._spot_ai_begin(uuid,uuid,int)'::regprocedure)) <> 'e80c9e62940caa65b3d2aa9f9f4d458e' then
    raise exception '20261004g gate: _spot_ai_begin 라이브 정의가 예상과 다르다(이미 적용됐거나 다른 변경) — 멈춤';
  end if;
  if md5(pg_get_functiondef('public.spot_ai_status()'::regprocedure)) <> 'e6625e1f57f16e2c3cad2d8234e4cb47' then
    raise exception '20261004g gate: spot_ai_status 라이브 정의가 예상과 다르다 — 멈춤';
  end if;
  if md5(pg_get_functiondef('public._spot_ai_refund(bigint)'::regprocedure)) <> '40dd38b5c9eb78ff12dccc10f14ca7d8' then
    raise exception '20261004g gate: _spot_ai_refund 가 바뀌었다 — 원장 없는 행 처리 전제를 다시 확인하라';
  end if;
end $gate$;

-- 1) 표
alter table public.spot_ai_reviews alter column purchase_id drop not null;
alter table public.spot_ai_reviews add column if not exists free boolean not null default false;
alter table public.spot_ai_reviews drop constraint if exists spot_ai_reviews_paid_or_free;
alter table public.spot_ai_reviews add constraint spot_ai_reviews_paid_or_free
  check ((free and purchase_id is null) or (not free and purchase_id is not null));

-- 2) begin
create or replace function public._spot_ai_begin(p_user uuid, p_spot uuid, p_limit int default 3)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_spot jsonb; v_hash text; v_row public.spot_ai_reviews; v_status text; v_ap int; v_sp int;
        v_price int; v_used int; v_pid bigint; v_day timestamptz; v_stale bigint; v_free_used int;
        c_free_limit constant int := 3;   -- 평생 무료 횟수(오너 2026-10-04). 화면 SPOT_AI_FREE_COUNT 와 같아야 한다.
begin
  select spot into v_spot from public.spot_reviews where id = p_spot and user_id = p_user;
  if v_spot is null then return jsonb_build_object('ok',false,'code','NOT_OWNER'); end if;
  v_hash := md5(v_spot::text);
  -- 같은 사람의 동시 요청은 프로필 행 잠금으로 줄 세운다 — 아래의 하루 한도·무료 건수가 이 잠금 뒤에 센 값이다.
  select coalesce(status::text,'active'), coalesce(activity_points,0), coalesce(spent_points,0)
    into v_status, v_ap, v_sp from public.profiles where id = p_user for update;
  if v_status is distinct from 'active' then return jsonb_build_object('ok',false,'code','SANCTIONED'); end if;
  for v_stale in select id from public.spot_ai_reviews
                  where user_id = p_user and status = 'pending' and created_at < now() - interval '5 minutes' loop
    perform public._spot_ai_refund(v_stale);
  end loop;
  select coalesce(spent_points,0) into v_sp from public.profiles where id = p_user;
  -- 재열람: 같은 스냅샷의 결과가 있으면 무료(한도·무료 횟수·포인트 모두 안 씀)
  select * into v_row from public.spot_ai_reviews where user_id = p_user and spot_hash = v_hash and status in ('pending','done');
  if found then return jsonb_build_object('ok',true,'cached',true,'status',v_row.status,'id',v_row.id,'body',v_row.body); end if;
  v_day := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  select count(*) into v_used from public.spot_ai_reviews where user_id = p_user and status <> 'refunded' and created_at >= v_day;
  if v_used >= p_limit then return jsonb_build_object('ok',false,'code','DAILY_LIMIT','used',v_used); end if;
  select price into v_price from public.shop_skus where key = 'spot_ai' and active;
  if v_price is null then return jsonb_build_object('ok',false,'code','DISABLED'); end if;
  -- 무료 회차: 환불되지 않은 무료 사용(진행 중 포함)이 3 미만이면 포인트 검사·차감·원장 없이 진행
  select count(*) into v_free_used from public.spot_ai_reviews where user_id = p_user and free and status in ('pending','done');
  if v_free_used < c_free_limit then
    insert into public.spot_ai_reviews(user_id, spot_review_id, spot_hash, purchase_id, free)
    values (p_user, p_spot, v_hash, null, true) returning * into v_row;
    return jsonb_build_object('ok',true,'cached',false,'id',v_row.id,'spot',v_spot,'used',v_used+1,'available',v_ap - v_sp,
                              'free',true,'free_left',c_free_limit - v_free_used - 1);
  end if;
  if v_ap - v_sp < v_price then return jsonb_build_object('ok',false,'code','INSUFFICIENT','available',v_ap - v_sp,'price',v_price); end if;
  update public.profiles set spent_points = coalesce(spent_points,0) + v_price where id = p_user;
  insert into public.point_purchases(user_id, kind, sku_key, cost, duration_hours, item_key)
  values (p_user, 'spot_ai', 'spot_ai', v_price, 0, p_spot::text) returning id into v_pid;
  insert into public.spot_ai_reviews(user_id, spot_review_id, spot_hash, purchase_id, free)
  values (p_user, p_spot, v_hash, v_pid, false) returning * into v_row;
  return jsonb_build_object('ok',true,'cached',false,'id',v_row.id,'spot',v_spot,'used',v_used+1,'available',v_ap - v_sp - v_price,
                            'free',false,'free_left',0);
end $$;

-- 3) status — 남은 무료 횟수
create or replace function public.spot_ai_status()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_price int; v_used int; v_ap int; v_sp int; v_day timestamptz; v_free_used int;
        c_free_limit constant int := 3;
begin
  select price into v_price from public.shop_skus where key = 'spot_ai' and active;
  if v_uid is null then return jsonb_build_object('enabled', v_price is not null, 'price', v_price, 'free_limit', c_free_limit); end if;
  v_day := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  select count(*) into v_used from public.spot_ai_reviews where user_id = v_uid and status <> 'refunded' and created_at >= v_day;
  select count(*) into v_free_used from public.spot_ai_reviews where user_id = v_uid and free and status in ('pending','done');
  select coalesce(activity_points,0), coalesce(spent_points,0) into v_ap, v_sp from public.profiles where id = v_uid;
  return jsonb_build_object('enabled', v_price is not null, 'price', v_price, 'used_today', v_used, 'limit', 3,
                            'available', coalesce(v_ap,0) - coalesce(v_sp,0),
                            'free_limit', c_free_limit, 'free_left', greatest(0, c_free_limit - v_free_used));
end $$;

revoke all on function public._spot_ai_begin(uuid,uuid,int) from public, anon, authenticated;
grant execute on function public._spot_ai_begin(uuid,uuid,int) to service_role;
revoke all on function public.spot_ai_status() from public, anon;
grant execute on function public.spot_ai_status() to authenticated, service_role;

-- 4) 자가검사
do $chk$
begin
  if (select is_nullable from information_schema.columns
       where table_schema='public' and table_name='spot_ai_reviews' and column_name='purchase_id') <> 'YES' then
    raise exception 'self-check: purchase_id 가 아직 NOT NULL';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.spot_ai_reviews'::regclass and conname='spot_ai_reviews_paid_or_free') then
    raise exception 'self-check: paid_or_free 제약 없음';
  end if;
  if has_function_privilege('authenticated', 'public._spot_ai_begin(uuid,uuid,int)', 'execute')
     or has_function_privilege('anon', 'public._spot_ai_begin(uuid,uuid,int)', 'execute')
     or has_function_privilege('anon', 'public.spot_ai_status()', 'execute')
     or not has_function_privilege('authenticated', 'public.spot_ai_status()', 'execute') then
    raise exception 'self-check: ACL';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public._spot_ai_begin(uuid,uuid,int)'::regprocedure
                  and prosecdef and proconfig @> array['search_path=public, pg_temp']) then
    raise exception 'self-check: _spot_ai_begin search_path/definer';
  end if;
  if pg_get_functiondef('public._spot_ai_begin(uuid,uuid,int)'::regprocedure) not like '%v_free_used < c_free_limit%' then
    raise exception 'self-check: 무료 분기 없음';
  end if;
  -- 기존 유료 행은 전부 원장이 있다(적용 시점 운영 0행 · 2026-10-04 실측)
  if exists (select 1 from public.spot_ai_reviews where not free and purchase_id is null) then
    raise exception 'self-check: 원장 없는 유료 행';
  end if;
end $chk$;
