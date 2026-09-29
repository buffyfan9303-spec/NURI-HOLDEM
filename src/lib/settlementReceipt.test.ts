// #9(오너 결정 2026-09-29) — 정산 '매장이용권' 타일 값에 애드온 포함 · 대차표 한 벌(바인 + 애드온).
// 원천: 최종 점검 픽스처(final-store.md L 행) — 티켓 바인 10T+10T · 분납 5T · 티켓 애드온 5T → 사용 30T,
//       애드온 3건(현금 5만 · 이용권 5만 · 미수 5만).
// 음성 대조: ledgerSettlement.ts settlementReceipt 의 `tender[k] += a.tender[k]` 줄을 지우면 '타일 넷 = 수납 완료' 가,
//            received 에서 `+ a.ticketWon` 을 지우면 '대차' 가 빨개진다.
// 실행: npx vitest run src/lib/settlementReceipt.test.ts
import { describe, it, expect } from 'vitest';
import { settlementReport, settlementReceipt } from './ledgerSettlement';
import { nonSplitSnapshot, type LedgerBuyin, type LedgerSession } from '../api/ledger';

const DATE = '2026-09-29';
const S: LedgerSession = {
  venueId: 'v', sessionDate: DATE, gameSeq: 1, buyinAmount: 100_000, cardAmount: null, gameType: 'gtd',
  targetEntries: 0, maxEntries: 0, isAddon: true, addonStack: 30_000, addonAmount: 50_000, discounts: [],
  earlyDoubleMin: 0, earlySingleMin: 0, regClosed: false, closed: false,
};
let n = 0;
const b = (o: Partial<LedgerBuyin>): LedgerBuyin => {
  const x: LedgerBuyin = {
    id: `b${n++}`, venueId: 'v', sessionDate: DATE, gameSeq: 1, playerName: `p${n}`, entryNo: 1, paymentMethod: 'cash', isUnpaid: false,
    buyinAt: `${DATE}T12:00:00Z`, isSplit: false, cashAmount: 0, cardAmount: 0, transferAmount: 0, ticketCount: 0, unpaidAmount: 0,
    discountLevel: 0, discountIndex: 0, earlyOverride: null, addonMethod: null, addonUnpaid: false, addonAmount: 0, ...o,
  };
  if (!x.isSplit) {
    const s = nonSplitSnapshot(x.paymentMethod, 0, S);
    x.cashAmount = s.cash_amount; x.cardAmount = s.card_amount; x.transferAmount = s.transfer_amount;
  }
  return x;
};
const buyins = [
  b({ paymentMethod: 'ticket' }), b({ paymentMethod: 'ticket' }),                                            // 이용권 바인 10T + 10T
  b({ isSplit: true, cashAmount: 50_000, ticketCount: 5 }),                                                  // 분납: 현금 5만 + 5T
  b({ paymentMethod: 'cash', addonMethod: 'cash', addonAmount: 50_000 }),                                    // 애드온 현금
  b({ paymentMethod: 'card', addonMethod: 'ticket', addonAmount: 50_000 }),                                  // 애드온 이용권 5T
  b({ paymentMethod: 'transfer', addonMethod: 'cash', addonUnpaid: true, addonAmount: 50_000 }),             // 애드온 미수
  b({ paymentMethod: 'cash', isUnpaid: true }),                                                              // 바인 미수
];

describe('#9 정산 대차표 — 바인 + 애드온 한 벌', () => {
  const t = settlementReport(DATE, [S], buyins, []).total;
  const rc = settlementReceipt(t);

  it('🔴 매장이용권 타일 값 = 바인 이용권 + 애드온 이용권(30T = 30만)', () => {
    expect(t.tender.ticket).toBe(250_000);          // 바인만 25T
    expect(t.addon.ticketWon).toBe(50_000);
    expect(rc.tender.ticket).toBe(300_000);
  });
  it('🔴 타일 넷(현금·카드·이체·이용권) = 수납 완료 행 — 이용권만 더해 대차가 깨지지 않는다', () => {
    const tiles = rc.tender.cash + rc.tender.card + rc.tender.transfer + rc.tender.ticket;
    expect(tiles).toBe(rc.received);
  });
  it('🔴 대차: 총 정상가 − 할인 = 적용 후 = 수납 완료 + 미수 + 매장지원', () => {
    expect(rc.gross - t.disc).toBe(rc.value);
    expect(rc.received + rc.tender.unpaid + rc.tender.support).toBe(rc.value);
  });
  it('애드온은 한 번만 센다 — 대차표 합계 − 바인 합계 = 애드온 3건 15만(그중 애드온 칸과 같다)', () => {
    expect(rc.value - t.value).toBe(150_000);
    expect(rc.addonTotal).toBe(t.addon.revenue + t.addon.ticketWon + t.addon.unpaid);
    expect(rc.tender.unpaid - t.tender.unpaid).toBe(t.addon.unpaid);
  });
  it('맨 위 KPI(완납 매출 = revenue + addon.revenue)와 현금성 수납이 같은 수를 말한다', () => {
    expect(rc.cashlike).toBe(t.revenue + t.addon.revenue);
  });
  it('엔트리·바인 횟수는 그대로(애드온은 돈의 대차표에만)', () => {
    expect(t.buyinCount).toBe(7);
  });
  it('애드온 없는 날은 바인 대차표와 같다', () => {
    const t0 = settlementReport(DATE, [S], buyins.map((x) => ({ ...x, addonMethod: null, addonUnpaid: false, addonAmount: 0 })), []).total;
    const r0 = settlementReceipt(t0);
    expect([r0.tender, r0.gross, r0.value, r0.received]).toEqual([t0.tender, t0.gross, t0.value, t0.revenue + t0.ticketWon]);
  });
});
