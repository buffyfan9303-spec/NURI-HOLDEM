-- ============================================================================
-- 활동점수 경제 — 가격 기준선 정립 + 발권 구멍 폐쇄 (2026-08-29, 오너 지시)
--
-- 오너 지시: "활동점수 하루에 얻을 수 있는게 예를 들어 50~100정도면 200점 정도로
--            구매할 수 있게 하고 당연히 이를 가치로 따져서 나머지도 이런식의 매커니즘으로"
--
-- ── 1. 하루 획득량을 먼저 실측했다(추측으로 값을 정하지 않기 위해) ──────────────
--   출석(claim_daily_login_point)        +1   · 하루 1회
--   글쓰기(award_post_points)            +3/글 · **하루 30 상한**(=10글)
--   댓글(award_comment_points)           +1/개 · **상한 없음** ← 문제
--   체크인(check_in)                     +6   · 매장 QR
--   주간 미션(claim_mission)             +10 / +20 / +30 · 주 60 (≈ 하루 8.6)
--   일회성: 웰컴 +100 · 첫 예약 +50 · 추천인 +300
--   → 성실한 하루 ≈ **45~50점**. 오너 추정(50~100)과 일치한다.
--
-- ── 2. 그런데 댓글에 상한이 없다 = 발권기 ────────────────────────────────────
--   지금까지 활동점수는 '명예 지표'라 상한 없는 경로가 있어도 티가 덜 났다.
--   그러나 외치기(buy_shout)가 생기면서 **점수가 화폐가 됐다.** 화폐가 된 순간
--   상한 없는 획득 경로 하나가 전체 경제를 무의미하게 만든다 — 댓글만 달면 무한 발행이다.
--   글쓰기에는 이미 하루 30 상한이 있는데 댓글에만 없는 것은,
--   '점수는 자랑거리'였던 시절 설계가 그대로 남은 것이다.
--   → 댓글도 **하루 10점(=10개)** 상한. 글쓰기와 같은 (오늘값, 오늘날짜) 카운터 방식이고,
--     카운터는 댓글 삭제와 무관하게 남으므로 '삭제-재작성' 우회가 불가능하다(글쓰기와 동일).
--
-- ── 3. 가격 기준선 ──────────────────────────────────────────────────────────
--   하루치 ≈ 50점을 1일로 보고, 오너 지시대로 소비형 상품을 **200점 ≈ 나흘치**로 잡는다.
--   외치기 30 → 200. 지금은 하루 상한 3회(90점)가 하루 수입의 두 배라
--   '아껴서 사는 것'이 아니라 '매일 쓰고도 남는' 상태였다 — 가격이 의미를 갖지 못했다.
--   (하루 3회 상한은 그대로 둔다. 200점이면 하루 3회는 600점이라 도달 불가지만,
--    상한은 목표치가 아니라 폭주 방지선이므로 남겨 두는 것이 맞다.)
--
--   ※ 상점 마크는 **차감이 아니라 '도달'** 방식이라 이 척도의 대상이 아니다
--     (100~20,000 누적 사다리 = 장기 목표). 소비형이 새로 생기면 반드시 이 척도로 환산할 것:
--       하루치 50점 · 나흘 = 200점 · 2주 = 700점 · 한 달 = 1,500점
-- ============================================================================

-- ── 외치기 가격 30 → 200 ────────────────────────────────────────────────────
-- shout_rules() 는 가격·쿨다운·상한의 단일 출처다(클라이언트는 읽어서 표시만 한다).
-- 그래서 여기 한 곳만 바꾸면 구매 화면·상점 카드·서버 판정이 동시에 따라온다.
create or replace function public.shout_rules()
returns table(cost integer, cooldown_minutes integer, daily_cap integer,
              max_len integer, min_len integer, ttl_hours integer)
language sql
immutable
as $$ select 200, 10, 3, 60, 2, 6 $$;

-- ── 댓글 점수 하루 상한 ─────────────────────────────────────────────────────
-- 카운터 컬럼(additive). 글쓰기의 post_points_today/date 와 같은 문법으로 맞춘다.
alter table public.profiles
  add column if not exists comment_points_today int  not null default 0,
  add column if not exists comment_points_date  date;

create or replace function public.award_comment_points()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_own   boolean := false;
  v_date  date;
  v_today int;
  v_kst   date := (now() at time zone 'Asia/Seoul')::date;
begin
  if new.user_id is null then
    return new;
  end if;

  -- 자기 매장·자기 대회 글에 다는 댓글은 원래도 점수를 주지 않았다(자문자답 방지). 그대로 유지.
  if new.venue_id is not null then
    select exists(
      select 1 from public.venues v
      where v.id = new.venue_id and v.owner_id = new.user_id
    ) into v_own;
  end if;

  if not v_own and new.schedule_id is not null then
    select exists(
      select 1 from public.schedules s
      where s.id = new.schedule_id and s.owner_id = new.user_id
    ) into v_own;
  end if;

  if v_own then
    return new;
  end if;

  select comment_points_date, comment_points_today
    into v_date, v_today
  from public.profiles where id = new.user_id;

  -- 날짜가 바뀌었으면 오늘 카운터를 0 으로 본다(KST 기준 — 글쓰기와 동일).
  if v_date is distinct from v_kst then
    v_today := 0;
  end if;

  -- 하루 10점(=댓글 10개). 넘어가면 날짜만 갱신하고 점수는 주지 않는다.
  -- 카운터를 남기므로 댓글을 지웠다 다시 써도 상한이 되살아나지 않는다.
  if coalesce(v_today, 0) < 10 then
    update public.profiles
       set activity_points      = coalesce(activity_points, 0) + 1,
           comment_points_today = coalesce(v_today, 0) + 1,
           comment_points_date  = v_kst
     where id = new.user_id;
  else
    update public.profiles
       set comment_points_date = v_kst
     where id = new.user_id;
  end if;

  return new;
end;
$$;
