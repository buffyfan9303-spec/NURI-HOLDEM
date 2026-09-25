// 오너 2026-09-25 MYSTORE-FULL-AUDIT — 장부 API 의 D1·D2·D3 회귀 검사.
//   D1 필터 걸린 구독은 DELETE 를 못 받는다 → 다른 접수대의 바인 취소가 이 화면에 안 보였다.
//      필터 없는 DELETE 를 따로 듣고, 지금 화면에 있는 id 일 때만 재조회를 부른다.
//   D2 기록 직전 세션 키 대조(늦게 도착한 앞 장부 세션의 단가로 찍지 않는다).
//   D3 pos_has_password 조회 실패를 '비밀번호 없음'으로 삼키지 않는다 + 서버 문구로 상태를 되짚는다.
// 음성 대조: 수정 전 파일로는 D1 의 DELETE 두 건이 onChange 를 한 번도 부르지 않고(0 ≠ 2),
//   posHasPassword 는 오류에서 false 를 돌려준다(throw 아님). 보고에 전후 출력을 적었다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Handler = { filter: Record<string, unknown>; cb: (p: unknown) => void };
const handlers: Handler[] = [];
let rpcResult: { data: unknown; error: unknown } = { data: true, error: null };
vi.mock('../lib/supabase', () => ({
  IS_MOCK: false,
  supabase: {
    auth: { onAuthStateChange: () => {} },
    channel: () => {
      const ch = {
        on(_kind: string, filter: Record<string, unknown>, cb: (p: unknown) => void) { handlers.push({ filter, cb }); return ch; },
        subscribe() { return ch; },
      };
      return ch;
    },
    removeChannel: () => {},
    rpc: async () => rpcResult,
  },
}));

const ledger = await import('./ledger');
beforeEach(() => { handlers.length = 0; rpcResult = { data: true, error: null }; });

/** 서버가 보낸 것처럼 이벤트를 흘린다 — 필터가 걸린 핸들러는 DELETE 를 **받지 못한다**(Supabase 동작). */
function emit(table: string, event: 'INSERT' | 'UPDATE' | 'DELETE', old: Record<string, unknown>, rec: Record<string, unknown> = {}) {
  for (const h of handlers) {
    if (h.filter.table !== table) continue;
    const ev = h.filter.event;
    if (ev !== '*' && ev !== event) continue;
    if (h.filter.filter && event === 'DELETE') continue;             // 필터 + DELETE = 전달 안 됨
    if (h.filter.filter) {
      const [col, rhs] = String(h.filter.filter).split('=eq.');
      if (rec[col] !== rhs) continue;
    }
    h.cb({ eventType: event, old, new: rec });
  }
}

describe('D1 — 다른 접수대의 삭제가 이 화면에 닿는다', () => {
  it('🔴 내 목록에 있는 바인·플레이어가 지워지면 재조회한다', () => {
    const onChange = vi.fn();
    const mine = new Set(['b-1', 'p-1']);
    ledger.subscribeLedger('v-1', onChange, { ownsRow: (_t, id) => mine.has(id) });
    emit('ledger_buyins', 'DELETE', { id: 'b-1' });
    emit('ledger_players', 'DELETE', { id: 'p-1' });
    expect(onChange).toHaveBeenCalledTimes(2);
  });
  it('남의 매장·내 목록에 없는 id 의 삭제는 무시한다(과구독이 재조회 폭주가 되지 않게)', () => {
    const onChange = vi.fn();
    ledger.subscribeLedger('v-1', onChange, { ownsRow: () => false });
    emit('ledger_buyins', 'DELETE', { id: 'other' });
    emit('ledger_sessions', 'DELETE', { venue_id: 'v-2', session_date: '2026-09-25', game_seq: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });
  it('내 매장 장부(세션) 삭제는 ownsRow 없이도 받는다', () => {
    const onChange = vi.fn();
    ledger.subscribeLedger('v-1', onChange);
    emit('ledger_sessions', 'DELETE', { venue_id: 'v-1', session_date: '2026-09-25', game_seq: 2 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
  it('INSERT/UPDATE 는 종전처럼 venue 필터로 받는다', () => {
    const onChange = vi.fn();
    ledger.subscribeLedger('v-1', onChange);
    emit('ledger_buyins', 'INSERT', {}, { venue_id: 'v-1' });
    emit('ledger_buyins', 'INSERT', {}, { venue_id: 'v-2' });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('D2 — 기록 직전 세션 키 대조', () => {
  const s = { venueId: 'v', sessionDate: '2026-09-25', gameSeq: 1 };
  it('같으면 true, 게임·날짜·매장 중 하나라도 다르면 false', () => {
    expect(ledger.ledgerSessionMatches(s, 'v', '2026-09-25', 1)).toBe(true);
    expect(ledger.ledgerSessionMatches(s, 'v', '2026-09-25', 2)).toBe(false);
    expect(ledger.ledgerSessionMatches(s, 'v', '2026-09-24', 1)).toBe(false);
    expect(ledger.ledgerSessionMatches(s, 'w', '2026-09-25', 1)).toBe(false);
  });
});

describe('D3 — 비밀번호 상태', () => {
  it('🔴 조회 실패는 false(비밀번호 없음)가 아니라 오류다', async () => {
    rpcResult = { data: null, error: { message: 'network' } };
    await expect(ledger.posHasPassword('v')).rejects.toBeTruthy();
  });
  it('서버 문구 → 상태', () => {
    expect(ledger.cancelPwStateFromError('비밀번호가 올바르지 않습니다')).toBe(true);
    expect(ledger.cancelPwStateFromError('매출이 줄어드는 수정은 업주 취소 비밀번호가 필요합니다')).toBe(true);
    expect(ledger.cancelPwStateFromError('취소 비밀번호가 설정되지 않았습니다. 업주가 먼저 설정해야 합니다')).toBe(false);
    expect(ledger.cancelPwStateFromError('취소 비밀번호가 설정되지 않은 매장은 업주·공동운영자만 취소할 수 있습니다')).toBe(false);
    expect(ledger.cancelPwStateFromError('마감된 장부의 바인은 취소할 수 없습니다')).toBeNull();
  });
});

describe('20260925f — 서버 금액 규칙 hint 를 화면이 알아듣는다', () => {
  it('hint LEDGER_SPLIT_MISMATCH · LEDGER_SESSION_MISSING 은 그 이름이 message 다(23505 는 CELL_TAKEN, 모르는 오류는 서버 문구 그대로)', () => {
    expect(ledger.buyinWriteError({ code: '23514', hint: 'LEDGER_SPLIT_MISMATCH', message: '분납 합계(90000원)가 참가비(100000원)와 다릅니다' }).message).toBe(ledger.LEDGER_SPLIT_MISMATCH);
    expect(ledger.buyinWriteError({ code: '23514', hint: 'LEDGER_SESSION_MISSING', message: '이 게임의 장부가 아직 열려 있지 않습니다' }).message).toBe(ledger.LEDGER_SESSION_MISSING);
    expect(ledger.buyinWriteError({ code: '23505', message: 'duplicate key' }).message).toBe(ledger.CELL_TAKEN);
    expect(ledger.buyinWriteError({ code: '23514', hint: 'SOMETHING_ELSE', message: '마감된 장부' }).message).toBe('마감된 장부');
    const plain = new Error('0행');
    expect(ledger.buyinWriteError(plain)).toBe(plain);
  });
  it('장부 화면이 두 hint 를 쉬운 말로 안내하고 세션을 다시 읽는다(소스 계약)', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../components/features/NuriPosLedger.tsx', import.meta.url), 'utf8');
    const fn = src.slice(src.indexOf('const noteServerAmountHint'), src.indexOf('const closed = session.closed;'));
    expect(fn).toMatch(/e\.message === LEDGER_SPLIT_MISMATCH[\s\S]*?reloadSession\(\)/);
    expect(fn).toMatch(/e\.message === LEDGER_SESSION_MISSING[\s\S]*?reloadSession\(\)/);
    expect((src.match(/noteServerAmountHint\(e\)/g) ?? []).length, '바인 기록·분납 기록 두 catch 가 모두 부른다').toBe(2);
  });
});
