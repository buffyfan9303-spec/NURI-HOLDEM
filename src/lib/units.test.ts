import { describe, expect, it } from 'vitest';
import { manToWon, wonToMan, presetPrizeWon, rankingPrizeWon } from './units';

describe('units — 원(KRW) 정규형', () => {
  it('만원↔원 왕복', () => {
    expect(manToWon(600)).toBe(6_000_000);
    expect(wonToMan(6_000_000)).toBe(600);
    expect(manToWon(0.5)).toBe(5_000);
  });

  it('presetPrizeWon — 신형(원) 우선, 구형(만원) 폴백 (1/10,000 오기록 차단 핵심)', () => {
    expect(presetPrizeWon({ prizeAmountWon: 10_000_000 })).toBe(10_000_000);
    expect(presetPrizeWon({ prizeAmount: 1000 })).toBe(10_000_000);       // 구형 1000만원
    expect(presetPrizeWon({ prizeAmountWon: 500_000, prizeAmount: 1000 })).toBe(500_000); // 신형 우선
    expect(presetPrizeWon({})).toBe(0);
  });

  it('rankingPrizeWon — amountWon 우선 · unit 원/만원 분기 · 기본 만원', () => {
    expect(rankingPrizeWon({ amountWon: 300_000 })).toBe(300_000);
    expect(rankingPrizeWon({ amount: 30, unit: '만원' })).toBe(300_000);
    expect(rankingPrizeWon({ amount: 300_000, unit: '원' })).toBe(300_000);
    expect(rankingPrizeWon({ amount: 30 })).toBe(300_000); // unit 누락 = 만원(기존 관행)
    expect(rankingPrizeWon({})).toBe(0);
  });
});
