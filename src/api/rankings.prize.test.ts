// 순위 상금의 티켓 표기(nT) — 서버 parse_prize_man(20260905f, 1T = 1만원) 과 같은 규칙인지 값으로 못 박는다.
// DB 실측표(2026-09-05): '1T'→1 · '2 t'→2 · '10T'→10 · '1.5T'→2(반올림) · '400'→400 · '1,000'→1000 · '1T0'→1 · 'T'→0
import { describe, it, expect } from 'vitest';
import { parsePrizeMan, parsePrizeTickets, formatPrize, TICKET_MAN } from './rankings';

describe('티켓 상금 파서 — 서버와 동일 규칙', () => {
  it.each([
    ['1T', 1], ['2 t', 2], ['10T', 10], ['1.5T', 2],
    ['400', 400], ['1000', 1000], ['1,000', 1000],
    ['1T0', 1],   // T 뒤에 숫자가 오면 티켓 표기가 아니다 → 첫 숫자(1)만
    ['T', 0], ['', 0], [null, 0], [undefined, 0],
  ] as const)('parsePrizeMan(%j) = %i 만', (input, man) => {
    expect(parsePrizeMan(input as string | null | undefined)).toBe(man);
  });

  it('parsePrizeTickets — 정수+T 만 장수로 본다', () => {
    expect(parsePrizeTickets('1T')).toBe(1);
    expect(parsePrizeTickets('3t')).toBe(3);
    expect(parsePrizeTickets('400')).toBe(0);
    expect(parsePrizeTickets('1T0')).toBe(0);
  });

  it('1T = 1만원 상수는 서버(20260905f)와 같아야 한다', () => {
    expect(TICKET_MAN).toBe(1);
  });

});

describe('formatPrize — 매장 설정에 따라 10T / 10만', () => {
  it('기본(설정 없음·ticket) 은 "10T"', () => {
    expect(formatPrize('10T')).toBe('10T');
    expect(formatPrize('10T', null)).toBe('10T');
    expect(formatPrize('10T', { ticketPrizeDisplay: 'ticket' })).toBe('10T');
    expect(formatPrize('2t', {})).toBe('2T');
  });
  it("매장이 'won' 을 고르면 만원 가치로 — 1T = 1만원", () => {
    expect(formatPrize('10T', { ticketPrizeDisplay: 'won' })).toBe('10만');
    expect(formatPrize('30T', { ticketPrizeDisplay: 'won' })).toBe('30만');
  });
  it('숫자 상금은 설정과 무관하게 "N만"', () => {
    expect(formatPrize('400', { ticketPrizeDisplay: 'won' })).toBe('400만');
    expect(formatPrize('1000')).toBe('1,000만');
  });
  it('빈 값·파싱 불가는 안전하게', () => {
    expect(formatPrize('')).toBe('');
    expect(formatPrize(null)).toBe('');
    expect(formatPrize('상품권')).toBe('상품권');
  });
});

// ── 프리셋·포스터 순위 상금(unit 'T') — 티켓 장수가 원 가치로 환산되고 상수가 한 값인지 ──
import { rankingPrizeWon, TICKET_WON } from '../lib/units';
describe('rankingPrizeWon — unit T', () => {
  it('1T = 10,000원 · 30T = 300,000원', () => {
    expect(rankingPrizeWon({ amount: 1, unit: 'T' })).toBe(10_000);
    expect(rankingPrizeWon({ amount: 30, unit: 'T' })).toBe(300_000);
  });
  it('TICKET_WON 과 TICKET_MAN 은 같은 값이어야 한다(서버 parse_prize_man 과 동일)', () => {
    expect(TICKET_WON).toBe(TICKET_MAN * 10_000);
  });
  it('amountWon(정규형)이 있으면 그것이 우선', () => {
    expect(rankingPrizeWon({ amount: 1, unit: 'T', amountWon: 123 })).toBe(123);
  });
});
