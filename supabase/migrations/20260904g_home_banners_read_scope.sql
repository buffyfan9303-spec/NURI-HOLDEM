-- 20260904g — home_banners 읽기 정책을 '게재 중인 것'으로 좁힌다
--
-- 지적(2026-09-04 리뷰): 정책이 `using (true)` 라, 아직 시작 전(예약)·꺼짐·만료된 배너의
--   제목·부제·링크가 anon 키만 있으면 그대로 조회된다. 배너 문구에는 미공개 대회명·오픈 일정 같은
--   **아직 알리면 안 되는 정보**가 들어가기 마련이다(예약 기능을 둔 이유가 정확히 그것이다).
--
-- 처방: 공개 읽기는 getActiveHomeBanners 와 **같은 조건**만 통과시킨다. 관리자는 별도 정책으로 전량.
--   클라이언트 필터는 그대로 두되 이제 서버가 먼저 막는다(방어 2겹).
--
-- 합성 검증(트랜잭션 롤백): 내일 시작하는 '예약' 배너를 심고 —
--   anon 2건(게재중만) · admin 3건(예약 포함) = PASS.
--   ⚠ 검증 시 관리자 id 는 권한 컨텍스트를 바꾸기 **전에** 뽑아야 한다(바꾼 뒤엔 profiles RLS 에 막혀 null).
--
-- 롤백:
--   drop policy if exists home_banners_read_public on public.home_banners;
--   drop policy if exists home_banners_read_admin  on public.home_banners;
--   create policy home_banners_read on public.home_banners for select to anon, authenticated using (true);

drop policy if exists home_banners_read on public.home_banners;

create policy home_banners_read_public on public.home_banners
  for select to anon, authenticated
  using (
    active
    and coalesce(btrim(image_url), '') <> ''
    and (starts_at is null or starts_at <= current_date)
    and (ends_at   is null or ends_at   >= current_date)
  );

create policy home_banners_read_admin on public.home_banners
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

notify pgrst, 'reload schema';
