// 2026-10-01 금액 불변식 — 'T' 는 **차감된 이용권 장수**, '기준 대비 차액' 은 달성률과 **같은 모집단**.
//
// 요구 원천: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\audit-store-1001.md#S-01·S-02·S-03
//            C:\Users\buffy\Documents\누리홀덤_영상분석_0930\fable-money-1001.md#판정①②③ · 기대값 표 · 불변식 1~5
//            오너 결정 10-01: ① N 미설정 게임은 참가비 ÷ 1만 장 ② N=10·12만 게임은 10장이면 완납(min 규칙).
// 보는 것: 화면 정본 함수(buyinFinance·addonFinance·ticketUsedT·ledgerMoney·settlementReport)가 서버가 기록한 장수(k)를 T 로 쓰고,
//          돈(tender·value·entry)은 한 글자도 바꾸지 않는지. 서버가 k 를 어떻게 정하는지는 20261001j 리허설 몫이다.
// 음성 대조: 원본 main(c127db7f)에서 C4·C5·C9·사례 B·C11·불변식 1·3·4 가 빨갛다(보고서 money-fix-report.md).
// 실행: npx vitest run src/api/moneyT1001.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addonFinance, buyinFinance, ledgerMoney, rowToBuyin, ticketUsedT, type LedgerBuyin, type LedgerSession } from './ledger';
import { settlementReport } from '../lib/ledgerSettlement';

const DAY = '2026-10-01';
const sess = (buyinAmount: number, over: Partial<LedgerSession> = {}): LedgerSession => ({
  venueId: 'v', sessionDate: DAY, gameSeq: 1, buyinAmount, cardAmount: null,
  gameType: 'gtd', targetEntries: 0, maxEntries: 0, isAddon: true, addonStack: 0, addonAmount: 50_000,
  regClosed: false, closed: false, discounts: [{ label: '첫 바인', amount: 30_000 }], earlyDoubleMin: 0, earlySingleMin: 0,
  ...over,
});
let seq = 0;
const row = (over: Record<string, unknown>): LedgerBuyin => rowToBuyin({
  id: `b${++seq}`, venue_id: 'v', session_date: DAY, game_seq: 1, player_name: `p${seq}`, entry_no: 1,
  is_unpaid: false, buyin_at: `${DAY}T12:00:00Z`, is_split: false, payment_method: 'cash',
  cash_amount: 0, card_amount: 0, transfer_amount: 0, ticket_count: 0, unpaid_amount: 0,
  discount_level: 0, discount_index: 0, early_override: null, request_id: null, ...over,
});
/** 접수대 이용권 승인 행(전액 이용권) — 서버(20261001j)가 ticket_count = 묶인 장수 k 를 남긴다. */
const ticketRow = (k: number, over: Record<string, unknown> = {}) =>
  row({ payment_method: 'ticket', request_id: `req${seq}`, ticket_count: k, ...over });
const T = (b: LedgerBuyin, s: LedgerSession) => ticketUsedT(buyinFinance(b, s), addonFinance(b));

describe('Fable 기대값 표 — T 는 장수, 돈은 그대로', () => {
  it('🔴 C4(=사례 A) 12만 · N=10 · 10장 → T 10 · 이용권 12만 · 엔트리 1', () => {
    const s = sess(120_000), b = ticketRow(10);
    const f = buyinFinance(b, s);
    expect(T(b, s)).toBe(10);
    expect(f.tender.ticket).toBe(120_000);
    expect(f.value).toBe(120_000);
    expect(f.entry).toBe(1);
    expect(ledgerMoney([b], s)).toMatchObject({ paid: 0, unpaid: 0, ticket: 10, entry: 1 });
    const r = settlementReport(DAY, [s], [b], []);
    expect(r.total.ticketT).toBe(10);
    expect(r.total.tender.ticket).toBe(120_000);
  });
  it('🔴 C5 10만 · 1장으로 기록된 행 → T 1 · 이용권 10만(서버가 남긴 장수를 그대로 센다)', () => {
    const s = sess(100_000), b = ticketRow(1);
    expect(T(b, s)).toBe(1);
    expect(buyinFinance(b, s).tender.ticket).toBe(100_000);
  });
  it('🔴 C9(=사례 C′) 10만 현금 + 애드온 5만을 1장으로 기록 → 바인 0 + 애드온 1 = T 1 · ticketWon 5만', () => {
    const s = sess(100_000);
    const b = row({ payment_method: 'cash', cash_amount: 100_000, addon_method: 'ticket', addon_unpaid: false, addon_amount: 50_000, addon_ticket_count: 1 });
    expect(T(b, s)).toBe(1);
    expect(addonFinance(b)).toMatchObject({ revenue: 0, unpaid: 0, ticketWon: 50_000 });
    expect(ledgerMoney([b], s)).toMatchObject({ paid: 100_000, ticket: 1 });
  });
  it('🔴 사례 B 10만 · 3만 할인 · 1장 기록 → T 1 · 이용권 7만 · 엔트리 0.7', () => {
    const s = sess(100_000), b = ticketRow(1, { discount_index: 1 });
    const f = buyinFinance(b, s);
    expect(T(b, s)).toBe(1);
    expect(f.tender.ticket).toBe(70_000);
    expect(f.entry).toBeCloseTo(0.7, 10);
  });
  it('사례 B′ 10만 · 3만 할인 · N=10 · 7장 → T 7 · 7만', () => {
    const s = sess(100_000), b = ticketRow(7, { discount_index: 1 });
    expect(T(b, s)).toBe(7);
    expect(buyinFinance(b, s).tender.ticket).toBe(70_000);
  });
  it('사례 C 애드온 5만 · 5장(전액 이용권) → T 5 · ticketWon 5만', () => {
    const b = row({ addon_method: 'ticket', addon_unpaid: false, addon_amount: 50_000, addon_ticket_count: 5 });
    expect(T(b, sess(100_000)) - buyinFinance(b, sess(100_000)).ticketPaid).toBe(5);
    expect(addonFinance(b).ticketWon).toBe(50_000);
  });
  it('사례 D(=C10) 애드온 5만 · 2장 + 3만 미수 → T 2 · ticketWon 2만 · 미수 3만', () => {
    const b = row({ addon_method: 'cash', addon_unpaid: true, addon_amount: 50_000, addon_ticket_count: 2 });
    expect(addonFinance(b)).toMatchObject({ revenue: 0, unpaid: 30_000, ticketWon: 20_000, ticketT: 2 });
  });
});

/** C11 — 기준 40 · 바인 10(현금 6 · 이용권 2 · 미수 2) · 10만. */
const c11 = () => {
  const s = sess(100_000, { targetEntries: 40 });
  const rows = [
    ...Array.from({ length: 6 }, () => row({ payment_method: 'cash', cash_amount: 100_000 })),
    ticketRow(10), ticketRow(10),
    ...Array.from({ length: 2 }, () => row({ payment_method: 'cash', is_unpaid: true, cash_amount: 100_000 })),
  ];
  return { s, rows, r: settlementReport(DAY, [s], rows, []) };
};

describe('불변식', () => {
  it('🔴 1 재고 일치 — 하루 Σ ticketUsedT = 그날 차감된 이용권 장수', () => {
    const s = sess(120_000);
    const rows = [
      ticketRow(10),                                                     // C4: 10장
      ticketRow(1),                                                      // 예전 규칙으로 1장 묶인 행
      row({ payment_method: 'cash', cash_amount: 120_000, addon_method: 'ticket', addon_unpaid: false, addon_amount: 50_000, addon_ticket_count: 1 }),
      row({ payment_method: 'cash', is_split: true, request_id: 'rq', ticket_count: 9, cash_amount: 30_000 }),     // C4b 분납
      row({ payment_method: 'cash', cash_amount: 120_000, addon_method: 'cash', addon_unpaid: true, addon_amount: 50_000, addon_ticket_count: 2 }),
    ];
    const used = 10 + 1 + 1 + 9 + 2;
    expect(rows.reduce((t, b) => t + T(b, s), 0)).toBe(used);
    expect(ledgerMoney(rows, s).ticket).toBe(used);
    const r = settlementReport(DAY, [s], rows, []);
    expect(ticketUsedT({ ticketPaid: r.total.ticketT }, r.total.addon)).toBe(used);
  });

  it('2 돈 분리 — 장수(k)가 무엇이든 tender·value·entry 는 같다', () => {
    const s = sess(120_000, { discounts: [{ label: '할인', amount: 25_000 }] });
    for (const di of [0, 1]) {
      const base = buyinFinance(row({ payment_method: 'ticket', discount_index: di }), s);   // 장수 없는 행(레거시·수동)
      for (const k of [1, 7, 10]) {
        const f = buyinFinance(ticketRow(k, { discount_index: di }), s);
        expect({ tender: f.tender, value: f.value, entry: f.entry, gross: f.gross, disc: f.disc })
          .toEqual({ tender: base.tender, value: base.value, entry: base.entry, gross: base.gross, disc: base.disc });
      }
    }
    // 애드온 전액 이용권: 장수와 무관하게 ticketWon = 금액. 장수 없는 미수 표시는 금액 전부 미수(예전과 같다).
    for (const k of [0, 1, 5]) {
      expect(addonFinance({ addonMethod: 'ticket', addonUnpaid: false, addonAmount: 50_000, addonTicketCount: k }).tender)
        .toMatchObject({ ticket: 50_000, unpaid: 0 });
    }
    expect(addonFinance({ addonMethod: 'ticket', addonUnpaid: true, addonAmount: 50_000 }))
      .toMatchObject({ unpaid: 50_000, ticketWon: 0, ticketT: 0 });
  });

  it('🔴 3 한 카드 한 모집단 — C11 달성 25% · 차액 −300만 = Σ(엔트리 − 기준) × 단가', () => {
    const { r } = c11();
    const t = r.total;
    expect(Math.round((t.entries / t.targetEntries) * 100)).toBe(25);
    expect(t.gapWon).toBe(-3_000_000);
    expect(t.gapWon).toBe(t.value - t.targetRevenue);   // 애드온 엔트리 0 인 날
  });

  it('3′ 애드온 엔트리(W-06)가 있으면 엔트리 차 × 단가가 정식이다(value − 기준 매출과 갈린다)', () => {
    const s = sess(100_000, { targetEntries: 4, addonEntry: 0.5 });
    const rows = [row({ payment_method: 'cash', cash_amount: 100_000, addon_method: 'cash', addon_amount: 50_000 })];
    const r = settlementReport(DAY, [s], rows, []);
    expect(r.total.entries).toBe(1.5);
    expect(r.total.gapWon).toBe((1.5 - 4) * 100_000);
    expect(r.games[0].gapWon).toBe(r.total.gapWon);
  });

  it('🔴 4 표시 — 정산·통계·장부 요약에 \'1T = 1만원\' 꼬리표가 없다(원·장 분리 표기)', () => {
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    for (const f of ['LedgerSettlementPanel.tsx', 'LedgerStatsPanel.tsx']) {
      const code = strip(readFileSync(join(__dirname, '../components/features', f), 'utf-8'));
      expect(code, f).not.toMatch(/1T ?= ?1만/);
    }
    // 장부 요약(정산 대차표)의 '티켓 (NT · 1T=1만)' 꼬리표 — 분납 입력칸 안내(수동 분납은 1T = 1만이 정의)는 남는다.
    const pos = strip(readFileSync(join(__dirname, '../components/features/NuriPosLedger.tsx'), 'utf-8'));
    expect(pos).not.toMatch(/T\$\{stats\.ticketUnpaid[^\n]*· 1T=1만\)/);
    // 정산 '매장이용권' 타일은 장수를 원에서 거꾸로 만들지 않는다.
    const panel = strip(readFileSync(join(__dirname, '../components/features/LedgerSettlementPanel.tsx'), 'utf-8'));
    expect(panel).not.toMatch(/tender\.ticket \/ TICKET_WON/);
    expect(panel).not.toMatch(/t\.revenue - t\.targetRevenue/);
  });

  it('🔴 6 서버(20261001j) — 비밀번호 감액도 이용권 장수를 못 바꾸고, 잠금 문구는 접수대용 합니다체(오너 10-01 ①②)', () => {
    const sql = readFileSync(join(__dirname, '../../supabase/migrations/20261001j_voucher_t_is_count.sql'), 'utf-8').replace(/\r\n/g, '\n');
    const fn = (name: string) => {
      const i = sql.indexOf(`create or replace function public.${name}(`);
      expect(i, name).toBeGreaterThan(-1);
      return sql.slice(i, sql.indexOf('\nend', i));
    };
    const MSG = '이용권으로 승인한 바인은 결제 수단·할인·이용권 장수를 바꿀 수 없습니다(남은 금액의 결제 방법만 바꿀 수 있습니다). 바꾸려면 바인을 취소한 뒤 다시 승인하십시오.';
    // critical-reviewer 10-01 F1 — 장수·분납·할인은 언제나, 전액 이용권 행은 결제수단·미수까지 잠근다(두 곳 같은 조건).
    const lockRe = (n: string, o: string) => new RegExp(
      `${o}\\.request_id is not null and coalesce\\(${o}\\.ticket_count, 0\\) > 0\\s+`
      + `and \\(\\(${n}\\.ticket_count, ${n}\\.is_split, ${n}\\.discount_index\\) is distinct from \\(${o}\\.ticket_count, ${o}\\.is_split, ${o}\\.discount_index\\)\\s+`
      + `or \\(not coalesce\\(${o}\\.is_split, false\\)\\s+`
      + `and \\(${n}\\.payment_method, ${n}\\.is_unpaid\\) is distinct from \\(${o}\\.payment_method, ${o}\\.is_unpaid\\)\\)\\)`);
    const reduce = fn('update_ledger_buyin_reduce');
    expect(reduce).toMatch(lockRe('x', 'r'));
    expect(reduce).toContain(MSG);
    // 감액 금액 규칙은 그대로 거친다(양성: 금액만 줄이는 수정은 통과 — 리허설 L8·R4)
    expect(reduce).toContain('x := public._ledger_buyin_apply_amount_rule(x);');
    const guard = fn('_ledger_buyins_client_guard');
    expect(guard).toMatch(lockRe('new', 'old'));
    expect(guard).toContain(MSG);
    // 1만 원 미만 이용권 거절(유지) — 접수대용 합니다체 문구
    expect(fn('approve_buyin_request')).toContain("'참가비(할인 후 %원)가 1만 원 미만인 게임은 이용권으로 낼 수 없습니다. 요청을 거절하고 현금·카드·계좌로 받으십시오.'");
    // 라이브 정의 게이트 4개 · 적용 전 초안 표기
    for (const m of ['de5cd99da0c1aadb34e5535bcb7705da', '35e7504abaae6d7c62ce93f3eaebdfde', 'eee44d4d0c9c53e9fda390227d5f30c2', 'a74bbdeaaeea76735902521a400a720e']) {
      expect(sql.split('do $gate$')[1]?.split('end $gate$')[0], m).toContain(m);
    }
    expect(sql.split('\n')[0]).toMatch(/^-- ⏳ 초안\(미적용\)/);
  });

  it('5 분납·수동 행은 예전과 같은 수(음성 대조군)', () => {
    const s = sess(100_000);
    // 접수대 분납: 7장 + 현금 3만 → T 7 · 이용권 7만 · 현금 3만
    const sp = buyinFinance(row({ payment_method: 'cash', is_split: true, request_id: 'r', ticket_count: 7, cash_amount: 30_000 }), s);
    expect([sp.ticketPaid, sp.tender.ticket, sp.tender.cash]).toEqual([7, 70_000, 30_000]);
    // 수동 분납(요청 없음): 접수대가 넣은 T 3 + 현금 7만
    const mp = buyinFinance(row({ payment_method: 'cash', is_split: true, ticket_count: 3, cash_amount: 70_000 }), s);
    expect([mp.ticketPaid, mp.tender.ticket]).toEqual([3, 30_000]);
    // 수동 전액 이용권(요청 없음 · 장수 미기록): 참가비 ÷ 1만(오너 ① — N 미설정 = 참가비 ÷ 1만 장과 같은 수)
    expect(buyinFinance(row({ payment_method: 'ticket' }), s).ticketPaid).toBe(10);
    expect(buyinFinance(row({ payment_method: 'ticket', discount_index: 1 }), s).ticketPaid).toBe(7);
    // 요청 행인데 장수 0(20261001j 이전 승인) → 예전 식(참가비 − 할인) ÷ 1만
    expect(buyinFinance(row({ payment_method: 'ticket', request_id: 'old' }), s).ticketPaid).toBe(10);
    // 분납 애드온(카드 + 3장) → T 3 · 2만 카드
    expect(addonFinance({ addonMethod: 'card', addonUnpaid: false, addonAmount: 50_000, addonTicketCount: 3 }))
      .toMatchObject({ revenue: 20_000, ticketWon: 30_000, ticketT: 3 });
    // 애드온 장수 미기록 전액 이용권(레거시) → 금액 ÷ 1만
    expect(addonFinance({ addonMethod: 'ticket', addonUnpaid: false, addonAmount: 50_000 }).ticketT).toBe(5);
  });
});
