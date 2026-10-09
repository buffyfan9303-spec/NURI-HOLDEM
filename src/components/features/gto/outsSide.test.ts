// REPLAYER-OUTS-SEMANTICS — '내 아웃츠 / 상대 아웃츠' 는 **지금 패의 우열**로 고른다(리버까지의 지분이 아니다).
// 리플레이어가 지분(cur.hero < 0.5)으로 골라, 지금 뒤지는 강한 드로에서 '상대 아웃츠(위험 카드)' 를 보여 줬다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeEquity, computeOuts } from './equityEngine';
import { showMyOuts } from './outsHeadline';
import type { Card } from './gto.types';

const C = (s: string): Card => ({ rank: s[0] as Card['rank'], suit: s[1] as Card['suit'] });

describe('showMyOuts', () => {
  it('AsKs vs 2h2d / QsJs3h — 지금은 22 가 앞선다(behind) · 지분은 히어로 >50% → 내 아웃츠', () => {
    const hero: [Card, Card] = [C('As'), C('Ks')], vil: [Card, Card] = [C('2h'), C('2d')];
    const board = [C('Qs'), C('Js'), C('3h')];
    const o = computeOuts(hero, vil, board)!;
    expect(o.standing).toBe('behind');
    expect(computeEquity(hero, vil, board).hero).toBeGreaterThan(0.5); // 옛 규칙(지분<0.5)이면 상대 아웃츠를 골랐다
    expect(showMyOuts(o.standing)).toBe(true);
  });
  it('앞서면 상대 아웃츠, 동률이면 내 아웃츠(OutsFromCards 와 같은 규칙)', () => {
    expect(showMyOuts('ahead')).toBe(false);
    expect(showMyOuts('tied')).toBe(true);
    expect(showMyOuts('behind')).toBe(true);
  });
  it('두 화면이 같은 함수로 고른다 — 리플레이어에 지분 기준이 되살아나지 않는다', () => {
    const rep = readFileSync(join(__dirname, '../HandReplayer.tsx'), 'utf-8');
    const ofc = readFileSync(join(__dirname, 'OutsFromCards.tsx'), 'utf-8');
    expect(rep).toMatch(/showMyOuts\(heroOuts/);
    expect(rep).not.toMatch(/cur\.hero < 0\.5/);
    expect(ofc).toMatch(/showMyOuts\(st\)/);
  });
});
