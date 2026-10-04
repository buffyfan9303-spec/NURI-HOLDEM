// 장부 티켓 대조 — 손계산 예시(오너 2026-10-04 F4-02 · 세 수 정의는 ticketCheck.ts 머리).
// 음성 대조: ticketCheck 에서 가불 티켓을 빼지 않거나(ticketUsedT 대신 ticketPaid+ticketUnpaid) 애드온 장수를 빼먹으면,
//   또는 '실명(닉네임)' 대조를 지우면 아래 🔴 가 빨개진다.
// 실행: npx vitest run src/lib/ticketCheck.test.ts
import { describe, it, expect } from 'vitest';
import { rowToBuyin, type LedgerSession } from '../api/ledger';
import { ticketCheck } from './ticketCheck';

const DAY = '2026-10-04';
const S: LedgerSession = {
  venueId: 'v', sessionDate: DAY, gameSeq: 1, buyinAmount: 100_000, cardAmount: null,
  gameType: 'gtd', targetEntries: 0, maxEntries: 0, isAddon: true, addonStack: 0, addonAmount: 50_000,
  regClosed: false, closed: false, discounts: [{ label: '1레벨', amount: 50_000 }], earlyDoubleMin: 0, earlySingleMin: 0,
};
let seq = 0;
const row = (name: string, over: Record<string, unknown>) => rowToBuyin({
  id: `b${++seq}`, venue_id: 'v', session_date: DAY, game_seq: 1, player_name: name, entry_no: 1,
  is_unpaid: false, buyin_at: `${DAY}T12:00:00Z`, is_split: false, payment_method: 'cash',
  cash_amount: 0, card_amount: 0, transfer_amount: 0, ticket_count: 0, unpaid_amount: 0,
  discount_level: 0, discount_index: 0, early_override: null, request_id: null, ...over,
});

// 10만 게임(1레벨 할인 5만) 하루:
//   A 김철수(철수)  티켓 완납(직접 기록)                → 10장 · 티켓 바인 1회
//   B 영희         접수대 이용권 3장 + 현금 7만 분납     →  3장 · 티켓 바인 1회
//   C 민수         티켓 가불(미수)                       →  0장(아직 안 받음)
//   D 지훈         할인 티켓 완납(직접 기록, 5만)        →  5장 · 티켓 바인 1회
//   E 수진         현금 바인 + 애드온 이용권 1장         →  1장(애드온 — 바인 횟수 아님)
//   장부 티켓 = 10 + 3 + 5 + 1 = 19장 · 티켓 바인 3회
// 들어온 이용권: 철수 4 · 영희 3 · 수진 1 · 하늘 2(아직 장부에 없음) = 10장
//   부족 = 19 − 10 = 9장 · 손님별 부족: 김철수(철수) 6 · 지훈 5 · 장부 미기록(합계 기준) 0
const buyins = [
  row('김철수(철수)', { payment_method: 'ticket' }),
  row('영희', { is_split: true, request_id: 'r1', ticket_count: 3, cash_amount: 70_000 }),
  row('민수', { payment_method: 'ticket', is_unpaid: true }),
  row('지훈', { payment_method: 'ticket', discount_index: 1 }),
  row('수진', { cash_amount: 100_000, addon_method: 'ticket', addon_unpaid: false, addon_amount: 50_000, addon_ticket_count: 1 }),
];
const uses = [...Array(4).fill('철수'), ...Array(3).fill('영희'), '수진', '하늘', '하늘'].map((playerName) => ({ playerName }));

describe('ticketCheck — 장부 티켓 · 들어온 이용권 · 부족', () => {
  const r = ticketCheck([S], buyins, uses);
  it('🔴 세 수 = 19장 · 10장 · 9장, 티켓 바인 3회', () => {
    expect([r.ledgerT, r.receivedT, r.shortT, r.extraT, r.ticketBuyins]).toEqual([19, 10, 9, 0, 3]);
  });
  it('🔴 손님별 — 실명(닉네임) 행은 닉네임으로 온 이용권과 맞춘다 · 가불 손님은 0장', () => {
    const m = Object.fromEntries(r.rows.map((x) => [x.name, [x.ledgerT, x.receivedT, x.shortT]]));
    expect(m).toEqual({
      '김철수(철수)': [10, 4, 6], 지훈: [5, 0, 5], 영희: [3, 3, 0], 수진: [1, 1, 0], 하늘: [0, 2, 0],
    });
    expect(r.rows.slice(0, 2).map((x) => x.name)).toEqual(['김철수(철수)', '지훈']);   // 부족 큰 순
  });
  it('들어온 쪽이 많으면 부족 0 · 장부 미기록으로 보인다', () => {
    const x = ticketCheck([S], [], [{ playerName: '하늘' }]);
    expect([x.ledgerT, x.receivedT, x.shortT, x.extraT, x.ticketBuyins]).toEqual([0, 1, 0, 1, 0]);
  });
  it('세션 없는 행은 세지 않는다(단가를 모름)', () => {
    expect(ticketCheck([], buyins, []).ledgerT).toBe(0);
  });
});
