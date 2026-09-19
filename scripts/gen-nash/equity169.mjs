// 169×169 프리플랍 에퀴티 행렬 — 캐노니컬 핸드 i 가 j 를 상대로 이길 확률(무승부 절반), 몬테카를로 ITER 회/쌍.
// nash.data.ts 머리말 조리법: "에퀴티는 자체 몬테카를로(4만회/쌍) 169x169 행렬". 구체 콤보는 카드 제거를 반영해
// (i 콤보, j 콤보) 합법 쌍에서 균등하게 뽑는다(기각 표본). 쌍마다 seed = 쌍 번호 → 재현 가능.
// 실행: node equity169.mjs [iterations] [outfile]   (worker_threads 로 CPU-1 개 병렬)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import os from 'node:os';

const R = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
// HAND_ORDER 와 동일: hi 12..0, lo hi..0, 페어 → 수딧 → 오프수트
export const HAND_ORDER = (() => {
  const out = [];
  for (let hi = 12; hi >= 0; hi--) for (let lo = hi; lo >= 0; lo--) {
    if (hi === lo) out.push(R[hi] + R[lo]);
    else { out.push(R[hi] + R[lo] + 's'); out.push(R[hi] + R[lo] + 'o'); }
  }
  return out;
})();

// 카드 = rank(0..12) * 4 + suit(0..3)
const rankOf = (ch) => R.indexOf(ch);
function combosOf(name) {
  const a = rankOf(name[0]); const b = rankOf(name[1]);
  const out = [];
  if (a === b) { for (let s = 0; s < 4; s++) for (let t = s + 1; t < 4; t++) out.push([a * 4 + s, a * 4 + t]); }
  else if (name[2] === 's') { for (let s = 0; s < 4; s++) out.push([a * 4 + s, b * 4 + s]); }
  else { for (let s = 0; s < 4; s++) for (let t = 0; t < 4; t++) if (s !== t) out.push([a * 4 + s, b * 4 + t]); }
  return out;
}

// 5장 점수(equityEngine.score5 와 같은 규칙) — 카드는 rank 2..14 · suit 로 환산
function score5(cs) {
  const ranks = cs.map((c) => (c >> 2) + 2).sort((x, y) => y - x);
  const suit0 = cs[0] & 3;
  const flush = cs.every((c) => (c & 3) === suit0);
  let straight = false; let sHigh = 0;
  const distinct = new Set(ranks);
  if (distinct.size === 5) {
    if (ranks[0] - ranks[4] === 4) { straight = true; sHigh = ranks[0]; }
    else if (ranks[0] === 14 && ranks[1] === 5 && ranks[4] === 2) { straight = true; sHigh = 5; }
  }
  const freq = new Map();
  for (const r of ranks) freq.set(r, (freq.get(r) ?? 0) + 1);
  const groups = [...freq.entries()].sort((x, y) => (y[1] - x[1]) || (y[0] - x[0]));
  const counts = groups.map((g) => g[1]); const groupRanks = groups.map((g) => g[0]);
  let cat;
  if (straight && flush) cat = 8; else if (counts[0] === 4) cat = 7; else if (counts[0] === 3 && counts[1] === 2) cat = 6;
  else if (flush) cat = 5; else if (straight) cat = 4; else if (counts[0] === 3) cat = 3;
  else if (counts[0] === 2 && counts[1] === 2) cat = 2; else if (counts[0] === 2) cat = 1; else cat = 0;
  let tb;
  if (cat === 8 || cat === 4) tb = [sHigh]; else if (cat === 5 || cat === 0) tb = ranks; else tb = groupRanks;
  const tb5 = tb.slice(0, 5); while (tb5.length < 5) tb5.push(0);
  let v = cat; for (let i = 0; i < 5; i++) v = v * 15 + tb5[i];
  return v;
}
const COMBOS5 = (() => { const res = []; for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) for (let c = b + 1; c < 7; c++) for (let d = c + 1; d < 7; d++) for (let e = d + 1; e < 7; e++) res.push([a, b, c, d, e]); return res; })();
function best7(seven) {
  let best = -1;
  for (const idx of COMBOS5) {
    const s = score5([seven[idx[0]], seven[idx[1]], seven[idx[2]], seven[idx[3]], seven[idx[4]]]);
    if (s > best) best = s;
  }
  return best;
}
function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0x1_0000_0000; };
}

/** i 가 j 를 상대로 (승 + 무/2) 확률. 같은 캐노니컬(AA vs AA)도 합법 콤보 쌍이 있으면 계산한다. */
function pairEquity(i, j, iters, seed) {
  const A = combosOf(HAND_ORDER[i]); const B = combosOf(HAND_ORDER[j]);
  const rnd = rng(seed);
  const deck = new Array(52); for (let c = 0; c < 52; c++) deck[c] = c;
  let win = 0; let tie = 0; let n = 0;
  for (let it = 0; it < iters; it++) {
    // 합법 (a,b) 쌍을 균등하게 — 기각 표본
    let a; let b; let guard = 0;
    do { a = A[Math.floor(rnd() * A.length)]; b = B[Math.floor(rnd() * B.length)]; guard++; }
    while ((a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1]) && guard < 100);
    if (guard >= 100) return NaN;   // 합법 쌍 없음(예: AsAh vs … 는 항상 있음. 방어)
    // 보드 5장: 덱에서 4장 제외 후 부분 셔플
    let m = 0;
    for (let c = 0; c < 52; c++) if (c !== a[0] && c !== a[1] && c !== b[0] && c !== b[1]) deck[m++] = c;
    for (let k = 0; k < 5; k++) { const x = k + Math.floor(rnd() * (m - k)); const t = deck[k]; deck[k] = deck[x]; deck[x] = t; }
    const board = [deck[0], deck[1], deck[2], deck[3], deck[4]];
    const sa = best7([a[0], a[1], ...board]); const sb = best7([b[0], b[1], ...board]);
    if (sa > sb) win++; else if (sa === sb) tie++;
    n++;
  }
  return (win + tie / 2) / n;
}

if (isMainThread) {
  const iters = Number(process.argv[2] ?? 40000);
  const out = process.argv[3] ?? new URL('./equity169.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const pairs = [];
  for (let i = 0; i < 169; i++) for (let j = i; j < 169; j++) pairs.push([i, j]);
  const nWorkers = Math.max(1, os.cpus().length - 1);
  const chunk = Math.ceil(pairs.length / nWorkers);
  const M = new Float64Array(169 * 169).fill(NaN);
  let done = 0; const t0 = Date.now();
  const workers = [];
  for (let w = 0; w < nWorkers; w++) {
    const slice = pairs.slice(w * chunk, (w + 1) * chunk);
    if (!slice.length) continue;
    const wk = new Worker(new URL(import.meta.url), { workerData: { slice, iters } });
    wk.on('message', (msg) => {
      if (msg.progress !== undefined) { done += msg.progress; if (done % 500 < msg.progress) console.log(`${done}/${pairs.length} pairs · ${Math.round((Date.now() - t0) / 1000)}s`); return; }
      for (const [i, j, e] of msg.results) { M[i * 169 + j] = e; M[j * 169 + i] = 1 - e; }
    });
    wk.on('error', (e) => { console.error('worker error', e); process.exit(1); });
    workers.push(new Promise((res) => wk.on('exit', res)));
  }
  await Promise.all(workers);
  for (let i = 0; i < 169; i++) M[i * 169 + i] = 0.5;   // 같은 핸드끼리는 대칭 → 정확히 0.5 (계산값은 표본 잡음)
  writeFileSync(out, JSON.stringify({ iterations: iters, order: HAND_ORDER, matrix: Array.from(M) }));
  console.log(`done ${pairs.length} pairs in ${Math.round((Date.now() - t0) / 1000)}s → ${out}`);
} else {
  const { slice, iters } = workerData;
  const results = [];
  let since = 0;
  for (const [i, j] of slice) {
    results.push([i, j, pairEquity(i, j, iters, i * 169 + j + 1)]);
    since++;
    if (since >= 50) { parentPort.postMessage({ progress: since }); since = 0; }
  }
  if (since) parentPort.postMessage({ progress: since });
  parentPort.postMessage({ results });
}
