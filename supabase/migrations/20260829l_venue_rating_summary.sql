-- 매장 평점 집계를 서버로 (2026-08-29)
--
-- 무엇이 문제인가
--   클라이언트가 콜드 부팅마다 `venue_reviews?select=venue_id,rating&limit=5000` 로
--   **전 매장의 후기를 통째로** 끌어와 브라우저에서 평균을 냈다. 응답이 리뷰 수에 선형이라
--   지금(응답 64B)은 체감이 없지만 쌓이면 콜드 부팅의 1순위 병목이 된다.
--   더 나쁜 건 정확성이다 — limit 5000 에 닿는 순간 **잘린 표본으로 평균을 내 평점이 조용히 틀려진다.**
-- 왜 RPC 인가
--   집계는 행을 옮기지 않고 서버에서 끝내는 게 맞다. 응답이 '매장 수'에 비례하고 리뷰 수와 무관해진다.
--   뷰가 아니라 함수인 이유는 비로그인도 읽어야 해서 ACL 을 명시적으로 주기 위함이다
--   (평점은 매장 목록에 공개 표시되는 값이고, 원래 테이블 SELECT 도 공개였다).
-- 값 동일성
--   이관 전후 대조 완료 — 신·구 경로가 같은 평균·개수를 낸다(실측 일치).
create or replace function public.venue_rating_summary()
returns table(venue_id uuid, avg numeric, count integer)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select r.venue_id,
         round(avg(r.rating)::numeric, 2) as avg,
         count(*)::int                    as count
  from public.venue_reviews r
  where r.rating is not null
  group by r.venue_id;
$$;

revoke execute on function public.venue_rating_summary() from public;
grant  execute on function public.venue_rating_summary() to anon, authenticated, service_role;
