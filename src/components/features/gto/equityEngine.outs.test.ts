// computeOuts 결정적 검증 — 아웃츠/런아웃 분석의 정확성 고정.
import { describe, it, expect } from 'vitest';
import { computeOuts, computeEquity } from './equityEngine';
import type { Card } from './gto.types';

const C = (rank: string, suit: string): Card => ({ rank: rank as Card['rank'], suit: suit as Card['suit'] });

describe('computeOuts · 리버 클린 아웃(턴 보드 4장)', () => {
  // Hero AA vs Villain KK, 보드 2♦7♣9♠5♥ — 무해한 보드. 빌런은 오직 리버 K(K♠·K♥) 2장만 승리.
  const hero: [Card, Card] = [C('A', 's'), C('A', 'h')];
  const vill: [Card, Card] = [C('K', 'd'), C('K', 'c')];
  const board = [C('2', 'd'), C('7', 'c'), C('9', 's'), C('5', 'h')];

  it('빌런 아웃 = 리버 킹 2장(K♠·K♥)', () => {
    const vo = computeOuts(vill, hero, board); // 빌런을 hero 자리에 넣으면 빌런-우세 카드
    expect(vo).not.toBeNull();
    expect(vo!.next).toBe('river');
    expect(vo!.total).toBe(44); // 52 - 2(hero) - 2(vill) - 4(board)
    expect(vo!.outs).toBe(2);
    const labels = vo!.cards.map((c) => c.rank + c.suit).sort();
    expect(labels).toEqual(['Kh', 'Ks']);
  });

  it('내 아웃 = 나머지 42장(리버에서 이김, 무승부 없음)', () => {
    const ho = computeOuts(hero, vill, board);
    expect(ho!.outs).toBe(42);
    expect(ho!.outs + 2).toBe(ho!.total); // 42 승리 + 2 패배 = 44
  });

  it('prob = outs/total 이 일치', () => {
    const vo = computeOuts(vill, hero, board)!;
    expect(vo.prob).toBeCloseTo(2 / 44, 6);
  });
});

describe('computeOuts · 플랍(보드 3장)은 턴 우세 전환 카드', () => {
  // Hero A♠K♠ 넛플러시 드로 vs Villain Q♥Q♦(오버페어), 보드 2♠7♠9♦
  const hero: [Card, Card] = [C('A', 's'), C('K', 's')];
  const vill: [Card, Card] = [C('Q', 'h'), C('Q', 'd')];
  const board = [C('2', 's'), C('7', 's'), C('9', 'd')];

  it('턴 아웃이 존재하고 잔여 45장 중 일부', () => {
    const ho = computeOuts(hero, vill, board)!;
    expect(ho.next).toBe('turn');
    expect(ho.total).toBe(45); // 52 - 2 - 2 - 3
    expect(ho.outs).toBeGreaterThan(8);  // 최소 스페이드 9장 근방
    expect(ho.outs).toBeLessThan(20);
  });

  it('아웃 카드가 실제로 hero 를 우세(>50%)로 만든다', () => {
    const ho = computeOuts(hero, vill, board)!;
    for (const c of ho.cards.slice(0, 5)) {
      expect(computeEquity(hero, vill, [...board, c]).hero).toBeGreaterThan(0.5);
    }
  });
});

describe('computeOuts · 경계', () => {
  it('보드 0/1/2/5 장이면 null(다음 카드 없음/미지원)', () => {
    const hero: [Card, Card] = [C('A', 's'), C('A', 'h')];
    const vill: [Card, Card] = [C('K', 'd'), C('K', 'c')];
    expect(computeOuts(hero, vill, [])).toBeNull();
    expect(computeOuts(hero, vill, [C('2', 'd')])).toBeNull();
    expect(computeOuts(hero, vill, [C('2', 'd'), C('7', 'c'), C('9', 's'), C('5', 'h'), C('J', 'c')])).toBeNull();
  });
});
