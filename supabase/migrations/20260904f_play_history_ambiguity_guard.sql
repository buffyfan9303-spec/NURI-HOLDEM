-- 20260904f — my_play_history 동명이인 fail-closed 가드 (20260904d 의 같은 처방을 기존 함수로 이관)
--
-- 왜: ledger_buyins 에는 user_id 가 없다(장부는 매장 직원이 손으로 적는 표라 player_name 문자열이
--   유일한 연결고리). my_play_history 는 profiles 의 real_name/nickname/name 3개와 btrim(player_name)
--   을 대조하는데, **한 이름을 두 회원이 쓰면 남의 바이인이 자기 이력에 섞인다.**
--   20260904d 가 신규 my_buyin_history(행 단위)에 가드를 넣을 때 남긴 '남은 과제'가 이것이다 —
--   집계라 노출 폭은 작지만(매장·횟수·합계·최근시각) 원인과 처방은 완전히 동일하다.
--
-- 실측(2026-09-04 프로덕션, 회원 7명): 이미 교차 충돌이 존재한다 —
--   한 계정의 real_name '나누리' 가 다른 계정의 nickname '나누리' 와 같다. 오늘은 그 문자열이
--   장부에 없어 터지지 않을 뿐이고, 한국 이름 특성상 회원이 늘면 동명이인은 확률이 아니라 시간 문제다.
--
-- 처방(20260904d 와 동일): 내 이름 중 **다른 회원과도 겹치는 것**이 있으면 그 이름으로 적힌 행을
--   통째로 제외한다. 누락은 유저가 이름을 정리하면 복구되지만, 남의 참가비 금액을 보여준 것은
--   되돌릴 수 없다 — 그래서 fail-closed 다.
--
-- 반환 타입 불변: (venue_id, venue_name, moneyin_count, total_amount, last_at). 라이브 소비자가
--   CustomerDashboardPage(내 이용내역) 와 src/api/vouchers.ts myPlayHistory 둘이라 컬럼을 건드리면
--   화면이 깨진다. 이 마이그레이션은 **행이 줄어드는 것만** 허용한다.
--
-- 매칭 규칙 보존: 기존은 `cross join me` + OR 3개였고 지금은 `join my_names` 다. my_names 는
--   `select distinct` 라 rn=nk 처럼 내 이름이 겹쳐도 장부 한 행이 두 번 세어지지 않는다
--   (OR 시절과 집계 결과가 같다). 캘린더(my_buyin_history)와 규칙이 어긋나면 같은 유저의
--   두 화면 숫자가 갈리므로 두 함수는 반드시 같은 CTE 를 쓴다.
--
-- 합성 검증(트랜잭션 안에서 동명이인을 만들고 롤백):
--   대상 프로필 c8e3734d(real_name='누리홀덤') 로 가장 → 가드 전 1행/5건 → 다른 프로필의
--   real_name 에 '누리홀덤' 을 심자 0행/0건 → PASS. 롤백 후 프로필 원상복구 확인.
--
-- 근본 해결(별건, 미착수): 장부에 user_id 를 붙이는 것 — 순위 입력의 회원 대조
--   (find_user_for_transfer) 선례가 있다. 그때까지는 이 문자열 가드가 최선이다.
--
-- 롤백: 아래 정의에서 my_names/ambiguous CTE 를 걷어내고 `cross join me` + OR 3개로 되돌린 뒤
--   CREATE OR REPLACE, 그리고 ACL 재부여(revoke public,anon / grant authenticated,service_role).

create or replace function public.my_play_history()
returns table (
  venue_id uuid, venue_name text, moneyin_count bigint, total_amount bigint, last_at timestamptz
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
  select b.venue_id, v.name,
         count(*)::bigint,
         coalesce(sum(coalesce(b.cash_amount,0)+coalesce(b.card_amount,0)+coalesce(b.transfer_amount,0)+coalesce(b.unpaid_amount,0)),0)::bigint,
         max(b.buyin_at)
  from public.ledger_buyins b
  join my_names mn on mn.n = btrim(b.player_name)
  left join public.venues v on v.id = b.venue_id
  where not exists (select 1 from ambiguous a where a.n = mn.n)
  group by b.venue_id, v.name
  order by max(b.buyin_at) desc nulls last;
$function$;

comment on function public.my_play_history() is
  '본인 이용내역(매장별 집계). ledger_buyins 에 user_id 가 없어 real_name/nickname/name 문자열로 매칭한다. '
  '⚠ 내 이름 중 다른 회원과 겹치는 것이 있으면 그 이름의 행은 통째로 제외한다(동명이인 fail-closed) — '
  '누락은 복구 가능하지만 남의 참가비 노출은 복구 불가. 매칭 규칙은 my_buyin_history 와 동일해야 한다.';

-- ACL 복원 — CREATE OR REPLACE 후 재부여(집단 기억: REVOKE FROM anon 만으로는 PUBLIC 기본 GRANT 가
-- 남아 무효다). 적용 전 실측한 proacl 그대로: postgres(소유자) · authenticated · service_role.
revoke execute on function public.my_play_history() from public, anon;
grant  execute on function public.my_play_history() to authenticated, service_role;

notify pgrst, 'reload schema';
