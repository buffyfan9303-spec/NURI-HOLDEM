import { describe, expect, it } from 'vitest';
import { HAND_RANKS } from './handRank.data';

const CARD = /^[2-9TJQKA][shdc]$/;

describe('홀덤 족보 데이터', () => {
  it('10개 · 강한 순서(희귀할수록 앞) · 예시 5장은 서로 다른 정상 카드', () => {
    expect(HAND_RANKS).toHaveLength(10);
    expect(HAND_RANKS.map((h) => h.key)).toEqual(['royal', 'sflush', 'quads', 'full', 'flush', 'straight', 'trips', 'twopair', 'pair', 'high']);
    for (const h of HAND_RANKS) {
      expect(new Set(h.cards).size, h.ko).toBe(5);
      for (const c of h.cards) expect(c, `${h.ko}: ${c}`).toMatch(CARD);
    }
    // 하이카드는 예외(원페어보다 드물다) — 나머지 9개는 뒤로 갈수록 흔해야 한다
    const f = HAND_RANKS.map((h) => h.freq);
    for (let i = 1; i < 9; i++) expect(f[i], HAND_RANKS[i].ko).toBeGreaterThan(f[i - 1]);
  });
});
