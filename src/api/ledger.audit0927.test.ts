// 2026-09-27 장부 전 화면 점검 — API 쪽 회귀 검사(#2·#3·#5).
//   ① openLedgerSession: 이미 시작된 장부를 **덮지 않는다**(두 기기 동시 시작, #5). 입장 전 행(opened_at 없음)만 채운다.
//   ② approveBuyinRequest: 원문 오류를 래핑하지 않는다 — 23514(금액 음수 CHECK)를 화면이 가를 수 있게(#2).
//   ③ ledgerErrorText: 음수 CHECK·cause 사슬·23514 한글 문장·네트워크 끊김을 쉬운 말로(#2·#3).
// 음성 대조: openLedgerSession 을 예전 덮어쓰기 upsert 로 되돌리면 ① 이, approve 의 `throw error` 를 `new Error(error.message)`
//   로 되돌리면 ② 가, ledgerErrorText 의 amounts_nonneg 분기를 지우면 ③ 이 빨개진다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;
const store: Row[] = [];
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
const key = (r: Row) => `${r.venue_id}|${r.session_date}|${r.game_seq}`;

/** PostgREST 흉내 — upsert(ignoreDuplicates 유무)·update(eq/is 필터)·select 만 */
function from(table: string) {
  if (table !== 'ledger_sessions') throw new Error('unexpected table ' + table);
  let op: 'upsert' | 'update' = 'upsert'; let payload: Row = {}; let ignore = false;
  const filters: [string, unknown, 'eq' | 'is'][] = [];
  const run = () => {
    if (op === 'upsert') {
      const hit = store.find((r) => key(r) === key(payload));
      if (!hit) { const r = { ...payload }; store.push(r); return { data: [r], error: null }; }
      if (ignore) return { data: [], error: null };
      Object.assign(hit, payload); return { data: [hit], error: null };
    }
    const rows = store.filter((r) => filters.every(([c, v, k]) => (k === 'is' ? (r[c] ?? null) === v : r[c] === v)));
    rows.forEach((r) => Object.assign(r, payload));
    return { data: rows, error: null };
  };
  const q = {
    upsert(p: Row, o?: { ignoreDuplicates?: boolean }) { op = 'upsert'; payload = p; ignore = !!o?.ignoreDuplicates; return q; },
    update(p: Row) { op = 'update'; payload = p; return q; },
    eq(c: string, v: unknown) { filters.push([c, v, 'eq']); return q; },
    is(c: string, v: unknown) { filters.push([c, v, 'is']); return q; },
    select() { return Promise.resolve(run()); },
    then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(run()).then(res, rej); },
  };
  return q;
}
vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    auth: { onAuthStateChange: () => {}, getSession: async () => ({ data: { session: { user: { id: 'u-me' } } } }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
    from,
    rpc: async () => rpcResult,
  },
}));

const ledger = await import('./ledger');
beforeEach(() => { store.length = 0; rpcResult = { data: null, error: null }; });

const sess = (title: string) => ({
  venueId: 'v1', sessionDate: '2026-09-27', gameSeq: 1, buyinAmount: 100000, cardAmount: null, gameType: 'gtd' as const,
  targetEntries: 0, maxEntries: 0, isAddon: false, addonStack: 0, regClosed: false, closed: false, discounts: [],
  earlyDoubleMin: 0, earlySingleMin: 0, tournamentStart: null, title,
});

describe('openLedgerSession — 두 기기 동시 시작(#5)', () => {
  it('처음 시작하면 행을 만든다', async () => {
    await ledger.openLedgerSession(sess('A판'));
    expect(store).toHaveLength(1);
    expect(store[0].title).toBe('A판');
  });
  it('이미 시작된 장부는 덮지 않고 LEDGER_ALREADY_OPEN 을 던진다', async () => {
    await ledger.openLedgerSession(sess('A판'));
    await expect(ledger.openLedgerSession(sess('B판'))).rejects.toThrow(ledger.LEDGER_ALREADY_OPEN);
    expect(store[0].title).toBe('A판');
  });
  it('입장 전 행(opened_at 없음)은 종전처럼 채운다', async () => {
    store.push({ venue_id: 'v1', session_date: '2026-09-27', game_seq: 1, opened_at: null, title: null });
    await ledger.openLedgerSession(sess('C판'));
    expect(store[0].title).toBe('C판');
    expect(store[0].opened_at).toBeTruthy();
  });
});

const CHECK_MSG = 'new row for relation "ledger_buyins" violates check constraint "ledger_buyins_amounts_nonneg_check"';
describe('approveBuyinRequest · ledgerErrorText — 금액 음수(#2)', () => {
  it('approve 오류는 코드를 잃지 않는다(래핑 금지)', async () => {
    rpcResult = { data: null, error: { code: '23514', message: CHECK_MSG, details: null, hint: null } };
    const e = await ledger.approveBuyinRequest('r1', 1, true, 'cash', { cash: -1, card: 2, transfer: 0 }).catch((x: unknown) => x);
    expect((e as { code?: string }).code).toBe('23514');
    expect(ledger.ledgerErrorText(e, '승인 실패')).toBe(ledger.LEDGER_NONNEG_TEXT);
  });
  it('buyinWriteError 처럼 cause 에 실린 CHECK 도 쉬운 말(제약 이름을 화면에 내지 않는다)', () => {
    const e = new Error(CHECK_MSG, { cause: { code: '23514', message: CHECK_MSG } });
    const t = ledger.ledgerErrorText(e, '저장 실패');
    expect(t).toBe(ledger.LEDGER_NONNEG_TEXT);
    expect(t).not.toMatch(/constraint|ledger_buyins/);
  });
  it('23514 여도 우리가 쓴 한글 문장은 그대로(단가 잠금 트리거)', () => {
    expect(ledger.ledgerErrorText({ code: '23514', message: '이미 기록된 바인이 있어 단가를 바꿀 수 없습니다' }, '저장 실패'))
      .toBe('이미 기록된 바인이 있어 단가를 바꿀 수 없습니다');
  });
});

describe('ledgerErrorText — 네트워크 끊김(#3)', () => {
  it("'TypeError: Failed to fetch' 원문 대신 쉬운 말", () => {
    const t = ledger.ledgerErrorText(new Error('TypeError: Failed to fetch'), '저장 실패');
    expect(t).not.toMatch(/TypeError|fetch/);
    expect(t).toMatch(/네트워크/);
  });
});
