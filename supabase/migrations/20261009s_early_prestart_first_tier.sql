-- ⏳ 미적용 초안(2026-10-09 store-team · 적용 판단과 실행은 nuri-lead). 요구: roti-1009/audit-ledger.md C-1.
--
-- 무엇: 얼리 자동 판정에서 **대회 시작 전 도착(m < 0)을 가장 이른 얼리 단계로** 본다. 함수 하나(_clock_ledger_part)의 한 줄 삭제.
-- 왜:   "N레벨 시작 전" 창에는 시작 전도 들어간다(포스터 '2LV 시작 전 +1만'). 지금은 두 경로가 갈린다 —
--       · 장부 결제창: 클락 대기 = 1LV 로 early_override='double' 를 저장한다(NuriPosLedger clockEarlyNow).
--       · QR 접수대 승인(approve_buyin_request): early_override 없이 넣어 시각 판정 → m < 0 → 얼리 0.
--       · 그리고 클락이 처음 돌 때 markTournamentStart 가 tournament_start 를 채우면, 그 전에 받은 자동 판정 바인이 소급해서 얼리 0 이 된다.
--       JS 쪽(src/lib/chipRules.ts earlyTierIndexAt)이 같은 PR 에서 같은 규칙으로 바뀐다. 둘은 픽스처 src/api/clockLedgerPart.fixtures.json(18케이스)로 묶여 있다.
-- 범위: _clock_ledger_part 본문만. 시그니처·반환형·언어·search_path·ACL 그대로(CREATE OR REPLACE = ACL 보존). 트리거 함수·RPC·표는 안 건드린다.
-- 기준: 20260930e §2 본문(md5 331d3c7d34ac9d97e987527290633d9d = 2026-10-09 06시 라이브 pg_proc 실측과 같음)에서 위 한 줄만 뺐다.
--
-- 적용 전 확인(읽기):
--   ① select md5(prosrc) from pg_proc where oid = 'public._clock_ledger_part(jsonb,jsonb,jsonb)'::regprocedure;  → 331d3c7d34ac9d97e987527290633d9d (다르면 멈춤 — 누가 먼저 바꿨다)
-- 리허설(begin; … rollback;): 이 파일 전문 → ② 아래 자가검사 → rollback.
-- 자가검사(적용 직후):
--   ② select public._clock_ledger_part(
--        '[{"player_name":"q","entry_no":1,"buyin_at":"2026-10-09T07:55:00+00:00","early_override":null,"addon_method":null}]'::jsonb,
--        '{"early_double_min":30,"early_single_min":128,"tournament_start":"2026-10-09T08:00:00+00:00","opened_at":null,"early_tiers":[{"min":30,"chips":10000},{"min":128,"chips":5000}]}'::jsonb,
--        '{"earlyBonus":5000,"doubleEarlyBonus":10000}'::jsonb) ->> 'earlyChips';   → '10000' (적용 전 '0')
--   ③ select md5(prosrc) …(①과 같은 질의) → 0e54421db45b2ec0cd0ff6b9943388bc (이 파일 $fn$ 본문, LF 기준)
--   ④ select has_function_privilege('authenticated', 'public._clock_ledger_part(jsonb,jsonb,jsonb)', 'execute');  → false (변화 없음)
-- 로컬 동치(R1, 쓰기 없음): PGlite 0.5.8(PostgreSQL 18.3 WASM)에 이 본문을 만들어 픽스처 18케이스 jsonb = 비교 → 18/18.
--   옛 본문(20260930e)은 같은 18케이스에서 3케이스가 갈린다(음성 대조) — 기록: roti-1009/fix-ledger-code.md.
-- 롤백: 20260930e 의 §2(create or replace function public._clock_ledger_part … $fn$;)를 그대로 다시 실행.
-- 배포 순서: 이 SQL 을 먼저 적용하고 같은 날 JS(PR NURI/ledger-early-kind-1009)를 배포한다. 사이 구간에는
--   시작 전 자동 판정 바인이 있는 **열린** 장부에서만 화면(JS 옛 규칙)과 서버 몫이 갈린다(마감 장부는 화면이 쓰지 않는다).

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
      coalesce(nullif(p_session ->> 'tournament_start', ''), nullif(p_session ->> 'opened_at', ''))::timestamptz as st,
      -- W-04: 세션에 굳힌 얼리 단계(비어 있지 않을 때만 단계 판정)
      case when jsonb_typeof(p_session -> 'early_tiers') = 'array' and jsonb_array_length(p_session -> 'early_tiers') > 0
           then p_session -> 'early_tiers' end as tiers,
      -- W-10: 클락의 회차별 리엔트리 스택에 양수가 하나라도 있는가(JS rebuyStacks.some(n > 0))
      (jsonb_typeof(p_config -> 'rebuyStacks') = 'array' and exists (
        select 1 from jsonb_array_elements(p_config -> 'rebuyStacks') e
         where jsonb_typeof(e) = 'number' and (e #>> '{}')::numeric > 0)) as stairs
  ),
  tw as (
    select (x.o - 1)::int as k,
      case when jsonb_typeof(x.e -> 'min') = 'number' then (x.e ->> 'min')::numeric else 0 end as tmin,
      case when jsonb_typeof(x.e -> 'chips') = 'number' then (x.e ->> 'chips')::numeric else 0 end as tchips
    from num, jsonb_array_elements(coalesce(num.tiers, '[]'::jsonb)) with ordinality as x(e, o)
  ),
  -- chipRules.tierUnitChips: 단계 칩 중 가장 작은 양수(없으면 0 → 1건 1단위)
  tu as (select coalesce(min(tw.tchips) filter (where tw.tchips > 0), 0) as unit from tw),
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
    -- ledger.ts earlyTierOf: 단계 번호 0 = 가장 이른 단계(더블얼리) · 1 = 다음(1얼리) · … · -1 = 얼리 아님
    select r.n, r.am,
      case
        when r.ov = 'double' then 0                                        -- 수기 확정이 게이트보다 먼저
        when r.ov = 'single' then 1
        when r.ov = 'none' then -1
        when r.eno is distinct from 1 then -1                               -- 자동 판정은 첫 바인만
        when num.st is null or r.at is null then -1
        else (
          -- JS Date 는 밀리초까지 — 경계(정확히 N분) 판정이 갈리지 않게 같은 정밀도로 자른다. W-27: 반열림 m < 창 끝.
          -- 20261009s(roti-1009 C-1): 시작 전(m < 0) 도착은 아래 `m < 창 끝` 이 그대로 가장 이른 창에 넣는다(예전 `when m < 0 then -1` 삭제).
          select case
            when num.tiers is not null then coalesce((select min(tw.k) from tw where tw.tmin > 0 and m < tw.tmin), -1)
            when num.dmin > 0 and m < num.dmin then 0
            when num.smin > 0 and m < num.smin then 1
            else -1 end
          from (select (floor(extract(epoch from r.at) * 1000) - floor(extract(epoch from num.st) * 1000)) / 60000.0 as m) x
        )
      end as k
    from r cross join num
  ),
  tk as (
    -- 단계 칩·단위(단계 판정일 때만 쓴다). chipRules.tierUnits: unit > 0 이면 floor(chips/unit + 0.5), 아니면 1.
    select t.*, coalesce(tw.tchips, 0) as chips,
      case when (select unit from tu) <= 0 then 1 else floor(coalesce(tw.tchips, 0) / (select unit from tu) + 0.5) end as units
    from t left join tw on tw.k = t.k
  ),
  agg as (
    select
      count(distinct tk.n) filter (where tk.n <> '') as players,
      count(distinct tk.n) as seats,
      count(*) as total,
      count(*) filter (where tk.k = 0) as dbl,
      count(*) filter (where tk.k >= 0) as earl,
      coalesce(sum(tk.chips) filter (where tk.k >= 0), 0) as echips,
      coalesce(sum(tk.units) filter (where tk.k >= 0), 0) as eunits,
      count(*) filter (where tk.am in ('cash', 'card', 'transfer', 'ticket')) as addons
    from tk
  ),
  -- W-10 clock.ts rebuyOrdOf: 같은 이름의 n 번째 기록 = n-1 번째 리엔트리 → 회차별 인원
  per as (select tk.n, count(*) as c from tk group by tk.n),
  ro as (select j, count(*) as cnt from per, generate_series(1, (per.c - 1)::int) as j group by j),
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
    'earlyUnits', case when num.tiers is not null then agg.eunits::bigint
                       else (agg.dbl * eu.u_dbl + (agg.earl - agg.dbl) * eu.u_sgl)::bigint end
  )
  || case when num.tiers is not null then jsonb_build_object('earlyChips', agg.echips::bigint) else '{}'::jsonb end
  || case when num.stairs then jsonb_build_object('rebuyOrd', coalesce((select jsonb_agg(ro.cnt order by ro.j) from ro), '[]'::jsonb))
          else '{}'::jsonb end
  from agg cross join eu cross join num
$fn$;

revoke all on function public._clock_ledger_part(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public._clock_ledger_part(jsonb, jsonb, jsonb) to service_role;
