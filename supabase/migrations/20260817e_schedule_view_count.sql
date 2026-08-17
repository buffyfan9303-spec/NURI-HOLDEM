-- 포스터 조회수 — 업주 성과 대시보드의 최소 단위('왜 예약이 없는지'의 첫 지표).
-- 커뮤니티 게시글 view_count 와 동일 사상. 클라이언트가 세션당 1회만 호출(중복 가드).
-- (라이브 적용: schedule_view_count) 비로그인 열람도 집계하므로 anon 실행 허용 — 의도된 공개 RPC.
alter table public.schedules add column if not exists view_count integer not null default 0;

create or replace function public.bump_schedule_view(p_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.schedules set view_count = view_count + 1 where id = p_id and approved = true;
$$;
revoke all on function public.bump_schedule_view(uuid) from public;
grant execute on function public.bump_schedule_view(uuid) to anon, authenticated, service_role;
