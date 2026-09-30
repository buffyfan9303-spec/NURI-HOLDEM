// 20260930i — 이용권이 모자라면 '이용권 k장 + 남은 금액' 분납(오너 결정 2026-09-30). 서버가 쓴 행을 화면·정산이 맞게 나누는지.
// 행 모양은 라이브 롤백 리허설 실측(마이그레이션 머리 표 S1·S4·S2·S3)을 그대로 옮겼다.
// 음성 대조: ledger.ts addonFinance 의 `const tk = …addonTicketCount…` 를 `const tk = 0` 으로 바꾸면 '애드온 3장 + 카드' 가,
//   buyinFinance 의 `&& !b.requestId` 를 지우면 '7장 + 미수' 가 빨개진다.
import { describe, it, expect } from 'vitest';
import { addonFinance, buyinFinance, ledgerMoney, rowToBuyin, voucherShortOf, type LedgerBuyin } from './ledger';

const DAY = '2026-09-30';
const S = { venueId: 'v', sessionDate: DAY, gameSeq: 1, buyinAmount: 100_000, cardAmount: null, discounts: [], addonEntry: 0 };
const row = (over: Record<string, unknown>): LedgerBuyin => rowToBuyin({
  id: 'x', venue_id: 'v', session_date: DAY, game_seq: 1, player_name: '손님', entry_no: 1, is_unpaid: false,
  buyin_at: `${DAY}T12:00:00Z`, is_split: false, cash_amount: 0, card_amount: 0, transfer_amount: 0, ticket_count: 0,
  unpaid_amount: 0, discount_level: 0, discount_index: 0, early_override: null, ...over,
});

describe('20260930i 바인 분납 — 이용권 7장 + 남은 3만', () => {
  it('7장 + 현금: 바인 1회 · 엔트리 1 · 이용권 7T · 현금 3만', () => {
    const b = row({ payment_method: 'cash', is_split: true, ticket_count: 7, cash_amount: 30_000, request_id: 'req' });
    const f = buyinFinance(b, S);
    expect(f.entry).toBe(1);
    expect(f.tender).toMatchObject({ ticket: 70_000, cash: 30_000, unpaid: 0 });
    expect(f.ticketPaid).toBe(7);
    expect(ledgerMoney([b], S)).toMatchObject({ paid: 30_000, unpaid: 0, value: 100_000, entry: 1, ticket: 7 });
  });
  it('7장 + 미수: 이용권 7T 는 받은 것(티켓 미수 아님) · 미수 3만', () => {
    const b = row({ payment_method: 'ticket', is_split: true, ticket_count: 7, unpaid_amount: 30_000, is_unpaid: true, request_id: 'req' });
    const f = buyinFinance(b, S);
    expect(f.ticketPaid).toBe(7);
    expect(f.ticketUnpaid).toBe(0);
    expect(f.unpaid).toBe(30_000);
    expect(f.entry).toBe(1);
  });
  it('기존 동작 유지: 장부에서 직접 쓴 티켓+미수 분납(요청 연결 없음)은 여전히 티켓 미수', () => {
    const f = buyinFinance(row({ payment_method: 'ticket', is_split: true, ticket_count: 7, unpaid_amount: 30_000, is_unpaid: true }), S);
    expect(f.ticketPaid).toBe(0);
    expect(f.ticketUnpaid).toBe(7);
  });
});

describe('20260930i 애드온 분납 — 5만 애드온에 이용권 3장', () => {
  const base = { payment_method: 'ticket', addon_amount: 50_000 };
  it('3장 + 카드: 애드온 1회 · 이용권 3만 · 카드 2만', () => {
    const a = addonFinance(row({ ...base, addon_method: 'card', addon_unpaid: false, addon_ticket_count: 3 }));
    expect(a).toMatchObject({ count: 1, revenue: 20_000, unpaid: 0, ticketWon: 30_000 });
    expect(a.tender).toMatchObject({ ticket: 30_000, card: 20_000, cash: 0, unpaid: 0 });
  });
  it('3장 + 미수: 미수 2만 · 이용권 3만', () => {
    const a = addonFinance(row({ ...base, addon_method: 'cash', addon_unpaid: true, addon_ticket_count: 3 }));
    expect(a).toMatchObject({ count: 1, revenue: 0, unpaid: 20_000, ticketWon: 30_000 });
  });
  it('이용권 몫이 남은 채 수단이 ticket·미수인 행(옛 데이터·서버 차단 전): 이용권 3만 · 미수 2만 — 이용권을 금액 전부로 세지 않는다', () => {
    const a = addonFinance(row({ ...base, addon_method: 'ticket', addon_unpaid: true, addon_ticket_count: 3 }));
    expect(a).toMatchObject({ count: 1, revenue: 0, unpaid: 20_000, ticketWon: 30_000 });
    expect(a.tender).toMatchObject({ ticket: 30_000, unpaid: 20_000 });
  });
  it('기존 동작 유지: 전액 이용권 · 현금 완납 · 현금 미수', () => {
    expect(addonFinance(row({ ...base, addon_method: 'ticket', addon_unpaid: false }))).toMatchObject({ revenue: 0, ticketWon: 50_000, unpaid: 0 });
    expect(addonFinance(row({ ...base, addon_method: 'cash', addon_unpaid: false }))).toMatchObject({ revenue: 50_000, ticketWon: 0 });
    expect(addonFinance(row({ ...base, addon_method: 'cash', addon_unpaid: true }))).toMatchObject({ unpaid: 50_000, ticketWon: 0 });
  });
  it('장부 합계: 바인 10T(이용권) + 애드온 3장·카드 → 이용권 13T · 받은 돈 2만', () => {
    const m = ledgerMoney([row({ ...base, addon_method: 'card', addon_unpaid: false, addon_ticket_count: 3 })], S);
    expect(m.ticket).toBe(13);
    expect(m.paid).toBe(20_000);
  });
});

describe('voucherShortOf — 서버 hint/detail 만 믿는다', () => {
  const e = (hint: string, details: unknown) => ({ code: '23514', message: '이용권이 모자랍니다', hint, details });
  it('VOUCHER_SHORT + 숫자 detail → 값', () => {
    expect(voucherShortOf(e('VOUCHER_SHORT', JSON.stringify({ need: 5, have: 3, ticketWon: 30000, remainder: 20000, use: 'addon' }))))
      .toEqual({ need: 5, have: 3, remainder: 20000, use: 'addon' });
  });
  it('다른 hint · 깨진 detail · 남은 금액 0 → null(분납 선택을 띄우지 않는다)', () => {
    expect(voucherShortOf(e('LEDGER_SESSION_MISSING', '{}'))).toBeNull();
    expect(voucherShortOf(e('VOUCHER_SHORT', 'not json'))).toBeNull();
    expect(voucherShortOf(e('VOUCHER_SHORT', JSON.stringify({ need: 5, have: 5, ticketWon: 50000, remainder: 0, use: 'buyin' })))).toBeNull();
    expect(voucherShortOf(new Error('x'))).toBeNull();
  });
});
