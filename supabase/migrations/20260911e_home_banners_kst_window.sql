-- 20260911e — 배너 게재 창을 서버 KST 로 판정한다 (UTC current_date 로 하루 9시간이 어긋나 있었다)
--
-- 근본 원인
--   20260904g 가 만든 공개 읽기 정책이 `current_date` 를 쓴다. Supabase 의 서버 TimeZone 은 UTC 라
--   **한국시간 00:00~08:59 동안 current_date 는 전날**이다. 그 9시간(하루의 ⅜) 동안:
--     · 오늘 시작하는 배너 → starts_at(오늘 KST) <= 전날(UTC) 가 거짓 → 아직 안 보인다
--     · 어제 끝난 배너     → ends_at(어제 KST) >= 전날(UTC) 가 참   → 아직 안 내려간다
--   즉 예약 배너는 늦게 뜨고 만료 배너는 늦게 내려간다. 오류도 경고도 없이 조용히 어긋난다.
--   업주가 '오늘부터'로 예약해 두고 아침에 홈을 열면 배너가 없다 — 등록이 안 된 걸로 보인다.
--
-- 왜 서버가 문제인가 (클라이언트는 이미 맞았다)
--   src/api/homeBanners.ts 의 homeBannerFeed 는 KST 로 같은 조건을 한 번 더 건다(방어 2겹).
--   그래서 **서버가 안 준 행은 클라이언트가 되살릴 수 없다.** 두 겹의 기준이 갈리면 좁은 쪽이 이긴다.
--   이 파일은 서버를 클라이언트와 같은 기준으로 맞춘다. (같은 커밋에서 클라이언트도 lib/kst.ts 의
--   kstToday() 를 쓰도록 바꿔 '기기 로컬 날짜'라는 세 번째 기준을 없앤다.)
--
-- 같은 버그를 한 번 고친 적이 있다
--   20260818f_ledger_business_day_and_close_seal.sql — venue_today_games 의 UTC current_date 를 영업일로 통일하고,
--   335줄에 '여전히 UTC current_date 면 중단' 자가검사를 남겼다. 이 파일도 같은 방식으로 스스로를 검사한다.
--   저장소 관행은 `(now() at time zone 'Asia/Seoul')::date` 다(migrations 수십 곳).
--
-- 일부러 바꾸지 않는 것
--   · home_banners_read_admin — 날짜 조건이 없다. 관리자는 예약·만료 배너를 봐야 관리가 된다.
--   · purge_expired_home_banners (20260904b:67, `ends_at < current_date - interval '7 days'`)
--     7일 유예가 있어 9시간 오차가 판정을 뒤집지 못한다. 여기서 함께 손대면 CREATE OR REPLACE 로
--     ACL 이 초기화되는 위험만 지고 얻는 게 없다. 노출을 끊는 건 이 정책이지 그 정리 함수가 아니다.
--   · 컬럼·데이터·인덱스 — 이 파일은 정책 하나만 바꾼다. 기존 행에 0px 영향.
--
-- 롤백:
--   drop policy if exists home_banners_read_public on public.home_banners;
--   create policy home_banners_read_public on public.home_banners
--     for select to anon, authenticated
--     using (active and coalesce(btrim(image_url), '') <> ''
--            and (starts_at is null or starts_at <= current_date)
--            and (ends_at   is null or ends_at   >= current_date));

drop policy if exists home_banners_read_public on public.home_banners;

create policy home_banners_read_public on public.home_banners
  for select to anon, authenticated
  using (
    active
    and coalesce(btrim(image_url), '') <> ''
    and (starts_at is null or starts_at <= (now() at time zone 'Asia/Seoul')::date)
    and (ends_at   is null or ends_at   >= (now() at time zone 'Asia/Seoul')::date)
  );

comment on policy home_banners_read_public on public.home_banners is
  '공개 읽기 = 게재 중인 배너만. 날짜는 KST(Asia/Seoul) — UTC current_date 는 한국 오전 9시까지 전날이라 예약 배너가 늦게 떴다(20260911e).';

-- ── 적용 검증 ──
-- 정책이 실제로 KST 로 바뀌었는지 스스로 확인하고, 아니면 트랜잭션을 중단한다.
-- (pg_policies.qual 은 파싱된 식을 다시 문자열로 푼 것이라, AT TIME ZONE 이 timezone('Asia/Seoul', ...) 로
--  풀리는 버전에서도 'Asia/Seoul' 리터럴은 그대로 남는다 — 두 표기 모두에서 이 검사가 성립한다.)
do $$
declare v_src text;
begin
  select qual into v_src
    from pg_policies
   where schemaname = 'public' and tablename = 'home_banners' and policyname = 'home_banners_read_public';

  if v_src is null then
    raise exception 'ABORT: home_banners_read_public 정책이 만들어지지 않았다';
  end if;
  if v_src not like '%Asia/Seoul%' then
    raise exception 'ABORT: home_banners_read_public 이 KST 를 안 쓴다 — %', v_src;
  end if;
  if upper(v_src) like '%CURRENT_DATE%' then
    raise exception 'ABORT: home_banners_read_public 에 UTC current_date 가 남아 있다 — %', v_src;
  end if;

  -- 관리자 정책이 이 파일 때문에 사라지지 않았는지도 같이 본다(둘 다 있어야 관리 화면이 전량을 본다).
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'home_banners' and policyname = 'home_banners_read_admin'
  ) then
    raise exception 'ABORT: home_banners_read_admin 정책이 사라졌다 — 관리자가 예약·만료 배너를 못 본다';
  end if;
end $$;

notify pgrst, 'reload schema';
