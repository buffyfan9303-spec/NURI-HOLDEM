-- 20260904d — my_buyin_history 동명이인 fail-closed 가드
--
-- 왜: ledger_buyins 에는 user_id 가 없다(장부는 매장 직원이 손으로 적는 표라 이름이 유일한 연결고리).
--   그래서 my_buyin_history 는 profiles 의 real_name/nickname/name 문자열로 매칭하는데,
--   **한 이름을 두 회원이 쓰면 남의 참가비 기록이 그대로 보인다.**
--   20260904c 로 넣은 이 함수는 행 단위(날짜·매장·금액·엔트리)라 기존 my_play_history(매장별 집계)보다
--   노출 폭이 훨씬 크다 — 같은 매칭 방식을 물려받은 게 문제였다.
--
-- 실측(2026-09-04 프로덕션): 회원 7명 중 이미 교차 충돌이 존재한다 —
--   A 의 real_name '나누리' == B 의 nickname '나누리'. 오늘은 그 문자열이 장부에 없어 터지지 않을 뿐이고,
--   한국 이름 특성상 회원이 늘면 동명이인은 확률이 아니라 시간 문제다.
--
-- 처방: 내 이름 중 **다른 회원과 겹치는 것**이 있으면 그 이름으로 적힌 행을 통째로 제외한다.
--   누락은 유저가 이름을 정리하면 복구되지만, 남의 참가비 금액을 보여준 것은 되돌릴 수 없다.
--
-- 합성 검증(트랜잭션 안에서 동명이인을 만들고 롤백):
--   이름='누리홀덤' · 동명이인 전 5건 → 후 0건 → PASS.
--
-- 남은 과제(별건): 같은 결함이 **기존** my_play_history 에도 있다(집계라 노출은 작지만 원인은 동일).
--   근본 해결은 장부에 user_id 를 붙이는 것 — 순위 입력의 회원 대조(find_user_for_transfer) 선례가 있다.
--
-- 롤백: 20260904c 의 my_buyin_history 정의(가드 없는 판)로 CREATE OR REPLACE 후 ACL 재부여.

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
  ),
  my_names as (
    select distinct x as n from me, unnest(array[me.rn, me.nk, me.nm]) as x where x <> ''
  ),
  -- 내 이름 중 '나 말고도 다른 회원이 쓰는' 것. 그 이름으로 적힌 장부 행은 누구 것인지 모른다.
  ambiguous as (
    select m.n from my_names m
    where (
      select count(*) from public.profiles p
      where nullif(btrim(coalesce(p.real_name,'')),'') = m.n
         or nullif(btrim(coalesce(p.nickname ,'')),'') = m.n
         or nullif(btrim(coalesce(p.name     ,'')),'') = m.n
    ) > 1
  )
  select b.session_date, b.venue_id, v.name,
         coalesce(s.title, ''), b.entry_no,
         (coalesce(b.cash_amount,0)+coalesce(b.card_amount,0)+coalesce(b.transfer_amount,0)+coalesce(b.unpaid_amount,0))::bigint,
         b.buyin_at
  from public.ledger_buyins b
  join my_names mn on mn.n = btrim(b.player_name)
  left join public.venues v on v.id = b.venue_id
  left join public.ledger_sessions s
         on s.venue_id = b.venue_id and s.session_date = b.session_date and s.game_seq = b.game_seq
  where not exists (select 1 from ambiguous a where a.n = mn.n)
  order by b.session_date desc, b.buyin_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$function$;

comment on function public.my_buyin_history(integer) is
  '본인 바이인 기록(행 단위). ledger_buyins 에 user_id 가 없어 real_name/nickname/name 문자열로 매칭한다. '
  '⚠ 내 이름 중 다른 회원과 겹치는 것이 있으면 그 이름의 행은 통째로 제외한다(동명이인 fail-closed) — '
  '누락은 복구 가능하지만 남의 참가비 노출은 복구 불가. 상한 500.';

revoke execute on function public.my_buyin_history(integer) from public, anon;
grant  execute on function public.my_buyin_history(integer) to authenticated;

notify pgrst, 'reload schema';
