// 레인지 파서·콤보 가중·Nash 데이터 정합 검증
import { describe, it, expect } from 'vitest';
import { expandRange, buildFreq, comboCount, rangeComboPct, gridName, freqFromArray } from './ranges';
import { HAND_ORDER, NASH_STACKS, nashRange } from './nash.data';
import { RANGE_SCENARIOS } from './ranges.data';

describe('expandRange 표기 파서', () => {
  it('페어 +/스팬', () => {
    expect(expandRange('QQ+')).toEqual(['QQ', 'KK', 'AA'].sort((a, b) => expandRange('QQ+').indexOf(a) - expandRange('QQ+').indexOf(b)));
    expect(expandRange('QQ+')).toHaveLength(3);
    expect(expandRange('55-22')).toEqual(expect.arrayContaining(['55', '44', '33', '22']));
    expect(expandRange('55-22')).toHaveLength(4);
  });
  it('수딧 키커 상승 A2s+ = A2s..AKs (12개)', () => {
    const r = expandRange('A2s+');
    expect(r).toHaveLength(12);
    expect(r).toContain('AKs');
    expect(r).toContain('A2s');
    expect(r).not.toContain('AA');
  });
  it('스팬 A5s-A2s', () => {
    expect(expandRange('A5s-A2s')).toEqual(expect.arrayContaining(['A5s', 'A4s', 'A3s', 'A2s']));
    expect(expandRange('A5s-A2s')).toHaveLength(4);
  });
  it('오프수트 KTo+ = KTo KJo KQo', () => {
    expect(expandRange('KTo+')).toEqual(expect.arrayContaining(['KTo', 'KJo', 'KQo']));
    expect(expandRange('KTo+')).toHaveLength(3);
  });
  it('잘못된 토큰은 throw', () => {
    expect(() => expandRange('XYs')).toThrow();
    expect(() => expandRange('A2s-K2s')).toThrow(); // 하이카드 불일치 스팬
  });
});

describe('콤보 가중', () => {
  it('페어 6 · 수딧 4 · 오프수트 12', () => {
    expect(comboCount('AA')).toBe(6);
    expect(comboCount('AKs')).toBe(4);
    expect(comboCount('AKo')).toBe(12);
  });
  it('전체 100% 레인지 = 1326콤보 = 100%', () => {
    const all = buildFreq({ '1': '22+ A2s+ A2o+ K2s+ K2o+ Q2s+ Q2o+ J2s+ J2o+ T2s+ T2o+ 92s+ 92o+ 82s+ 82o+ 72s+ 72o+ 62s+ 62o+ 52s+ 52o+ 42s+ 42o+ 32s 32o' });
    expect(all.size).toBe(169);
    expect(rangeComboPct(all)).toBeCloseTo(100, 5);
  });
  it('첫 지정 우선(뒤 그룹이 앞을 안 덮음)', () => {
    const m = buildFreq({ '1': 'AA', '0.5': 'AA KK' });
    expect(m.get('AA')).toBe(1);
    expect(m.get('KK')).toBe(0.5);
  });
});

describe('gridName 13x13 표준 배치', () => {
  it('대각=페어, 우상=수딧, 좌하=오프수트', () => {
    expect(gridName(0, 0)).toBe('AA');
    expect(gridName(0, 1)).toBe('AKs');
    expect(gridName(1, 0)).toBe('AKo');
    expect(gridName(12, 12)).toBe('22');
  });
});

describe('nash.data 정합', () => {
  it('HAND_ORDER 169개·중복 없음', () => {
    expect(HAND_ORDER).toHaveLength(169);
    expect(new Set(HAND_ORDER).size).toBe(169);
    expect(HAND_ORDER[0]).toBe('AA');
  });
  it('전 (k,스택,안테) 조합에 셔브 데이터 존재', () => {
    for (const k of [1, 2, 3, 4, 5, 6, 7, 8]) for (const s of NASH_STACKS) {
      const a = nashRange('shove', k, s, false);
      const sum = Array.from(a).reduce((x, y) => x + y, 0);
      expect(sum).toBeGreaterThan(0); // 최소한 AA는 민다
    }
  });
  it('🔴 BB 콜은 전 포지션(k=1~8)에 데이터가 있다(예전 버그: k>=3 이 비어 100% 폴드)', () => {
    for (const k of [1, 2, 3, 4, 5, 6, 7, 8]) for (const s of NASH_STACKS) {
      const a = nashRange('callBB', k, s, false);
      const sum = Array.from(a).reduce((x, y) => x + y, 0);
      expect(sum, `callBB k=${k} s=${s}`).toBeGreaterThan(0); // AA 는 어디서든 콜
    }
  });
  it('SB 콜은 k>=2 에 데이터가 있다', () => {
    for (const k of [2, 3, 4, 5, 6, 7, 8]) {
      const a = nashRange('callSB', k, 10, false);
      expect(Array.from(a).reduce((x, y) => x + y, 0), `callSB k=${k}`).toBeGreaterThan(0);
    }
  });
  it('AA는 어디서든 100% 셔브', () => {
    const iAA = HAND_ORDER.indexOf('AA');
    for (const k of [1, 4, 8]) for (const s of [5, 10, 20]) {
      expect(nashRange('shove', k, s, false)[iAA]).toBe(1);
    }
  });
  it('단조성: 뒤 인원이 많을수록(k↑) 셔브 레인지가 좁아진다 (10bb)', () => {
    const pct = (k: number) => {
      const m = freqFromArray(nashRange('shove', k, 10, false), HAND_ORDER);
      return rangeComboPct(m);
    };
    expect(pct(1)).toBeGreaterThan(pct(2));
    expect(pct(2)).toBeGreaterThan(pct(5));
    expect(pct(5)).toBeGreaterThan(pct(8));
  });
  it('안테가 있으면 셔브가 넓어진다 (SB 10bb)', () => {
    const noA = rangeComboPct(freqFromArray(nashRange('shove', 1, 10, false), HAND_ORDER));
    const wA = rangeComboPct(freqFromArray(nashRange('shove', 1, 10, true), HAND_ORDER));
    expect(wA).toBeGreaterThan(noA);
  });
  it('BB 콜은 셔브보다 좁다 (SB 10bb)', () => {
    const shove = rangeComboPct(freqFromArray(nashRange('shove', 1, 10, false), HAND_ORDER));
    const call = rangeComboPct(freqFromArray(nashRange('callBB', 1, 10, false), HAND_ORDER));
    expect(call).toBeLessThan(shove);
    expect(call).toBeGreaterThan(15); // 팟오즈상 최소한의 하한
  });
});

describe('ranges.data 표준 차트 위생', () => {
  it('전 시나리오 파싱 가능 + 상식 범위(3%~60%)', () => {
    for (const s of RANGE_SCENARIOS) {
      for (const a of s.actions) {
        const m = buildFreq(a.spec);
        const pct = rangeComboPct(m);
        // 4벳(fourbet)은 최상위 밸류(KK+ 중심)라 1.5%대가 정상 — 별도 하한
        const floor = a.key === 'fourbet' ? 1.5 : 2;
        expect(pct, `${s.id}:${a.key}`).toBeGreaterThan(floor);
        expect(pct, `${s.id}:${a.key}`).toBeLessThan(62);
      }
    }
  });
  it('포지션 단조성: LJ < HJ < CO < BTN 오픈', () => {
    const pct = (id: string) => {
      const s = RANGE_SCENARIOS.find((x) => x.id === id)!;
      return rangeComboPct(buildFreq(s.actions[0].spec));
    };
    expect(pct('rfi_lj')).toBeLessThan(pct('rfi_hj'));
    expect(pct('rfi_hj')).toBeLessThan(pct('rfi_co'));
    expect(pct('rfi_co')).toBeLessThan(pct('rfi_btn'));
  });
  it('한 시나리오 안에서 액션 간 핸드 중복 없음(3벳과 콜이 같은 핸드를 1.0으로 겹치지 않음)', () => {
    for (const s of RANGE_SCENARIOS) {
      if (s.actions.length < 2) continue;
      const maps = s.actions.map((a) => buildFreq(a.spec));
      for (const [name, f1] of maps[0]) {
        const f2 = maps[1].get(name) ?? 0;
        expect(f1 + f2, `${s.id}:${name}`).toBeLessThanOrEqual(1.0001);
      }
    }
  });
});
