// 첫 진입 올인 Nash — fictitious play(평균 전략 수렴) · 단일 콜러 근사 · BB앤티(1bb) 옵션.
// nash.data.ts 머리말 조리법을 그대로 따른다. 새 모델을 발명하지 않는다 — 정상 구간(7~20bb 셔브 등)을
// 같은 모델이 되살려 내는지가 통과 기준이다(compare.mjs).
//
// 모델
//  · 히어로가 스택 S(bb) 를 올인. 뒤에 k 명(k=1: BB 뿐 · k≥2: 비블라인드 k-2 명 → SB → BB 순).
//  · 각 상대는 자기 콜 레인지 C_m 으로 콜/폴드. **첫 콜러가 히어로와 헤즈업**(단일 콜러) — 뒤는 접는다.
//  · 돈: SB 0.5 · BB 1 · 앤티 A(BB 가 1bb, 옵션). 낸 돈은 매몰 — 폴드는 0, 콜/올인은 추가 투입 대비 순변화.
//  · 카드 제거: 캐노니컬 핸드 x 가 h 옆에서 남는 콤보 수 N[h][x] 로 가중(합 1225 = C(50,2)).
//  · 에퀴티: 169×169 행렬 E[i][j] = i 가 j 를 이길 확률(무승부 절반). equity169.mjs 산출.
// 실행: node solve.mjs <equity.json> <out.json> [iters=4000]
import { readFileSync, writeFileSync } from 'node:fs';

const R = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const STACKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20];
export const KS = [1, 2, 3, 4, 5, 6, 7, 8];

import { isMainThread } from 'node:worker_threads';
const eqFile = isMainThread ? process.argv[2] : undefined; const outFile = isMainThread ? process.argv[3] : undefined; const ITERS = Number(process.argv[4] ?? 4000);
const n = 169;
let EQ; let ORDER; let E;   // E[i*169+j]
let N; const TOTAL = 1225;  // Σ_x N[h][x] = C(50,2)

// ── 콤보 수 행렬 N[h][x]: h 의 구체 콤보 하나가 주어졌을 때 x 의 합법 콤보 수(h 콤보 평균) ──
function combosOf(name) {
  const a = R.indexOf(name[0]); const b = R.indexOf(name[1]); const out = [];
  if (a === b) { for (let s = 0; s < 4; s++) for (let t = s + 1; t < 4; t++) out.push([a * 4 + s, a * 4 + t]); }
  else if (name[2] === 's') { for (let s = 0; s < 4; s++) out.push([a * 4 + s, b * 4 + s]); }
  else { for (let s = 0; s < 4; s++) for (let t = 0; t < 4; t++) if (s !== t) out.push([a * 4 + s, b * 4 + t]); }
  return out;
}
/** 에퀴티 행렬을 읽고 콤보 수 행렬을 준비한다 — 워커(argv 없음)는 이 함수를 직접 부른다. */
export function init(file) {
  EQ = JSON.parse(readFileSync(file, 'utf-8'));
  ORDER = EQ.order; E = EQ.matrix;
  const COMBOS = ORDER.map(combosOf);
  N = new Float64Array(n * n);
  for (let h = 0; h < n; h++) {
    const H = COMBOS[h];
    for (let x = 0; x < n; x++) {
      let cnt = 0;
      for (const a of H) for (const b of COMBOS[x]) if (!(a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1])) cnt++;
      N[h * n + x] = cnt / H.length;
    }
  }
  return { order: ORDER, iterations: EQ.iterations };
}
if (eqFile) init(eqFile);

/**
 * (k, S, ante) 한 조합을 푼다. 돌려주는 것: shove[169], callers[m][169] (m=0..k-1, 마지막이 BB · 그 앞이 SB).
 * FP: 매 반복 t 에 상대들의 **평균 전략**에 대한 최선 응답을 구하고 평균에 1/t 로 섞는다.
 */
export function solve(k, S, ante, iters = ITERS) {
  // 실험 손잡이(옛 생성기의 가정을 되짚는 용도) — 기본값이 조리법이다: BB 앤티 총 1bb · k=1 은 SB 가 히어로(0.5 는 매몰)
  const A = ante ? Number(process.env.ANTE_TOTAL ?? 1) : 0;
  const k1Dead = process.env.K1_MODEL === 'dead';         // k=1 을 '비블라인드 히어로 + SB 는 데드머니' 로 보는 변형
  const heroIsSB = k === 1 && !k1Dead;
  const heroCost = heroIsSB ? S - 0.5 : S;               // 히어로가 추가로 거는 돈
  // 전원 폴드 시 히어로 순이익 — k=1 도 **매몰 기준**이다: SB 의 0.5 는 히어로 자신이 되찾는다.
  //   콜 가지가 `E·pot − heroCost`(k=1 은 heroCost = S − 0.5)로 이미 포스팅 후 기준인데 여기만 포스팅 전
  //   기준(`1 + A`)을 쓰면 셔브 EV 가 0.5·pFold 만큼 깎여 k=1 열이 4~13%p 좁아진다. S=1 검산: 폴드 0.5 vs 셔브 승 2.0 = +1.5.
  //   2026-09-19 nash-review·gto-fix 교차 검증.
  const deadIfAllFold = 1.5 + A;
  // 콜러 m 의 역할과 돈
  const roles = [];                                       // 'other' | 'SB' | 'BB'
  for (let m = 0; m < k; m++) roles.push(k === 1 ? 'BB' : m === k - 1 ? 'BB' : m === k - 2 ? 'SB' : 'other');
  // 🔴 **미해결 — 빅앤티 표 전체에 걸린다(2026-09-19). 판정 못 했다.**
  //   아래 두 줄에서 `potWith('BB')` 는 앤티 A 를 팟에 넣는데 `callCost('BB')` 는 BB 스택에서 A 를 빼지 않는다.
  //   `S` 가 **앤티 낸 뒤 남은 스택**이면 자기정합적이고, **핸드 시작(포스팅 전) 스택**이면 BB 콜 EV 를
  //   (1−E) 만큼 과소평가한다 → 손익분기가 ~2.3%p 빡빡해지고(12bb k≥2 43.1% vs 40.8%)
  //   **셔브 넓게 · BB 콜 좁게** 치우친다 — 격리 근거로 지목한 바로 그 해로운 방향이다.
  //   `S` 의 정의가 코드에도 README 에도 **어디에도 적혀 있지 않아** 어느 쪽인지 정하지 못했다.
  //   ⚠ 공표 HU Nash 대조로는 못 푼다 — 그건 A=0 구간이라 이 항을 아예 안 건드린다. 다음 사람은 여기서 시작해라.
  const potWith = (role) => (role === 'BB' ? 2 * S + (heroIsSB ? 0 : 0.5) + A : role === 'SB' ? 2 * S + 1 + A : 2 * S + 1.5 + A);
  const callCost = (role) => (role === 'BB' ? S - 1 : role === 'SB' ? S - 0.5 : S);

  let shoveAvg = new Float64Array(n).fill(1);            // 시작: 전부 올인
  const callAvg = roles.map(() => new Float64Array(n));  // 시작: 전부 폴드
  const shoveBR = new Float64Array(n); const callBR = roles.map(() => new Float64Array(n));

  for (let t = 1; t <= iters; t++) {
    // ── 히어로 최선 응답 vs 콜러 평균 전략 ──
    for (let h = 0; h < n; h++) {
      let ev = 0; let pFold = 1;
      for (let m = 0; m < k; m++) {
        const C = callAvg[m]; const role = roles[m]; const pot = potWith(role);
        let pc = 0; let gain = 0;
        for (let x = 0; x < n; x++) {
          const w = N[h * n + x] / TOTAL * C[x];
          if (w <= 0) continue;
          pc += w;
          gain += w * (E[h * n + x] * pot - heroCost);
        }
        ev += pFold * gain;
        pFold *= (1 - pc);
      }
      ev += pFold * deadIfAllFold;
      shoveBR[h] = ev > 0 ? 1 : 0;
    }
    // ── 각 콜러 최선 응답 vs 히어로 평균 셔브 레인지(앞선 콜러들의 폴드는 근사로 무시) ──
    for (let m = 0; m < k; m++) {
      const role = roles[m]; const pot = potWith(role); const cost = callCost(role);
      for (let y = 0; y < n; y++) {
        let num = 0; let den = 0;
        for (let x = 0; x < n; x++) {
          const w = N[y * n + x] * shoveAvg[x];
          if (w <= 0) continue;
          den += w; num += w * (E[y * n + x] * pot - cost);
        }
        callBR[m][y] = den > 0 && num / den > 0 ? 1 : 0;
      }
    }
    // ── 평균 갱신 ──
    const a = 1 / t;
    for (let h = 0; h < n; h++) shoveAvg[h] += a * (shoveBR[h] - shoveAvg[h]);
    for (let m = 0; m < k; m++) for (let y = 0; y < n; y++) callAvg[m][y] += a * (callBR[m][y] - callAvg[m][y]);
  }
  return { shove: shoveAvg, callBB: callAvg[k - 1], callSB: k >= 2 ? callAvg[k - 2] : null };
}

export const q8 = (f) => Math.max(0, Math.min(8, Math.round(f * 8)));
export const encode = (arr) => Array.from(arr).map((f) => String(q8(f))).join('');

if (outFile) {
  const t0 = Date.now();
  const tables = { shove: { no: {}, ante: {} }, callBB: { no: {}, ante: {} }, callSB: { no: {}, ante: {} } };
  const raw = {};
  for (const ante of [false, true]) for (const k of KS) for (const S of STACKS) {
    const r = solve(k, S, ante);
    const key = ante ? 'ante' : 'no';
    (tables.shove[key][k] ??= {})[S] = encode(r.shove);
    (tables.callBB[key][k] ??= {})[S] = encode(r.callBB);
    if (r.callSB) (tables.callSB[key][k] ??= {})[S] = encode(r.callSB);
    raw[`shove|${key}|${k}|${S}`] = Array.from(r.shove);
    raw[`callBB|${key}|${k}|${S}`] = Array.from(r.callBB);
    if (r.callSB) raw[`callSB|${key}|${k}|${S}`] = Array.from(r.callSB);
  }
  writeFileSync(outFile, JSON.stringify({ iters: ITERS, equityIterations: EQ.iterations, order: ORDER, tables, raw }));
  console.log(`solved ${Object.keys(raw).length} tables in ${Math.round((Date.now() - t0) / 1000)}s (FP ${ITERS} iters) → ${outFile}`);
}
