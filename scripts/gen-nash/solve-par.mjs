// 전 조합(앤티 2 × k 8 × 스택 12 = 192 표)을 worker_threads 로 나눠 푼다. 출력 형식은 solve.mjs 메인과 같다.
// 실행: node solve-par.mjs <equity.json> <out.json> [iters=8000] [scope=all|ante|no] [stacks=7,8,9,10,12,15,20]
//   stacks 를 주면 그 깊이만 푼다(수렴 확인용으로 게시 범위만 더 많은 반복수로 다시 돌릴 때).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import { init, solve, encode, STACKS, KS } from './solve.mjs';

if (isMainThread) {
  const [, , eqFile, outFile, itersArg = '8000', scope = 'all', stacksArg] = process.argv;
  const iters = Number(itersArg);
  const antes = scope === 'ante' ? [true] : scope === 'no' ? [false] : [false, true];
  const stacks = stacksArg ? STACKS.filter((s) => stacksArg.split(',').map(Number).includes(s)) : STACKS;
  const jobs = [];
  for (const ante of antes) for (const k of KS) for (const S of stacks) jobs.push({ ante, k, S });
  // k 가 클수록 오래 걸린다 — 큰 것부터 라운드로빈으로 나눠 균형을 맞춘다
  jobs.sort((a, b) => b.k - a.k);
  const nWorkers = Math.max(1, Math.min(os.cpus().length - 1, jobs.length));
  const buckets = Array.from({ length: nWorkers }, () => []);
  jobs.forEach((j, i) => buckets[i % nWorkers].push(j));
  const meta = init(eqFile);
  const tables = { shove: { no: {}, ante: {} }, callBB: { no: {}, ante: {} }, callSB: { no: {}, ante: {} } };
  const raw = {};
  let done = 0; const t0 = Date.now();
  await Promise.all(buckets.map((bucket) => new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { eqFile, iters, bucket } });
    w.on('message', ({ ante, k, S, shove, callBB, callSB }) => {
      const key = ante ? 'ante' : 'no';
      (tables.shove[key][k] ??= {})[S] = encode(shove);
      (tables.callBB[key][k] ??= {})[S] = encode(callBB);
      if (callSB) (tables.callSB[key][k] ??= {})[S] = encode(callSB);
      raw[`shove|${key}|${k}|${S}`] = shove; raw[`callBB|${key}|${k}|${S}`] = callBB; if (callSB) raw[`callSB|${key}|${k}|${S}`] = callSB;
      done += 1;
      if (done % 24 === 0) console.log(`${done}/${jobs.length} tables · ${Math.round((Date.now() - t0) / 1000)}s`);
    });
    w.on('error', rej); w.on('exit', res);
  })));
  writeFileSync(outFile, JSON.stringify({ iters, equityIterations: meta.iterations, order: meta.order, scope, tables, raw }));
  console.log(`solved ${done} tables in ${Math.round((Date.now() - t0) / 1000)}s (FP ${iters} iters) → ${outFile}`);
} else {
  init(workerData.eqFile);
  for (const { ante, k, S } of workerData.bucket) {
    const r = solve(k, S, ante, workerData.iters);
    parentPort.postMessage({ ante, k, S, shove: Array.from(r.shove), callBB: Array.from(r.callBB), callSB: r.callSB ? Array.from(r.callSB) : null });
  }
}
