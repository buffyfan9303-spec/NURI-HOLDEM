import { describe, expect, it } from 'vitest';
import { HAND_RANKS, HAND_RANK_NOTES } from './handRank.data';

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

// 2026-09-19 GTO 감사 [medium] — 'K K K A A 는 항상 스플릿' 이라고 단정한 예시가 포카드로
// 뒤집히는 경우(케이스 킹·잔여 에이스 두 장)를 빠뜨리고 있었다. 캐비엇이 되살아나지 않게 잠근다.
describe('족보 노트 — 풀하우스 보드 스플릿 예외', () => {
  it("'K K K A A' 예시가 포카드 예외를 함께 말한다", () => {
    const note = HAND_RANK_NOTES.find((n) => n.body.includes('K K K A A'));
    expect(note, "'K K K A A' 예시 문항을 못 찾았다 — 문구가 바뀌었는지 확인해라").toBeTruthy();
    expect(note!.body, '포카드로 뒤집히는 예외가 빠졌다').toMatch(/포카드로 혼자 이긴다|포카드.*이긴다/);
  });
});
