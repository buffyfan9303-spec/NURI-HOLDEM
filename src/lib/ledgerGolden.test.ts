// 장부 골든 시나리오 — 오너가 직접 부른 하루치 숫자를 값으로 못 박는다 (2026-09-11).
//
// 왜 필요한가: 2026-09-11 이전의 buyinFinance 는 `entry` 를 **비율**로 계산했다.
//   (단가 − 할인) / 단가 → 10만 게임 5만 할인이면 0.5, 분납 14만이면 1.4.
//   그 소수가 통계·대시보드·정산·클락으로 그대로 흘러 "엔트리 7.4명" 같은 숫자를 만들었다.
//   이제 규칙은 하나다 — **유효한 바이인 기록 1건 = 바이인 1회.** 할인은 금액에서만 차감한다.
//
// 이 파일이 잠그는 것
//   ① 오너 골든 시나리오: 플레이어 7명 · 첫 바이인 7회 · 리바인 12회 · 총 19회 · 1,610,000원
//   ② 결제수단이 바인 가치를 바꾸지 않는다(현금 = 카드 = 이체 = 이용권 = 복합)
//   ③ 매장지원은 수납이 아니다 · 미수는 수납완료가 아니다
//   ④ 정산 대차 항등식: 정상가 − 할인 = 수납완료 + 미수 + 매장지원
//   ⑤ 머니인 점수는 100만원당 1점 — 이 작업에서 건드리지 않았다
//
// 실행: npx vitest run src/lib/ledgerGolden.test.ts
import { describe, it, expect } from 'vitest';
import {
  buyinFinance, ledgerCounts, splitMismatch,
  type LedgerBuyin, type LedgerSession,
} from '../api/ledger';
import { TICKET_WON } from './units';
import { settlementReport } from './ledgerSettlement';
import { deriveClockCounts, earlyUnitTotal } from '../api/clock';
import { MONEYIN_UNIT_WON } from '../api/rankverify';

const DATE = '2026-09-11';
/** 10만원 게임 · 할인 프리셋 2종(1레벨 5만 / 첫바인 3만) */
const SESSION: LedgerSession = {
  venueId: 'v', sessionDate: DATE, gameSeq: 1, buyinAmount: 100_000, cardAmount: null,
  gameType: 'gtd', targetEntries: 0, maxEntries: 0, isAddon: false, addonStack: 0,
  title: '골든', discounts: [{ label: '1레벨', amount: 50_000 }, { label: '첫바인', amount: 30_000 }],
  earlyDoubleMin: 0, earlySingleMin: 0, regClosed: false, closed: false,
  openedAt: null, tournamentStart: null, scheduleId: null,
} as unknown as LedgerSession;

let seq = 0;
function buyin(over: Partial<LedgerBuyin> = {}): LedgerBuyin {
  seq += 1;
  return {
    id: `b${seq}`, venueId: 'v', sessionDate: DATE, gameSeq: 1,
    playerName: 'p', entryNo: 1,
    paymentMethod: 'cash', isUnpaid: false, buyinAt: `${DATE}T12:00:00Z`,
    isSplit: false, cashAmount: 0, cardAmount: 0, transferAmount: 0,
    ticketCount: 0, unpaidAmount: 0, discountLevel: 0, discountIndex: 0, earlyOverride: null,
    ...over,
  } as LedgerBuyin;
}
/** 스냅샷 시점 이후 기록 — 실제 받은 net 금액을 amounts 칸에 넣는다(기록 경로와 같은 규칙). */
const cash = (won: number, over: Partial<LedgerBuyin> = {}) =>
  buyin({ paymentMethod: 'cash', cashAmount: won, ...over });

// ── ① 오너 골든 시나리오 ─────────────────────────────────────────────────────
describe('골든 시나리오 — 플레이어 7 · 첫 바이인 7 · 리바인 12 · 총 19회 · 1,610,000원', () => {
  //  첫 바이인 7명
  //    · 4명: 1레벨 5만 할인 → 1인 5만 · 합 20만
  //    · 3명: 첫바인 3만 할인 → 1인 7만 · 합 21만
  //    첫 바이인 합계 41만
  //  리바인 12회
  //    · 이용권 70T = 70만 = 7회
  //    · 현금 40만 = 4회
  //    · 카드 10만 = 1회
  const NAMES = ['가', '나', '다', '라', '마', '바', '사'];
  const rows: LedgerBuyin[] = [
    // 첫 바이인 — 4명 × 1레벨 할인(5만)
    ...NAMES.slice(0, 4).map((n) => cash(50_000, { playerName: n, entryNo: 1, discountIndex: 1 })),
    // 첫 바이인 — 3명 × 첫바인 할인(3만)
    ...NAMES.slice(4, 7).map((n) => cash(70_000, { playerName: n, entryNo: 1, discountIndex: 2 })),
    // 리바인 — 이용권 7회(각 10T = 10만)
    ...Array.from({ length: 7 }, (_, i) =>
      buyin({ playerName: NAMES[i % 7], entryNo: 2 + i, paymentMethod: 'ticket' })),
    // 리바인 — 현금 4회(각 10만)
    ...Array.from({ length: 4 }, (_, i) =>
      cash(100_000, { playerName: NAMES[i % 7], entryNo: 20 + i })),
    // 리바인 — 카드 1회(10만)
    buyin({ playerName: NAMES[0], entryNo: 30, paymentMethod: 'card', cardAmount: 100_000 }),
  ];

  const fins = rows.map((b) => buyinFinance(b, SESSION));
  const sum = (pick: (f: typeof fins[number]) => number) => fins.reduce((a, f) => a + pick(f), 0);
  const counts = ledgerCounts(rows);

  it('플레이어 7명', () => { expect(counts.players).toBe(7); });
  it('첫 바이인 7회', () => { expect(counts.firstBuyins).toBe(7); });
  it('리바인 12회', () => { expect(counts.rebuys).toBe(12); });
  it('총 바이인 19회', () => { expect(counts.totalBuyins).toBe(19); });

  // 오너 규칙(2026-09-11): 횟수와 엔트리는 **다른 수**다. 둘을 한 테스트에서 나란히 못박는다.
  //   횟수 19회 — 정수. 할인·결제수단·미수 어느 것도 줄이지 못한다.
  //   엔트리 16.1 — 금액 기준. 정가 12건(12.0) + 5만할인 4건(2.0) + 3만할인 3건(2.1).
  it('🔴 바이인 횟수는 정수 19회 · 엔트리는 금액 기준 16.1', () => {
    expect(counts.totalBuyins).toBe(19);
    expect(Number.isInteger(counts.totalBuyins)).toBe(true);
    expect(sum((f) => f.entry)).toBeCloseTo(16.1, 10);
    // 항등식 — 엔트리 × 세션 단가 === 할인 적용 후 총 가치. 둘이 어긋나면 어느 한쪽이 틀린 것이다.
    expect(sum((f) => f.entry) * SESSION.buyinAmount).toBeCloseTo(1_610_000, 6);
  });

  it('총 정상가 1,900,000원', () => { expect(sum((f) => f.gross)).toBe(1_900_000); });
  it('할인 합계 290,000원 (5만×4 + 3만×3)', () => { expect(sum((f) => f.disc)).toBe(290_000); });
  it('🔴 할인 적용 후 총 바인 가치 1,610,000원', () => {
    expect(sum((f) => f.value)).toBe(1_610_000);
    expect(sum((f) => f.gross) - sum((f) => f.disc)).toBe(1_610_000);
  });

  it('이용권 70T = 700,000원 (1T = 1만원)', () => {
    expect(sum((f) => f.ticketPaid)).toBe(70);
    expect(sum((f) => f.tender.ticket)).toBe(700_000);
    expect(sum((f) => f.ticketPaid) * TICKET_WON).toBe(700_000);
  });
  it('현금 810,000원 (첫 바이인 41만 + 리바인 40만)', () => {
    expect(sum((f) => f.tender.cash)).toBe(810_000);
  });
  it('카드 100,000원 · 이체 0원 · 매장지원 0원 · 미수 0원', () => {
    expect(sum((f) => f.tender.card)).toBe(100_000);
    expect(sum((f) => f.tender.transfer)).toBe(0);
    expect(sum((f) => f.tender.support)).toBe(0);
    expect(sum((f) => f.tender.unpaid)).toBe(0);
  });
  it('🔴 수납 완료 가치 1,610,000원 = 현금 + 카드 + 이체 + 이용권', () => {
    const settled = sum((f) => f.tender.cash + f.tender.card + f.tender.transfer + f.tender.ticket);
    expect(settled).toBe(1_610_000);
  });
  it('현금성 수납 910,000원 — 이용권은 별도 항목이다', () => {
    expect(sum((f) => f.tender.cash + f.tender.card + f.tender.transfer)).toBe(910_000);
  });

  it('🔴 정산 리포트도 같은 숫자를 말한다', () => {
    const r = settlementReport(DATE, [SESSION], rows, []);
    expect(r.total.players).toBe(7);
    expect(r.total.firstBuyins).toBe(7);
    expect(r.total.rebuys).toBe(12);
    expect(r.total.entries).toBeCloseTo(16.1, 10);   // 금액 엔트리(소수)
    expect(r.total.buyinCount).toBe(19);
    expect(r.total.gross).toBe(1_900_000);
    expect(r.total.disc).toBe(290_000);
    expect(r.total.value).toBe(1_610_000);
    expect(r.total.ticketWon).toBe(700_000);
    expect(r.total.revenue).toBe(910_000);   // 현금성 수납(이용권 제외)
    expect(r.total.unpaid).toBe(0);
    expect(r.total.support).toBe(0);
  });
});

// ── ② 최소 회귀 — 결제수단이 바인 가치를 바꾸지 않는다 ──────────────────────
describe('최소 회귀 — 한 건씩', () => {
  const f = (b: LedgerBuyin) => buyinFinance(b, SESSION);

  it('1. 10만원 현금 바이인 → 1회 · 100,000원', () => {
    const r = f(cash(100_000));
    expect(r).toMatchObject({ entry: 1, value: 100_000, paid: 100_000, disc: 0 });
  });

  it('2. 5만 할인 후 현금 바이인 → 바이인 1회 · 엔트리 0.5 · 50,000원 (오너 예시)', () => {
    const b = cash(50_000, { discountIndex: 1 });
    expect(ledgerCounts([b]).totalBuyins).toBe(1);
    expect(f(b)).toMatchObject({ entry: 0.5, gross: 100_000, disc: 50_000, value: 50_000 });
  });

  it('3. 매장지원 바이인 → 1회 · 실질 가치 0원(고객 결제) · 지원액 100,000원', () => {
    const r = f(buyin({ paymentMethod: 'support' }));
    expect(r.entry).toBe(1);
    expect(r.paid).toBe(0);                 // 고객이 낸 돈 0
    expect(r.tender.cash + r.tender.card + r.tender.transfer + r.tender.ticket).toBe(0); // 수납 0
    expect(r.tender.support).toBe(100_000); // 지원액은 별도 항목
    expect(r.support).toBe(1);              // 건수
  });

  it('4. 미수 바이인 → 1회 · 수납 0원 · 미수 100,000원', () => {
    const r = f(cash(100_000, { isUnpaid: true }));
    expect(r.entry).toBe(1);
    expect(r.paid).toBe(0);
    expect(r.unpaid).toBe(100_000);
    expect(r.tender.unpaid).toBe(100_000);
    expect(r.tender.cash).toBe(0);          // 미수는 수납 완료가 아니다
  });

  it('5. 매장이용권 10T → 1회 · 100,000원', () => {
    const r = f(buyin({ paymentMethod: 'ticket' }));
    expect(r).toMatchObject({ entry: 1, value: 100_000, ticketPaid: 10 });
    expect(r.tender.ticket).toBe(100_000);
  });

  it('6. 현금 50,000원 + 매장이용권 5T → 1회 · 합계 100,000원', () => {
    const r = f(buyin({ isSplit: true, cashAmount: 50_000, ticketCount: 5 }));
    expect(r.entry).toBe(1);
    expect(r.value).toBe(100_000);
    expect(r.tender.cash).toBe(50_000);
    expect(r.tender.ticket).toBe(50_000);
  });

  it('7. 결제수단 합계 불일치 → splitMismatch 가 금액 차이를 돌려준다', () => {
    const short = { cashAmount: 30_000, cardAmount: 0, transferAmount: 0, ticketCount: 0, unpaidAmount: 0, discountIndex: 0 };
    expect(splitMismatch(short, SESSION)).toBe(-70_000);       // 7만 부족
    expect(splitMismatch({ ...short, cashAmount: 130_000 }, SESSION)).toBe(30_000); // 3만 초과
    expect(splitMismatch({ ...short, cashAmount: 100_000 }, SESSION)).toBe(0);      // 정상
  });

  it('8. 할인 바이인이 클락으로 갈 때 — 0.5명이 아니라 1회다', () => {
    const rows = [cash(50_000, { playerName: '가', entryNo: 1, discountIndex: 1 }),
                  cash(100_000, { playerName: '가', entryNo: 2 })];
    const c = ledgerCounts(rows);
    expect(c.players).toBe(1);
    expect(c.firstBuyins).toBe(1);
    expect(c.rebuys).toBe(1);
    expect(c.totalBuyins).toBe(2);
  });

  // cancel_ledger_buyin 은 행을 hard delete 하고 entry_no 를 다시 매기지 않는다.
  // 예전 구현(entryNo === 1 을 첫 바인으로 셈)은 아래에서 첫 바인 0 · 리바인 2 를 냈고,
  // 그 rebuys 가 클락의 총 칩(entries×시작스택 + rebuys×리바인스택)으로 흘러 평균 스택까지 틀렸다.
  it('🔴 9. 첫 바인이 취소돼 entry_no 에 구멍이 나도 첫 바인은 1이다', () => {
    const rows = [cash(100_000, { playerName: '가', entryNo: 2 }),   // 1번이 취소돼 사라진 상태
                  cash(100_000, { playerName: '가', entryNo: 3 })];
    const c = ledgerCounts(rows);
    expect(c.players).toBe(1);
    expect(c.firstBuyins).toBe(1);   // 예전엔 0
    expect(c.rebuys).toBe(1);        // 예전엔 2 → 클락 총 칩 과다
    expect(c.totalBuyins).toBe(2);
  });

  it('🔴 10. 같은 손님이 메인·사이드에 앉으면 사람 1 · 첫 바인 2', () => {
    const rows = [cash(100_000, { playerName: '가', gameSeq: 1, entryNo: 1 }),
                  cash(100_000, { playerName: '가', gameSeq: 2, entryNo: 1 })];
    const c = ledgerCounts(rows);
    expect(c.players).toBe(1);
    expect(c.firstBuyins).toBe(2);   // 게임이 다르면 각각 '그 게임의 첫 바인'
    expect(c.rebuys).toBe(0);
  });

  it('🔴 결제수단이 달라도 바인 가치는 같다 — 현금 = 카드 = 이체 = 이용권', () => {
    const vals = [
      f(cash(100_000)).value,
      f(buyin({ paymentMethod: 'card', cardAmount: 100_000 })).value,
      f(buyin({ paymentMethod: 'transfer', transferAmount: 100_000 })).value,
      f(buyin({ paymentMethod: 'ticket' })).value,
      f(buyin({ isSplit: true, cashAmount: 50_000, ticketCount: 5 })).value,
    ];
    expect(new Set(vals)).toEqual(new Set([100_000]));
  });
});

// ── ③ 정산 대차 항등식 ───────────────────────────────────────────────────────
describe('정산 대차 — 정상가 − 할인 = 수납완료 + 미수 + 매장지원', () => {
  it('현금·카드·이용권·미수·지원이 섞여도 성립한다', () => {
    const rows = [
      cash(100_000, { playerName: '가', entryNo: 1 }),
      cash(50_000, { playerName: '나', entryNo: 1, discountIndex: 1 }),
      buyin({ playerName: '다', entryNo: 1, paymentMethod: 'ticket' }),
      buyin({ playerName: '라', entryNo: 1, paymentMethod: 'support' }),
      cash(100_000, { playerName: '마', entryNo: 1, isUnpaid: true }),
      buyin({ playerName: '가', entryNo: 2, isSplit: true, cashAmount: 40_000, ticketCount: 6 }),
    ];
    const r = settlementReport(DATE, [SESSION], rows, []);
    const settled = r.total.tender.cash + r.total.tender.card + r.total.tender.transfer + r.total.tender.ticket;

    expect(r.total.gross - r.total.disc).toBe(r.total.value);
    expect(settled + r.total.tender.unpaid + r.total.tender.support).toBe(r.total.value);
    // 6건 = 바이인 6회. 엔트리는 금액 기준이라 5.5 — 5만 할인 1건이 0.5 를 깎았다.
    expect(r.total.buyinCount).toBe(6);
    expect(r.total.entries).toBe(5.5);
    expect(r.total.players).toBe(5);        // 가·나·다·라·마
    expect(r.total.firstBuyins).toBe(5);
    expect(r.total.rebuys).toBe(1);
    expect(r.total.tender.support).toBe(100_000);  // 지원액은 수납에 안 들어간다
    expect(r.total.tender.unpaid).toBe(100_000);   // 미수도 수납에 안 들어간다
  });
});

// ── ④ 머니인 점수 — 이 작업에서 건드리지 않았다 ──────────────────────────────
describe('머니인 점수 — 100만원당 1점 (정책 불변)', () => {
  const pts = (won: number) => Math.floor(won / MONEYIN_UNIT_WON);
  it('999,999원은 0점', () => { expect(pts(999_999)).toBe(0); });
  it('1,000,000원은 1점', () => { expect(pts(1_000_000)).toBe(1); });
  it('2,000,000원은 2점', () => { expect(pts(2_000_000)).toBe(2); });
  it('100만원 = 100T 가 유지된다', () => {
    expect(MONEYIN_UNIT_WON).toBe(1_000_000);
    expect(MONEYIN_UNIT_WON / TICKET_WON).toBe(100);   // 100T
    expect(TICKET_WON).toBe(10_000);                    // 1T = 1만원
  });
});

// ── ⑤ 오너가 말로 준 예시를 그대로 — 세 수가 동시에 맞아야 한다 ─────────────────
//
//   "10만 바이인 게임에 1레벨 5만원 할인 더블얼리 하면
//    정산에는 0.5엔트리가 올라가야하고 얼리는 2가 올라가야해" (2026-09-11)
//
// 이 한 건에서 서로 다른 세 수가 동시에 나온다. 하나로 뭉치면 반드시 어딘가 틀린다:
//   바이인 횟수 1  ·  엔트리 0.5  ·  얼리 2
describe('🔴 오너 예시 — 10만 게임 · 5만 할인 · 더블얼리', () => {
  const START = `${DATE}T19:00:00Z`;
  /** 얼리 판정용 세션 — 시작 20분 안이면 더블얼리(클락 기본값과 같다). */
  const EARLY = { earlyDoubleMin: 20, earlySingleMin: 40, tournamentStart: START, openedAt: null };
  /** 클락 기본 보너스 — 1얼리 5,000칩 · 더블얼리 10,000칩 ⇒ 기준 단위 5,000, 더블 = 2단위. */
  const CFG = { earlyBonus: 5_000, doubleEarlyBonus: 10_000 };

  // 시작 10분 뒤 착석 = 더블얼리 구간. 5만 할인이라 실제 받은 돈은 5만원.
  const b = cash(50_000, { playerName: '가', entryNo: 1, discountIndex: 1, buyinAt: `${DATE}T19:10:00Z` });

  it('바이인 횟수는 1회 — 할인도 얼리도 횟수를 바꾸지 않는다', () => {
    expect(ledgerCounts([b]).totalBuyins).toBe(1);
    expect(ledgerCounts([b]).firstBuyins).toBe(1);
    expect(ledgerCounts([b]).players).toBe(1);
  });

  it('엔트리는 0.5 — 금액 기준이라 반값이면 반 엔트리다', () => {
    const f = buyinFinance(b, SESSION);
    expect(f.gross).toBe(100_000);
    expect(f.disc).toBe(50_000);
    expect(f.value).toBe(50_000);
    expect(f.entry).toBe(0.5);
  });

  it('정산 리포트에 0.5 엔트리로 올라간다 — 횟수는 1회로 따로 올라간다', () => {
    const r = settlementReport(DATE, [SESSION], [b], []);
    expect(r.total.entries).toBe(0.5);     // 오너가 말한 '정산에는 0.5엔트리'
    expect(r.total.buyinCount).toBe(1);    // 횟수는 그대로 1회
  });

  it('얼리는 2 — 할인이 얼리를 깎지 않는다', () => {
    const d = deriveClockCounts([b], EARLY);
    expect(d.doubleEarlies).toBe(1);            // 사람으로는 더블얼리 1명
    expect(earlyUnitTotal(d, CFG)).toBe(2);     // 카운트로는 2 (10,000 / 5,000)
  });

  it('할인을 빼도 얼리는 그대로 2 — 두 축은 서로 독립이다', () => {
    const noDisc = { ...b, discountIndex: 0, cashAmount: 100_000 };
    expect(earlyUnitTotal(deriveClockCounts([noDisc], EARLY), CFG)).toBe(2);
    expect(buyinFinance(noDisc, SESSION).entry).toBe(1);   // 엔트리만 1로 돌아온다
  });
});
