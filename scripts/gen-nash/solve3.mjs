// k=2(BTN 첫 진입 올인 · 뒤에 SB·BB 뿐) **근사 없는** 3인 푸시/폴드 균형 + 게시 표 착취가능도. 2026-09-25 gto-team.
// 입력: tri-equity.mjs 의 진짜 3인 삼중 표(W · 3인 몫 · 조건부 헤즈업). 단일 콜러 절단도 곱 정규화도 없다.
// 게임(solve.mjs/solve-multi.mjs 와 같은 돈 규칙 — S = 앤티 낸 뒤 남은 스택, BB 앤티 A 는 데드, 낸 돈은 매몰):
//   히어로(BTN) h: 올인 S 또는 폴드(0).  SB x: 콜(S−0.5 추가) / 폴드.  BB y: SB 가 접었을 때 b1, SB 가 콜했을 때 b2(오버콜).
//   ① 전원 폴드  히어로 +1.5+A
//   ② BB 만 콜   팟 2S+0.5+A  · 히어로 Ehy·팟−S · BB (1−Ehy)·팟−(S−1)
//   ③ SB 만 콜   팟 2S+1+A    · 히어로 Ehx·팟−S · SB (1−Ehx)·팟−(S−0.5)
//   ④ 둘 다 콜   팟 3S+A      · 각자 3인 몫·팟 − 추가 투입
// 풀이: 동시 갱신 CFR+(선형 평균). 3인 게임이라 수렴 보장은 없으므로 **각 선수의 최선응답 이득(ε)** 을 재서 보고한다 —
//   ε 가 0 에 가까우면 그 전략쌍은 ε-Nash 다. 같은 방식으로 게시 표(k=2 shove·callSB·callBB)의 이득도 잰다.
// 실행(저장소 루트, 2026-09-25 게시 값 재현):
//   node scripts/gen-nash/tri-equity.mjs /tmp/tri8k.bin 8000                                # ≈9분(12코어) · 116MB
//   node scripts/gen-nash/solve3.mjs /tmp/tri8k.bin src/lib/nash.data.ts /tmp/s3.json 4000   # 24표 ≈14분 · 표마다 ε·게시표 손실 출력
//   node scripts/gen-nash/emit.mjs /tmp/s3.json src/lib/nash.data.ts ante 2,3,4,5,6,7,8,9,10,12,15,20 2   # 빅앤티 k=2 만 교체
//   node scripts/gen-nash/emit.mjs /tmp/s3.json src/lib/nash.data.ts all 2,3,4 2    # 노앤티 k=2 2~4bb (오너 결정 2026-09-25 — k≥3 은 NASH_NOANTE_QUARANTINE 격리)
//   ⚠ 노앤티 k=2 5bb+ 는 emit 하지 않는다 — 옛 표 손실 ≤0.004bb 이고 k≥3 이 살아 있는 깊이라 k 단조성 계약과 함께 봐야 한다(README '2026-09-25').
//   잡음 확인: tri-equity.mjs 셋째 인자(salt)를 바꿔 다시 만들고 풀면 셀 9126 중 8 개만 다르다(집계 ≤0.6%p).
// 인자: <tri.bin> <nash.data.ts> <out.json> [iters=3000] [stacks=2,...,20] [ante=both|ante|no]
import { readFileSync, writeFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';

const n = 169; const F = 6;
const R = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const ORDER = (() => { const o = []; for (let hi = 12; hi >= 0; hi--) for (let lo = hi; lo >= 0; lo--) { if (hi === lo) o.push(R[hi] + R[lo]); else { o.push(R[hi] + R[lo] + 's'); o.push(R[hi] + R[lo] + 'o'); } } return o; })();
const CNT = Float64Array.from(ORDER, (h) => (h.length === 2 ? 6 : h[2] === 's' ? 4 : 12));

function makeGame(D, S, A) {
  const P2y = 2 * S + 0.5 + A; const P2x = 2 * S + 1 + A; const P3 = 3 * S + A; const FOLD = 1.5 + A;
  // 전체 합법 딜 수로 정규화 → 모든 이득이 'BTN 까지 폴드된 판 1회당 bb'
  let TOT = 0; for (let h = 0; h < n; h++) for (let i = h * n * n; i < (h + 1) * n * n; i++) TOT += CNT[h] * D[i * F];
  /** 한 번 쓸어 네 정보집합의 (행동 − 폴드) 반사실 가치를 모은다. 반환값은 판당 bb 로 정규화. */
  function sweep(p, s, b1, b2, out) {
    const eH = out.eH.fill(0); const eS = out.eS.fill(0); const e1 = out.e1.fill(0); const e2 = out.e2.fill(0);
    for (let h = 0; h < n; h++) {
      const ch = CNT[h]; const ph = p[h]; let acc = 0;
      for (let x = 0; x < n; x++) {
        const sx = s[x]; let accS = 0; const base = (h * n + x) * n;
        for (let y = 0; y < n; y++) {
          const o = (base + y) * F; const W = D[o]; if (!W) continue;
          const s3h = D[o + 1], s3x = D[o + 2], s3y = D[o + 3], ehx = D[o + 4], ehy = D[o + 5];
          const q1 = b1[y], q2 = b2[y];
          const uBBonly = ehy * P2y - S; const uSBonly = ehx * P2x - S; const u3 = s3h * P3 - S;
          acc += W * ((1 - sx) * ((1 - q1) * FOLD + q1 * uBBonly) + sx * ((1 - q2) * uSBonly + q2 * u3));
          const T = ch * W * ph;                          // 히어로가 올인한 딜의 가중
          if (!T) continue;
          accS += T * ((1 - q2) * ((1 - ehx) * P2x - (S - 0.5)) + q2 * (s3x * P3 - (S - 0.5)));
          e1[y] += T * (1 - sx) * ((1 - ehy) * P2y - (S - 1));
          e2[y] += T * sx * (s3y * P3 - (S - 1));
        }
        eS[x] += accS;
      }
      eH[h] = acc * ch;
    }
    for (let i = 0; i < n; i++) { eH[i] /= TOT; eS[i] /= TOT; e1[i] /= TOT; e2[i] /= TOT; }
  }
  const buf = () => ({ eH: new Float64Array(n), eS: new Float64Array(n), e1: new Float64Array(n), e2: new Float64Array(n) });
  /** 각 선수 최선응답 이득(판당 bb) — 정보집합마다 max(0,u) − σ·u 의 합 */
  function gains(p, s, b1, b2) {
    const B = buf(); sweep(p, s, b1, b2, B);
    const g = (e, st) => { let t = 0; for (let i = 0; i < n; i++) t += Math.max(0, e[i]) - st[i] * e[i]; return t; };
    return { hero: g(B.eH, p), sb: g(B.eS, s), bb1: g(B.e1, b1), bb2: g(B.e2, b2), ev: B };
  }
  function solve(iters) {
    const st = [0, 1, 2, 3].map(() => new Float64Array(n).fill(0.5));
    const rA = [0, 1, 2, 3].map(() => new Float64Array(n)); const rF = [0, 1, 2, 3].map(() => new Float64Array(n));
    const avg = [0, 1, 2, 3].map(() => new Float64Array(n)); let wsum = 0; const B = buf();
    for (let t = 1; t <= iters; t++) {
      sweep(st[0], st[1], st[2], st[3], B);
      const E = [B.eH, B.eS, B.e1, B.e2];
      for (let j = 0; j < 4; j++) for (let i = 0; i < n; i++) {
        const u = E[j][i]; const v = st[j][i] * u;
        rA[j][i] = Math.max(0, rA[j][i] + u - v); rF[j][i] = Math.max(0, rF[j][i] - v);
        const tot = rA[j][i] + rF[j][i]; st[j][i] = tot > 0 ? rA[j][i] / tot : 0.5;
      }
      wsum += t; for (let j = 0; j < 4; j++) for (let i = 0; i < n; i++) avg[j][i] += t * st[j][i];
    }
    for (let j = 0; j < 4; j++) for (let i = 0; i < n; i++) avg[j][i] /= wsum;
    return avg;
  }
  return { solve, gains };
}
const pct = (f) => { let t = 0; for (let i = 0; i < n; i++) t += f[i] * CNT[i]; return (t / 1326) * 100; };

if (isMainThread) {
  const [, , triFile, dataFile, outFile, itArg = '3000', stArg = '2,3,4,5,6,7,8,9,10,12,15,20', anteArg = 'both'] = process.argv;
  const buf = readFileSync(triFile); const sab = new SharedArrayBuffer(buf.length); new Uint8Array(sab).set(buf);
  const text = readFileSync(dataFile, 'utf-8');
  const lit = (name) => JSON.parse(text.match(new RegExp(`const ${name}: [^=]+= (\\{[^\\r\\n]*\\});`))[1]);
  const pub = { shove: lit('SHOVE'), callSB: lit('CALL_SB'), callBB: lit('CALL_BB') };
  const jobs = []; for (const a of anteArg === 'both' ? ['no', 'ante'] : [anteArg]) for (const S of stArg.split(',').map(Number)) jobs.push({ a, S });
  const res = {}; let next = 0; const t0 = Date.now();
  const nW = Math.max(1, Math.min(os.cpus().length - 1, jobs.length));
  await Promise.all(Array.from({ length: nW }, () => new Promise((ok, rej) => {
    const wk = new Worker(new URL(import.meta.url), { workerData: { sab, iters: Number(itArg), pub } });
    const feed = () => { if (next >= jobs.length) { wk.postMessage(null); return; } wk.postMessage(jobs[next++]); };
    wk.on('message', (r) => { res[`${r.a}|${r.S}`] = r; console.log(r.line); feed(); });
    wk.on('error', rej); wk.on('exit', ok); feed();
  })));
  // emit.mjs 가 그대로 먹는 모양(k=2 열만) — callBB 는 'SB 가 접은 뒤 BB 콜'(b1). 오버콜 b2 는 게시 표에 자리가 없다.
  const q8 = (f) => Math.max(0, Math.min(8, Math.round(f * 8))); const enc = (a) => a.map((f) => String(q8(f))).join('');
  const tables = { shove: { no: {}, ante: {} }, callBB: { no: {}, ante: {} }, callSB: { no: {}, ante: {} } };
  for (const r of Object.values(res)) { (tables.shove[r.a]['2'] ??= {})[r.S] = enc(r.p); (tables.callSB[r.a]['2'] ??= {})[r.S] = enc(r.s); (tables.callBB[r.a]['2'] ??= {})[r.S] = enc(r.b1); }
  writeFileSync(outFile, JSON.stringify({ order: ORDER, iters: Number(itArg), tables, res }));
  console.log(`done ${jobs.length} in ${Math.round((Date.now() - t0) / 1000)}s → ${outFile}`);
} else {
  const D = new Float32Array(workerData.sab); const { iters, pub } = workerData;
  const dec = (s) => (s ? Float64Array.from(s, (c) => Number(c) / 8) : null);
  parentPort.on('message', (job) => {
    if (job === null) process.exit(0);
    const { a, S } = job; const A = a === 'ante' ? 1 : 0;
    const G = makeGame(D, S, A);
    const [p, s, b1, b2] = G.solve(iters);
    const ge = G.gains(p, s, b1, b2);
    const pp = dec(pub.shove[a]?.['2']?.[String(S)]); const ps = dec(pub.callSB[a]?.['2']?.[String(S)]); const pb = dec(pub.callBB[a]?.['2']?.[String(S)]);
    let gp = null; let heroRegret = null; let sbRegret = null; let bbRegret = null;
    if (pp && ps && pb) {
      // 게시 표 전략쌍(오버콜 b2 는 게시되지 않아 균형 값을 쓴다)의 선수별 최선응답 이득
      const g = G.gains(pp, ps, pb, b2); gp = { hero: g.hero, sb: g.sb, bb1: g.bb1, bb2: g.bb2 };
      // 게시 표 한 장씩 — 나머지는 균형일 때 그 표를 쓰는 손실(판당 bb)
      const loss = (e, st) => { let t = 0; for (let i = 0; i < n; i++) t += Math.max(0, e[i]) - st[i] * e[i]; return t; };
      heroRegret = loss(ge.ev.eH, pp); sbRegret = loss(ge.ev.eS, ps); bbRegret = loss(ge.ev.e1, pb);
    }
    const eqEps = ge.hero + ge.sb + ge.bb1 + ge.bb2;
    const f = (v) => (v === null ? '  —   ' : v.toFixed(5));
    const line = `${a.padEnd(4)} ${String(S).padStart(2)}bb  균형 셔브 ${pct(p).toFixed(1)} SB콜 ${pct(s).toFixed(1)} BB콜 ${pct(b1).toFixed(1)} 오버콜 ${pct(b2).toFixed(1)} · ε ${eqEps.toExponential(1)}`
      + (pp ? ` | 게시 ${pct(pp).toFixed(1)}/${pct(ps).toFixed(1)}/${pct(pb).toFixed(1)} · 손실 셔브 ${f(heroRegret)} SB ${f(sbRegret)} BB ${f(bbRegret)}` : ' | 게시 없음');
    parentPort.postMessage({ a, S, line, p: Array.from(p), s: Array.from(s), b1: Array.from(b1), b2: Array.from(b2),
      eqGain: { hero: ge.hero, sb: ge.sb, bb1: ge.bb1, bb2: ge.bb2 }, pubGain: gp, regret: { hero: heroRegret, sb: sbRegret, bb: bbRegret },
      evHero: Array.from(ge.ev.eH), evSB: Array.from(ge.ev.eS), evBB1: Array.from(ge.ev.e1), evBB2: Array.from(ge.ev.e2) });
  });
}
