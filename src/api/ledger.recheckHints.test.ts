// 오너 2026-09-25 MYSTORE-RECHECK — 20260925g 서버 강화에 화면을 맞춘 장부 API 회귀 검사.
//   ① 새 hint(LEDGER_PW_LOCKED · LEDGER_DATE_NOT_ALLOWED · LEDGER_OPERATOR_INVALID)는 쉬운 말로, 오답 문구의 남은 횟수는 그대로.
//      (서버 가드는 전부 errcode 42501 이라 msgOf 만 쓰면 '이 계정에는 권한이 없습니다' 로 뭉개진다.)
//   ② delete_ledger_session 이 p_password 를 받는다(기본 null).
//   ③ delete_ledger_player 오류를 래핑하지 않는다(hint 보존).
// 음성 대조: ledgerErrorText 의 42501 한글 분기를 지우면 '남은 횟수' 검사가, deleteLedgerSession 의 p_password 를 지우면 ② 가 빨개진다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    auth: { onAuthStateChange: () => {} },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
    rpc: async (fn: string, args: Record<string, unknown>) => { rpcCalls.push({ fn, args }); return rpcResult; },
  },
}));

const ledger = await import('./ledger');
beforeEach(() => { rpcCalls.length = 0; rpcResult = { data: null, error: null }; });

/** PostgREST 가 돌려주는 모양(PostgrestError 는 Error 를 상속하지만 여기서는 평범한 객체로도 통해야 한다) */
const pg = (message: string, code: string, hint: string | null = null) => ({ message, code, hint, details: null });

describe('ledgerErrorText — 20260925g hint·42501 문장', () => {
  it('오답 문구는 남은 횟수까지 그대로 보인다(42501 이어도 뭉개지 않는다)', () => {
    const e = pg('비밀번호가 올바르지 않습니다 (4번 더 틀리면 10분 동안 잠깁니다)', '42501');
    expect(ledger.ledgerErrorText(e, '취소 실패')).toBe('비밀번호가 올바르지 않습니다 (4번 더 틀리면 10분 동안 잠깁니다)');
  });
  it('LEDGER_PW_LOCKED 는 쉬운 말(10분 잠금·정답도 거절)', () => {
    const e = pg('취소 비밀번호를 5번 틀려 10분 동안 잠겼습니다. 잠시 후 다시 시도해 주세요', '42501', 'LEDGER_PW_LOCKED');
    const t = ledger.ledgerErrorText(e, '취소 실패');
    expect(t).toBe(ledger.LEDGER_HINT_TEXT[ledger.LEDGER_PW_LOCKED]);
    expect(t).toMatch(/10분/);
    expect(t).toMatch(/맞는 비밀번호를 넣어도/);
  });
  it('LEDGER_DATE_NOT_ALLOWED · LEDGER_OPERATOR_INVALID 도 안내문이 있다', () => {
    expect(ledger.ledgerErrorText(pg('직원은 오늘…', '42501', 'LEDGER_DATE_NOT_ALLOWED'), '시작 실패')).toMatch(/업주에게 요청/);
    expect(ledger.ledgerErrorText(pg('담당자는…', '42501', 'LEDGER_OPERATOR_INVALID'), '시작 실패')).toMatch(/담당을 다시/);
  });
  it('buyinWriteError 처럼 cause 로 감싼 오류에서도 hint 를 읽는다', () => {
    const wrapped = new Error('LEDGER_PW_LOCKED', { cause: pg('잠김', '42501', 'LEDGER_PW_LOCKED') });
    expect(ledger.ledgerHintOf(wrapped)).toBe('LEDGER_PW_LOCKED');
    expect(ledger.ledgerErrorText(wrapped, '수정 실패')).toBe(ledger.LEDGER_HINT_TEXT[ledger.LEDGER_PW_LOCKED]);
  });
  it('진짜 권한 거부(permission denied · RLS 원문)는 화면에 원문을 안 그린다', () => {
    const t = ledger.ledgerErrorText(pg('permission denied for table ledger_buyins', '42501'), '취소 실패');
    expect(t).not.toMatch(/ledger_buyins/);
    expect(t).toMatch(/권한이 없습니다/);
    const rls = ledger.ledgerErrorText(pg('new row violates row-level security policy for table "ledger_sessions"', '42501'), '시작 실패');
    expect(rls).not.toMatch(/ledger_sessions/);
  });
  it('P0001 서버 문장·모르는 오류는 종전(msgOf)대로', () => {
    expect(ledger.ledgerErrorText(pg('마감된 장부는 삭제할 수 없습니다 — 먼저 마감을 해제하세요', 'P0001'), '삭제 실패')).toMatch(/마감을 해제/);
    expect(ledger.ledgerErrorText(null, '삭제 실패')).toBe('삭제 실패');
  });
});

describe('cancelPwStateFromError — 잠금 문구도 "비밀번호가 있다"', () => {
  it('잠금 안내문 → true', () => {
    expect(ledger.cancelPwStateFromError(ledger.LEDGER_HINT_TEXT[ledger.LEDGER_PW_LOCKED])).toBe(true);
    expect(ledger.cancelPwStateFromError('비밀번호가 올바르지 않습니다 (2번 더 틀리면 10분 동안 잠깁니다)')).toBe(true);
    expect(ledger.cancelPwStateFromError('취소 비밀번호가 설정되지 않았습니다. 업주가 먼저 설정해야 합니다')).toBe(false);
    expect(ledger.cancelPwStateFromError('마감된 장부입니다')).toBe(null);
  });
});

describe('deleteLedgerSession — p_password(20260925g N19)', () => {
  it('기본은 null, 주면 그대로 싣는다', async () => {
    await ledger.deleteLedgerSession('v1', '2026-09-25', 1);
    await ledger.deleteLedgerSession('v1', '2026-09-25', 2, '4321');
    await ledger.deleteLedgerSession('v1', '2026-09-25', 3, '');
    expect(rpcCalls.map((c) => c.fn)).toEqual(['delete_ledger_session', 'delete_ledger_session', 'delete_ledger_session']);
    expect(rpcCalls[0].args).toEqual({ p_venue_id: 'v1', p_date: '2026-09-25', p_game_seq: 1, p_password: null });
    expect(rpcCalls[1].args).toMatchObject({ p_game_seq: 2, p_password: '4321' });
    expect(rpcCalls[2].args.p_password).toBeNull();   // 빈 문자열은 '없음'
  });
  it('서버 오류는 code·hint 를 잃지 않고 올라온다', async () => {
    rpcResult = { data: null, error: pg('잠김', '42501', 'LEDGER_PW_LOCKED') };
    await expect(ledger.deleteLedgerSession('v1', '2026-09-25', 1, '0000')).rejects.toMatchObject({ code: '42501', hint: 'LEDGER_PW_LOCKED' });
  });
});

describe('deleteLedgerPlayerAtomic — 래핑 금지', () => {
  it('hint 가 보존된다(잠금을 화면이 알아보게)', async () => {
    rpcResult = { data: null, error: pg('잠김', '42501', 'LEDGER_PW_LOCKED') };
    await expect(ledger.deleteLedgerPlayerAtomic('p1', '0000')).rejects.toMatchObject({ hint: 'LEDGER_PW_LOCKED' });
  });
});
