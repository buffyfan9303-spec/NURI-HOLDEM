-- 20260911f — 남은 UTC current_date 정리: date 컬럼 default 6곳 + 시즌 뱃지 기간 판정 3곳
--
-- 배경
--   Supabase 서버 TimeZone 은 UTC 라 `current_date` 는 **한국시간 00:00~08:59 동안 전날**이다.
--   같은 부류를 이미 두 번 고쳤다 — 20260818f(venue_today_games → 영업일), 20260911e(배너 게재창 → KST).
--   저장소 관행은 (now() at time zone 'Asia/Seoul')::date 다.
--
-- ── ① date 컬럼 default 6곳 (잠재 함정) ──
--   지금 나고 있는 버그는 아니다. 앱·RPC 인서트 36곳이 **전부** 날짜를 명시한다(전수 확인).
--   그래도 지우는 이유: venue_rankings 는 RLS(vr_ins·vr_write)로 업주의 PostgREST 직접 insert 가 열려 있고,
--   장부 4개 테이블은 20260818f 가 '자정 넘김 블랙홀'로 한 번 크게 덴 자리다.
--   날짜를 빼먹은 코드가 한 줄만 생기면 새벽 1~3시(대회 종료 시간대) 기록이 조용히 전날로 들어간다.
--   ⚠ default 는 **앞으로의 insert 에만** 걸린다 — 기존 행 영향 0.
--
-- ── ② 시즌 뱃지 3함수 (지금 나고 있는 버그) ──
--   · 시즌 **시작일** 한국시간 00:00~08:59 → buy_season_badge 가 '이 매장은 지금 진행 중인 시즌이 없어요' 로
--     거절한다. 시즌은 진행 중인데 서버가 거짓말을 하고, 상점 목록(my_buyable_season_badges)에서도 빠진다.
--   · 시즌 **종료 다음날** 같은 시간대 → 이미 끝난 시즌 뱃지가 9시간 더 팔린다(300 활동점수 차감).
--   · my_season_badges.ongoing 라벨이 같은 9시간 동안 뒤집힌다.
--   현금이 아니라 활동점수 상품이라 금전 손해는 없지만, 하루의 8분의 3이 조용히 틀린다.
--
--   ⚠ 아래 함수 본문은 20260830n_ownership_tier_goods.sql 의 원문을 **스크립트로 그대로 떼어 온 것**이고
--     current_date 세 곳만 KST 로 바꿨다(손으로 옮겨 적으면 한 글자 틀려도 라이브 기능이 깨진다).
--   ⚠ CREATE OR REPLACE 는 ACL 을 초기화한다 — 20260830n:1032~1037 과 **똑같이** REVOKE/GRANT 를 다시 쓴다.
--
-- 일부러 바꾸지 않는 것
--   · purge_expired_home_banners (20260904b:67) — 7일 유예 앞에서 9시간은 판정을 못 뒤집는다(조기 삭제 불가).
--     CREATE OR REPLACE 로 ACL 만 흔들고 얻는 게 없다.
--   · home_banners_read_public — 20260911e 가 담당한다.
--   · baseline 의 venue_today_games — 20260818f 가 이미 영업일로 대체했고 자가검사까지 걸어 뒀다.
--
-- 롤백:
--   alter table public.venue_rankings alter column ranking_date set default current_date;
--   alter table public.bankroll_entries alter column entry_date set default current_date;
--   alter table public.ledger_buyins alter column session_date set default current_date;
--   alter table public.ledger_players alter column session_date set default current_date;
--   alter table public.ledger_sessions alter column session_date set default current_date;
--   alter table public.ledger_buyin_requests alter column session_date set default current_date;
--   (함수 3개는 20260830n_ownership_tier_goods.sql 의 §7 블록을 그대로 다시 실행 + 같은 REVOKE/GRANT)

-- ── ① date 컬럼 default → KST ──────────────────────────────────────────────
-- 순위 저장. 홀덤 대회는 새벽 1~3시에 끝난다 — 날짜를 빼먹은 insert 가 하나만 생겨도 전날로 박힌다.
alter table public.venue_rankings
  alter column ranking_date set default (now() at time zone 'Asia/Seoul')::date;
-- 수기 뱅크롤·메모. 사용자가 캘린더에서 고른 날짜가 정본이다.
alter table public.bankroll_entries
  alter column entry_date set default (now() at time zone 'Asia/Seoul')::date;
-- 장부 — 20260818f 가 자정 넘김으로 이미 한 번 크게 덴 자리.
alter table public.ledger_buyins
  alter column session_date set default (now() at time zone 'Asia/Seoul')::date;
-- 장부.
alter table public.ledger_players
  alter column session_date set default (now() at time zone 'Asia/Seoul')::date;
-- 장부.
alter table public.ledger_sessions
  alter column session_date set default (now() at time zone 'Asia/Seoul')::date;
-- 장부 — QR 바인 요청.
alter table public.ledger_buyin_requests
  alter column session_date set default (now() at time zone 'Asia/Seoul')::date;

-- ── ② 시즌 뱃지 기간 판정 → KST (본문은 20260830n §7 원문) ──────────────────

create or replace function public.buy_season_badge(p_venue_id uuid)
returns table(season_id uuid, season_name text, venue_name text, available integer)
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
  v_sid    uuid;
  v_sname  text;
  v_vname  text;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;

  select price into v_price from public.shop_skus where key = 'season_badge' and active;
  if v_price is null then raise exception '판매 중인 상품이 아닙니다'; end if;

  if not exists (select 1 from public.venue_follows
                  where user_id = v_uid and venue_id = p_venue_id) then
    raise exception '단골(팔로우)한 매장의 뱃지만 살 수 있어요';
  end if;

  -- 진행 중인 시즌 하나. 기간이 겹쳐 여러 개면 먼저 끝나는 것을 '이번 시즌'으로 본다.
  select s.id, s.name, v.name into v_sid, v_sname, v_vname
    from public.venue_seasons s
    join public.venues v on v.id = s.venue_id
   where s.venue_id = p_venue_id and s.status = 'active'
     -- 날짜는 KST 로 본다 — 서버 TZ(UTC) 기준이면 한국 오전 9시까지 전날이라
     -- 시즌 **시작일 아침**에 '진행 중인 시즌이 없어요' 로 거절됐다(20260911f).
     -- ⚠ 이 주석에 옛 표현을 그대로 적지 않는다 — 아래 자가검사가 prosrc 를 통째로 grep 하고,
     --   PostgreSQL 의 prosrc 에는 본문 주석까지 들어가서 적용 시점에 ABORT 로 터진다.
     and (now() at time zone 'Asia/Seoul')::date between s.starts_on and s.ends_on
   order by s.ends_on
   limit 1;
  if v_sid is null then raise exception '이 매장은 지금 진행 중인 시즌이 없어요'; end if;

  if exists (select 1 from public.cosmetic_unlocks
              where user_id = v_uid and kind = 'season_badge' and item_key = v_sid::text) then
    raise exception '이번 시즌 뱃지는 이미 갖고 있어요';
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
  insert into public.cosmetic_unlocks (user_id, kind, item_key)
  values (v_uid, 'season_badge', v_sid::text);
  insert into public.point_purchases (user_id, kind, sku_key, item_key, cost, duration_hours)
  values (v_uid, 'season_badge', 'season_badge', v_sid::text, v_price, 0);

  return query select v_sid, v_sname, v_vname, greatest(0, v_points - v_spent - v_price);
end $function$;

comment on function public.buy_season_badge(uuid) is
  '단골 시즌 뱃지(300점/시즌). 팔로우한 매장의 진행 중 시즌에만. 시즌이 끝나도 소장 행은 남는다 — 만료가 아니라 "그 시즌의 것"이라는 기록이라서다(기간권이 밟은 지뢰를 피하는 지점).';

-- 내 시즌 뱃지 — 이름을 붙여서. 시즌이 끝난 것도 함께 준다(지난 시즌 기록이 곧 단골의 증거다).
create or replace function public.my_season_badges()
returns table(season_id uuid, season_name text, venue_id uuid, venue_name text,
              ends_on date, ongoing boolean)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  -- ⚠ 조인을 `s.id = u.item_key::uuid` 로 쓰면 안 된다. 플래너가 kind 필터보다 캐스트를 먼저
  --   평가할 수 있어, 같은 표에 있는 프레임·색 키('frame_gold' 등)를 uuid 로 캐스트하다 터진다.
  --   방향을 뒤집어 s.id 를 text 로 만들면 캐스트가 항상 안전하다.
  select s.id, s.name, s.venue_id, v.name, s.ends_on,
         (s.status = 'active' and (now() at time zone 'Asia/Seoul')::date between s.starts_on and s.ends_on)   -- KST(20260911f)
    from public.cosmetic_unlocks u
    join public.venue_seasons s on s.id::text = u.item_key
    join public.venues v on v.id = s.venue_id
   where u.user_id = (select auth.uid()) and u.kind = 'season_badge'
   order by s.ends_on desc;
$function$;

-- 살 수 있는 시즌 목록 — 내가 팔로우했고, 진행 중이고, 아직 안 산 것.
-- '살 수 있는 게 뭔지'를 화면이 유추하지 않게 서버가 골라 준다.
create or replace function public.my_buyable_season_badges()
returns table(venue_id uuid, venue_name text, season_id uuid, season_name text, ends_on date)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select v.id, v.name, s.id, s.name, s.ends_on
    from public.venue_follows f
    join public.venues v on v.id = f.venue_id
    join public.venue_seasons s on s.venue_id = f.venue_id and s.status = 'active'
   where f.user_id = (select auth.uid())
     and (now() at time zone 'Asia/Seoul')::date between s.starts_on and s.ends_on   -- KST(20260911f)
     and not exists (select 1 from public.cosmetic_unlocks u
                      where u.user_id = f.user_id and u.kind = 'season_badge'
                        and u.item_key = s.id::text)
   order by s.ends_on;
$function$;

-- ACL 재선언 — CREATE OR REPLACE 가 초기화한다. 20260830n:1032~1037 과 같은 문장.
revoke all on function public.buy_season_badge(uuid) from public, anon;
grant execute on function public.buy_season_badge(uuid) to authenticated, service_role;
revoke all on function public.my_season_badges() from public, anon;
grant execute on function public.my_season_badges() to authenticated, service_role;
revoke all on function public.my_buyable_season_badges() from public, anon;
grant execute on function public.my_buyable_season_badges() to authenticated, service_role;

-- ── 적용 검증 — 하나라도 어긋나면 트랜잭션 전체를 중단한다 (20260818f:325 · 20260911e 와 같은 방식) ──
do $$
declare r record;
begin
  for r in
    select c.table_name, c.column_name, c.column_default
      from information_schema.columns c
     where c.table_schema = 'public'
       and (c.table_name, c.column_name) in (
             ('venue_rankings','ranking_date'),
             ('bankroll_entries','entry_date'),
             ('ledger_buyins','session_date'),
             ('ledger_players','session_date'),
             ('ledger_sessions','session_date'),
             ('ledger_buyin_requests','session_date'))
  loop
    if r.column_default is null or r.column_default not like '%Asia/Seoul%' then
      raise exception 'ABORT: %.% default 가 KST 가 아니다 — %', r.table_name, r.column_name, r.column_default;
    end if;
    if upper(r.column_default) like '%CURRENT_DATE%' then
      raise exception 'ABORT: %.% 에 UTC current_date 가 남아 있다 — %', r.table_name, r.column_name, r.column_default;
    end if;
  end loop;

  for r in
    select p.proname, p.prosrc
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('buy_season_badge','my_season_badges','my_buyable_season_badges')
  loop
    if r.prosrc not like '%Asia/Seoul%' then
      raise exception 'ABORT: % 가 KST 를 안 쓴다', r.proname;
    end if;
    if r.prosrc like '%current_date%' then
      raise exception 'ABORT: % 에 UTC current_date 가 남아 있다', r.proname;
    end if;
  end loop;

  -- CREATE OR REPLACE 가 ACL 을 날린 채 끝나지 않았는지 — 변이 RPC 가 anon 에 열리면 그게 사고다.
  if has_function_privilege('anon', 'public.buy_season_badge(uuid)', 'execute') then
    raise exception 'ABORT: buy_season_badge 가 anon 에 열려 있다';
  end if;
  if not has_function_privilege('authenticated', 'public.buy_season_badge(uuid)', 'execute') then
    raise exception 'ABORT: buy_season_badge 가 authenticated 에 닫혀 있다 — 상점이 죽는다';
  end if;

  raise notice 'KST OK — date default 6곳 · 시즌 뱃지 3함수 · ACL';
end $$;

notify pgrst, 'reload schema';
