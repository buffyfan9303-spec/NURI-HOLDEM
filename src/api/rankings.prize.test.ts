// 순위 상금의 티켓 표기(nT) — 서버 parse_prize_man(20260905e) 과 같은 규칙인지 값으로 못 박는다.
// DB 실측표(2026-09-05): '1T'→10 · '2 t'→20 · '10T'→100 · '1.5T'→15 · '400'→400 · '1,000'→1000 · '1T0'→1 · 'T'→0
import { describe, it, expect } from 'vitest';
import { parsePrizeMan, parsePrizeTickets, formatPrize, prizeUnitRisk, TICKET_MAN } from './rankings';

describe('티켓 상금 파서 — 서버와 동일 규칙', () => {
  it.each([
    ['1T', 10], ['2 t', 20], ['10T', 100], ['1.5T', 15],
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

  it('1T = 10만 상수는 서버와 같아야 한다', () => {
    expect(TICKET_MAN).toBe(10);
  });

  it('티켓 상금은 단위 경고에 걸리지 않는다', () => {
    expect(prizeUnitRisk('1T')).toBe('ok');
    expect(prizeUnitRisk('10T')).toBe('ok');
  });
});

describe('formatPrize — 매장 설정에 따라 1T / 10만', () => {
  it('기본(설정 없음·ticket) 은 "1T"', () => {
    expect(formatPrize('1T')).toBe('1T');
    expect(formatPrize('1T', null)).toBe('1T');
    expect(formatPrize('1T', { ticketPrizeDisplay: 'ticket' })).toBe('1T');
    expect(formatPrize('2t', {})).toBe('2T');
  });
  it("매장이 'won' 을 고르면 만원 가치로", () => {
    expect(formatPrize('1T', { ticketPrizeDisplay: 'won' })).toBe('10만');
    expect(formatPrize('3T', { ticketPrizeDisplay: 'won' })).toBe('30만');
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
  it('1T = 100,000원 · 3T = 300,000원', () => {
    expect(rankingPrizeWon({ amount: 1, unit: 'T' })).toBe(100_000);
    expect(rankingPrizeWon({ amount: 3, unit: 'T' })).toBe(300_000);
  });
  it('TICKET_WON 과 TICKET_MAN 은 같은 값이어야 한다(서버 parse_prize_man 과 동일)', () => {
    expect(TICKET_WON).toBe(TICKET_MAN * 10_000);
  });
  it('amountWon(정규형)이 있으면 그것이 우선', () => {
    expect(rankingPrizeWon({ amount: 1, unit: 'T', amountWon: 123 })).toBe(123);
  });
});
