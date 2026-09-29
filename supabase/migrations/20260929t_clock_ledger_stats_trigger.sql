-- ⏸ 초안 — 리드가 리허설 후 적용 (store-team logic 묶음, 2026-09-29). 라이브 미적용.
--    적용 순서: 20260929s(애드온 하한) 다음. 이 파일은 live_stats.ledger.addons 를 서버가 채우므로 s 의 하한이 서버 값으로 선다.
--
-- 요구: 오너 결정 클락 #2(K3, docs/HANDOFF-2026-09-29-results.md §4 #2) — "업주가 아무 화면도 안 열어도 장부가 바뀌면
--   TV 인원이 따라가게 서버 트리거". 지금은 장부 몫(live_stats.ledger)을 **열린 화면**(장부·클락·리모컨·대시보드)만 쓴다
--   (clock.ts writeLedgerStats). 손님 QR 이용권 → 직원 폰 승인처럼 업주 화면이 하나도 안 열린 운영에서 TV 인원이 멈췄다.
--
-- 설계 — 식은 한 벌:
--   · 장부 몫 계산은 순수 함수 `_clock_ledger_part(buyins jsonb, session jsonb, config jsonb)` 하나다.
--     클라이언트 정본(clock.ts deriveClockCounts + earlyUnitTotal, ledger.ts ledgerCounts·earlyTypeOf·addonTotals)의 SQL 번역이고,
--     두 식의 동치는 공용 픽스처 `src/api/clockLedgerPart.fixtures.json` 으로 고정한다:
--       - vitest `src/api/clockLedgerPart.contract.test.ts` 가 JS 식 == 픽스처 기대값을 단언하고,
--       - 같은 테스트가 이 파일의 함수 본문이 아래 R2 로 검증된 문자열에서 바뀌지 않았는지(해시) 본다.
--       - R2(아래)는 **이 파일의 함수 본문 그대로**를 픽스처에 돌려 기대값과 비교한다(읽기 전용 SELECT 로 돌릴 수 있다).
--   · 저장값의 작성자는 **서버**다: clock_states 에 BEFORE 트리거를 걸어 session_date·config·live_stats 가 쓰일 때마다
--     ledger 몫을 서버가 다시 계산해 덮는다. 그래서 적용 뒤에는 화면(writeLedgerStats)이 무엇을 쓰든 저장값은 서버 식이다
--     (화면 작성기는 적용 전 호환과 즉시성 때문에 남겨 둔다 — 적용 후 제거는 다음 단계).
--   · 장부 행(ledger_buyins)·세션(ledger_sessions: 얼리 창·시작 시각·참가비)이 바뀌면 AFTER 트리거가 해당 클락 행의
--     live_stats 를 건드려(= BEFORE 트리거 재계산) realtime UPDATE 가 나간다 → TV·리모컨·라이브 탭이 다시 읽는다.
--   · 권한 확대 없음: 트리거 함수는 SECURITY DEFINER 지만 입력은 DB 행뿐이고(사용자 인자 0), 같은 (매장·날짜·게임)의
--     클락 행 live_stats 한 칸만 쓴다. 장부를 바꿀 수 있는 사람만 트리거를 일으킨다. `_` 함수 3개 모두 anon·authenticated 실행 회수.
--   · 옛 필드(alive·entries·totalStack…)는 갱신하지 않는다 — 읽는 쪽(composeLiveStats)이 ledger 가 있으면 무시한다.
--     새로고침 안 한 K1 이전 번들만 옛 값을 본다(오늘 배포분 이후 화면은 모두 합성).
--
-- 스키마 변경 없음(함수 3 + 트리거 3). 기존 행 값은 적용 순간 바뀌지 않는다(다음 쓰기 때 ledger 몫이 서버 값으로 채워진다).
--
-- 적용 전 실측(2026-09-29 SELECT 만): PG 17.6 · clock_states 2행(ledger 키 0행, 장부 연동 1행 session_date 2026-09-17)
--   · 기존 트리거: ledger_buyins(client_guard·addon_rule BEFORE), ledger_sessions(guard 3 BEFORE), clock_states 없음.
--
-- 리허설 시나리오(라이브 begin … rollback, nuri-migration §5):
--   R0 롤백 확인 프로브 · 업주 1·같은 매장 ledger_access 직원 1·다른 매장 업주 1 을 역할/소유 조회로 고른다.
--   R1 식 동치(읽기 전용으로도 가능): 픽스처 JSON 각 케이스를 `select public._clock_ledger_part(buyins, session, config)` 로 돌려
--      expect 와 jsonb 동등(=)을 확인한다. 적용 전에는 함수 본문의 $1/$2/$3 을 리터럴로 바꾼 SELECT 로 같은 확인을 한다
--      (store-team 이 2026-09-29 라이브 SELECT 로 8케이스 전부 일치 확인 — 보고서 logic-report.md).
--   R2 양성 — 장부 연동 클락이 있는 매장에서 업주로 ledger_buyins insert 1행 → 같은 트랜잭션에서
--      clock_states.live_stats->'ledger'->>'entries' 가 +1(새 이름), 'addons' 는 addon_method 를 넣은 행만큼 오른다.
--      ledger_sessions.tournament_start 를 바꾸면 earlies/earlyUnits 가 다시 계산된다.
--   R3 화면 쓰기는 덮인다 — 업주로 update clock_states set live_stats = '{"ledger":{"entries":999}}' → 저장값 entries = 서버 계산값.
--   R4 음성 — 장부 미연동 클락(session_date null)은 live_stats 불변. 다른 매장의 같은 날짜·게임 클락은 건드리지 않는다.
--      권한 없는 사용자는 ledger_buyins 쓰기 자체가 RLS 에서 막힌다(트리거가 권한을 넓히지 않는다 — 막힌 쓰기는 트리거도 안 탄다).
--   R5 ACL — has_function_privilege('anon'|'authenticated', 'public._clock_ledger_part(jsonb,jsonb,jsonb)', 'execute') = false,
--      _clock_states_ledger_stats()·_ledger_touch_clock() 도 false.
--   R6 기존 행 불변 — 리허설 전후 clock_states md5 동일(롤백 후).
--   R7 어드바이저 보안 ERROR 0.

create or replace function public._clock_ledger_part(p_buyins jsonb, p_session jsonb, p_config jsonb)
returns jsonb
language sql stable   -- text→timestamptz 변환이 있어 immutable 이 아니다
set search_path = public, pg_temp
as $fn$
  -- JS String.prototype.trim 의 공백 집합(WhiteSpace + LineTerminator) — ledgerCounts 가 이름을 trim 해서 센다.
  with ws as (
    select chr(32) || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(160) || chr(5760) || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279) as w
  ),
  num as (
    select
      greatest(0, case when jsonb_typeof(p_config -> 'earlyBonus') = 'number' then (p_config ->> 'earlyBonus')::numeric else 0 end) as sb,
      greatest(0, case when jsonb_typeof(p_config -> 'doubleEarlyBonus') = 'number' then (p_config ->> 'doubleEarlyBonus')::numeric else 0 end) as db,
      -- earlyWindowOf: 세션이 있으면 세션만(없으면 시작 시각이 없어 자동 판정 0 — 수기 지정만 센다)
      coalesce(case when jsonb_typeof(p_session -> 'early_double_min') = 'number' then (p_session ->> 'early_double_min')::numeric end, 0) as dmin,
      coalesce(case when jsonb_typeof(p_session -> 'early_single_min') = 'number' then (p_session ->> 'early_single_min')::numeric end, 0) as smin,
      coalesce(nullif(p_session ->> 'tournament_start', ''), nullif(p_session ->> 'opened_at', ''))::timestamptz as st
  ),
  r as (
    select
      btrim(coalesce(b ->> 'player_name', ''), (select w from ws)) as n,
      case when jsonb_typeof(b -> 'entry_no') = 'number' then (b ->> 'entry_no')::numeric end as eno,
      b ->> 'early_override' as ov,
      (b ->> 'buyin_at')::timestamptz as at,
      b ->> 'addon_method' as am
    from jsonb_array_elements(coalesce(p_buyins, '[]'::jsonb)) b
  ),
  t as (
    select r.n, r.am,
      case
        when r.ov in ('double', 'single', 'none') then r.ov                 -- 수기 확정이 게이트보다 먼저
        when r.eno is distinct from 1 then 'none'                           -- 자동 판정은 첫 바인만
        when num.st is null or (num.dmin <= 0 and num.smin <= 0) or r.at is null then 'none'
        else (
          -- JS Date 는 밀리초까지 — 경계(정확히 N분) 판정이 갈리지 않게 같은 정밀도로 자른다
          select case
            when m < 0 then 'none'
            when num.dmin > 0 and m <= num.dmin then 'double'
            when num.smin > 0 and m <= num.smin then 'single'
            else 'none' end
          from (select (floor(extract(epoch from r.at) * 1000) - floor(extract(epoch from num.st) * 1000)) / 60000.0 as m) x
        )
      end as et
    from r cross join num
  ),
  agg as (
    select
      count(distinct t.n) filter (where t.n <> '') as players,
      count(distinct t.n) as seats,
      count(*) as total,
      count(*) filter (where t.et = 'double') as dbl,
      count(*) filter (where t.et in ('double', 'single')) as earl,
      count(*) filter (where t.am in ('cash', 'card', 'transfer', 'ticket')) as addons
    from t
  ),
  u as (
    select
      case when num.sb > 0 and num.db > 0 then least(num.sb, num.db) when num.sb > 0 then num.sb when num.db > 0 then num.db else 0 end as unit,
      num.sb, num.db
    from num
  ),
  eu as (
    -- earlyUnitsOf: 보너스 미설정이면 1건=1, 아니면 round(칩/기준) (Math.round = floor(x + 0.5))
    select
      case when u.unit <= 0 then 1
           when (case when u.db > 0 then u.db else u.sb end) > 0 then floor((case when u.db > 0 then u.db else u.sb end) / u.unit + 0.5)
           else 0 end as u_dbl,
      case when u.unit <= 0 then 1
           when u.sb > 0 then floor(u.sb / u.unit + 0.5)
           else 0 end as u_sgl
    from u
  )
  select jsonb_build_object(
    'entries', agg.players,
    'rebuys', agg.total - least(agg.seats, agg.total),
    'earlies', agg.earl,
    'doubleEarlies', agg.dbl,
    'totalBuyins', agg.total,
    'addons', agg.addons,
    'earlyUnits', (agg.dbl * eu.u_dbl + (agg.earl - agg.dbl) * eu.u_sgl)::bigint
  )
  from agg cross join eu
$fn$;

revoke all on function public._clock_ledger_part(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public._clock_ledger_part(jsonb, jsonb, jsonb) to service_role;

-- clock_states BEFORE — 장부 연동 클락의 live_stats.ledger · buyInAmount 를 서버가 채운다(화면이 쓴 값은 덮인다).
create or replace function public._clock_states_ledger_stats()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_sess jsonb;
begin
  if new.session_date is null then
    return new;
  end if;
  select to_jsonb(s) into v_sess
    from public.ledger_sessions s
   where s.venue_id = new.venue_id and s.session_date = new.session_date and s.game_seq = new.game_seq;
  new.live_stats := coalesce(new.live_stats, '{}'::jsonb) || jsonb_build_object(
    'ledger', public._clock_ledger_part(
      (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from public.ledger_buyins b
        where b.venue_id = new.venue_id and b.session_date = new.session_date and b.game_seq = new.game_seq),
      v_sess, new.config),
    -- 화면 작성기와 같은 값: 세션이 없으면 getLedgerSession 의 빈 세션(참가비 0)
    'buyInAmount', coalesce((v_sess ->> 'buyin_amount')::integer, 0)
  );
  return new;
end $$;

revoke all on function public._clock_states_ledger_stats() from public, anon, authenticated;

drop trigger if exists trg_clock_states_ledger_stats on public.clock_states;
create trigger trg_clock_states_ledger_stats
  before insert or update of session_date, config, live_stats on public.clock_states
  for each row execute function public._clock_states_ledger_stats();

-- 장부 행·세션 AFTER — 해당 (매장·날짜·게임) 클락 행의 live_stats 를 건드려 위 BEFORE 가 다시 계산하게 한다.
create or replace function public._ledger_touch_clock()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.clock_states c set live_stats = coalesce(c.live_stats, '{}'::jsonb)
     where c.venue_id = old.venue_id and c.session_date = old.session_date and c.game_seq = old.game_seq;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT'
      or (new.venue_id, new.session_date, new.game_seq) is distinct from (old.venue_id, old.session_date, old.game_seq)) then
    update public.clock_states c set live_stats = coalesce(c.live_stats, '{}'::jsonb)
     where c.venue_id = new.venue_id and c.session_date = new.session_date and c.game_seq = new.game_seq;
  end if;
  return null;
end $$;

revoke all on function public._ledger_touch_clock() from public, anon, authenticated;

drop trigger if exists trg_ledger_buyins_touch_clock on public.ledger_buyins;
create trigger trg_ledger_buyins_touch_clock
  after insert or update or delete on public.ledger_buyins
  for each row execute function public._ledger_touch_clock();

-- 세션은 장부 몫에 쓰이는 칸이 바뀔 때만(마감·메모 같은 잦은 쓰기에는 안 탄다). 삭제는 장부 행 삭제가 함께 온다.
drop trigger if exists trg_ledger_sessions_touch_clock on public.ledger_sessions;
create trigger trg_ledger_sessions_touch_clock
  after insert or update of early_double_min, early_single_min, tournament_start, opened_at, buyin_amount on public.ledger_sessions
  for each row execute function public._ledger_touch_clock();

comment on function public._clock_ledger_part(jsonb, jsonb, jsonb) is
  'K3(2026-09-29) 클락 장부 몫 — clock.ts deriveClockCounts+earlyUnitTotal 의 SQL 번역. 동치는 src/api/clockLedgerPart.fixtures.json 으로 고정.';
