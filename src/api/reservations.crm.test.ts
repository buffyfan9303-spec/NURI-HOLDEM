// CRM(단골 관리·예약자 고객정보) 금액 = 장부 정본과 같은 값인지 고정한다.
//
// 왜 필요한가: 2026-09-05 감사 F04 — getCustomerActivity 가 buyinFinance 를 우회해
//   '현재 세션 현금단가 × 건수'로 다시 합산했다. 카드단가·할인 프리셋·기록 시점 수납 스냅샷이
//   전부 무시돼, 같은 손님·같은 기간인데 CRM '누적'과 통계 '완납 매출'·CSV가 갈렸다.
//   빌드·린트·E2E 는 전부 통과하는데 돈만 조용히 틀리는 유형이라 값으로 못 박는다.
//
// 실행: npx vitest run src/api/reservations.crm.test.ts
import { describe, it, expect } from 'vitest';
import { buyinFinance, customerLedgerTotals, rowToBuyin, type LedgerSession } from './ledger';

type SessionFin = Pick<LedgerSession, 'sessionDate' | 'gameSeq' | 'buyinAmount' | 'cardAmount' | 'discounts'>;

// 10만 게임 · 카드 11만 · 할인 프리셋 2종(5만 / 전액 10만)
const MAIN: SessionFin = {
  sessionDate: '2026-09-01', gameSeq: 1, buyinAmount: 100_000, cardAmount: 110_000,
  discounts: [{ label: '1레벨', amount: 50_000 }, { label: '전액', amount: 100_000 }],
};
// 같은 날 사이드 게임(5만) — 짝짓기 키가 `날짜#게임`이어야 단가가 섞이지 않는다
const SIDE: SessionFin = { sessionDate: '2026-09-01', gameSeq: 2, buyinAmount: 50_000, cardAmount: null, discounts: [] };
// 저장 후 단가를 10만 → 15만으로 올린 지난 장부. 기록 시점 스냅샷이 정본이라 과거 매출은 안 움직인다.
const RAISED: SessionFin = { sessionDate: '2026-08-20', gameSeq: 1, buyinAmount: 150_000, cardAmount: null, discounts: [] };

/** PostgREST 가 돌려주는 ledger_buyins 행 모양 그대로 — CRM 은 이 행을 rowToBuyin 으로 변환한다. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function row(over: Record<string, any> = {}): Record<string, any> {
  return {
    id: 'b', venue_id: 'v', session_date: '2026-09-01', game_seq: 1, player_name: '홍길동', entry_no: 1,
    payment_method: 'cash', is_unpaid: false, is_split: false,
    cash_amount: 0, card_amount: 0, transfer_amount: 0, ticket_count: 0, unpaid_amount: 0,
    discount_index: 0, buyin_at: '2026-09-01T12:00:00Z',
    ...over,
  };
}

// 문서 완료 기준의 7종 fixture — 카드/현금 단가차 · 5만 할인 · 전액 할인 0원 · 분납 · 미수 · 이용권 · 지원 + 단가 변경
const ROWS = [
  /* 1 현금 완납        */ row({ cash_amount: 100_000 }),
  /* 2 카드 완납(11만)  */ row({ payment_method: 'card', card_amount: 110_000 }),
  /* 3 현금 5만 할인    */ row({ discount_index: 1, cash_amount: 50_000 }),
  /* 4 전액 할인 0원    */ row({ discount_index: 2, cash_amount: 0 }),
  /* 5 분납 현4+카3+3T  */ row({ is_split: true, cash_amount: 40_000, card_amount: 30_000, ticket_count: 3 }),
  /* 6 현금 미수        */ row({ is_unpaid: true, cash_amount: 100_000 }),
  /* 7 이용권 결제      */ row({ payment_method: 'ticket' }),
  /* 8 가게지원         */ row({ payment_method: 'support' }),
  /* 9 사이드 현금 완납 */ row({ game_seq: 2, cash_amount: 50_000 }),
  /* 10 단가 인상 이전  */ row({ session_date: '2026-08-20', buyin_at: '2026-08-20T12:00:00Z', cash_amount: 100_000 }),
];
const SESSIONS = [MAIN, SIDE, RAISED];
const totals = () => customerLedgerTotals(ROWS.map(rowToBuyin), SESSIONS);

describe('CRM 고객 금액 — 장부 정본(buyinFinance) 재사용', () => {
  it('완납 누적 = 실제 수납액 48만 (카드단가·할인·스냅샷 반영)', () => {
    // 10 + 11 + 5 + 0 + 7 + 0(미수) + 0(이용권) + 0(지원) + 5(사이드) + 10(스냅샷) = 48만
    expect(totals().paid).toBe(480_000);
  });

  it('미수·회수 이용권·가게지원을 완납 누적에 합치지 않는다', () => {
    const t = totals();
    expect(t.unpaid).toBe(100_000);   // 미수 1건
    expect(t.ticket).toBe(13);        // 분납 3T + 이용권 결제 10T(10만 게임)
    expect(t.support).toBe(1);        // 가게지원 1건
  });

  it('폐기된 우회 산식(현재 현금단가 × 건수)과 실제로 갈린다 — 67만이 아니라 48만', () => {
    // 옛 getCustomerActivity 재현: 분납은 현금성 합, 비분납 완납은 '그 세션의 현재 현금단가'
    const unit = new Map(SESSIONS.map((s) => [`${s.sessionDate}#${s.gameSeq}`, s.buyinAmount]));
    let old = 0;
    for (const r of ROWS) {
      if (r.is_split) old += r.cash_amount + r.card_amount + r.transfer_amount;
      else if (r.payment_method !== 'support' && r.payment_method !== 'ticket' && !r.is_unpaid) {
        old += unit.get(`${r.session_date}#${r.game_seq}`) ?? 0;
      }
    }
    expect(old).toBe(670_000);
    expect(totals().paid).toBe(480_000); // 카드 −1만 · 할인 +5만 · 전액할인 +10만 · 단가인상 +5만 = 19만 과대계상
  });

  it('통계·CSV 와 같은 값 — 세션별 buyinFinance 합과 일치한다', () => {
    // LedgerStatsPanel / ledgerExport 의 조리법: 바인 × 그 (날짜#게임) 세션 → paid 합
    let csv = 0;
    for (const s of SESSIONS) {
      for (const r of ROWS) {
        if (r.session_date !== s.sessionDate || r.game_seq !== s.gameSeq) continue;
        csv += buyinFinance(rowToBuyin(r), s).paid;
      }
    }
    expect(csv).toBe(totals().paid);
  });

  it('짝지을 세션이 없으면 통계 패널과 같은 빈 세션(0원)으로 떨어진다 — 다른 게임 단가를 빌려오지 않는다', () => {
    const orphan = customerLedgerTotals([rowToBuyin(row({ game_seq: 9, cash_amount: 0, buyin_at: '2026-07-01T12:00:00Z' }))], SESSIONS);
    expect(orphan.paid).toBe(0);
  });
});
