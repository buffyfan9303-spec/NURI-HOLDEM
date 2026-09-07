// 하루치 정산 리포트의 계약 — 업주가 이 숫자로 돈을 맞춘다. 틀리면 그대로 손실이다.
//
// 특히 못 박는 것 셋:
//  ① 합계는 게임별 합과 언제나 같다(메인+사이드).
//  ② 정산 제외한 행은 합계에서 빠지고, **빠졌다는 사실이 removed 로 남는다**.
//  ③ '바인 많이 한 손님'(건수)과 '머니인 순위'(금액)는 서로 다른 순위다 —
//     티켓으로 여러 번 들어온 손님과 현금 한 번에 크게 넣은 손님이 갈린다.
import { describe, it, expect } from 'vitest';
import { settlementReport } from './ledgerSettlement';
import { nonSplitSnapshot, type LedgerBuyin, type LedgerPlayer, type LedgerSession } from '../api/ledger';

const DATE = '2026-09-08';

const session = (over: Partial<LedgerSession> = {}): LedgerSession => ({
  venueId: 'v', sessionDate: DATE, gameSeq: 1,
  buyinAmount: 100_000, cardAmount: null, gameType: 'gtd',
  targetEntries: 20, maxEntries: 0, isAddon: false, addonStack: 0,
  discounts: [{ label: '1레벨', amount: 50_000 }],
  earlyDoubleMin: 0, earlySingleMin: 0,
  regClosed: false, closed: false,
  ...over,
});

/** 테스트용 바인 1건.
 *  ⚠ 금액 칸을 손으로 0 으로 두면 안 된다 — 비분납 현금/카드/이체는 **기록 시점 스냅샷**(cash_amount 등)이
 *    정본이라(2026-08-18 전환) 0 으로 두면 매출이 통째로 0 이 된다. 실제 저장 경로와 같은
 *    nonSplitSnapshot 으로 채워, 픽스처가 운영 데이터와 같은 모양이 되게 한다. */
const buyin = (over: Partial<LedgerBuyin> = {}, s = { buyinAmount: 100_000, cardAmount: null as number | null, discounts: [{ label: '1레벨', amount: 50_000 }] }): LedgerBuyin => {
  const b: LedgerBuyin = {
    id: Math.random().toString(36).slice(2), venueId: 'v', sessionDate: DATE, gameSeq: 1,
    playerName: 'p', entryNo: 1, paymentMethod: 'cash', isUnpaid: false,
    buyinAt: `${DATE}T12:00:00Z`, isSplit: false,
    cashAmount: 0, cardAmount: 0, transferAmount: 0,
    ticketCount: 0, unpaidAmount: 0, discountLevel: 0, discountIndex: 0, earlyOverride: null,
    ...over,
  };
  if (!b.isSplit) {
    const snap = nonSplitSnapshot(b.paymentMethod, b.discountIndex, s);
    b.cashAmount = snap.cash_amount; b.cardAmount = snap.card_amount; b.transferAmount = snap.transfer_amount;
  }
  return b;
};

const player = (name: string, visitorType: string | null, gameSeq = 1): LedgerPlayer => ({
  id: name + gameSeq, venueId: 'v', sessionDate: DATE, gameSeq, name, visitorType, note: null, sortOrder: 0,
});

describe('그날 합계', () => {
  it('메인 + 사이드가 하나로 합쳐지고, 게임별 내역도 남는다', () => {
    const r = settlementReport(
      DATE,
      [session(), session({ gameSeq: 2, buyinAmount: 50_000, targetEntries: 10 })],
      [
        buyin({ playerName: '가', gameSeq: 1 }),
        buyin({ playerName: '나', gameSeq: 1 }),
        buyin({ playerName: '가', gameSeq: 2 }, { buyinAmount: 50_000, cardAmount: null, discounts: [] }),
      ],
      [player('가', 'new'), player('나', 'regular')],
    );
    expect(r.games).toHaveLength(2);
    expect(r.total.buyinCount).toBe(3);
    expect(r.total.revenue).toBe(100_000 + 100_000 + 50_000);
    expect(r.games[0].revenue + r.games[1].revenue).toBe(r.total.revenue);
    // 기준 매출도 게임별 합 — 메인 20×10만 + 사이드 10×5만
    expect(r.total.targetRevenue).toBe(20 * 100_000 + 10 * 50_000);
  });

  it('사람은 게임을 넘어 한 명으로 센다', () => {
    const r = settlementReport(DATE, [session(), session({ gameSeq: 2 })],
      [buyin({ playerName: '가', gameSeq: 1 }), buyin({ playerName: '가', gameSeq: 2 })],
      [player('가', 'new'), player('가', 'new', 2)]);
    expect(r.people).toBe(1);
    expect(r.players[0].buyins).toBe(2);
  });

  it('명단에만 있고 바인이 없는 손님도 인원에 든다(금액은 0)', () => {
    const r = settlementReport(DATE, [session()], [], [player('가', 'new')]);
    expect(r.people).toBe(1);
    expect(r.total.revenue).toBe(0);
    expect(r.topByBuyins).toHaveLength(0); // 순위에는 안 낀다 — 0건은 '많이 한' 이 아니다
  });
});

describe('손님 구성', () => {
  it('신규·기존을 나눠 센다', () => {
    const r = settlementReport(DATE, [session()],
      [buyin({ playerName: '가' }), buyin({ playerName: '나' }), buyin({ playerName: '다' })],
      [player('가', 'new'), player('나', 'new'), player('다', 'regular')]);
    expect(r.newPeople).toBe(2);
    expect(r.regularPeople).toBe(1);
    expect(r.visitors.find((v) => v.key === 'new')?.buyins).toBe(2);
  });

  it('명단에 유형이 없는 손님은 빈 키로 모인다 — 조용히 신규로 세지 않는다', () => {
    const r = settlementReport(DATE, [session()], [buyin({ playerName: '가' })], []);
    expect(r.newPeople).toBe(0);
    expect(r.visitors.find((v) => v.key === '')?.people).toBe(1);
  });
});

describe('순위 셋', () => {
  it("'바인 많이 한 손님'과 '머니인'은 서로 다른 순위다", () => {
    // 가: 티켓으로 3번(가치 30만) · 나: 현금 1번인데 카드단가 없음(10만)
    const r = settlementReport(DATE, [session()],
      [
        buyin({ playerName: '가', paymentMethod: 'ticket' }),
        buyin({ playerName: '가', paymentMethod: 'ticket' }),
        buyin({ playerName: '가', paymentMethod: 'ticket' }),
        buyin({ playerName: '나', paymentMethod: 'cash' }),
      ],
      [player('가', 'regular'), player('나', 'new')]);
    expect(r.topByBuyins[0].name).toBe('가');
    expect(r.topByMoneyIn[0].name).toBe('가');
    // 그런데 **현금 매출**은 나만 만든다 — 티켓은 받은 현금이 0원이다
    expect(r.total.revenue).toBe(100_000);
    expect(r.players.find((p) => p.name === '가')?.paid).toBe(0);
  });

  it('미수는 미수인 사람만, 금액 내림차순', () => {
    const r = settlementReport(DATE, [session()],
      [
        buyin({ playerName: '가', isUnpaid: true }),
        buyin({ playerName: '나', paymentMethod: 'cash' }),
      ],
      [player('가', 'new'), player('나', 'new')]);
    expect(r.unpaidPlayers.map((p) => p.name)).toEqual(['가']);
    expect(r.total.unpaid).toBe(100_000);
  });

  it('같은 값이면 이름 순 — 순서가 매번 바뀌지 않는다', () => {
    const r = settlementReport(DATE, [session()],
      [buyin({ playerName: '나' }), buyin({ playerName: '가' })],
      [player('가', 'new'), player('나', 'new')]);
    expect(r.topByMoneyIn.map((p) => p.name)).toEqual(['가', '나']);
  });
});

describe('정산 제외', () => {
  it('제외한 행은 합계에서 빠지고, 빠졌다는 사실이 남는다', () => {
    const r = settlementReport(DATE, [session()],
      [buyin({ playerName: '가' }), buyin({ playerName: '직원' })],
      [player('가', 'new'), player('직원', 'staff')],
      () => new Set(['visitor:staff']));
    expect(r.total.buyinCount).toBe(1);
    expect(r.total.revenue).toBe(100_000);
    expect(r.total.removed.count).toBe(1);
    expect(r.total.removed.revenue).toBe(100_000);
  });

  it('제외된 손님도 인원에는 남는다 — 온 사람은 온 것이다', () => {
    const r = settlementReport(DATE, [session()],
      [buyin({ playerName: '직원' })],
      [player('직원', 'staff')],
      () => new Set(['visitor:staff']));
    expect(r.people).toBe(1);
    expect(r.players[0].moneyIn).toBe(0);
  });
});

describe('기준 엔트리 대비', () => {
  it('기준이 없으면(0) 기준 매출도 0 — 화면이 대비를 말하지 않게 한다', () => {
    const r = settlementReport(DATE, [session({ targetEntries: 0 })], [buyin({ playerName: '가' })], []);
    expect(r.total.targetEntries).toBe(0);
    expect(r.total.targetRevenue).toBe(0);
  });

  it('할인은 엔트리를 깎는다 — 기준 대비가 그만큼 낮아진다', () => {
    const r = settlementReport(DATE, [session()],
      [buyin({ playerName: '가', discountIndex: 1 })], [player('가', 'new')]);
    expect(r.total.entries).toBeCloseTo(0.5, 5); // 10만 중 5만 할인 = 0.5 엔트리
    expect(r.total.discount.count).toBe(1);
    expect(r.total.discount.cashTotal).toBe(50_000);
  });
});

describe('마감 상태', () => {
  it('게임이 전부 닫혀야 allClosed', () => {
    expect(settlementReport(DATE, [session({ closed: true }), session({ gameSeq: 2 })], [], []).allClosed).toBe(false);
    expect(settlementReport(DATE, [session({ closed: true })], [], []).allClosed).toBe(true);
    expect(settlementReport(DATE, [], [], []).allClosed).toBe(false); // 장부가 없으면 '마감됨'이 아니다
  });
});
