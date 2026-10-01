// solve-deal.mjs 산출 여러 개(서로 다른 salt)의 전략을 평균해 하나의 solved.json 으로 만든다. 2026-10-02 gto-team (감사 N7).
// 왜: 딜 표본 하나의 균형은 표본 잡음으로 무차별 손이 0↔1 로 뒤집힌다(실측: 빅앤티 k5 3bb BB 콜 83o·62o 가 seed 0 에서만 폴드 —
//   표본 밖 이득은 +3e-5 로 무차별). 두 표본의 평균 전략은 표본을 두 배로 쓴 것과 같은 방향으로 잡음을 줄인다. 평균 뒤에도 cv.mjs 로 다시 잰다.
// 실행: node scripts/gen-nash/merge-seeds.mjs <out.json> <s0.json> <s1.json> [...]
import { readFileSync, writeFileSync } from 'node:fs';
const [, , outF, ...ins] = process.argv;
if (ins.length < 2) throw new Error('입력 solved.json 이 둘 이상 필요하다');
const all = ins.map((f) => JSON.parse(readFileSync(f, 'utf-8')));
const base = all[0];
for (const s of all) if (s.info !== base.info || s.cmax !== base.cmax) throw new Error('INFO·CMAX 가 다른 산출은 섞지 않는다');
const q8 = (f) => Math.max(0, Math.min(8, Math.round(f * 8))); const enc = (a) => a.map((f) => String(q8(f))).join('');
const tables = { shove: { no: {}, ante: {} }, callBB: { no: {}, ante: {} }, callSB: { no: {}, ante: {} } };
const res = {};
for (const key of Object.keys(base.res)) {
  const rs = all.map((s) => s.res[key]); if (rs.some((r) => !r?.strat)) throw new Error(`${key} 가 모든 입력에 있지 않다`);
  const strat = rs[0].strat.map((arr, j) => arr.map((_, i) => rs.reduce((t, r) => t + r.strat[j][i], 0) / rs.length));
  const { a, k, S } = rs[0]; const n = 169;
  const r = { a, k, S, strat, shove: strat[0], callBB: strat[k].slice(0, n), callSB: k >= 2 ? strat[k - 1].slice(0, n) : null, seeds: all.map((s) => s.salt) };
  res[key] = r;
  (tables.shove[a][k] ??= {})[S] = enc(r.shove);
  (tables.callBB[a][k] ??= {})[S] = enc(r.callBB);
  if (k >= 2) (tables.callSB[a][k] ??= {})[S] = enc(r.callSB);
}
writeFileSync(outF, JSON.stringify({ order: base.order, M: base.M, iters: base.iters, salt: all.map((s) => s.salt).join('+'), info: base.info, cmax: base.cmax, tables, res }));
console.log(`merged ${ins.length} → ${outF} (${Object.keys(res).length} 표)`);
