// src/lib/icm.test.ts
// 1) 단일화 회귀 방지 — 두 화면(ICMCalculator·DealCalc)이 원래 보여주던 숫자를 골든으로 고정
// 2) 독립 구현(순열 전수) 대조 — 비트마스크 메모이제이션이 맞는지 다른 알고리즘으로 검산
// 3) 압박 계산 손계산 대조 + 항등식
import { describe, it, expect } from 'vitest';
import { icmEquity, callPressure, handLadder, verdictLine, SHOVE_RANGES, BENCH_HANDS } from './icm';

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));

/** 독립 구현: 완주 순서(순열)를 전수 열거. 메모·비트마스크를 쓰지 않는 다른 알고리즘. */
function icmBrute(stacks: number[], prizes: number[]): number[] {
  const n = stacks.length;
  const out = new Array(n).fill(0);
  const order: number[] = [];
  const used = new Array(n).fill(false);
  const walk = (p: number) => {
    if (order.length === n) {
      for (let pos = 0; pos < n; pos++) out[order[pos]] += p * (prizes[pos] ?? 0);
      return;
    }
    const left: number[] = [];
    let rem = 0;
    for (let i = 0; i < n; i++) if (!used[i]) { left.push(i); rem += stacks[i]; }
    // 남은 1명은 확률 1 로 그 자리를 차지한다(0칩 탈락자 포함) — rem=0 나눗셈 회피
    for (const i of left) {
      const q = left.length === 1 ? 1 : rem > 0 ? stacks[i] / rem : 1 / left.length;
      used[i] = true; order.push(i);
      walk(p * q);
      order.pop(); used[i] = false;
    }
  };
  walk(1);
  return out;
}

describe('icmEquity', () => {
  // 리팩터(두 벌 → src/lib/icm.ts 단일화) 이전 구현이 내던 값. 바뀌면 그건 회귀다.
  it('단일화 이전 화면 표시값 골든', () => {
    const icmScreen = icmEquity([5000, 3000, 2000], [40, 24, 15, 10, 7, 4]);
    expect(icmScreen.map((v) => v.toFixed(2))).toEqual(['30.55', '25.88', '22.57']);

    const bubblePreset = icmEquity([40, 30, 20, 10], [50, 30, 20]);
    expect(bubblePreset.map((v) => v.toFixed(2))).toEqual(['33.60', '29.49', '23.59', '13.32']);

    const dealScreen = icmEquity([500000, 300000, 200000], [500, 300, 200]);
    expect(dealScreen.map((v) => Math.round(v))).toEqual([384, 328, 289]);
  });

  it('손계산 대조 — 5000/3000/2000, 상금 40/24/15', () => {
    // P1: 0.5·40 + (0.3·5/7 + 0.2·5/8)·24 + 나머지·15 = 30.553571…
    const e = icmEquity([5000, 3000, 2000], [40, 24, 15]);
    expect(Math.abs(e[0] - 30.5535714285714) < 1e-10).toBe(true);
    expect(near(e[0] + e[1] + e[2], 79)).toBe(true); // 상금 총액 보존
  });

  it('독립 구현(순열 전수)과 일치', () => {
    const cases: [number[], number[]][] = [
      [[5000, 3000, 2000], [40, 24, 15, 10, 7, 4]],
      [[40, 30, 20, 10], [50, 30, 20]],
      [[50, 30, 20], [60, 30, 10]],
      [[100, 90, 80, 10], [50, 30, 20]],
      [[40, 54, 0, 10], [50, 30, 20]],   // 올인 패배로 0칩이 된 자리
      [[500000, 300000, 200000], [500, 300, 200]],
      [[9, 8, 7, 6, 5, 4, 3], [40, 24, 15, 10, 7]],
    ];
    for (const [s, p] of cases) {
      const a = icmEquity(s, p);
      const b = icmBrute(s, p);
      for (let i = 0; i < s.length; i++) expect(near(a[i], b[i]), `${JSON.stringify(s)}[${i}]`).toBe(true);
    }
  });

  it('칩 2배 ≠ 상금 2배 (ICM 의 핵심)', () => {
    const e = icmEquity([2000, 1000, 1000], [50, 30, 20]);
    expect(e[0] / e[1]).toBeLessThan(2);
  });
});

describe('callPressure', () => {
  it('상금 1자리 = 칩에 선형 → 버블 팩터 1, 리스크 프리미엄 0', () => {
    const r = callPressure({ stacks: [5000, 3000, 2000], prizes: [100], heroIndex: 0, villainIndex: 1, pot: 1000 });
    expect(r.ok).toBe(true);
    expect(near(r.reqIcm, 3 / 7, 1e-12)).toBe(true);
    expect(near(r.reqChip, 3 / 7, 1e-12)).toBe(true);
    expect(Math.abs(r.bubbleFactor - 1) < 1e-12).toBe(true);
    expect(Math.abs(r.riskPremium) < 1e-12).toBe(true);
  });

  it('손계산 3인 — 스택 50/30/20, 상금 60/30/10, 팟 5', () => {
    const r = callPressure({ stacks: [50, 30, 20], prizes: [60, 30, 10], heroIndex: 1, villainIndex: 2, pot: 5 });
    expect(r.callAmount).toBe(20);
    expect(r.winAmount).toBe(25);
    expect(Math.abs(r.eqFold - 31.266234) < 1e-5).toBe(true);   // 손계산
    expect(Math.abs(r.eqWin - 45.714286) < 1e-5).toBe(true);
    expect(Math.abs(r.eqLose - 17.922078) < 1e-5).toBe(true);
    expect(Math.abs(r.reqIcm - 0.480139) < 1e-5).toBe(true);
    expect(Math.abs(r.reqChip - 0.444444) < 1e-5).toBe(true);
    expect(Math.abs(r.bubbleFactor - 1.154493) < 1e-5).toBe(true);
  });

  it('버블 4인 3자리 — 세 시나리오 지분을 독립 구현으로 재검산', () => {
    const r = callPressure({ stacks: [40, 30, 20, 10], prizes: [50, 30, 20], heroIndex: 1, villainIndex: 2, pot: 4 });
    const f = icmBrute([40, 30, 24, 10], [50, 30, 20])[1];
    const w = icmBrute([40, 54, 0, 10], [50, 30, 20])[1];
    const l = icmBrute([40, 10, 44, 10], [50, 30, 20])[1];
    expect(near(r.eqFold, f)).toBe(true);
    expect(near(r.eqWin, w)).toBe(true);
    expect(near(r.eqLose, l)).toBe(true);
    expect(near(r.reqIcm, (f - l) / (w - l))).toBe(true);
    expect(r.reqIcm).toBeGreaterThan(r.reqChip); // 버블이면 반드시 더 요구한다
  });

  it('하드 버블(숏스택 1명 대기) — 프리미엄이 두 자릿수 %p', () => {
    const r = callPressure({ stacks: [100, 90, 80, 10], prizes: [50, 30, 20], heroIndex: 1, villainIndex: 2, pot: 6 });
    expect(r.riskPremium).toBeGreaterThan(0.1);
    expect(r.bubbleFactor).toBeGreaterThan(1.5);
  });

  it('항등식 reqIcm = c·BF/(c·BF + c + 팟) · BF ≥ 1 · 프리미엄 ≥ 0', () => {
    let s = 12345;
    const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    for (let t = 0; t < 300; t++) {
      const n = 2 + Math.floor(rnd() * 6);
      const stacks = Array.from({ length: n }, () => Math.floor(rnd() * 200) + 1);
      const prizes = Array.from({ length: 1 + Math.floor(rnd() * n) }, (_, i) => Math.round(100 / (i + 1)));
      const h = Math.floor(rnd() * n);
      const v = h === 0 ? 1 : 0;
      const pot = Math.floor(rnd() * 30);
      const r = callPressure({ stacks, prizes, heroIndex: h, villainIndex: v, pot });
      expect(r.ok).toBe(true);
      const expected = (r.callAmount * r.bubbleFactor) / (r.callAmount * r.bubbleFactor + r.callAmount + pot);
      expect(Math.abs(r.reqIcm - expected) < 1e-9, `t=${t}`).toBe(true);
      expect(r.bubbleFactor).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(r.riskPremium).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('입력 방어 — 같은 자리 / 0칩 / 상금 없음 / 인원', () => {
    expect(callPressure({ stacks: [10, 10], prizes: [100], heroIndex: 0, villainIndex: 0, pot: 0 }).reason).toBe('seat');
    expect(callPressure({ stacks: [10, 0], prizes: [100], heroIndex: 0, villainIndex: 1, pot: 0 }).reason).toBe('stacks');
    expect(callPressure({ stacks: [10, 10], prizes: [], heroIndex: 0, villainIndex: 1, pot: 0 }).reason).toBe('prizes');
    expect(callPressure({ stacks: [10], prizes: [100], heroIndex: 0, villainIndex: 0, pot: 0 }).reason).toBe('players');
    // 팟이 NaN/음수여도 0 으로 취급하고 계산은 계속된다
    expect(callPressure({ stacks: [10, 10], prizes: [100], heroIndex: 0, villainIndex: 1, pot: NaN }).ok).toBe(true);
  });
});

describe('판정 예시', () => {
  it('벤치 표는 핸드 수와 1:1 대응', () => {
    for (const r of SHOVE_RANGES) expect(handLadder(0.5, r.id)).toHaveLength(BENCH_HANDS.length);
  });

  it('필요 승률이 오르면 콜 가능한 핸드는 줄어든다(단조)', () => {
    let prev = Infinity;
    for (const req of [0.3, 0.4, 0.5, 0.55, 0.6, 0.7, 0.9]) {
      const n = handLadder(req, 'mid').filter((e) => e.call).length;
      expect(n).toBeLessThanOrEqual(prev);
      prev = n;
    }
  });

  it('한 줄 결론 — 경계·양극단', () => {
    expect(verdictLine(0.55, 'mid')).toContain('까지 콜');
    expect(verdictLine(0.99, 'mid')).toContain('전부 폴드');
    expect(verdictLine(0.01, 'mid')).toContain('전부 콜');
  });

  it('레인지가 넓어질수록 같은 핸드의 승률은 오른다', () => {
    const at = (id: 'tight' | 'mid' | 'wide', hand: string) => handLadder(0, id).find((e) => e.hand === hand)!.eq;
    for (const h of ['QQ', '88', 'AJo', 'KQo']) {
      expect(at('tight', h)).toBeLessThan(at('mid', h));
      expect(at('mid', h)).toBeLessThan(at('wide', h));
    }
  });
});
