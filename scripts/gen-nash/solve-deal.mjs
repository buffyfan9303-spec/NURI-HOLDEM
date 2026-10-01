// 다인(뒤 k명, k=1..8) 첫 진입 올인 푸시/폴드 균형 — **딜 표본 위의 전체 게임**. 2026-10-01 gto-team (감사 N7).
//
// 왜: solve-multi.mjs(2026-09-21)는 콜러를 둘까지만 보고(세 번째 이후는 접는다고 가정) 3인 에퀴티를 2인 곱 정규화로
//     근사했다. 2~5bb · 뒤 3명+ 에서 공개 9인 Nash 표보다 3~58%p 좁게 나왔다(gto-calc-audit-1001 N7).
//     이 생성기는 **절단도 에퀴티 근사도 없다** — 실제 카드를 돌린 딜 표본에서 k+1 명의 7장 패를 직접 비교한다.
//
// 게임(solve3.mjs · hu-exact.mjs 와 같은 돈 규칙): 모든 선수 스택 S = 앤티 낸 뒤 남은 스택. SB 0.5 · BB 1 · BB 앤티 A(데드).
//   히어로(자리 0) 올인 또는 폴드(0). 뒤 선수 1..k 가 차례로 콜/폴드(마지막 둘이 SB·BB, k=1 이면 히어로가 SB).
//   낸 돈은 매몰 — 폴드 = 0, 콜 = 팟 몫 − (S − 이미 낸 블라인드). 팟 = 올인 인원 × S + 접은 사람의 블라인드 + A.
//   올인 금액이 모두 S 라 사이드팟이 없다. 무승부는 균등 분할.
// 정보집합: (자리 j, 손 169, **앞에서 콜한 인원 수** c = 0,1,2,3+). k≤2 에서는 이것이 게임의 정보집합 그대로다
//   (k=2 BB: SB 폴드 → c=0 = solve3 의 b1, SB 콜 → c=1 = b2). k≥3 에서는 '누가' 콜했는지를 버리고 '몇 명' 만 본다 —
//   전략 공간을 제한하는 추상화이며 README 에 적었다.
// 게시 표: shove = 히어로 · callBB = BB 의 c=0(앞이 전부 폴드) · callSB = SB 의 c=0 — 기존 nash.data.ts 정의와 같다.
// 표본: 히어로 손 169 개를 **층화**(손마다 M 딜, 콤보 수로 가중), 나머지 8 손 + 보드 5장은 무작위. 딜마다 seed 고정 → 재현.
//   딜 하나에 9 손의 패 순위를 미리 매겨 두고(딜 안의 상대 순위 0..8 만 저장), 게임 k 는 앞 k+1 손만 쓴다.
//   (안 쓰는 손은 보이지 않는 카드일 뿐이라 쓰는 손 조건부 보드 분포를 바꾸지 않는다.)
// 풀이: 표본 게임 위에서 동시 갱신 CFR+(선형 평균) — solve3.mjs 와 같은 갱신식. 수렴 지표는 각 정보집합의
//   최선응답 이득 합 ε(판당 bb, '히어로까지 폴드된 판' 1회 기준)을 평균 전략에서 잰다.
//
// 실행(저장소 루트) — 2026-10-02 게시 값 재현 명령은 README '2026-10-02' 절:
//   INFO=count node scripts/gen-nash/solve-deal.mjs <out.json> [M=20000] [iters=400] [jobs=ante:3-8:2,3,4,5] [salt=0]
//     jobs 문법: '<ante|no>:<k 목록|범위>:<스택 목록>' 을 ';' 로 잇는다. 예) 'ante:1-2:2,3,4,5;no:1-2:2,3'
//   node scripts/gen-nash/emit.mjs <out.json> src/lib/nash.data.ts ante 2,3,4,5 3,4,5,6,7,8
// 환경변수:
//   INFO=count|full  정보집합(위). 게시는 count — full 은 같은 M 에서 표본 밖 착취가능도가 더 컸다(README).
//   EVAL_JSON=<solved.json>  풀지 않고 그 전략을 이 salt 의 새 딜에서 잰다(iters 무시) → cv.mjs 입력.
//   SOLVE_INIT=0..1  시작 전략(다른 균형 탐색). FIX_SHOVE_JSON={key:[169]}  히어로 고정(공개 표 가설 시험).
//   MAXCALL=n  앞 콜이 n 명이면 더 못 콜한다 — **가설 시험 전용**(공개 표가 올인 인원을 자른 모델인지). 게시 값에 쓰지 않는다.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { RANK_KEY as RK, NF, FLUSH } from './eval7.mjs';

const n = 169; const P = 9; const CMAX = 3;
// INFO=count(기본 · 게시 값): 정보집합 = (자리, 손, 앞 콜 **인원 수** 0·1·2·3+) — 전략 공간을 줄인 추상화.
// INFO=full: (자리, 손, 앞 선수 중 **누가** 콜했는지 마스크) — 게임 그대로. 같은 M 에서 표본 잡음에 과적합해 표본 밖 ε 가 더 컸다.
//   어느 쪽으로 풀든 마지막 평가(ε전체 · cv.mjs)는 full 게임 정보집합으로 잰다.
const FULL = (process.env.INFO ?? 'count') === 'full';
const MAXCALL = Number(process.env.MAXCALL ?? 99);
const R = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const ORDER = (() => { const o = []; for (let hi = 12; hi >= 0; hi--) for (let lo = hi; lo >= 0; lo--) { if (hi === lo) o.push(R[hi] + R[lo]); else { o.push(R[hi] + R[lo] + 's'); o.push(R[hi] + R[lo] + 'o'); } } return o; })();
const CNT = Float64Array.from(ORDER, (h) => (h.length === 2 ? 6 : h[2] === 's' ? 4 : 12));
const IDX = new Map(ORDER.map((h, i) => [h, i]));
// 카드 둘 → 캐노니컬 손 번호
const CLS = new Uint8Array(52 * 52);
for (let a = 0; a < 52; a++) for (let b = 0; b < 52; b++) if (a !== b) {
  const ra = a >> 2, rb = b >> 2; const hi = Math.max(ra, rb), lo = Math.min(ra, rb);
  CLS[a * 52 + b] = IDX.get(hi === lo ? R[hi] + R[lo] : R[hi] + R[lo] + ((a & 3) === (b & 3) ? 's' : 'o'));
}
const COMBOS = ORDER.map(() => []);
for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) COMBOS[CLS[a * 52 + b]].push([a, b]);

function rng(seed) { // splitmix32
  let s = seed >>> 0;
  return () => { s = (s + 0x9e3779b9) >>> 0; let z = s; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0; z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0; return ((z ^ (z >>> 16)) >>> 0) / 4294967296; };
}

/** 딜 [d0, d1) 을 만든다: cls[d*9+i] = 손 번호, ord[d*9+i] = 딜 안의 패 순위(클수록 강함, 같으면 같은 값) */
function genDeals(cls, ord, M, salt, d0, d1) {
  const deck = new Int32Array(52); const v = new Float64Array(P); const sorted = new Float64Array(P);
  for (let d = d0; d < d1; d++) {
    const h0 = Math.floor(d / M);
    const rnd = rng(Math.imul(d + 1, 0x27d4eb2d) ^ Math.imul(salt + 1, 0x165667b1));
    const c0 = COMBOS[h0][(rnd() * COMBOS[h0].length) | 0];
    let m = 0; for (let c = 0; c < 52; c++) if (c !== c0[0] && c !== c0[1]) deck[m++] = c;
    for (let i = 0; i < 2 * (P - 1) + 5; i++) { const j = i + ((rnd() * (m - i)) | 0); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    const B = 2 * (P - 1); let bk = 0; const bm = [0, 0, 0, 0];
    for (let i = B; i < B + 5; i++) { const c = deck[i]; bk += RK[c >> 2]; bm[c & 3] |= 1 << (c >> 2); }
    const base = d * P;
    for (let p = 0; p < P; p++) {
      const a = p === 0 ? c0[0] : deck[2 * (p - 1)]; const b = p === 0 ? c0[1] : deck[2 * (p - 1) + 1];
      cls[base + p] = CLS[a * 52 + b];
      let val = NF[bk + RK[a >> 2] + RK[b >> 2]];
      for (let s = 0; s < 4; s++) { let mk = bm[s]; if ((a & 3) === s) mk |= 1 << (a >> 2); if ((b & 3) === s) mk |= 1 << (b >> 2); const f = FLUSH[mk]; if (f > val) val = f; }
      v[p] = val; sorted[p] = val;
    }
    sorted.sort();
    for (let p = 0; p < P; p++) { let r = 0; for (let q = 0; q < P; q++) if (sorted[q] < v[p] && (q === 0 || sorted[q] !== sorted[q - 1])) r++; ord[base + p] = r; }
  }
}

/** 게임 하나(k, S, A)를 푼다. 반환: 평균 전략 · ε */
function solveGame(cls, ord, D, M, k, S, A, iters, fixedShove = null, given = null) {
  const post = new Float64Array(k + 1);
  if (k === 1) { post[0] = 0.5; post[1] = 1; } else { post[k - 1] = 0.5; post[k] = 1; }
  const NI = (CMAX + 1) * n;
  // 시작 전략 — 기본 0.5. 다인 게임은 균형이 여럿일 수 있어 SOLVE_INIT(0..1)로 출발점을 바꿔 같은 곳에 닿는지 본다.
  const init = Number(process.env.SOLVE_INIT ?? 0.5);
  const strat = [new Float64Array(n).fill(init)]; for (let j = 1; j <= k; j++) strat.push(new Float64Array(FULL ? (1 << (j - 1)) * n : NI).fill(init));
  if (fixedShove) strat[0].set(fixedShove);
  if (given) for (let j = 0; j <= k; j++) strat[j].set(given[j]);   // 표본 밖 평가: 주어진 전략을 새 딜에서 잰다(iters=0)   // 가설 시험: 히어로 셔브 범위를 외부 표로 고정하고 콜러만 푼다(FIX_SHOVE_JSON)
  const E = strat.map((s) => new Float64Array(s.length));
  const rA = strat.map((s) => new Float64Array(s.length)); const rF = strat.map((s) => new Float64Array(s.length));
  const avg = strat.map((s) => new Float64Array(s.length));
  const bufC = Array.from({ length: k + 2 }, () => new Float64Array(k + 1));
  const bufF = Array.from({ length: k + 2 }, () => new Float64Array(k + 1));
  const rootOut = new Float64Array(k + 1);
  let base = 0; let w = 0; let cur = strat;
  // 전체 게임 정보집합(누가 콜했는지 전부 = 앞 선수들의 콜 마스크) 위의 최선응답 이득을 재는 누적기 — 마지막 평가 때만 켠다.
  // 풀이는 '앞 콜 인원 수' 추상화 위에서 하므로, 이 값이 작아야 추상화가 전체 게임에서도 ε-Nash 라고 말할 수 있다.
  let Em = null;

  function leaf(mask, out) {
    let best = -1; let ties = 0; let inN = 0; let dead = A;
    for (let i = 0; i <= k; i++) {
      if (mask & (1 << i)) { inN++; const r = ord[base + i]; if (r > best) { best = r; ties = 1; } else if (r === best) ties++; }
      else dead += post[i];
    }
    const pot = inN * S + dead; const share = pot / ties;
    for (let i = 0; i <= k; i++) out[i] = (mask & (1 << i)) ? (ord[base + i] === best ? share : 0) - (S - post[i]) : 0;
  }
  function node(j, mask, cnt, pp, out) {
    if (j > k) { leaf(mask, out); return; }
    const ii = FULL ? (mask >>> 1) * n + cls[base + j] : (cnt < CMAX ? cnt : CMAX) * n + cls[base + j];
    // MAXCALL(가설 시험 전용): 앞에서 이미 이만큼 콜했으면 이 선수는 콜할 수 없다(공개 표가 콜러 수를 자른 모델인지 보는 용도).
    const sg = cnt >= MAXCALL ? 0 : cur[j][ii]; const uc = bufC[j]; const uf = bufF[j];
    const needC = pp > 0 || sg > 0; const needF = sg < 1;
    if (needC) node(j + 1, mask | (1 << j), cnt + 1, pp * sg, uc);
    if (needF) node(j + 1, mask, cnt, pp * (1 - sg), uf);
    if (pp > 0) { E[j][ii] += w * pp * uc[j]; if (Em) Em[j][(mask >>> 1) * n + cls[base + j]] += w * pp * uc[j]; }
    if (!needF) { for (let i = 0; i <= k; i++) out[i] = uc[i]; }
    else if (!needC) { for (let i = 0; i <= k; i++) out[i] = uf[i]; }
    else for (let i = 0; i <= k; i++) out[i] = sg * uc[i] + (1 - sg) * uf[i];
  }
  function sweep(st) {
    cur = st; for (const e of E) e.fill(0);
    for (let d = 0; d < D; d++) {
      base = d * P; const h0 = cls[base]; w = CNT[h0];
      node(1, 1, 0, st[0][h0], rootOut);
      E[0][h0] += w * rootOut[0];
    }
  }
  const TOT = 1326 * M;
  for (let t = 1; t <= iters; t++) {
    sweep(strat);
    for (let j = fixedShove ? 1 : 0; j <= k; j++) {
      const s = strat[j], e = E[j], a = rA[j], f = rF[j], g = avg[j];
      for (let i = 0; i < s.length; i++) {
        const u = e[i] / TOT; const vv = s[i] * u;
        a[i] = Math.max(0, a[i] + u - vv); f[i] = Math.max(0, f[i] - vv);
        const tot = a[i] + f[i]; s[i] = tot > 0 ? a[i] / tot : 0.5;
        g[i] += t * s[i];
      }
    }
  }
  if (fixedShove) for (let i = 0; i < n; i++) avg[0][i] = fixedShove[i] * (iters * (iters + 1)) / 2;
  if (given) for (let j = 0; j <= k; j++) avg[j].set(given[j]);
  else { const wsum = (iters * (iters + 1)) / 2; for (const g of avg) for (let i = 0; i < g.length; i++) g[i] /= wsum; }
  // ε — 평균 전략에서 정보집합별 최선응답 이득. eps = 추상화(앞 콜 인원 수) 정보집합 · epsFull = 전체 게임 정보집합(콜 마스크)
  Em = [new Float64Array(n)]; for (let j = 1; j <= k; j++) Em.push(new Float64Array((1 << (j - 1)) * n));
  sweep(avg);
  for (let h = 0; h < n; h++) Em[0][h] = E[0][h];
  const eps = []; for (let j = 0; j <= k; j++) { let t = 0; for (let i = 0; i < avg[j].length; i++) { const u = E[j][i] / TOT; t += Math.max(0, u) - avg[j][i] * u; } eps.push(t); }
  const epsFull = []; for (let j = 0; j <= k; j++) {
    let t = 0;
    for (let mk = 0; mk < Em[j].length / n; mk++) {
      let c = 0; for (let b = mk; b; b &= b - 1) c++; c = c < CMAX ? c : CMAX;   // 이 마스크의 콜 인원 → 추상화 전략 칸
      for (let h = 0; h < n; h++) { const u = Em[j][mk * n + h] / TOT; const sg = j === 0 ? avg[0][h] : avg[j][(FULL ? mk : c) * n + h]; t += Math.max(0, u) - sg * u; }
    }
    epsFull.push(t);
  }
  // 표본 밖 교차 검증용: 전체 게임 정보집합별 (콜 − 폴드) 가치 u — cv.mjs 가 두 표본의 u 로 '한 표본에서 고른 최선응답이
  //   다른 표본에서 얼마를 버는가' 를 잰다(같은 표본으로 고르고 재면 잡음이 이득으로 잡혀 ε 가 부풀려진다).
  const uFull = given ? Em.map((e) => Array.from(e, (x) => x / TOT)) : null;
  Em = null;
  return { avg, eps, epsFull, uFull, ev: E.map((e) => Array.from(e, (x) => x / TOT)) };
}

const pct = (f) => { let t = 0; for (let i = 0; i < n; i++) t += f[i] * CNT[i]; return (t / 1326) * 100; };
function parseJobs(spec) {
  const jobs = [];
  for (const part of spec.split(';').filter(Boolean)) {
    const [a, ks, ss] = part.split(':');
    const kl = ks.includes('-') ? (() => { const [x, y] = ks.split('-').map(Number); return Array.from({ length: y - x + 1 }, (_, i) => x + i); })() : ks.split(',').map(Number);
    for (const k of kl) for (const S of ss.split(',').map(Number)) jobs.push({ a, k, S });
  }
  return jobs.sort((x, y) => y.k - x.k);   // 큰 k(느린 것)부터
}

if (isMainThread) {
  const [, , outFile, mArg = '20000', itArg = '400', jobArg = 'ante:3-8:2,3,4,5', saltArg = '0'] = process.argv;
  const M = Number(mArg); const iters = Number(itArg); const salt = Number(saltArg); const D = n * M;
  const sabC = new SharedArrayBuffer(D * P); const sabO = new SharedArrayBuffer(D * P);
  const nW = Math.max(1, os.cpus().length - 1); const t0 = Date.now();
  // ① 딜 생성(병렬)
  const chunk = Math.ceil(D / nW);
  await Promise.all(Array.from({ length: nW }, (_, w) => new Promise((ok, rej) => {
    const wk = new Worker(new URL(import.meta.url), { workerData: { mode: 'gen', sabC, sabO, M, salt, d0: w * chunk, d1: Math.min(D, (w + 1) * chunk) } });
    wk.on('exit', ok); wk.on('error', rej);
  })));
  console.log(`deals ${D.toLocaleString()} (M=${M}/손 · salt ${salt}) in ${Math.round((Date.now() - t0) / 1000)}s`);
  // ② 게임 풀이(표마다 한 워커)
  const jobs = parseJobs(jobArg); const res = {}; let next = 0;
  await Promise.all(Array.from({ length: Math.min(nW, jobs.length) }, () => new Promise((ok, rej) => {
    const given = process.env.EVAL_JSON ? Object.fromEntries(Object.entries(JSON.parse(readFileSync(process.env.EVAL_JSON, 'utf-8')).res).map(([key, r]) => [key, r.strat])) : null;
    const wk = new Worker(new URL(import.meta.url), { workerData: { mode: 'solve', sabC, sabO, M, iters, given, fixed: process.env.FIX_SHOVE_JSON ? JSON.parse(readFileSync(process.env.FIX_SHOVE_JSON, 'utf-8')) : null } });
    const feed = () => { if (next >= jobs.length) { wk.postMessage(null); return; } wk.postMessage(jobs[next++]); };
    wk.on('message', (r) => { res[`${r.a}|${r.k}|${r.S}`] = r; console.log(r.line); feed(); });
    wk.on('error', rej); wk.on('exit', ok); feed();
  })));
  const q8 = (f) => Math.max(0, Math.min(8, Math.round(f * 8))); const enc = (a) => a.map((f) => String(q8(f))).join('');
  const tables = { shove: { no: {}, ante: {} }, callBB: { no: {}, ante: {} }, callSB: { no: {}, ante: {} } };
  for (const r of Object.values(res)) {
    (tables.shove[r.a][r.k] ??= {})[r.S] = enc(r.shove);
    (tables.callBB[r.a][r.k] ??= {})[r.S] = enc(r.callBB);
    if (r.k >= 2) (tables.callSB[r.a][r.k] ??= {})[r.S] = enc(r.callSB);
  }
  writeFileSync(outFile, JSON.stringify({ order: ORDER, M, iters, salt, info: FULL ? 'full' : 'count', cmax: CMAX, tables, res }));
  console.log(`done ${jobs.length} in ${Math.round((Date.now() - t0) / 1000)}s → ${outFile}`);
} else if (workerData.mode === 'gen') {
  const { sabC, sabO, M, salt, d0, d1 } = workerData;
  genDeals(new Uint8Array(sabC), new Uint8Array(sabO), M, salt, d0, d1);
} else {
  const { sabC, sabO, M, iters, fixed, given } = workerData; const cls = new Uint8Array(sabC); const ord = new Uint8Array(sabO); const D = n * M;
  parentPort.on('message', (job) => {
    if (job === null) process.exit(0);
    const { a, k, S } = job; const A = a === 'ante' ? 1 : 0; const t0 = Date.now();
    const fx = fixed?.[`${a}|${k}|${S}`] ?? null;
    // EVAL_JSON: 표본 밖 평가 — 그 파일의 전략을 이 딜(다른 salt)에서 그대로 재고 ε 만 낸다(iters=0)
    const gv = given ? given[`${a}|${k}|${S}`] : null;
    if (given && !gv) throw new Error(`EVAL_JSON 에 ${a}|${k}|${S} 없음`);
    const { avg, eps, epsFull, uFull, ev } = solveGame(cls, ord, D, M, k, S, A, gv ? 0 : iters, fx, gv);
    // 고정 셔브 시험: 콜러 균형에 대한 히어로 손별 셔브 EV(그 손을 들었을 때 판당 bb) — 고정 범위 중 EV<0 콤보 비율 · 최선응답 범위
    let fixInfo = '';
    if (fx) {
      let neg = 0, inR = 0; const br = new Array(n).fill(0);
      for (let h = 0; h < n; h++) { const u = (ev[0][h] * 1326) / CNT[h]; br[h] = u > 0 ? 1 : 0; if (fx[h] > 0) { inR += CNT[h]; if (u < 0) neg += CNT[h]; } }
      fixInfo = ` · [고정 셔브 ${pct(fx).toFixed(1)}%] 그중 EV<0 콤보 ${((100 * neg) / inR).toFixed(1)}% · 최선응답 셔브 ${pct(br).toFixed(1)}%`;
    }
    const callBB = Array.from(avg[k].subarray(0, n)); const callSB = k >= 2 ? Array.from(avg[k - 1].subarray(0, n)) : null;
    const oi = FULL ? 1 << (k - 2) : 1;   // BB 가 'SB 만 콜' 을 본 칸(오버콜) — 화면 표시는 안 하고 로그용
    const over = k >= 2 ? Array.from(avg[k].subarray(oi * n, (oi + 1) * n)) : null;
    const epsT = eps.reduce((x, y) => x + y, 0); const epsFullT = epsFull.reduce((x, y) => x + y, 0);
    const line = `${a.padEnd(4)} k=${k} ${String(S).padStart(2)}bb  셔브 ${pct(avg[0]).toFixed(1)} · BB콜 ${pct(callBB).toFixed(1)}`
      + (k >= 2 ? ` · SB콜 ${pct(callSB).toFixed(1)} · BB오버콜 ${pct(over).toFixed(1)}` : '') + ` · ε ${epsT.toExponential(1)} · ε전체 ${epsFullT.toExponential(1)} · ${Math.round((Date.now() - t0) / 1000)}s` + fixInfo;
    parentPort.postMessage({ a, k, S, line, shove: Array.from(avg[0]), callBB, callSB, eps, epsT, epsFull, epsFullT, uFull, strat: gv ? null : avg.map((g) => Array.from(g)) });
  });
}
