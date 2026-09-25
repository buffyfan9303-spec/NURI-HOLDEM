// 169×169 프리플랍 에퀴티 — **정확 전수**(몬테카를로 아님). 2026-09-25 gto-team.
// E[i][j] = 캐노니컬 i 가 j 를 이길 확률(무승부 절반), 합법 (i 콤보, j 콤보) 쌍 균등 평균 = 헤즈업 카드 제거를 그대로 반영.
// i 의 콤보는 무늬 치환으로 모두 동치라 대표 콤보 하나로 고정하고, j 의 합법 콤보 전부 × 보드 C(48,5) 를 센다.
// equity169.mjs 와 같은 JSON 형식이라 solve*.mjs 에 그대로 넣을 수 있다(iterations: 'exact').
// 실행: node scripts/gen-nash/equity169-exact.mjs <out.json>     (12코어 ≈ 4분)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import { exactPair, combosOf, HAND_ORDER } from './exactpair.mjs';

function pairEquity(i, j) {
  const [a0, a1] = combosOf(HAND_ORDER[i])[0];
  let w = 0; let t = 0; let n = 0;
  for (const [b0, b1] of combosOf(HAND_ORDER[j])) {
    if (b0 === a0 || b0 === a1 || b1 === a0 || b1 === a1) continue;
    const r = exactPair(a0, a1, b0, b1); w += r[0]; t += r[1]; n += r[2];
  }
  return (w + t / 2) / n;
}

if (isMainThread) {
  const out = process.argv[2];
  if (!out) { console.error('usage: node equity169-exact.mjs <out.json>'); process.exit(2); }
  const pairs = []; for (let i = 0; i < 169; i++) for (let j = i; j < 169; j++) pairs.push([i, j]);
  const nW = Math.max(1, os.cpus().length - 1);
  const M = new Float64Array(169 * 169).fill(NaN);
  let next = 0; let done = 0; const t0 = Date.now();
  await Promise.all(Array.from({ length: nW }, () => new Promise((res, rej) => {
    const wk = new Worker(new URL(import.meta.url));
    const feed = () => { if (next >= pairs.length) { wk.postMessage(null); return; } const batch = pairs.slice(next, next + 40); next += 40; wk.postMessage(batch); };
    wk.on('message', (rs) => {
      for (const [i, j, e] of rs) { M[i * 169 + j] = e; M[j * 169 + i] = 1 - e; }
      done += rs.length; if (done % 2000 < rs.length) console.log(`${done}/${pairs.length} · ${Math.round((Date.now() - t0) / 1000)}s`);
      feed();
    });
    wk.on('error', rej); wk.on('exit', res); feed();
  })));
  let maxDiag = 0; for (let i = 0; i < 169; i++) maxDiag = Math.max(maxDiag, Math.abs(M[i * 169 + i] - 0.5));
  console.log(`diag max |E(i,i)-0.5| = ${maxDiag}`);   // 대칭 검산 — 0 이어야 한다
  writeFileSync(out, JSON.stringify({ iterations: 'exact', order: HAND_ORDER, matrix: Array.from(M) }));
  console.log(`done ${pairs.length} pairs in ${Math.round((Date.now() - t0) / 1000)}s → ${out}`);
} else {
  parentPort.on('message', (batch) => {
    if (batch === null) { process.exit(0); }
    parentPort.postMessage(batch.map(([i, j]) => [i, j, pairEquity(i, j)]));
  });
}
