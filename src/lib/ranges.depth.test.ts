// 깊이 표(25 · 40 · 60bb, BB 앤티) 계약 — ranges.depth.data.ts (2026-10-09).
//
// 이 표들은 자체 제작이라 **점 값을 보증하는 독립 오라클이 없다**. 그래서 여기서 잠그는 것은 값이 아니라 관계다:
//   자리 순서 · 깊이 순서 · 지배 단조성 · BB 잔여 규약 · 4벳 규약 · MDF 밴드 · 노트 수치 = 크기에서 나온 산수 · 정직 표기 · 격리.
// 이름에 '설계 규칙' 이 붙은 테스트는 증명된 사실이 아니라 **일관성 규칙**이다(어기면 표가 서로 모순된다는 뜻이지,
// 지키면 최적이라는 뜻이 아니다).
//
// ⚠ 축 분리: 100bb 표(ranges.data.ts)는 **앤티 없음** 기준이고 깊이 표는 BB 앤티 1bb 기준이다.
//   그래서 60bb ↔ 100bb 를 깊이 간 단조성으로 엮지 않는다 — 앤티가 빠지면 BB 콜 가격이 21.3% → 27.3% 로 뛰어
//   수비가 좁아지는데, 그건 깊이 효과가 아니라 앤티 효과다. 이 파일의 깊이 간 비교는 25 · 40 · 60 끼리만이다.
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildFreq, comboCount, expandRange, rangeComboPct, R_CH, R_VAL } from './ranges';
import { RANGE_SCENARIOS, type RangeScenario, type TablePos } from './ranges.data';
import { NASH_STACKS } from './nash.data';
import {
  DEPTH_META, DEPTH_SCENARIOS, DEPTH_GAP_NOTE, RANGE_DEPTHS, baseIdOf, bbCallPrice, bbJamAlpha, bbStr, carryScenario,
  depthId, fourbetAlpha, jamCallPrice, mdfVsBb3bet, pct1, stealAlpha, type RangeDepth,
} from './ranges.depth.data';

const ROOT = join(__dirname, '..', '..');
const ALL_DEPTH = RANGE_DEPTHS.flatMap((d) => DEPTH_SCENARIOS[d].map((s) => ({ d, s })));
const pct = (spec: RangeScenario['actions'][number]['spec']) => rangeComboPct(buildFreq(spec));
const find = (d: RangeDepth, pred: (s: RangeScenario) => boolean) => {
  const s = DEPTH_SCENARIOS[d].find(pred);
  if (!s) throw new Error(`${d}bb 표 없음`);
  return s;
};
const rfi = (d: RangeDepth, p: TablePos) => find(d, (s) => s.group === 'rfi9' && s.hero === p);
const openPct = (d: RangeDepth, p: TablePos) => pct(rfi(d, p).actions[0].spec);
const defend = (d: RangeDepth, vs: TablePos) => find(d, (s) => s.group === 'defend' && s.vs === vs);
const total = (s: RangeScenario) => s.actions.reduce((x, a) => x + pct(a.spec), 0);
const contMap = (s: RangeScenario) => {
  const m = new Map<string, number>();
  for (const a of s.actions) for (const [n, f] of buildFreq(a.spec)) m.set(n, (m.get(n) ?? 0) + f);
  return m;
};
const NINE: TablePos[] = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB'];
const CHAIN: TablePos[] = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN'];
const EARLY_OPENERS: TablePos[] = ['UTG', 'UTG+1', 'MP', 'LJ'];
const LATE_OPENERS: TablePos[] = ['HJ', 'CO', 'BTN', 'SB'];

describe('깊이 집합·크기 — 사실과 가정값', () => {
  it('깊이는 25 < 40 < 60 이고 푸시·폴드(최대 20bb)·100bb 표와 겹치지 않는다', () => {
    expect([...RANGE_DEPTHS]).toEqual([25, 40, 60]);
    for (let i = 1; i < RANGE_DEPTHS.length; i++) expect(RANGE_DEPTHS[i]).toBeGreaterThan(RANGE_DEPTHS[i - 1]);
    expect(Math.min(...RANGE_DEPTHS)).toBeGreaterThan(Math.max(...NASH_STACKS));
    expect(Math.max(...RANGE_DEPTHS)).toBeLessThan(100);
  });

  it('크기 잠금 — 오픈은 깊을수록 같거나 크고 100bb 오픈(2.5bb) 이하 · 25bb 3벳은 올인 · 40/60 3벳 ≤ 스택/3 · 앤티 1bb', () => {
    const m = RANGE_DEPTHS.map((d) => DEPTH_META[d]);
    for (let i = 1; i < m.length; i++) {
      expect(m[i].openBb).toBeGreaterThanOrEqual(m[i - 1].openBb);
      expect(m[i].sbOpenBb).toBeGreaterThanOrEqual(m[i - 1].sbOpenBb);
    }
    for (const x of m) {
      expect(x.openBb).toBeLessThanOrEqual(2.5);
      expect(x.anteBb).toBe(1);
    }
    for (const d of RANGE_DEPTHS) expect(DEPTH_META[d].stackBb).toBe(d);
    expect(DEPTH_META[25].bb3betBb).toBe('allin');
    for (const d of [40, 60] as const) {
      const b = DEPTH_META[d].bb3betBb;
      expect(typeof b).toBe('number');
      expect(b as number).toBeLessThanOrEqual(d / 3);
    }
  });

  it('산수 헬퍼 = 크기에서 나온 값(독립 재계산과 같은 수)', () => {
    const m25 = DEPTH_META[25], m40 = DEPTH_META[40], m60 = DEPTH_META[60];
    expect([stealAlpha(m25), bbCallPrice(m25), jamCallPrice(m25), jamCallPrice(m25, true), bbJamAlpha(m25)].map(pct1))
      .toEqual(['44.4%', '18.2%', '44.7%', '44.1%', '84.2%']);
    expect([stealAlpha(m40), bbCallPrice(m40), mdfVsBb3bet(m40), mdfVsBb3bet(m40, true), fourbetAlpha(m40)].map(pct1))
      .toEqual(['46.8%', '20.3%', '37.0%', '36.0%', '74.9%']);
    expect([stealAlpha(m60), bbCallPrice(m60), mdfVsBb3bet(m60), mdfVsBb3bet(m60, true), fourbetAlpha(m60)].map(pct1))
      .toEqual(['47.9%', '21.3%', '34.8%', '35.7%', '80.7%']);
  });
});

// 노트·설명에 나오는 %·bb 수치는 그 깊이의 크기·헬퍼 값이어야 한다 — 100bb 문장 복사('2.5bb 오픈 · 7.5bb 3벳')를 막는다.
function allowedNumbers(d: RangeDepth) {
  const m = DEPTH_META[d];
  const per = new Set<string>();
  for (const sb of [false, true]) {
    for (const f of [stealAlpha, bbCallPrice, mdfVsBb3bet, fourbetAlpha, jamCallPrice, bbJamAlpha]) per.add(pct1(f(m, sb)));
  }
  const bb = new Set<string>([m.stackBb, m.anteBb, m.openBb, m.sbOpenBb, ...(typeof m.bb3betBb === 'number' ? [m.bb3betBb] : [])].map(bbStr));
  return { per, bb };
}
function strayNumbers(d: RangeDepth, text: string): string[] {
  const { per, bb } = allowedNumbers(d);
  const out: string[] = [];
  for (const [, n] of text.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)%/g)) if (!per.has(`${Number(n).toFixed(1)}%`)) out.push(`${n}%`);
  for (const [, n] of text.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)bb/g)) if (!bb.has(bbStr(Number(n)))) out.push(`${n}bb`);
  return out;
}

describe('크기 단일 소스 — 노트 수치는 헬퍼 값', () => {
  it('전 깊이 표의 desc·note 의 %·bb 숫자가 그 깊이 크기·헬퍼 값과 같다', () => {
    const bad: string[] = [];
    for (const { d, s } of ALL_DEPTH) {
      const stray = strayNumbers(d, `${s.desc} ${s.note ?? ''}`);
      if (stray.length) bad.push(`${s.id}: ${stray.join(', ')}`);
    }
    expect(bad).toEqual([]);
  });

  it('검사기 자체 — 100bb 노트 문장의 수치는 40bb 에서 걸리고, 40bb 크기 문구는 통과한다', () => {
    expect(strayNumbers(60, '2.5bb 오픈에 BB 가 7.5bb 로 3벳')).toEqual(['2.5bb', '7.5bb']);
    // 40bb 는 SB 가 2.5bb 로 열어 '2.5bb' 자체는 수치로 허용된다 — SB 가 아닌 표의 2.5bb 는 정직 표기 검사가 막는다
    expect(strayNumbers(40, '2.5bb 오픈에 BB 가 7.5bb 로 3벳')).toEqual(['7.5bb']);
    expect(strayNumbers(40, '알파 65.2% → MDF 34.8%')).toEqual(['65.2%', '34.8%']); // 100bb IP 3x 노트의 수치
    expect(strayNumbers(40, '2.2bb 오픈 · 3벳 9bb · MDF 37.0% · 앤티 1bb · 유효 40bb')).toEqual([]);
    expect(strayNumbers(25, 'SB 2.5bb 레이즈 · 올인 콜 44.7%')).toEqual([]);
  });
});

describe('커밋 구조 — 깊이별 액션 키', () => {
  it('25bb 수비는 {올인, 콜} · 40/60 수비는 {3벳, 콜} · vs 3벳은 {4벳(올인), 콜} · 25bb 에는 vs 3벳이 없다', () => {
    for (const { d, s } of ALL_DEPTH) {
      const keys = s.actions.map((a) => a.key).sort().join(',');
      if (s.group === 'defend') expect(keys, s.id).toBe(d === 25 ? 'allin,call' : 'call,raise');
      if (s.group === 'vs3bet') {
        expect(keys, s.id).toBe('call,fourbet');
        expect(s.actions.find((a) => a.key === 'fourbet')!.label, s.id).toContain('올인');
      }
      if (s.group === 'rfi9' || s.group === 'rfi6') expect(keys, s.id).toBe('raise');
    }
    expect(DEPTH_SCENARIOS[25].some((s) => s.group === 'vs3bet')).toBe(false);
    expect(DEPTH_SCENARIOS[25].some((s) => s.actions.some((a) => a.key === 'raise' && s.group === 'defend'))).toBe(false);
  });

  it('구성 — 깊이마다 9인 오픈 8 · 6인 별칭 5 · BB 수비 8 · (40/60) vs 3벳 8 · 3벳·SB 수비 없음', () => {
    for (const d of RANGE_DEPTHS) {
      const L = DEPTH_SCENARIOS[d];
      const n = (g: RangeScenario['group']) => L.filter((s) => s.group === g).length;
      expect([n('rfi9'), n('rfi6'), n('defend'), n('vs3bet'), n('threebet')]).toEqual([8, 5, 8, d === 25 ? 0 : 8, 0]);
      expect(L.filter((s) => s.group === 'defend').every((s) => s.hero === 'BB')).toBe(true);
    }
  });
});

describe('위생 — 100bb 와 같은 규칙', () => {
  it('모든 토큰이 단일 캐노니컬 손이다(생성 함수가 문자열 집합으로 잔여를 계산하므로)', () => {
    const bad: string[] = [];
    for (const { s } of ALL_DEPTH) for (const a of s.actions) for (const str of Object.values(a.spec)) {
      for (const t of (str ?? '').split(/\s+/).filter(Boolean)) {
        const ok = /^[2-9TJQKA]{2}[so]?$/.test(t) && expandRange(t).length === 1 && expandRange(t)[0] === t;
        if (!ok) bad.push(`${s.id}/${a.key}: ${t}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('폭 — 공격(올인·4벳) > 1.5% · 그 밖 > 2% · 액션별 < 62% · 수비 합계 ≤ 80%', () => {
    for (const { s } of ALL_DEPTH) {
      for (const a of s.actions) {
        const p = pct(a.spec);
        expect(p, `${s.id}:${a.key}`).toBeGreaterThan(a.key === 'allin' || a.key === 'fourbet' ? 1.5 : 2);
        expect(p, `${s.id}:${a.key}`).toBeLessThan(62);
      }
      if (s.group === 'defend') expect(total(s), s.id).toBeLessThanOrEqual(80);
    }
  });

  it('한 액션 안에서 같은 손이 두 버킷에 없고, 손별 액션 빈도 합은 1 이하다', () => {
    const bad: string[] = [];
    for (const { s } of ALL_DEPTH) {
      for (const a of s.actions) {
        const seen = new Set<string>();
        for (const str of Object.values(a.spec)) for (const h of expandRange(str ?? '')) {
          if (seen.has(h)) bad.push(`${s.id}/${a.key}: ${h} 중복`);
          seen.add(h);
        }
      }
      for (const [h, f] of contMap(s)) if (f > 1 + 1e-9) bad.push(`${s.id}: ${h} 합 ${f}`);
    }
    expect(bad).toEqual([]);
  });
});

// ── 지배 단조성 — ranges.test.ts 와 같은 판정(한 축만 다른 쌍) ─────────────────────────
const HAND_KIND = (n: string) => (n.length === 2 ? 'p' : n[2] === 's' ? 's' : 'o');
function dominates(a: string, b: string): boolean {
  const ka = HAND_KIND(a), kb = HAND_KIND(b);
  const [ahi, alo] = [R_VAL[a[0]], R_VAL[a[1]]];
  const [bhi, blo] = [R_VAL[b[0]], R_VAL[b[1]]];
  if (ka === 'p' || kb === 'p') return ka === 'p' && kb === 'p' && ahi > bhi;
  if (ahi !== bhi) return false;
  if (ka === kb) return alo > blo;
  return ka === 's' && alo === blo;
}
const ALL_HANDS: string[] = [];
for (let i = 0; i < 13; i++) for (let j = 0; j <= i; j++) {
  if (i === j) ALL_HANDS.push(R_CH[i] + R_CH[i]);
  else { ALL_HANDS.push(R_CH[i] + R_CH[j] + 's'); ALL_HANDS.push(R_CH[i] + R_CH[j] + 'o'); }
}
/** 노드별 명시 예외 — 4벳 블러프 휠 에이스(나머지 절반을 접어 A6s~A9s 0% 를 넘는다)뿐이다. */
const DEPTH_DOMINANCE_EXCEPTIONS: Record<string, string[]> = {
  'co_vs_bb3bet@40': ['A5s', 'A4s'],
  'mp_vs_bb3bet@60': ['A5s'], 'lj_vs_bb3bet@60': ['A5s'], 'hj_vs_bb3bet@60': ['A5s', 'A4s'], 'co_vs_bb3bet@60': ['A5s', 'A4s'],
  // 그 밖의 vs 3벳은 예외 0 — 얼리 40bb·UTG/UTG+1 60bb 는 휠 에이스 블러프 올인이 폴드보다 손해라(필요조건 검산) 넣지 않았고,
  //   btn·sb 는 콜에 A6s~A9s 가 있어 블러프를 넘는 손이 없다.
  // 오픈·BB 수비는 예외 0 — 손 사다리가 지배 순서를 지킨다(ranges.depth.data.ts OPEN_LADDER · CALL_LADDER).
};
const ALLOWED_EXCEPTIONS = new Set(['A5s', 'A4s', 'A3s', 'A2s', 'A5o', 'A4o']);

describe('🔴 지배 단조성(깊이 표 전부)', () => {
  it('예외는 휠 에이스이고 공격 키(올인·4벳·3벳·오픈)에만 있다', () => {
    const bad: string[] = [];
    for (const [id, hands] of Object.entries(DEPTH_DOMINANCE_EXCEPTIONS)) {
      const s = ALL_DEPTH.find((x) => x.s.id === id)?.s;
      if (!s) { bad.push(`${id}: 없는 표`); continue; }
      const call = buildFreq(s.actions.find((a) => a.key === 'call')?.spec ?? {});
      for (const h of hands) {
        if (!ALLOWED_EXCEPTIONS.has(h)) bad.push(`${id}: ${h} 는 휠 에이스가 아니다`);
        if ((call.get(h) ?? 0) > 0) bad.push(`${id}: 예외 ${h} 가 콜에도 있다`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('지배하는 손의 continue 가 더 낮지 않다(예외는 노드별 명시 목록만)', () => {
    const bad: string[] = [];
    for (const { s } of ALL_DEPTH) {
      const cont = contMap(s);
      const allow = new Set(DEPTH_DOMINANCE_EXCEPTIONS[s.id] ?? []);
      for (const [b, fb] of cont) {
        if (allow.has(b)) continue;
        for (const a of ALL_HANDS) if (a !== b && dominates(a, b) && (cont.get(a) ?? 0) + 1e-9 < fb) bad.push(`${s.id}: ${a} < ${b}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('쓰이지 않는 예외는 목록에서 지운다', () => {
    const stale: string[] = [];
    for (const [id, hands] of Object.entries(DEPTH_DOMINANCE_EXCEPTIONS)) {
      const s = ALL_DEPTH.find((x) => x.s.id === id)!.s;
      const cont = contMap(s);
      for (const h of hands) {
        const fh = cont.get(h) ?? 0;
        if (!ALL_HANDS.some((a) => a !== h && dominates(a, h) && (cont.get(a) ?? 0) + 1e-9 < fh)) stale.push(`${id}: ${h}`);
      }
    }
    expect(stale).toEqual([]);
  });
});

describe('깊이 안 — 자리 관계', () => {
  it('🔴 오픈 폭은 UTG < UTG+1 < MP < LJ < HJ < CO < BTN (엄격 · 뒤에 남은 인원이 적을수록 넓다)', () => {
    for (const d of RANGE_DEPTHS) {
      const w = CHAIN.map((p) => openPct(d, p));
      for (let i = 1; i < w.length; i++) expect(w[i], `${d}bb ${CHAIN[i - 1]} < ${CHAIN[i]}`).toBeGreaterThan(w[i - 1]);
    }
  });

  it('🔴 BB 수비 합계는 vs UTG ≤ … ≤ vs BTN (오프너가 넓을수록 약하다)', () => {
    for (const d of RANGE_DEPTHS) {
      const t = CHAIN.map((p) => total(defend(d, p)));
      for (let i = 1; i < t.length; i++) expect(t[i] + 1e-9, `${d}bb vs ${CHAIN[i - 1]} ≤ vs ${CHAIN[i]}`).toBeGreaterThanOrEqual(t[i - 1]);
    }
  });

  it('🔴 BB 잔여 규약 — 공격 빈도가 0~1 사이인 손은 나머지가 전부 콜이다(continue = 1)', () => {
    const bad: string[] = [];
    for (const { s } of ALL_DEPTH) {
      if (s.group !== 'defend') continue;
      const atk = buildFreq(s.actions.find((a) => a.key !== 'call')!.spec);
      const cont = contMap(s);
      for (const [h, f] of atk) if (f > 0 && f < 1 && Math.abs((cont.get(h) ?? 0) - 1) > 1e-9) bad.push(`${s.id}: ${h} ${cont.get(h)}`);
    }
    expect(bad).toEqual([]);
  });

  it('🔴 4벳 규약(40/60) — 4벳·콜 손은 그 오프너의 오픈 레인지 안 · 밸류 혼합의 나머지는 콜 · 휠 에이스 블러프의 나머지는 폴드', () => {
    const bad: string[] = [];
    const WHEEL = new Set(['A5s', 'A4s', 'A3s', 'A2s']);
    for (const d of [40, 60] as const) {
      for (const s of DEPTH_SCENARIOS[d].filter((x) => x.group === 'vs3bet')) {
        const open = buildFreq(rfi(d, s.hero).actions[0].spec);
        const fb = buildFreq(s.actions.find((a) => a.key === 'fourbet')!.spec);
        const call = buildFreq(s.actions.find((a) => a.key === 'call')!.spec);
        for (const h of [...fb.keys(), ...call.keys()]) if (!open.has(h)) bad.push(`${s.id}: ${h} 는 오픈하지 않은 손`);
        for (const [h, f] of fb) {
          if (f >= 1) continue;
          const c = call.get(h) ?? 0;
          if (WHEEL.has(h) ? c !== 0 : Math.abs(c - (1 - f)) > 1e-9) bad.push(`${s.id}: ${h} 4벳 ${f} · 콜 ${c}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  /** continue ÷ 오픈 — 오픈 빈도로 가중(vs 3벳 빈도는 '그 손으로 오픈했을 때' 기준이다) */
  const contPerOpen = (d: 40 | 60, s: RangeScenario) => {
    const open = buildFreq(rfi(d, s.hero).actions[0].spec);
    const cont = contMap(s);
    let num = 0, den = 0;
    for (const [h, o] of open) { const w = comboCount(h) * o; den += w; num += w * (cont.get(h) ?? 0); }
    return num / den;
  };
  const fourbetShare = (d: 40 | 60, s: RangeScenario) => {
    const open = buildFreq(rfi(d, s.hero).actions[0].spec);
    const fb = buildFreq(s.actions.find((a) => a.key === 'fourbet')!.spec);
    const call = buildFreq(s.actions.find((a) => a.key === 'call')!.spec);
    let f = 0, c = 0;
    for (const [h, o] of open) { const w = comboCount(h) * o; f += w * (fb.get(h) ?? 0); c += w * (call.get(h) ?? 0); }
    return f / (f + c);
  };

  it('🔴 [설계 규칙] MDF 밴드 — vs 3벳 continue ÷ 오픈이 얼리(UTG~LJ) [MDF−5, MDF+25] · 레이트(HJ~SB) [MDF−5, MDF+20]', () => {
    // 위치별로 폭을 나눈 근거: 100bb 실측 얼리 37.5·34.2 > 레이트 vs BB 27.4~29.3. 하한 −5 는 순수 블러프 3벳이 바로 이득이 되지 않게 하는 완충.
    const bad: string[] = [];
    for (const d of [40, 60] as const) {
      for (const s of DEPTH_SCENARIOS[d].filter((x) => x.group === 'vs3bet')) {
        const mdf = mdfVsBb3bet(DEPTH_META[d], s.hero === 'SB') * 100;
        const up = EARLY_OPENERS.includes(s.hero) ? 25 : 20;
        const r = contPerOpen(d, s) * 100;
        if (r < mdf - 5 || r > mdf + up) bad.push(`${s.id}: ${r.toFixed(1)} ∉ [${(mdf - 5).toFixed(1)}, ${(mdf + up).toFixed(1)}]`);
      }
    }
    expect(bad).toEqual([]);
  });

  describe('깊이 간', () => {
    it('🔴 [설계 규칙] 얼리 오픈(UTG~LJ)은 25 ≤ 40 ≤ 60 — 리스틸 위험이 크고 앤티는 깊이와 무관하다', () => {
      for (const p of EARLY_OPENERS) {
        const [a, b, c] = RANGE_DEPTHS.map((d) => openPct(d, p));
        expect(a, `${p} 25 ≤ 40`).toBeLessThanOrEqual(b + 1e-9);
        expect(b, `${p} 40 ≤ 60`).toBeLessThanOrEqual(c + 1e-9);
      }
    });

    it('🔴 [설계 규칙] 레이트 오픈(HJ~SB)은 방향을 정하지 않고 인접 깊이 차이 ≤ 6%p', () => {
      for (const p of LATE_OPENERS) {
        const [a, b, c] = RANGE_DEPTHS.map((d) => openPct(d, p));
        expect(Math.abs(a - b), `${p} |25−40|`).toBeLessThanOrEqual(6);
        expect(Math.abs(b - c), `${p} |40−60|`).toBeLessThanOrEqual(6);
      }
    });

    it('🔴 BB 수비 조건부 단조 — 얕은 쪽 오픈이 같거나 넓으면 얕은 쪽 수비도 같거나 넓다, 아니면 차이 ≤ 10%p', () => {
      // 근거: 콜 가격이 얕을수록 싸고(18.2 < 20.3 < 21.3%) 오프너 레인지가 넓을수록 약하다 — 두 힘이 같은 방향일 때만 방향을 잠근다.
      for (const p of NINE) {
        for (let i = 1; i < RANGE_DEPTHS.length; i++) {
          const d = RANGE_DEPTHS[i - 1], e = RANGE_DEPTHS[i];
          const dd = total(defend(d, p)), de = total(defend(e, p));
          if (openPct(d, p) >= openPct(e, p) - 1e-9) expect(dd + 1e-9, `vs ${p} ${d} ≥ ${e}`).toBeGreaterThanOrEqual(de);
          else expect(Math.abs(dd - de), `vs ${p} |${d}−${e}|`).toBeLessThanOrEqual(10);
        }
      }
    });

    it('🔴 [설계 규칙] 같은 오프너 vs BB 3벳의 4벳 비중은 40 ≥ 60 — 콜 뒤 SPR 이 낮고(1.6 < 2.3) 4벳 알파도 낮다(74.9 < 80.7%)', () => {
      for (const p of NINE) {
        const a = fourbetShare(40, find(40, (s) => s.group === 'vs3bet' && s.hero === p));
        const b = fourbetShare(60, find(60, (s) => s.group === 'vs3bet' && s.hero === p));
        expect(a + 1e-9, `${p}`).toBeGreaterThanOrEqual(b);
      }
    });
  });
});

describe('id 의미 · 별칭', () => {
  it('모든 깊이 id 는 base@깊이 · 100bb 와 합쳐 전역 유일 · base 가 100bb 에 있으면 group·hero·vs 가 같다', () => {
    const ids = [...RANGE_SCENARIOS.map((s) => s.id), ...ALL_DEPTH.map(({ s }) => s.id)];
    expect(new Set(ids).size).toBe(ids.length);
    const base100 = new Map(RANGE_SCENARIOS.map((s) => [s.id, s]));
    for (const { d, s } of ALL_DEPTH) {
      expect(s.id.endsWith(`@${d}`), s.id).toBe(true);
      expect(depthId(baseIdOf(s.id), d)).toBe(s.id);
      const b = base100.get(baseIdOf(s.id));
      if (b) expect([s.group, s.hero, s.vs], s.id).toEqual([b.group, b.hero, b.vs]);
    }
    // 100bb 에 같은 이름이 있는 표가 대부분이다(오답 노트·딥링크와 같은 축을 쓴다)
    expect(ALL_DEPTH.filter(({ s }) => base100.has(baseIdOf(s.id))).length).toBeGreaterThan(50);
  });

  it('6인 별칭의 spec 은 같은 깊이 9인 같은 자리 표와 같은 객체다', () => {
    for (const d of RANGE_DEPTHS) for (const s of DEPTH_SCENARIOS[d].filter((x) => x.group === 'rfi6')) {
      expect(s.actions, s.id).toBe(rfi(d, s.hero).actions);
      expect(s.baseTableSize, s.id).toBeUndefined();
    }
  });

  it('9인 전용 표(UTG·UTG+1·MP 관여)는 baseTableSize 9', () => {
    const early = new Set<TablePos>(['UTG', 'UTG+1', 'MP']);
    for (const { s } of ALL_DEPTH) {
      const involved = early.has(s.hero) || (s.vs !== undefined && early.has(s.vs));
      expect(s.baseTableSize, s.id).toBe(involved ? 9 : undefined);
    }
  });
});

// 정직 표기 — 다른 깊이의 스택 토큰 · 100bb 오픈 크기 · 솔버/균형 자칭 금지.
function honestyIssues(d: RangeDepth, s: Pick<RangeScenario, 'hero' | 'vs'>, text: string): string[] {
  const out: string[] = [];
  for (const [, n] of text.matchAll(/(?<![\d.])(25|40|60|100)bb/g)) if (Number(n) !== d) out.push(`${n}bb`);
  const sbOk = DEPTH_META[d].sbOpenBb === 2.5 && (s.hero === 'SB' || s.vs === 'SB');
  if (!sbOk && /(?<![\d.])2\.5bb/.test(text)) out.push('2.5bb');
  const word = text.match(/솔버|GTO|Nash|내쉬|균형/i);
  if (word) out.push(word[0]);
  return out;
}

describe('정직 표기', () => {
  it('깊이 표의 label·desc·note 에 다른 깊이 스택·2.5bb(SB 표 제외)·솔버/균형 자칭이 없다', () => {
    const bad: string[] = [];
    for (const { d, s } of ALL_DEPTH) {
      const issues = honestyIssues(d, s, `${s.label} ${s.desc} ${s.note ?? ''}`);
      if (issues.length) bad.push(`${s.id}: ${issues.join(', ')}`);
    }
    expect(bad).toEqual([]);
  });

  it('검사기 양성·음성 대조 — 크기 문구는 거짓 빨강이 없고, 100bb 문장은 잡힌다', () => {
    const btn = { hero: 'BTN' as TablePos, vs: undefined };
    expect(honestyIssues(40, btn, '2.2bb 오픈 · 3벳 9bb · 유효 40bb')).toEqual([]);
    expect(honestyIssues(60, { hero: 'BB', vs: 'CO' }, 'BB 3벳 10bb')).toEqual([]);
    expect(honestyIssues(25, { hero: 'SB', vs: undefined }, 'SB 2.5bb 오픈')).toEqual([]);
    expect(honestyIssues(40, btn, '버튼이 2.5bb 오픈 · 100bb 기준')).toEqual(['100bb', '2.5bb']);
    expect(honestyIssues(60, { hero: 'SB', vs: undefined }, 'SB 2.5bb 오픈')).toEqual(['2.5bb']);
    expect(honestyIssues(25, btn, '내쉬 균형 표')).toEqual(['내쉬']);
  });
});

describe('격리 — 깊이 표는 레인지 차트 화면만 읽는다', () => {
  it('데이터 파일의 import 는 전부 type 전용이다(node 로 바로 읽을 수 있게)', () => {
    const src = readFileSync(join(ROOT, 'src/lib/ranges.depth.data.ts'), 'utf-8');
    const imports = src.split(/\r?\n/).filter((l) => /^\s*import\b/.test(l));
    expect(imports.length).toBeGreaterThan(0);
    for (const l of imports) expect(l, l).toMatch(/^import type /);
  });

  it('src 의 비테스트 파일 중 ranges.depth* 를 import 하는 곳은 RangeGuide.tsx 하나뿐이다', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f) && !/\.test\./.test(f) && !/ranges\.depth\./.test(f)) {
          if (/from ['"][^'"]*ranges\.depth[^'"]*['"]/.test(readFileSync(p, 'utf-8'))) hits.push(relative(ROOT, p).replace(/\\/g, '/'));
        }
      }
    };
    walk(join(ROOT, 'src'));
    expect(hits).toEqual(['src/components/features/tools/RangeGuide.tsx']);
  });
});

describe('carryScenario — 깊이를 바꿔도 같은 자리', () => {
  const by = (id: string) => [...RANGE_SCENARIOS, ...ALL_DEPTH.map(({ s }) => s)].find((s) => s.id === id)!;
  it('같은 (그룹·내 자리·상대) → 같은 (그룹·내 자리) 첫 상대 → 그룹 첫 표 → 9인 오픈 첫 표', () => {
    expect(carryScenario(DEPTH_SCENARIOS[40], by('bb_vs_btn')).id).toBe('bb_vs_btn@40');
    expect(carryScenario(DEPTH_SCENARIOS[25], by('rfi_co9')).id).toBe('rfi_co9@25');
    expect(carryScenario(DEPTH_SCENARIOS[40], by('utg_vs_3bet')).id).toBe('utg_vs_bb3bet@40');
    expect(carryScenario(DEPTH_SCENARIOS[25], by('sb_vs_btn')).id).toBe('bb_vs_utg@25');
    expect(carryScenario(DEPTH_SCENARIOS[25], by('btn_vs_bb3bet@40')).id).toBe('rfi_utg9@25');
    expect(carryScenario(RANGE_SCENARIOS, by('hj_vs_bb3bet@60')).id).toBe('hj_vs_bb3bet');
    expect(carryScenario(RANGE_SCENARIOS, by('rfi_btn@25')).id).toBe('rfi_btn');
  });
  it('결과는 항상 대상 목록의 원소다', () => {
    const lists = [RANGE_SCENARIOS, ...RANGE_DEPTHS.map((d) => DEPTH_SCENARIOS[d])];
    for (const from of lists) for (const to of lists) for (const s of from) expect(to).toContain(carryScenario(to, s));
  });
});

describe('100bb 보존 · 폭 스냅숏', () => {
  it('100bb 표(63개)의 id·액션·spec 이 바뀌지 않았다 — 지문 대조', () => {
    expect(RANGE_SCENARIOS.length).toBe(63);
    const fp = createHash('sha256').update(JSON.stringify(RANGE_SCENARIOS.map((s) => [s.id, s.group, s.hero, s.vs, s.actions]))).digest('hex');
    expect(fp).toBe(FP_100BB);
  });

  it('하단 고지 둘째 줄이 깊이마다 있다(빠진 표를 밝힌다)', () => {
    for (const d of [...RANGE_DEPTHS, 100 as const]) expect(DEPTH_GAP_NOTE[d].length).toBeGreaterThan(10);
    expect(DEPTH_GAP_NOTE[25]).toContain('단순화');
  });

  it('깊이 표 폭(콤보 %, 액션 순) 스냅숏 — 데이터를 고치면 여기서 보인다', () => {
    const got: Record<string, number[]> = {};
    for (const { s } of ALL_DEPTH) if (s.group !== 'rfi6') got[s.id] = s.actions.map((a) => Number(pct(a.spec).toFixed(1)));
    expect(got).toEqual(WIDTHS);
  });
});

const FP_100BB = '55cc6d12137bfea2356ca9fa569495a3d7bdb9bd119183be3280ff4a85bf646e';
const WIDTHS: Record<string, number[]> = {
  'rfi_utg9@25': [13.6], 'rfi_utg1@25': [14.7], 'rfi_mp9@25': [16.6], 'rfi_lj9@25': [19.2], 'rfi_hj9@25': [22.9], 'rfi_co9@25': [31.4], 'rfi_btn9@25': [48.5], 'rfi_sb9@25': [41.2],
  'bb_vs_utg@25': [3.8,  25.9], 'bb_vs_utg1@25': [4.2,  25.5], 'bb_vs_mp@25': [5.1,  29.9], 'bb_vs_lj@25': [6,  29], 'bb_vs_hj@25': [7.4,  31.8], 'bb_vs_co@25': [10.1,  38.6], 'bb_vs_btn@25': [13.3,  44.3], 'bb_vs_sb@25': [16.3,  41.3],
  'rfi_utg9@40': [14.7], 'rfi_utg1@40': [15.8], 'rfi_mp9@40': [18.1], 'rfi_lj9@40': [20], 'rfi_hj9@40': [24.1], 'rfi_co9@40': [32.7], 'rfi_btn9@40': [48.5], 'rfi_sb9@40': [42.5],
  'bb_vs_utg@40': [3.2,  22.2], 'bb_vs_utg1@40': [3.9,  25.8], 'bb_vs_mp@40': [4.6,  25.1], 'bb_vs_lj@40': [4.9,  30.1], 'bb_vs_hj@40': [5.6,  33.6], 'bb_vs_co@40': [8,  35.4], 'bb_vs_btn@40': [10.5,  42.9], 'bb_vs_sb@40': [13,  40.3],
  'utg_vs_bb3bet@40': [1.7,  3.4], 'utg1_vs_bb3bet@40': [1.9,  3.8], 'mp_vs_bb3bet@40': [1.9,  4.4], 'lj_vs_bb3bet@40': [2.3,  4.5], 'hj_vs_bb3bet@40': [2.8,  5.1], 'co_vs_bb3bet@40': [3.5,  9.8], 'btn_vs_bb3bet@40': [3.5,  14], 'sb_vs_bb3bet@40': [3.5,  14],
  'rfi_utg9@60': [15.8], 'rfi_utg1@60': [18.1], 'rfi_mp9@60': [18.9], 'rfi_lj9@60': [22.2], 'rfi_hj9@60': [26.3], 'rfi_co9@60': [32.7], 'rfi_btn9@60': [48.5], 'rfi_sb9@60': [45],
  'bb_vs_utg@60': [3.2,  18.8], 'bb_vs_utg1@60': [3.9,  21.6], 'bb_vs_mp@60': [4.6,  25.1], 'bb_vs_lj@60': [4.9,  24.8], 'bb_vs_hj@60': [5.6,  28.4], 'bb_vs_co@60': [8,  31.2], 'bb_vs_btn@60': [10.5,  34], 'bb_vs_sb@60': [13,  35.7],
  'utg_vs_bb3bet@60': [1.7,  4.6], 'utg1_vs_bb3bet@60': [1.7,  5.2], 'mp_vs_bb3bet@60': [2,  5.3], 'lj_vs_bb3bet@60': [2,  6.3], 'hj_vs_bb3bet@60': [2.2,  7.5], 'co_vs_bb3bet@60': [2.2,  11.2], 'btn_vs_bb3bet@60': [2.2,  17.1], 'sb_vs_bb3bet@60': [2.2,  17.9],
};
