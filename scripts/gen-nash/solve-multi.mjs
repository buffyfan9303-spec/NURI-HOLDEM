// 다인 콜 **근사** Nash — 빅앤티 k≥2 의 2~10bb 격리 구간을 채우는 솔버 (2026-09-21 · 오너 결정 "근사 계산 — 오늘 안에").
//
// solve.mjs(단일 콜러 근사)와 다른 점은 하나다: **두 번째 콜러(오버콜)까지 본다.** 세 번째 이후는 접는다고 본다.
//  · 왜 필요한가: 얕을수록 2명 이상이 콜하는 확률이 커서(k8 7bb 47.7%) 단일 콜러 근사가 '실제보다 넓게' 틀렸다
//    (nash.data.ts NASH_ANTE_QUARANTINE 이력). 오버콜을 넣으면 그 방향의 오차가 줄어든다.
//  · 3인 에퀴티는 **2인 행렬의 곱 정규화 근사**: Eq3(h; x, y) = e_hx·e_hy / (e_hx·e_hy + e_xh·e_xy + e_yh·e_yx).
//    진짜 3인 에퀴티는 169³ 조합의 몬테카를로(하루 단위)가 필요해 오늘은 근사다 — 그래서 산출물은 '추정' 등급이다.
//  · 3인 카드 제거는 N[h][y]·N[x][y] 로 근사(정규화). 오버콜러의 손은 첫 콜러가 누구든 같은 분포로 본다.
//  · 전략 셋: 히어로 셔브 H · 상대 m 의 첫 콜 C_m(앞에 콜러 없음) · 오버콜 O_m(앞에 콜러 정확히 한 명).
//  · 3인 항(169³·k)은 비싸므로 **바깥 라운드**마다 갱신해 캐시(V_m·U_m)하고, **안쪽 FP**(히어로·첫 콜)는 캐시로 돈다.
//    오버콜 O_m 은 바깥 라운드마다 최선 응답을 1/r 로 섞는다(바깥 FP).
//  · 돈·역할·앤티 규약은 solve.mjs 와 같다(S = 앤티 낸 뒤 남은 스택 · BB 앤티 총 1bb · 낸 돈은 매몰).
// 실행: node solve-multi.mjs <equity.json> <out.json> [outer=30] [inner=300] [stacks=2,3,4,5,6,7,8,9,10] [ks=2,3,4,5,6,7,8] [workers=CPU-1]
import { readFileSync, writeFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';

const R = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const n = 169; const TOTAL = 1225;
let ORDER; let E; let N; let Z; let W2; let ITER_EQ;

function combosOf(name) {
  const a = R.indexOf(name[0]); const b = R.indexOf(name[1]); const out = [];
  if (a === b) { for (let s = 0; s < 4; s++) for (let t = s + 1; t < 4; t++) out.push([a * 4 + s, a * 4 + t]); }
  else if (name[2] === 's') { for (let s = 0; s < 4; s++) out.push([a * 4 + s, b * 4 + s]); }
  else { for (let s = 0; s < 4; s++) for (let t = 0; t < 4; t++) if (s !== t) out.push([a * 4 + s, b * 4 + t]); }
  return out;
}
export function init(file) {
  const EQ = JSON.parse(readFileSync(file, 'utf-8'));
  ORDER = EQ.order; E = Float64Array.from(EQ.matrix); ITER_EQ = EQ.iterations;
  const COMBOS = ORDER.map(combosOf);
  N = new Float64Array(n * n); W2 = new Float64Array(n * n);
  for (let h = 0; h < n; h++) {
    const H = COMBOS[h];
    for (let x = 0; x < n; x++) {
      let cnt = 0;
      for (const a of H) for (const b of COMBOS[x]) if (!(a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1])) cnt++;
      N[h * n + x] = cnt / H.length; W2[h * n + x] = cnt / H.length / TOTAL;
    }
  }
  // Z[h][x] = Σ_y N[h][y]·N[x][y] — 3인 카드 제거 근사의 정규화 상수
  Z = new Float64Array(n * n);
  for (let h = 0; h < n; h++) for (let x = 0; x < n; x++) { let z = 0; for (let y = 0; y < n; y++) z += N[h * n + y] * N[x * n + y]; Z[h * n + x] = z; }
}

/** (k≥2, S, ante) 한 조합. 돌려주는 것: shove[169], callBB[169], callSB[169], overcall 평균 콜 빈도(참고). */
export function solveMulti(k, S, ante, outer = 30, inner = 300) {
  if (k < 2) throw new Error('k>=2 전용 — k=1 은 solve.mjs(정확)');
  const A = ante ? 1 : 0;
  const heroCost = S;                                     // k≥2: 히어로는 블라인드가 아니다
  const roles = []; for (let m = 0; m < k; m++) roles.push(m === k - 1 ? 'BB' : m === k - 2 ? 'SB' : 'other');
  const blind = (role) => (role === 'BB' ? 1 : role === 'SB' ? 0.5 : 0);
  const pot2 = (m) => 2 * S + A + 1.5 - blind(roles[m]);
  const pot3 = (m, j) => 3 * S + A + 1.5 - blind(roles[m]) - blind(roles[j]);
  const callCost = (m) => S - blind(roles[m]);
  const deadIfAllFold = 1.5 + A;
  const COMBO = ORDER.map((h) => (h.length === 2 ? 6 : h[2] === 's' ? 4 : 12));

  const H = new Float64Array(n).fill(1);                 // 히어로 평균 셔브(시작: 전부 올인)
  const C = roles.map(() => new Float64Array(n));        // 첫 콜 평균(시작: 전부 폴드)
  const O = roles.map(() => new Float64Array(n));        // 오버콜 평균(시작: 전부 폴드 = 단일 콜러 모델)
  const shoveBR = new Float64Array(n); const callBR = roles.map(() => new Float64Array(n));
  // 캐시(바깥 라운드마다): Q[j][a*n+b] = P(j 가 a·b 가 나간 상태에서 오버콜) · F[j][a*n+b] = Σ_y w3·O_j[y]·Eq3(a; b, y)
  const Q = roles.map(() => new Float64Array(n * n)); const F = roles.map(() => new Float64Array(n * n));
  const V = roles.map(() => new Float64Array(n * n));    // 히어로 h 가 첫 콜러 m(손 x)을 만났을 때 기대 순이익(오버콜 포함)
  const U = roles.map(() => new Float64Array(n * n));    // 첫 콜러 m(손 y)이 히어로 h 를 콜했을 때 기대 순이익(오버콜 포함)

  let T = 0;
  for (let r = 1; r <= outer; r++) {
    // ── ① 오버콜 최선 응답(바깥 FP) — 첫 콜러가 앞의 누구든 '첫 콜 레인지 혼합' 을 상대한다 ──
    if (r > 1) {
      // π_m: m 이 첫 콜러가 될 상대 확률(히어로 레인지에 무관한 콤보 가중 평균 콜 빈도로 근사)
      const cbar = C.map((Cm) => { let s = 0; for (let x = 0; x < n; x++) s += Cm[x] * COMBO[x]; return s / 1326; });
      const pi = []; let pf = 1; for (let m = 0; m < k; m++) { pi.push(pf * cbar[m]); pf *= (1 - cbar[m]); }
      for (let j = 1; j < k; j++) {
        const M = new Float64Array(n); let piSum = 0; let potAvg = 0;
        for (let m = 0; m < j; m++) { piSum += pi[m]; potAvg += pi[m] * pot3(m, j); for (let x = 0; x < n; x++) M[x] += pi[m] * C[m][x]; }
        if (piSum <= 1e-12) { continue; }                // 앞에서 아무도 콜하지 않으면 오버콜 상황이 없다
        potAvg /= piSum; for (let x = 0; x < n; x++) M[x] /= piSum;
        const cost = callCost(j);
        const br = new Float64Array(n);
        for (let z = 0; z < n; z++) {
          let num = 0; let den = 0;
          for (let h = 0; h < n; h++) {
            const wh = W2[z * n + h] * H[h]; if (wh <= 0) continue;
            const zh = Z[z * n + h]; if (zh <= 0) continue;
            const e_zh = E[z * n + h]; const e_hz = E[h * n + z];
            let inner_num = 0; let inner_den = 0;
            for (let x = 0; x < n; x++) {
              const mx = M[x]; if (mx <= 0) continue;
              const w3 = N[z * n + x] * N[h * n + x] / zh * mx; if (w3 <= 0) continue;
              const e_zx = E[z * n + x]; const e_hx = E[h * n + x]; const e_xz = E[x * n + z]; const e_xh = E[x * n + h];
              const pz = e_zh * e_zx; const ph = e_hz * e_hx; const px = e_xz * e_xh;
              const eq3 = pz / (pz + ph + px);
              inner_den += w3; inner_num += w3 * (eq3 * potAvg - cost);
            }
            den += wh * inner_den; num += wh * inner_num;
          }
          br[z] = den > 0 && num / den > 0 ? 1 : 0;
        }
        const a = 1 / (r - 1);                           // 바깥 FP 평균(r=2 에서 BR 그대로)
        for (let z = 0; z < n; z++) O[j][z] += a * (br[z] - O[j][z]);
      }
    }
    // ── ② 3인 캐시 Q·F 갱신(O 기준) ──
    for (let j = 1; j < k; j++) {
      const Oj = O[j]; const Qj = Q[j]; const Fj = F[j];
      let any = false; for (let y = 0; y < n; y++) if (Oj[y] > 0) { any = true; break; }
      if (!any) { Qj.fill(0); Fj.fill(0); continue; }
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        const zab = Z[a * n + b]; if (zab <= 0) { Qj[a * n + b] = 0; Fj[a * n + b] = 0; continue; }
        const e_ab = E[a * n + b]; const e_ba = E[b * n + a];
        let q = 0; let f = 0;
        for (let y = 0; y < n; y++) {
          const oy = Oj[y]; if (oy <= 0) continue;
          const w3 = N[a * n + y] * N[b * n + y] / zab * oy; if (w3 <= 0) continue;
          const e_ay = E[a * n + y]; const e_by = E[b * n + y]; const e_ya = E[y * n + a]; const e_yb = E[y * n + b];
          const pa = e_ab * e_ay; const pb = e_ba * e_by; const py = e_ya * e_yb;
          q += w3; f += w3 * (pa / (pa + pb + py));
        }
        Qj[a * n + b] = q; Fj[a * n + b] = f;
      }
    }
    // ── ③ V_m(히어로 관점)·U_m(첫 콜러 관점) 캐시 ──
    for (let m = 0; m < k; m++) {
      const p2 = pot2(m); const cm = callCost(m); const Vm = V[m]; const Um = U[m];
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        const i = a * n + b;
        // 히어로 a · 첫 콜러 b (V) — 오버콜은 m 뒤의 j 가 순서대로 시도
        let pno = 1; let v = 0; let u = 0;
        for (let j = m + 1; j < k; j++) {
          const q = Q[j][i]; const p3 = pot3(m, j);
          v += pno * (F[j][i] * p3 - q * heroCost);        // 히어로 순이익: Eq3·pot3 − S (콜된 경우)
          u += pno * (F[j][i] * p3 - q * cm);              // 첫 콜러(a 가 콜러일 때 같은 식) — 아래에서 a=y, b=h 로 읽는다
          pno *= (1 - q);
        }
        Vm[i] = pno * (E[i] * p2 - heroCost) + v;
        Um[i] = pno * (E[i] * p2 - cm) + u;
      }
    }
    // ── ④ 안쪽 FP: 히어로 ↔ 첫 콜러들 ──
    for (let it = 0; it < inner; it++) {
      T += 1;
      for (let h = 0; h < n; h++) {
        let ev = 0; let pFold = 1;
        for (let m = 0; m < k; m++) {
          const Cm = C[m]; const Vm = V[m]; let pc = 0; let gain = 0;
          for (let x = 0; x < n; x++) {
            const w = W2[h * n + x] * Cm[x]; if (w <= 0) continue;
            pc += w; gain += w * Vm[h * n + x];
          }
          ev += pFold * gain; pFold *= (1 - pc);
        }
        ev += pFold * deadIfAllFold;
        shoveBR[h] = ev > 0 ? 1 : 0;
      }
      for (let m = 0; m < k; m++) {
        const Um = U[m]; const br = callBR[m];
        for (let y = 0; y < n; y++) {
          let num = 0; let den = 0;
          for (let h = 0; h < n; h++) {
            const w = N[y * n + h] * H[h]; if (w <= 0) continue;
            den += w; num += w * Um[y * n + h];
          }
          br[y] = den > 0 && num / den > 0 ? 1 : 0;
        }
      }
      const a = 1 / T;
      for (let h = 0; h < n; h++) H[h] += a * (shoveBR[h] - H[h]);
      for (let m = 0; m < k; m++) for (let y = 0; y < n; y++) C[m][y] += a * (callBR[m][y] - C[m][y]);
    }
  }
  const pct = (arr) => { let t = 0; for (let i = 0; i < n; i++) t += arr[i] * COMBO[i]; return t / 1326 * 100; };
  return { shove: H, callBB: C[k - 1], callSB: C[k - 2], overcallPct: O.map(pct) };
}

export const q8 = (f) => Math.max(0, Math.min(8, Math.round(f * 8)));
export const encode = (arr) => Array.from(arr).map((f) => String(q8(f))).join('');

if (!isMainThread) {
  const { eqFile, k, S, ante, outer, inner } = workerData;
  init(eqFile);
  const t0 = Date.now();
  const r = solveMulti(k, S, ante, outer, inner);
  parentPort.postMessage({ k, S, ante, shove: Array.from(r.shove), callBB: Array.from(r.callBB), callSB: Array.from(r.callSB), overcallPct: r.overcallPct, ms: Date.now() - t0 });
} else {
  const [, , eqFile, outFile, outerArg, innerArg, stacksArg, ksArg, workersArg] = process.argv;
  const outer = Number(outerArg ?? 30); const inner = Number(innerArg ?? 300);
  const STACKS = (stacksArg ?? '2,3,4,5,6,7,8,9,10').split(',').map(Number);
  const KS = (ksArg ?? '2,3,4,5,6,7,8').split(',').map(Number);
  const NW = Math.max(1, Number(workersArg ?? (cpus().length - 1)));
  init(eqFile);
  const jobs = []; for (const k of KS) for (const S of STACKS) jobs.push({ k, S, ante: true });
  const tables = { shove: { no: {}, ante: {} }, callBB: { no: {}, ante: {} }, callSB: { no: {}, ante: {} } };
  const raw = {}; const meta = {};
  const t0 = Date.now(); let next = 0; let done = 0;
  await new Promise((resolve, reject) => {
    const spawn = () => {
      if (next >= jobs.length) return;
      const job = jobs[next++];
      const w = new Worker(new URL(import.meta.url), { workerData: { eqFile, ...job, outer, inner } });
      w.on('message', (r) => {
        const key = 'ante';
        (tables.shove[key][r.k] ??= {})[r.S] = encode(r.shove);
        (tables.callBB[key][r.k] ??= {})[r.S] = encode(r.callBB);
        (tables.callSB[key][r.k] ??= {})[r.S] = encode(r.callSB);
        raw[`shove|${key}|${r.k}|${r.S}`] = r.shove; raw[`callBB|${key}|${r.k}|${r.S}`] = r.callBB; raw[`callSB|${key}|${r.k}|${r.S}`] = r.callSB;
        meta[`${r.k}|${r.S}`] = { overcallPct: r.overcallPct.map((x) => +x.toFixed(1)), ms: r.ms };
        done += 1; process.stdout.write(`k${r.k} ${r.S}bb ${(r.ms / 1000).toFixed(1)}s (${done}/${jobs.length})\n`);
        spawn(); if (done === jobs.length) resolve();
      });
      w.on('error', reject);
    };
    for (let i = 0; i < NW; i++) spawn();
  });
  writeFileSync(outFile, JSON.stringify({ model: 'multi-caller-approx(product-eq3, <=2 callers)', outer, inner, equityIterations: ITER_EQ, order: ORDER, tables, raw, meta }));
  console.log(`solved ${jobs.length} tables in ${Math.round((Date.now() - t0) / 1000)}s → ${outFile}`);
}
