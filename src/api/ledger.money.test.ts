// 장부 금액 계산 전수 테스트 — 매출/미수/엔트리/티켓이 결제수단×미수×할인 조합에서 정확한지 고정한다.
//
// 왜 필요한가: 2026-07 '레벨 할인' 사건 — 분납의 discountLevel 이 계산 어디에도 반영되지 않는
//   죽은 값이었고(매출·엔트리 누락), 분납 저장 시 discount_index 를 0으로 덮어써 할인 기록까지 사라졌다.
//   빌드·린트·E2E 모두 통과하는데도 돈 계산만 조용히 틀리는 유형이라, 값으로 못 박아 재발을 막는다.
//
// 실행: npx vitest run src/api/ledger.money.test.ts
import { describe, it, expect } from 'vitest';
import { buyinFinance, discountSummary, cardUnit, wonToMan, type LedgerBuyin } from './ledger';

// 10만원 게임 · 카드 11만원(수수료 반영) · 할인 이벤트 2종(5만/3만)
const SESSION = {
  buyinAmount: 100_000,
  cardAmount: 110_000,
  discounts: [
    { label: '1레벨', amount: 50_000 },
    { label: '첫바인', amount: 30_000 },
  ],
};

/** 테스트용 바인 1건 — 필요한 필드만 덮어쓴다 */
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

describe('단순 결제 · 할인 없음', () => {
  it('현금 완납 = 매출 10만, 미수 0, 엔트리 1', () => {
    const f = buyinFinance(buyin({ paymentMethod: 'cash' }), SESSION);
    expect(f).toMatchObject({ paid: 100_000, unpaid: 0, entry: 1 });
  });

  it('현금 미수 = 매출 0, 미수 10만 (엔트리는 그대로 1 · 참가는 했으므로)', () => {
    const f = buyinFinance(buyin({ paymentMethod: 'cash', isUnpaid: true }), SESSION);
    expect(f).toMatchObject({ paid: 0, unpaid: 100_000, entry: 1 });
  });

  it('카드는 카드단가(11만)로 계산', () => {
    const f = buyinFinance(buyin({ paymentMethod: 'card' }), SESSION);
    expect(f.paid).toBe(110_000);
  });

  it('카드단가 미설정이면 현금단가를 쓴다', () => {
    const s = { ...SESSION, cardAmount: null };
    expect(cardUnit(s)).toBe(100_000);
    expect(buyinFinance(buyin({ paymentMethod: 'card' }), s).paid).toBe(100_000);
  });

  it('가게지원 = 매출·미수 0이지만 엔트리 1 (참가로 집계)', () => {
    const f = buyinFinance(buyin({ paymentMethod: 'support' }), SESSION);
    expect(f).toMatchObject({ paid: 0, unpaid: 0, entry: 1, support: 1 });
  });

  it('티켓(이용권)은 현금 매출이 아니다. 매출 0, 티켓 1장 회수', () => {
    const f = buyinFinance(buyin({ paymentMethod: 'ticket' }), SESSION);
    expect(f).toMatchObject({ paid: 0, ticketPaid: 1, ticketUnpaid: 0, entry: 1 });
  });

  it('티켓 미수(가불) = 회수 티켓이 아니라 미수 티켓', () => {
    const f = buyinFinance(buyin({ paymentMethod: 'ticket', isUnpaid: true }), SESSION);
    expect(f).toMatchObject({ ticketPaid: 0, ticketUnpaid: 1 });
  });
});

describe('할인 이벤트 적용 (discountIndex)', () => {
  it('🔴 회귀 방지: 5만 할인 현금 완납 = 매출 5만 (0이 되면 안 된다)', () => {
    const f = buyinFinance(buyin({ discountIndex: 1 }), SESSION);
    expect(f.paid).toBe(50_000);
    expect(f.paid).not.toBe(0);
  });

  it('5만 할인 = 엔트리 0.5 (낸 만큼만 참가 지분)', () => {
    expect(buyinFinance(buyin({ discountIndex: 1 }), SESSION).entry).toBe(0.5);
  });

  it('3만 할인 = 매출 7만 · 엔트리 0.7', () => {
    const f = buyinFinance(buyin({ discountIndex: 2 }), SESSION);
    expect(f.paid).toBe(70_000);
    expect(f.entry).toBeCloseTo(0.7, 10);
  });

  it('할인 + 미수 = 할인 후 금액이 미수로 잡힌다(매출 아님)', () => {
    const f = buyinFinance(buyin({ discountIndex: 1, isUnpaid: true }), SESSION);
    expect(f).toMatchObject({ paid: 0, unpaid: 50_000, entry: 0.5 });
  });

  it('카드 + 5만 할인 = 카드단가 11만 − 5만 = 6만', () => {
    const f = buyinFinance(buyin({ paymentMethod: 'card', discountIndex: 1 }), SESSION);
    expect(f.paid).toBe(60_000);
  });

  it('할인이 단가보다 크면 매출은 음수가 아니라 0', () => {
    const s = { ...SESSION, buyinAmount: 30_000, cardAmount: null };
    const f = buyinFinance(buyin({ discountIndex: 1 }), s); // 3만 게임에 5만 할인
    expect(f.paid).toBe(0);
    expect(f.entry).toBe(0);
  });

  it('존재하지 않는 할인 인덱스는 할인 0으로 안전 처리', () => {
    expect(buyinFinance(buyin({ discountIndex: 99 }), SESSION).paid).toBe(100_000);
  });

  it('할인 프리셋이 없는 세션에서도 터지지 않는다', () => {
    const s = { buyinAmount: 100_000, cardAmount: null };
    expect(buyinFinance(buyin({ discountIndex: 1 }), s).paid).toBe(100_000);
  });
});

describe('분납 (결제수단 쪼개기)', () => {
  it('카드 4만 + 티켓 6만 상당 → 실제 받은 금액만 매출', () => {
    const f = buyinFinance(buyin({ isSplit: true, cardAmount: 40_000, ticketCount: 1 }), SESSION);
    expect(f.paid).toBe(40_000);
  });

  it('현금 5만 + 미수 5만 = 매출 5만 · 미수 5만 · 엔트리 1 (실데이터 케이스)', () => {
    const f = buyinFinance(buyin({ isSplit: true, cashAmount: 50_000, unpaidAmount: 50_000 }), SESSION);
    expect(f).toMatchObject({ paid: 50_000, unpaid: 50_000, entry: 1 });
  });

  it('현금+카드+이체 합산이 매출', () => {
    const f = buyinFinance(buyin({ isSplit: true, cashAmount: 30_000, cardAmount: 20_000, transferAmount: 10_000 }), SESSION);
    expect(f.paid).toBe(60_000);
  });

  it('할인 적용 분납(5만만 받음) = 엔트리 0.5 · 덜 받은 만큼만 참가 지분', () => {
    const f = buyinFinance(buyin({ isSplit: true, cashAmount: 50_000, discountIndex: 1 }), SESSION);
    expect(f.paid).toBe(50_000);
    expect(f.entry).toBe(0.5);
  });

  it('🔴 회귀 방지: 죽은 값이던 discountLevel 은 이제 계산에 영향을 주지 않는다', () => {
    const withLevel = buyinFinance(buyin({ isSplit: true, cashAmount: 50_000, discountLevel: 5 }), SESSION);
    const without = buyinFinance(buyin({ isSplit: true, cashAmount: 50_000, discountLevel: 0 }), SESSION);
    expect(withLevel).toEqual(without);
  });
});

describe('경계값', () => {
  it('단가 0(미설정) 세션. 0으로 나누지 않는다', () => {
    const s = { buyinAmount: 0, cardAmount: null };
    const f = buyinFinance(buyin({ paymentMethod: 'cash' }), s);
    expect(Number.isFinite(f.entry)).toBe(true);
    expect(f.entry).toBe(1);
  });

  it('단가 0 + 분납 금액 있음 → 엔트리 1로 처리', () => {
    const s = { buyinAmount: 0, cardAmount: null };
    expect(buyinFinance(buyin({ isSplit: true, cashAmount: 10_000 }), s).entry).toBe(1);
  });

  it('단가 0 + 금액 0 → 엔트리 0', () => {
    const s = { buyinAmount: 0, cardAmount: null };
    expect(buyinFinance(buyin({ isSplit: true }), s).entry).toBe(0);
  });

  it('wonToMan 표시 · 만원 단위 변환', () => {
    expect(wonToMan(100_000)).toBe('10');
    expect(wonToMan(77_000)).toBe('7.7');
    expect(wonToMan(0)).toBe('0');
  });
});

describe('합계 정합성 · 여러 바인의 매출 합이 기대와 일치', () => {
  it('현금완납 + 5만할인 + 미수 + 티켓 + 지원 = 매출 15만 · 미수 10만 · 티켓 1 · 엔트리 3.5', () => {
    const rows = [
      buyin({ paymentMethod: 'cash' }),                          // 10만 매출, 엔트리 1
      buyin({ paymentMethod: 'cash', discountIndex: 1 }),        // 5만 매출, 엔트리 0.5
      buyin({ paymentMethod: 'cash', isUnpaid: true }),          // 미수 10만, 엔트리 1
      buyin({ paymentMethod: 'ticket' }),                        // 티켓 1, 엔트리 1
      buyin({ paymentMethod: 'support' }),                       // 지원, 엔트리 1
    ];
    const t = rows.map((b) => buyinFinance(b, SESSION))
      .reduce((a, f) => ({
        paid: a.paid + f.paid, unpaid: a.unpaid + f.unpaid,
        entry: a.entry + f.entry, ticket: a.ticket + f.ticketPaid,
      }), { paid: 0, unpaid: 0, entry: 0, ticket: 0 });

    expect(t.paid).toBe(150_000);
    expect(t.unpaid).toBe(100_000);
    expect(t.ticket).toBe(1);
    expect(t.entry).toBeCloseTo(4.5, 10); // 1 + 0.5 + 1 + 1 + 1
  });
});

// ── 총바인 '가치'(buyinValue) — 매출과 다른 개념 ─────────────────────────────
// 오너 보고(2026-09-05): "티켓 1을 클릭하면 1티켓의 가치는 10만원인데 바인 금액이 10이 안 올라가".
// 운영 DB 실측: payment_method='ticket' 2건이 현금성 0 · 미수 0 이라 '총바인' 열이 0원이었다.
// 같은 칸의 '회'는 티켓을 세고 있었으므로 회수와 금액의 정의가 갈려 있었다.
// ⚠ 매출(paid)은 티켓을 0으로 두는 것이 맞다 — 여기서 고치는 것은 '가치' 한 곳뿐이다.
describe('총바인 가치(buyinValue) — 티켓·지원도 단가만큼', () => {
  const value = (b: LedgerBuyin) => buyinFinance(b, SESSION).value;

  it('티켓 1장 = 10만 가치 · 매출은 여전히 0', () => {
    const b = buyin({ paymentMethod: 'ticket' });
    expect(buyinFinance(b, SESSION).paid).toBe(0);   // 매출은 안 잡힌다(회귀 방지)
    expect(value(b)).toBe(100_000);                  // 총바인은 잡힌다
  });

  it('티켓 미수도 10만 가치 — 자리는 채웠다', () => {
    expect(value(buyin({ paymentMethod: 'ticket', isUnpaid: true }))).toBe(100_000);
  });

  it('가게지원 = 10만 가치 · 매출 0', () => {
    const b = buyin({ paymentMethod: 'support' });
    expect(buyinFinance(b, SESSION).paid).toBe(0);
    expect(value(b)).toBe(100_000);
  });

  it('현금 완납은 매출과 가치가 같다', () => {
    expect(value(buyin({ paymentMethod: 'cash' }))).toBe(100_000);
  });

  it('미수는 가치에 포함된다(받을 돈도 바인이다)', () => {
    expect(value(buyin({ paymentMethod: 'cash', isUnpaid: true }))).toBe(100_000);
  });

  it('할인 5만이 걸린 현금 = 가치 5만(덜 받은 만큼만)', () => {
    expect(value(buyin({ paymentMethod: 'cash', discountIndex: 1 }))).toBe(50_000);
  });

  it('분납 카드 4만 + 티켓 1장 = 가치 14만 · 매출은 4만', () => {
    const b = buyin({ isSplit: true, cardAmount: 40_000, ticketCount: 1 });
    expect(buyinFinance(b, SESSION).paid).toBe(40_000);
    expect(value(b)).toBe(140_000);
  });

  it('분납 현금 3만 + 미수 7만 = 가치 10만', () => {
    expect(value(buyin({ isSplit: true, cashAmount: 30_000, unpaidAmount: 70_000 }))).toBe(100_000);
  });
});

// ── 티켓 = 언제나 단가 전액 (오너 결정 2026-09-05 "티켓도 동일 가치로 계산해야해") ──
// 예전엔 비분납 티켓만 할인을 먹어 같은 '티켓 1장'이 경로에 따라 엔트리 0.5 / 1 로 갈렸다.
// 더 나쁜 것은 그 할인이 운영자 선택이 아니라 **클락 레벨 자동 할인**이 티켓 버튼에도 붙은 것이다.
describe('티켓 동일 가치 — 할인이 걸려도 단가 전액·엔트리 1', () => {
  it('비분납 티켓 + 할인5만 → 엔트리 1 (예전 0.5)', () => {
    const f = buyinFinance(buyin({ paymentMethod: 'ticket', discountIndex: 1 }), SESSION);
    expect(f.entry).toBe(1);
    expect(f.value).toBe(100_000);
    expect(f.paid).toBe(0);          // 매출은 여전히 0 — 이 커밋이 건드리지 않는 축
  });

  it('분납 티켓1 + 할인5만 → 엔트리 1 · 두 경로가 같은 값', () => {
    const split = buyinFinance(buyin({ isSplit: true, ticketCount: 1, discountIndex: 1 }), SESSION);
    const flat  = buyinFinance(buyin({ paymentMethod: 'ticket', discountIndex: 1 }), SESSION);
    expect(split.entry).toBe(1);
    expect(split.entry).toBe(flat.entry);   // 같은 사건 = 같은 값
    expect(split.value).toBe(flat.value);
  });

  it('티켓 미수도 단가 전액', () => {
    const f = buyinFinance(buyin({ paymentMethod: 'ticket', isUnpaid: true, discountIndex: 1 }), SESSION);
    expect(f).toMatchObject({ entry: 1, value: 100_000, ticketUnpaid: 1, ticketPaid: 0 });
  });

  it("할인 집계는 티켓 행을 세지 않는다 — 현금을 받은 적이 없어 '덜 받은 돈'이 아니다", () => {
    const rows = [
      buyin({ playerName: 'A', paymentMethod: 'cash', discountIndex: 1 }),   // 진짜 할인(5만)
      buyin({ playerName: 'B', paymentMethod: 'ticket', discountIndex: 1 }), // 자동으로 붙은 것 — 제외
    ];
    const d = discountSummary(rows, SESSION);
    expect(d.count).toBe(1);
    expect(d.total).toBe(50_000);
    expect(d.entryLoss).toBe(0.5);   // 실제 엔트리 차감(현금 1건 0.5)과 일치
  });
});

// ── 가게지원 — 티켓과 달리 할인을 반영한다(매장이 그만큼 덜 부담한다) ──
describe('가게지원 가치 — 매장이 실제로 부담한 몫', () => {
  it('할인 없으면 단가 전액 · 엔트리 1', () => {
    const f = buyinFinance(buyin({ paymentMethod: 'support' }), SESSION);
    expect(f).toMatchObject({ entry: 1, value: 100_000, support: 1, paid: 0 });
  });

  it('할인5만이면 5만 부담 · 엔트리 0.5 — value/단가 === entry', () => {
    const f = buyinFinance(buyin({ paymentMethod: 'support', discountIndex: 1 }), SESSION);
    expect(f.entry).toBe(0.5);
    expect(f.value).toBe(50_000);
    expect(f.value / SESSION.buyinAmount).toBe(f.entry);
  });
});
