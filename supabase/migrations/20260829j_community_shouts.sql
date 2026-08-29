-- 20260829h — 오너 #8: 커뮤니티 '외치기'(활동점수로 사는 짧은 강조 메시지).
--
-- ── 왜 activity_points 를 직접 깎지 않는가 (중요) ─────────────────────────────
--   activity_points 는 **등급(2·3~KK·AA)과 활동 순위, 그리고 상점 마크 해금의 기준**이다.
--   여기서 차감하면 외치기를 살 때마다 등급이 내려가고, 이미 해금해 장착 중이던 마크가
--   'pts >= need' 조건에서 탈락해 잠긴다(=산 것을 빼앗김). 그건 새 버그를 만드는 설계다.
--   그래서 누적 점수는 그대로 두고 **spent_points(사용한 점수)** 를 따로 쌓는다.
--     · 사용 가능 점수 = activity_points - spent_points   ← 외치기가 깎는 값
--     · 등급·순위·마크 해금 = activity_points(누적)        ← 불변
--   마일리지의 '누적/가용' 분리와 같은 구조이고, 되돌릴 수 있다(spent_points 를 줄이면 환급).
alter table public.profiles
  add column if not exists spent_points int not null default 0;

comment on column public.profiles.spent_points is
  '외치기 등 소비에 쓴 활동점수 누계. 사용 가능 점수 = activity_points - spent_points. 등급/순위는 activity_points(누적)만 본다.';

-- ── 외침 테이블 ──────────────────────────────────────────────────────────────
create table if not exists public.community_shouts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  nickname   text not null,                 -- 게시 시점 닉네임(비정규화 — 조인 없이 렌더)
  message    text not null,
  cost       int  not null,                 -- 실제 차감된 점수(가격이 바뀌어도 과거 기록 보존)
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  hidden     boolean not null default false,
  hidden_by  uuid,
  hidden_at  timestamptz
);

comment on table public.community_shouts is
  '활동점수로 구매한 커뮤니티 강조 메시지. 생성은 buy_shout() RPC 로만(차감·게시가 한 트랜잭션).';

create index if not exists community_shouts_live_idx
  on public.community_shouts (expires_at desc) where hidden = false;
create index if not exists community_shouts_user_recent_idx
  on public.community_shouts (user_id, created_at desc);

alter table public.community_shouts enable row level security;

-- 읽기: 살아있는 외침은 누구나. 내 것과 운영자는 만료·숨김도 볼 수 있다(내역 확인용).
drop policy if exists shouts_read on public.community_shouts;
create policy shouts_read on public.community_shouts
  for select to anon, authenticated
  using (
    (hidden = false and expires_at > now())
    or user_id = (select auth.uid())
    or public.my_role() = 'admin'
  );

-- 쓰기: INSERT 정책을 아예 두지 않는다 → 테이블 직접 삽입 불가, buy_shout() 만이 유일한 경로.
--   (차감 없이 외침만 꽂는 우회로를 원천 차단)
drop policy if exists shouts_hide on public.community_shouts;
create policy shouts_hide on public.community_shouts
  for update to authenticated
  using (user_id = (select auth.uid()) or public.my_role() = 'admin')
  with check (user_id = (select auth.uid()) or public.my_role() = 'admin');

-- ── 규칙 상수 — 서버가 단일 출처. 클라이언트는 읽어서 '가격 표시'만 한다 ──────
create or replace function public.shout_rules()
returns table(cost int, cooldown_minutes int, daily_cap int, max_len int, min_len int, ttl_hours int)
language sql immutable
set search_path to 'public', 'pg_temp'
as $fn$ select 30, 10, 3, 60, 2, 6 $fn$;

comment on function public.shout_rules() is
  '외치기 규칙의 단일 정의(가격 30점·쿨다운 10분·하루 3회·2~60자·6시간 노출). 바꾸려면 여기만 바꾼다.';

-- ── 금칙어 — src/lib/content-filter.ts 의 BLOCKED_PATTERNS 와 같은 카테고리 ──
--   클라이언트 filterContent() 로 먼저 막지만 그건 UX 용이다(개발자도구로 우회 가능).
--   외침은 커뮤니티 최상단에 크게 뜨는 자리라 **서버가 최종 판정**한다.
--   외치기 전용으로 링크(http/www)를 추가 차단한다 — 강조 배너 + 외부 링크 = 스팸 벡터.
create or replace function public.shout_blocked(p_text text)
returns boolean language sql immutable
set search_path to 'public', 'pg_temp'
as $fn$
  select coalesce(p_text, '') ~* '현금화|현금\s*교환|칩\s*환전|환전\s*칩|gp\s*환전|환전\s*gp|시드\s*현금|현금\s*시드'
      or coalesce(p_text, '') ~* '칩\s*(직|판)매|칩\s*구매|칩\s*삽니다|칩\s*팝니다|칩\s*거래|칩\s*살게|칩\s*팔게|게임\s*머니\s*거래'
      or coalesce(p_text, '') ~* '불법\s*카지노|사설\s*도박|토토\s*환전|배팅\s*사이트|먹튀|총판\s*모집|도박\s*사이트'
      or coalesce(p_text, '') ~* '대리\s*게임|대리\s*참가|대리\s*플레이|대리\s*바이인|대신\s*플레이|게임\s*대행'
      or coalesce(p_text, '') ~  '[0-9]{3,6}-[0-9]{2,6}-[0-9]{4,8}'
      or coalesce(p_text, '') ~* 'https?://|www\.'
$fn$;

-- ── 구매 = 차감 + 게시 (한 트랜잭션 · 프로필 행 잠금으로 중복 클릭 직렬화) ────
create or replace function public.buy_shout(p_message text)
returns public.community_shouts
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid   uuid := (select auth.uid());
  v_r     record;
  v_msg   text;
  v_nick  text;
  v_status text;
  v_points int;
  v_spent  int;
  v_row   public.community_shouts;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  select * into v_r from public.shout_rules();

  -- 1) 정규화 + 길이 (연속 공백/줄바꿈을 한 칸으로 접어 '한 줄' 보장)
  v_msg := btrim(regexp_replace(coalesce(p_message, ''), '\s+', ' ', 'g'));
  if char_length(v_msg) < v_r.min_len then
    raise exception '외침은 %자 이상 써 주세요', v_r.min_len;
  end if;
  if char_length(v_msg) > v_r.max_len then
    raise exception '외침은 %자까지 쓸 수 있어요', v_r.max_len;
  end if;

  -- 2) 금칙어(서버 최종 판정)
  if public.shout_blocked(v_msg) then
    raise exception '게시할 수 없는 표현이나 링크가 들어 있어요';
  end if;

  -- 3) 계정 상태 + 잔액 조회 — **행 잠금**. 이 아래 검사는 모두 잠금 뒤라
  --    같은 사람의 동시 요청(더블탭)은 줄을 서고, 뒤 요청은 앞 요청의 결과를 보게 된다.
  select coalesce(p.nickname, p.name, '회원'), coalesce(p.status::text, 'active'),
         coalesce(p.activity_points, 0), coalesce(p.spent_points, 0)
    into v_nick, v_status, v_points, v_spent
  from public.profiles p where p.id = v_uid for update;
  if not found then raise exception '프로필을 찾을 수 없습니다'; end if;
  if v_status <> 'active' then raise exception '제재 중인 계정은 외치기를 쓸 수 없습니다'; end if;

  -- 4) 도배 방지 — 쿨다운 + 하루 상한(잠금 이후 검사라 중복 클릭이 뚫지 못한다)
  if exists (
    select 1 from public.community_shouts s
     where s.user_id = v_uid
       and s.created_at > now() - (v_r.cooldown_minutes || ' minutes')::interval
  ) then
    raise exception '외치기는 %분에 한 번만 쓸 수 있어요', v_r.cooldown_minutes;
  end if;
  if (
    select count(*) from public.community_shouts s
     where s.user_id = v_uid and s.created_at > now() - interval '24 hours'
  ) >= v_r.daily_cap then
    raise exception '하루 %번까지만 외칠 수 있어요', v_r.daily_cap;
  end if;

  -- 5) 잔액 확인 → 차감 → 게시 (같은 트랜잭션: 하나라도 실패하면 전부 없던 일)
  if v_points - v_spent < v_r.cost then
    raise exception '활동점수가 부족해요 (필요 %점 · 사용 가능 %점)', v_r.cost, v_points - v_spent;
  end if;
  update public.profiles
     set spent_points = coalesce(spent_points, 0) + v_r.cost
   where id = v_uid;
  insert into public.community_shouts(user_id, nickname, message, cost, expires_at)
  values (v_uid, v_nick, v_msg, v_r.cost, now() + (v_r.ttl_hours || ' hours')::interval)
  returning * into v_row;
  return v_row;
end $fn$;

comment on function public.buy_shout(text) is
  '외치기 구매 — 길이·금칙어·쿨다운·하루 상한·잔액을 모두 통과해야 차감+게시가 함께 일어난다.';

-- ── 내리기(숨김) — 작성자 본인 또는 운영자. 환급은 없다(구매 확정) ───────────
create or replace function public.hide_shout(p_id uuid)
returns void
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare v_uid uuid := (select auth.uid()); v_owner uuid;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  select user_id into v_owner from public.community_shouts where id = p_id;
  if v_owner is null then raise exception '이미 없는 외침입니다'; end if;
  if v_owner <> v_uid and public.my_role() <> 'admin' then
    raise exception '권한이 없습니다';
  end if;
  update public.community_shouts
     set hidden = true, hidden_by = v_uid, hidden_at = now()
   where id = p_id and hidden = false;
end $fn$;

-- ── 잔액 조회 — 사용 가능 / 누적 ─────────────────────────────────────────────
create or replace function public.my_point_balance()
returns table(total int, spent int, available int)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select coalesce(p.activity_points, 0),
         coalesce(p.spent_points, 0),
         greatest(0, coalesce(p.activity_points, 0) - coalesce(p.spent_points, 0))
  from public.profiles p where p.id = (select auth.uid());
$fn$;

-- ── ACL — authenticated/service_role 만 (anon·PUBLIC 회수) ───────────────────
revoke all on function public.shout_rules()        from public, anon, authenticated;
revoke all on function public.shout_blocked(text)  from public, anon, authenticated;
revoke all on function public.buy_shout(text)      from public, anon, authenticated;
revoke all on function public.hide_shout(uuid)     from public, anon, authenticated;
revoke all on function public.my_point_balance()   from public, anon, authenticated;

grant execute on function public.shout_rules()       to authenticated, service_role;
grant execute on function public.buy_shout(text)     to authenticated, service_role;
grant execute on function public.hide_shout(uuid)    to authenticated, service_role;
grant execute on function public.my_point_balance()  to authenticated, service_role;
-- shout_blocked 는 내부 헬퍼(buy_shout 안에서만 호출) — 클라이언트에 열지 않는다
grant execute on function public.shout_blocked(text) to service_role;
