// 검토 2c(review-store-ledger-1002-crit.md) — 모바일 장부 요약(1d)의 머리 합계 = Σ손님 줄.
// 머리는 정산바와 같은 stats(정산 제외 적용 · 바인 미수 + 애드온 미수)다. 손님 줄(summaryRowsOf)이 같은 규칙이어야 한다.
// 반례 2(critical-reviewer 하네스 src/__crit__/summary.crit.test.ts)를 옮겼다: 직원 제외를 켜면 예전엔 머리 1회 · 줄 합 3회,
// 머리 미수 0 · 줄 합 10만으로 갈렸다. 음성 대조: summaryRowsOf 의 `if (!isExcluded(b))` 를 지우면 아래 1·2번이 실패한다.
import { describe, it, expect } from 'vitest';
import { buyinFinance, addonTotals, isBuyinExcluded, nonSplitSnapshot, summaryRowsOf,
  type LedgerBuyin, type LedgerSession } from './ledger';

const DATE = '2026-10-02';
const S: LedgerSession = {
  venueId: 'v', sessionDate: DATE, gameSeq: 1, buyinAmount: 100_000, cardAmount: null, gameType: 'gtd',
  targetEntries: 20, maxEntries: 0, isAddon: false, addonStack: 0, discounts: [], earlyDoubleMin: 0, earlySingleMin: 0,
  regClosed: false, closed: false,
};
let seq = 0;
const buyin = (over: Partial<LedgerBuyin> = {}): LedgerBuyin => {
  const b: LedgerBuyin = { id: `b${++seq}`, venueId: 'v', sessionDate: DATE, gameSeq: 1,
    playerName: 'p', entryNo: 1, paymentMethod: 'cash', isUnpaid: false, buyinAt: `${DATE}T12:00:00Z`, isSplit: false,
    cashAmount: 0, cardAmount: 0, transferAmount: 0, ticketCount: 0, unpaidAmount: 0, discountLevel: 0, discountIndex: 0,
    earlyOverride: null, ...over };
  if (!b.isSplit) {
    const s = nonSplitSnapshot(b.paymentMethod, b.discountIndex, { buyinAmount: 100_000, cardAmount: null, discounts: [] });
    b.cashAmount = s.cash_amount; b.cardAmount = s.card_amount; b.transferAmount = s.transfer_amount;
  }
  return b;
};

/** 요약 머리 — NuriPosLedger stats 의 정의(제외 적용 바인 수 · 바인 미수 + 애드온 미수)를 공용 함수로 그대로 센다 */
function head(bs: LedgerBuyin[], isEx: (b: LedgerBuyin) => boolean) {
  const kept = bs.filter((b) => !isEx(b));
  return {
    buyins: kept.length,
    unpaid: kept.reduce((a, b) => a + buyinFinance(b, S).unpaid, 0) + addonTotals(kept).unpaid,
    value: kept.reduce((a, b) => a + buyinFinance(b, S).value, 0),
  };
}
const rowsSum = (m: Map<string, { count: number; unpaid: number; value: number }>) =>
  [...m.values()].reduce((a, r) => ({ buyins: a.buyins + r.count, unpaid: a.unpaid + r.unpaid, value: a.value + r.value }), { buyins: 0, unpaid: 0, value: 0 });

describe('summaryRowsOf — 머리 = Σ손님 줄', () => {
  // 일반 '가' 현금 1건 · 직원 '다' 미수 1건 + 이용권 1건
  const bs = [buyin({ playerName: '가' }), buyin({ playerName: '다', isUnpaid: true }), buyin({ playerName: '다', entryNo: 2, paymentMethod: 'ticket' })];
  const visitor = new Map([['가', 'regular'], ['다', 'staff']]);
  const exOf = (keys: string[]) => (b: LedgerBuyin) => isBuyinExcluded(b, new Set(keys), (n) => visitor.get(n));

  it('1. 반례 2 — 정산 제외(직원)가 켜지면 손님 줄도 빠진다: 머리 1회 · 미수 0 = 줄 합', () => {
    const isEx = exOf(['visitor:staff']);
    const rows = summaryRowsOf(bs, S, isEx);
    expect(head(bs, isEx)).toMatchObject({ buyins: 1, unpaid: 0 });
    expect(rowsSum(rows)).toEqual(head(bs, isEx));
    expect(rows.get('다')).toEqual({ count: 0, unpaid: 0, value: 0 });   // 줄은 남고 숫자는 0(제외됨)
  });

  it('2. 결제수단 제외(이용권) — 이용권 행만 빠지고 미수 행은 남는다', () => {
    const isEx = exOf(['method:ticket']);
    expect(rowsSum(summaryRowsOf(bs, S, isEx))).toEqual(head(bs, isEx));
    expect(head(bs, isEx)).toMatchObject({ buyins: 2, unpaid: 100_000 });
  });

  it('3. 제외 없음 + 애드온 미수 — 손님 미수에 애드온 미수가 들어가 머리(바인 미수 + 애드온 미수)와 같다', () => {
    const withAddon = [...bs, buyin({ playerName: '가', entryNo: 2, addonMethod: 'cash', addonAmount: 50_000, addonUnpaid: true })];
    const isEx = exOf([]);
    const rows = summaryRowsOf(withAddon, S, isEx);
    expect(head(withAddon, isEx)).toMatchObject({ buyins: 4, unpaid: 150_000 });
    expect(rowsSum(rows)).toEqual(head(withAddon, isEx));
  });
});
