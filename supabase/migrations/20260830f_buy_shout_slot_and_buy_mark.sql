-- 20260830f — 구매 RPC 를 슬롯/영구 소장 방식으로. 기존 안전장치는 한 줄도 빼지 않는다
-- (프로필 행 잠금 → 제재 확인 → 금칙어 → 쿨다운 → 잔액 → 차감·게시 한 트랜잭션).

-- ── 외치기: 20초 방송 슬롯 1회 ─────────────────────────────────────────────
create or replace function public.buy_shout(p_message text, p_tier text default 'basic', p_color text default null)
returns community_shouts
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_r      record;
  v_t      record;
  v_msg    text;
  v_nick   text;
  v_status text;
  v_points int;
  v_spent  int;
  v_color  text;
  v_last   timestamptz;
  v_plays  timestamptz;
  v_row    public.community_shouts;
  SLOT constant interval := interval '20 seconds';
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  if p_tier not in ('basic', 'gold') then raise exception '판매 중인 외치기 등급이 아닙니다'; end if;
  select * into v_r from public.shout_rules();
  select * into v_t from public.shout_tier(p_tier);
  if v_t.cost is null then raise exception '알 수 없는 외치기 등급입니다'; end if;

  -- 색은 '하이라이트'에서만. 기본에 색을 보내면 조용히 무시하지 않고 분명히 거절한다
  -- (조용한 무시는 '돈 냈는데 색이 안 나왔다'는 문의를 만든다).
  v_color := nullif(btrim(coalesce(p_color, '')), '');
  if v_color is not null then
    if p_tier <> 'gold' then raise exception '색은 하이라이트에서만 고를 수 있어요'; end if;
    if v_color not in ('gold', 'blue', 'green', 'purple', 'rose') then
      raise exception '고를 수 없는 색이에요';
    end if;
  elsif p_tier = 'gold' then
    v_color := 'gold';   -- 하이라이트 기본색
  end if;

  v_msg := btrim(regexp_replace(coalesce(p_message, ''), '\s+', ' ', 'g'));
  if char_length(v_msg) < v_r.min_len then
    raise exception '외침은 %자 이상 써 주세요', v_r.min_len;
  end if;
  if char_length(v_msg) > v_r.max_len then
    raise exception '외침은 %자까지 쓸 수 있어요', v_r.max_len;
  end if;
  if public.shout_blocked(v_msg) then
    raise exception '게시할 수 없는 표현이나 링크가 들어 있어요';
  end if;

  select coalesce(p.nickname, p.name, '회원'), coalesce(p.status::text, 'active'),
         coalesce(p.activity_points, 0), coalesce(p.spent_points, 0)
    into v_nick, v_status, v_points, v_spent
  from public.profiles p where p.id = v_uid for update;
  if not found then raise exception '프로필을 찾을 수 없습니다'; end if;
  if v_status <> 'active' then raise exception '제재 중인 계정은 외치기를 쓸 수 없습니다'; end if;

  -- ⚠ 환불은 이 상한을 복원하지 않는다. 환불된 외침도 행이 남아 여기서 그대로 세어진다.
  if exists (
    select 1 from public.community_shouts s
     where s.user_id = v_uid
       and s.created_at > now() - (v_r.cooldown_minutes || ' minutes')::interval
  ) then
    raise exception '외치기는 %분에 한 번만 쓸 수 있어요', v_r.cooldown_minutes;
  end if;

  -- 오너 지시(2026-08-30): 1일 구매 한도 10회 — 상품 종류 무관 합산.
  if public.daily_purchase_count(v_uid) >= 10 then
    raise exception '하루 10번까지만 구매할 수 있어요';
  end if;

  if v_points - v_spent < v_t.cost then
    raise exception '활동점수가 부족해요 (필요 %점 · 사용 가능 %점)', v_t.cost, v_points - v_spent;
  end if;

  -- 대기열 맨 뒤에 붙인다. '앞사람 방송 끝'이 내 시작이고, 비어 있으면 지금 바로.
  select max(s.plays_at) into v_last
    from public.community_shouts s
   where s.hidden = false and s.plays_at + SLOT > now();
  v_plays := case when v_last is null then now() else v_last + SLOT end;

  update public.profiles
     set spent_points = coalesce(spent_points, 0) + v_t.cost
   where id = v_uid;

  insert into public.community_shouts(user_id, nickname, message, cost, tier, tier_rank, color, plays_at, expires_at)
  values (v_uid, v_nick, v_msg, v_t.cost, v_t.tier, v_t.tier_rank, v_color, v_plays, v_plays + SLOT)
  returning * into v_row;

  insert into public.point_purchases
    (user_id, kind, sku_key, shout_id, cost, duration_hours, period_from, period_to)
  values (v_uid, 'shout', 'shout_' || v_t.tier, v_row.id, v_t.cost, 0, v_row.plays_at, v_row.expires_at);

  return v_row;
end $function$;

-- ── 꾸미기 마크: 영구 소장 ─────────────────────────────────────────────────
create or replace function public.buy_mark(p_mark_key text)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid    uuid := (select auth.uid());
  v_price  int;
  v_status text;
  v_points int;
  v_spent  int;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;

  select price into v_price from public.shop_skus where key = 'mark_own' and active;
  if v_price is null then raise exception '판매 중인 상품이 아닙니다'; end if;

  -- 소비형(rent) 마크만 산다. 도달(earn) 마크는 점수로 여는 것이라 돈으로 열지 않는다.
  if not exists (select 1 from public.shop_marks where key = p_mark_key and kind = 'rent' and active) then
    raise exception '살 수 없는 마크예요';
  end if;
  if exists (select 1 from public.mark_unlocks where user_id = v_uid and mark_key = p_mark_key) then
    raise exception '이미 소장한 마크예요';
  end if;

  select coalesce(p.status::text, 'active'), coalesce(p.activity_points, 0), coalesce(p.spent_points, 0)
    into v_status, v_points, v_spent
  from public.profiles p where p.id = v_uid for update;
  if not found then raise exception '프로필을 찾을 수 없습니다'; end if;
  if v_status <> 'active' then raise exception '제재 중인 계정은 구매할 수 없습니다'; end if;

  if public.daily_purchase_count(v_uid) >= 10 then
    raise exception '하루 10번까지만 구매할 수 있어요';
  end if;
  if v_points - v_spent < v_price then
    raise exception '활동점수가 부족해요 (필요 %점 · 사용 가능 %점)', v_price, v_points - v_spent;
  end if;

  update public.profiles set spent_points = coalesce(spent_points, 0) + v_price where id = v_uid;
  insert into public.mark_unlocks(user_id, mark_key) values (v_uid, p_mark_key);
  insert into public.point_purchases (user_id, kind, sku_key, mark_key, cost, duration_hours)
  values (v_uid, 'mark_own', 'mark_own', p_mark_key, v_price, 0);
  -- 산 즉시 달아 준다(사고 나서 또 눌러야 하는 단계를 만들지 않는다).
  update public.profiles set equipped_mark = p_mark_key where id = v_uid;

  return p_mark_key;
end $function$;

revoke all on function public.buy_shout(text, text, text) from public, anon;
grant execute on function public.buy_shout(text, text, text) to authenticated, service_role;
revoke all on function public.buy_mark(text) from public, anon;
grant execute on function public.buy_mark(text) to authenticated, service_role;
