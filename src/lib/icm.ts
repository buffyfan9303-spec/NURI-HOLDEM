// src/lib/icm.ts
// 토너먼트 ICM 단일 소스 — Malmuth-Harville 순위 확률 + 콜 압박(리스크 프리미엄).
//
// 왜 lib 로 뺐나: icmEquity 가 features/ICMCalculator.tsx 와 features/tools/DealCalc.tsx 에
// 두 벌로 복제돼 있었다(DealCalc 주석에 "그 파일이 export 하지 않아 로컬로 재구현했다"고 명시).
// 한쪽만 고치면 두 화면의 숫자가 갈린다 — 계산은 여기 하나만 두고 두 화면이 import 한다.
// 이관은 '동작 동일'이 조건이라 알고리즘 본문은 연산 순서까지 원본 그대로다(부동소수 결과 동일).
//
// 수학 출처: Malmuth-Harville 순위 확률 모델과 리스크 프리미엄은 공개 문헌의 표준 수식이다.
// ⚠ 학습·판단 보조 도구다. 기대수익·환전 프레이밍 금지 — 지분·압박·필요 승률 어휘만 쓴다(§28).

/** 계산량(2^n 서브게임) 상한 — 10명이면 1,024 상태. */
export const ICM_MAX_PLAYERS = 10;

/**
 * ICM(Independent Chip Model) — Malmuth-Harville 모델.
 * 각 플레이어의 칩 스택과 상금 구조를 받아 자리별 확률로 가중한 상금 지분을 돌려준다.
 * 서브게임을 '남은 플레이어 비트마스크'로 메모이제이션 — 자리(상금 인덱스)는
 * n − popcount(mask) 로 유일하게 정해지므로 키는 mask 하나면 충분하다.
 * (10명 기준 2^10=1,024 상태 — 순열 N! 재계산 대비 키 입력마다 3.6M 경로를 해소.)
 */
export function icmEquity(stacks: number[], prizes: number[]): number[] {
  const n = stacks.length;
  const result = new Array<number>(n).fill(0);
  if (prizes.length === 0 || n === 0) return result;
  if (stacks.reduce((a, b) => a + b, 0) <= 0) return result;

  const memo = new Map<number, Float64Array>();
  const solve = (mask: number): Float64Array => {
    const cached = memo.get(mask);
    if (cached) return cached;
    const res = new Float64Array(n);
    // 남은 플레이어 인덱스·스택 합, 이번 자리(상금 인덱스) 산출
    const idx: number[] = [];
    let sum = 0;
    for (let k = 0; k < n; k++) if (mask & (1 << k)) { idx.push(k); sum += stacks[k]; }
    const prize = prizes[n - idx.length] ?? 0;
    // 1명만 남으면 다음 상금 차지
    if (idx.length === 1) { res[idx[0]] = prize; memo.set(mask, res); return res; }
    if (sum <= 0) { memo.set(mask, res); return res; }
    for (const i of idx) {
      const pFirst = stacks[i] / sum;
      if (pFirst <= 0) continue;
      res[i] += pFirst * prize;
      // i 가 이번 자리로 빠진 뒤 나머지가 남은 상금을 두고 경쟁
      const sub = solve(mask & ~(1 << i));
      for (const k of idx) if (k !== i) res[k] += pFirst * sub[k];
    }
    memo.set(mask, res);
    return res;
  };

  const full = solve((1 << n) - 1);
  for (let i = 0; i < n; i++) result[i] = full[i];
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 콜 압박 (버블·파이널 테이블) — 리스크 프리미엄
//
// 상황: 상대가 올인했다. 내가 콜하려면 칩 기준 승률이 몇 %면 충분한가?
// 칩만 보면 팟 오즈(c / (2c + 팟))면 되지만, 토너먼트는 탈락하면 상금 지분이 0 이 된다.
// 그래서 '잃는 칩의 지분 손실'이 '따는 칩의 지분 이득'보다 크고, 필요 승률이 올라간다.
// 그 차이가 리스크 프리미엄이고, 배수로 본 것이 버블 팩터다.
//
// 칩 보존 회계(팟 = 이미 깔린 데드머니, 상대는 자기 스택 전부를 올인):
//   폴드 : 나 h            / 상대 v + 팟
//   콜·승 : 나 h + c + 팟   / 상대 v − c
//   콜·패 : 나 h − c        / 상대 v + c + 팟      (c = min(h, v))
// 필요 승률 p* 는 p·E(승) + (1−p)·E(패) = E(폴드) 의 해다.
// ─────────────────────────────────────────────────────────────────────────────

export interface PressureInput {
  /** 남은 전원의 스택(칩 또는 bb). 전원 > 0 이어야 한다 — 0 칩이면 이미 그 핸드에 없다. */
  stacks: number[];
  /** 상금 구조(1위부터). 상위 stacks.length 개만 배분된다. */
  prizes: number[];
  /** 내 자리 */
  heroIndex: number;
  /** 올인한 상대 자리 */
  villainIndex: number;
  /** 이미 깔린 팟(블라인드 + 앤티 등 데드머니). 상대 올인액은 상대 스택이므로 여기 넣지 않는다. */
  pot: number;
}

export type PressureError = 'players' | 'seat' | 'stacks' | 'prizes';

export interface PressureResult {
  ok: boolean;
  reason?: PressureError;
  /** 콜에 넣어야 하는 칩 = min(내 스택, 상대 스택) */
  callAmount: number;
  /** 콜이 이기면 가져오는 칩 = callAmount + 팟 */
  winAmount: number;
  /** 폴드/승/패 각각의 내 상금 지분 */
  eqFold: number;
  eqWin: number;
  eqLose: number;
  /** 지금 배분되는 상금 총액(지분 % 분모) */
  awarded: number;
  /** ICM 기준 필요 승률 0..1 — 이 화면의 결론 숫자 */
  reqIcm: number;
  /** 칩만 볼 때의 필요 승률 0..1 (= 팟 오즈) */
  reqChip: number;
  /** 리스크 프리미엄 = reqIcm − reqChip (0..1, 퍼센트포인트로 표시) */
  riskPremium: number;
  /** 버블 팩터 = (칩 1개당 지분 손실) / (칩 1개당 지분 이득). 캐시게임이면 정확히 1. */
  bubbleFactor: number;
}

const FAIL = (reason: PressureError): PressureResult => ({
  ok: false, reason, callAmount: 0, winAmount: 0,
  eqFold: 0, eqWin: 0, eqLose: 0, awarded: 0,
  reqIcm: 0, reqChip: 0, riskPremium: 0, bubbleFactor: 1,
});

/** 버블 팩터 상한 — 지분 이득이 0 에 수렴하는 극단(상금 자리가 이미 확정된 구조)에서 ∞ 를 막는다. */
export const MAX_BUBBLE_FACTOR = 99;

export function callPressure(input: PressureInput): PressureResult {
  const { stacks, prizes, heroIndex: h, villainIndex: v } = input;
  const n = stacks.length;
  if (n < 2 || n > ICM_MAX_PLAYERS) return FAIL('players');
  if (h === v || h < 0 || v < 0 || h >= n || v >= n) return FAIL('seat');
  if (!stacks.every((s) => Number.isFinite(s) && s > 0)) return FAIL('stacks');

  const p = prizes.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  if (p.length === 0 || p.reduce((a, b) => a + b, 0) <= 0) return FAIL('prizes');

  const pot = Number.isFinite(input.pot) && input.pot > 0 ? input.pot : 0;
  const call = Math.min(stacks[h], stacks[v]);
  const win = call + pot;

  const foldS = stacks.slice(); foldS[v] = stacks[v] + pot;
  const winS = stacks.slice(); winS[h] = stacks[h] + win; winS[v] = stacks[v] - call;
  const loseS = stacks.slice(); loseS[h] = stacks[h] - call; loseS[v] = stacks[v] + win;

  const eqFold = icmEquity(foldS, p)[h];
  const eqWin = icmEquity(winS, p)[h];
  const eqLose = icmEquity(loseS, p)[h];
  const awarded = p.slice(0, n).reduce((a, b) => a + b, 0);

  // 리스크(잃을 지분) / 리워드(딸 지분)
  const risk = eqFold - eqLose;
  const reward = eqWin - eqFold;
  const denom = risk + reward;
  const reqIcm = denom > 0 ? Math.min(1, Math.max(0, risk / denom)) : 1;
  const reqChip = win + call > 0 ? call / (call + win) : 0;

  // 칩 1개당으로 정규화해야 캐시게임(= 지분이 칩에 선형)에서 정확히 1 이 된다.
  const riskPerChip = call > 0 ? risk / call : 0;
  const rewardPerChip = win > 0 ? reward / win : 0;
  const bubbleFactor = rewardPerChip > 0
    ? Math.min(MAX_BUBBLE_FACTOR, riskPerChip / rewardPerChip)
    : MAX_BUBBLE_FACTOR;

  return {
    ok: true, callAmount: call, winAmount: win,
    eqFold, eqWin, eqLose, awarded,
    reqIcm, reqChip, riskPremium: reqIcm - reqChip, bubbleFactor,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 판정 예시 — "필요 승률 X%면 어느 핸드까지 콜인가"
//
// 상대 올인 레인지 3종에 대해 대표 핸드 14개의 프리플랍 승률을 미리 계산해 상수로 굳혔다.
// 계산은 앱 자체 엔진(gto/equityEngine computeEquityVsRange)으로 콤보 6만 회 몬테카를로,
// 소수 첫째 자리 반올림(표본오차 ±0.2%p). 런타임엔 상수 조회만 남아 입력마다 재계산이 없다.
// 대표 콤보는 오프수트 s/h · 수딧 s/s · 페어 s/h 기준이라 블로커 차이는 무시할 수준이다.
// ⚠ 참고용 기준선이다 — 상대 레인지 추정이 틀리면 이 줄도 틀린다.
// ─────────────────────────────────────────────────────────────────────────────

export type ShoveRangeId = 'tight' | 'mid' | 'wide';

export const SHOVE_RANGES: { id: ShoveRangeId; label: string; pct: number; notation: string }[] = [
  { id: 'tight', label: '타이트', pct: 10, notation: '66+, A9s+, KJs+, QJs, AJo+, KQo' },
  { id: 'mid', label: '보통', pct: 24, notation: '22+, A2s+, K8s+, Q9s+, J9s+, T9s, 98s, A8o+, KTo+, QTo+, JTo' },
  { id: 'wide', label: '루즈', pct: 39, notation: '22+, A2s+, K4s+, Q7s+, J7s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, A2o+, K8o+, Q9o+, J9o+, T9o' },
];

/** 강한 순 정렬(에퀴티 내림차순은 레인지마다 조금씩 달라 표시 순서는 고정한다) */
export const BENCH_HANDS = ['AA', 'QQ', 'JJ', 'TT', 'AKo', '99', 'AQo', '88', 'AJo', '77', '55', 'A5s', 'KQo', '22'] as const;
export type BenchHand = (typeof BENCH_HANDS)[number];

/** BENCH_HANDS 순서와 1:1 대응하는 승률(%) */
const BENCH_EQUITY: Record<ShoveRangeId, readonly number[]> = {
  //       AA    QQ    JJ    TT   AKo    99   AQo    88   AJo    77    55   A5s   KQo    22
  tight: [84.3, 65.5, 58.7, 54.1, 55.7, 50.0, 49.3, 46.8, 42.3, 43.5, 39.3, 37.9, 38.1, 37.7],
  mid: [84.4, 71.8, 67.2, 62.3, 61.2, 57.7, 58.1, 54.1, 55.4, 52.7, 48.8, 46.0, 48.2, 43.0],
  wide: [84.7, 73.2, 69.5, 67.0, 63.6, 62.3, 61.5, 59.2, 59.6, 56.7, 51.8, 50.5, 51.9, 45.9],
};

export interface LadderEntry { hand: BenchHand; eq: number; call: boolean }

/** 필요 승률(0..1) 기준으로 대표 핸드 콜/폴드 판정 — 승률 높은 순 */
export function handLadder(reqIcm: number, rangeId: ShoveRangeId): LadderEntry[] {
  const table = BENCH_EQUITY[rangeId];
  return BENCH_HANDS
    .map((hand, i) => ({ hand, eq: table[i], call: table[i] / 100 >= reqIcm }))
    .sort((a, b) => b.eq - a.eq);
}

/** 한 줄 결론 — "AQo까지 콜 · AJo부터 폴드" */
export function verdictLine(reqIcm: number, rangeId: ShoveRangeId): string {
  const ladder = handLadder(reqIcm, rangeId);
  const calls = ladder.filter((e) => e.call);
  const folds = ladder.filter((e) => !e.call);
  if (calls.length === 0) return `${ladder[0].hand}조차 승률이 모자란다. 이 자리는 전부 폴드`;
  if (folds.length === 0) return `${ladder[ladder.length - 1].hand}까지 전부 콜 · 압박이 거의 없는 자리`;
  return `${calls[calls.length - 1].hand}까지 콜 · ${folds[0].hand}부터 폴드`;
}
