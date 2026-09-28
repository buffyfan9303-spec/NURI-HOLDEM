-- ⏸ 초안 — 아직 적용하지 않았다(작성: store-team 2026-09-29). 적용 판단·실행은 nuri-lead 가 MCP execute_sql 로 한다.
--    적용 후 이 머리말을 "✅ 적용 완료 + 실측값" 으로 바꾸고 docs/HANDOFF.md 에 남긴다(nuri-migration §0·§6).
--
-- 요구: 오너 채팅 2026-09-29 "클락 … 디버깅 더 정확하게, 실측까지" — 원인 보고 scratchpad/clock-deep.md K1(+K3·K5).
--
-- 왜: 클락의 카운트 열(탈락·수기 보정)을 화면이 **절대값**으로 썼다(clock.ts clockPatchRow). 조건 없는 절대값이라
--   · 2A 두 리모컨이 동시에 [탈락] → eliminations 1 (기대 2)
--   · 2C 잠든 폰이 깨자마자 [탈락] 한 번 → 그 사이 다른 기기의 탈락 3건이 사라져 1 (기대 4)
--   (하네스 실측, scratchpad/ck/specs/t2-multi.spec.ts). 같은 부류('마지막 writer 가 이긴다')를 7번 화면 단위로 막았다.
--   → 카운트는 서버가 `x = x + d` 로 더한다. 클라이언트(saveClockPatch)는 **차분**만 보낸다. 함수가 없으면 클라이언트는
--     옛 절대값 쓰기로 떨어지지 않고 오류를 띄운다(CLOCK_COUNT_RPC_MISSING_TEXT) — 그래서 이 파일이 **클라이언트 배포보다 먼저** 적용돼야 한다.
--
-- 규칙(클라이언트 clampAdjCount 와 같은 식):
--   · 보정 하한 = −(장부 자동 몫). 자동 몫은 live_stats.ledger(장부 몫 스냅샷, 클라이언트 writeLedgerStats 가 쓴다)에서 읽는다
--     — entries·rebuys·earlyUnits. 없으면 0(= 보정이 곧 카운트라 0 이 하한). 애드온·탈락은 자동 몫이 없어 하한 0.
--   · new = greatest(least(cur, lo), cur + d) — 이미 범위 밖인 낡은 행은 그 자리에 두되 더 내려가지 않고, + 로는 올라온다.
--   · 권한 = 기존 clock_states UPDATE RLS 와 같은 can_access_ledger(venue). SECURITY DEFINER 라 RLS 를 타지 않으므로 첫 줄에서 직접 검사한다.
--   · 차분 한 번에 ±1000 초과는 거절(오조작·스크립트 남용 방지 — 버튼 연타 합치기는 수십 단위다).
--
-- 스키마 변경 없음(함수 1개). 기존 행 값은 바꾸지 않는다.
--
-- 리허설 제안(라이브 begin … rollback, nuri-migration §5 — 롤백이 듣는지 먼저 확인):
--   R0 준비: select id, role, (select count(*) from venues v where v.owner_id = p.id) from profiles p; 로 업주 1·같은 매장 비직원 1 을 고른다.
--        clock_states 2행(2026-09-29 실측: n=2, live_stats 에 ledger 키 0행, 최소 eliminations 3·adj 0).
--   R1 동시 ±2건 모두 반영: 업주로 set_config(jwt) 뒤 같은 트랜잭션에서 clock_adjust_counts(v, s, p_d_elim => 1) 두 번 → eliminations = 전 + 2.
--        (진짜 동시성은 행 잠금 UPDATE 한 문장이라 직렬화된다 — 두 세션 리허설이 필요하면 하나는 begin 상태로 잡아 두고 두 번째가 기다리는지 본다.)
--   R2 하한: live_stats = '{"ledger":{"entries":3}}' 인 행에서 p_d_entries => -5 → adj_entries = −3(−5 가 아니다). 이미 −5 인 행에 −1 → −5 그대로, +1 → −4.
--        eliminations 0 에서 p_d_elim => -1 → 0.
--   R3 음성 — 비로그인(request.jwt.claims = '') → 42501 · 다른 매장 업주 → 42501 · 같은 매장이지만 ledger_access 없는 일반 회원 → 42501.
--   R4 양성 대조 — 업주 통과, ledger_access 위임 직원(활성) 통과. (아무도 통과 못 하는 고장을 음성만으론 못 잡는다.)
--   R5 없는 클락(game_seq 99) → P0002 '클락을 찾지 못했습니다'. 차분 1001 → 22023.
--   R6 ACL: has_function_privilege('anon', 'public.clock_adjust_counts(uuid,integer,integer,integer,integer,integer,integer)', 'execute') = false,
--        authenticated = true. (음성 대조는 DROP 후 적용해야 한다 — CREATE OR REPLACE 는 ACL 을 보존해 거짓 통과한다.)
--   R7 기존 행 불변: 리허설 전후 select md5(string_agg(t::text, '' order by venue_id, game_seq)) from clock_states t 가 롤백 뒤 같다.
--   R8 어드바이저 보안 ERROR 0.

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
           then greatest(0, floor((c.live_stats -> 'ledger' ->> 'earlyUnits')::numeric))::integer else 0 end as a_earlies
    from public.clock_states c
    where c.venue_id = p_venue_id and c.game_seq = p_game_seq
    for update
  )
  update public.clock_states c set
    eliminations = greatest(least(c.eliminations, 0), c.eliminations + coalesce(p_d_elim, 0)),
    adj_entries  = greatest(least(c.adj_entries, -l.a_entries), c.adj_entries + coalesce(p_d_entries, 0)),
    adj_rebuys   = greatest(least(c.adj_rebuys, -l.a_rebuys), c.adj_rebuys + coalesce(p_d_rebuys, 0)),
    adj_earlies  = greatest(least(c.adj_earlies, -l.a_earlies), c.adj_earlies + coalesce(p_d_earlies, 0)),
    adj_addons   = greatest(least(c.adj_addons, 0), c.adj_addons + coalesce(p_d_addons, 0)),
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
  '클락 카운트 원자 증감(2026-09-29 K1). x = x + d, 하한 = −(live_stats.ledger 자동 몫). 권한 can_access_ledger.';
