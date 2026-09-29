// 3-B(2026-09-29) — '이용권 사용 T' 숫자 한 벌 = 바인 + 애드온 (docs/HANDOFF-2026-09-29-account-switch.md §5 오너 결정).
//
// 왜: 같은 날 같은 매장인데 대시보드(ledgerMoney)·장부 요약은 바인만, 통계·CRM 은 애드온까지 세서 T 가 갈렸다
//   (docs/handoff-2026-09-29/store-deep.md D3 실측 1,127.1T vs 1,142.1T — 차이 15T = 애드온 이용권).
// 보는 것: 한 픽스처(메인 15T 바인 + 사이드 5T 바인 + 메인 애드온 5T 이용권)를 여섯 소비처의 식으로 셌을 때 전부 25T.
// 못 보는 것: 화면 배선(소비처가 실제로 이 식을 부르는가) — ticketUsedSingleSource.contract.test.ts 몫.
// 음성 대조: ledger.ts ledgerMoney 의 `m.ticket += ticketUsedT(f, addonFinance(b));` 를
//   `m.ticket += f.ticketPaid;` 로 되돌리면 ①(대시보드 20T)이 빨개진다.
// 실행: npx vitest run src/api/ledger.ticketUsed.test.ts
import { describe, it, expect } from 'vitest';
import { addonFinance, buyinFinance, customerLedgerTotals, ledgerMoney, rowToBuyin, ticketUsedT, type LedgerBuyin } from './ledger';
import { settlementReport } from '../lib/ledgerSettlement';
import { TICKET_WON } from '../lib/units';

const DAY = '2026-09-29';
const sess = (gameSeq: number, buyinAmount: number) => ({
  venueId: 'v', sessionDate: DAY, gameSeq, buyinAmount, cardAmount: null,
  gameType: 'gtd' as const, targetEntries: 0, maxEntries: 0, isAddon: gameSeq === 1, addonStack: 50_000, addonAmount: 50_000,
  regClosed: false, closed: false, discounts: [], earlyDoubleMin: 0, earlySingleMin: 0,
});
const MAIN = sess(1, 150_000);   // 15T
const SIDE = sess(2, 50_000);    // 5T
const row = (over: Record<string, unknown>): LedgerBuyin => rowToBuyin({
  venue_id: 'v', session_date: DAY, entry_no: 1, is_unpaid: false, buyin_at: `${DAY}T12:00:00Z`, is_split: false,
  cash_amount: 0, card_amount: 0, transfer_amount: 0, ticket_count: 0, unpaid_amount: 0,
  discount_level: 0, discount_index: 0, early_override: null, ...over,
});
const ROWS = [
  row({ id: 'a', game_seq: 1, player_name: '김', payment_method: 'ticket', addon_method: 'ticket', addon_unpaid: false, addon_amount: 50_000 }),
  row({ id: 'b', game_seq: 2, player_name: '김', payment_method: 'ticket' }),
  row({ id: 'c', game_seq: 1, player_name: '이', payment_method: 'cash', cash_amount: 150_000 }),
];
const byGame = (g: number) => ROWS.filter((b) => b.gameSeq === g);
const WANT = 25;

describe('이용권 사용 T — 여섯 소비처가 같은 25T 를 말한다', () => {
  it('🔴 ① 대시보드 KPI·오늘 카드(ledgerMoney 게임별 합)', () => {
    expect(ledgerMoney(byGame(1), MAIN).ticket + ledgerMoney(byGame(2), SIDE).ticket).toBe(WANT);
  });
  it('② 대시보드 7일(weekTicket 식)', () => {
    const s = (g: number) => (g === 1 ? MAIN : SIDE);
    expect(ROWS.reduce((t, b) => t + ticketUsedT(buyinFinance(b, s(b.gameSeq)), addonFinance(b)), 0)).toBe(WANT);
  });
  it('③ 통계(LedgerStatsPanel fin 식)', () => {
    const s = (g: number) => (g === 1 ? MAIN : SIDE);
    expect(ROWS.reduce((t, b) => t + ticketUsedT(buyinFinance(b, s(b.gameSeq)), addonFinance(b)), 0)).toBe(WANT);
  });
  it('④ 정산 표시(대차표 tender.ticket + 애드온) — 돈 계산은 그대로', () => {
    const r = settlementReport(DAY, [MAIN, SIDE], ROWS, []);
    expect(r.total.tender.ticket).toBe(200_000);          // 대차표(바인만, 원) 불변
    expect(r.total.addon.ticketWon).toBe(50_000);          // 애드온 이용권(원) 불변
    expect(ticketUsedT({ ticketPaid: r.total.tender.ticket / TICKET_WON }, r.total.addon)).toBe(WANT);
  });
  it('⑤ CRM(customerLedgerTotals)', () => {
    expect(customerLedgerTotals(ROWS, [MAIN, SIDE]).ticket).toBe(WANT);
  });
  it('⑥ 장부 요약(게임별 stats.ticket + stats.addon)', () => {
    const one = (g: number, s: typeof MAIN) => {
      const bs = byGame(g);
      const ticketPaid = bs.reduce((t, b) => t + buyinFinance(b, s).ticketPaid, 0);
      const ticketWon = bs.reduce((t, b) => t + addonFinance(b).ticketWon, 0);
      return ticketUsedT({ ticketPaid }, { ticketWon });
    };
    expect(one(1, MAIN) + one(2, SIDE)).toBe(WANT);
  });
  it('반례: 애드온을 현금으로 받으면 사용 T 에 안 들어간다(20T)', () => {
    const cashAddon = [row({ id: 'a', game_seq: 1, player_name: '김', payment_method: 'ticket', addon_method: 'cash', addon_unpaid: false, addon_amount: 50_000 }), ROWS[1]];
    expect(customerLedgerTotals(cashAddon, [MAIN, SIDE]).ticket).toBe(20);
    expect(ledgerMoney(cashAddon.filter((b) => b.gameSeq === 1), MAIN).ticket + ledgerMoney(cashAddon.filter((b) => b.gameSeq === 2), SIDE).ticket).toBe(20);
  });
});
