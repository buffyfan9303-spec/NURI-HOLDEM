-- 20260904g — my_buyin_history 행 중복(모든 바이인이 두 번) 수정 + 라이브 정의 저장소 정착
--
-- 증상(2026-09-04 프로덕션 실측, 같은 트랜잭션에서 두 함수 대조):
--   회원 c8e3734d 기준 my_play_history() = 1행 · 5건 · 500,000  (정확)
--                    my_buyin_history(500) = 10행 · 1,000,000    (정확히 2배)
--   entry1~entry5 가 각각 두 번씩 나온다. 캘린더 탭(src/api/calendar.ts getMyBuyinHistory)이
--   이 RPC 를 쓰므로 유저 화면에 바이인이 두 줄씩 찍히고 합계가 두 배로 보인다.
--
-- 원인: `claimed_names` CTE 에서 `distinct` 가 빠졌다.
--   claimed_names as (select x as n from me, unnest(array[me.rn, me.nk, me.nm]) as x where x <> '')
--   이 CTE 는 '내 이름 집합'(멤버십 목록)이라 중복이 있으면 안 된다. profiles.real_name 과
--   profiles.name 이 같은 값이면 같은 이름이 두 번 방출되고,
--   `join claimed_names cn on cn.n = btrim(b.player_name)` 이 장부 한 행을 두 번 매칭한다.
--   실측: 이 회원의 claimed_names = '누리홀덤 , 나누리 , 누리홀덤' (3행 · distinct 면 2행).
--   20260904d 원본은 `select distinct x as n` 이었다 — 신뢰등급 2단(trusted/claimed)으로
--   재작성하는 과정에서 distinct 가 유실됐다.
--
-- 영향 범위: 현재 프로필 7명 중 **5명**이 real_name/nickname/name 중 겹치는 값을 가진다.
--   handle_new_user 가 name 과 nickname 을 같은 소스에서 만들기 때문에 이게 오히려 정상 상태다.
--   엣지 케이스가 아니라 다수 사례다.
--
-- ⚠ 이 파일은 **라이브 정의를 정본으로 옮긴 것**이다. 저장소의 20260904d 는 라이브보다 오래됐다
--   (라이브에는 trusted_names/claimed_names 신뢰등급 2단 + my_venues 범위 제한이 더 있다 —
--   '2026-09-04 리뷰 지적'으로 사칭 벡터를 막은 강화분). 20260904d 로 되돌리면 그 보안 강화가
--   통째로 사라진다. 그래서 pg_get_functiondef 로 뽑은 라이브 본문을 그대로 두고 distinct 한 단어만
--   되살렸다. 로직·반환 타입·컬럼명 전부 불변이며 **중복 행이 사라지는 것만** 달라진다.
--
-- 검증(라이브, 적용 후): 같은 회원 my_buyin_history(500) = 5행 · 500,000 →
--   my_play_history() 의 5건 · 500,000 과 일치.
--
-- 롤백: 아래 정의에서 claimed_names 의 `distinct` 를 지우고 CREATE OR REPLACE + ACL 재부여.
--   (단 그건 버그 상태로 되돌리는 것이므로 사실상 쓰지 않는다.)

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
    select coalesce(real_name,'') rn, coalesce(nickname,'') nk, coalesce(name,'') nm,
           (verified_at is not null) as verified
    from public.profiles where id = auth.uid()
  ),
  -- 신뢰 등급이 다른 두 부류의 이름.
  --  trusted : 본인확인으로 검증된 real_name — 내가 마음대로 바꿀 수 없다.
  --  claimed : nickname / name — 유저가 스스로 정하는 값이라 **남의 이름으로 바꿀 수 있다**(사칭 벡터).
  trusted_names as (
    select me.rn as n from me where me.verified and me.rn <> ''
  ),
  -- ⚠ distinct 필수 — 이건 '내 이름 집합'이다. real_name 과 name 이 같으면(가입 트리거가 둘을
  --   같은 소스에서 만들므로 흔하다) 중복 행이 생겨 아래 join 이 장부 한 행을 두 번 매칭한다.
  claimed_names as (
    select distinct x as n from me, unnest(array[me.rn, me.nk, me.nm]) as x where x <> ''
  ),
  -- 동명이인 fail-closed: 내 이름 중 다른 회원도 쓰는 것은 통째로 제외한다.
  ambiguous as (
    select c.n from claimed_names c
    where (
      select count(*) from public.profiles p
      where nullif(btrim(coalesce(p.real_name,'')),'') = c.n
         or nullif(btrim(coalesce(p.nickname ,'')),'') = c.n
         or nullif(btrim(coalesce(p.name     ,'')),'') = c.n
    ) > 1
  ),
  -- 내가 실제로 관계를 맺은 매장(체크인 또는 예약 이력). 사칭 이름으로 낚아채더라도
  -- '가 본 적 있는 매장'으로 범위가 좁혀진다.
  my_venues as (
    select c.venue_id from public.checkins c where c.user_id = auth.uid()
    union
    select s.venue_id from public.schedule_reservations r
      join public.schedules s on s.id = r.schedule_id
     where r.user_id = auth.uid() and s.venue_id is not null
  )
  select b.session_date, b.venue_id, v.name,
         coalesce(s.title, ''), b.entry_no,
         (coalesce(b.cash_amount,0)+coalesce(b.card_amount,0)+coalesce(b.transfer_amount,0)+coalesce(b.unpaid_amount,0))::bigint,
         b.buyin_at
  from public.ledger_buyins b
  join claimed_names cn on cn.n = btrim(b.player_name)
  left join public.venues v on v.id = b.venue_id
  left join public.ledger_sessions s
         on s.venue_id = b.venue_id and s.session_date = b.session_date and s.game_seq = b.game_seq
  where not exists (select 1 from ambiguous a where a.n = cn.n)
    and (
      -- 검증된 실명으로 매칭된 행은 그대로(본인확인이 신원을 보증한다)
      exists (select 1 from trusted_names t where t.n = cn.n)
      -- 그 외(유저가 정하는 닉네임·이름)는 **내가 가 본 매장**으로 한정한다.
      -- 장부에는 회원이 아닌 워크인 손님 이름도 적히므로, 이 조건이 없으면 닉네임을 그 이름으로
      -- 바꾸는 것만으로 남의 방문·금액 이력이 통째로 보인다(2026-09-04 리뷰 지적).
      or b.venue_id in (select venue_id from my_venues)
    )
  order by b.session_date desc, b.buyin_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$function$;

comment on function public.my_buyin_history(integer) is
  '본인 바이인 기록(행 단위). ledger_buyins 에 user_id 가 없어 real_name/nickname/name 문자열로 매칭한다. '
  '⚠ 이름 집합(claimed_names)은 반드시 distinct — 아니면 real_name=name 인 회원의 행이 중복된다. '
  '검증 실명은 그대로, 유저가 정하는 이름은 내가 가 본 매장으로 한정(사칭 차단). '
  '동명이인이면 그 이름의 행은 통째로 제외(fail-closed). 매칭 규칙은 my_play_history 와 동일. 상한 500.';

-- ACL 복원 — 적용 전 실측한 proacl 그대로: postgres(소유자) · authenticated · service_role.
revoke execute on function public.my_buyin_history(integer) from public, anon;
grant  execute on function public.my_buyin_history(integer) to authenticated, service_role;

notify pgrst, 'reload schema';
