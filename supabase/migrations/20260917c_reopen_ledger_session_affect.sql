-- 20260917c — reopen_ledger_session 이 0행을 고치고도 '마감 해제했습니다' 로 나가던 것
--
-- 무엇이 문제였나
-- ─────────────────────────────────────────────────────────────────────────────
-- 라이브 본문(2026-09-17 pg_get_functiondef 실측)에 `if not found` 가 **없었다**:
--     if not public.can_manage_pos(p_venue_id) then raise exception …; end if;
--     update public.ledger_sessions set closed = false, closed_at = null, updated_at = now()
--       where venue_id = … and session_date = … and game_seq = …;
--     -- ← 여기서 끝. 0행이어도 void 를 정상 반환한다.
--
-- 그래서 (venue, date, game_seq) 가 한 글자라도 어긋나면 — 화면이 낡은 목록을 들고 있거나
-- 다른 기기가 그 사이 장부를 지웠거나 게임 번호가 바뀐 경우 — **아무것도 안 바뀌었는데**
-- 호출부(src/api/ledger.ts → NuriPosLedger.tsx)가 '마감 해제했습니다' 를 띄운다.
-- 업주는 해제된 줄 알고 입력을 시작하는데 장부는 여전히 마감(읽기전용)이라, 그 입력이
-- lb_write/lb_update 의 `not ledger_is_closed(...)` 에 걸려 **또 조용히 0행**이 된다.
-- '안 됐는데 됐다고 하는' 것이 두 겹으로 쌓이는 자리였다.
--
-- 고치는 방법
--   `if not found then raise exception …` 한 줄. 서버가 말하면 호출부의 기존 try/catch 가 그대로 받는다.
--   클라이언트는 **한 글자도 고치지 않는다** — 이미 error 를 던지고 토스트로 보여 준다.
--
-- ⚠ ACL 자가검사를 여기 넣지 않는 이유(CLAUDE.md 보안 표준 3번):
--   반환 타입·시그니처가 그대로라 `CREATE OR REPLACE` 이고, 그러면 ACL 이 **보존**된다.
--   즉 파일에서 REVOKE/GRANT 를 빼도 자가검사가 통과해 **거짓 통과**한다. 여기서는 본문 가드만 단언한다.
--   (REVOKE/GRANT 는 '새로 만들어지는 경우' 를 위해 아래에 그대로 적어 둔다.)
--
-- 롤백 리허설 (begin … rollback, 2026-09-17 실측 · 실제 업주 계정)
--   없는 장부 해제  → **예외**(기대: 예외. 예전엔 조용히 성공)
--   🔴 양성 대조 — 실제 마감 장부 해제 → **성공** · closed=false 1행 (정상 동선 안 깨짐)
--   → REHEARSAL_PASS
--
-- ✅ 2026-09-17 라이브 적용 완료 — 적용 후 본문에 `if not found` 포함 확인.

create or replace function public.reopen_ledger_session(p_venue_id uuid, p_date date, p_game_seq smallint default 1)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.can_manage_pos(p_venue_id) then raise exception '마감 해제는 매장 업주만 가능합니다'; end if;
  update public.ledger_sessions
    set closed = false, closed_at = null, updated_at = now()
    where venue_id = p_venue_id and session_date = p_date and game_seq = p_game_seq;
  -- 0행 = 그 장부가 없다. 조용히 성공하면 업주가 '해제됐다' 고 믿고 입력을 시작한다.
  if not found then raise exception '해제할 마감 장부를 찾지 못했습니다. 화면을 새로 불러와 확인해 주세요'; end if;
end $fn$;

revoke execute on function public.reopen_ledger_session(uuid, date, smallint) from public, anon;
grant  execute on function public.reopen_ledger_session(uuid, date, smallint) to authenticated, service_role;

-- 자가검사 — 본문에 가드가 실제로 들어갔는지만 본다(ACL 은 위 주석의 이유로 여기서 안 본다)
do $$
begin
  if position('if not found' in pg_get_functiondef(
       'public.reopen_ledger_session(uuid, date, smallint)'::regprocedure)) = 0 then
    raise exception 'SELFCHECK_FAIL: reopen_ledger_session 본문에 0행 가드가 없다';
  end if;
  -- 양성 대조 — 권한 가드까지 날아가면 아무나 마감을 풀 수 있다(음성만 보면 이 고장을 못 잡는다)
  if position('can_manage_pos' in pg_get_functiondef(
       'public.reopen_ledger_session(uuid, date, smallint)'::regprocedure)) = 0 then
    raise exception 'SELFCHECK_FAIL: 권한 가드(can_manage_pos)가 사라졌다';
  end if;
end $$;
