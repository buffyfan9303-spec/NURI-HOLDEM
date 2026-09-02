// 레인지 파서·콤보 가중·Nash 데이터 정합 검증
import { describe, it, expect } from 'vitest';
import { expandRange, buildFreq, comboCount, rangeComboPct, gridName, freqFromArray, R_CH, R_VAL } from './ranges';
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
