-- 20260829g — 오너 #10: 명예의 전당을 '관리자 설정에서 등록'할 수 있게.
--
-- 왜 자동 집계를 지우지 않는가:
--   현재 명예의 전당은 venue_rankings(매장이 올린 입상 기록)를 지난달 구간으로 집계해 TOP3 를 만든다.
--   그 집계는 매장이 순위를 안 올린 달에는 통째로 비고(오너 스크린샷의 '빈 문구만 덩그러니'가 그 상태),
--   오프라인 대회·특별 공로처럼 DB 밖에 있는 명예는 아예 담지 못한다.
--   그렇다고 자동 집계를 없애면 운영자가 **매달 손으로 채워야만** 화면이 살아난다 — 한 달만 걸러도
--   다시 빈 화면이다. 그래서 '수동 지정이 있으면 그것, 없으면 자동 집계'로 둔다.
--   운영 부담은 0으로 유지되고(안 건드리면 지금과 동일), 개입하고 싶은 달만 덮어쓰면 된다.
--
-- 노출 규칙(클라이언트 src/lib/hallOfFame.ts 와 같은 규칙):
--   대상 = '지난달' 기준. 지난달 이하의 period 중 **가장 최근에 등록된 기간**의 수동 행을 쓰고,
--   수동 행이 하나도 없으면 기존 자동 집계로 폴백한다.
--   (이번 달 period 로 미리 등록해 두면 다음 달 1일에 자동으로 걸린다)

create table if not exists public.hall_of_fame (
  id         bigserial primary key,
  period     text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),  -- 노출 기준 달 'YYYY-MM'
  rank       int  not null check (rank between 1 and 3),
  nickname   text not null check (char_length(btrim(nickname)) between 1 and 30),
  note       text check (note is null or char_length(note) <= 60),  -- 한 줄 소개(예: '○○ 인비테이셔널 우승')
  pts        int  not null default 0 check (pts  between 0 and 100000),
  wins       int  not null default 0 check (wins between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period, rank)
);

comment on table public.hall_of_fame is
  '운영자가 직접 등록하는 월간 명예의 전당 TOP3. 행이 있는 달은 자동 집계보다 우선한다.';

alter table public.hall_of_fame enable row level security;

-- 읽기는 전체 공개(랭킹 허브의 명예의 전당 보드)
drop policy if exists hof_read on public.hall_of_fame;
create policy hof_read on public.hall_of_fame
  for select to anon, authenticated using (true);

-- 쓰기는 운영자만 (기존 custom_missions 와 같은 문법)
drop policy if exists hof_admin_write on public.hall_of_fame;
create policy hof_admin_write on public.hall_of_fame
  for all to authenticated
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');

-- updated_at 자동 갱신
create or replace function public.hall_of_fame_touch()
returns trigger language plpgsql
set search_path to 'public', 'pg_temp'
as $fn$ begin new.updated_at := now(); return new; end $fn$;

drop trigger if exists hall_of_fame_touch_trg on public.hall_of_fame;
create trigger hall_of_fame_touch_trg before update on public.hall_of_fame
  for each row execute function public.hall_of_fame_touch();

revoke all on function public.hall_of_fame_touch() from public, anon, authenticated;
