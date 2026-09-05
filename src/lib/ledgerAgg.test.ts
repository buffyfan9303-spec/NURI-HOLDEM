// 집계 정합성 테스트 — 같은 장부 데이터를 여러 화면이 '같은 숫자'로 보여주는지 고정한다.
//
// 왜 필요한가: 2026-07 정합성 감사에서 나온 실제 결함들
//   · 분납 티켓이 엔트리/티켓 집계에서 빠져 "회수 티켓 1장인데 엔트리 0"이 나옴(critical)
//   · 대시보드는 세션을 '날짜'로만 매핑해, 사이드 게임이 있는 날 메인 바인이 사이드 단가로 계산됨(critical)
//     → 같은 기간인데 통계 화면과 대시보드가 다른 매출·엔트리를 표시
//
// 여기서는 화면 컴포넌트 대신 '집계 규칙' 자체를 검증한다:
//   ① buyinFinance 가 분납 티켓을 엔트리·티켓에 포함하는가
//   ② (날짜+게임) 페어링과 (날짜만) 페어링의 결과가 다르다는 사실을 못 박아, 날짜-only 회귀를 막는다
import { describe, it, expect } from 'vitest';
import { buyinFinance, ledgerLossSummary, type LedgerBuyin, type LedgerSession } from '../api/ledger';

function buyin(over: Partial<LedgerBuyin> = {}): LedgerBuyin {
  return {
    id: 't', venueId: 'v', sessionDate: '2026-07-20', gameSeq: 1,
    playerName: 'p', entryNo: 1,
    paymentMethod: 'cash', isUnpaid: false, buyinAt: '2026-07-20T12:00:00Z',
    isSplit: false,
    cashAmount: 0, cardAmount: 0, transferAmount: 0,
    ticketCount: 0, unpaidAmount: 0, discountLevel: 0, discountIndex: 0,
    earlyOverride: null,
    ...over,
  } as LedgerBuyin;
}
function session(over: Partial<LedgerSession> = {}): LedgerSession {
  return {
    venueId: 'v', sessionDate: '2026-07-20', gameSeq: 1,
    buyinAmount: 100_000, cardAmount: null, gameType: 'gtd',
    targetEntries: 0, maxEntries: 0, isAddon: false, addonStack: 0,
    discounts: [], earlyDoubleMin: 0, earlySingleMin: 0,
    regClosed: false, closed: false,
    ...over,
  } as LedgerSession;
}

describe('분납 티켓 · 엔트리·티켓 집계 (critical 회귀 방지)', () => {
  const S = session();

  it('🔴 티켓 1장만으로 분납 저장 시 엔트리 1 (0이면 안 된다)', () => {
    const f = buyinFinance(buyin({ isSplit: true, ticketCount: 10 }), S);
    expect(f.entry).toBe(1);
    expect(f.entry).not.toBe(0);
  });

  it('🔴 티켓 1장 = 회수 티켓 1장으로 집계된다', () => {
    const f = buyinFinance(buyin({ isSplit: true, ticketCount: 10 }), S);
    expect(f.ticketPaid).toBe(10);
  });

  it('티켓은 현금 매출이 아니다. paid 0', () => {
    expect(buyinFinance(buyin({ isSplit: true, ticketCount: 10 }), S).paid).toBe(0);
  });

  it('빠른입력 티켓과 분납 티켓의 엔트리가 동일하다(입력 경로가 달라도 같은 값)', () => {
    const quick = buyinFinance(buyin({ paymentMethod: 'ticket' }), S);
    const split = buyinFinance(buyin({ isSplit: true, ticketCount: 10 }), S);
    expect(split.entry).toBe(quick.entry);
    expect(split.ticketPaid).toBe(quick.ticketPaid);
  });

  it('카드 4만 + 티켓 1장 = 매출 4만 · 엔트리 1.4 (현금성 4만 + 티켓 10만 상당)', () => {
    const f = buyinFinance(buyin({ isSplit: true, cardAmount: 40_000, ticketCount: 10 }), S);
    expect(f.paid).toBe(40_000);
    expect(f.entry).toBeCloseTo(1.4, 10);
    expect(f.ticketPaid).toBe(10);
  });

  it('티켓 2장 = 엔트리 2', () => {
    expect(buyinFinance(buyin({ isSplit: true, ticketCount: 20 }), S).entry).toBe(2);
  });

  it('티켓 + 미수만 있으면 미수 티켓으로 분류(회수 아님)', () => {
    const f = buyinFinance(buyin({ isSplit: true, ticketCount: 10, unpaidAmount: 100_000 }), S);
    expect(f.ticketPaid).toBe(0);
    expect(f.ticketUnpaid).toBe(10);
  });
});

describe('세션 페어링 · 사이드 게임 있는 날 (critical 회귀 방지)', () => {
  // 같은 날: 메인 10만 게임 + 사이드 3만 게임
  const main = session({ gameSeq: 1, buyinAmount: 100_000 });
  const side = session({ gameSeq: 2, buyinAmount: 30_000 });
  const rows = [
    buyin({ gameSeq: 1, paymentMethod: 'cash' }), // 메인 10만
    buyin({ gameSeq: 2, paymentMethod: 'cash' }), // 사이드 3만
  ];

  /** 올바른 방식: (날짜+게임) 키로 세션을 찾아 계산 */
  function aggByGame() {
    const map = new Map([main, side].map((s) => [`${s.sessionDate}#${s.gameSeq}`, s]));
    return rows.reduce((acc, b) => {
      const s = map.get(`${b.sessionDate}#${b.gameSeq}`)!;
      const f = buyinFinance(b, s);
      return { paid: acc.paid + f.paid, entry: acc.entry + f.entry };
    }, { paid: 0, entry: 0 });
  }

  /** 과거 버그 방식: 날짜만으로 매핑(마지막 세션이 덮어써 전부 사이드 단가로 계산) */
  function aggByDateOnly() {
    const map: Record<string, LedgerSession> = {};
    [main, side].forEach((s) => { map[s.sessionDate] = s; }); // side 가 main 을 덮어씀
    return rows.reduce((acc, b) => {
      const f = buyinFinance(b, map[b.sessionDate]);
      return { paid: acc.paid + f.paid, entry: acc.entry + f.entry };
    }, { paid: 0, entry: 0 });
  }

  it('게임별 페어링 = 매출 13만 · 엔트리 2 (정답)', () => {
    const r = aggByGame();
    expect(r.paid).toBe(130_000);
    expect(r.entry).toBe(2);
  });

  it('🔴 날짜-only 매핑은 매출을 깎아먹는다. 두 방식이 달라야 함(같아지면 버그 재발)', () => {
    const good = aggByGame();
    const bad = aggByDateOnly();
    // 메인 10만 바인이 사이드 단가(3만)로 계산돼 매출이 7만 증발한다.
    // (엔트리는 단가/단가=1 구조라 겉보기엔 정상이므로, 매출로 검증해야 이 버그가 잡힌다)
    expect(bad.paid).not.toBe(good.paid);
    expect(bad.paid).toBeLessThan(good.paid);
    expect(good.paid - bad.paid).toBe(70_000);
  });

  it('메인 바인은 반드시 메인 단가로 계산된다', () => {
    const f = buyinFinance(rows[0], main);
    expect(f.paid).toBe(100_000);
    expect(f.entry).toBe(1);
  });
});

describe('화면 간 합계 일치. 장부·통계·엑셀이 같은 규칙을 쓴다', () => {
  const S = session({ discounts: [{ label: '1레벨', amount: 50_000 }] });
  const rows = [
    buyin({ paymentMethod: 'cash' }),                     // 10만
    buyin({ paymentMethod: 'cash', discountIndex: 1 }),   // 5만(할인)
    buyin({ paymentMethod: 'ticket' }),                   // 티켓 1
    buyin({ isSplit: true, cashAmount: 40_000, ticketCount: 10 }), // 분납: 4만 + 티켓1
    buyin({ paymentMethod: 'cash', isUnpaid: true }),     // 미수 10만
  ];

  /** 어느 화면이든 이 규칙 하나만 쓰면 값이 갈리지 않는다 */
  function agg() {
    return rows.map((b) => buyinFinance(b, S)).reduce((a, f) => ({
      paid: a.paid + f.paid,
      unpaid: a.unpaid + f.unpaid,
      entry: a.entry + f.entry,
      ticket: a.ticket + f.ticketPaid,
    }), { paid: 0, unpaid: 0, entry: 0, ticket: 0 });
  }

  it('매출 19만 · 미수 10만 · 회수 티켓 2장 · 엔트리 4.9', () => {
    const t = agg();
    expect(t.paid).toBe(190_000);   // 10만 + 5만 + 0 + 4만 + 0
    expect(t.unpaid).toBe(100_000);
    expect(t.ticket).toBe(20);       // 빠른입력 티켓 1 + 분납 티켓 1
    expect(t.entry).toBeCloseTo(4.9, 10); // 1 + 0.5 + 1 + 1.4 + 1
  });

  it('티켓은 매출에 포함되지 않는다(현금성 매출과 구분)', () => {
    const onlyTickets = [buyin({ paymentMethod: 'ticket' }), buyin({ isSplit: true, ticketCount: 10 })]
      .map((b) => buyinFinance(b, S));
    expect(onlyTickets.reduce((s, f) => s + f.paid, 0)).toBe(0);
    expect(onlyTickets.reduce((s, f) => s + f.ticketPaid, 0)).toBe(20);
  });
});

// 할인 프리셋은 '자리번호(discountIndex)'로 참조된다 — 배열을 압축하면 과거 바인의 금액이 바뀐다.
// 세션 설정에서 중간 할인을 지웠을 때 뒤 항목이 당겨지면, 이미 저장된 바인이 조용히 다른 금액이 된다.
describe('할인 프리셋 자리번호 · 중간 삭제 시 기존 바인 금액 보존', () => {
  const presets = [
    { label: '1레벨', amount: 50_000 },
    { label: '첫바인', amount: 30_000 },
    { label: '레이디', amount: 20_000 },
  ];
  const b3 = buyin({ paymentMethod: 'cash', discountIndex: 3 }); // '레이디' 20,000 할인 적용된 바인

  it('삭제 전: 3번 할인 = 2만 → 8만 결제', () => {
    expect(buyinFinance(b3, session({ discounts: presets })).paid).toBe(80_000);
  });

  it('🔴 2번을 압축 삭제하면 3번 바인이 엉뚱한 금액이 된다(과거 버그 재현)', () => {
    const compacted = presets.filter((_, i) => i !== 1); // [1레벨, 레이디] — 자리번호가 밀림
    const f = buyinFinance(b3, session({ discounts: compacted }));
    expect(f.paid).not.toBe(80_000); // 3번 자리가 사라져 할인 0 → 10만
    expect(f.paid).toBe(100_000);
  });

  it('✅ 자리를 비우면(0원) 3번 바인의 금액이 그대로 유지된다', () => {
    const blanked = presets.map((d, i) => (i === 1 ? { label: '', amount: 0 } : d));
    expect(buyinFinance(b3, session({ discounts: blanked })).paid).toBe(80_000);
  });

  it('✅ 비운 자리를 참조하던 바인은 할인 0으로 안전하게 처리된다(터지지 않음)', () => {
    const blanked = presets.map((d, i) => (i === 1 ? { label: '', amount: 0 } : d));
    const b2 = buyin({ paymentMethod: 'cash', discountIndex: 2 });
    expect(buyinFinance(b2, session({ discounts: blanked })).paid).toBe(100_000);
  });
});

// 삭제 확인창의 '잃는 양'은 마감 모달과 반드시 같은 규칙이어야 한다.
// 왜: 확인창 숫자가 실제 장부보다 작게 나오면 사용자는 "별거 없네" 하고 지운다.
//     경고가 거짓말이 되는 순간 확인 UI 자체가 무의미해지므로, 규칙 공유를 테스트로 못 박는다.
describe('삭제 확인 요약. 마감 모달과 같은 숫자를 말한다', () => {
  const S = session({ discounts: [{ label: '1레벨', amount: 50_000 }] });
  const rows = [
    buyin({ playerName: 'A', entryNo: 1, paymentMethod: 'cash' }),                     // 10만
    buyin({ playerName: 'A', entryNo: 2, paymentMethod: 'cash', discountIndex: 1 }),   // 5만(할인)
    buyin({ playerName: 'B', entryNo: 1, paymentMethod: 'cash', isUnpaid: true }),     // 미수 10만
    buyin({ playerName: 'C', entryNo: 1, paymentMethod: 'ticket' }),                   // 티켓(매출 0)
  ];

  it('매출·미수가 마감 모달 계산과 정확히 일치한다', () => {
    const closeModal = rows.map((b) => buyinFinance(b, S))
      .reduce((a, f) => ({ paid: a.paid + f.paid, unpaid: a.unpaid + f.unpaid }), { paid: 0, unpaid: 0 });
    const loss = ledgerLossSummary(rows, [{ name: 'A' }, { name: 'B' }, { name: 'C' }], S);
    expect(loss.revenue).toBe(closeModal.paid);
    expect(loss.unpaid).toBe(closeModal.unpaid);
    expect(loss.revenue).toBe(150_000);
    expect(loss.unpaid).toBe(100_000);
  });

  it('바인 건수는 기록 행 수 그대로(엔트리 환산값이 아니다)', () => {
    expect(ledgerLossSummary(rows, [], S).buyins).toBe(4);
  });

  it('🔴 인원 = 명단 ∪ 바인 이름. 명단에서 빠진 바인만 있는 손님도 세야 한다', () => {
    // 보드는 명단에 없는 바인 기록도 행으로 보여준다. 확인창이 명단만 세면 잃는 인원을 과소 표시한다.
    expect(ledgerLossSummary(rows, [{ name: 'A' }], S).people).toBe(3);
  });

  it('빈 장부는 0으로 안전하게 나온다(0건인데 경고가 터지지 않게)', () => {
    expect(ledgerLossSummary([], [], S)).toEqual({ buyins: 0, people: 0, revenue: 0, unpaid: 0 });
  });
});
