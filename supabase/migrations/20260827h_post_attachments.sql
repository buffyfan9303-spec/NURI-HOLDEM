-- ============================================================================
-- 게시글 어태치먼트 (핸드 카드 / 투표) — 오너 제공 패키지 v2 의 정합 수정판
--
-- 원본 대비 수정(Phase 0 실측 근거):
--  * posts → community_posts, author_id → user_id (실제 스키마)
--  * cards 형식 CHECK 의 서브쿼리 → 52장 리터럴 배열 (Postgres 는 CHECK 에 서브쿼리 불허)
--  * 읽기 정책 to authenticated → public (community_posts 의 posts_select 가
--    public/true — 비로그인 열람 서비스라 어태치먼트도 함께 보여야 함)
--  * 투표(쓰기)는 원본대로 authenticated + RPC 전용
-- ============================================================================

create table if not exists public.post_hands (
  post_id   uuid primary key references public.community_posts(id) on delete cascade,
  cards     text[],                                   -- NULL = 카드 미입력
  tone      text not null default 'win' check (tone in ('win','loss')),
  headline  text check (char_length(headline) <= 24),
  delta     text check (char_length(delta)    <= 16),
  meta      text check (char_length(meta)     <= 60),
  created_at timestamptz not null default now(),

  -- 홀덤 2장이 기본이되 오마하(PLO) 4장까지 허용 — 표시 컴포넌트가 장수별 팬 배치
  constraint post_hands_cards_len
    check (cards is null or array_length(cards, 1) between 1 and 4),
  constraint post_hands_cards_fmt
    check (cards is null or cards <@ array[
      'As','Ah','Ad','Ac','Ks','Kh','Kd','Kc','Qs','Qh','Qd','Qc','Js','Jh','Jd','Jc',
      'Ts','Th','Td','Tc','9s','9h','9d','9c','8s','8h','8d','8c','7s','7h','7d','7c',
      '6s','6h','6d','6c','5s','5h','5d','5c','4s','4h','4d','4c','3s','3h','3d','3c',
      '2s','2h','2d','2c']::text[]),
  constraint post_hands_not_empty
    check (cards is not null or headline is not null)
);

create table if not exists public.post_polls (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null unique references public.community_posts(id) on delete cascade,
  question   text not null check (char_length(question) between 1 and 120),
  closes_at  timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.post_poll_options (
  id      uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.post_polls(id) on delete cascade,
  idx     smallint not null check (idx between 0 and 5),
  label   text not null check (char_length(label) between 1 and 60),
  unique (poll_id, idx)
);

create table if not exists public.post_poll_votes (
  poll_id    uuid not null references public.post_polls(id) on delete cascade,
  option_id  uuid not null references public.post_poll_options(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)                      -- 1인 1표 강제
);

create index if not exists post_poll_votes_option_idx on public.post_poll_votes (option_id);

-- 집계 뷰(개별 투표자 비노출). security_invoker=false(기본) — votes 는 RLS 로 본인 행만
-- 보이지만 집계는 소유자 권한으로 전체 카운트를 내야 한다(의도된 설계).
create or replace view public.post_poll_results as
  select o.poll_id, o.id as option_id, o.idx, o.label, count(v.user_id)::int as votes
  from public.post_poll_options o
  left join public.post_poll_votes v on v.option_id = o.id
  group by o.poll_id, o.id, o.idx, o.label;

alter table public.post_hands        enable row level security;
alter table public.post_polls        enable row level security;
alter table public.post_poll_options enable row level security;
alter table public.post_poll_votes   enable row level security;

-- 읽기: 게시글과 동일하게 공개(비로그인 열람)
create policy post_hands_read   on public.post_hands        for select using (true);
create policy post_polls_read   on public.post_polls        for select using (true);
create policy post_options_read on public.post_poll_options for select using (true);

-- 쓰기: 게시글 작성자만
create policy post_hands_write on public.post_hands for all to authenticated
  using    (exists (select 1 from public.community_posts p where p.id = post_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.community_posts p where p.id = post_id and p.user_id = auth.uid()));

create policy post_polls_write on public.post_polls for all to authenticated
  using    (exists (select 1 from public.community_posts p where p.id = post_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.community_posts p where p.id = post_id and p.user_id = auth.uid()));

create policy post_options_write on public.post_poll_options for all to authenticated
  using (exists (
    select 1 from public.post_polls pl join public.community_posts p on p.id = pl.post_id
    where pl.id = poll_id and p.user_id = auth.uid()))
  with check (exists (
    select 1 from public.post_polls pl join public.community_posts p on p.id = pl.post_id
    where pl.id = poll_id and p.user_id = auth.uid()));

-- 표: 본인 것만 조회. 삽입은 RPC 로만(직접 INSERT 정책 없음)
create policy post_votes_read_self on public.post_poll_votes
  for select to authenticated using (user_id = auth.uid());

-- 원자적·멱등 투표 RPC (원본 시그니처 불변)
create or replace function public.cast_poll_vote(p_poll_id uuid, p_option_id uuid)
returns table (option_id uuid, idx smallint, label text, votes int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1 from post_poll_options o where o.id = p_option_id and o.poll_id = p_poll_id
  ) then
    raise exception 'OPTION_POLL_MISMATCH' using errcode = '22023';
  end if;

  if exists (
    select 1 from post_polls p
    where p.id = p_poll_id and p.closes_at is not null and p.closes_at <= now()
  ) then
    raise exception 'POLL_CLOSED' using errcode = '22023';
  end if;

  insert into post_poll_votes (poll_id, option_id, user_id)
  values (p_poll_id, p_option_id, v_user)
  on conflict (poll_id, user_id)
  do update set option_id = excluded.option_id, created_at = now();

  return query
    select r.option_id, r.idx, r.label, r.votes
    from post_poll_results r
    where r.poll_id = p_poll_id
    order by r.idx;
end;
$$;

revoke all on function public.cast_poll_vote(uuid, uuid) from public;
grant execute on function public.cast_poll_vote(uuid, uuid) to authenticated;
