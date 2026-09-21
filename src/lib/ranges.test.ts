// 레인지 파서·콤보 가중·Nash 데이터 정합 검증
import { describe, it, expect } from 'vitest';
import { expandRange, buildFreq, comboCount, rangeComboPct, gridName, freqFromArray, R_CH, R_VAL } from './ranges';
import { HAND_ORDER, NASH_STACKS, NASH_KS, NASH_CALLBB_QUARANTINE, nashRange, hasNashRange, isNashQuarantined, isNashApprox, type NashKind } from './nash.data';
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
    // 2026-09-19: 노앤티 3bb 의 k≥2 열은 BB 콜 전용 격리다(역전 93.6→99.2) — 격리된 칸은 '빈 표' 가 맞다.
    //   격리를 빼고 검사하되, 격리가 정확히 그 칸만인지는 아래 'BB 콜 표 격리' 계약이 잠근다(여기서 되풀이하지 않는다).
    let checked = 0;
    for (const k of [1, 2, 3, 4, 5, 6, 7, 8]) for (const s of NASH_STACKS) {
      if (isNashQuarantined(s, false, k, 'callBB')) continue;
      const a = nashRange('callBB', k, s, false);
      const sum = Array.from(a).reduce((x, y) => x + y, 0);
      expect(sum, `callBB k=${k} s=${s}`).toBeGreaterThan(0); // AA 는 어디서든 콜
      checked += 1;
    }
    expect(checked, '격리가 너무 넓어 검사할 칸이 줄었다').toBe(8 * NASH_STACKS.length - 7);   // 3bb 의 k=2..8 일곱 칸만 빠진다
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

  it('🔴 단조성을 **전 깊이 × 앤티 유무**로 확인한다 — 한 칸만 보던 계약이 깨진 표를 6개월 가렸다', () => {
    // 왜 넓히나: 위 계약은 **10bb·앤티없음 한 칸**에서만 돌았다. 그 사이 빅 앤티 4~6BB 표가
    //   순서를 뒤집은 채(9맥스 UTG 가 SB 보다 넓다) 라이브에서 "K2o 100% 올인" 을 조언했는데
    //   어떤 테스트도 빨개지지 않았다(2026-09-17 감사). 한 칸 계약은 계약이 아니다.
    // 격리된 조합은 `hasNashRange` 가 false 라 여기서도 자동으로 빠진다 — 격리를 풀면 이 계약이 판정한다.
    const pctOf = (k: number, stack: number, ante: boolean) =>
      rangeComboPct(freqFromArray(nashRange('shove', k, stack, ante), HAND_ORDER));
    // 🔴 여기 있던 "2~3BB 는 데드머니가 커서 any-two 잼이 정상" 이라는 예외는 **반증됐다**(2026-09-17).
    //   UTG(k=8) 손익분기 S/(0.5+2S) 는 2BB 에서도 44.4% 이고 S 에 대해 단조 증가한다 —
    //   32o(32.5%) 는 **어떤 스택에서도** 그 선을 못 넘으므로 9맥스 UTG 의 any-two 잼은 원리적으로 불가다.
    //   예외를 두면 그 구간이 영영 검사되지 않는다. 격리된 조합은 `hasNashRange` 가 걸러 준다.
    const broken: string[] = [];
    for (const ante of [false, true]) for (const stack of NASH_STACKS) {
      // 살아 있는 k 끼리만 비교한다 — 격리된 열을 끌어들이면 '없는 값'으로 판정하게 된다.
      const live = [1, 2, 5, 8].filter((k) => hasNashRange('shove', k, stack, ante));
      for (let i = 0; i + 1 < live.length; i++) {
        const a = live[i], b2 = live[i + 1];
        const wide = pctOf(a, stack, ante), narrow = pctOf(b2, stack, ante);
        // 허용오차 1.0%p — 이 데이터는 **빈도가 0~8 단계로 양자화**돼 있어(SourceBadge 가 그렇게 고지한다)
        //   콤보 몇 개가 한 단계 움직이면 0.x%p 가 그냥 흔들린다. 실측 예: 2bb 노엔티 k2 75.9 → k8 76.5(0.6%p).
        //   반면 진짜 결함이던 빅엔티 4~6BB 는 3.4%p 역전이었고 내용 자체가 모순이었다(UTG 가 K2o 를 100% 잼).
        //   ⚠ 이 값을 올려서 실패를 없애지 마라 — 1%p 를 넘는 역전은 잡음이 아니다.
        if (!(wide >= narrow - 1.0)) broken.push(`${stack}bb ante=${ante}: k${a}=${wide.toFixed(1)} < k${b2}=${narrow.toFixed(1)}`);
      }
    }
    expect(broken, `뒤 인원이 많은데 레인지가 더 넓다 — 표가 깨졌다:\n${broken.join('\n')}`).toEqual([]);
  });

  it('🔴 스택 단조성 — 같은 자리에서 **스택이 줄면 레인지가 넓어져야** 한다 (셔브·BB 콜·SB 콜 전부)', () => {
    // 왜 이 계약이 생겼나(2026-09-19): 지금까지 단조성 계약은 **k 방향(자리)** 만 봤다. 스택 방향은 아무도 안 봤고,
    //   그래서 **옛 값과 새 값을 한 열 안에서 이어 붙인 자리**가 조용히 통과했다 —
    //   빅앤티 셔브 SB 열에 옛 2~6bb 뒤로 새 7bb+ 를 붙이면 **6bb 64.6 → 7bb 77.3 (+12.6%p)**,
    //   즉 스택이 줄었는데 레인지가 **좁아지는** 표가 된다. 그건 포커가 아니라 두 모델을 반씩 섞은 것이다.
    //   지금 nash.data.ts 에는 실제로 두 세대 값이 섞여 있다(머리말 ①②③) — 이 계약이 그 경계를 지킨다.
    // 원리: 스택이 얕을수록 (a) 블라인드·앤티가 스택 대비 커지고 (b) 콜당해도 잃을 것이 적다 →
    //   첫 진입 올인도, 그걸 받는 콜도 넓어진다. kind 와 무관하다.
    // 허용오차 1.0%p — k 단조성 계약과 같은 이유(0~8 양자화). 실측 여유: 지금 데이터는 **역방향 증가가 0.00%p**
    //   (한 칸도 안 늘어난다)라 1.0 은 전부 여유다. ⚠ 이 값을 올려서 실패를 없애지 마라.
    const broken: string[] = [];
    for (const kind of ['shove', 'callBB', 'callSB'] as const) for (const ante of [false, true]) for (const k of NASH_KS) {
      // 살아 있는 깊이끼리만 — 격리된 깊이를 끌어들이면 '없는 값'(전부 0)으로 판정하게 된다.
      const live = NASH_STACKS.filter((s) => hasNashRange(kind, k, s, ante));
      for (let i = 0; i + 1 < live.length; i++) {
        const shallow = live[i], deep = live[i + 1];
        const wide = rangeComboPct(freqFromArray(nashRange(kind, k, shallow, ante), HAND_ORDER));
        const narrow = rangeComboPct(freqFromArray(nashRange(kind, k, deep, ante), HAND_ORDER));
        if (!(wide >= narrow - 1.0)) broken.push(`${kind} k${k} ante=${ante}: ${shallow}bb=${wide.toFixed(1)} < ${deep}bb=${narrow.toFixed(1)}`);
      }
    }
    expect(broken, `스택이 줄었는데 레인지가 좁아진다 — 옛 표와 새 표가 한 열 안에서 이어 붙었을 때 나오는 서명이다:\n${broken.join('\n')}`).toEqual([]);
  });

  it('🔴 빅 앤티 2~10BB 의 k≥2 는 격리돼 있다 — 데이터를 안 고치고 되살리면 여기서 걸린다', () => {
    // 이 계약이 없으면 `NASH_ANTE_QUARANTINE` 을 비우는 한 줄로 거짓 조언이 조용히 돌아온다.
    // 막는 것: 빅앤티 2~10BB 의 **k≥2 열 · 모든 kind**. 단일 콜러 근사가 깨지는 구간이고(P(2명+ 콜) k8: 7bb 47.7% ·
    //   10bb 17.9% · 12bb 11.8%), 오차가 '실제보다 넓게' 쏠려 해로운 쪽이다. **오너 승인 2026-09-19**
    //   (화면에서 63칸이 내려가 CLAUDE.md 3번 기능·데이터 보존에 걸리는 결정이라 오너 확인을 받았다).
    for (const s of [2, 3, 4, 5, 6, 7, 8, 9, 10]) for (const k of [2, 5, 8]) for (const kind of ['shove', 'callBB', 'callSB'] as const) {
      expect(hasNashRange(kind, k, s, true), `${kind} ${s}bb k=${k} 빅앤티가 격리에서 풀렸다`).toBe(false);
      expect(isNashQuarantined(s, true, k, kind)).toBe(true);
    }
    // 살리는 것 ①: **SB(k=1) 전 깊이** — 상대가 하나뿐이라 단일 콜러 근사가 정확하다(2026-09-19 재산출).
    for (const s of NASH_STACKS) {
      expect(hasNashRange('shove', 1, s, true), `${s}bb SB 열까지 막혔다 — k=1 은 전 깊이 살아 있어야 한다`).toBe(true);
      expect(hasNashRange('callBB', 1, s, true), `${s}bb BB 콜 SB 열까지 막혔다`).toBe(true);
      expect(isNashQuarantined(s, true, 1)).toBe(false);
    }
    // 살리는 것 ②: 노앤티 전 구간(3bb BB 콜 제외) · 빅앤티 12BB 이상. 기능을 통째로 죽이는 것이 아니다.
    for (const s of [2, 4, 6, 10, 20]) expect(hasNashRange('shove', 8, s, false), `${s}bb 노앤티까지 막혔다`).toBe(true);
    for (const s of [12, 15, 20]) expect(hasNashRange('shove', 8, s, true), `${s}bb 빅앤티가 잘못 막혔다`).toBe(true);
    // 🔴 경계 — 눈금 하나 차이(10bb ↔ 12bb)로 갈린다. 화면이 그 선을 그대로 보여 준다.
    expect(hasNashRange('shove', 2, 10, true), '10bb 빅앤티 k≥2 가 살아 있다 — 격리 하한이 밀렸다').toBe(false);
    expect(hasNashRange('shove', 2, 12, true), '12bb 빅앤티 k≥2 가 막혔다 — 격리 상한이 밀렸다').toBe(true);
    // k 를 안 넘기면 보수적으로 격리 — '모르면 덜 말한다'
    expect(isNashQuarantined(3, true)).toBe(true);
  });

  it('🔴 추정 구간(빅앤티 2~10BB k≥2) — 차트만 allowApprox 로 읽고, 기본 경로(드릴·스팟)는 여전히 격리다 (2026-09-21)', () => {
    // 오너 결정 2026-09-21 "근사 계산 — 오늘 안에": 격리 구간을 다인 콜 근사 값으로 채우되 등급은 '추정' 이다.
    // 이 계약이 없으면 ① 추정값이 드릴 채점에 새거나 ② 추정 표가 전부 0(=전부 폴드)인 채로 차트에 나갈 수 있다.
    for (const s of [2, 3, 4, 5, 6, 7, 8, 9, 10]) for (const k of [2, 5, 8]) for (const kind of ['shove', 'callBB', 'callSB'] as const) {
      expect(isNashApprox(s, true, k)).toBe(true);
      expect(hasNashRange(kind, k, s, true), `${kind} ${s}bb k=${k} 기본 경로가 추정값을 내보낸다 — 드릴·스팟에 샌다`).toBe(false);
      expect(hasNashRange(kind, k, s, true, true), `${kind} ${s}bb k=${k} 추정값이 없다`).toBe(true);
      expect(Array.from(nashRange(kind, k, s, true, true)).some((f) => f > 0), `${kind} ${s}bb k=${k} 추정 표가 전부 0(=전부 폴드)이다`).toBe(true);
    }
    expect(isNashApprox(12, true, 2), '12bb 는 정식 등급이다').toBe(false);
    expect(isNashApprox(5, false, 2), '노앤티는 추정 구간이 아니다').toBe(false);
    expect(isNashApprox(5, true, 1), 'SB(k=1)는 정확값이다').toBe(false);
    expect(isNashApprox(5, true), 'k 를 모르면 추정이라고 말하지 않는다').toBe(false);
    // 추정 표도 k 단조(뒤 인원↑ → 좁아짐)·스택 단조(얕을수록 넓음)를 지킨다. 허용 1.0%p — 8단 양자화.
    //   10↔12bb 경계는 모델이 갈리는 자리(다인 콜 근사 ↔ 단일 콜러)라 여기서 단조를 강제하지 않는다 — check.mjs 가 참고로 센다.
    const pct = (kind: NashKind, k: number, s: number) => rangeComboPct(freqFromArray(nashRange(kind, k, s, true, true), HAND_ORDER));
    const broken: string[] = [];
    for (const kind of ['shove', 'callBB', 'callSB'] as const) {
      for (const s of [2, 3, 4, 5, 6, 7, 8, 9, 10]) for (const [a, b] of [[2, 5], [5, 8]]) if (pct(kind, a, s) < pct(kind, b, s) - 1.0) broken.push(`${kind} ${s}bb k${a}(${pct(kind, a, s).toFixed(1)}) < k${b}(${pct(kind, b, s).toFixed(1)})`);
      for (const k of [2, 5, 8]) for (const [sh, dp] of [[2, 3], [3, 5], [5, 7], [7, 10]]) if (pct(kind, k, sh) < pct(kind, k, dp) - 1.0) broken.push(`${kind} k${k} ${sh}bb(${pct(kind, k, sh).toFixed(1)}) < ${dp}bb(${pct(kind, k, dp).toFixed(1)})`);
    }
    expect(broken, `추정 표 단조성 위반: ${broken.join(' · ')}`).toEqual([]);
  });

  it('🔴 콜 표(callBB·callSB)도 전 깊이 × 앤티 유무 단조성 — 셔브 표에만 있던 계약이라 BB 콜 7~9bb 역전이 새어 나갔다(2026-09-19)', () => {
    // 상대가 좁고 강한 레인지로 셔브할수록(k↑) 콜 레인지는 좁아야 한다 — 셔브 표와 같은 원리, 같은 허용오차(1.0%p).
    // 격리된 조합은 hasNashRange 가 false 라 자동으로 빠진다 — 격리를 풀면 이 계약이 판정한다.
    // ⚠ **알려진 규칙 불일치(2026-09-19 기록, 일부러 안 고쳤다)**: 이 사슬은 `NASH_KS` 전부(k=1 포함)를 넣는데,
    //   `scripts/gen-nash/check.mjs` 의 같은 검사는 **k≥2 만** 넣는다. check.mjs 쪽 논리가 맞다 —
    //   k=1 은 SB 가 히어로라 SB 의 0.5 가 데드머니가 아니고 BB 팟오즈가 달라 k≥2 와 사과-배다.
    //   지금은 k1↔k2 역전이 전부 격리 깊이에 있어 통과하지만, **격리를 풀면 여기서 거짓 빨강이 날 수 있다.**
    //   지금 좁히면 계약을 무르게 하는 모양이라 넘긴다 — 격리를 푸는 사람이 그때 함께 판단해라(README 참고).
    const broken: string[] = [];
    for (const kind of ['callBB', 'callSB'] as const) for (const ante of [false, true]) for (const stack of NASH_STACKS) {
      const live = NASH_KS.filter((k) => hasNashRange(kind, k, stack, ante));
      for (let i = 0; i + 1 < live.length; i++) {
        const a = live[i], b2 = live[i + 1];
        const wide = rangeComboPct(freqFromArray(nashRange(kind, a, stack, ante), HAND_ORDER));
        const narrow = rangeComboPct(freqFromArray(nashRange(kind, b2, stack, ante), HAND_ORDER));
        if (!(wide >= narrow - 1.0)) broken.push(`${kind} ${stack}bb ante=${ante}: k${a}=${wide.toFixed(1)} < k${b2}=${narrow.toFixed(1)}`);
      }
    }
    expect(broken, `상대 레인지가 더 강한데 콜이 더 넓다 — 표가 깨졌다:\n${broken.join('\n')}`).toEqual([]);
  });

  it('🔴 BB 콜 표 전용 격리 — 노앤티 3bb 의 k≥2 열만 막고, 같은 깊이의 셔브·SB 콜 표와 k=1 은 살린다', () => {
    // 막는 것: 실측 역전(노앤티 3bb k1=93.6 → k2=99.2). 노앤티 k≥2 는 2026-09-19 재산출 대상이 아니라 옛 값 그대로다.
    for (const k of [2, 5, 8]) {
      expect(hasNashRange('callBB', k, 3, false), `callBB 3bb k=${k} 노앤티가 격리에서 풀렸다`).toBe(false);
      expect(isNashQuarantined(3, false, k, 'callBB')).toBe(true);
    }
    // 살리는 것: 같은 깊이의 셔브·SB 콜 표(kind 별 격리) · 노앤티 k=1
    expect(hasNashRange('shove', 5, 3, false), 'shove 3bb 노앤티가 콜 표 격리에 휩쓸렸다 — kind 별 격리가 깨졌다').toBe(true);
    expect(hasNashRange('callSB', 5, 3, false), 'callSB 3bb 노앤티가 콜 표 격리에 휩쓸렸다').toBe(true);
    expect(hasNashRange('callBB', 1, 3, false), 'callBB 3bb 노앤티 SB 열까지 막혔다').toBe(true);
    // 🔴 빅앤티 7·8·9bb 는 **여기서** 막지 않는다 — 그 깊이는 NASH_ANTE_QUARANTINE 이 kind 를 가리지 않고 통째로 막는다.
    //   두 목록이 같은 깊이를 말하면 다음 편집이 어느 쪽을 믿을지 모른다(2026-09-19 단일 출처 정리).
    expect(NASH_CALLBB_QUARANTINE.ante, '빅앤티 깊이가 콜 표 목록에 되살아났다 — 격리 출처가 둘이 된다').toEqual([]);
    for (const s of [7, 8, 9]) expect(isNashQuarantined(s, true, 5, 'callBB'), `${s}bb 빅앤티 k≥2 가 안 막혔다`).toBe(true);
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
  it('🔴 한 액션 안에서 같은 핸드가 두 빈도 버킷에 적히지 않는다 — bb_vs_hj 콜의 JTo 가 1 과 0.5 에 동시에 있었다(2026-09-19)', () => {
    // buildFreq 는 첫 지정을 우선해 계산값은 멀쩡했지만, 소스가 두 값을 말하면 다음 편집이 어느 쪽을 믿을지 모른다.
    const dup: string[] = [];
    for (const sc of RANGE_SCENARIOS) for (const a of sc.actions) {
      const seen = new Map<string, string>();
      for (const [f, str] of Object.entries(a.spec)) {
        if (!str) continue;
        for (const h of expandRange(str)) {
          if (seen.has(h)) dup.push(`${sc.id}/${a.key}: ${h} @${seen.get(h)} 와 @${f}`);
          else seen.set(h, f);
        }
      }
    }
    expect(dup, `한 액션 안에서 핸드가 두 번 적혔다:\n${dup.join('\n')}`).toEqual([]);
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

// ── 도미네이션 단조성(2026-08-30 3차) — 사례가 아니라 **불변식**을 잠근다 ──────────────
// 1차는 A5s 를 콜에도 적어 "블러프가 100% continue" 를, 2차는 그걸 고치려고 4벳 스펙 전부를
// 콜에서 빼 "QQ 가 50% continue" 를 만들었다. 정확히 같은 불변식을 반대 방향으로 두 번 깼다.
// 개별 사례를 막는 테스트로는 세 번째 방향이 또 뚫리므로 불변식 자체를 테스트로 둔다.
//
// 불변식: 한 시나리오 안에서 A 가 B 를 지배하면 continue(A) ≥ continue(B).
//   continue = 그 시나리오 전 액션의 빈도 합(= 폴드하지 않을 확률).
//
// 지배 판정은 **한 축만 다른 쌍**으로 좁힌다 — 좁게 잡아야 위반이 곧 버그다:
//   ① 페어끼리 랭크가 높으면 지배                     QQ ▷ JJ
//   ② 같은 하이카드·같은 유형(s/o)에서 키커가 높으면 지배  AKs ▷ AQs · KJo ▷ KTo · A5o ▷ A2o
//   ③ 같은 두 랭크면 수딧이 오프수트를 지배              AQs ▷ AQo
// 두 축이 동시에 다른 쌍(J9s vs 98s 류)은 비교하지 않는다 — 포스트플랍 플레이어빌리티가
// 랭크 우위를 뒤집을 수 있어 "표가 틀렸다"고 단정할 수 없기 때문.
const HAND_KIND = (n: string) => (n.length === 2 ? 'p' : n[2] === 's' ? 's' : 'o');
function dominates(a: string, b: string): boolean {
  const ka = HAND_KIND(a), kb = HAND_KIND(b);
  const [ahi, alo] = [R_VAL[a[0]], R_VAL[a[1]]];
  const [bhi, blo] = [R_VAL[b[0]], R_VAL[b[1]]];
  if (ka === 'p' || kb === 'p') return ka === 'p' && kb === 'p' && ahi > bhi; // ①
  if (ahi !== bhi) return false;
  if (ka === kb) return alo > blo;          // ②
  return ka === 's' && alo === blo;          // ③
}
/** 169 캐노니컬 핸드 — 레인지에 아예 없는(=continue 0) 지배자도 비교 대상이어야 한다 */
const ALL_HANDS: string[] = [];
for (let i = 0; i < 13; i++) for (let j = 0; j <= i; j++) {
  if (i === j) ALL_HANDS.push(R_CH[i] + R_CH[i]);
  else { ALL_HANDS.push(R_CH[i] + R_CH[j] + 's'); ALL_HANDS.push(R_CH[i] + R_CH[j] + 'o'); }
}

/** vs 3벳 4벳 스펙의 두 갈래 — 밸류는 잔여를 콜로, 블러프는 잔여를 폴드로 */
const VALUE_4BET = ['QQ', 'AKs', 'AKo'] as const;
const BLUFF_4BET = new Set(['A5s', 'A4s', 'A3s', 'A2s']);

// 의도된 예외 — **블로커 목적의 휠 에이스**뿐이다. A5s 는 A9s 를 지배하지 않지만
// A 블로커 지분으로 레인지에 들어가므로 위 불변식을 정면으로 깬다. 노드별 명시 목록으로만 통과시킨다.
// ⚠ 목록이 커지면 예외가 는 게 아니라 **표가 틀렸다는 신호**다. 그래서 아래 테스트는
//   (a) 목록에 없는 역전과 (b) 더 이상 쓰이지 않는 예외를 **둘 다** 실패시킨다.
//   (b)가 있어야 목록이 스스로 줄어들고, 데이터를 조용히 바꾼 뮤턴트도 여기서 걸린다.
const DOMINANCE_EXCEPTIONS: Record<string, string[]> = {
  // 오픈 레인지의 휠 에이스 블러프(A5s~A2s) — A6s~A8s 를 접으면서 이들만 연다
  rfi_lj: ['A5s', 'A4s', 'A3s', 'A2s'], rfi_hj: ['A5s', 'A4s', 'A3s', 'A2s'],
  rfi_utg9: ['A5s', 'A4s'], rfi_utg1: ['A5s', 'A4s', 'A3s', 'A2s'], rfi_mp9: ['A5s', 'A4s', 'A3s'],
  rfi_sb: ['A5o'],
  // 3벳 블러프
  co_3bet_lj: ['A5s', 'A4s'], btn_3bet_lj: ['A5s', 'A4s', 'A3s'],
  btn_3bet_co: ['A5s', 'A4s', 'A3s', 'A2s'], btn_3bet_hj: ['A5s', 'A4s', 'A3s', 'A2s'],
  sb_3bet_btn: ['A5s', 'A4s', 'A3s', 'A2s'], sb_3bet_co: ['A5s', 'A4s', 'A3s'],
  hj_3bet_lj: ['A5s'], co_3bet_hj: ['A5s', 'A4s', 'A3s'],
  sb_vs_lj: ['A5s'], sb_vs_hj: ['A5s', 'A4s', 'A3s'], sb_vs_co: ['A5s'],
  // sb_vs_btn 은 예외 0 — sb_3bet_btn 과 문자열을 통일하면서 A5o 가 빠졌다(2026-08-30).
  // 4벳 블러프 — 잔여가 폴드라 continue 가 4벳 빈도에서 멈춘다(그래서 A9s 0% 를 넘어선다)
  lj_vs_3bet: ['A5s'], co_vs_btn3bet: ['A5s', 'A4s'], btn_vs_sb3bet: ['A5s', 'A4s'],
  btn_vs_bb3bet: ['A5s'], co_vs_bb3bet: ['A5s', 'A4s'],
  // sb_vs_bb3bet 은 예외 0 — 콜에 A9s~A6s 가 0.5 로 있어 A5s(4벳 0.5)가 아무도 넘지 않는다.
  co_vs_sb3bet: ['A5s'], hj_vs_bb3bet: ['A5s'], hj_vs_btn3bet: ['A5s', 'A4s'],
  // bb_vs_* 는 예외 0 — BB 는 3벳 혼합의 잔여를 전부 콜로 받아 continue 가 100% 다.
  // ── 9인 보강(2026-09-02) — 9인 오픈 후기 5자리는 6맥스 표를 공유하므로 예외도 같다
  rfi_lj9: ['A5s', 'A4s', 'A3s', 'A2s'], rfi_hj9: ['A5s', 'A4s', 'A3s', 'A2s'], rfi_sb9: ['A5o'],
  // 3벳 vs 얼리 — 블러프 휠 에이스(A6s~ 는 접는다). wide 0 = A5s A4s · wide 1/2 = +A3s
  utg1_3bet_utg: ['A5s', 'A4s'], mp_3bet_utg: ['A5s', 'A4s'], lj_3bet_utg: ['A5s', 'A4s'], hj_3bet_utg: ['A5s', 'A4s'],
  co_3bet_utg: ['A5s', 'A4s', 'A3s'], btn_3bet_utg: ['A5s', 'A4s', 'A3s'],
  mp_3bet_utg1: ['A5s', 'A4s'], lj_3bet_utg1: ['A5s', 'A4s'], hj_3bet_utg1: ['A5s', 'A4s', 'A3s'],
  co_3bet_utg1: ['A5s', 'A4s', 'A3s'], btn_3bet_utg1: ['A5s', 'A4s', 'A3s'],
  lj_3bet_mp: ['A5s', 'A4s', 'A3s'], hj_3bet_mp: ['A5s', 'A4s', 'A3s'], co_3bet_mp: ['A5s', 'A4s', 'A3s'], btn_3bet_mp: ['A5s', 'A4s', 'A3s'],
  // SB 3벳-or-폴드 vs 얼리 · 얼리 vs 3벳 4벳 블러프. BB vs 얼리는 콜에 A6s+ 0.5 라 예외 0.
  sb_vs_utg: ['A5s', 'A4s'], sb_vs_utg1: ['A5s', 'A4s'], sb_vs_mp: ['A5s', 'A4s'],
  utg1_vs_3bet: ['A5s'], mp_vs_3bet: ['A5s', 'A4s'],
};

// ⚠ 예외 목록은 **게이트의 뒷문**이다 — 진짜 데이터 오류도 여기 한 줄만 넣으면 통과한다.
//    그래서 '무엇을 예외로 올릴 수 있는가'를 값으로 못박는다: 블로커 목적의 휠 에이스뿐이다.
//    (적대적 검증 지적: 현재 데이터는 이미 이 집합을 만족하므로 도입 비용 0)
const ALLOWED_EXCEPTIONS = new Set(['A5s', 'A4s', 'A3s', 'A2s', 'A5o', 'A4o']);

describe('🔴 도미네이션 단조성(전 34 시나리오)', () => {
  it('예외로 올릴 수 있는 핸드는 휠 에이스뿐이다. 예외 한 줄로 오류를 덮지 못하게', () => {
    const bad: string[] = [];
    for (const [id, hands] of Object.entries(DOMINANCE_EXCEPTIONS)) {
      for (const h of hands) if (!ALLOWED_EXCEPTIONS.has(h)) bad.push(`${id}: ${h}`);
    }
    expect(bad, `휠 에이스가 아닌 예외 ${bad.length}건 · 예외로 덮지 말고 데이터를 고쳐라`).toEqual([]);
  });

  const contMap = (s: (typeof RANGE_SCENARIOS)[number]) => {
    const m = new Map<string, number>();
    for (const a of s.actions) for (const [n, f] of buildFreq(a.spec)) m.set(n, (m.get(n) ?? 0) + f);
    return m;
  };

  it('지배하는 핸드의 continue 가 더 낮아지지 않는다 (예외는 노드별 명시 목록만)', () => {
    const bad: string[] = [];
    for (const s of RANGE_SCENARIOS) {
      const cont = contMap(s);
      const call = buildFreq(s.actions.find((a) => a.key === 'call')?.spec ?? {});
      const allow = new Set(DOMINANCE_EXCEPTIONS[s.id] ?? []);
      // 예외의 사용 한도 — 블로커 지분은 **공격 액션에서만** 나온다.
      //   콜에 섞이는 순간 그건 "블로커라서 섞는다"가 아니라 "지배당하는 핸드를 더 오래 들고 간다"라
      //   면제 사유가 사라진다. 이 한 줄이 1차 버그(A5s 를 콜에도 적어 continue 100%)를 직접 잡는다.
      for (const h of allow) {
        const fc = call.get(h) ?? 0;
        if (fc > 0) bad.push(`${s.id}: 예외 ${h} 가 콜에도 ${fc} 있다. 블로커 예외는 공격 빈도까지만이다`);
      }
      for (const [b, fb] of cont) {
        if (allow.has(b)) continue;
        for (const a of ALL_HANDS) {
          if (a === b || !dominates(a, b)) continue;
          const fa = cont.get(a) ?? 0;
          if (fa + 1e-9 < fb) bad.push(`${s.id}: ${a}(${fa}) 가 ${b}(${fb}) 를 지배하는데 continue 가 더 낮다`);
        }
      }
    }
    expect(bad, `도미네이션 역전 ${bad.length}건`).toEqual([]);
  });

  it('쓰이지 않는 예외는 목록에서 지운다 (예외 목록이 비대해지면 데이터가 틀린 것)', () => {
    const stale: string[] = [];
    for (const s of RANGE_SCENARIOS) {
      const cont = contMap(s);
      for (const h of DOMINANCE_EXCEPTIONS[s.id] ?? []) {
        const fh = cont.get(h) ?? 0;
        const used = ALL_HANDS.some((a) => a !== h && dominates(a, h) && (cont.get(a) ?? 0) + 1e-9 < fh);
        if (!used) stale.push(`${s.id}: ${h}`);
      }
    }
    expect(stale, `더 이상 역전을 만들지 않는 예외 ${stale.length}건`).toEqual([]);
  });

  it('지배 판정 자체의 계약. 한 축만 다른 쌍만 비교한다', () => {
    expect(dominates('QQ', 'JJ')).toBe(true);
    expect(dominates('JJ', 'QQ')).toBe(false);
    expect(dominates('AKs', 'AQs')).toBe(true);
    expect(dominates('KJo', 'KTo')).toBe(true);
    expect(dominates('A5o', 'A2o')).toBe(true);
    expect(dominates('AQs', 'AQo')).toBe(true);
    expect(dominates('AQo', 'AQs')).toBe(false);
    expect(dominates('J9s', '98s')).toBe(false); // 두 축이 동시에 다르면 비교 안 함
    expect(dominates('AA', 'AKs')).toBe(false);  // 페어 vs 논페어는 비교 안 함
  });
});

// ── 2026-08-30 확장(23 → 34개) — SB 수비 3 · 콜드 3벳 3 · vs 3벳 5 ─────────────
// 여기서 고정하는 건 "숫자가 예쁘다"가 아니라 **표들 사이의 관계**다.
// 폭(콤보 %)은 근거(알파·MDF·스퀴즈 노출)에서 나오므로, 누가 스펙을 손대면 관계부터 깨진다.
describe('ranges.data 확장 스팟(2026-08-30)', () => {
  const byId = (id: string) => RANGE_SCENARIOS.find((s) => s.id === id)!;
  const pct = (id: string, key: string) => {
    const s = byId(id);
    const a = s.actions.find((x) => x.key === key)!;
    return rangeComboPct(buildFreq(a.spec));
  };

  it('63개 · id 중복 없음 · 신규 11개가 전부 존재', () => {
    // 2026-09-02 9인 확장: 34 → 63 (오픈 후반 5 · 얼리 3벳 15 · 얼리 수비 6 · 얼리 vs 3벳 3)
    expect(RANGE_SCENARIOS).toHaveLength(63);
    expect(new Set(RANGE_SCENARIOS.map((s) => s.id)).size).toBe(63);
    for (const id of ['sb_vs_lj', 'sb_vs_hj', 'sb_vs_co', 'hj_3bet_lj', 'co_3bet_hj', 'btn_3bet_hj',
      'sb_vs_bb3bet', 'co_vs_bb3bet', 'co_vs_sb3bet', 'hj_vs_bb3bet', 'hj_vs_btn3bet']) {
      expect(byId(id), id).toBeTruthy();
    }
  });

  it('신규 전 시나리오 파싱 + 콤보 %가 근거대로(±0.1%p)', () => {
    const EXPECT: [string, string, number][] = [
      // 2026-08-30 3차 — 밸류 4벳 잔여 = 콜 / 블러프 4벳 잔여 = 폴드 규약 확정 후 재산출.
      // 3벳 축(sb_vs_*·*_3bet_*)은 이번 수정과 무관해 값이 그대로다.
      ['sb_vs_lj', 'raise', 4.22], ['sb_vs_lj', 'call', 4.68],
      ['sb_vs_hj', 'raise', 5.13], ['sb_vs_hj', 'call', 5.51],
      ['sb_vs_co', 'raise', 9.05], ['sb_vs_co', 'call', 5.05],
      ['hj_3bet_lj', 'raise', 3.77], ['co_3bet_hj', 'raise', 4.37], ['btn_3bet_hj', 'raise', 5.35],
      // 밸류 4벳(QQ·AKs·AKo) 잔여가 콜로 들어와 vs 3벳 콜이 전 노드 +0.83%p
      ['lj_vs_3bet', 'fourbet', 1.89], ['lj_vs_3bet', 'call', 3.47],
      ['sb_vs_bb3bet', 'fourbet', 1.89], ['sb_vs_bb3bet', 'call', 8.97],
      ['co_vs_bb3bet', 'fourbet', 2.04], ['co_vs_bb3bet', 'call', 5.66],
      ['co_vs_sb3bet', 'fourbet', 1.89], ['co_vs_sb3bet', 'call', 4.90],
      ['hj_vs_bb3bet', 'fourbet', 1.89], ['hj_vs_bb3bet', 'call', 4.07],
      ['hj_vs_btn3bet', 'fourbet', 2.04], ['hj_vs_btn3bet', 'call', 5.51],
      ['co_vs_btn3bet', 'call', 8.52], ['btn_vs_sb3bet', 'call', 9.28], ['btn_vs_bb3bet', 'call', 10.33],
      // 기존 표지만 ⑥(핸드 단위 단조성 역전) 수정으로 콜이 넓어진 노드
      ['sb_vs_btn', 'call', 9.2],
      // 🔴 BB 수비 다섯 표 — 3벳 혼합의 잔여를 콜로 받는 규약 복구(예전엔 잔여가 통째로 비어
      //    QJs 가 Q9s 보다, JJ 가 77 보다 덜 수비하는 도미네이션 역전이 있었다)
      ['bb_vs_lj', 'call', 18.36], ['bb_vs_hj', 'call', 20.02], ['bb_vs_co', 'call', 22.10],
      ['bb_vs_btn', 'call', 33.48], ['bb_vs_sb', 'call', 29.22],
      // KQo 누락(KJo 절반 3벳이 KQo 0% 를 지배) 보강
      ['btn_3bet_co', 'raise', 7.84],
    ];
    for (const [id, key, want] of EXPECT) expect(pct(id, key), `${id}:${key}`).toBeCloseTo(want, 1);
  });

  it('🔴 콜드 3벳 단조성: 뒤에 남은 인원이 많을수록 좁다(HJ < CO < BTN, vs LJ)', () => {
    expect(pct('hj_3bet_lj', 'raise')).toBeLessThan(pct('co_3bet_lj', 'raise'));
    expect(pct('co_3bet_lj', 'raise')).toBeLessThan(pct('btn_3bet_lj', 'raise'));
  });

  it('🔴 BTN 3벳 단조성: 상대 오픈이 넓을수록 넓다(vs LJ < vs HJ < vs CO)', () => {
    expect(pct('btn_3bet_lj', 'raise')).toBeLessThan(pct('btn_3bet_hj', 'raise'));
    expect(pct('btn_3bet_hj', 'raise')).toBeLessThan(pct('btn_3bet_co', 'raise'));
  });

  it('🔴 SB 총 수비 단조성: vs LJ < vs HJ < vs CO < vs BTN', () => {
    const total = (id: string) => rangeComboPct(buildFreq(byId(id).actions[0].spec)) + rangeComboPct(buildFreq(byId(id).actions[1].spec));
    expect(total('sb_vs_lj')).toBeLessThan(total('sb_vs_hj'));
    expect(total('sb_vs_hj')).toBeLessThan(total('sb_vs_co'));
    expect(total('sb_vs_co')).toBeLessThan(total('sb_vs_btn'));
  });

  // ⑥ 총합 단조성은 **합계는 통과하는데 표는 틀린 것을 가르치는** 상태를 못 잡는다.
  //   실제로 sb_vs_btn 은 총합이 가장 컸는데도 77·88·A9s·A8s·KTs·QTs·JTs·T9s·98s 아홉 핸드에서
  //   sb_vs_co 보다 빈도가 낮았다 — "가장 넓게 여는 BTN 상대인데 CO 보다 덜 수비" 하는 역전.
  //   그래서 축의 계약을 **핸드 단위**로 잠근다.
  it('🔴 SB 수비 핸드 단위 단조성: 상대가 넓어질수록 어떤 핸드도 빈도가 줄지 않는다', () => {
    const totalFreq = (id: string) => {
      const m = new Map<string, number>();
      for (const a of byId(id).actions) for (const [n, f] of buildFreq(a.spec)) m.set(n, (m.get(n) ?? 0) + f);
      return m;
    };
    const chain = ['sb_vs_lj', 'sb_vs_hj', 'sb_vs_co', 'sb_vs_btn'];
    for (let i = 0; i < chain.length - 1; i++) {
      const narrow = totalFreq(chain[i]), wide = totalFreq(chain[i + 1]);
      for (const [n, f] of narrow) {
        expect(wide.get(n) ?? 0, `${chain[i]} → ${chain[i + 1]} : ${n}`).toBeGreaterThanOrEqual(f);
      }
    }
  });

  // ②③ vs 3벳 표기 규약(3차·확정) — **4벳 혼합의 잔여는 핸드의 성격이 정한다.**
  //   1차: A5s 를 콜에도 적어 블러프가 100% continue → "블러프가 절대 안 접힌다".
  //   2차: 그걸 고치려고 4벳 스펙 전부를 콜에서 뺐다 → QQ·AK 가 50% 인데 77·87s 는 100%.
  //   두 라운드가 같은 불변식을 반대 방향으로 깼다. 그래서 규약을 둘로 쪼개 각각 잠근다.
  it('🔴 밸류 4벳(QQ·AKs·AKo)의 잔여는 콜 · continue 100%', () => {
    for (const s of RANGE_SCENARIOS.filter((x) => x.group === 'vs3bet')) {
      const four = buildFreq(s.actions.find((a) => a.key === 'fourbet')!.spec);
      const call = buildFreq(s.actions.find((a) => a.key === 'call')!.spec);
      for (const n of VALUE_4BET) {
        const f4 = four.get(n) ?? 0;
        if (f4 === 0) continue; // 그 노드가 아예 4벳하지 않는 핸드는 대상 아님
        expect(f4 + (call.get(n) ?? 0), `${s.id}: ${n} 의 4벳+콜`).toBeCloseTo(1, 5);
      }
    }
  });

  it('🔴 블러프 4벳(휠 에이스)의 잔여는 폴드. 콜 스펙에 없다', () => {
    for (const s of RANGE_SCENARIOS.filter((x) => x.group === 'vs3bet')) {
      const four = buildFreq(s.actions.find((a) => a.key === 'fourbet')!.spec);
      const call = buildFreq(s.actions.find((a) => a.key === 'call')!.spec);
      for (const n of four.keys()) {
        if (!BLUFF_4BET.has(n)) continue;
        expect(call.has(n), `${s.id}: 블러프 4벳 ${n} 이 콜에도 있다. 잔여는 폴드다`).toBe(false);
      }
    }
  });

  // ① 폭의 근거는 상대 3벳 사이즈가 강요하는 MDF **하한**이다: continue ÷ 내 오픈.
  //   OOP 4x → 25% / IP 3x → 34.8%. 예전 sb_vs_bb3bet 은 15.9%(폴드 84%)로,
  //   BB 가 **아무 두 장으로 3벳해도 이득**인 수치였다.
  //   3차에서 밸류 4벳 잔여를 콜로 받으며 전 노드가 0.8%p 안팎 올라 밴드를 23~39% 로 옮겼다
  //   (실측 24.5~38.0%). MDF 는 하한이므로 상회는 정상, 미달만 착취당한다.
  it('🔴 vs 3벳 MDF: continue ÷ 오픈 비율이 전 노드 23~39%', () => {
    for (const s of RANGE_SCENARIOS.filter((x) => x.group === 'vs3bet')) {
      const cont = s.actions.reduce((t, a) => t + rangeComboPct(buildFreq(a.spec)), 0);
      // 9인 얼리 히어로의 오픈은 9인 표(rfi_utg9·rfi_utg1·rfi_mp9)에서 찾는다
      const OPEN_ID: Record<string, string> = { UTG: 'rfi_utg9', 'UTG+1': 'rfi_utg1', MP: 'rfi_mp9' };
      const open = rangeComboPct(buildFreq(byId(OPEN_ID[s.hero] ?? `rfi_${s.hero.toLowerCase()}`).actions[0].spec));
      const ratio = (100 * cont) / open;
      expect(ratio, `${s.id} continue/오픈`).toBeGreaterThan(23);
      expect(ratio, `${s.id} continue/오픈`).toBeLessThan(39);
    }
  });

  // ⑤ 같은 BTN 3x 를 맞는 두 노드. BTN 은 CO 를 상대로 더 넓게 3벳하므로(7.8% > 5.4%)
  //   CO 쪽이 더 넓게 수비해야 한다 — 예전엔 28.8% vs 35.3% 로 방향이 반대였다.
  //   3차에서 밸류 4벳 잔여가 두 노드를 함께 밀어 올렸는데 분모가 작은 HJ 가 더 크게 올라
  //   한 번 뒤집혔다(38.0 < 38.6) — hj_vs_btn3bet 의 콜에서 77·A9s 를 빼 36.8% 로 되돌렸다.
  it('🔴 같은 3벳 사이즈면 상대가 넓게 3벳하는 쪽이 더 넓게 수비한다(CO ≥ HJ, vs BTN 3벳)', () => {
    const ratio = (id: string, rfi: string) => {
      const cont = byId(id).actions.reduce((t, a) => t + rangeComboPct(buildFreq(a.spec)), 0);
      return cont / rangeComboPct(buildFreq(byId(rfi).actions[0].spec));
    };
    expect(pct('btn_3bet_hj', 'raise')).toBeLessThan(pct('btn_3bet_co', 'raise'));
    expect(ratio('co_vs_btn3bet', 'rfi_co')).toBeGreaterThanOrEqual(ratio('hj_vs_btn3bet', 'rfi_hj'));
  });

  // 같은 스팟(hero·vs 동일)이 defend 그룹과 threebet 그룹에 각각 있는 쌍은 **맵까지** 같아야 한다.
  // 폭(콤보 %)만 보면 절대 안 잡힌다 — 실제로 sb_vs_btn 과 sb_3bet_btn 이 A5o↔ATo 한 토큰만 달랐고
  // 오프수트라 콤보 수가 같아 둘 다 11.92% 로 찍혔다. 앱에서는 '어느 탭으로 들어왔느냐'에 따라
  // 같은 질문에 다른 답이 뜨는 상태였다(2026-08-30 적대적 검증이 잡음).
  it.each([['sb_vs_co', 'sb_3bet_co'], ['sb_vs_btn', 'sb_3bet_btn']])(
    '🔴 같은 스팟이 두 그룹에 있으면 폭이 아니라 **맵 자체**가 같아야 한다(%s 3벳 = %s)',
    (defendId, threebetId) => {
      const a = buildFreq(byId(defendId).actions[0].spec);
      const b = buildFreq(byId(threebetId).actions[0].spec);
      expect(a.size, `${defendId} vs ${threebetId} 핸드 수`).toBe(b.size);
      for (const [n, f] of a) expect(b.get(n), `${defendId} vs ${threebetId} — ${n}`).toBe(f);
    },
  );

  it('포지션 축(hero/vs)이 전 시나리오에 있고 상대 축은 매치업에만 있다', () => {
    const POS = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
    for (const s of RANGE_SCENARIOS) {
      expect(POS, s.id).toContain(s.hero);
      if (s.vs) expect(POS, s.id).toContain(s.vs);
      // RFI 는 상대가 특정되지 않는다 / 매치업 표는 제네릭 vs 3벳(lj·utg·utg1·mp)만 예외
      if (s.group === 'rfi6' || s.group === 'rfi9') expect(s.vs, s.id).toBeUndefined();
      else if (!/^(lj|utg|utg1|mp)_vs_3bet$/.test(s.id)) expect(s.vs, s.id).toBeTruthy();
      // 2단 선택 UI 의 전제 — 칩 행은 가로 스크롤(RangeGuide overflow-x-auto)이라 포지션 수(9)까지만 허용
    }
    for (const g of ['rfi6', 'rfi9', 'defend', 'threebet', 'vs3bet'] as const) {
      const inG = RANGE_SCENARIOS.filter((s) => s.group === g);
      expect(new Set(inG.map((s) => s.hero)).size, `${g} hero 행`).toBeLessThanOrEqual(9);
      for (const h of new Set(inG.map((s) => s.hero))) {
        expect(inG.filter((s) => s.hero === h).length, `${g}/${h} 상대 행`).toBeLessThanOrEqual(9);
      }
    }
  });

  it('🔴 외부 소비 id 보존. 리네임하면 프리셋·오답큐가 조용히 빈다', () => {
    // useDeepGto VILLAIN_RANGE_PRESETS · AdvancedCalcs MATRIX_PRESETS 가 id 로 조회한다.
    for (const [id, key] of [['rfi_lj', 'raise'], ['rfi_hj', 'raise'], ['rfi_co', 'raise'], ['rfi_btn', 'raise'],
      ['rfi_sb', 'raise'], ['bb_vs_btn', 'call'], ['sb_3bet_btn', 'raise']] as const) {
      const s = RANGE_SCENARIOS.find((x) => x.id === id);
      expect(s, id).toBeTruthy();
      expect(s!.actions.some((a) => a.key === key), `${id}:${key}`).toBe(true);
    }
    // preflopQuiz RFI_LIST — 확장이 트레이너 출제 분포를 흔들지 않았는지(6맥스 5 + 9인 8 · 2026-09-02 후반 5 추가)
    expect(RANGE_SCENARIOS.filter((s) => s.group === 'rfi6')).toHaveLength(5);
    expect(RANGE_SCENARIOS.filter((s) => s.group === 'rfi9')).toHaveLength(8);
  });
});
