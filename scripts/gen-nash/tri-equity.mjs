// 3인(히어로 h · SB x · BB y) 캐노니컬 삼중 에퀴티 — **진짜 3인 쇼다운**을 몬테카를로로 센다. 2026-09-25 gto-team.
// solve-multi.mjs 의 '곱 정규화 근사'(손별 ±10%p 편향)를 대신할 독립 입력. k=2(BTN 올인, 뒤에 SB·BB 둘뿐)는
// 콜러 절단이 없으므로 이 표 + 3인 균형 풀이가 **근사 없는 게임**이 된다(남는 것은 표본 잡음뿐).
// 삼중 (h,x,y) 마다(h 는 대표 콤보 고정 — 무늬 치환으로 동치, x·y 는 합법 콤보 쌍 균등):
//   W  = h 대표 콤보 옆 합법 (x콤보, y콤보) 쌍 수(정확 계수)
//   S3h·S3x·S3y = 3인 쇼다운 몫(무승부 균등 분할) · Ehx = h 대 x 헤즈업(y 카드는 죽은 카드) · Ehy = h 대 y 헤즈업(x 죽음)
// 표본: 삼중마다 M 회, seed = 삼중 번호 → 재현 가능. 출력은 Float32 원시 배열(169³ × 6) + 머리 JSON.
// 실행: node scripts/gen-nash/tri-equity.mjs <out.bin> [M=1000] [salt=0]   (salt 를 바꾸면 독립 표본 — 잡음 크기 확인용)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import { RANK_KEY as RK, NF, FLUSH } from './eval7.mjs';
import { combosOf, HAND_ORDER } from './exactpair.mjs';

const n = 169; const F = 6;   // W, S3h, S3x, S3y, Ehx, Ehy
const SALT = (isMainThread ? Number(process.argv[4] ?? 0) : workerData.salt) >>> 0;
const CO = HAND_ORDER.map(combosOf);
const FSUIT = new Int8Array(4096).fill(-1);
for (let p = 0; p < 4096; p++) for (let s = 0; s < 4; s++) if (((p >> (s * 3)) & 7) >= 3) FSUIT[p] = s;

function rng(seed) { let s = (seed >>> 0) || 0x9e3779b9; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const conflict = (a, b) => a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1];
const used = new Uint8Array(52);
function val(c0, c1, bk, bm, fs) {
  let v = NF[bk + RK[c0 >> 2] + RK[c1 >> 2]];
  if (fs >= 0) { let m = bm[fs]; if ((c0 & 3) === fs) m |= 1 << (c0 >> 2); if ((c1 & 3) === fs) m |= 1 << (c1 >> 2); const f = FLUSH[m]; if (f > v) v = f; }
  return v;
}
const bm = new Int32Array(4);
/** 삼중 하나 — [W, S3h, S3x, S3y, Ehx, Ehy] */
function triple(h, x, y, M) {
  const hc = CO[h][0];
  const X = CO[x].filter((c) => !conflict(c, hc)); const Y = CO[y].filter((c) => !conflict(c, hc));
  let W = 0; for (const a of X) for (const b of Y) if (!conflict(a, b)) W++;
  if (!W) return [0, 0, 0, 0, 0, 0];
  const rnd = rng(((h * n + x) * n + y + 1) ^ SALT);
  let s3h = 0, s3x = 0, s3y = 0, ehx = 0, ehy = 0;
  for (let t = 0; t < M; t++) {
    let xc, yc; do { xc = X[(rnd() * X.length) | 0]; yc = Y[(rnd() * Y.length) | 0]; } while (conflict(xc, yc));
    used.fill(0); used[hc[0]] = used[hc[1]] = used[xc[0]] = used[xc[1]] = used[yc[0]] = used[yc[1]] = 1;
    let bk = 0; let pk = 0; bm[0] = bm[1] = bm[2] = bm[3] = 0;
    for (let i = 0; i < 5; i++) { let c; do { c = (rnd() * 52) | 0; } while (used[c]); used[c] = 1; bk += RK[c >> 2]; pk += 1 << ((c & 3) * 3); bm[c & 3] |= 1 << (c >> 2); }
    const fs = FSUIT[pk];
    const vh = val(hc[0], hc[1], bk, bm, fs); const vx = val(xc[0], xc[1], bk, bm, fs); const vy = val(yc[0], yc[1], bk, bm, fs);
    const top = Math.max(vh, vx, vy); const k = (vh === top) + (vx === top) + (vy === top);
    if (vh === top) s3h += 1 / k; if (vx === top) s3x += 1 / k; if (vy === top) s3y += 1 / k;
    ehx += vh > vx ? 1 : vh === vx ? 0.5 : 0; ehy += vh > vy ? 1 : vh === vy ? 0.5 : 0;
  }
  return [W, s3h / M, s3x / M, s3y / M, ehx / M, ehy / M];
}

if (isMainThread) {
  const out = process.argv[2]; const M = Number(process.argv[3] ?? 1000);
  if (!out) { console.error('usage: node tri-equity.mjs <out.bin> [M]'); process.exit(2); }
  const sab = new SharedArrayBuffer(n * n * n * F * 4); const D = new Float32Array(sab);
  const nW = Math.max(1, os.cpus().length - 1); let next = 0; let done = 0; const t0 = Date.now();
  await Promise.all(Array.from({ length: nW }, () => new Promise((res, rej) => {
    const wk = new Worker(new URL(import.meta.url), { workerData: { sab, M, salt: SALT } });
    const feed = () => { if (next >= n) { wk.postMessage(null); return; } wk.postMessage(next++); };
    wk.on('message', () => { done++; if (done % 13 === 0) console.log(`${done}/${n} heroes · ${Math.round((Date.now() - t0) / 1000)}s`); feed(); });
    wk.on('error', rej); wk.on('exit', res); feed();
  })));
  writeFileSync(out, Buffer.from(sab));
  writeFileSync(out + '.json', JSON.stringify({ order: HAND_ORDER, M, salt: SALT, fields: ['W', 'S3h', 'S3x', 'S3y', 'Ehx', 'Ehy'], layout: '(h*169+x)*169+y, Float32 ×6' }));
  console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s → ${out}`);
} else {
  const D = new Float32Array(workerData.sab); const M = workerData.M;
  parentPort.on('message', (h) => {
    if (h === null) process.exit(0);
    for (let x = 0; x < n; x++) for (let y = x; y < n; y++) {
      const r = triple(h, x, y, M);
      const o1 = ((h * n + x) * n + y) * F; for (let f = 0; f < F; f++) D[o1 + f] = r[f];
      // (h, y, x) 는 역할만 바뀐 같은 삼중 — x·y 몫과 Ehx·Ehy 를 맞바꾼다
      const o2 = ((h * n + y) * n + x) * F; D[o2] = r[0]; D[o2 + 1] = r[1]; D[o2 + 2] = r[3]; D[o2 + 3] = r[2]; D[o2 + 4] = r[5]; D[o2 + 5] = r[4];
    }
    parentPort.postMessage(h);
  });
}
