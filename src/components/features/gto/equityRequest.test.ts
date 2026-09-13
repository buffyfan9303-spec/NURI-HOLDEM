// F11 회귀 — 늦게 도착한 에퀴티가 무효 입력 화면에 되살아나던 것 · 빌런만 바꾸면 재계산이 안 되던 것.
// vitest 환경이 `node` 라 NuriSpotPanel 을 렌더할 수 없어 이펙트의 **판정**을 순수 함수로 잠근다.
import { describe, it, expect } from 'vitest';
import { planEquity, canApplyEquity, equityCardsKey } from './equityRequest';
import { emptySpot, canonicalSpotKey, type SpotReview } from '../../../lib/spot';

describe('⑫ 무효 전환 뒤 도착한 이전 응답이 equity 를 되살리지 않는다', () => {
  it('무효 전환도 세대를 올린다 — in-flight 응답이 버려진다', () => {
    let gen = 0;

    // 1) 히어로·빌런 두 장씩 → 계산 요청이 나간다.
    const first = planEquity(gen, true);
    gen = first.gen;
    expect(first.kind).toBe('request');
    const inFlight = first.gen;

    // 2) 홀카드를 빼 canCalc 가 꺼진다 — 화면은 '분석하지 않았습니다'.
    const second = planEquity(gen, false);
    gen = second.gen;
    expect(second.kind).toBe('clear');
    expect(second.gen).toBeGreaterThan(inFlight); // ← 이 한 줄이 F11 ①의 본체다

    // 3) 그제서야 1)의 워커 응답이 도착 — 반영하면 안 된다.
    expect(canApplyEquity(inFlight, gen)).toBe(false);
  });

  it('아무 일도 없었으면 제 응답은 반영된다 (가드가 전부를 버리지 않는다)', () => {
    const p = planEquity(0, true);
    expect(canApplyEquity(p.gen, p.gen)).toBe(true);
  });

  it('무효 상태가 연속돼도 세대는 계속 오른다 — 낡은 요청이 되살아날 창이 없다', () => {
    const a = planEquity(0, false);
    const b = planEquity(a.gen, false);
    expect(b.gen).toBeGreaterThan(a.gen);
  });
});

describe('⑬ 빌런 카드만 바꿔도 재계산된다', () => {
  const hero = ['As', 'Kd'];
  const board = ['2c', '7h', 'Jd'];

  it('빌런만 바뀌면 에퀴티 키가 바뀐다', () => {
    const before = equityCardsKey(hero, ['Qs', 'Qh'], board);
    const after = equityCardsKey(hero, ['5c', '5d'], board);
    expect(after).not.toBe(before);
  });

  it('canonicalSpotKey 는 빌런을 빼므로 그대로다 — 그래서 그 키를 쓰면 안 된다', () => {
    const base: SpotReview = { ...emptySpot(), hero, board, street: 'flop' };
    const a: SpotReview = { ...base, villain: ['Qs', 'Qh'] };
    const b: SpotReview = { ...base, villain: ['5c', '5d'] };
    // 이 등식이 깨지면 spot.ts 의 정규화 규칙이 바뀐 것이다 — 그때 이 파일의 근거도 다시 본다.
    expect(canonicalSpotKey(a)).toBe(canonicalSpotKey(b));
    expect(equityCardsKey(a.hero, a.villain, a.board))
      .not.toBe(equityCardsKey(b.hero, b.villain, b.board));
  });

  it('히어로·보드 변화도 각각 키를 움직인다', () => {
    const v = ['Qs', 'Qh'];
    expect(equityCardsKey(['As', 'Kd'], v, board)).not.toBe(equityCardsKey(['As', 'Kc'], v, board));
    expect(equityCardsKey(hero, v, board)).not.toBe(equityCardsKey(hero, v, [...board, '9s']));
  });

  it('같은 입력은 같은 키 — 불필요한 재계산을 만들지 않는다', () => {
    expect(equityCardsKey(hero, ['Qs', 'Qh'], board)).toBe(equityCardsKey(hero, ['Qs', 'Qh'], board));
  });

  it('세 축의 경계가 섞이지 않는다 — 카드가 옆 축으로 밀려도 다른 키다', () => {
    expect(equityCardsKey(['As', 'Kd'], ['Qs'], [])).not.toBe(equityCardsKey(['As'], ['Kd', 'Qs'], []));
  });
});
