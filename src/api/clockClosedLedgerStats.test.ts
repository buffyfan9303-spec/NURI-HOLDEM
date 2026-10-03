// 20261003h(verifier 2026-10-03) — 마감된 장부의 클락 몫은 어떤 화면도 다시 쓰지 않는다.
//   직원 화면이 읽는 마감 장부의 바인 행은 미수 행만일 수 있어(lb_select), 그 부분 행으로 클락 통계(live_stats.ledger)를 덮으면 TV·순위가 틀어진다.
//   음성 대조: clock.ts writeLedgerStats 의 `if (session?.closed) return false;` 를 지우면 첫 단언이 빨개진다.
import { describe, it, expect } from 'vitest';
import { writeLedgerStats, emptyClockState } from './clock';
import type { LedgerBuyin } from './ledger';

const st = () => ({ ...emptyClockState('v1'), sessionDate: '2026-10-02', gameSeq: 1, liveStats: null });
const b = (i: number): LedgerBuyin => ({
  id: `b${i}`, venueId: 'v1', sessionDate: '2026-10-02', gameSeq: 1, playerName: `p${i}`, entryNo: 1, paymentMethod: 'cash', isUnpaid: i === 0,
  buyinAt: '2026-10-02T11:00:00Z', isSplit: false, cashAmount: 30000, cardAmount: 0, transferAmount: 0, ticketCount: 0, unpaidAmount: 0,
  discountLevel: 0, discountIndex: 0, earlyOverride: null,
});

describe('writeLedgerStats — 마감 장부는 쓰지 않는다', () => {
  it('closed 세션이면 false(쓰기 없음)', async () => {
    expect(await writeLedgerStats(st() as never, [b(0)], { earlyDoubleMin: 0, earlySingleMin: 0, tournamentStart: null, buyinAmount: 30000, closed: true } as never)).toBe(false);
  });
  it('양성 대조 — 열린 세션이면 몫이 달라 쓴다(true)', async () => {
    expect(await writeLedgerStats(st() as never, [b(0), b(1)], { earlyDoubleMin: 0, earlySingleMin: 0, tournamentStart: null, buyinAmount: 30000, closed: false } as never)).toBe(true);
  });
});
