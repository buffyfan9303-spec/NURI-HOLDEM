// 아웃 0장 ≠ 드로잉 데드 — 2026-09-30 감사 반례를 엔진 전수계산 값으로 고정한다.
import { describe, it, expect } from 'vitest';
import { computeOuts, computeEquity } from './equityEngine';
import { outsHeadline } from './outsHeadline';
import type { Card } from './gto.types';

const C = (s: string): Card => ({ rank: s[0] as Card['rank'], suit: s[1] as Card['suit'] });

describe('outsHeadline · 드로잉 데드는 승률 0 일 때만', () => {
  it('2h3h vs AsAd / Kc7d8h — 아웃 0 이지만 승률 5.86% 는 드로잉 데드가 아니다', () => {
    const hero: [Card, Card] = [C('2h'), C('3h')];
    const vill: [Card, Card] = [C('As'), C('Ad')];
    const board = [C('Kc'), C('7d'), C('8h')];
    const ho = computeOuts(hero, vill, board)!;
    const eq = computeEquity(hero, vill, board).hero;
    expect(ho.outs).toBe(0);
    expect(eq).toBeCloseTo(0.05859, 4);
    const line = outsHeadline(true, ho.outs, ho.standing, eq, ho.next);
    expect(line).not.toContain('드로잉 데드');
    expect(line).toContain('턴+리버 합쳐 승률 5.9%');
  });

  it('승률이 정확히 0 이면 드로잉 데드 — 2c3d vs AsAd / AhAcKd', () => {
    const hero: [Card, Card] = [C('2c'), C('3d')];
    const vill: [Card, Card] = [C('As'), C('Ad')];
    const board = [C('Ah'), C('Ac'), C('Kd')];
    const eq = computeEquity(hero, vill, board).hero;
    expect(eq).toBe(0);
    expect(outsHeadline(true, 0, 'behind', eq, 'turn')).toContain('드로잉 데드');
  });
});
