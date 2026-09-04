-- 20260904f — my_buyin_history 사칭 차단(20260904d 의 동명이인 가드로는 부족했다)
--
-- 리뷰 지적(2026-09-04): SECURITY DEFINER 가 ledger_buyins 의 RLS(매장 스태프 전용)를 우회하는데,
--   게이트가 '유저가 스스로 정하는 이름 문자열'이다. profiles 의 세 값 중 본인확인으로 검증되는 것은
--   real_name 뿐이고 nickname·name 은 유저가 바꿀 수 있다(guard_profile_privileged_cols 보호 목록에 없음).
--   20260904d 의 동명이인 가드는 **프로필끼리의 충돌**만 막는다 — 장부에 적힌 이름이 어떤 프로필과도
--   매칭되지 않으면(워크인 손님) count=1 이라 통과한다.
--
-- 실측(프로덕션 2026-09-04): 장부의 distinct player_name 3개 중 **2개가 어떤 프로필과도 매칭 안 됨**
--   ('누리홀덤(나누리)', 'ㅇㅇ') → 닉네임을 그 문자열로 바꾸는 것만으로 그 사람의 방문일·매장·금액이
--   행 단위로 재구성된다. 본인확인 완료는 7명 중 1명뿐이라 '검증된 실명만' 으로 좁히면 기능이 죽는다.
--
-- 처방 — 3중 fail-closed:
--   ① 동명이인: 내 이름 중 다른 회원도 쓰는 것은 통째로 제외(20260904d 유지)
--   ② 사칭: 검증되지 않은 이름(nickname·name)으로 매칭된 행은 **내가 체크인·예약한 매장**으로 한정
--   ③ 검증된 real_name(verified_at is not null)은 매장 제한 없이 허용 — 본인확인이 신원을 보증한다
--
-- 합성 검증(트랜잭션 롤백):
--   · 미검증 계정이 워크인 이름 'ㅇㅇ' 을 닉네임으로 사칭 → 전 0건 / 후 0건 = PASS
--   · 정상 계정(본인확인 완료, 관계 매장 1곳) → 10건 그대로 = PASS(과잉 차단 없음)
--
-- 남은 과제(별건): 같은 결함이 my_play_history 에도 있다(집계라 노출 폭은 작다).
--   근본 해결은 장부에 user_id 를 붙이는 것 — 순위 입력의 회원 대조(find_user_for_transfer) 선례가 있다.
--
-- 롤백: 20260904d 의 정의로 CREATE OR REPLACE 후 ACL 재부여.

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
  trusted_names as (
    select me.rn as n from me where me.verified and me.rn <> ''
  ),
  claimed_names as (
    select x as n from me, unnest(array[me.rn, me.nk, me.nm]) as x where x <> ''
  ),
  ambiguous as (
    select c.n from claimed_names c
    where (
      select count(*) from public.profiles p
      where nullif(btrim(coalesce(p.real_name,'')),'') = c.n
         or nullif(btrim(coalesce(p.nickname ,'')),'') = c.n
         or nullif(btrim(coalesce(p.name     ,'')),'') = c.n
    ) > 1
  ),
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
      exists (select 1 from trusted_names t where t.n = cn.n)
      or b.venue_id in (select venue_id from my_venues)
    )
  order by b.session_date desc, b.buyin_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$function$;

comment on function public.my_buyin_history(integer) is
  '본인 바이인 기록(행 단위). ledger_buyins 에 user_id 가 없어 이름 문자열로 매칭한다. 3중 가드: '
  '① 동명이인(다른 회원과 겹치는 이름)은 통째로 제외 ② 검증되지 않은 이름(nickname/name)으로 매칭된 행은 '
  '내가 체크인·예약한 매장으로 한정 ③ 검증된 real_name(verified_at)만 매장 제한 없이 허용. '
  '누락은 복구 가능하지만 남의 참가비 노출은 복구 불가 — 전부 fail-closed.';

revoke execute on function public.my_buyin_history(integer) from public, anon;
grant  execute on function public.my_buyin_history(integer) to authenticated;

notify pgrst, 'reload schema';
