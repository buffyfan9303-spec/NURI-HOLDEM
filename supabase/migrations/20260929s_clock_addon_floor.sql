-- ⏸ 초안 — 리드가 리허설 후 적용 (store-team logic 묶음, 2026-09-29). 라이브 미적용.
--
-- 요구: 오너 결정 #3(docs/HANDOFF-2026-09-29-results.md §4) — "장부에 애드온이 등록되면 클락·TV 의 애드온 수가 그만큼 올라가고
--   총칩도 애드온 칩만큼 올라간다(자동)". 클라이언트는 장부 몫(live_stats.ledger)에 addons 를 싣고(clock.ts deriveClockCounts),
--   표시 = 장부 몫 + 수동 보정(adj_addons) 으로 합성한다(computeLiveStats). 엔트리·리바이와 같은 구조가 됐다.
--
-- 이 파일이 바꾸는 것: 20260929b 의 clock_adjust_counts 에서 **adj_addons 하한만** 0 → −(장부 애드온 수).
--   왜: 장부 애드온 3건이 자동으로 올라온 뒤 업주가 [애드온 −] 로 실수 보정을 되돌릴 수 있어야 한다(엔트리와 같은 규칙).
--   하한 0 그대로면 클라이언트 clampAdjCount(auto=장부 애드온) 가 허용한 −1 을 서버가 0 으로 잘라, 화면과 서버가 1 어긋난다.
--   장부 몫에 addons 가 없는 행(이 판 이전 스냅샷)은 a_addons = 0 → 하한 0 = 예전과 같다.
-- 서명·반환·권한 불변(CREATE OR REPLACE, ACL 보존 — 아래 REVOKE/GRANT 도 같이 적는다). 스키마·기존 행 불변.
--
-- 적용 전 실측(2026-09-29 SELECT 만): PG 17.6 · clock_states 2행 · adj_addons 0 두 행 · live_stats.ledger 키 0행
--   → 지금 라이브에 '이미 손으로 누른 애드온 + 장부 애드온' 이중 계산이 생길 행은 0 이다.
--
-- 리허설 시나리오(라이브 begin … rollback, nuri-migration §5):
--   R0 롤백 확인 프로브 · 업주 1명·같은 매장 비직원 1명을 역할/소유 조회로 고른다.
--   R1 양성 — live_stats = '{"ledger":{"entries":3,"addons":2}}' 인 행에서 업주가 p_d_addons => -5 → adj_addons = −2(−5 아님).
--       이어서 −1 → −2 그대로, +1 → −1.
--   R2 낡은 스냅샷 — live_stats.ledger 에 addons 없음 → p_d_addons => -1 → 0(예전과 같다).
--   R3 음성 — 비로그인·타 매장 업주·비직원 42501(20260929b 와 동일, 권한 줄은 바뀌지 않았다).
--   R4 ACL — anon execute=false · authenticated=true.
--   R5 기존 행 불변 — 리허설 전후 select md5(string_agg(t::text,'' order by venue_id, game_seq)) from clock_states t 같음.
--   R6 어드바이저 보안 ERROR 0.

create or replace function public.clock_adjust_counts(
  p_venue_id uuid,
  p_game_seq integer,
  p_d_elim integer default 0,
  p_d_entries integer default 0,
  p_d_rebuys integer default 0,
  p_d_earlies integer default 0,
  p_d_addons integer default 0
) returns table (eliminations integer, adj_entries integer, adj_rebuys integer, adj_earlies integer, adj_addons integer)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  if coalesce(public.can_access_ledger(p_venue_id), false) is distinct from true then
    raise exception '이 매장의 클락을 조작할 권한이 없습니다' using errcode = '42501';
  end if;
  if greatest(abs(coalesce(p_d_elim, 0)), abs(coalesce(p_d_entries, 0)), abs(coalesce(p_d_rebuys, 0)),
              abs(coalesce(p_d_earlies, 0)), abs(coalesce(p_d_addons, 0))) > 1000 then
    raise exception '한 번에 바꿀 수 있는 인원은 1000 이하입니다' using errcode = '22023';
  end if;

  return query
  with led as (
    select c.venue_id, c.game_seq,
      case when jsonb_typeof(c.live_stats -> 'ledger' -> 'entries') = 'number'
           then greatest(0, floor((c.live_stats -> 'ledger' ->> 'entries')::numeric))::integer else 0 end as a_entries,
      case when jsonb_typeof(c.live_stats -> 'ledger' -> 'rebuys') = 'number'
           then greatest(0, floor((c.live_stats -> 'ledger' ->> 'rebuys')::numeric))::integer else 0 end as a_rebuys,
      case when jsonb_typeof(c.live_stats -> 'ledger' -> 'earlyUnits') = 'number'
           then greatest(0, floor((c.live_stats -> 'ledger' ->> 'earlyUnits')::numeric))::integer else 0 end as a_earlies,
      case when jsonb_typeof(c.live_stats -> 'ledger' -> 'addons') = 'number'
           then greatest(0, floor((c.live_stats -> 'ledger' ->> 'addons')::numeric))::integer else 0 end as a_addons
    from public.clock_states c
    where c.venue_id = p_venue_id and c.game_seq = p_game_seq
    for update
  )
  update public.clock_states c set
    eliminations = greatest(least(c.eliminations, 0), c.eliminations + coalesce(p_d_elim, 0)),
    adj_entries  = greatest(least(c.adj_entries, -l.a_entries), c.adj_entries + coalesce(p_d_entries, 0)),
    adj_rebuys   = greatest(least(c.adj_rebuys, -l.a_rebuys), c.adj_rebuys + coalesce(p_d_rebuys, 0)),
    adj_earlies  = greatest(least(c.adj_earlies, -l.a_earlies), c.adj_earlies + coalesce(p_d_earlies, 0)),
    adj_addons   = greatest(least(c.adj_addons, -l.a_addons), c.adj_addons + coalesce(p_d_addons, 0)),
    updated_at   = now()
  from led l
  where c.venue_id = l.venue_id and c.game_seq = l.game_seq
  returning c.eliminations, c.adj_entries, c.adj_rebuys, c.adj_earlies, c.adj_addons;

  if not found then
    raise exception '클락을 찾지 못했습니다. 이미 종료됐을 수 있습니다' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.clock_adjust_counts(uuid, integer, integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.clock_adjust_counts(uuid, integer, integer, integer, integer, integer, integer) to authenticated, service_role;

comment on function public.clock_adjust_counts(uuid, integer, integer, integer, integer, integer, integer) is
  '클락 카운트 원자 증감(2026-09-29 K1 · #3 애드온 하한). x = x + d, 하한 = −(live_stats.ledger 자동 몫: entries·rebuys·earlyUnits·addons). 권한 can_access_ledger.';
