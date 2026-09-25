// 헤즈업(SB 올인 vs BB 콜) 푸시/폴드 — 정확 에퀴티 위에서 CFR+ 로 균형을 풀고,
// 게시 표(nash.data.ts k=1)의 **착취가능도**와 **손별 EV 차(bb)** 를 잰다. 2026-09-25 gto-team.
//
// 왜: HANDOFF G5 — 로컬 k=1 표와 HRC 공개 CSV 가 경계 손에서 50%p 이상 갈렸는데 "빈도 차로는 정오를 못 가른다".
//     같은 액션 트리에서 손별 (올인 − 폴드) EV 를 정확 에퀴티로 재면 가른다.
// 게임(solve.mjs 의 k=1 과 같은 돈 규칙): 스택 S = 앤티 낸 뒤 실효 스택. SB 0.5 · BB 1 · 앤티 A(BB 가 냄, 0 또는 1).
//   SB 폴드 기준 순변화: 올인·BB폴드 = 1.5 + A · 올인·콜 = E·(2S + A) − (S − 0.5)
//   BB 폴드 기준 순변화: 콜 = E·(2S + A) − (S − 1)
//   카드 제거: h 의 콤보 하나를 알 때 y 의 합법 콤보 수 N[h][y] (합 1225). 에퀴티는 equity169-exact.mjs(전수).
// 착취가능도(NashConv) = [SB 최선응답 가치 − 전략쌍 가치] + [전략쌍 가치 − BB 최선응답 뒤 SB 가치], 단위 bb/판(SB 관점).
// 실행(저장소 루트):
//   node scripts/gen-nash/equity169-exact.mjs /tmp/eq-exact.json                       # ≈4분(12코어)
//   node scripts/gen-nash/hu-exact.mjs /tmp/eq-exact.json src/lib/nash.data.ts 20000 /tmp/hu.json   # ≈1분 · 표 대비 착취가능도 출력
//   node scripts/gen-nash/emit.mjs /tmp/hu.json src/lib/nash.data.ts all 2,3,4,5,6,7,8,9,10,12,15,20 1  # k=1 열만 교체
import { readFileSync, writeFileSync } from 'node:fs';

const [, , eqFile, dataFile, itArg, outFile] = process.argv;
const ITERS = Number(itArg ?? 20000);
const EQ = JSON.parse(readFileSync(eqFile, 'utf-8'));
if (EQ.iterations !== 'exact') console.warn('⚠ 정확 전수 행렬이 아니다:', EQ.iterations);
const ORDER = EQ.order; const E = Float64Array.from(EQ.matrix); const n = 169;
const R = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const combosOf = (name) => { const a = R.indexOf(name[0]); const b = R.indexOf(name[1]); const o = [];
  if (a === b) { for (let s = 0; s < 4; s++) for (let t = s + 1; t < 4; t++) o.push([a * 4 + s, a * 4 + t]); }
  else if (name[2] === 's') { for (let s = 0; s < 4; s++) o.push([a * 4 + s, b * 4 + s]); }
  else { for (let s = 0; s < 4; s++) for (let t = 0; t < 4; t++) if (s !== t) o.push([a * 4 + s, b * 4 + t]); } return o; };
const CO = ORDER.map(combosOf); const CNT = CO.map((c) => c.length);
const N = new Float64Array(n * n);
for (let h = 0; h < n; h++) for (let x = 0; x < n; x++) { let c = 0; const a = CO[h][0]; for (const b of CO[x]) if (a[0] !== b[0] && a[0] !== b[1] && a[1] !== b[0] && a[1] !== b[1]) c++; N[h * n + x] = c; }

// 게시 표 읽기(nash.data.ts 의 한 줄 JSON 리터럴) — k=1 셔브 / BB 콜
const text = readFileSync(dataFile, 'utf-8');
const lit = (name) => JSON.parse(text.match(new RegExp(`const ${name}: [^=]+= (\\{[^\\r\\n]*\\});`))[1]);
const SHOVE = lit('SHOVE'); const CALL_BB = lit('CALL_BB');
const dec = (s) => Float64Array.from(s, (ch) => Number(ch) / 8);

function sbPushEV(h, S, A, c) {   // SB 가 h 로 올인할 때 폴드 대비 EV(bb) — BB 전략 c
  const pot = 2 * S + A; let ev = 0;
  for (let y = 0; y < n; y++) { const w = N[h * n + y]; if (!w) continue; ev += w * ((1 - c[y]) * (1.5 + A) + c[y] * (E[h * n + y] * pot - (S - 0.5))); }
  return ev / 1225;
}
function bbCallEV(y, S, A, p) {   // BB 가 y 로 콜할 때 폴드 대비 EV(bb) — SB 올인 레인지 p 조건부. 레인지가 비면 NaN
  const pot = 2 * S + A; let num = 0; let den = 0;
  for (let h = 0; h < n; h++) { const w = N[y * n + h] * p[h]; if (!w) continue; den += w; num += w * (E[y * n + h] * pot - (S - 1)); }
  return den > 0 ? num / den : NaN;
}
/** SB 관점 판당 가치(폴드 기준 아닌 실제 순변화: 폴드 −0.5) */
function value(S, A, p, c) {
  let v = 0;
  for (let h = 0; h < n; h++) v += (CNT[h] / 1326) * (-0.5 + p[h] * sbPushEV(h, S, A, c));
  return v;
}
function brSB(S, A, c) { return Float64Array.from({ length: n }, (_, h) => (sbPushEV(h, S, A, c) > 0 ? 1 : 0)); }
function brBB(S, A, p) { return Float64Array.from({ length: n }, (_, y) => (bbCallEV(y, S, A, p) > 0 ? 1 : 0)); }
function nashConv(S, A, p, c) {
  const v = value(S, A, p, c);
  return { sbGain: value(S, A, brSB(S, A, c), c) - v, bbGain: v - value(S, A, p, brBB(S, A, p)) };
}

/** CFR+ (교대 갱신 · 선형 가중 평균) */
function solveCFR(S, A, iters) {
  const rS = new Float64Array(n); const rB = new Float64Array(n); const rSf = new Float64Array(n); const rBf = new Float64Array(n);
  const aS = new Float64Array(n); const aB = new Float64Array(n); let wsum = 0;
  const p = new Float64Array(n).fill(0.5); const c = new Float64Array(n).fill(0.5);
  const pot = 2 * S + A;
  for (let t = 1; t <= iters; t++) {
    // SB: 정보집합 = h. 폴드 가치 0, 올인 가치 sbPushEV
    for (let h = 0; h < n; h++) {
      const up = sbPushEV(h, S, A, c); const v = p[h] * up;
      // 두 행동 regret (폴드 0)
      rS[h] = Math.max(0, rS[h] + (up - v)); // 올인
      const rf = Math.max(0, rSf[h] - v); rSf[h] = rf;
      const tot = rS[h] + rf; p[h] = tot > 0 ? rS[h] / tot : 0.5;
    }
    // BB: 정보집합 = y. 반사실 가중 = N·p (정규화 없이 — CFR 은 도달확률 가중 regret)
    for (let y = 0; y < n; y++) {
      let uc = 0; for (let h = 0; h < n; h++) { const w = N[y * n + h] * p[h]; if (w) uc += w * (E[y * n + h] * pot - (S - 1)); }
      uc /= 1225; const v = c[y] * uc;
      rB[y] = Math.max(0, rB[y] + (uc - v));
      const rf = Math.max(0, rBf[y] - v); rBf[y] = rf;
      const tot = rB[y] + rf; c[y] = tot > 0 ? rB[y] / tot : 0.5;
    }
    const w = t; wsum += w;
    for (let i = 0; i < n; i++) { aS[i] += w * p[i]; aB[i] += w * c[i]; }
  }
  for (let i = 0; i < n; i++) { aS[i] /= wsum; aB[i] /= wsum; }
  return { p: aS, c: aB };
}
const comboPct = (f) => { let s = 0; for (let i = 0; i < n; i++) s += f[i] * CNT[i]; return (s / 1326) * 100; };

const STACKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20];
const out = { iters: ITERS, tables: {} };
const t0 = Date.now();
for (const ante of ['no', 'ante']) {
  const A = ante === 'ante' ? 1 : 0;
  for (const S of STACKS) {
    const eq = solveCFR(S, A, ITERS);
    const locP = dec(SHOVE[ante]['1'][String(S)]); const locC = dec(CALL_BB[ante]['1'][String(S)]);
    const exEq = nashConv(S, A, eq.p, eq.c); const exLoc = nashConv(S, A, locP, locC);
    // 손별 EV 차: 균형 상대 기준 · 게시 표 상대 기준
    const pushEV = Array.from({ length: n }, (_, h) => sbPushEV(h, S, A, eq.c));
    const pushEVloc = Array.from({ length: n }, (_, h) => sbPushEV(h, S, A, locC));
    const callEV = Array.from({ length: n }, (_, y) => bbCallEV(y, S, A, eq.p));
    const callEVloc = Array.from({ length: n }, (_, y) => bbCallEV(y, S, A, locP));
    out.tables[`${ante}|${S}`] = { p: Array.from(eq.p), c: Array.from(eq.c), pushEV, pushEVloc, callEV, callEVloc,
      exploit: { eq: exEq, local: exLoc }, value: value(S, A, eq.p, eq.c),
      pct: { eqPush: comboPct(eq.p), eqCall: comboPct(eq.c), locPush: comboPct(locP), locCall: comboPct(locC) } };
    console.log(`${ante.padEnd(4)} ${String(S).padStart(2)}bb  push ${comboPct(eq.p).toFixed(2)} (표 ${comboPct(locP).toFixed(2)})  call ${comboPct(eq.c).toFixed(2)} (표 ${comboPct(locC).toFixed(2)})`
      + `  NashConv 균형 ${(exEq.sbGain + exEq.bbGain).toExponential(2)} · 표 ${(exLoc.sbGain + exLoc.bbGain).toFixed(5)} bb (SB몫 ${exLoc.sbGain.toFixed(5)} / BB몫 ${exLoc.bbGain.toFixed(5)})`);
  }
}
console.log(`solved in ${Math.round((Date.now() - t0) / 1000)}s (CFR+ ${ITERS})`);
// emit.mjs 가 그대로 먹는 모양(tables) + 손별 EV·착취가능도(detail)
const q8 = (f) => Math.max(0, Math.min(8, Math.round(f * 8)));
const enc = (a) => Array.from(a, (f) => String(q8(f))).join('');
const tables = { shove: { no: {}, ante: {} }, callBB: { no: {}, ante: {} }, callSB: { no: {}, ante: {} } };
for (const key of Object.keys(out.tables)) { const [a, S] = key.split('|'); const t = out.tables[key];
  (tables.shove[a]['1'] ??= {})[S] = enc(t.p); (tables.callBB[a]['1'] ??= {})[S] = enc(t.c); }
if (outFile) writeFileSync(outFile, JSON.stringify({ order: ORDER, iters: ITERS, tables, detail: out.tables }));
