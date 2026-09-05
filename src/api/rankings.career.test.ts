// 전국 대회 머니인 입상 경력 — 정렬·기간 규칙이 서버(20260905h global_ranking_totals ORDER BY)와 같은지 고정한다.
// '전국 상위 N%' 가 공유 카드로 나가므로, 클라 정렬이 서버와 갈리면 아무도 모르게 틀린 백분위가 퍼진다.
import { describe, it, expect } from 'vitest';
import { careerCompare, careerSince, type GlobalRankingTotal } from './rankings';

const row = (o: Partial<GlobalRankingTotal>): GlobalRankingTotal =>
  ({ nickname: 'x', moneyinCount: 0, wins: 0, top3: 0, bestPosition: 99, venues: 1, lastDate: null, ...o });

describe('careerCompare — 입상 횟수 → 우승 → TOP3 → 최고 등수 → 최근 입상 → 이름', () => {
  it('서버 ORDER BY 와 같은 6단 타이브레이크', () => {
    const rows = [
      row({ nickname: 'f', moneyinCount: 2, wins: 1, top3: 2, bestPosition: 1, lastDate: '2026-01-01' }),
      row({ nickname: 'a', moneyinCount: 3, wins: 0 }),
      row({ nickname: 'e', moneyinCount: 2, wins: 1, top3: 2, bestPosition: 1, lastDate: '2026-02-01' }),
      row({ nickname: 'd', moneyinCount: 2, wins: 1, top3: 2, bestPosition: 2 }),
      row({ nickname: 'c', moneyinCount: 2, wins: 1, top3: 1 }),
      row({ nickname: 'b', moneyinCount: 2, wins: 2 }),
    ];
    expect([...rows].sort(careerCompare).map((r) => r.nickname)).toEqual(['a', 'b', 'e', 'f', 'd', 'c']);
  });
  it('상금·금액은 정렬에 쓰이지 않는다(필드 자체가 없다)', () => {
    expect(Object.keys(row({}))).not.toContain('prizeMan');
    expect(Object.keys(row({}))).not.toContain('moneyinPoints');
  });
});

describe('careerSince — 기간 칩 → 서버 p_since', () => {
  const at = new Date(2026, 8, 5); // 2026-09-05 로컬
  it("'all' 은 null(전체)", () => { expect(careerSince('all', at)).toBeNull(); });
  it("'year' 는 그 해 1월 1일", () => { expect(careerSince('year', at)).toBe('2026-01-01'); });
  it("'90d' 는 90일 전", () => { expect(careerSince('90d', at)).toBe('2026-06-07'); });
});
