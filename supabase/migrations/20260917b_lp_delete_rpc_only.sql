-- 20260917b — ledger_players 직접 DELETE 정책 제거. 명단 삭제는 delete_ledger_player RPC 로만.
--
-- 무엇이 문제였나
-- ─────────────────────────────────────────────────────────────────────────────
-- `lp_delete` 는 `can_access_ledger(venue_id) and not ledger_is_closed(...)` 만 봤다.
-- 취소 비밀번호 검증은 **RPC 안에만** 있어서, 장부 권한자가 PostgREST 로 명단 행을 직접 지우면
-- 비밀번호를 한 번도 묻지 않았다.
--
-- 🔴 진짜 피해는 '비밀번호 우회' 가 아니다.
--    `ledger_buyins` 에는 DELETE 정책이 **아예 없다**(lb_select·lb_update·lb_write 셋뿐).
--    그래서 명단만 지우면 **돈 행은 남고 visitor_type 만 사라진다** →
--      lib/ledgerSettlement.ts:143 visitorOf → undefined
--      → api/ledger.ts isBuyinExcluded 가 `if (vt && exKeys.has(...))` 라 무조건 false
--      → 마감정산의 **'관계자 제외' 가 조용히 무력화**된다.
--    게다가 NuriPosLedger 의 `buyinOnly` 가 이름을 다시 끌어와 **표에서는 사라지지도 않는다** —
--    업주 눈에는 아무 일도 안 일어난 것처럼 보이는데 정산 숫자만 틀린다.
--    돈이 지워지는 사고가 아니라 **숫자가 조용히 틀어지는** 사고다.
--
-- 왜 정책을 '좁히지' 않고 지우나 (2026-09-17 실측)
-- ─────────────────────────────────────────────────────────────────────────────
-- 후보였던 안: `and not exists (select 1 from ledger_buyins b where b.venue_id=... and b.player_name=...)`
--   → **기각.** ① 그 정책이 지키려는 '바인 없는 행의 직접 DELETE' 는 아무도 안 쓴다(호출부 0곳).
--     ② 그 조건은 `(venue_id, session_date, game_seq, player_name)` **텍스트 조인키**에 묶인다 —
--        나중에 바인이 player_id FK 를 갖게 되면 조건이 조용히 안 맞아 구멍이 **에러 없이 다시 열린다**.
--        가드 자체가 소리 없이 고장나는 부류라 더 위험하다.
--
-- 지워도 안전한 근거 (전부 실측)
--   · 화면의 유일한 삭제 경로가 이미 RPC 다 — NuriPosLedger.tsx:963 → api/ledger.ts deleteLedgerPlayerAtomic.
--   · `supabase.from('ledger_players').delete(` 호출부 = **0곳**
--     (죽은 `removeLedgerPlayer` 는 이 마이그레이션 직전 커밋에서 삭제했다. tsc 통과 = 정말 죽은 코드였다).
--   · RPC 는 안 막힌다: `ledger_players.relforcerowsecurity = false` · owner = postgres 이고
--     `delete_ledger_player` 가 SECURITY DEFINER(prosecdef = true) 라 RLS 밖에서 계속 지운다.
--   · `ledger_players` 트리거 **0개** · ledger_sessions 로의 FK·CASCADE 없음(FK 는 venues 하나뿐).
--   · 0행 조용한 실패는 `src/api/_mustAffect.ts` 가 이미 받는다(0행 → NoRowsAffectedError).
--
-- 오늘 노출 (숫자)
--   ledger_players 4행(전부 마감된 세션) · **열린 세션 0개** → 오늘 이 정책으로 지울 수 있는 행 **0개**.
--   ledger_access **0행** → 비업주 장부권한자 **0명**.
--   venue_pos_settings 중 cancel_password_hash 설정 매장 **0/3**.
--   → 사고가 난 적은 없다. **직원에게 장부 권한을 처음 주는 날** 켜지는 잠복 구멍이라 그 전에 닫는다.
--
-- ⚠ 리드가 알고 넘어간 것: 취소 비밀번호가 한 매장도 설정돼 있지 않아 '바인 있는 플레이어' 는
--   RPC 로도 못 지운다. 지금까지 콘솔 직접 삭제가 유일한 탈출구였고 이 수정이 그걸 닫는다.
--   남는 정상 동선 둘: ① 업주가 POS 설정에서 취소 비밀번호를 설정(LedgerStatsPanel 의 setPosCancelPassword)
--   ② 관리자는 RPC 에서 비밀번호가 면제된다. **화면이 애초에 못 하던 일을 없애는 것이라 기능 소실이 아니다.**
--
-- 롤백 리허설 (begin … rollback, 2026-09-17 실측 · 실제 계정으로)
--   직접삭제 수정 전 = **1행**(구멍이 실재·도달 가능)
--   직접삭제 수정 후 = **0행**(막힘)
--   🔴 양성 대조 — 업주의 정상 삭제(delete_ledger_player RPC) = **성공**(정상 동선 안 깨짐)
--   → REHEARSAL_PASS
--
-- 되돌리려면:
--   create policy lp_delete on public.ledger_players for delete
--     using (can_access_ledger(venue_id) and not ledger_is_closed(venue_id, session_date, game_seq));
--
-- ✅ 2026-09-17 라이브 적용 완료 — 적용 후 실측: ledger_players 의 DELETE 정책 0개,
--    남은 정책 3개(lp_select · lp_insert · lp_update).

drop policy if exists lp_delete on public.ledger_players;

-- 자가검사 — 실패할 때만 멈춘다
do $$
declare n_del int; n_all int;
begin
  select count(*) into n_del from pg_policies
   where schemaname='public' and tablename='ledger_players' and cmd='DELETE';
  select count(*) into n_all from pg_policies
   where schemaname='public' and tablename='ledger_players';

  if n_del <> 0 then
    raise exception 'SELFCHECK_FAIL: ledger_players 에 DELETE 정책이 아직 %개 남아 있다', n_del;
  end if;
  -- 양성 대조 — 나머지 정책까지 날아가면 장부가 통째로 안 보인다(음성만 보면 이 고장을 못 잡는다)
  if n_all <> 3 then
    raise exception 'SELFCHECK_FAIL: 남은 정책이 3개여야 하는데 %개다 (select/insert/update 가 살아 있어야 한다)', n_all;
  end if;
  -- RPC 가 RLS 밖인지도 확인한다 — 이게 깨지면 업주가 아무것도 못 지운다
  if not (select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='delete_ledger_player') then
    raise exception 'SELFCHECK_FAIL: delete_ledger_player 가 SECURITY DEFINER 가 아니다 — 정상 삭제 경로가 막힌다';
  end if;
end $$;
