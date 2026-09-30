-- ✅ 적용 완료(2026-09-30, nuri-lead · MCP execute_sql — 기록: 인수인계서 §3). 2026-10-01 라이브 재확인: ledger_sessions.addon_entry·early_tiers 칸 2 · 트리거 ledger_buyins_discount_kind_guard·trg_ledger_sessions_touch_clock 2. (원래 머리: '⏳ 미적용 초안' — 적용 뒤 표기만 누락됐었다)
-- 20260930e — W단계 1차 계산·데이터 계층(KW-1a): 얼리 단계(W-04·W-05)·반열림 경계(W-27)·계단 리엔트리 스택(W-10)·
--             애드온 엔트리(W-06)·할인 적용 조건(W-28). 요구 원문: store-team W-defects.md(2026-09-29) + 오너 결정 2026-09-30.
--
-- 이 파일이 바꾸는 것
--   §1 ledger_sessions 칸 2개(스키마 추가만 · 기존 행 값 불변)
--      · early_tiers jsonb null — 포스터 얼리 단계를 **장부 시작 시점 구조로 굳힌** 창 [{min, chips}] (최대 4, 오너 결정 #1).
--        null(기존 행 전부) = 예전 두 칸(early_double_min·early_single_min) 동작 그대로.
--      · addon_entry numeric not null default 0 — 애드온(부스터) 1회의 정산 엔트리 값(게임별, 기본 0 = 예전 동작).
--        정산·통계는 클라이언트 lib(ledgerSettlement)가 계산한다 — 서버 함수 중 이 값을 쓰는 곳은 없다(2026-09-30 prosrc 확인: early_* 를 읽는 함수는 _clock_ledger_part 하나).
--   §2 _clock_ledger_part — 클라이언트 정본(src/api/clock.ts deriveClockCounts·rebuyOrdOf, src/api/ledger.ts earlyTierOf,
--      src/lib/chipRules.ts earlyTierIndexAt·tierUnits)의 SQL 번역. 동치는 src/api/clockLedgerPart.fixtures.json 으로 고정한다.
--      · W-27: 경계를 반열림으로 — `m <= dmin` → `m < dmin` (정확히 창 끝 분에 온 손님은 그 단계가 아니다).
--        (W-05 '앞 브레이크 포함'은 창 끝 분을 만드는 클라이언트 withDerivedEarly 가 바꾼다 — 서버는 세션에 굳힌 분을 읽기만 한다.)
--      · W-04: 세션 early_tiers 가 비어 있지 않으면 단계 판정 — 결과에 earlyChips(칩 합)를 싣고 earlyUnits 는 단계 칩 ÷ 최소 단계 칩.
--      · W-10: 클락 config.rebuyStacks 에 양수가 있으면 rebuyOrd(회차별 리엔트리 인원 배열)를 싣는다.
--      키가 늘어나는 것은 **새 칸이 있을 때만** — 기존 세션·클락의 결과 jsonb 는 경계 1ms 를 빼면 한 글자도 같다.
--   §3 세션 트리거가 early_tiers 변경에도 클락 장부 몫을 다시 계산하게(칸 목록에 추가).
--   §4 W-28 할인 적용 조건 — ledger_buyins BEFORE 트리거 `ledger_buyins_discount_kind_guard`.
--      세션 할인 칸의 kind 가 'rebuy'(entry_no > 1 에만) · 'firstBuyin'(entry_no = 1 에만)과 맞지 않으면
--      그 할인을 **적용하지 않는다**(discount_index := 0 → _ledger_buyin_apply_amount_rule 로 금액 재계산 = 정가).
--      · 거절(raise)하지 않는 이유: approve_buyin_request 는 화면이 보낸 '레벨 자동 할인' 자리번호를 그대로 쓰는데,
--        QR 승인 화면은 그 손님의 몇 번째 바인인지 모른다. 거절하면 정상 첫 바인 승인이 실패한다.
--        서버가 순번을 아는 자리(행 INSERT)에서 한 규칙으로 걸러야 세 창구(장부·대시보드·RPC)가 같은 금액을 쓴다.
--      · 분납은 금액 규칙이 합계 불일치로 거절한다(LEDGER_SPLIT_MISMATCH) — 화면이 다시 읽고 정가로 다시 입력한다.
--      · kind 가 없는 할인(기존 전부) · discount_index 0 은 통과 — 기존 행 영향 0(UPDATE 는 discount_index 가 바뀔 때만 탄다).
--      · 트리거 이름은 ledger_buyins_client_guard **뒤**에 돈다(이름순) — 클라이언트 경로의 금액 규칙이 먼저 돈 뒤 다시 맞춘다.
--
-- 권한: 새 함수 2개(트리거 함수) — anon·authenticated 실행 회수. SECURITY INVOKER(호출자 권한으로 세션 할인만 읽는다 — 권한 확대 없음).
--   _clock_ledger_part 는 같은 시그니처 create or replace → ACL 보존(라이브: postgres·service_role 만). 아래에 그대로 재기재.
--
-- 적용 전 확인(쓰기 없음, 리드):
--   ① select version();  → 17.x
--   ② select md5(pg_get_functiondef('public._clock_ledger_part(jsonb,jsonb,jsonb)'::regprocedure));  → 98ea7f30aff30b15d35ec8c1f00227e2(2026-09-30 store-team 실측).
--      다르면 누군가 먼저 바꾼 것 — 이 파일 §2 를 그 본문과 대조한 뒤 적용한다.
--   ③ select count(*) from information_schema.columns where table_name='ledger_sessions' and column_name in ('early_tiers','addon_entry'); → 0
--   ④ R1 식 동치: 스크립트 scratchpad/kw1a/r1.cjs 가 만든 SELECT(픽스처 전 케이스 × 이 파일 §2 본문, 쓰기 없음)가 전부 ok.
--
-- 리허설(라이브 begin … rollback, nuri-migration §5 — 적용 직전 리드가 한 번 더):
--   R0 롤백 프로브. R1 위 ④. R2 early_tiers 가 있는 세션 + 장부 3행 → clock_states.live_stats->'ledger' 에 earlyChips·earlyUnits 가 JS 와 같다.
--   R3 kind='rebuy' 할인을 entry_no 1 행에 insert → discount_index 0 · cash_amount = 정가(양성: entry_no 2 행은 할인 유지).
--   R4 kind 없는 할인·기존 행 update(메모 칸 등) → 값 불변. R5 ACL: 새 함수 두 개 anon/authenticated execute = false.
--   R6 어드바이저 보안 ERROR 0.

-- §1 ── 칸 ─────────────────────────────────────────────────────────────────────────────
alter table public.ledger_sessions add column if not exists early_tiers jsonb;
alter table public.ledger_sessions add column if not exists addon_entry numeric not null default 0;
alter table public.ledger_sessions drop constraint if exists ledger_sessions_early_tiers_shape;
alter table public.ledger_sessions add constraint ledger_sessions_early_tiers_shape
  check (early_tiers is null or (jsonb_typeof(early_tiers) = 'array' and jsonb_array_length(early_tiers) <= 4));
alter table public.ledger_sessions drop constraint if exists ledger_sessions_addon_entry_range;
alter table public.ledger_sessions add constraint ledger_sessions_addon_entry_range
  check (addon_entry >= 0 and addon_entry <= 10);

-- §2 ── 장부 몫(클락) ─────────────────────────────────────────────────────────────────────
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
          select case
            when m < 0 then -1
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

-- §3 ── 세션의 얼리 단계가 바뀌어도 클락 장부 몫을 다시 계산 ─────────────────────────────────
drop trigger if exists trg_ledger_sessions_touch_clock on public.ledger_sessions;
create trigger trg_ledger_sessions_touch_clock
  after insert or update of early_double_min, early_single_min, early_tiers, tournament_start, opened_at, buyin_amount on public.ledger_sessions
  for each row execute function public._ledger_touch_clock();

-- §4 ── W-28 할인 적용 조건 ──────────────────────────────────────────────────────────────────
create or replace function public._ledger_buyin_discount_kind_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_discs jsonb; v_kind text;
begin
  if coalesce(new.discount_index, 0) <= 0 then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.discount_index is not distinct from old.discount_index and new.entry_no is not distinct from old.entry_no then
    return new;
  end if;
  select s.discounts into v_discs
    from public.ledger_sessions s
   where s.venue_id = new.venue_id and s.session_date = new.session_date and s.game_seq = new.game_seq;
  if jsonb_typeof(v_discs) is distinct from 'array' or jsonb_array_length(v_discs) < new.discount_index then
    return new;
  end if;
  v_kind := v_discs -> (new.discount_index - 1) ->> 'kind';
  -- ledger.ts discountAllowed 와 같은 규칙: rebuy = 2번째 이후 바인에만 · firstBuyin = 첫 바인에만
  if (v_kind = 'rebuy' and coalesce(new.entry_no, 1) <= 1) or (v_kind = 'firstBuyin' and coalesce(new.entry_no, 1) <> 1) then
    new.discount_index := 0;
    new := public._ledger_buyin_apply_amount_rule(new);
  end if;
  return new;
end $$;

revoke all on function public._ledger_buyin_discount_kind_guard() from public, anon, authenticated;

drop trigger if exists ledger_buyins_discount_kind_guard on public.ledger_buyins;
create trigger ledger_buyins_discount_kind_guard
  before insert or update of discount_index, entry_no on public.ledger_buyins
  for each row execute function public._ledger_buyin_discount_kind_guard();

comment on function public._clock_ledger_part(jsonb, jsonb, jsonb) is
  'K3(2026-09-29)·KW-1a(2026-09-30) 클락 장부 몫 — clock.ts deriveClockCounts(+earlyTierOf·rebuyOrdOf)+earlyUnitTotal 의 SQL 번역. 동치는 src/api/clockLedgerPart.fixtures.json 으로 고정.';
