-- 20260904c — 유저 캘린더(오너 지시 2026-09-04):
--   "하단 메뉴바 맨 오른쪽에 캘린더 — 본인이 예약한 게임, 찜한 게임, 머니인 기록, 바이인 기록 +
--    수기로 본인 뱅크롤을 플러스 마이너스로 기록"
--
-- 파이프라인 위치: **예약 → 방문 → 바인/장부 → 순위** 의 *유저 쪽 거울*.
--   새로 만드는 건 3개뿐이고 나머지는 사슬 위쪽에서 이미 나오는 값을 끌어쓴다:
--     · 예약   = getMyReservations()        (reservations.ts, 그대로)
--     · 머니인 = getMyRankingHistory()      (rankings.ts, 입상 기록 — 그대로)
--     · 바이인 = §2 my_buyin_history()      (신규 — 기존 my_play_history 는 매장별 '집계'라 날짜가 없다)
--     · 찜     = §1 schedule_likes          (신규 — 기존 찜은 장터 매물·매장 팔로우뿐, 게임 단위가 없다)
--     · 뱅크롤 = §3 bankroll_entries        (신규 — 앱에 뱅크롤 '계산기'만 있고 기록은 전무)
--
-- 롤백:
--   drop function if exists public.my_buyin_history(integer);
--   drop table if exists public.bankroll_entries;
--   drop table if exists public.schedule_likes;

-- ── §1 게임 찜 ───────────────────────────────────────────────────────────────
create table if not exists public.schedule_likes (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, schedule_id)
);
comment on table public.schedule_likes is
  '유저가 찜한 대회. 본인 행만 읽고 쓴다(집계·타인 조회 용도 아님 — 그래서 공개 read 정책을 두지 않는다).';
create index if not exists schedule_likes_user_idx on public.schedule_likes (user_id, created_at desc);

alter table public.schedule_likes enable row level security;
-- 본인 행 전용 — select/insert/delete 모두 auth.uid() 일치. RPC 없이 클라이언트가 직접 토글한다
-- (RLS 가 이미 정확히 '본인 것만'을 강제하므로 SECURITY DEFINER 함수를 하나 더 둘 이유가 없다).
drop policy if exists schedule_likes_own on public.schedule_likes;
create policy schedule_likes_own on public.schedule_likes
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── §2 내 바이인 기록(행 단위) ────────────────────────────────────────────────
-- 기존 my_play_history() 는 **매장별 집계**(횟수·합계)라 캘린더에 찍을 날짜가 없다.
-- 그 함수를 고치면 대시보드 집계 화면이 깨지므로 **새 함수를 추가**한다.
-- 이름 매칭 규칙은 my_play_history 와 **동일**해야 한다 — 다르면 같은 유저의 두 화면 숫자가 어긋난다.
-- (ledger_buyins 에는 user_id 가 없다. 장부는 매장 직원이 손으로 적는 표라 이름이 유일한 연결고리다.)
create or replace function public.my_buyin_history(p_limit integer default 200)
returns table (
  session_date date, venue_id uuid, venue_name text,
  title text, entry_no integer, amount bigint, buyin_at timestamptz
)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with me as (
    select coalesce(real_name,'') rn, coalesce(nickname,'') nk, coalesce(name,'') nm
    from public.profiles where id = auth.uid()
  )
  select b.session_date, b.venue_id, v.name,
         coalesce(s.title, ''), b.entry_no,
         (coalesce(b.cash_amount,0)+coalesce(b.card_amount,0)+coalesce(b.transfer_amount,0)+coalesce(b.unpaid_amount,0))::bigint,
         b.buyin_at
  from public.ledger_buyins b
  cross join me
  left join public.venues v on v.id = b.venue_id
  left join public.ledger_sessions s
         on s.venue_id = b.venue_id and s.session_date = b.session_date and s.game_seq = b.game_seq
  where (me.rn <> '' and btrim(b.player_name) = me.rn)
     or (me.nk <> '' and btrim(b.player_name) = me.nk)
     or (me.nm <> '' and btrim(b.player_name) = me.nm)
  order by b.session_date desc, b.buyin_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$function$;
comment on function public.my_buyin_history(integer) is
  '본인 바이인 기록(행 단위). 매칭 규칙은 my_play_history 와 동일(real_name/nickname/name). 상한 500.';
-- ACL 표준: CREATE OR REPLACE 는 기본 GRANT 를 되돌린다. 읽기 전용이지만 **로그인 사용자 전용**이다
-- (auth.uid() 가 null 이면 me 가 빈 문자열이라 어차피 0행이지만, anon 에 열어 둘 이유가 없다).
revoke execute on function public.my_buyin_history(integer) from public, anon;
grant  execute on function public.my_buyin_history(integer) to authenticated;

-- ── §3 수기 뱅크롤 ───────────────────────────────────────────────────────────
-- 앱에는 뱅크롤 '계산기'(StackCalcs)만 있고 기록은 전무했다. 자동 집계(바이인·입상)와 별개로
-- 유저가 직접 +/- 를 적는 장부다 — 자동으로 못 잡는 현금 게임·타 매장 결과를 담는다.
create table if not exists public.bankroll_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  entry_date date not null default current_date,
  amount     integer not null,                 -- 음수 = 마이너스. 0 은 의미가 없어 아래 CHECK 로 막는다
  memo       text not null default '',
  created_at timestamptz not null default now(),
  constraint bankroll_amount_nonzero check (amount <> 0)
);
comment on table public.bankroll_entries is
  '유저 수기 뱅크롤 기록(+/-). 본인 행만. 자동 집계(my_buyin_history·랭킹)와 합산하지 않고 나란히 보여준다.';
create index if not exists bankroll_entries_user_idx on public.bankroll_entries (user_id, entry_date desc, created_at desc);

alter table public.bankroll_entries enable row level security;
drop policy if exists bankroll_entries_own on public.bankroll_entries;
create policy bankroll_entries_own on public.bankroll_entries
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
