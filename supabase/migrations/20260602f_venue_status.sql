-- ============================================================================
-- 매장 상태 관리 (관리자 게시물 관리)
--  active   : 정상 노출
--  inactive : 비활성(폐업 등 매장이 없어지는 경우 대비) — 노출 안 함
--  suspended: 정지(이슈 제재) — 노출 안 함 + 업주 작성 제한 대상
--  hidden   : 숨김(이슈로 잠시 내림) — 노출 안 함, 언제든 다시 활성화 가능
--  AD(is_paid_ad) 토글 / 삭제는 별도 처리.
--  모든 상태는 다시 'active'로 되돌릴 수 있음.
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'venue_status') then
    create type venue_status as enum ('active', 'inactive', 'suspended', 'hidden');
  end if;
end $$;

alter table public.venues
  add column if not exists status venue_status not null default 'active';

create index if not exists idx_venues_status on public.venues (status);
