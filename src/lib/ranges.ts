// 레인지 코어 — 표기 파서·콤보 가중·169 그리드 공용 유틸.
// 표기 문법(업계 표준): "22+" "77-22" "A2s+" "A5s-A2s" "ATo+" "54s" (공백/쉼표 구분)
// 빈도 혼합은 { 1: '...', 0.5: '...', 0.25: '...' } 스펙으로 — GTO 혼합전략(셀 분할 렌더)의 데이터 형식.

export const R_CH = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
export const R_VAL: Record<string, number> = Object.fromEntries(R_CH.map((c, i) => [c, i]));

/** 캐노니컬 핸드 이름 (hi>=lo, 랭크 인덱스 0=2..12=A) */
export function handName(hi: number, lo: number, suited: boolean): string {
  if (hi === lo) return R_CH[hi] + R_CH[lo];
  return R_CH[hi] + R_CH[lo] + (suited ? 's' : 'o');
}

/** 핸드별 콤보 수 — 페어 6 / 수딧 4 / 오프수트 12 (총 1326) */
export function comboCount(name: string): number {
  if (name.length === 2) return 6;
  return name.endsWith('s') ? 4 : 12;
}

export type FreqMap = Map<string, number>; // 핸드 이름 → 빈도 0..1

/** 단일 레인지 문자열 파싱 → 이름 목록. 잘못된 토큰은 개발 중 잡히도록 throw. */
export function expandRange(str: string): string[] {
  const out: string[] = [];
  for (const raw of str.split(/[\s,]+/)) {
    const tok = raw.trim();
    if (!tok) continue;
    const m = tok.match(/^([2-9TJQKA])([2-9TJQKA])([so]?)(\+?)(?:-([2-9TJQKA])([2-9TJQKA])([so]?))?$/);
    if (!m) throw new Error(`range token: ${tok}`);
    const [, a, b, su, plus, a2, b2] = m;
    const hi = Math.max(R_VAL[a], R_VAL[b]), lo = Math.min(R_VAL[a], R_VAL[b]);
    const pair = hi === lo;
    if (a2) {
      // 스팬: 페어 "77-22", 동일 하이카드 "A5s-A2s"
      const hi2 = Math.max(R_VAL[a2], R_VAL[b2]), lo2 = Math.min(R_VAL[a2], R_VAL[b2]);
      if (pair) { for (let r = Math.min(hi, hi2); r <= Math.max(hi, hi2); r++) out.push(handName(r, r, false)); }
      else {
        if (hi !== hi2) throw new Error(`span hi mismatch: ${tok}`);
        for (let l = Math.min(lo, lo2); l <= Math.max(lo, lo2); l++) out.push(handName(hi, l, su === 's'));
      }
    } else if (plus) {
      if (pair) { for (let r = hi; r <= 12; r++) out.push(handName(r, r, false)); }
      else { for (let l = lo; l < hi; l++) out.push(handName(hi, l, su === 's')); } // 키커 상승 (A2s+ → A2s..AKs)
    } else {
      out.push(pair ? handName(hi, hi, false) : handName(hi, lo, su === 's'));
    }
  }
  return out;
}

/** 빈도 스펙 → FreqMap. 뒤에 오는 그룹이 앞을 덮지 않도록 첫 지정 우선. */
export type RangeSpec = Partial<Record<'1' | '0.75' | '0.5' | '0.25', string>>;
export function buildFreq(spec: RangeSpec): FreqMap {
  const m: FreqMap = new Map();
  for (const [f, str] of Object.entries(spec)) {
    if (!str) continue;
    const freq = Number(f);
    for (const n of expandRange(str)) if (!m.has(n)) m.set(n, freq);
  }
  return m;
}

/** 콤보 가중 레인지 크기(%) — 1326 기준. 셀 수 %가 아니라 실제 VPIP 감각과 일치. */
export function rangeComboPct(m: FreqMap): number {
  let s = 0;
  for (const [n, f] of m) s += f * comboCount(n);
  return (100 * s) / 1326;
}
export function rangeComboCount(m: FreqMap): number {
  let s = 0;
  for (const [n, f] of m) s += f * comboCount(n);
  return s;
}

/** Float32Array(169, HAND_ORDER 순) → FreqMap (nash.data 소비용) */
export function freqFromArray(arr: ArrayLike<number>, order: string[]): FreqMap {
  const m: FreqMap = new Map();
  for (let i = 0; i < order.length; i++) if (arr[i] > 0.001) m.set(order[i], Math.round(arr[i] * 100) / 100);
  return m;
}

/** 13×13 그리드 렌더 순서 — 행/열 A..2, i<j 수딧 / i>j 오프수트 / 대각 페어 (업계 표준 배치) */
export const GRID_RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const;
export function gridName(i: number, j: number): string {
  const a = GRID_RANKS[i], b = GRID_RANKS[j];
  if (i === j) return a + b;
  return i < j ? a + b + 's' : b + a + 'o';
}
