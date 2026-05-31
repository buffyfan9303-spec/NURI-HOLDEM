-- 매장(venues) 노출 순서 컬럼 추가
-- 관리자 '노출 순서' 설정에서 매장을 드래그로 재정렬할 수 있도록 display_order 도입.
-- 기본값 999 → 미설정 매장은 뒤로 정렬되고, 그 안에서 유료광고/팔로워순 보조 정렬.

alter table public.venues
  add column if not exists display_order int not null default 999;

create index if not exists idx_venues_display_order on public.venues(display_order);
