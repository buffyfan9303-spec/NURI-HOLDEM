// 장부 금액 계산 전수 테스트 — 매출/미수/엔트리/티켓이 결제수단×미수×할인 조합에서 정확한지 고정한다.
//
// 왜 필요한가: 2026-07 '레벨 할인' 사건 — 분납의 discountLevel 이 계산 어디에도 반영되지 않는
//   죽은 값이었고(매출·엔트리 누락), 분납 저장 시 discount_index 를 0으로 덮어써 할인 기록까지 사라졌다.
//   빌드·린트·E2E 모두 통과하는데도 돈 계산만 조용히 틀리는 유형이라, 값으로 못 박아 재발을 막는다.
//
// 실행: npx vitest run src/api/ledger.money.test.ts
import { describe, it, expect } from 'vitest';
import { buyinFinance, discountSummary, isBuyinExcluded, nonSplitSnapshot, splitMismatch, SNAPSHOT_SINCE, cardUnit, wonToMan, type LedgerBuyin , ledgerCounts} from './ledger';

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

  it('🔴 카드도 현금과 같은 바인 가치다 — 결제수단이 가치를 바꾸지 않는다(2026-09-11)', () => {
    // 예전엔 카드만 cardUnit(11만)으로 계산해 같은 자리가 카드 손님에게만 비싼 바인이 됐다.
    const card = buyinFinance(buyin({ paymentMethod: 'card' }), SESSION);
    const cash = buyinFinance(buyin({ paymentMethod: 'cash' }), SESSION);
    expect(card.value).toBe(cash.value);
    expect(card.value).toBe(100_000);
    expect(card.entry).toBe(1);
  });

  it('cardUnit 자체는 남아 있다 — 다만 바인 가치 계산에는 쓰이지 않는다', () => {
    expect(cardUnit(SESSION)).toBe(110_000);
    expect(cardUnit({ ...SESSION, cardAmount: null })).toBe(100_000);
    // 기록 경로도 현금 단가를 쓴다 → 카드 바인이 더 비싸지지 않는다
    expect(nonSplitSnapshot('card', 0, SESSION).card_amount).toBe(100_000);
  });

  it('가게지원 = 매출·미수 0이지만 엔트리 1 (참가로 집계)', () => {
    const f = buyinFinance(buyin({ paymentMethod: 'support' }), SESSION);
    expect(f).toMatchObject({ paid: 0, unpaid: 0, entry: 1, support: 1 });
  });

  it('티켓(이용권)은 현금 매출이 아니다. 매출 0, 티켓 1장 회수', () => {
    const f = buyinFinance(buyin({ paymentMethod: 'ticket' }), SESSION);
    expect(f).toMatchObject({ paid: 0, ticketPaid: 10, ticketUnpaid: 0, entry: 1 });
  });

  it('티켓 미수(가불) = 회수 티켓이 아니라 미수 티켓', () => {
    const f = buyinFinance(buyin({ paymentMethod: 'ticket', isUnpaid: true }), SESSION);
    expect(f).toMatchObject({ ticketPaid: 0, ticketUnpaid: 10 });
  });
});

describe('할인 이벤트 적용 (discountIndex)', () => {
  it('🔴 회귀 방지: 5만 할인 현금 완납 = 매출 5만 (0이 되면 안 된다)', () => {
    const f = buyinFinance(buyin({ discountIndex: 1 }), SESSION);
    expect(f.paid).toBe(50_000);
    expect(f.paid).not.toBe(0);
  });

  it('🔴 5만 할인 = 금액 5만 · 바이인 1회 · 엔트리 0.5', () => {
    const b = buyin({ discountIndex: 1 });
    const f = buyinFinance(b, SESSION);
    expect(ledgerCounts([b]).totalBuyins).toBe(1);   // 횟수는 할인과 무관
    expect(f.entry).toBe(0.5);                       // 엔트리는 금액 기준 — 오너 예시 그대로
    expect(f).toMatchObject({ gross: 100_000, disc: 50_000, value: 50_000, paid: 50_000 });
  });

  it('🔴 3만 할인 = 금액 7만 · 바이인 1회 · 엔트리 0.7', () => {
    const b = buyin({ discountIndex: 2 });
    const f = buyinFinance(b, SESSION);
    expect(ledgerCounts([b]).totalBuyins).toBe(1);
    expect(f.entry).toBeCloseTo(0.7, 10);
    expect(f).toMatchObject({ gross: 100_000, disc: 30_000, value: 70_000, paid: 70_000 });
  });

  it('할인 + 미수 = 할인 후 금액이 미수로 잡힌다(매출 아님) · 바이인 1회', () => {
    const f = buyinFinance(buyin({ discountIndex: 1, isUnpaid: true }), SESSION);
    expect(f).toMatchObject({ paid: 0, unpaid: 50_000, entry: 0.5, value: 50_000 });
  });

  it('카드 + 5만 할인 = 현금과 같은 5만 (카드단가를 쓰지 않는다)', () => {
    const b = buyin({ paymentMethod: 'card', discountIndex: 1 });
    const f = buyinFinance(b, SESSION);
    expect(f.paid).toBe(50_000);
    expect(ledgerCounts([b]).totalBuyins).toBe(1);
    expect(f.entry).toBe(0.5);
  });

  it('할인이 단가보다 크면 금액은 0 으로 막히고 바이인은 그대로 1회', () => {
    const s = { ...SESSION, buyinAmount: 30_000, cardAmount: null };
    const b = buyin({ discountIndex: 1 });
    const f = buyinFinance(b, s); // 3만 게임에 5만 할인
    expect(f.paid).toBe(0);
    expect(ledgerCounts([b]).totalBuyins).toBe(1);  // 자리는 찼다 — 횟수는 줄지 않는다
    expect(f.entry).toBe(0);        // 전액 할인이라 프라이즈풀 기여는 0
    expect(f.disc).toBe(30_000);    // 정상가를 넘지 못하게 잘린다
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
    const f = buyinFinance(buyin({ isSplit: true, cardAmount: 40_000, ticketCount: 10 }), SESSION); // 10T = 10만
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

  it('할인 적용 분납(5만만 받음) = 금액 5만 · 바이인 1회 · 엔트리 0.5', () => {
    const b = buyin({ isSplit: true, cashAmount: 50_000, discountIndex: 1 });
    const f = buyinFinance(b, SESSION);
    expect(f.paid).toBe(50_000);
    expect(ledgerCounts([b]).totalBuyins).toBe(1);
    expect(f.entry).toBe(0.5);
    expect(f).toMatchObject({ gross: 100_000, disc: 50_000, value: 50_000 });
  });

  it('🔴 분납 합계가 할인 적용금액과 어긋나면 splitMismatch 가 잡는다', () => {
    // 10만 게임 · 5만 할인 → 받아야 할 금액 5만. 현금 3만만 넣으면 2만 부족.
    const bad = { cashAmount: 30_000, cardAmount: 0, transferAmount: 0, ticketCount: 0, unpaidAmount: 0, discountIndex: 1 };
    expect(splitMismatch(bad, SESSION)).toBe(-20_000);
    // 현금 3만 + 이용권 2T(2만) = 5만 → 정상
    expect(splitMismatch({ ...bad, ticketCount: 2 }, SESSION)).toBe(0);
    // 6만을 넣으면 1만 초과
    expect(splitMismatch({ ...bad, cashAmount: 60_000 }, SESSION)).toBe(10_000);
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

  it('단가 0 + 금액 0 이어도 기록이 있으면 바이인 1회다', () => {
    // 기록이 존재한다는 것 자체가 '자리에 앉았다' 는 뜻이다. 금액이 0 일 뿐이다.
    const s = { buyinAmount: 0, cardAmount: null };
    const f = buyinFinance(buyin({ isSplit: true }), s);
    expect(f.entry).toBe(1);
    expect(f.value).toBe(0);
  });

  it('wonToMan 표시 · 만원 단위 변환', () => {
    expect(wonToMan(100_000)).toBe('10');
    expect(wonToMan(77_000)).toBe('7.7');
    expect(wonToMan(0)).toBe('0');
  });
});

describe('합계 정합성 · 여러 바인의 매출 합이 기대와 일치', () => {
  it('현금완납 + 5만할인 + 미수 + 티켓 + 지원 = 매출 15만 · 미수 10만 · 티켓 1 · 바이인 5회', () => {
    const rows = [
      buyin({ paymentMethod: 'cash' }),                          // 10만 매출, 바이인 1회
      buyin({ paymentMethod: 'cash', discountIndex: 1 }),        // 5만 매출, 바이인 1회 (할인은 금액만 깎는다)
      buyin({ paymentMethod: 'cash', isUnpaid: true }),          // 미수 10만, 바이인 1회
      buyin({ paymentMethod: 'ticket' }),                        // 티켓 1, 바이인 1회
      buyin({ paymentMethod: 'support' }),                       // 지원, 바이인 1회
    ];
    const t = rows.map((b) => buyinFinance(b, SESSION))
      .reduce((a, f) => ({
        paid: a.paid + f.paid, unpaid: a.unpaid + f.unpaid,
        entry: a.entry + f.entry, ticket: a.ticket + f.ticketPaid,
      }), { paid: 0, unpaid: 0, entry: 0, ticket: 0 });

    expect(t.paid).toBe(150_000);
    expect(t.unpaid).toBe(100_000);
    expect(t.ticket).toBe(10);
    // 횟수와 엔트리는 서로 다른 수다 — 둘 다 못박는다(오너 규칙 2026-09-11).
    expect(ledgerCounts(rows).totalBuyins).toBe(5);   // 5건이면 5회 — 할인은 횟수를 줄이지 않는다
    expect(t.entry).toBe(4.5);                        // 엔트리는 5만 할인만큼 0.5 줄어든다
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

  it('분납 카드 4만 + 티켓 10T(=10만) = 가치 14만 · 매출은 4만', () => {
    const b = buyin({ isSplit: true, cardAmount: 40_000, ticketCount: 10 }); // 10T = 10만
    expect(buyinFinance(b, SESSION).paid).toBe(40_000);
    expect(value(b)).toBe(140_000);
  });

  it('분납 현금 3만 + 미수 7만 = 가치 10만', () => {
    expect(value(buyin({ isSplit: true, cashAmount: 30_000, unpaidAmount: 70_000 }))).toBe(100_000);
  });
});

// ── 티켓 가치 — 기본은 단가 전액, 할인이 입력돼 있으면 반영 ──────────────────
// 오너 정정(2026-09-05): "할인이 걸리면 할인은 따로 입력할 테니까,
//                        티켓이라고 무조건 10으로 입력하면 안 되지."
// 원래 결함은 '할인'이 아니라 **가치가 통째로 0원**이던 것이었다(총바인 0만). 그 수정만 남긴다.
describe('티켓 가치 — 할인 없으면 단가 전액, 있으면 그만큼', () => {
  it('할인 없는 티켓 = 단가 전액 · 엔트리 1 — 10T = 10만(1T=1만원)', () => {
    const f = buyinFinance(buyin({ paymentMethod: 'ticket' }), SESSION);
    expect(f).toMatchObject({ entry: 1, value: 100_000, ticketPaid: 10, paid: 0 });
  });

  it('할인5만이 입력된 티켓 → 가치 5만 · 바이인 1회 · 엔트리 0.5 (5T)', () => {
    const b = buyin({ paymentMethod: 'ticket', discountIndex: 1 });
    const f = buyinFinance(b, SESSION);
    expect(f.value).toBe(50_000);
    expect(ledgerCounts([b]).totalBuyins).toBe(1);
    expect(f.entry).toBe(0.5);
    expect(f.ticketPaid).toBe(5);    // 1T = 1만원
    expect(f.paid).toBe(0);          // 매출은 여전히 0 — 이용권은 현금성 수납이 아니다
  });

  it('티켓 미수도 같은 규칙', () => {
    const f = buyinFinance(buyin({ paymentMethod: 'ticket', isUnpaid: true, discountIndex: 1 }), SESSION);
    expect(f).toMatchObject({ entry: 0.5, value: 50_000, ticketUnpaid: 5, ticketPaid: 0 });
  });

  it("할인 집계는 티켓 행도 센다 — 따로 입력한 할인이라 '덜 받은 돈'이 맞다", () => {
    const rows = [
      buyin({ playerName: 'A', paymentMethod: 'cash', discountIndex: 1 }),
      buyin({ playerName: 'B', paymentMethod: 'ticket', discountIndex: 1 }),
    ];
    const d = discountSummary(rows, SESSION);
    expect(d.count).toBe(2);
    expect(d.total).toBe(100_000);
    // 할인은 **횟수는 그대로, 엔트리만** 깎는다 — 2건이면 2회이고 엔트리는 각 0.5.
    expect(ledgerCounts(rows).totalBuyins).toBe(2);
    expect(rows.map((r) => buyinFinance(r, SESSION).entry)).toEqual([0.5, 0.5]);
  });
});

// ── 가게지원 — 티켓과 달리 할인을 반영한다(매장이 그만큼 덜 부담한다) ──
describe('가게지원 가치 — 매장이 실제로 부담한 몫', () => {
  it('할인 없으면 단가 전액 · 엔트리 1', () => {
    const f = buyinFinance(buyin({ paymentMethod: 'support' }), SESSION);
    expect(f).toMatchObject({ entry: 1, value: 100_000, support: 1, paid: 0 });
  });

  it('할인5만이면 5만 부담 · 바이인 1회 · 엔트리 0.5', () => {
    const b = buyin({ paymentMethod: 'support', discountIndex: 1 });
    const f = buyinFinance(b, SESSION);
    expect(ledgerCounts([b]).totalBuyins).toBe(1);
    expect(f.entry).toBe(0.5);
    expect(f.value).toBe(50_000);         // 매장이 그만큼 덜 부담한다
    expect(f.tender.support).toBe(50_000); // 지원액은 수납이 아니라 별도 항목
    expect(f.paid).toBe(0);                // 고객이 낸 돈은 0
  });
});

// ── 정산 제외 판정 (오너 지시 2026-09-05) ────────────────────────────────────
// "가게지원은 바인엔 포함되지만 정산 때 관계자·신규처럼 빼고 정산 가능하게" + "티켓·현금·카드도".
describe('정산 제외 — 방문자 유형 × 결제수단', () => {
  const VT: Record<string, string> = { 파이리: 'staff', 손님: 'regular' };
  const ex = (b: LedgerBuyin, keys: string[]) =>
    isBuyinExcluded(b, new Set(keys), (nm) => VT[nm]);

  it('아무것도 안 고르면 아무것도 빠지지 않는다', () => {
    expect(ex(buyin({ paymentMethod: 'support' }), [])).toBe(false);
  });

  it('관계자 제외 — 그 사람의 바인이 결제수단과 무관하게 빠진다', () => {
    expect(ex(buyin({ playerName: '파이리', paymentMethod: 'cash' }), ['visitor:staff'])).toBe(true);
    expect(ex(buyin({ playerName: '손님', paymentMethod: 'cash' }), ['visitor:staff'])).toBe(false);
  });

  it('결제수단 제외 — 가게지원·티켓·현금을 각각 뺄 수 있다', () => {
    expect(ex(buyin({ playerName: '손님', paymentMethod: 'support' }), ['method:support'])).toBe(true);
    expect(ex(buyin({ playerName: '손님', paymentMethod: 'ticket' }), ['method:ticket'])).toBe(true);
    expect(ex(buyin({ playerName: '손님', paymentMethod: 'cash' }), ['method:ticket'])).toBe(false);
  });

  it('분납은 쓰인 수단이 **전부** 제외 대상일 때만 빠진다', () => {
    const mixed = buyin({ playerName: '손님', isSplit: true, cashAmount: 40_000, ticketCount: 10 });
    expect(ex(mixed, ['method:ticket'])).toBe(false);          // 일부만 제외 → 남긴다
    expect(ex(mixed, ['method:ticket', 'method:cash'])).toBe(true); // 전부 제외 → 뺀다
  });

  it('분납이라도 방문자 유형이 걸리면 통째로 빠진다', () => {
    const b = buyin({ playerName: '파이리', isSplit: true, cashAmount: 100_000 });
    expect(ex(b, ['visitor:staff'])).toBe(true);
  });

  it('유형이 없는(미지정) 손님은 유형 제외에 걸리지 않는다', () => {
    expect(ex(buyin({ playerName: '무명', paymentMethod: 'cash' }), ['visitor:staff'])).toBe(false);
  });
});

// ── 할인 집계 정합성 (2026-09-05 자체 감사, 실측 표 기반) ─────────────────────
// 오너 지시: "할인이나 이런 것 모두 제대로 적용되도록 점검해서 다시 해줘".
describe('할인 집계 — 깎아 준 총액과 덜 받은 현금을 가른다', () => {
  it("티켓 할인은 '깎아 준 총액'에는 들어가지만 '덜 받은 현금'에는 안 들어간다", () => {
    // 티켓은 애초에 현금을 받지 않는다 → 할인해도 매출이 줄지 않는다.
    const d = discountSummary([buyin({ paymentMethod: 'ticket', discountIndex: 1 })], SESSION);
    expect(d.count).toBe(1);
    expect(d.total).toBe(50_000);      // 깎아 준 총액
    expect(d.cashTotal).toBe(0);       // 덜 받은 현금은 0
    // 할인이 걸려도 **횟수**는 1회, **엔트리**는 0.5 (오너 규칙 2026-09-11)
    const bt = buyin({ paymentMethod: 'ticket', discountIndex: 1 });
    expect(ledgerCounts([bt]).totalBuyins).toBe(1);
    expect(buyinFinance(bt, SESSION).entry).toBe(0.5);
  });

  it('가게지원 할인도 같다 — 현금은 0, 바인은 1회', () => {
    const d = discountSummary([buyin({ paymentMethod: 'support', discountIndex: 1 })], SESSION);
    expect(d).toMatchObject({ total: 50_000, cashTotal: 0 });
    const bs2 = buyin({ paymentMethod: 'support', discountIndex: 1 });
    expect(ledgerCounts([bs2]).totalBuyins).toBe(1);
    expect(buyinFinance(bs2, SESSION).entry).toBe(0.5);
  });

  it('현금 할인은 둘 다 잡힌다', () => {
    const d = discountSummary([buyin({ paymentMethod: 'cash', discountIndex: 1 })], SESSION);
    expect(d).toMatchObject({ total: 50_000, cashTotal: 50_000 });
  });

  it('분납이든 액면가든 바인은 1회다', () => {
    const split = buyin({ isSplit: true, ticketCount: 10, discountIndex: 1 });
    expect(buyinFinance(split, SESSION).entry).toBe(1);
  });

  it('할인이 단가보다 커도 바인은 1회 — 엔트리와 가치만 0이 된다', () => {
    // 전액 할인(무료 초대)이라도 **자리는 찼다**. 횟수 1 · 엔트리 0 · 가치 0 — 셋이 서로 다른 말을 한다.
    const S2 = { ...SESSION, discounts: [{ label: '과다', amount: 120_000 }] };
    const b = buyin({ paymentMethod: 'cash', discountIndex: 1 });
    const f = buyinFinance(b, S2);
    expect(ledgerCounts([b]).totalBuyins).toBe(1);   // 횟수는 남는다
    expect(f.entry).toBe(0);                          // 프라이즈풀 기여는 없다
    expect(f.disc).toBe(100_000);      // 정상가를 넘지 못하게 잘린다
    expect(f.value).toBe(0);           // 음수 가치는 만들지 않는다
  });

  it('여러 건 합산 — 현금 1건 + 티켓 1건', () => {
    const d = discountSummary([
      buyin({ playerName: 'A', paymentMethod: 'cash', discountIndex: 1 }),
      buyin({ playerName: 'B', paymentMethod: 'ticket', discountIndex: 1 }),
    ], SESSION);
    expect(d).toMatchObject({ count: 2, total: 100_000, cashTotal: 50_000 });
  });
});

// ── 정산 대차 항등식 (오너 2026-09-05 "장부가 핵심인데 논리에 안 맞는다") ─────
//   정가(gross) − 할인(disc) = 순액(value) = tender 합 (현금+카드+이체+티켓+지원+미수)
// 행마다 성립해야 합계표가 맞는다. 결제수단·할인·분납 전 조합을 돈다.
describe('정산 대차 — gross − disc === value === Σtender', () => {
  const sumT = (f: ReturnType<typeof buyinFinance>) =>
    f.tender.cash + f.tender.card + f.tender.transfer + f.tender.ticket + f.tender.support + f.tender.unpaid;
  const cases: [string, LedgerBuyin][] = [
    ['현금', buyin({ paymentMethod: 'cash', cashAmount: 100_000 })],
    ['현금+할인5만', buyin({ paymentMethod: 'cash', discountIndex: 1, cashAmount: 50_000 })],
    ['카드(11만)', buyin({ paymentMethod: 'card', cardAmount: 110_000 })],
    ['카드+할인5만', buyin({ paymentMethod: 'card', discountIndex: 1, cardAmount: 60_000 })],
    ['이체 미수', buyin({ paymentMethod: 'transfer', isUnpaid: true, transferAmount: 100_000 })],
    ['티켓', buyin({ paymentMethod: 'ticket' })],
    ['티켓+할인5만', buyin({ paymentMethod: 'ticket', discountIndex: 1 })],
    ['가게지원', buyin({ paymentMethod: 'support' })],
    ['가게지원+할인5만', buyin({ paymentMethod: 'support', discountIndex: 1 })],
    ['분납 카드4만+티켓10T', buyin({ isSplit: true, cardAmount: 40_000, ticketCount: 10 })],
    ['분납 현금5만+할인5만', buyin({ isSplit: true, cashAmount: 50_000, discountIndex: 1 })],
    ['분납 현금3만+미수7만', buyin({ isSplit: true, cashAmount: 30_000, unpaidAmount: 70_000 })],
  ];
  for (const [name, b] of cases) {
    it(`${name}: 항등식 성립`, () => {
      const f = buyinFinance(b, SESSION);
      expect(f.gross - f.disc).toBe(f.value);
      expect(sumT(f)).toBe(f.value);
    });
  }

  it('티켓 1장 = 단가 10만이 tender.ticket 에 돈으로 선다 (매출 paid 는 0)', () => {
    const f = buyinFinance(buyin({ paymentMethod: 'ticket' }), SESSION);
    expect(f.tender.ticket).toBe(100_000);
    expect(f.ticketPaid).toBe(10); // 자리 1개 = 10T
    expect(f.gross).toBe(100_000);
    expect(f.paid).toBe(0);
  });

  it('할인 5만 현금: 정가 10만 − 할인 5만 = 순액 5만 = 현금 5만', () => {
    const f = buyinFinance(buyin({ paymentMethod: 'cash', discountIndex: 1, cashAmount: 50_000 }), SESSION);
    expect(f).toMatchObject({ gross: 100_000, disc: 50_000, value: 50_000 });
    expect(f.tender.cash).toBe(50_000);
  });
});

// ── 스냅샷 센티널 — 금액이 아니라 기록 시각 ─────────────────────────────────
describe('스냅샷 센티널(SNAPSHOT_SINCE) — 100% 할인 0원이 되살아나지 않는다', () => {
  it('전환 이후 0원 스냅샷(무료 이벤트)은 할인 프리셋을 지워도 매출 0 이다', () => {
    const free = { ...SESSION, discounts: [{ label: '무료', amount: 100_000 }] };
    const snap = nonSplitSnapshot('cash', 1, free);          // cash_amount 0 저장
    expect(snap.cash_amount).toBe(0);
    const b = buyin({ paymentMethod: 'cash', discountIndex: 1, cashAmount: snap.cash_amount,
                      buyinAt: '2026-09-05T12:00:00Z' });
    const later = { ...SESSION, discounts: [{ label: '무료', amount: 0 }] }; // 프리셋 비움
    expect(buyinFinance(b, later).paid).toBe(0);              // 예전엔 100_000 으로 부활
  });

  it('전환 이전(레거시) 0원 행만 세션 참조로 재계산한다', () => {
    const b = buyin({ paymentMethod: 'cash', cashAmount: 0, buyinAt: '2026-07-01T12:00:00Z' });
    expect(buyinFinance(b, SESSION).paid).toBe(100_000);      // 레거시 하위호환
  });

  it('SNAPSHOT_SINCE 이후 buyinAt 이면 저장값 0 이 그대로 0 이다', () => {
    const b = buyin({ paymentMethod: 'cash', cashAmount: 0, buyinAt: `${SNAPSHOT_SINCE}T00:00:00Z` });
    expect(buyinFinance(b, SESSION).paid).toBe(0);
  });
});
